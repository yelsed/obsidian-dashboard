import { spawn } from "child_process";
import { writable, type Readable } from "svelte/store";

export type DockerAvailability = "available" | "not-installed" | "errored";

export type DockerContainerRuntimeStatus = "running" | "paused" | "stopped";

export type DockerContainerSummary = {
  containerId: string;
  containerName: string;
  imageReference: string;
  runtimeStatus: DockerContainerRuntimeStatus;
  upTimeLabel: string;
  exposedPortLabel: string;
  composeProjectWorkingDirectoryAbsolutePath: string | null;
  composeProjectName: string | null;
};

export type DockerSnapshot = {
  dockerAvailability: DockerAvailability;
  containers: DockerContainerSummary[];
  lastErrorMessage: string | null;
};

export type DockerStore = {
  store: Readable<DockerSnapshot>;
  startPolling: () => void;
  stopPolling: () => void;
  destroy: () => void;
};

const DOCKER_POLLING_INTERVAL_MILLISECONDS = 5_000;
const DOCKER_COMMAND_TIMEOUT_MILLISECONDS = 4_000;

export function createDockerContainersStore(): DockerStore {
  const snapshotStore = writable<DockerSnapshot>({
    dockerAvailability: "available",
    containers: [],
    lastErrorMessage: null,
  });

  let pollingIntervalHandle: ReturnType<typeof setInterval> | null = null;
  let isPollingInFlight = false;
  let hasDeterminedDockerAvailability = false;

  async function pollDockerContainers(): Promise<void> {
    if (isPollingInFlight) {
      return;
    }
    isPollingInFlight = true;
    try {
      const rawDockerOutput = await runDockerPsCommand();
      const parsedContainers = parseDockerPsOutputLines(rawDockerOutput);
      hasDeterminedDockerAvailability = true;
      snapshotStore.set({
        dockerAvailability: "available",
        containers: parsedContainers,
        lastErrorMessage: null,
      });
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : String(caughtError);
      const availabilityFromError = errorMessageIndicatesDockerMissing(errorMessage)
        ? "not-installed"
        : "errored";
      hasDeterminedDockerAvailability = true;
      snapshotStore.set({
        dockerAvailability: availabilityFromError,
        containers: [],
        lastErrorMessage: errorMessage,
      });
    } finally {
      isPollingInFlight = false;
    }
  }

  function startPolling(): void {
    if (pollingIntervalHandle !== null) {
      return;
    }
    void pollDockerContainers();
    pollingIntervalHandle = setInterval(() => {
      void pollDockerContainers();
    }, DOCKER_POLLING_INTERVAL_MILLISECONDS);
  }

  function stopPolling(): void {
    if (pollingIntervalHandle === null) {
      return;
    }
    clearInterval(pollingIntervalHandle);
    pollingIntervalHandle = null;
  }

  function destroy(): void {
    stopPolling();
  }

  void hasDeterminedDockerAvailability;

  return {
    store: snapshotStore,
    startPolling,
    stopPolling,
    destroy,
  };
}

function runDockerPsCommand(): Promise<string> {
  return new Promise((resolve, reject) => {
    let spawnedDockerProcess;
    try {
      spawnedDockerProcess = spawn(
        "docker",
        ["ps", "--all", "--no-trunc", "--format", "{{json .}}"],
        { windowsHide: true },
      );
    } catch (spawnError) {
      reject(spawnError instanceof Error ? spawnError : new Error(String(spawnError)));
      return;
    }

    const collectedStandardOutputChunks: string[] = [];
    const collectedStandardErrorChunks: string[] = [];
    let hasResolvedOrRejected = false;

    const timeoutHandle = setTimeout(() => {
      if (hasResolvedOrRejected) {
        return;
      }
      hasResolvedOrRejected = true;
      spawnedDockerProcess.kill();
      reject(new Error("docker ps timed out"));
    }, DOCKER_COMMAND_TIMEOUT_MILLISECONDS);

    spawnedDockerProcess.stdout.on("data", (chunk: Buffer | string) => {
      collectedStandardOutputChunks.push(chunk.toString());
    });

    spawnedDockerProcess.stderr.on("data", (chunk: Buffer | string) => {
      collectedStandardErrorChunks.push(chunk.toString());
    });

    spawnedDockerProcess.on("error", (spawnError) => {
      if (hasResolvedOrRejected) {
        return;
      }
      hasResolvedOrRejected = true;
      clearTimeout(timeoutHandle);
      reject(spawnError);
    });

    spawnedDockerProcess.on("close", (exitCode) => {
      if (hasResolvedOrRejected) {
        return;
      }
      hasResolvedOrRejected = true;
      clearTimeout(timeoutHandle);
      if (exitCode === 0) {
        resolve(collectedStandardOutputChunks.join(""));
      } else {
        reject(new Error(collectedStandardErrorChunks.join("").trim() || `docker ps exited with code ${exitCode}`));
      }
    });
  });
}

function parseDockerPsOutputLines(rawDockerOutput: string): DockerContainerSummary[] {
  const trimmedLines = rawDockerOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsedContainers: DockerContainerSummary[] = [];
  for (const oneLine of trimmedLines) {
    const parsedJsonLine = tryParseJsonLine(oneLine);
    if (parsedJsonLine === null) {
      continue;
    }
    parsedContainers.push(mapDockerPsJsonLineToContainerSummary(parsedJsonLine));
  }
  return parsedContainers;
}

function tryParseJsonLine(oneLine: string): Record<string, unknown> | null {
  try {
    const parsedValue = JSON.parse(oneLine);
    if (parsedValue !== null && typeof parsedValue === "object") {
      return parsedValue as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function mapDockerPsJsonLineToContainerSummary(
  jsonLine: Record<string, unknown>,
): DockerContainerSummary {
  const containerId = typeof jsonLine.ID === "string" ? jsonLine.ID : "";
  const containerName = typeof jsonLine.Names === "string" ? jsonLine.Names : "";
  const imageReference = typeof jsonLine.Image === "string" ? jsonLine.Image : "";
  const statusString = typeof jsonLine.Status === "string" ? jsonLine.Status : "";
  const stateString = typeof jsonLine.State === "string" ? jsonLine.State : "";
  const portsString = typeof jsonLine.Ports === "string" ? jsonLine.Ports : "";
  const labelsString = typeof jsonLine.Labels === "string" ? jsonLine.Labels : "";

  const parsedLabels = parseDockerLabelString(labelsString);

  return {
    containerId,
    containerName,
    imageReference,
    runtimeStatus: determineRuntimeStatusFromDockerStrings(stateString, statusString),
    upTimeLabel: formatDockerUptimeLabel(statusString),
    exposedPortLabel: formatDockerPortLabel(portsString),
    composeProjectWorkingDirectoryAbsolutePath:
      parsedLabels.get("com.docker.compose.project.working_dir") ?? null,
    composeProjectName: parsedLabels.get("com.docker.compose.project") ?? null,
  };
}

function determineRuntimeStatusFromDockerStrings(
  stateString: string,
  statusString: string,
): DockerContainerRuntimeStatus {
  const normalisedState = stateString.toLowerCase();
  if (normalisedState === "running") {
    return "running";
  }
  if (normalisedState === "paused") {
    return "paused";
  }
  if (statusString.toLowerCase().startsWith("up ")) {
    return "running";
  }
  return "stopped";
}

function formatDockerUptimeLabel(statusString: string): string {
  if (statusString.length === 0) {
    return "";
  }
  return statusString.toLowerCase();
}

function formatDockerPortLabel(portsString: string): string {
  if (portsString.length === 0) {
    return "";
  }
  const firstPortMappingMatch = portsString.match(/:(\d+)->/);
  if (firstPortMappingMatch !== null) {
    return `:${firstPortMappingMatch[1]}`;
  }
  return portsString.split(",")[0]?.trim() ?? "";
}

function parseDockerLabelString(labelsString: string): Map<string, string> {
  const labelMap = new Map<string, string>();
  if (labelsString.length === 0) {
    return labelMap;
  }
  for (const oneLabelEntry of labelsString.split(",")) {
    const equalsSignIndex = oneLabelEntry.indexOf("=");
    if (equalsSignIndex < 0) {
      continue;
    }
    const labelKey = oneLabelEntry.slice(0, equalsSignIndex).trim();
    const labelValue = oneLabelEntry.slice(equalsSignIndex + 1).trim();
    if (labelKey.length === 0) {
      continue;
    }
    labelMap.set(labelKey, labelValue);
  }
  return labelMap;
}

function errorMessageIndicatesDockerMissing(errorMessage: string): boolean {
  const lowercaseMessage = errorMessage.toLowerCase();
  return (
    lowercaseMessage.includes("enoent") ||
    lowercaseMessage.includes("not found") ||
    lowercaseMessage.includes("command not found")
  );
}
