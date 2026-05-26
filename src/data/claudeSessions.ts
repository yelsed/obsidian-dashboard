import { promises as filesystemPromises, createReadStream } from "fs";
import nodePath from "path";
import nodeOs from "os";
import { createInterface } from "readline";
import { truncateToCharacterBudget } from "./format";

export type ClaudeSessionSummary = {
  sessionId: string;
  slug: string;
  latestAiTitle: string;
  topicTitleArc: string[];
  lastActivityAtMilliseconds: number;
  firstUserPromptPreview: string;
  lastUserPromptPreview: string;
  editedFileBaseNames: string[];
  editedFileTotalCount: number;
  totalMessageCount: number;
  gitBranch: string | null;
};

const USER_PROMPT_PREVIEW_CHARACTER_BUDGET = 200;
const JSONL_HEAD_READ_BYTE_BUDGET = 32 * 1024;
const JSONL_TAIL_READ_BYTE_BUDGET = 64 * 1024;
const MAXIMUM_EDITED_FILE_BASENAMES_SHOWN = 4;
const FILE_EDITING_TOOL_NAMES: ReadonlySet<string> = new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
]);

export function encodeAbsolutePathToClaudeProjectDirName(
  absoluteFolderPath: string,
): string {
  const trimmedPath = absoluteFolderPath.trim().replace(/\/+$/, "");
  if (trimmedPath.length === 0) {
    return "";
  }
  return trimmedPath.replace(/\//g, "-");
}

export function resolveClaudeProjectsRootDirectory(): string {
  return nodePath.join(nodeOs.homedir(), ".claude", "projects");
}

export async function readRecentClaudeSessionsForProject(
  absoluteFolderPath: string,
  maximumSessionCount: number,
): Promise<ClaudeSessionSummary[]> {
  const encodedProjectDirName = encodeAbsolutePathToClaudeProjectDirName(absoluteFolderPath);
  if (encodedProjectDirName.length === 0) {
    return [];
  }
  const claudeProjectDirectoryAbsolutePath = nodePath.join(
    resolveClaudeProjectsRootDirectory(),
    encodedProjectDirName,
  );

  let directoryEntries;
  try {
    directoryEntries = await filesystemPromises.readdir(
      claudeProjectDirectoryAbsolutePath,
      { withFileTypes: true },
    );
  } catch {
    return [];
  }

  const sessionFileCandidates: {
    absoluteFilePath: string;
    modifiedAtMilliseconds: number;
    fileSizeInBytes: number;
    sessionId: string;
  }[] = [];
  for (const directoryEntry of directoryEntries) {
    if (!directoryEntry.isFile()) {
      continue;
    }
    if (!directoryEntry.name.toLowerCase().endsWith(".jsonl")) {
      continue;
    }
    const absoluteFilePath = nodePath.join(
      claudeProjectDirectoryAbsolutePath,
      directoryEntry.name,
    );
    let fileStatistics;
    try {
      fileStatistics = await filesystemPromises.stat(absoluteFilePath);
    } catch {
      continue;
    }
    sessionFileCandidates.push({
      absoluteFilePath,
      modifiedAtMilliseconds: fileStatistics.mtimeMs,
      fileSizeInBytes: fileStatistics.size,
      sessionId: directoryEntry.name.replace(/\.jsonl$/i, ""),
    });
  }

  sessionFileCandidates.sort(
    (leftEntry, rightEntry) =>
      rightEntry.modifiedAtMilliseconds - leftEntry.modifiedAtMilliseconds,
  );

  const mostRecentSessionFiles = sessionFileCandidates.slice(0, maximumSessionCount);

  const sessionSummaries = await Promise.all(
    mostRecentSessionFiles.map(async (sessionFileCandidate) => {
      const extractedSummary = await extractClaudeSessionSummaryFromJsonl(
        sessionFileCandidate.absoluteFilePath,
        sessionFileCandidate.fileSizeInBytes,
      );
      return {
        sessionId: sessionFileCandidate.sessionId,
        slug:
          extractedSummary.slug.length > 0
            ? extractedSummary.slug
            : shortenSessionIdForFallbackLabel(sessionFileCandidate.sessionId),
        latestAiTitle: extractedSummary.latestAiTitle,
        topicTitleArc: extractedSummary.topicTitleArc,
        lastActivityAtMilliseconds: sessionFileCandidate.modifiedAtMilliseconds,
        firstUserPromptPreview:
          extractedSummary.firstUserPromptPreview.length > 0
            ? extractedSummary.firstUserPromptPreview
            : "(no prompt parsed)",
        lastUserPromptPreview:
          extractedSummary.lastUserPromptPreview.length > 0
            ? extractedSummary.lastUserPromptPreview
            : extractedSummary.firstUserPromptPreview,
        editedFileBaseNames: extractedSummary.editedFileBaseNamesInRecencyOrder.slice(
          0,
          MAXIMUM_EDITED_FILE_BASENAMES_SHOWN,
        ),
        editedFileTotalCount: extractedSummary.editedFileBaseNamesInRecencyOrder.length,
        totalMessageCount: extractedSummary.totalMessageCount,
        gitBranch: extractedSummary.gitBranch,
      } satisfies ClaudeSessionSummary;
    }),
  );

  return sessionSummaries;
}

type ExtractedClaudeSessionSummary = {
  slug: string;
  topicTitleArc: string[];
  latestAiTitle: string;
  firstUserPromptPreview: string;
  lastUserPromptPreview: string;
  editedFileBaseNamesInRecencyOrder: string[];
  totalMessageCount: number;
  gitBranch: string | null;
};

async function extractClaudeSessionSummaryFromJsonl(
  absoluteFilePath: string,
  fileSizeInBytes: number,
): Promise<ExtractedClaudeSessionSummary> {
  const headLines = await readLinesFromFileRegion(
    absoluteFilePath,
    0,
    Math.min(JSONL_HEAD_READ_BYTE_BUDGET, fileSizeInBytes),
    false,
  );

  const tailStartOffsetByte = Math.max(
    0,
    fileSizeInBytes - JSONL_TAIL_READ_BYTE_BUDGET,
  );
  const headAndTailOverlap = tailStartOffsetByte < JSONL_HEAD_READ_BYTE_BUDGET;
  const tailLines = headAndTailOverlap
    ? []
    : await readLinesFromFileRegion(
        absoluteFilePath,
        tailStartOffsetByte,
        fileSizeInBytes,
        true,
      );

  let extractedSlug = "";
  let firstUserPromptPreview = "";
  let lastUserPromptPreview = "";
  let extractedGitBranch: string | null = null;
  let totalMessageCount = 0;
  const topicTitleArc: string[] = [];
  const alreadyCollectedTopicTitles = new Set<string>();

  function consumeRecordForGlobalFields(record: Record<string, unknown>): void {
    if (extractedSlug.length === 0 && typeof record.slug === "string") {
      extractedSlug = record.slug.trim();
    }
    if (extractedGitBranch === null && typeof record.gitBranch === "string") {
      const trimmedBranch = record.gitBranch.trim();
      if (trimmedBranch.length > 0 && trimmedBranch !== "HEAD") {
        extractedGitBranch = trimmedBranch;
      }
    }
    if (record.type === "ai-title" && typeof record.aiTitle === "string") {
      const trimmedAiTitle = record.aiTitle.trim();
      if (trimmedAiTitle.length > 0 && !alreadyCollectedTopicTitles.has(trimmedAiTitle)) {
        alreadyCollectedTopicTitles.add(trimmedAiTitle);
        topicTitleArc.push(trimmedAiTitle);
      }
    }
    if (
      record.type === "system" &&
      record.subtype === "turn_duration" &&
      typeof record.messageCount === "number" &&
      record.messageCount > totalMessageCount
    ) {
      totalMessageCount = record.messageCount;
    }
  }

  for (const rawLine of headLines) {
    const record = safeParseJsonRecord(rawLine);
    if (record === null) {
      continue;
    }
    consumeRecordForGlobalFields(record);
    if (firstUserPromptPreview.length === 0) {
      const cleanedPromptText = extractCleanedUserPromptTextFromRecord(record);
      if (cleanedPromptText.length > 0) {
        firstUserPromptPreview = truncateToCharacterBudget(
          cleanedPromptText,
          USER_PROMPT_PREVIEW_CHARACTER_BUDGET,
        );
      }
    }
  }

  if (tailLines.length > 0) {
    for (const rawLine of tailLines) {
      const record = safeParseJsonRecord(rawLine);
      if (record === null) {
        continue;
      }
      consumeRecordForGlobalFields(record);
    }
  }

  const linesToScanForRecentActivity = tailLines.length > 0 ? tailLines : headLines;
  const editedFileBaseNamesInRecencyOrder: string[] = [];
  const alreadyCollectedFileBaseNames = new Set<string>();

  for (let lineIndex = linesToScanForRecentActivity.length - 1; lineIndex >= 0; lineIndex -= 1) {
    const rawLine = linesToScanForRecentActivity[lineIndex];
    const record = safeParseJsonRecord(rawLine);
    if (record === null) {
      continue;
    }

    if (lastUserPromptPreview.length === 0) {
      const cleanedPromptText = extractCleanedUserPromptTextFromRecord(record);
      if (cleanedPromptText.length > 0) {
        lastUserPromptPreview = truncateToCharacterBudget(
          cleanedPromptText,
          USER_PROMPT_PREVIEW_CHARACTER_BUDGET,
        );
      }
    }

    if (editedFileBaseNamesInRecencyOrder.length < MAXIMUM_EDITED_FILE_BASENAMES_SHOWN * 4) {
      collectFileBaseNamesEditedByAssistantInRecord(
        record,
        editedFileBaseNamesInRecencyOrder,
        alreadyCollectedFileBaseNames,
      );
    }
  }

  if (lastUserPromptPreview.length === 0 && tailLines.length > 0) {
    for (let lineIndex = headLines.length - 1; lineIndex >= 0; lineIndex -= 1) {
      const record = safeParseJsonRecord(headLines[lineIndex]);
      if (record === null) {
        continue;
      }
      const cleanedPromptText = extractCleanedUserPromptTextFromRecord(record);
      if (cleanedPromptText.length > 0) {
        lastUserPromptPreview = truncateToCharacterBudget(
          cleanedPromptText,
          USER_PROMPT_PREVIEW_CHARACTER_BUDGET,
        );
        break;
      }
    }
  }

  return {
    slug: extractedSlug,
    topicTitleArc,
    latestAiTitle: topicTitleArc.length > 0 ? topicTitleArc[topicTitleArc.length - 1] : "",
    firstUserPromptPreview,
    lastUserPromptPreview,
    editedFileBaseNamesInRecencyOrder,
    totalMessageCount,
    gitBranch: extractedGitBranch,
  };
}

function safeParseJsonRecord(rawLine: string): Record<string, unknown> | null {
  if (rawLine.length === 0) {
    return null;
  }
  let parsedRecord: unknown;
  try {
    parsedRecord = JSON.parse(rawLine);
  } catch {
    return null;
  }
  if (parsedRecord === null || typeof parsedRecord !== "object") {
    return null;
  }
  return parsedRecord as Record<string, unknown>;
}

function extractCleanedUserPromptTextFromRecord(
  record: Record<string, unknown>,
): string {
  if (record.type !== "user") {
    return "";
  }
  if (record.isMeta === true) {
    return "";
  }
  const messageRecord = record.message;
  if (messageRecord === null || typeof messageRecord !== "object") {
    return "";
  }
  const messageContent = (messageRecord as Record<string, unknown>).content;
  const flattenedTextContent = flattenClaudeMessageContentToPlainText(messageContent);
  if (flattenedTextContent.length === 0) {
    return "";
  }
  if (containsToolResultContent(messageContent)) {
    return "";
  }
  const cleanedTextContent = cleanSlashCommandWrappersFromUserPromptText(
    flattenedTextContent,
  );
  if (cleanedTextContent.length === 0) {
    return "";
  }
  if (looksLikeSystemHookOrReminder(cleanedTextContent)) {
    return "";
  }
  return cleanedTextContent;
}

function containsToolResultContent(messageContent: unknown): boolean {
  if (!Array.isArray(messageContent)) {
    return false;
  }
  for (const contentEntry of messageContent) {
    if (
      contentEntry !== null &&
      typeof contentEntry === "object" &&
      (contentEntry as Record<string, unknown>).type === "tool_result"
    ) {
      return true;
    }
  }
  return false;
}

function looksLikeSystemHookOrReminder(text: string): boolean {
  return /<\s*(system-reminder|local-command-stdout|local-command-stderr|user-prompt-submit-hook|command-stdout|command-stderr)/.test(
    text,
  );
}

function collectFileBaseNamesEditedByAssistantInRecord(
  record: Record<string, unknown>,
  editedFileBaseNamesInRecencyOrder: string[],
  alreadyCollectedFileBaseNames: Set<string>,
): void {
  if (record.type !== "assistant") {
    return;
  }
  const messageRecord = record.message;
  if (messageRecord === null || typeof messageRecord !== "object") {
    return;
  }
  const messageContent = (messageRecord as Record<string, unknown>).content;
  if (!Array.isArray(messageContent)) {
    return;
  }
  for (const contentEntry of messageContent) {
    if (contentEntry === null || typeof contentEntry !== "object") {
      continue;
    }
    const entryRecord = contentEntry as Record<string, unknown>;
    if (entryRecord.type !== "tool_use") {
      continue;
    }
    if (typeof entryRecord.name !== "string") {
      continue;
    }
    if (!FILE_EDITING_TOOL_NAMES.has(entryRecord.name)) {
      continue;
    }
    const toolInput = entryRecord.input;
    if (toolInput === null || typeof toolInput !== "object") {
      continue;
    }
    const filePathCandidate =
      (toolInput as Record<string, unknown>).file_path ??
      (toolInput as Record<string, unknown>).notebook_path;
    if (typeof filePathCandidate !== "string" || filePathCandidate.length === 0) {
      continue;
    }
    const fileBaseName = nodePath.basename(filePathCandidate);
    if (alreadyCollectedFileBaseNames.has(fileBaseName)) {
      continue;
    }
    alreadyCollectedFileBaseNames.add(fileBaseName);
    editedFileBaseNamesInRecencyOrder.push(fileBaseName);
  }
}

async function readLinesFromFileRegion(
  absoluteFilePath: string,
  startByteOffset: number,
  endByteOffset: number,
  discardFirstPartialLine: boolean,
): Promise<string[]> {
  if (endByteOffset <= startByteOffset) {
    return [];
  }
  return new Promise<string[]>((resolve) => {
    const collectedLines: string[] = [];
    let hasDiscardedFirstPartialLine = !discardFirstPartialLine;

    const readStream = createReadStream(absoluteFilePath, {
      encoding: "utf8",
      start: startByteOffset,
      end: endByteOffset - 1,
      highWaterMark: 16 * 1024,
    });

    const lineReader = createInterface({ input: readStream, crlfDelay: Infinity });
    lineReader.on("line", (rawLine) => {
      if (!hasDiscardedFirstPartialLine) {
        hasDiscardedFirstPartialLine = true;
        return;
      }
      collectedLines.push(rawLine);
    });
    lineReader.on("close", () => resolve(collectedLines));
    readStream.on("error", () => resolve(collectedLines));
  });
}

function cleanSlashCommandWrappersFromUserPromptText(rawText: string): string {
  if (rawText.length === 0) {
    return rawText;
  }
  const commandNameMatch = rawText.match(/<command-name>([^<]+)<\/command-name>/);
  const commandArgsMatch = rawText.match(/<command-args>([^<]*)<\/command-args>/);
  if (commandNameMatch !== null) {
    const slashCommandName = commandNameMatch[1].trim().replace(/^\/+/, "");
    const slashCommandArguments =
      commandArgsMatch !== null ? commandArgsMatch[1].trim() : "";
    if (slashCommandArguments.length > 0) {
      return `/${slashCommandName} ${slashCommandArguments}`;
    }
    return `/${slashCommandName}`;
  }
  return rawText
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, "")
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, "")
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, "")
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "")
    .replace(/<local-command-stderr>[\s\S]*?<\/local-command-stderr>/g, "")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g, "")
    .trim();
}

function flattenClaudeMessageContentToPlainText(messageContent: unknown): string {
  if (typeof messageContent === "string") {
    return messageContent;
  }
  if (!Array.isArray(messageContent)) {
    return "";
  }
  const textFragments: string[] = [];
  for (const contentEntry of messageContent) {
    if (typeof contentEntry === "string") {
      textFragments.push(contentEntry);
      continue;
    }
    if (contentEntry === null || typeof contentEntry !== "object") {
      continue;
    }
    const fragmentRecord = contentEntry as Record<string, unknown>;
    if (fragmentRecord.type === "text" && typeof fragmentRecord.text === "string") {
      textFragments.push(fragmentRecord.text);
    }
  }
  return textFragments.join(" ");
}

function shortenSessionIdForFallbackLabel(sessionId: string): string {
  if (sessionId.length <= 8) {
    return sessionId;
  }
  return sessionId.slice(0, 8);
}
