import { TFile, type App, type EventRef } from "obsidian";
import { writable, type Readable } from "svelte/store";
import { debounce } from "./format";
import { OPEN_TASK_LINE_PATTERN } from "./tasks";
import {
  buildDailyNotePathForDate,
  formatDailyNoteBasenameForDate,
  type DayOfWeekIndex,
  type FolderPath,
} from "../settings";

export type NextWorkdaySnapshot = {
  todayIsWorkingDay: boolean;
  nextWorkdayBasename: string;
  nextWorkdayHeadingLabel: string;
  nextWorkdayNoteExists: boolean;
  nextWorkdayQueuedTasks: string[];
};

export type NextWorkdayStore = {
  store: Readable<NextWorkdaySnapshot>;
  refresh: () => void;
  setDailyNoteFolderPath: (dailyNoteFolderPath: FolderPath) => void;
  setWorkingDayIndices: (workingDayIndices: DayOfWeekIndex[]) => void;
  destroy: () => void;
};

const VAULT_EVENT_DEBOUNCE_MILLISECONDS = 250;

export function createNextWorkdayStore(
  obsidianApplication: App,
  initialDailyNoteFolderPath: FolderPath = "",
  initialWorkingDayIndices: DayOfWeekIndex[] = [],
): NextWorkdayStore {
  let currentDailyNoteFolderPath: FolderPath = initialDailyNoteFolderPath;
  let currentWorkingDayIndices: DayOfWeekIndex[] = initialWorkingDayIndices;

  const snapshotStore = writable<NextWorkdaySnapshot>(
    buildSkeletonSnapshot(currentWorkingDayIndices),
  );

  function refreshSnapshot(): void {
    void buildSnapshot(
      obsidianApplication,
      currentDailyNoteFolderPath,
      currentWorkingDayIndices,
    ).then((snapshot) => {
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

  function setDailyNoteFolderPath(nextDailyNoteFolderPath: FolderPath): void {
    currentDailyNoteFolderPath = nextDailyNoteFolderPath;
    refreshSnapshot();
  }

  function setWorkingDayIndices(nextWorkingDayIndices: DayOfWeekIndex[]): void {
    currentWorkingDayIndices = nextWorkingDayIndices;
    refreshSnapshot();
  }

  function destroy(): void {
    refreshSnapshotDebounced.cancel();
    for (const eventReference of registeredEventReferences) {
      obsidianApplication.vault.offref(eventReference);
    }
  }

  return {
    store: snapshotStore,
    refresh: refreshSnapshot,
    setDailyNoteFolderPath,
    setWorkingDayIndices,
    destroy,
  };
}

async function buildSnapshot(
  obsidianApplication: App,
  dailyNoteFolderPath: FolderPath,
  workingDayIndices: DayOfWeekIndex[],
): Promise<NextWorkdaySnapshot> {
  const nextWorkdayDate = computeNextWorkdayDate(new Date(), workingDayIndices);
  const nextWorkdayNoteFile = resolveDailyNoteFile(
    obsidianApplication,
    dailyNoteFolderPath,
    nextWorkdayDate,
  );

  return {
    todayIsWorkingDay: determineTodayIsWorkingDay(workingDayIndices),
    nextWorkdayBasename: formatDailyNoteBasenameForDate(nextWorkdayDate),
    nextWorkdayHeadingLabel: formatNextWorkdayHeadingLabel(nextWorkdayDate),
    nextWorkdayNoteExists: nextWorkdayNoteFile !== null,
    nextWorkdayQueuedTasks:
      nextWorkdayNoteFile === null
        ? []
        : await readOpenTasksFromNote(obsidianApplication, nextWorkdayNoteFile),
  };
}

function buildSkeletonSnapshot(workingDayIndices: DayOfWeekIndex[]): NextWorkdaySnapshot {
  const nextWorkdayDate = computeNextWorkdayDate(new Date(), workingDayIndices);
  return {
    todayIsWorkingDay: determineTodayIsWorkingDay(workingDayIndices),
    nextWorkdayBasename: formatDailyNoteBasenameForDate(nextWorkdayDate),
    nextWorkdayHeadingLabel: formatNextWorkdayHeadingLabel(nextWorkdayDate),
    nextWorkdayNoteExists: false,
    nextWorkdayQueuedTasks: [],
  };
}

function determineTodayIsWorkingDay(workingDayIndices: DayOfWeekIndex[]): boolean {
  // No configured working days means no restriction — treat today as working.
  return (
    workingDayIndices.length === 0 || workingDayIndices.includes(new Date().getDay())
  );
}

const MAXIMUM_DAYS_TO_SCAN_FOR_NEXT_WORKDAY = 7;

function computeNextWorkdayDate(fromDate: Date, workingDayIndices: DayOfWeekIndex[]): Date {
  const nextWorkdayDate = new Date(fromDate);
  nextWorkdayDate.setHours(0, 0, 0, 0);
  nextWorkdayDate.setDate(nextWorkdayDate.getDate() + 1);

  // No configured working days means "next workday" cannot be defined, so fall back to
  // tomorrow rather than looping forever.
  if (workingDayIndices.length === 0) {
    return nextWorkdayDate;
  }

  for (let dayOffset = 0; dayOffset < MAXIMUM_DAYS_TO_SCAN_FOR_NEXT_WORKDAY; dayOffset++) {
    if (workingDayIndices.includes(nextWorkdayDate.getDay())) {
      return nextWorkdayDate;
    }
    nextWorkdayDate.setDate(nextWorkdayDate.getDate() + 1);
  }
  return nextWorkdayDate;
}

function formatNextWorkdayHeadingLabel(date: Date): string {
  const weekdayLabel = date.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekdayLabel} ${formatDailyNoteBasenameForDate(date)}`;
}

function resolveDailyNoteFile(
  obsidianApplication: App,
  dailyNoteFolderPath: FolderPath,
  date: Date,
): TFile | null {
  const dailyNotePath = buildDailyNotePathForDate(dailyNoteFolderPath, date);
  const resolvedFile = obsidianApplication.vault.getAbstractFileByPath(dailyNotePath);
  return resolvedFile instanceof TFile ? resolvedFile : null;
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
