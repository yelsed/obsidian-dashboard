import { Notice } from "obsidian";
import { copyTextToClipboardWithFallback } from "./clipboard";

// The dashboard does not run Claude Code itself: every Claude action hands you a ready-to-paste
// command line. The Claude sessions widget, the pinned project detail page, the Jira issue rows
// and the Procrast planning modal all offer these two actions, so they live here rather than in
// any single surface.

export function copyClaudeResumeCommandToClipboard(
  pinnedProjectFolderPath: string,
  sessionId: string,
): void {
  copyCommandLineToClipboard(
    buildClaudeResumeCommandLine(pinnedProjectFolderPath, sessionId),
    "Resume command copied — paste it in your terminal",
  );
}

export function copyClaudeStartCommandToClipboard(
  pinnedProjectFolderPath: string,
  initialPromptText: string,
): void {
  copyCommandLineToClipboard(
    buildClaudeStartCommandLine(pinnedProjectFolderPath, initialPromptText),
    "Claude command copied — paste it in your terminal",
  );
}

export function buildClaudeResumeCommandLine(
  pinnedProjectFolderPath: string,
  sessionId: string,
): string {
  return `cd ${quoteShellArgument(pinnedProjectFolderPath)} && claude --resume ${quoteShellArgument(sessionId)}`;
}

export function buildClaudeStartCommandLine(
  pinnedProjectFolderPath: string,
  initialPromptText: string,
): string {
  return `cd ${quoteShellArgument(pinnedProjectFolderPath)} && claude ${quoteShellArgument(initialPromptText)}`;
}

function copyCommandLineToClipboard(commandLine: string, successNoticeText: string): void {
  void copyTextToClipboardWithFallback(commandLine).then((wasCopied) => {
    new Notice(wasCopied ? successNoticeText : "Could not copy the command");
  });
}

function quoteShellArgument(argumentValue: string): string {
  return `'${argumentValue.replace(/'/g, "'\\''")}'`;
}
