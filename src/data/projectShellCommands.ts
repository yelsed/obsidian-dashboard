import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { writable, type Readable } from "svelte/store";

export type ShellCommandRunStatus =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "killed";

export type ShellCommandRunSnapshot = {
  runKey: string;
  status: ShellCommandRunStatus;
  exitCode: number | null;
  startedAtMilliseconds: number | null;
  finishedAtMilliseconds: number | null;
  outputTailLines: string[];
  lastErrorMessage: string | null;
};

export type ShellCommandRunsByKey = Record<string, ShellCommandRunSnapshot>;

export type ProjectShellCommandsStore = {
  store: Readable<ShellCommandRunsByKey>;
  startCommandRun: (parameters: StartCommandRunParameters) => void;
  killCommandRun: (runKey: string) => void;
  clearCommandRunOutput: (runKey: string) => void;
  destroy: () => void;
};

export type StartCommandRunParameters = {
  runKey: string;
  workingDirectoryAbsolutePath: string;
  commandLine: string;
};

const OUTPUT_TAIL_MAX_LINE_COUNT = 80;

export function createProjectShellCommandsStore(): ProjectShellCommandsStore {
  const runsByKeyStore = writable<ShellCommandRunsByKey>({});
  const inflightChildProcessByRunKey = new Map<string, ChildProcessWithoutNullStreams>();

  function updateOneRunSnapshot(
    runKey: string,
    transform: (previousSnapshot: ShellCommandRunSnapshot) => ShellCommandRunSnapshot,
  ): void {
    runsByKeyStore.update((currentRunsByKey) => {
      const previousSnapshot = currentRunsByKey[runKey] ?? createEmptyRunSnapshot(runKey);
      return { ...currentRunsByKey, [runKey]: transform(previousSnapshot) };
    });
  }

  function appendOutputLineToRun(runKey: string, rawChunkText: string): void {
    const splitLines = rawChunkText.replace(/\r/g, "").split("\n");
    updateOneRunSnapshot(runKey, (previousSnapshot) => {
      const mergedLines = [...previousSnapshot.outputTailLines];
      for (const oneLine of splitLines) {
        const isEmptyLine = oneLine.trim().length === 0;
        const previousLineIsAlsoEmpty =
          mergedLines.length > 0 && mergedLines[mergedLines.length - 1].trim().length === 0;
        if (isEmptyLine && (mergedLines.length === 0 || previousLineIsAlsoEmpty)) {
          continue;
        }
        mergedLines.push(oneLine);
      }
      while (mergedLines.length > 0 && mergedLines[mergedLines.length - 1].trim().length === 0) {
        mergedLines.pop();
      }
      const trimmedLines = mergedLines.slice(-OUTPUT_TAIL_MAX_LINE_COUNT);
      return { ...previousSnapshot, outputTailLines: trimmedLines };
    });
  }

  function startCommandRun(parameters: StartCommandRunParameters): void {
    const existingChildProcess = inflightChildProcessByRunKey.get(parameters.runKey);
    if (existingChildProcess) {
      existingChildProcess.kill();
      inflightChildProcessByRunKey.delete(parameters.runKey);
    }

    updateOneRunSnapshot(parameters.runKey, () => ({
      runKey: parameters.runKey,
      status: "running",
      exitCode: null,
      startedAtMilliseconds: Date.now(),
      finishedAtMilliseconds: null,
      outputTailLines: [],
      lastErrorMessage: null,
    }));

    const userLoginShellAbsolutePath =
      typeof process.env.SHELL === "string" && process.env.SHELL.length > 0
        ? process.env.SHELL
        : "/bin/sh";

    let spawnedChildProcess: ChildProcessWithoutNullStreams;
    try {
      spawnedChildProcess = spawn(
        userLoginShellAbsolutePath,
        ["-l", "-c", parameters.commandLine],
        { cwd: parameters.workingDirectoryAbsolutePath, windowsHide: true },
      ) as ChildProcessWithoutNullStreams;
    } catch (spawnError) {
      const spawnErrorMessage =
        spawnError instanceof Error ? spawnError.message : String(spawnError);
      updateOneRunSnapshot(parameters.runKey, (previousSnapshot) => ({
        ...previousSnapshot,
        status: "failed",
        finishedAtMilliseconds: Date.now(),
        lastErrorMessage: spawnErrorMessage,
      }));
      return;
    }

    inflightChildProcessByRunKey.set(parameters.runKey, spawnedChildProcess);

    spawnedChildProcess.stdout.on("data", (chunk: Buffer | string) => {
      appendOutputLineToRun(parameters.runKey, chunk.toString());
    });
    spawnedChildProcess.stderr.on("data", (chunk: Buffer | string) => {
      appendOutputLineToRun(parameters.runKey, chunk.toString());
    });

    spawnedChildProcess.on("error", (spawnError) => {
      updateOneRunSnapshot(parameters.runKey, (previousSnapshot) => ({
        ...previousSnapshot,
        status: "failed",
        finishedAtMilliseconds: Date.now(),
        lastErrorMessage: spawnError.message,
      }));
      inflightChildProcessByRunKey.delete(parameters.runKey);
    });

    spawnedChildProcess.on("close", (exitCode, terminationSignal) => {
      inflightChildProcessByRunKey.delete(parameters.runKey);
      updateOneRunSnapshot(parameters.runKey, (previousSnapshot) => {
        if (terminationSignal !== null && previousSnapshot.status === "running") {
          return {
            ...previousSnapshot,
            status: "killed",
            exitCode: null,
            finishedAtMilliseconds: Date.now(),
          };
        }
        return {
          ...previousSnapshot,
          status: exitCode === 0 ? "succeeded" : "failed",
          exitCode,
          finishedAtMilliseconds: Date.now(),
        };
      });
    });
  }

  function killCommandRun(runKey: string): void {
    const inflightChildProcess = inflightChildProcessByRunKey.get(runKey);
    if (!inflightChildProcess) {
      return;
    }
    inflightChildProcess.kill();
  }

  function clearCommandRunOutput(runKey: string): void {
    runsByKeyStore.update((currentRunsByKey) => {
      const remainingRunsByKey = { ...currentRunsByKey };
      delete remainingRunsByKey[runKey];
      return remainingRunsByKey;
    });
  }

  function destroy(): void {
    for (const inflightChildProcess of inflightChildProcessByRunKey.values()) {
      inflightChildProcess.kill();
    }
    inflightChildProcessByRunKey.clear();
  }

  return {
    store: runsByKeyStore,
    startCommandRun,
    killCommandRun,
    clearCommandRunOutput,
    destroy,
  };
}

function createEmptyRunSnapshot(runKey: string): ShellCommandRunSnapshot {
  return {
    runKey,
    status: "idle",
    exitCode: null,
    startedAtMilliseconds: null,
    finishedAtMilliseconds: null,
    outputTailLines: [],
    lastErrorMessage: null,
  };
}

export function buildShellCommandRunKey(
  pinnedProjectId: string,
  shellCommandIndex: number,
): string {
  return `${pinnedProjectId}::${shellCommandIndex}`;
}
