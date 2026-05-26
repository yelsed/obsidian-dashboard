import type { App, EventRef, TFile } from "obsidian";
import { writable, type Readable } from "svelte/store";
import { debounce } from "./format";
import { isFilePathWithinFolderScopes, type FolderPath } from "../settings";

export type OpenTask = {
  taskContent: string;
  sourceFolderName: string;
  sourceFilePath: string;
  sourceLineNumber: number;
};

export type OpenTasksSnapshot = {
  openTasks: OpenTask[];
  totalOpenTaskCount: number;
  tasksCreatedTodayCount: number;
  todayDailyNoteLabel: string;
  todayDailyNoteExists: boolean;
};

export type OpenTasksStore = {
  store: Readable<OpenTasksSnapshot>;
  setFolderScopes: (folderScopes: FolderPath[]) => void;
  destroy: () => void;
};

const VISIBLE_TASK_COUNT = 5;
const RECENT_FILES_SCANNED_FOR_TASKS = 200;
const VAULT_EVENT_DEBOUNCE_MILLISECONDS = 400;
export const OPEN_TASK_LINE_PATTERN = /^[\s>]*[-*+]\s*\[\s\]\s*(.*)$/;

export function createOpenTasksStore(
  obsidianApplication: App,
  initialFolderScopes: FolderPath[] = [],
): OpenTasksStore {
  let currentFolderScopes: FolderPath[] = initialFolderScopes;

  const snapshotStore = writable<OpenTasksSnapshot>({
    openTasks: [],
    totalOpenTaskCount: 0,
    tasksCreatedTodayCount: 0,
    todayDailyNoteLabel: formatDailyNoteLabelForToday(),
    todayDailyNoteExists: false,
  });

  let isBuildingSnapshot = false;

  async function rebuildSnapshot(): Promise<void> {
    if (isBuildingSnapshot) {
      return;
    }
    isBuildingSnapshot = true;
    try {
      const snapshot = await buildSnapshot(obsidianApplication, currentFolderScopes);
      snapshotStore.set(snapshot);
    } finally {
      isBuildingSnapshot = false;
    }
  }

  const refreshSnapshotDebounced = debounce(() => {
    void rebuildSnapshot();
  }, VAULT_EVENT_DEBOUNCE_MILLISECONDS);

  void rebuildSnapshot();

  const registeredEventReferences: EventRef[] = [
    obsidianApplication.vault.on("modify", refreshSnapshotDebounced),
    obsidianApplication.vault.on("create", refreshSnapshotDebounced),
    obsidianApplication.vault.on("delete", refreshSnapshotDebounced),
    obsidianApplication.vault.on("rename", refreshSnapshotDebounced),
  ];

  function setFolderScopes(nextFolderScopes: FolderPath[]): void {
    currentFolderScopes = nextFolderScopes;
    void rebuildSnapshot();
  }

  function destroy(): void {
    refreshSnapshotDebounced.cancel();
    for (const eventReference of registeredEventReferences) {
      obsidianApplication.vault.offref(eventReference);
    }
  }

  return { store: snapshotStore, setFolderScopes, destroy };
}

async function buildSnapshot(
  obsidianApplication: App,
  folderScopes: FolderPath[],
): Promise<OpenTasksSnapshot> {
  const startOfTodayTimestamp = startOfTodayMilliseconds();
  const todayLabel = formatDailyNoteLabelForToday();
  const todayDailyNoteFile =
    obsidianApplication.vault
      .getMarkdownFiles()
      .find((file: TFile) => file.basename === todayLabel.replace(/\s+daily$/, "")) ?? null;
  const todayDailyNoteExists = todayDailyNoteFile !== null;

  const candidateFiles = collectTaskCandidateFiles(
    obsidianApplication.vault.getMarkdownFiles(),
    folderScopes,
    todayDailyNoteFile,
  );

  const collectedOpenTasks: OpenTask[] = [];
  let tasksCreatedTodayCount = 0;

  for (const file of candidateFiles) {
    const fileContents = await obsidianApplication.vault.read(file);
    const fileContentLines = fileContents.split("\n");
    const folderName = file.parent?.name ?? "";

    for (const [sourceLineNumber, lineText] of fileContentLines.entries()) {
      const matchedTaskContent = lineText.match(OPEN_TASK_LINE_PATTERN);
      if (!matchedTaskContent) {
        continue;
      }
      const taskContent = matchedTaskContent[1].trim();
      if (taskContent.length === 0) {
        continue;
      }

      collectedOpenTasks.push({
        taskContent,
        sourceFolderName: folderName,
        sourceFilePath: file.path,
        sourceLineNumber,
      });

      if (file.stat.mtime >= startOfTodayTimestamp) {
        tasksCreatedTodayCount++;
      }
    }
  }

  collectedOpenTasks.sort((leftTask, rightTask) => {
    const leftFile = obsidianApplication.vault.getAbstractFileByPath(leftTask.sourceFilePath);
    const rightFile = obsidianApplication.vault.getAbstractFileByPath(rightTask.sourceFilePath);
    const leftModifiedTime = leftFile && "stat" in leftFile ? (leftFile as TFile).stat.mtime : 0;
    const rightModifiedTime = rightFile && "stat" in rightFile ? (rightFile as TFile).stat.mtime : 0;
    return rightModifiedTime - leftModifiedTime;
  });

  return {
    openTasks: collectedOpenTasks.slice(0, VISIBLE_TASK_COUNT),
    totalOpenTaskCount: collectedOpenTasks.length,
    tasksCreatedTodayCount,
    todayDailyNoteLabel: todayLabel,
    todayDailyNoteExists,
  };
}

function collectTaskCandidateFiles(
  markdownFiles: TFile[],
  folderScopes: FolderPath[],
  todayDailyNoteFile: TFile | null,
): TFile[] {
  const candidateFiles = markdownFiles
    .filter((file: TFile) => isFilePathWithinFolderScopes(file.path, folderScopes))
    .sort((leftFile, rightFile) => rightFile.stat.mtime - leftFile.stat.mtime)
    .slice(0, RECENT_FILES_SCANNED_FOR_TASKS);

  if (
    todayDailyNoteFile !== null &&
    !candidateFiles.some((file) => file.path === todayDailyNoteFile.path)
  ) {
    candidateFiles.unshift(todayDailyNoteFile);
  }

  return candidateFiles;
}

function startOfTodayMilliseconds(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

export function formatDailyNoteBasenameForDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDailyNoteLabelForToday(): string {
  return `${formatDailyNoteBasenameForDate(new Date())} daily`;
}
