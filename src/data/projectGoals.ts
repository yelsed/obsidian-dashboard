import { promises as filesystemPromises } from "fs";
import nodePath from "path";
import { TFile, type App } from "obsidian";
import { resolveVaultRelativeFilePathIfWithinVault } from "./vaultFilePaths";
import type { ProjectOpenTaskForWidget } from "./pinnedProjects";

export const PROJECT_GOALS_FILE_NAME = "GOALS.md";
export const PROJECT_GOALS_FILE_TEMPLATE = "# Goals\n\n- \n";

const COLLECTED_OPEN_TASKS_HEADING_PATTERN = /^## Open tasks \(collected /m;

export function resolveProjectGoalsFilePath(pinnedProjectFolderPath: string): string {
  return nodePath.resolve(pinnedProjectFolderPath, PROJECT_GOALS_FILE_NAME);
}

export function buildProjectGoalsPlanningPrompt(projectGoalsMarkdown: string): string {
  return `Here are the goals from GOALS.md:\n\n---\n${projectGoalsMarkdown}\n---\n\nPlease make a plan to accomplish these goals.`;
}

export function buildCollectedOpenTasksSectionMarkdown(
  collectedOpenTasks: ProjectOpenTaskForWidget[],
  collectedOnIsoDate: string,
): string {
  const taskLines = collectedOpenTasks.map(
    (openTask) => `- [ ] ${openTask.taskText}  (${openTask.relativeFilePath})`,
  );
  return `## Open tasks (collected ${collectedOnIsoDate})\n${taskLines.join("\n")}\n`;
}

// The collected section is rewritten in place on every run rather than appended, so collecting
// twice on the same day does not leave two competing lists behind.
export function mergeCollectedTasksSectionIntoGoalsMarkdown(
  existingGoalsMarkdown: string,
  collectedTasksSectionMarkdown: string,
): string {
  const headingMatch = existingGoalsMarkdown.match(COLLECTED_OPEN_TASKS_HEADING_PATTERN);
  if (headingMatch === null || headingMatch.index === undefined) {
    const trimmedExisting = existingGoalsMarkdown.replace(/\s*$/, "");
    const leadingSeparator = trimmedExisting.length === 0 ? "" : "\n\n";
    return `${trimmedExisting}${leadingSeparator}${collectedTasksSectionMarkdown}`;
  }

  const markdownBeforeSection = existingGoalsMarkdown.slice(0, headingMatch.index);
  const markdownFromSectionStart = existingGoalsMarkdown.slice(headingMatch.index);
  const markdownAfterCollectedHeadingPrefix = markdownFromSectionStart.slice(
    headingMatch[0].length,
  );
  const nextHeadingMatch = markdownAfterCollectedHeadingPrefix.match(/^## /m);
  const markdownAfterSection =
    nextHeadingMatch === null || nextHeadingMatch.index === undefined
      ? ""
      : markdownAfterCollectedHeadingPrefix.slice(nextHeadingMatch.index);

  const trimmedBefore = markdownBeforeSection.replace(/\s*$/, "");
  const leadingSeparator = trimmedBefore.length === 0 ? "" : "\n\n";
  const trailingBlock = markdownAfterSection.length === 0 ? "" : `\n${markdownAfterSection}`;
  return `${trimmedBefore}${leadingSeparator}${collectedTasksSectionMarkdown}${trailingBlock}`;
}

export async function readExistingProjectGoalsMarkdownOrTemplate(
  absoluteGoalsFilePath: string,
): Promise<string> {
  try {
    return await filesystemPromises.readFile(absoluteGoalsFilePath, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return PROJECT_GOALS_FILE_TEMPLATE;
    }
    throw error;
  }
}

// A project folder inside the vault must be written through Obsidian's own vault API, or the
// metadata cache keeps serving the file as it was before the write.
export async function writeProjectGoalsMarkdown(
  obsidianApplication: App,
  absoluteGoalsFilePath: string,
  goalsMarkdown: string,
): Promise<boolean> {
  const vaultRelativeGoalsFilePath = resolveVaultRelativeFilePathIfWithinVault(
    obsidianApplication,
    absoluteGoalsFilePath,
  );

  if (vaultRelativeGoalsFilePath !== null) {
    try {
      const existingGoalsFile = obsidianApplication.vault.getAbstractFileByPath(
        vaultRelativeGoalsFilePath,
      );
      if (existingGoalsFile instanceof TFile) {
        await obsidianApplication.vault.modify(existingGoalsFile, goalsMarkdown);
      } else {
        await obsidianApplication.vault.create(vaultRelativeGoalsFilePath, goalsMarkdown);
      }
      return true;
    } catch {
      return false;
    }
  }

  try {
    await filesystemPromises.writeFile(absoluteGoalsFilePath, goalsMarkdown, {
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

export function isFileAlreadyExistsError(error: unknown): boolean {
  return isErrorWithCode(error, "EEXIST");
}

export function isFileNotFoundError(error: unknown): boolean {
  return isErrorWithCode(error, "ENOENT");
}

function isErrorWithCode(error: unknown, expectedCode: string): boolean {
  return (
    error !== null && typeof error === "object" && "code" in error && error.code === expectedCode
  );
}
