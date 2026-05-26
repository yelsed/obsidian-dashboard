import { spawn } from "child_process";
import { writable, type Readable } from "svelte/store";

export type ProcrastAvailability =
  | "checking"
  | "available"
  | "not-installed"
  | "unauthenticated"
  | "errored";

export type ProcrastIdea = {
  uuid: string;
  content: string;
  refinedContent: string;
  refinementSummary: string;
  summaryTitle: string;
  actionSteps: string[];
  creativeAngles: string[];
  keyQuestions: string[];
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProcrastSnapshot = {
  availability: ProcrastAvailability;
  ideas: ProcrastIdea[];
  lastErrorMessage: string | null;
  lastUpdatedAtMilliseconds: number | null;
};

export type ProcrastStore = {
  store: Readable<ProcrastSnapshot>;
  refresh: () => Promise<void>;
  markDone: (ideaUuid: string) => Promise<ProcrastCommandResult>;
  destroy: () => void;
};

export type ProcrastCommandResult = {
  ok: boolean;
  availability: Exclude<ProcrastAvailability, "checking">;
  errorMessage: string | null;
};

const PROCRAST_COMMAND_TIMEOUT_MILLISECONDS = 5_000;
const MAXIMUM_COMMAND_OUTPUT_BYTES = 5 * 1024 * 1024;
const EMPTY_PROCRAST_SNAPSHOT: ProcrastSnapshot = {
  availability: "checking",
  ideas: [],
  lastErrorMessage: null,
  lastUpdatedAtMilliseconds: null,
};

export function createProcrastIdeasStore(): ProcrastStore {
  const snapshotStore = writable<ProcrastSnapshot>({ ...EMPTY_PROCRAST_SNAPSHOT });
  let inFlightRefreshToken = 0;
  let isDestroyed = false;

  async function refresh(): Promise<void> {
    inFlightRefreshToken += 1;
    const localRefreshToken = inFlightRefreshToken;
    snapshotStore.update((currentSnapshot) => ({
      ...currentSnapshot,
      availability: currentSnapshot.availability === "checking" ? "checking" : currentSnapshot.availability,
      lastErrorMessage: null,
    }));

    const commandResult = await runProcrastCommand(["list", "--json", "--hide-done", "--sort", "smart"]);
    if (isDestroyed || localRefreshToken !== inFlightRefreshToken) {
      return;
    }

    if (!commandResult.ok) {
      snapshotStore.set({
        availability: commandResult.availability,
        ideas: [],
        lastErrorMessage: commandResult.errorMessage,
        lastUpdatedAtMilliseconds: Date.now(),
      });
      return;
    }

    try {
      snapshotStore.set({
        availability: "available",
        ideas: parseProcrastIdeasFromJson(commandResult.stdout),
        lastErrorMessage: null,
        lastUpdatedAtMilliseconds: Date.now(),
      });
    } catch (error) {
      snapshotStore.set({
        availability: "errored",
        ideas: [],
        lastErrorMessage: error instanceof Error ? error.message : "Could not parse Procrast ideas",
        lastUpdatedAtMilliseconds: Date.now(),
      });
    }
  }

  async function markDone(ideaUuid: string): Promise<ProcrastCommandResult> {
    return runProcrastCommand(["done", ideaUuid]);
  }

  function destroy(): void {
    isDestroyed = true;
    inFlightRefreshToken += 1;
  }

  return { store: snapshotStore, refresh, markDone, destroy };
}

export async function readOpenProcrastIdeas(): Promise<ProcrastSnapshot> {
  const commandResult = await runProcrastCommand(["list", "--json", "--hide-done", "--sort", "smart"]);
  if (!commandResult.ok) {
    return {
      availability: commandResult.availability,
      ideas: [],
      lastErrorMessage: commandResult.errorMessage,
      lastUpdatedAtMilliseconds: Date.now(),
    };
  }

  try {
    return {
      availability: "available",
      ideas: parseProcrastIdeasFromJson(commandResult.stdout),
      lastErrorMessage: null,
      lastUpdatedAtMilliseconds: Date.now(),
    };
  } catch (error) {
    return {
      availability: "errored",
      ideas: [],
      lastErrorMessage: error instanceof Error ? error.message : "Could not parse Procrast ideas",
      lastUpdatedAtMilliseconds: Date.now(),
    };
  }
}

export function resolveProcrastIdeaTitle(idea: Pick<ProcrastIdea, "summaryTitle" | "content" | "uuid">): string {
  const trimmedSummaryTitle = idea.summaryTitle.trim();
  if (trimmedSummaryTitle.length > 0) {
    return trimmedSummaryTitle;
  }
  const trimmedContent = idea.content.trim();
  if (trimmedContent.length === 0) {
    return idea.uuid;
  }
  const firstLine = trimmedContent.split(/\r?\n/, 1)[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

export function parseProcrastIdeasFromJson(rawJsonText: string): ProcrastIdea[] {
  const parsedJson = JSON.parse(rawJsonText) as unknown;
  const rawIdeas = extractIdeaArray(parsedJson);
  return rawIdeas.map(mapRawIdeaToProcrastIdea).filter((idea) => idea.uuid.length > 0);
}

function extractIdeaArray(parsedJson: unknown): unknown[] {
  if (Array.isArray(parsedJson)) {
    return parsedJson;
  }
  if (parsedJson !== null && typeof parsedJson === "object") {
    const parsedRecord = parsedJson as Record<string, unknown>;
    if (Array.isArray(parsedRecord.ideas)) {
      return parsedRecord.ideas;
    }
    if (Array.isArray(parsedRecord.data)) {
      return parsedRecord.data;
    }
  }
  throw new Error("Procrast returned JSON without an idea list");
}

function mapRawIdeaToProcrastIdea(rawIdea: unknown): ProcrastIdea {
  if (rawIdea === null || typeof rawIdea !== "object") {
    return createEmptyIdea();
  }
  const rawIdeaRecord = rawIdea as Record<string, unknown>;
  return {
    uuid: readStringField(rawIdeaRecord, "uuid"),
    content: readStringField(rawIdeaRecord, "content"),
    refinedContent: readStringField(rawIdeaRecord, "refinedContent"),
    refinementSummary: readStringField(rawIdeaRecord, "refinementSummary"),
    summaryTitle: readStringField(rawIdeaRecord, "summaryTitle"),
    actionSteps: readStringArrayField(rawIdeaRecord, "actionSteps"),
    creativeAngles: readStringArrayField(rawIdeaRecord, "creativeAngles"),
    keyQuestions: readStringArrayField(rawIdeaRecord, "keyQuestions"),
    priority: readStringField(rawIdeaRecord, "priority"),
    dueDate: readNullableStringField(rawIdeaRecord, "dueDate"),
    completedAt: readNullableStringField(rawIdeaRecord, "completedAt"),
    createdAt: readStringField(rawIdeaRecord, "createdAt"),
    updatedAt: readStringField(rawIdeaRecord, "updatedAt"),
  };
}

function createEmptyIdea(): ProcrastIdea {
  return {
    uuid: "",
    content: "",
    refinedContent: "",
    refinementSummary: "",
    summaryTitle: "",
    actionSteps: [],
    creativeAngles: [],
    keyQuestions: [],
    priority: "",
    dueDate: null,
    completedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function readStringField(record: Record<string, unknown>, fieldName: string): string {
  const rawValue = record[fieldName];
  return typeof rawValue === "string" ? rawValue : "";
}

function readNullableStringField(record: Record<string, unknown>, fieldName: string): string | null {
  const rawValue = record[fieldName];
  if (typeof rawValue === "string" && rawValue.trim().length > 0) {
    return rawValue;
  }
  return null;
}

function readStringArrayField(record: Record<string, unknown>, fieldName: string): string[] {
  const rawValue = record[fieldName];
  if (!Array.isArray(rawValue)) {
    return [];
  }
  return rawValue.filter((entry): entry is string => typeof entry === "string");
}

type ProcrastProcessResult = ProcrastCommandResult & {
  stdout: string;
};

function runProcrastCommand(commandArguments: string[]): Promise<ProcrastProcessResult> {
  return new Promise((resolve) => {
    const childProcess = spawn("procrast", commandArguments, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let hasTimedOut = false;
    let hasExceededOutputLimit = false;
    let hasResolved = false;

    function resolveOnce(result: ProcrastProcessResult): void {
      if (hasResolved) {
        return;
      }
      hasResolved = true;
      clearTimeout(timeoutHandle);
      resolve(result);
    }


    const timeoutHandle = setTimeout(() => {
      hasTimedOut = true;
      childProcess.kill("SIGTERM");
    }, PROCRAST_COMMAND_TIMEOUT_MILLISECONDS);

    childProcess.stdout.on("data", (chunk: Buffer) => {
      if (hasExceededOutputLimit) {
        return;
      }
      stdout += chunk.toString("utf8");
      if (stdout.length + stderr.length > MAXIMUM_COMMAND_OUTPUT_BYTES) {
        hasExceededOutputLimit = true;
        childProcess.kill("SIGTERM");
      }
    });

    childProcess.stderr.on("data", (chunk: Buffer) => {
      if (hasExceededOutputLimit) {
        return;
      }
      stderr += chunk.toString("utf8");
      if (stdout.length + stderr.length > MAXIMUM_COMMAND_OUTPUT_BYTES) {
        hasExceededOutputLimit = true;
        childProcess.kill("SIGTERM");
      }
    });

    childProcess.on("error", (error) => {
      resolveOnce({
        ok: false,
        availability: errorMessageIndicatesProcrastMissing(error.message)
          ? "not-installed"
          : "errored",
        errorMessage: error.message,
        stdout: "",
      });
    });

    childProcess.on("close", (exitCode) => {
      if (hasTimedOut) {
        resolveOnce({
          ok: false,
          availability: "errored",
          errorMessage: "Procrast command timed out",
          stdout: "",
        });
        return;
      }
      if (hasExceededOutputLimit) {
        resolveOnce({
          ok: false,
          availability: "errored",
          errorMessage: "Procrast output was too large",
          stdout: "",
        });
        return;
      }
      if (exitCode === 0) {
        resolveOnce({ ok: true, availability: "available", errorMessage: null, stdout });
        return;
      }

      const combinedErrorOutput = `${stderr}\n${stdout}`.trim();
      resolveOnce({
        ok: false,
        availability: errorMessageIndicatesAuthenticationFailure(combinedErrorOutput)
          ? "unauthenticated"
          : "errored",
        errorMessage:
          combinedErrorOutput.length > 0
            ? combinedErrorOutput
            : `Procrast exited with code ${exitCode ?? "unknown"}`,
        stdout: "",
      });
    });
  });
}

function errorMessageIndicatesProcrastMissing(errorMessage: string): boolean {
  const lowercasedMessage = errorMessage.toLowerCase();
  return lowercasedMessage.includes("enoent") || lowercasedMessage.includes("not found");
}

function errorMessageIndicatesAuthenticationFailure(errorMessage: string): boolean {
  const lowercasedMessage = errorMessage.toLowerCase();
  return (
    lowercasedMessage.includes("auth") ||
    lowercasedMessage.includes("login") ||
    lowercasedMessage.includes("log in") ||
    lowercasedMessage.includes("unauthorized") ||
    lowercasedMessage.includes("forbidden")
  );
}
