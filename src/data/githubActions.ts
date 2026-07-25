import { spawn } from "child_process";
import { promises as filesystemPromises } from "fs";
import nodePath from "path";
import { writable, type Readable } from "svelte/store";
import { buildExternalCommandEnvironment } from "./externalCommandEnvironment";

export type GitHubActionsAvailability =
  | "checking"
  | "available"
  | "not-installed"
  | "unauthenticated"
  | "not-a-repository"
  | "rate-limited"
  | "errored";

export type WorkflowRunStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "waiting"
  | "requested"
  | "pending";

export type WorkflowRunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "stale"
  | "startup_failure";

export type WorkflowRunSummary = {
  runDatabaseId: number;
  workflowName: string;
  displayTitle: string;
  headBranchName: string;
  runStatus: WorkflowRunStatus;
  runConclusion: WorkflowRunConclusion | null;
  createdAtEpochMilliseconds: number;
  runBrowserUrl: string;
};

export type DispatchableWorkflowSummary = {
  workflowFilePath: string;
  workflowName: string;
};

export type GitHubProjectActionsSnapshot = {
  pinnedProjectId: string;
  displayName: string;
  availability: GitHubActionsAvailability;
  recentRuns: WorkflowRunSummary[];
  dispatchableWorkflows: DispatchableWorkflowSummary[];
  branchNames: string[];
  /* GraphQL caps a ref page at 100. A repository with more branches than that silently loses the
     tail, so the picker says so rather than pretending the list is complete. */
  branchListWasTruncated: boolean;
  isDispatchInFlight: boolean;
  /* Keyed by run id rather than a single boolean: re-running one run must not grey out the cancel
     button on another, and a double click on the same row must not fire `gh` twice. */
  runIdsWithActionInFlight: number[];
  lastErrorMessage: string | null;
};

export type WorkflowRunCompletionEvent = {
  eventSequenceNumber: number;
  projectDisplayName: string;
  finishedRun: WorkflowRunSummary;
};

export type TrackedGitHubProject = {
  pinnedProjectId: string;
  displayName: string;
  folderPath: string;
};

export type GitHubActionsStore = {
  store: Readable<GitHubProjectActionsSnapshot[]>;
  runCompletionEvents: Readable<WorkflowRunCompletionEvent | null>;
  setTrackedProjects: (trackedProjects: TrackedGitHubProject[]) => void;
  startPolling: () => void;
  stopPolling: () => void;
  refreshNow: () => void;
  dispatchWorkflow: (
    pinnedProjectId: string,
    workflowFilePath: string,
    branchName: string,
  ) => Promise<void>;
  rerunFailedJobsOfRun: (pinnedProjectId: string, runDatabaseId: number) => Promise<void>;
  cancelRun: (pinnedProjectId: string, runDatabaseId: number) => Promise<void>;
  destroy: () => void;
};

const IDLE_POLLING_INTERVAL_MILLISECONDS = 20_000;
const ACTIVE_RUN_POLLING_INTERVAL_MILLISECONDS = 5_000;
const GITHUB_COMMAND_TIMEOUT_MILLISECONDS = 10_000;
// This list is both what the detail section renders and the evidence for ordering the workflow
// picker by "last used". A workflow whose last run has already fallen out of these entries sorts
// as never-used; raise the limit if a repository has more workflows than that window covers.
const RECENT_RUN_LIMIT_PER_PROJECT = 20;
const MAXIMUM_BRANCHES_OFFERED = 100;
const POLL_CYCLES_BETWEEN_REPOSITORY_METADATA_REFRESHES = 10;
// A dispatched run does not appear in `gh run list` immediately; GitHub needs a moment to
// register it. Without this delay the poll right after a dispatch shows nothing and the
// button looks broken.
const DELAY_AFTER_DISPATCH_BEFORE_REFRESH_MILLISECONDS = 2_000;

const RUN_LIST_JSON_FIELDS = [
  "databaseId",
  "workflowName",
  "displayTitle",
  "headBranch",
  "status",
  "conclusion",
  "createdAt",
  "url",
].join(",");

export function createGitHubActionsStore(): GitHubActionsStore {
  const snapshotsStore = writable<GitHubProjectActionsSnapshot[]>([]);
  const runCompletionEventsStore = writable<WorkflowRunCompletionEvent | null>(null);

  let trackedProjects: TrackedGitHubProject[] = [];
  let snapshotByPinnedProjectId = new Map<string, GitHubProjectActionsSnapshot>();
  const previousRunsByPinnedProjectId = new Map<string, WorkflowRunSummary[]>();
  const projectIdsWithSeededRunBaseline = new Set<string>();

  let pollTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let isPollingInFlight = false;
  let isDestroyed = false;
  let completedPollCycleCount = 0;
  let emittedCompletionEventCount = 0;
  let pollChainGeneration = 0;

  function publishSnapshots(): void {
    snapshotsStore.set(
      trackedProjects
        .map((trackedProject) => snapshotByPinnedProjectId.get(trackedProject.pinnedProjectId))
        .filter(
          (snapshot): snapshot is GitHubProjectActionsSnapshot =>
            snapshot !== undefined && snapshot.availability !== "not-a-repository",
        ),
    );
  }

  function updateOneProjectSnapshot(
    pinnedProjectId: string,
    transform: (previousSnapshot: GitHubProjectActionsSnapshot) => GitHubProjectActionsSnapshot,
  ): void {
    const previousSnapshot = snapshotByPinnedProjectId.get(pinnedProjectId);
    if (previousSnapshot === undefined) {
      return;
    }
    snapshotByPinnedProjectId.set(pinnedProjectId, transform(previousSnapshot));
    publishSnapshots();
  }

  function setTrackedProjects(nextTrackedProjects: TrackedGitHubProject[]): void {
    trackedProjects = nextTrackedProjects;

    const nextSnapshotByPinnedProjectId = new Map<string, GitHubProjectActionsSnapshot>();
    for (const trackedProject of nextTrackedProjects) {
      const existingSnapshot = snapshotByPinnedProjectId.get(trackedProject.pinnedProjectId);
      nextSnapshotByPinnedProjectId.set(
        trackedProject.pinnedProjectId,
        existingSnapshot === undefined
          ? createCheckingSnapshotFor(trackedProject)
          : { ...existingSnapshot, displayName: trackedProject.displayName },
      );
    }
    snapshotByPinnedProjectId = nextSnapshotByPinnedProjectId;

    for (const forgottenProjectId of [...previousRunsByPinnedProjectId.keys()]) {
      if (!nextSnapshotByPinnedProjectId.has(forgottenProjectId)) {
        previousRunsByPinnedProjectId.delete(forgottenProjectId);
        projectIdsWithSeededRunBaseline.delete(forgottenProjectId);
      }
    }

    publishSnapshots();
    if (pollTimeoutHandle !== null) {
      refreshNow();
    }
  }

  async function pollOneProject(
    trackedProject: TrackedGitHubProject,
    shouldRefreshRepositoryMetadata: boolean,
  ): Promise<void> {
    if (!(await folderLooksLikeGitRepository(trackedProject.folderPath))) {
      updateOneProjectSnapshot(trackedProject.pinnedProjectId, (previousSnapshot) => ({
        ...previousSnapshot,
        availability: "not-a-repository",
        recentRuns: [],
        dispatchableWorkflows: [],
        branchNames: [],
        lastErrorMessage: null,
      }));
      return;
    }

    let recentRuns: WorkflowRunSummary[];
    try {
      const rawRunListOutput = await runGitHubCommand(trackedProject.folderPath, [
        "run",
        "list",
        "--limit",
        String(RECENT_RUN_LIMIT_PER_PROJECT),
        "--json",
        RUN_LIST_JSON_FIELDS,
      ]);
      recentRuns = parseWorkflowRunListJson(rawRunListOutput);
    } catch (caughtError) {
      const errorMessage = describeCaughtError(caughtError);
      updateOneProjectSnapshot(trackedProject.pinnedProjectId, (previousSnapshot) => ({
        ...previousSnapshot,
        availability: classifyGitHubCommandFailure(errorMessage),
        lastErrorMessage: errorMessage,
      }));
      return;
    }

    emitCompletionEventsFor(trackedProject, recentRuns);

    updateOneProjectSnapshot(trackedProject.pinnedProjectId, (previousSnapshot) => ({
      ...previousSnapshot,
      availability: "available",
      recentRuns,
      lastErrorMessage: null,
    }));

    const snapshotAfterRunUpdate = snapshotByPinnedProjectId.get(trackedProject.pinnedProjectId);
    const hasNoRepositoryMetadataYet =
      snapshotAfterRunUpdate !== undefined && snapshotAfterRunUpdate.dispatchableWorkflows.length === 0;
    if (shouldRefreshRepositoryMetadata || hasNoRepositoryMetadataYet) {
      await refreshRepositoryMetadataFor(trackedProject);
    }
  }

  async function refreshRepositoryMetadataFor(trackedProject: TrackedGitHubProject): Promise<void> {
    const [dispatchableWorkflows, branchNames] = await Promise.all([
      readDispatchableWorkflows(trackedProject.folderPath),
      readBranchNamesNewestFirst(trackedProject.folderPath),
    ]);
    updateOneProjectSnapshot(trackedProject.pinnedProjectId, (previousSnapshot) => ({
      ...previousSnapshot,
      dispatchableWorkflows:
        dispatchableWorkflows === null ? previousSnapshot.dispatchableWorkflows : dispatchableWorkflows,
      branchNames: branchNames === null ? previousSnapshot.branchNames : branchNames,
      branchListWasTruncated:
        branchNames === null
          ? previousSnapshot.branchListWasTruncated
          : branchNames.length >= MAXIMUM_BRANCHES_OFFERED,
    }));
  }

  function emitCompletionEventsFor(
    trackedProject: TrackedGitHubProject,
    nextRuns: WorkflowRunSummary[],
  ): void {
    const previousRuns = previousRunsByPinnedProjectId.get(trackedProject.pinnedProjectId) ?? [];
    previousRunsByPinnedProjectId.set(trackedProject.pinnedProjectId, nextRuns);

    // The first successful poll only establishes the baseline. Announcing every run that was
    // already finished before the dashboard opened would fire a notification storm on startup.
    if (!projectIdsWithSeededRunBaseline.has(trackedProject.pinnedProjectId)) {
      projectIdsWithSeededRunBaseline.add(trackedProject.pinnedProjectId);
      return;
    }

    for (const finishedRun of detectNewlyFinishedRuns(previousRuns, nextRuns)) {
      emittedCompletionEventCount += 1;
      runCompletionEventsStore.set({
        eventSequenceNumber: emittedCompletionEventCount,
        projectDisplayName: trackedProject.displayName,
        finishedRun,
      });
    }
  }

  async function pollAllTrackedProjects(): Promise<void> {
    if (isPollingInFlight) {
      return;
    }
    isPollingInFlight = true;
    try {
      const shouldRefreshRepositoryMetadata =
        completedPollCycleCount % POLL_CYCLES_BETWEEN_REPOSITORY_METADATA_REFRESHES === 0;
      for (const trackedProject of [...trackedProjects]) {
        if (isDestroyed) {
          return;
        }
        await pollOneProject(trackedProject, shouldRefreshRepositoryMetadata);
      }
      completedPollCycleCount += 1;
    } finally {
      isPollingInFlight = false;
    }
  }

  function resolveCurrentPollingIntervalMilliseconds(): number {
    for (const snapshot of snapshotByPinnedProjectId.values()) {
      if (snapshot.recentRuns.some((oneRun) => !isRunFinished(oneRun))) {
        return ACTIVE_RUN_POLLING_INTERVAL_MILLISECONDS;
      }
    }
    return IDLE_POLLING_INTERVAL_MILLISECONDS;
  }

  // A poll chain re-schedules itself from inside its own completion callback. Stopping it
  // therefore cannot rely on clearing the pending timeout alone — a cycle already awaiting
  // `gh` would re-schedule after the stop and run alongside the chain that replaced it. The
  // generation counter lets an in-flight cycle notice that it has been superseded.
  function scheduleNextPollCycle(delayMilliseconds: number): void {
    if (isDestroyed) {
      return;
    }
    const generationAtScheduleTime = pollChainGeneration;
    pollTimeoutHandle = setTimeout(() => {
      void pollAllTrackedProjects().then(() => {
        if (generationAtScheduleTime !== pollChainGeneration) {
          return;
        }
        scheduleNextPollCycle(resolveCurrentPollingIntervalMilliseconds());
      });
    }, delayMilliseconds);
  }

  function startPolling(): void {
    if (pollTimeoutHandle !== null || isDestroyed) {
      return;
    }
    scheduleNextPollCycle(0);
  }

  function stopPolling(): void {
    pollChainGeneration += 1;
    if (pollTimeoutHandle === null) {
      return;
    }
    clearTimeout(pollTimeoutHandle);
    pollTimeoutHandle = null;
  }

  function refreshNow(): void {
    stopPolling();
    completedPollCycleCount = 0;
    startPolling();
  }

  function findTrackedProjectById(pinnedProjectId: string): TrackedGitHubProject | null {
    return (
      trackedProjects.find((trackedProject) => trackedProject.pinnedProjectId === pinnedProjectId) ??
      null
    );
  }

  async function runProjectActionCommand(
    pinnedProjectId: string,
    commandArguments: string[],
    delayBeforeRefreshMilliseconds: number,
    runDatabaseIdBeingActedOn: number | null,
  ): Promise<void> {
    const trackedProject = findTrackedProjectById(pinnedProjectId);
    if (trackedProject === null) {
      return;
    }

    const snapshotBeforeAction = snapshotByPinnedProjectId.get(pinnedProjectId);
    if (snapshotBeforeAction === undefined) {
      return;
    }
    const isAlreadyRunningThisAction =
      runDatabaseIdBeingActedOn === null
        ? snapshotBeforeAction.isDispatchInFlight
        : snapshotBeforeAction.runIdsWithActionInFlight.includes(runDatabaseIdBeingActedOn);
    if (isAlreadyRunningThisAction) {
      return;
    }

    updateOneProjectSnapshot(pinnedProjectId, (previousSnapshot) =>
      markActionInFlight(previousSnapshot, runDatabaseIdBeingActedOn, true),
    );

    try {
      await runGitHubCommand(trackedProject.folderPath, commandArguments);
      updateOneProjectSnapshot(pinnedProjectId, (previousSnapshot) =>
        markActionInFlight(previousSnapshot, runDatabaseIdBeingActedOn, false),
      );
      setTimeout(() => {
        if (!isDestroyed) {
          refreshNow();
        }
      }, delayBeforeRefreshMilliseconds);
    } catch (caughtError) {
      updateOneProjectSnapshot(pinnedProjectId, (previousSnapshot) => ({
        ...markActionInFlight(previousSnapshot, runDatabaseIdBeingActedOn, false),
        lastErrorMessage: describeCaughtError(caughtError),
      }));
    }
  }

  function dispatchWorkflow(
    pinnedProjectId: string,
    workflowFilePath: string,
    branchName: string,
  ): Promise<void> {
    return runProjectActionCommand(
      pinnedProjectId,
      ["workflow", "run", workflowFilePath, "--ref", branchName],
      DELAY_AFTER_DISPATCH_BEFORE_REFRESH_MILLISECONDS,
      null,
    );
  }

  function rerunFailedJobsOfRun(pinnedProjectId: string, runDatabaseId: number): Promise<void> {
    return runProjectActionCommand(
      pinnedProjectId,
      ["run", "rerun", String(runDatabaseId), "--failed"],
      DELAY_AFTER_DISPATCH_BEFORE_REFRESH_MILLISECONDS,
      runDatabaseId,
    );
  }

  function cancelRun(pinnedProjectId: string, runDatabaseId: number): Promise<void> {
    return runProjectActionCommand(
      pinnedProjectId,
      ["run", "cancel", String(runDatabaseId)],
      0,
      runDatabaseId,
    );
  }

  function destroy(): void {
    isDestroyed = true;
    stopPolling();
  }

  return {
    store: snapshotsStore,
    runCompletionEvents: runCompletionEventsStore,
    setTrackedProjects,
    startPolling,
    stopPolling,
    refreshNow,
    dispatchWorkflow,
    rerunFailedJobsOfRun,
    cancelRun,
    destroy,
  };
}

export function markActionInFlight(
  snapshot: GitHubProjectActionsSnapshot,
  runDatabaseIdBeingActedOn: number | null,
  isInFlight: boolean,
): GitHubProjectActionsSnapshot {
  if (runDatabaseIdBeingActedOn === null) {
    return { ...snapshot, isDispatchInFlight: isInFlight };
  }
  const withoutThisRun = snapshot.runIdsWithActionInFlight.filter(
    (oneRunId) => oneRunId !== runDatabaseIdBeingActedOn,
  );
  return {
    ...snapshot,
    runIdsWithActionInFlight: isInFlight
      ? [...withoutThisRun, runDatabaseIdBeingActedOn]
      : withoutThisRun,
  };
}

export function detectNewlyFinishedRuns(
  previousRuns: WorkflowRunSummary[],
  nextRuns: WorkflowRunSummary[],
): WorkflowRunSummary[] {
  const previousRunById = new Map(
    previousRuns.map((oneRun) => [oneRun.runDatabaseId, oneRun] as const),
  );

  return nextRuns.filter((nextRun) => {
    if (!isRunFinished(nextRun)) {
      return false;
    }
    const previousRun = previousRunById.get(nextRun.runDatabaseId);
    if (previousRun === undefined) {
      return false;
    }
    return !isRunFinished(previousRun);
  });
}

export function isRunFinished(oneRun: WorkflowRunSummary): boolean {
  return oneRun.runStatus === "completed";
}

/* GitHub's own vocabulary runs to fifteen characters ("action_required", "startup_failure"),
   which no sensible column width holds beside a workflow name and a branch. These labels say the
   same thing inside nine, and read like status words rather than API enum members. */
const RUN_OUTCOME_LABEL_BY_CONCLUSION: Record<WorkflowRunConclusion, string> = {
  success: "success",
  failure: "failed",
  cancelled: "cancelled",
  skipped: "skipped",
  timed_out: "timed out",
  action_required: "blocked",
  neutral: "neutral",
  stale: "stale",
  startup_failure: "failed",
};

const RUN_OUTCOME_LABEL_BY_UNFINISHED_STATUS: Record<string, string> = {
  in_progress: "running",
  queued: "queued",
  waiting: "waiting",
  requested: "queued",
  pending: "pending",
};

export function describeRunOutcomeLabel(oneRun: WorkflowRunSummary): string {
  if (!isRunFinished(oneRun)) {
    return RUN_OUTCOME_LABEL_BY_UNFINISHED_STATUS[oneRun.runStatus] ?? "queued";
  }
  if (oneRun.runConclusion === null) {
    return "done";
  }
  return RUN_OUTCOME_LABEL_BY_CONCLUSION[oneRun.runConclusion];
}

async function folderLooksLikeGitRepository(folderPath: string): Promise<boolean> {
  try {
    await filesystemPromises.stat(nodePath.join(folderPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function readDispatchableWorkflows(
  folderPath: string,
): Promise<DispatchableWorkflowSummary[] | null> {
  try {
    const rawWorkflowListOutput = await runGitHubCommand(folderPath, [
      "workflow",
      "list",
      "--json",
      "name,path,state",
    ]);
    return parseWorkflowListJson(rawWorkflowListOutput);
  } catch {
    return null;
  }
}

// The REST branch list is alphabetical and carries no commit dates, so it cannot answer
// "which branch did I touch last". GraphQL can, in one request — but unlike `gh api`, it has
// no {owner}/{repo} placeholders, so the slug has to be resolved first. It never changes for
// a given folder, hence the cache.
const repositoryNameWithOwnerByFolderPath = new Map<string, string>();

async function resolveRepositoryNameWithOwner(folderPath: string): Promise<string | null> {
  const cachedNameWithOwner = repositoryNameWithOwnerByFolderPath.get(folderPath);
  if (cachedNameWithOwner !== undefined) {
    return cachedNameWithOwner;
  }
  const rawRepositoryViewOutput = await runGitHubCommand(folderPath, [
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);
  const nameWithOwner = rawRepositoryViewOutput.trim();
  if (nameWithOwner.length === 0) {
    return null;
  }
  repositoryNameWithOwnerByFolderPath.set(folderPath, nameWithOwner);
  return nameWithOwner;
}

async function readBranchNamesNewestFirst(folderPath: string): Promise<string[] | null> {
  try {
    const nameWithOwner = await resolveRepositoryNameWithOwner(folderPath);
    if (nameWithOwner === null) {
      return null;
    }
    const [repositoryOwner, repositoryName] = nameWithOwner.split("/");
    if (repositoryOwner === undefined || repositoryName === undefined) {
      return null;
    }

    const rawBranchListOutput = await runGitHubCommand(folderPath, [
      "api",
      "graphql",
      "-f",
      `query=${buildBranchesOrderedByCommitDateQuery(repositoryOwner, repositoryName)}`,
      "--jq",
      ".data.repository.refs.nodes[].name",
    ]);
    return rawBranchListOutput
      .split("\n")
      .map((oneLine) => oneLine.trim())
      .filter((oneLine) => oneLine.length > 0);
  } catch {
    return null;
  }
}

// TAG_COMMIT_DATE is GitHub's name for "the commit date of whatever the ref points at". It is
// the only RefOrderField that sorts branches by recency; the name is a historical artefact.
function buildBranchesOrderedByCommitDateQuery(
  repositoryOwner: string,
  repositoryName: string,
): string {
  return `{repository(owner:${JSON.stringify(repositoryOwner)},name:${JSON.stringify(repositoryName)}){refs(refPrefix:"refs/heads/",first:${MAXIMUM_BRANCHES_OFFERED},orderBy:{field:TAG_COMMIT_DATE,direction:DESC}){nodes{name}}}}`;
}

export function sortWorkflowsByMostRecentRun(
  dispatchableWorkflows: DispatchableWorkflowSummary[],
  recentRuns: WorkflowRunSummary[],
): DispatchableWorkflowSummary[] {
  const mostRecentRunTimestampByWorkflowName = new Map<string, number>();
  for (const oneRun of recentRuns) {
    const knownTimestamp = mostRecentRunTimestampByWorkflowName.get(oneRun.workflowName) ?? 0;
    if (oneRun.createdAtEpochMilliseconds > knownTimestamp) {
      mostRecentRunTimestampByWorkflowName.set(
        oneRun.workflowName,
        oneRun.createdAtEpochMilliseconds,
      );
    }
  }

  return [...dispatchableWorkflows].sort((leftWorkflow, rightWorkflow) => {
    const leftTimestamp = mostRecentRunTimestampByWorkflowName.get(leftWorkflow.workflowName) ?? 0;
    const rightTimestamp = mostRecentRunTimestampByWorkflowName.get(rightWorkflow.workflowName) ?? 0;
    if (leftTimestamp !== rightTimestamp) {
      return rightTimestamp - leftTimestamp;
    }
    return leftWorkflow.workflowName.localeCompare(rightWorkflow.workflowName);
  });
}

function runGitHubCommand(
  workingDirectoryAbsolutePath: string,
  commandArguments: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    let spawnedGitHubProcess;
    try {
      spawnedGitHubProcess = spawn("gh", commandArguments, {
        cwd: workingDirectoryAbsolutePath,
        windowsHide: true,
        env: buildExternalCommandEnvironment(),
      });
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
      spawnedGitHubProcess.kill();
      reject(new Error(`gh ${commandArguments[0] ?? ""} timed out`));
    }, GITHUB_COMMAND_TIMEOUT_MILLISECONDS);

    spawnedGitHubProcess.stdout.on("data", (chunk: Buffer | string) => {
      collectedStandardOutputChunks.push(chunk.toString());
    });

    spawnedGitHubProcess.stderr.on("data", (chunk: Buffer | string) => {
      collectedStandardErrorChunks.push(chunk.toString());
    });

    spawnedGitHubProcess.on("error", (spawnError) => {
      if (hasResolvedOrRejected) {
        return;
      }
      hasResolvedOrRejected = true;
      clearTimeout(timeoutHandle);
      reject(spawnError);
    });

    spawnedGitHubProcess.on("close", (exitCode) => {
      if (hasResolvedOrRejected) {
        return;
      }
      hasResolvedOrRejected = true;
      clearTimeout(timeoutHandle);
      if (exitCode === 0) {
        resolve(collectedStandardOutputChunks.join(""));
        return;
      }
      const standardErrorText = collectedStandardErrorChunks.join("").trim();
      reject(
        new Error(
          standardErrorText.length > 0
            ? standardErrorText
            : `gh ${commandArguments.join(" ")} exited with code ${exitCode}`,
        ),
      );
    });
  });
}

function parseWorkflowRunListJson(rawJsonText: string): WorkflowRunSummary[] {
  const parsedEntries = tryParseJsonArray(rawJsonText);
  return parsedEntries.map((oneEntry) => ({
    runDatabaseId: typeof oneEntry.databaseId === "number" ? oneEntry.databaseId : 0,
    workflowName: typeof oneEntry.workflowName === "string" ? oneEntry.workflowName : "workflow",
    displayTitle: typeof oneEntry.displayTitle === "string" ? oneEntry.displayTitle : "",
    headBranchName: typeof oneEntry.headBranch === "string" ? oneEntry.headBranch : "",
    runStatus: normaliseRunStatus(oneEntry.status),
    runConclusion: normaliseRunConclusion(oneEntry.conclusion),
    createdAtEpochMilliseconds: parseIsoTimestampToEpochMilliseconds(oneEntry.createdAt),
    runBrowserUrl: typeof oneEntry.url === "string" ? oneEntry.url : "",
  }));
}

function parseWorkflowListJson(rawJsonText: string): DispatchableWorkflowSummary[] {
  return tryParseJsonArray(rawJsonText)
    .filter((oneEntry) => oneEntry.state === "active")
    .map((oneEntry) => ({
      workflowFilePath: typeof oneEntry.path === "string" ? oneEntry.path : "",
      workflowName: typeof oneEntry.name === "string" ? oneEntry.name : "",
    }))
    .filter((oneWorkflow) => oneWorkflow.workflowFilePath.length > 0);
}

function tryParseJsonArray(rawJsonText: string): Record<string, unknown>[] {
  try {
    const parsedValue = JSON.parse(rawJsonText);
    if (!Array.isArray(parsedValue)) {
      return [];
    }
    return parsedValue.filter(
      (oneEntry): oneEntry is Record<string, unknown> =>
        oneEntry !== null && typeof oneEntry === "object",
    );
  } catch {
    return [];
  }
}

const KNOWN_RUN_STATUSES: ReadonlySet<string> = new Set<WorkflowRunStatus>([
  "queued",
  "in_progress",
  "completed",
  "waiting",
  "requested",
  "pending",
]);

const KNOWN_RUN_CONCLUSIONS: ReadonlySet<string> = new Set<WorkflowRunConclusion>([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "neutral",
  "stale",
  "startup_failure",
]);

function normaliseRunStatus(rawStatus: unknown): WorkflowRunStatus {
  if (typeof rawStatus === "string" && KNOWN_RUN_STATUSES.has(rawStatus)) {
    return rawStatus as WorkflowRunStatus;
  }
  return "queued";
}

function normaliseRunConclusion(rawConclusion: unknown): WorkflowRunConclusion | null {
  if (typeof rawConclusion === "string" && KNOWN_RUN_CONCLUSIONS.has(rawConclusion)) {
    return rawConclusion as WorkflowRunConclusion;
  }
  return null;
}

function parseIsoTimestampToEpochMilliseconds(rawTimestamp: unknown): number {
  if (typeof rawTimestamp !== "string") {
    return 0;
  }
  const parsedEpochMilliseconds = Date.parse(rawTimestamp);
  return Number.isNaN(parsedEpochMilliseconds) ? 0 : parsedEpochMilliseconds;
}

function createCheckingSnapshotFor(
  trackedProject: TrackedGitHubProject,
): GitHubProjectActionsSnapshot {
  return {
    pinnedProjectId: trackedProject.pinnedProjectId,
    displayName: trackedProject.displayName,
    availability: "checking",
    recentRuns: [],
    dispatchableWorkflows: [],
    branchNames: [],
    branchListWasTruncated: false,
    isDispatchInFlight: false,
    runIdsWithActionInFlight: [],
    lastErrorMessage: null,
  };
}

function describeCaughtError(caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : String(caughtError);
}

export function classifyGitHubCommandFailure(errorMessage: string): GitHubActionsAvailability {
  const lowercaseMessage = errorMessage.toLowerCase();

  if (
    lowercaseMessage.includes("enoent") ||
    lowercaseMessage.includes("command not found") ||
    lowercaseMessage.includes("gh: not found")
  ) {
    return "not-installed";
  }

  // Checked before the credentials test on purpose: GitHub reports a spent rate limit as HTTP 403,
  // which would otherwise be read as "you are logged out" and send the user to re-authenticate for
  // a problem that only time fixes.
  if (
    lowercaseMessage.includes("rate limit") ||
    lowercaseMessage.includes("secondary rate") ||
    lowercaseMessage.includes("http 429") ||
    lowercaseMessage.includes("abuse detection")
  ) {
    return "rate-limited";
  }

  if (
    lowercaseMessage.includes("gh auth login") ||
    lowercaseMessage.includes("authentication") ||
    lowercaseMessage.includes("not logged in") ||
    lowercaseMessage.includes("unauthorized") ||
    lowercaseMessage.includes("http 401") ||
    lowercaseMessage.includes("http 403") ||
    lowercaseMessage.includes("bad credentials")
  ) {
    return "unauthenticated";
  }

  if (
    lowercaseMessage.includes("not a git repository") ||
    lowercaseMessage.includes("no git remotes") ||
    lowercaseMessage.includes("none of the git remotes") ||
    lowercaseMessage.includes("could not determine")
  ) {
    return "not-a-repository";
  }

  return "errored";
}
