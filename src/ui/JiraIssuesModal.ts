import { App, Modal, Setting } from "obsidian";
import type { JiraIssueSummary } from "../data/jira";

type JiraIssueSortMode = "updated" | "key" | "priority" | "due" | "status" | "summary";

export type JiraIssuesModalParameters = {
  jiraProjectKey: string;
  pinnedProjectId: string;
  issues: JiraIssueSummary[];
  onOpenIssueInBrowser: (issueBrowserUrl: string) => void;
  onStartClaudeSessionFromJiraIssue: (
    pinnedProjectId: string,
    issueKey: string,
  ) => void;
};

const SORT_MODE_LABELS: Record<JiraIssueSortMode, string> = {
  updated: "Recently updated",
  key: "Issue key",
  priority: "Priority (high first)",
  due: "Due date (soonest)",
  status: "Status",
  summary: "Summary (A–Z)",
};

const PRIORITY_RANK_BY_LOWERCASE_NAME: Record<string, number> = {
  highest: 1,
  blocker: 1,
  critical: 2,
  high: 3,
  medium: 5,
  low: 7,
  lowest: 9,
  trivial: 9,
};
const UNKNOWN_PRIORITY_RANK = 5;

export class JiraIssuesModal extends Modal {
  private readonly parameters: JiraIssuesModalParameters;
  private searchText = "";
  private sortMode: JiraIssueSortMode = "updated";
  private issueListContainerElement: HTMLElement | null = null;

  constructor(obsidianApplication: App, parameters: JiraIssuesModalParameters) {
    super(obsidianApplication);
    this.parameters = parameters;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vault-dashboard-jira-issues-modal");

    contentEl.createEl("h2", {
      text: `${this.parameters.jiraProjectKey} — ${this.parameters.issues.length} open issues`,
    });

    new Setting(contentEl).setName("Search").addText((textInput) => {
      textInput.setPlaceholder("Filter by key, summary, or status…");
      textInput.onChange((value) => {
        this.searchText = value;
        this.renderIssueList();
      });
      window.setTimeout(() => textInput.inputEl.focus(), 0);
    });

    new Setting(contentEl).setName("Sort by").addDropdown((dropdownControl) => {
      for (const sortMode of Object.keys(SORT_MODE_LABELS) as JiraIssueSortMode[]) {
        dropdownControl.addOption(sortMode, SORT_MODE_LABELS[sortMode]);
      }
      dropdownControl.setValue(this.sortMode);
      dropdownControl.onChange((value) => {
        this.sortMode = value as JiraIssueSortMode;
        this.renderIssueList();
      });
    });

    this.issueListContainerElement = contentEl.createDiv({
      cls: "vault-dashboard-jira-issues-modal-list",
    });
    this.renderIssueList();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderIssueList(): void {
    const listContainer = this.issueListContainerElement;
    if (listContainer === null) {
      return;
    }
    listContainer.empty();

    const visibleIssues = sortIssues(
      filterIssues(this.parameters.issues, this.searchText),
      this.sortMode,
    );

    if (visibleIssues.length === 0) {
      listContainer.createEl("p", {
        text: "No matching issues.",
        cls: "vault-dashboard-jira-issues-modal-empty",
      });
      return;
    }

    for (const issue of visibleIssues) {
      this.renderIssueRow(listContainer, issue);
    }
  }

  private renderIssueRow(parentElement: HTMLElement, issue: JiraIssueSummary): void {
    const rowElement = parentElement.createDiv({
      cls: "vault-dashboard-jira-issues-modal-row",
    });

    const issueKeyButton = rowElement.createEl("button", {
      text: issue.issueKey,
      cls: "vault-dashboard-jira-issues-modal-key",
    });
    issueKeyButton.setAttribute("title", `Open ${issue.issueKey} in your browser`);
    issueKeyButton.addEventListener("click", () => {
      this.parameters.onOpenIssueInBrowser(issue.issueBrowserUrl);
    });

    rowElement.createSpan({
      text: issue.summaryText,
      cls: "vault-dashboard-jira-issues-modal-summary",
    });

    const statusElement = rowElement.createSpan({
      text: issue.statusName,
      cls: "vault-dashboard-jira-issues-modal-status",
    });
    statusElement.setAttribute("data-status-category", issue.statusCategoryKey);

    rowElement.createSpan({
      text: issue.dueDateIsoString ? `due ${issue.dueDateIsoString}` : "",
      cls: "vault-dashboard-jira-issues-modal-due",
    });

    const fixButton = rowElement.createEl("button", {
      text: "fix in claude",
      cls: "vault-dashboard-jira-issues-modal-fix",
    });
    fixButton.setAttribute(
      "title",
      `Open Claude Code in this folder with the full ${issue.issueKey} ticket`,
    );
    fixButton.addEventListener("click", () => {
      this.parameters.onStartClaudeSessionFromJiraIssue(
        this.parameters.pinnedProjectId,
        issue.issueKey,
      );
      this.close();
    });
  }
}

function filterIssues(issues: JiraIssueSummary[], searchText: string): JiraIssueSummary[] {
  const normalisedSearchText = searchText.trim().toLowerCase();
  if (normalisedSearchText.length === 0) {
    return issues;
  }
  return issues.filter((issue) => {
    const haystack = `${issue.issueKey} ${issue.summaryText} ${issue.statusName}`.toLowerCase();
    return haystack.includes(normalisedSearchText);
  });
}

function sortIssues(
  issues: JiraIssueSummary[],
  sortMode: JiraIssueSortMode,
): JiraIssueSummary[] {
  const sortedIssues = [...issues];
  switch (sortMode) {
    case "updated":
      sortedIssues.sort((left, right) =>
        compareNullableStringsDescending(left.updatedIsoString, right.updatedIsoString),
      );
      break;
    case "key":
      sortedIssues.sort((left, right) => compareIssueKeys(left.issueKey, right.issueKey));
      break;
    case "priority":
      sortedIssues.sort(
        (left, right) =>
          rankPriority(left.priorityName) - rankPriority(right.priorityName),
      );
      break;
    case "due":
      sortedIssues.sort((left, right) =>
        compareNullableStringsAscending(left.dueDateIsoString, right.dueDateIsoString),
      );
      break;
    case "status":
      sortedIssues.sort((left, right) => left.statusName.localeCompare(right.statusName));
      break;
    case "summary":
      sortedIssues.sort((left, right) => left.summaryText.localeCompare(right.summaryText));
      break;
  }
  return sortedIssues;
}

function rankPriority(priorityName: string | null): number {
  if (priorityName === null) {
    return UNKNOWN_PRIORITY_RANK;
  }
  return PRIORITY_RANK_BY_LOWERCASE_NAME[priorityName.toLowerCase()] ?? UNKNOWN_PRIORITY_RANK;
}

function compareIssueKeys(leftIssueKey: string, rightIssueKey: string): number {
  const leftNumericSuffix = readIssueKeyNumericSuffix(leftIssueKey);
  const rightNumericSuffix = readIssueKeyNumericSuffix(rightIssueKey);
  if (leftNumericSuffix !== rightNumericSuffix) {
    return leftNumericSuffix - rightNumericSuffix;
  }
  return leftIssueKey.localeCompare(rightIssueKey);
}

function readIssueKeyNumericSuffix(issueKey: string): number {
  const numericMatch = issueKey.match(/(\d+)$/);
  return numericMatch === null ? 0 : Number.parseInt(numericMatch[1], 10);
}

function compareNullableStringsDescending(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return right.localeCompare(left);
}

function compareNullableStringsAscending(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}
