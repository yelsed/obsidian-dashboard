import { promises as filesystemPromises } from "fs";
import nodePath from "path";
import { writable, type Readable } from "svelte/store";
import { formatRelativeModifiedTime } from "./format";
import { OPEN_TASK_LINE_PATTERN } from "./tasks";
import type {
  PinnedProject as PinnedProjectConfig,
  PinnedProjectId,
  ProcrastIdeaFolderMapping,
} from "../settings";
import type { DockerContainerSummary, DockerSnapshot } from "./docker";
import type { JiraAvailability, JiraIssueSummary, JiraSnapshot } from "./jira";
import {
  readRecentClaudeSessionsForProject,
  type ClaudeSessionSummary,
} from "./claudeSessions";

export type PairedContainerForWidget = {
  containerName: string;
  imageReference: string;
  containerStatus: "running" | "paused" | "stopped";
  upTimeLabel: string;
  exposedPortLabel: string;
};

export type ChildMarkdownFileForWidget = {
  relativeFilePath: string;
  relativeModifiedTimeLabel: string;
};

export type FreshnessLevel = "active" | "cooling" | "cold";

export type StoredShellCommandForWidget = {
  shellCommandIndex: number;
  label: string;
  commandLine: string;
};

export type ProjectOpenTaskForWidget = {
  taskText: string;
  relativeFilePath: string;
};

export type ProcrastOriginForWidget = {
  ideaUuid: string;
  ideaTitle: string;
  createdAt: string;
};

export type PinnedProjectForWidget = {
  id: PinnedProjectId;
  folderPath: string;
  displayName: string;
  dockerAvailability: "available" | "not-installed";
  pairedContainers: PairedContainerForWidget[];
  freshnessLevel: FreshnessLevel;
  relativeModifiedTimeLabel: string;
  markdownFileCount: number;
  childMarkdownFilesPreview: ChildMarkdownFileForWidget[];
  childMarkdownFilesOverflowCount: number;
  storedShellCommands: StoredShellCommandForWidget[];
  recentClaudeSessions: ClaudeSessionSummary[];
  lastClaudeSessionLastActivityAtMilliseconds: number | null;
  goalsFileExists: boolean;
  openTasks: ProjectOpenTaskForWidget[];
  openTaskOverflowCount: number;
  isExpanded: boolean;
  procrastOrigin: ProcrastOriginForWidget | null;
  jiraProjectKey: string;
  jiraAvailability: JiraAvailability;
  jiraOpenIssueCount: number;
  jiraIssuesForProject: JiraIssueSummary[];
};

export type { ClaudeSessionSummary } from "./claudeSessions";

export type PinnedProjectsStore = {
  store: Readable<PinnedProjectForWidget[]>;
  setPinnedProjectsConfig: (pinnedProjectsConfig: PinnedProjectConfig[]) => void;
  setDockerSnapshot: (dockerSnapshot: DockerSnapshot) => void;
  setJiraSnapshot: (jiraSnapshot: JiraSnapshot) => void;
  setExpandedProjectIds: (expandedProjectIds: Set<PinnedProjectId>) => void;
  setProcrastIdeaFolderMappings: (
    procrastIdeaFolderMappings: ProcrastIdeaFolderMapping[],
  ) => void;
  destroy: () => void;
};

const FRESHNESS_ACTIVE_DAY_THRESHOLD = 7;
const FRESHNESS_COOLING_DAY_THRESHOLD = 30;
const ONE_DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const CHILD_FILES_PREVIEW_LIMIT = 5;
const RECENT_CLAUDE_SESSIONS_LIMIT_PER_PROJECT = 3;
const FILESYSTEM_WALK_MAX_DEPTH = 4;
const PROJECT_GOALS_FILE_NAME = "GOALS.md";
const PROJECT_TASK_SCAN_FILE_LIMIT = 40;
const PROJECT_TASK_COLLECTION_LIMIT = 200;
const PROJECT_TASK_DISPLAY_LIMIT = 6;
const PERIODIC_FILESYSTEM_REFRESH_MILLISECONDS = 30_000;
const IGNORED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  "node_modules",
  "vendor",
  ".git",
  "dist",
  "build",
  "target",
  ".next",
  ".cache",
]);

type CachedMarkdownFileEntry = {
  absoluteFilePath: string;
  relativeFilePath: string;
  modifiedAtMilliseconds: number;
};

type CachedProjectFilesystemSnapshot = {
  folderExists: boolean;
  markdownFiles: CachedMarkdownFileEntry[];
  goalsFileExists: boolean;
  openTasks: ProjectOpenTaskForWidget[];
};

export function createPinnedProjectsStore(): PinnedProjectsStore {
  let currentPinnedProjectsConfig: PinnedProjectConfig[] = [];
  let currentDockerSnapshot: DockerSnapshot = {
    dockerAvailability: "available",
    containers: [],
    lastErrorMessage: null,
  };
  let currentJiraSnapshot: JiraSnapshot = {
    jiraAvailability: "not-configured",
    issues: [],
    lastErrorMessage: null,
    lastRefreshedAtEpochMilliseconds: null,
  };
  let currentExpandedProjectIds: Set<PinnedProjectId> = new Set();
  let currentProcrastIdeaFolderMappings: ProcrastIdeaFolderMapping[] = [];
  const filesystemSnapshotByAbsoluteFolderPath = new Map<string, CachedProjectFilesystemSnapshot>();
  const recentClaudeSessionsByAbsoluteFolderPath = new Map<string, ClaudeSessionSummary[]>();

  const widgetProjectsStore = writable<PinnedProjectForWidget[]>([]);
  let inFlightRebuildRequestToken = 0;
  let periodicRefreshIntervalHandle: ReturnType<typeof setInterval> | null = null;

  function buildWidgetProjectsFromCurrentState(): PinnedProjectForWidget[] {
    return currentPinnedProjectsConfig.map((projectConfig) =>
      buildOneProjectForWidget(projectConfig),
    );
  }

  function buildOneProjectForWidget(
    projectConfig: PinnedProjectConfig,
  ): PinnedProjectForWidget {
    const absoluteFolderPath = nodePath.resolve(projectConfig.folderPath);
    const cachedFilesystemSnapshot = filesystemSnapshotByAbsoluteFolderPath.get(absoluteFolderPath) ?? {
      folderExists: false,
      markdownFiles: [],
      goalsFileExists: false,
      openTasks: [],
    };

    const sortedMarkdownFiles = [...cachedFilesystemSnapshot.markdownFiles].sort(
      (leftEntry, rightEntry) =>
        rightEntry.modifiedAtMilliseconds - leftEntry.modifiedAtMilliseconds,
    );

    const mostRecentModifiedTimestamp = sortedMarkdownFiles[0]?.modifiedAtMilliseconds ?? 0;

    const childMarkdownFilesPreview = sortedMarkdownFiles
      .slice(0, CHILD_FILES_PREVIEW_LIMIT)
      .map((entry) => ({
        relativeFilePath: entry.relativeFilePath,
        relativeModifiedTimeLabel: formatRelativeModifiedTime(entry.modifiedAtMilliseconds),
      }));

    const overflowCount = Math.max(
      0,
      sortedMarkdownFiles.length - CHILD_FILES_PREVIEW_LIMIT,
    );

    const pairedContainers = pairContainersToProject(
      currentDockerSnapshot.containers,
      projectConfig,
      absoluteFolderPath,
    );

    const dockerAvailabilityForWidget =
      currentDockerSnapshot.dockerAvailability === "available" ? "available" : "not-installed";

    const storedShellCommandsForWidget = projectConfig.storedShellCommands.map(
      (storedShellCommand, shellCommandIndex) => ({
        shellCommandIndex,
        label: storedShellCommand.label,
        commandLine: storedShellCommand.command,
      }),
    );

    const recentClaudeSessions = recentClaudeSessionsByAbsoluteFolderPath.get(absoluteFolderPath) ?? [];
    const lastClaudeSessionLastActivityAtMilliseconds =
      recentClaudeSessions.length > 0
        ? recentClaudeSessions[0].lastActivityAtMilliseconds
        : null;

    const displayedOpenTasks = cachedFilesystemSnapshot.openTasks.slice(
      0,
      PROJECT_TASK_DISPLAY_LIMIT,
    );
    const openTaskOverflowCount = Math.max(
      0,
      cachedFilesystemSnapshot.openTasks.length - PROJECT_TASK_DISPLAY_LIMIT,
    );

    const procrastOrigin = resolveProcrastOriginForProject(
      projectConfig.folderPath,
      currentProcrastIdeaFolderMappings,
    );

    const jiraProjectKey = projectConfig.jiraProjectKey.trim();
    const jiraIssuesForProject = collectJiraIssuesForProjectKey(
      currentJiraSnapshot,
      jiraProjectKey,
    );
    const jiraOpenIssueCount = jiraIssuesForProject.length;

    return {
      id: projectConfig.id,
      folderPath: projectConfig.folderPath,
      displayName: resolveDisplayNameFor(projectConfig),
      dockerAvailability: dockerAvailabilityForWidget,
      pairedContainers,
      freshnessLevel: classifyFreshnessLevel(mostRecentModifiedTimestamp),
      relativeModifiedTimeLabel:
        mostRecentModifiedTimestamp === 0
          ? cachedFilesystemSnapshot.folderExists
            ? "no edits"
            : "folder missing"
          : formatRelativeModifiedTime(mostRecentModifiedTimestamp),
      markdownFileCount: sortedMarkdownFiles.length,
      childMarkdownFilesPreview,
      childMarkdownFilesOverflowCount: overflowCount,
      storedShellCommands: storedShellCommandsForWidget,
      recentClaudeSessions,
      lastClaudeSessionLastActivityAtMilliseconds,
      goalsFileExists: cachedFilesystemSnapshot.goalsFileExists,
      openTasks: displayedOpenTasks,
      openTaskOverflowCount,
      isExpanded: currentExpandedProjectIds.has(projectConfig.id),
      procrastOrigin,
      jiraProjectKey,
      jiraAvailability: currentJiraSnapshot.jiraAvailability,
      jiraOpenIssueCount,
      jiraIssuesForProject,
    };
  }

  function publishCurrentWidgetSnapshot(): void {
    widgetProjectsStore.set(buildWidgetProjectsFromCurrentState());
  }

  async function rescanAllPinnedProjectFilesystems(): Promise<void> {
    inFlightRebuildRequestToken += 1;
    const localRebuildRequestToken = inFlightRebuildRequestToken;

    const distinctAbsoluteFolderPaths = collectDistinctAbsoluteFolderPaths(
      currentPinnedProjectsConfig,
    );

    const [rescannedFilesystemSnapshots, rescannedClaudeSessionSnapshots] = await Promise.all([
      Promise.all(
        distinctAbsoluteFolderPaths.map(async (absoluteFolderPath) => {
          const filesystemSnapshot = await scanProjectFilesystem(absoluteFolderPath);
          return { absoluteFolderPath, filesystemSnapshot };
        }),
      ),
      Promise.all(
        distinctAbsoluteFolderPaths.map(async (absoluteFolderPath) => {
          const recentClaudeSessions = await readRecentClaudeSessionsForProject(
            absoluteFolderPath,
            RECENT_CLAUDE_SESSIONS_LIMIT_PER_PROJECT,
          );
          return { absoluteFolderPath, recentClaudeSessions };
        }),
      ),
    ]);

    if (localRebuildRequestToken !== inFlightRebuildRequestToken) {
      return;
    }

    filesystemSnapshotByAbsoluteFolderPath.clear();
    for (const { absoluteFolderPath, filesystemSnapshot } of rescannedFilesystemSnapshots) {
      filesystemSnapshotByAbsoluteFolderPath.set(absoluteFolderPath, filesystemSnapshot);
    }
    recentClaudeSessionsByAbsoluteFolderPath.clear();
    for (const { absoluteFolderPath, recentClaudeSessions } of rescannedClaudeSessionSnapshots) {
      recentClaudeSessionsByAbsoluteFolderPath.set(absoluteFolderPath, recentClaudeSessions);
    }
    publishCurrentWidgetSnapshot();
  }

  function setPinnedProjectsConfig(pinnedProjectsConfig: PinnedProjectConfig[]): void {
    currentPinnedProjectsConfig = pinnedProjectsConfig;
    publishCurrentWidgetSnapshot();
    void rescanAllPinnedProjectFilesystems();
  }

  function setDockerSnapshot(dockerSnapshot: DockerSnapshot): void {
    currentDockerSnapshot = dockerSnapshot;
    publishCurrentWidgetSnapshot();
  }

  function setJiraSnapshot(jiraSnapshot: JiraSnapshot): void {
    currentJiraSnapshot = jiraSnapshot;
    publishCurrentWidgetSnapshot();
  }

  function setExpandedProjectIds(expandedProjectIds: Set<PinnedProjectId>): void {
    currentExpandedProjectIds = expandedProjectIds;
    publishCurrentWidgetSnapshot();
  }

  function setProcrastIdeaFolderMappings(
    procrastIdeaFolderMappings: ProcrastIdeaFolderMapping[],
  ): void {
    currentProcrastIdeaFolderMappings = procrastIdeaFolderMappings;
    publishCurrentWidgetSnapshot();
  }

  periodicRefreshIntervalHandle = setInterval(() => {
    void rescanAllPinnedProjectFilesystems();
  }, PERIODIC_FILESYSTEM_REFRESH_MILLISECONDS);

  function destroy(): void {
    if (periodicRefreshIntervalHandle !== null) {
      clearInterval(periodicRefreshIntervalHandle);
      periodicRefreshIntervalHandle = null;
    }
  }

  return {
    store: widgetProjectsStore,
    setPinnedProjectsConfig,
    setDockerSnapshot,
    setJiraSnapshot,
    setExpandedProjectIds,
    setProcrastIdeaFolderMappings,
    destroy,
  };
}

function collectJiraIssuesForProjectKey(
  jiraSnapshot: JiraSnapshot,
  jiraProjectKey: string,
): JiraIssueSummary[] {
  if (jiraProjectKey.length === 0) {
    return [];
  }
  const normalisedProjectKey = jiraProjectKey.toLowerCase();
  return jiraSnapshot.issues.filter(
    (issue) => issue.projectKey.toLowerCase() === normalisedProjectKey,
  );
}

function collectDistinctAbsoluteFolderPaths(
  pinnedProjectsConfig: PinnedProjectConfig[],
): string[] {
  const distinctPaths = new Set<string>();
  for (const projectConfig of pinnedProjectsConfig) {
    const trimmedFolderPath = projectConfig.folderPath.trim();
    if (trimmedFolderPath.length === 0) {
      continue;
    }
    distinctPaths.add(nodePath.resolve(trimmedFolderPath));
  }
  return [...distinctPaths];
}

export async function collectAllOpenTasksForProjectFolder(
  pinnedProjectFolderPath: string,
): Promise<ProjectOpenTaskForWidget[]> {
  const absoluteFolderPath = nodePath.resolve(pinnedProjectFolderPath);
  const filesystemSnapshot = await scanProjectFilesystem(absoluteFolderPath);
  return filesystemSnapshot.openTasks;
}

async function scanProjectFilesystem(
  absoluteFolderPath: string,
): Promise<CachedProjectFilesystemSnapshot> {
  try {
    const folderStatistics = await filesystemPromises.stat(absoluteFolderPath);
    if (!folderStatistics.isDirectory()) {
      return { folderExists: false, markdownFiles: [], goalsFileExists: false, openTasks: [] };
    }
  } catch {
    return { folderExists: false, markdownFiles: [], goalsFileExists: false, openTasks: [] };
  }

  const collectedMarkdownFiles: CachedMarkdownFileEntry[] = [];
  await walkDirectoryCollectingMarkdownFiles(
    absoluteFolderPath,
    "",
    0,
    collectedMarkdownFiles,
  );

  const goalsFileExists = collectedMarkdownFiles.some(
    (markdownFile) =>
      markdownFile.relativeFilePath.toLowerCase() === PROJECT_GOALS_FILE_NAME.toLowerCase(),
  );
  const openTasks = await collectOpenTasksFromProjectMarkdownFiles(collectedMarkdownFiles);

  return { folderExists: true, markdownFiles: collectedMarkdownFiles, goalsFileExists, openTasks };
}

// GOALS.md is the collection sink: its checkboxes are written by "collect tasks" itself, so
// scanning it as a task source would re-ingest collected tasks and accumulate duplicates.
function isProjectGoalsFile(relativeFilePath: string): boolean {
  return (
    nodePath.basename(relativeFilePath).toLowerCase() === PROJECT_GOALS_FILE_NAME.toLowerCase()
  );
}

async function collectOpenTasksFromProjectMarkdownFiles(
  markdownFiles: CachedMarkdownFileEntry[],
): Promise<ProjectOpenTaskForWidget[]> {
  const mostRecentlyModifiedMarkdownFiles = [...markdownFiles]
    .filter((markdownFile) => !isProjectGoalsFile(markdownFile.relativeFilePath))
    .sort((leftEntry, rightEntry) => rightEntry.modifiedAtMilliseconds - leftEntry.modifiedAtMilliseconds)
    .slice(0, PROJECT_TASK_SCAN_FILE_LIMIT);

  const collectedOpenTasks: ProjectOpenTaskForWidget[] = [];
  for (const markdownFile of mostRecentlyModifiedMarkdownFiles) {
    if (collectedOpenTasks.length >= PROJECT_TASK_COLLECTION_LIMIT) {
      break;
    }
    let fileContents: string;
    try {
      fileContents = await filesystemPromises.readFile(markdownFile.absoluteFilePath, "utf8");
    } catch {
      continue;
    }
    for (const lineText of fileContents.split("\n")) {
      const matchedOpenTask = lineText.match(OPEN_TASK_LINE_PATTERN);
      if (!matchedOpenTask) {
        continue;
      }
      const taskText = matchedOpenTask[1].trim();
      if (taskText.length === 0) {
        continue;
      }
      collectedOpenTasks.push({ taskText, relativeFilePath: markdownFile.relativeFilePath });
      if (collectedOpenTasks.length >= PROJECT_TASK_COLLECTION_LIMIT) {
        break;
      }
    }
  }
  return collectedOpenTasks;
}

async function walkDirectoryCollectingMarkdownFiles(
  currentAbsoluteDirectoryPath: string,
  currentRelativeDirectoryPath: string,
  currentRecursionDepth: number,
  collectedMarkdownFiles: CachedMarkdownFileEntry[],
): Promise<void> {
  if (currentRecursionDepth > FILESYSTEM_WALK_MAX_DEPTH) {
    return;
  }

  let directoryEntries;
  try {
    directoryEntries = await filesystemPromises.readdir(currentAbsoluteDirectoryPath, {
      withFileTypes: true,
    });
  } catch {
    return;
  }

  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.name.startsWith(".")) {
      continue;
    }
    if (directoryEntry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(directoryEntry.name)) {
      continue;
    }
    const entryAbsolutePath = nodePath.join(currentAbsoluteDirectoryPath, directoryEntry.name);
    const entryRelativePath =
      currentRelativeDirectoryPath.length === 0
        ? directoryEntry.name
        : `${currentRelativeDirectoryPath}/${directoryEntry.name}`;

    if (directoryEntry.isDirectory()) {
      await walkDirectoryCollectingMarkdownFiles(
        entryAbsolutePath,
        entryRelativePath,
        currentRecursionDepth + 1,
        collectedMarkdownFiles,
      );
      continue;
    }
    if (!directoryEntry.isFile()) {
      continue;
    }
    if (!directoryEntry.name.toLowerCase().endsWith(".md")) {
      continue;
    }
    try {
      const fileStatistics = await filesystemPromises.stat(entryAbsolutePath);
      collectedMarkdownFiles.push({
        absoluteFilePath: entryAbsolutePath,
        relativeFilePath: entryRelativePath,
        modifiedAtMilliseconds: fileStatistics.mtimeMs,
      });
    } catch {
      continue;
    }
  }
}

function resolveDisplayNameFor(projectConfig: PinnedProjectConfig): string {
  const explicitDisplayName = projectConfig.displayName.trim();
  if (explicitDisplayName.length > 0) {
    return explicitDisplayName;
  }
  const trimmedFolderPath = projectConfig.folderPath.trim().replace(/\/+$/, "");
  if (trimmedFolderPath.length === 0) {
    return "";
  }
  return nodePath.basename(trimmedFolderPath);
}

function resolveProcrastOriginForProject(
  projectFolderPath: string,
  procrastIdeaFolderMappings: ProcrastIdeaFolderMapping[],
): ProcrastOriginForWidget | null {
  const projectAbsoluteFolderPath = nodePath.resolve(projectFolderPath);
  const matchedMapping = procrastIdeaFolderMappings.find(
    (mapping) => nodePath.resolve(mapping.targetFolderPath) === projectAbsoluteFolderPath,
  );
  if (matchedMapping === undefined) {
    return null;
  }
  return {
    ideaUuid: matchedMapping.ideaUuid,
    ideaTitle: matchedMapping.ideaTitle,
    createdAt: matchedMapping.createdAt,
  };
}

function classifyFreshnessLevel(mostRecentModifiedTimestamp: number): FreshnessLevel {
  if (mostRecentModifiedTimestamp === 0) {
    return "cold";
  }
  const elapsedMilliseconds = Date.now() - mostRecentModifiedTimestamp;
  const elapsedDays = elapsedMilliseconds / ONE_DAY_IN_MILLISECONDS;
  if (elapsedDays < FRESHNESS_ACTIVE_DAY_THRESHOLD) {
    return "active";
  }
  if (elapsedDays < FRESHNESS_COOLING_DAY_THRESHOLD) {
    return "cooling";
  }
  return "cold";
}

function pairContainersToProject(
  allRunningContainers: DockerContainerSummary[],
  projectConfig: PinnedProjectConfig,
  absoluteFolderPath: string,
): PairedContainerForWidget[] {
  const manualNameAllowList = new Set(
    projectConfig.manuallyAssignedContainerNames.map((name) => name.toLowerCase()),
  );
  const lowercaseAbsoluteFolderPath = absoluteFolderPath.toLowerCase();
  const folderBasenameLowercase = nodePath.basename(absoluteFolderPath).toLowerCase();

  const pairedContainers: PairedContainerForWidget[] = [];

  for (const container of allRunningContainers) {
    const isManuallyAssigned = manualNameAllowList.has(container.containerName.toLowerCase());
    const autoPairedByExactComposeWorkingDirectoryMatch =
      container.composeProjectWorkingDirectoryAbsolutePath !== null &&
      container.composeProjectWorkingDirectoryAbsolutePath.toLowerCase() ===
        lowercaseAbsoluteFolderPath;
    const autoPairedByComposeWorkingDirectoryAncestorMatch =
      container.composeProjectWorkingDirectoryAbsolutePath !== null &&
      container.composeProjectWorkingDirectoryAbsolutePath
        .toLowerCase()
        .startsWith(`${lowercaseAbsoluteFolderPath}/`);
    const autoPairedByComposeProjectNameMatch =
      container.composeProjectName !== null &&
      container.composeProjectName.toLowerCase() === folderBasenameLowercase;

    if (
      !isManuallyAssigned &&
      !autoPairedByExactComposeWorkingDirectoryMatch &&
      !autoPairedByComposeWorkingDirectoryAncestorMatch &&
      !autoPairedByComposeProjectNameMatch
    ) {
      continue;
    }

    pairedContainers.push({
      containerName: container.containerName,
      imageReference: container.imageReference,
      containerStatus: container.runtimeStatus,
      upTimeLabel: container.upTimeLabel,
      exposedPortLabel: container.exposedPortLabel,
    });
  }

  return pairedContainers;
}
