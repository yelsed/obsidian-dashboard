import type { App, EventRef, TFile } from "obsidian";
import { writable, type Readable } from "svelte/store";
import { debounce } from "./format";
import { OPEN_TASK_LINE_PATTERN, formatDailyNoteBasenameForDate } from "./tasks";
import { isFilePathWithinFolderScopes, type FolderPath } from "../settings";

export type TouchedFile = {
  fileName: string;
  filePath: string;
};

export type TodayRecapSnapshot = {
  createdTodayFiles: TouchedFile[];
  createdTodayCount: number;
  editedTodayFiles: TouchedFile[];
  editedTodayCount: number;
  dayStreakLength: number;
  nextWorkdayBasename: string;
  nextWorkdayHeadingLabel: string;
  nextWorkdayNoteExists: boolean;
  nextWorkdayQueuedTasks: string[];
};

export type TodayRecapStore = {
  store: Readable<TodayRecapSnapshot>;
  setFolderScopes: (folderScopes: FolderPath[]) => void;
  destroy: () => void;
};

const FILE_LIST_DISPLAY_LIMIT = 6;
const VAULT_EVENT_DEBOUNCE_MILLISECONDS = 250;

export function createTodayRecapStore(
  obsidianApplication: App,
  initialFolderScopes: FolderPath[] = [],
): TodayRecapStore {
  let currentFolderScopes: FolderPath[] = initialFolderScopes;

  const snapshotStore = writable<TodayRecapSnapshot>(buildSkeletonSnapshot());

  function refreshSnapshot(): void {
    void buildSnapshot(obsidianApplication, currentFolderScopes).then((snapshot) => {
      snapshotStore.set(snapshot);
    });
  }

  const refreshSnapshotDebounced = debounce(
    refreshSnapshot,
    VAULT_EVENT_DEBOUNCE_MILLISECONDS,
  );

  const registeredEventReferences: EventRef[] = [
    obsidianApplication.vault.on("modify", refreshSnapshotDebounced),
    obsidianApplication.vault.on("create", refreshSnapshotDebounced),
    obsidianApplication.vault.on("delete", refreshSnapshotDebounced),
    obsidianApplication.vault.on("rename", refreshSnapshotDebounced),
  ];

  refreshSnapshot();

  function setFolderScopes(nextFolderScopes: FolderPath[]): void {
    currentFolderScopes = nextFolderScopes;
    refreshSnapshot();
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
): Promise<TodayRecapSnapshot> {
  const startOfTodayTimestamp = startOfTodayMilliseconds();
  const inScopeMarkdownFiles = obsidianApplication.vault
    .getMarkdownFiles()
    .filter((file: TFile) => isFilePathWithinFolderScopes(file.path, folderScopes));

  const createdTodayFiles = inScopeMarkdownFiles
    .filter((file: TFile) => file.stat.ctime >= startOfTodayTimestamp)
    .sort((leftFile, rightFile) => rightFile.stat.ctime - leftFile.stat.ctime);

  const editedTodayFiles = inScopeMarkdownFiles
    .filter(
      (file: TFile) =>
        file.stat.mtime >= startOfTodayTimestamp &&
        file.stat.ctime < startOfTodayTimestamp,
    )
    .sort((leftFile, rightFile) => rightFile.stat.mtime - leftFile.stat.mtime);

  const nextWorkdayDate = computeNextWorkdayDate(new Date());
  const nextWorkdayBasename = formatDailyNoteBasenameForDate(nextWorkdayDate);
  const nextWorkdayNoteFile = findMarkdownFileByBasename(
    obsidianApplication,
    nextWorkdayBasename,
  );

  return {
    createdTodayFiles: toDisplayFiles(createdTodayFiles),
    createdTodayCount: createdTodayFiles.length,
    editedTodayFiles: toDisplayFiles(editedTodayFiles),
    editedTodayCount: editedTodayFiles.length,
    dayStreakLength: computeDayStreakLength(collectActivityDayKeys(inScopeMarkdownFiles)),
    nextWorkdayBasename,
    nextWorkdayHeadingLabel: formatNextWorkdayHeadingLabel(nextWorkdayDate),
    nextWorkdayNoteExists: nextWorkdayNoteFile !== null,
    nextWorkdayQueuedTasks:
      nextWorkdayNoteFile === null
        ? []
        : await readOpenTasksFromNote(obsidianApplication, nextWorkdayNoteFile),
  };
}

function buildSkeletonSnapshot(): TodayRecapSnapshot {
  const nextWorkdayDate = computeNextWorkdayDate(new Date());
  return {
    createdTodayFiles: [],
    createdTodayCount: 0,
    editedTodayFiles: [],
    editedTodayCount: 0,
    dayStreakLength: 0,
    nextWorkdayBasename: formatDailyNoteBasenameForDate(nextWorkdayDate),
    nextWorkdayHeadingLabel: formatNextWorkdayHeadingLabel(nextWorkdayDate),
    nextWorkdayNoteExists: false,
    nextWorkdayQueuedTasks: [],
  };
}

function toDisplayFiles(files: TFile[]): TouchedFile[] {
  return files
    .slice(0, FILE_LIST_DISPLAY_LIMIT)
    .map((file) => ({ fileName: file.basename, filePath: file.path }));
}

function collectActivityDayKeys(files: TFile[]): Set<string> {
  const activityDayKeys = new Set<string>();
  for (const file of files) {
    activityDayKeys.add(formatDailyNoteBasenameForDate(new Date(file.stat.mtime)));
  }
  return activityDayKeys;
}

function computeDayStreakLength(activityDayKeys: Set<string>): number {
  const cursorDate = new Date();
  cursorDate.setHours(0, 0, 0, 0);

  // An in-progress day with no edits yet should not break a run — start counting
  // from yesterday when today has no activity.
  if (!activityDayKeys.has(formatDailyNoteBasenameForDate(cursorDate))) {
    cursorDate.setDate(cursorDate.getDate() - 1);
  }

  let streakLength = 0;
  while (activityDayKeys.has(formatDailyNoteBasenameForDate(cursorDate))) {
    streakLength++;
    cursorDate.setDate(cursorDate.getDate() - 1);
  }
  return streakLength;
}

function computeNextWorkdayDate(fromDate: Date): Date {
  const nextWorkdayDate = new Date(fromDate);
  nextWorkdayDate.setHours(0, 0, 0, 0);
  nextWorkdayDate.setDate(nextWorkdayDate.getDate() + 1);
  while (isWeekend(nextWorkdayDate)) {
    nextWorkdayDate.setDate(nextWorkdayDate.getDate() + 1);
  }
  return nextWorkdayDate;
}

function isWeekend(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function formatNextWorkdayHeadingLabel(date: Date): string {
  const weekdayLabel = date.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekdayLabel} ${formatDailyNoteBasenameForDate(date)}`;
}

function findMarkdownFileByBasename(
  obsidianApplication: App,
  basename: string,
): TFile | null {
  return (
    obsidianApplication.vault
      .getMarkdownFiles()
      .find((file: TFile) => file.basename === basename) ?? null
  );
}

async function readOpenTasksFromNote(
  obsidianApplication: App,
  noteFile: TFile,
): Promise<string[]> {
  const noteContents = await obsidianApplication.vault.cachedRead(noteFile);
  const openTasks: string[] = [];
  for (const lineText of noteContents.split("\n")) {
    const matchedTask = lineText.match(OPEN_TASK_LINE_PATTERN);
    if (matchedTask === null) {
      continue;
    }
    const taskContent = matchedTask[1].trim();
    if (taskContent.length > 0) {
      openTasks.push(taskContent);
    }
  }
  return openTasks;
}

function startOfTodayMilliseconds(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}
