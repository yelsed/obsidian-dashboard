import { TFile, type App } from "obsidian";
import { OPEN_TASK_LINE_PATTERN } from "./tasks";
import {
  buildDailyNotePathForBasename,
  formatDailyNoteBasenameForDate,
  normaliseFolderScope,
  type DayOfWeekIndex,
  type FolderPath,
} from "../settings";

export type RolloverResult = {
  migratedTaskCount: number;
  destinationDailyNoteBasename: string;
  destinationIsToday: boolean;
};

const DAILY_NOTE_BASENAME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAXIMUM_DAYS_TO_SCAN_FOR_WORKING_DAY = 7;

export async function rollOverOpenTasksIntoCurrentDailyNote(
  obsidianApplication: App,
  dailyNoteFolderPath: FolderPath,
  workingDayIndices: DayOfWeekIndex[],
): Promise<RolloverResult> {
  const startOfTodayTimestamp = startOfTodayMilliseconds();
  const destinationDate = resolveRolloverDestinationDate(new Date(), workingDayIndices);
  const destinationDailyNoteBasename = formatDailyNoteBasenameForDate(destinationDate);
  const destinationIsToday = destinationDate.getTime() === startOfTodayTimestamp;
  const destinationPath = buildDailyNotePathForBasename(
    dailyNoteFolderPath,
    destinationDailyNoteBasename,
  );

  const overduePastDailyNotes = collectOverduePastDailyNotes(
    obsidianApplication,
    dailyNoteFolderPath,
    destinationPath,
    startOfTodayTimestamp,
  );
  if (overduePastDailyNotes.length === 0) {
    return { migratedTaskCount: 0, destinationDailyNoteBasename, destinationIsToday };
  }

  const destinationFile = resolveExistingFile(obsidianApplication, destinationPath);
  const destinationContents =
    destinationFile === null ? "" : await obsidianApplication.vault.read(destinationFile);
  const alreadyPresentTaskContents = new Set<string>(extractOpenTaskContents(destinationContents));

  const taskLinesToAppend: string[] = [];

  for (const sourceDailyNote of overduePastDailyNotes) {
    const sourceContents = await obsidianApplication.vault.read(sourceDailyNote);
    const sourceLines = sourceContents.split("\n");
    let sourceWasModified = false;

    for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
      const matchedOpenTask = sourceLines[lineIndex].match(OPEN_TASK_LINE_PATTERN);
      if (matchedOpenTask === null) {
        continue;
      }
      const taskContent = matchedOpenTask[1].trim();
      if (taskContent.length === 0) {
        continue;
      }

      if (!alreadyPresentTaskContents.has(taskContent)) {
        alreadyPresentTaskContents.add(taskContent);
        taskLinesToAppend.push(`- [ ] ${taskContent}`);
      }
      sourceLines[lineIndex] = markTaskLineAsMigrated(sourceLines[lineIndex]);
      sourceWasModified = true;
    }

    if (sourceWasModified) {
      await obsidianApplication.vault.modify(sourceDailyNote, sourceLines.join("\n"));
    }
  }

  if (taskLinesToAppend.length === 0) {
    return { migratedTaskCount: 0, destinationDailyNoteBasename, destinationIsToday };
  }

  const migratedTasksBlock = taskLinesToAppend.join("\n");
  if (destinationFile === null) {
    await ensureDailyNoteParentFolderExists(obsidianApplication, destinationPath);
    await obsidianApplication.vault.create(destinationPath, `${migratedTasksBlock}\n`);
  } else {
    const blockSeparator =
      destinationContents.length === 0 || destinationContents.endsWith("\n") ? "" : "\n";
    await obsidianApplication.vault.modify(
      destinationFile,
      `${destinationContents}${blockSeparator}${migratedTasksBlock}\n`,
    );
  }

  return {
    migratedTaskCount: taskLinesToAppend.length,
    destinationDailyNoteBasename,
    destinationIsToday,
  };
}

function collectOverduePastDailyNotes(
  obsidianApplication: App,
  dailyNoteFolderPath: FolderPath,
  destinationPath: string,
  startOfTodayTimestamp: number,
): TFile[] {
  const normalisedFolder = normaliseFolderScope(dailyNoteFolderPath);

  return obsidianApplication.vault
    .getMarkdownFiles()
    .filter((file) => {
      if (file.path === destinationPath) {
        return false;
      }
      const expectedPath = buildDailyNotePathForBasename(normalisedFolder, file.basename);
      if (file.path !== expectedPath) {
        return false;
      }
      const matchedDate = file.basename.match(DAILY_NOTE_BASENAME_PATTERN);
      if (matchedDate === null) {
        return false;
      }
      const noteDate = new Date(
        Number(matchedDate[1]),
        Number(matchedDate[2]) - 1,
        Number(matchedDate[3]),
      );
      return noteDate.getTime() < startOfTodayTimestamp;
    })
    .sort((leftFile, rightFile) => leftFile.basename.localeCompare(rightFile.basename));
}

function extractOpenTaskContents(noteContents: string): string[] {
  const openTaskContents: string[] = [];
  for (const lineText of noteContents.split("\n")) {
    const matchedOpenTask = lineText.match(OPEN_TASK_LINE_PATTERN);
    if (matchedOpenTask === null) {
      continue;
    }
    const taskContent = matchedOpenTask[1].trim();
    if (taskContent.length > 0) {
      openTaskContents.push(taskContent);
    }
  }
  return openTaskContents;
}

// Rewrites the checkbox of an open task line ("[ ]") to the Obsidian "migrated" marker
// ("[>]") so it no longer counts as open while keeping a record on the original day.
function markTaskLineAsMigrated(taskLine: string): string {
  return taskLine.replace(/\[\s\]/, "[>]");
}

function resolveRolloverDestinationDate(
  fromDate: Date,
  workingDayIndices: DayOfWeekIndex[],
): Date {
  const destinationDate = new Date(fromDate);
  destinationDate.setHours(0, 0, 0, 0);

  if (workingDayIndices.length === 0) {
    return destinationDate;
  }

  for (let dayOffset = 0; dayOffset < MAXIMUM_DAYS_TO_SCAN_FOR_WORKING_DAY; dayOffset++) {
    if (workingDayIndices.includes(destinationDate.getDay())) {
      return destinationDate;
    }
    destinationDate.setDate(destinationDate.getDate() + 1);
  }
  return destinationDate;
}

function resolveExistingFile(obsidianApplication: App, filePath: string): TFile | null {
  const resolvedFile = obsidianApplication.vault.getAbstractFileByPath(filePath);
  return resolvedFile instanceof TFile ? resolvedFile : null;
}

async function ensureDailyNoteParentFolderExists(
  obsidianApplication: App,
  dailyNotePath: string,
): Promise<void> {
  const lastSlashIndex = dailyNotePath.lastIndexOf("/");
  if (lastSlashIndex <= 0) {
    return;
  }
  const parentFolderPath = dailyNotePath.slice(0, lastSlashIndex);
  if (obsidianApplication.vault.getAbstractFileByPath(parentFolderPath) !== null) {
    return;
  }
  try {
    await obsidianApplication.vault.createFolder(parentFolderPath);
  } catch {
    // A concurrent create (or a folder Obsidian had not yet indexed) is harmless; the
    // subsequent file write is what actually matters.
  }
}

function startOfTodayMilliseconds(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}
