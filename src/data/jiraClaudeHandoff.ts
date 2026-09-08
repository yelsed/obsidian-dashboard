import { Notice } from "obsidian";
import { buildClaudePromptForJiraIssue, fetchJiraIssueDetail } from "./jira";
import { copyClaudeStartCommandToClipboard } from "./claudeTerminal";
import type { JiraConnectionSettings } from "../settings";

// Offered from both the issue list on the project detail page and the full issue browser modal, so
// the fetch, the prompt and the clipboard handoff live together rather than in either surface.
export async function copyClaudeStartCommandForJiraIssue(
  jiraConnectionSettings: JiraConnectionSettings,
  pinnedProjectFolderPath: string,
  issueKey: string,
): Promise<void> {
  new Notice(`Fetching ${issueKey} from Jira…`);
  const detailResult = await fetchJiraIssueDetail(jiraConnectionSettings, issueKey);
  if (!detailResult.ok) {
    new Notice(`Could not load ${issueKey}: ${detailResult.message}`);
    return;
  }
  copyClaudeStartCommandToClipboard(
    pinnedProjectFolderPath,
    buildClaudePromptForJiraIssue(detailResult.issue),
  );
}
