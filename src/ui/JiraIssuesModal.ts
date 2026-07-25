import { App, Modal, Setting } from "obsidian";
import type { JiraIssueSummary } from "../data/jira";
import { buildJiraSprintEpicHierarchy } from "./jiraHierarchy";

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

export class JiraIssuesModal extends Modal {
  private readonly parameters: JiraIssuesModalParameters;
  private searchText = "";
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
      textInput.setPlaceholder("Filter by key, summary, status, type, parent, epic, or sprint…");
      textInput.onChange((value) => {
        this.searchText = value;
        this.renderIssueList();
      });
      window.setTimeout(() => textInput.inputEl.focus(), 0);
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

    const visibleIssues = filterIssues(this.parameters.issues, this.searchText);
    if (visibleIssues.length === 0) {
      listContainer.createEl("p", {
        text: "No matching issues.",
        cls: "vault-dashboard-jira-issues-modal-empty",
      });
      return;
    }

    const sprintListElement = listContainer.createEl("ul", {
      cls: "vault-dashboard-jira-issues-modal-sprint-list",
    });
    for (const sprintGroup of buildJiraSprintEpicHierarchy(visibleIssues)) {
      const sprintItemElement = sprintListElement.createEl("li", {
        cls: "vault-dashboard-jira-issues-modal-sprint",
      });
      sprintItemElement.createEl("h3", {
        text:
          sprintGroup.sprintState === null
            ? sprintGroup.sprintName
            : `${sprintGroup.sprintName} · ${sprintGroup.sprintState}`,
        cls: "vault-dashboard-jira-issues-modal-sprint-heading",
      });

      const epicListElement = sprintItemElement.createEl("ul", {
        cls: "vault-dashboard-jira-issues-modal-epic-list",
      });
      for (const epicGroup of sprintGroup.epicGroups) {
        const epicItemElement = epicListElement.createEl("li", {
          cls: "vault-dashboard-jira-issues-modal-epic",
        });
        epicItemElement.createEl("h4", {
          text: describeEpicHeading(epicGroup.epicKey, epicGroup.epicSummaryText),
          cls: "vault-dashboard-jira-issues-modal-epic-heading",
        });

        const taskListElement = epicItemElement.createEl("ul", {
          cls: "vault-dashboard-jira-issues-modal-task-list",
        });
        for (const taskNode of epicGroup.tasks) {
          if (taskNode.taskIssue !== null) {
            const taskItemElement = taskListElement.createEl("li", {
              cls: "vault-dashboard-jira-issues-modal-task",
            });
            this.renderIssueRow(taskItemElement, taskNode.taskIssue, false);
            if (taskNode.subtasks.length > 0) {
              const subtaskListElement = taskItemElement.createEl("ul", {
                cls: "vault-dashboard-jira-issues-modal-subtask-list",
              });
              for (const subtask of taskNode.subtasks) {
                this.renderIssueRow(subtaskListElement.createEl("li"), subtask, true);
              }
            }
          }
        }

        if (epicGroup.orphanSubtaskGroups.length > 0) {
          const orphanItemElement = taskListElement.createEl("li", {
            cls: "vault-dashboard-jira-issues-modal-orphans",
          });
          orphanItemElement.createEl("h5", {
            text: "Subtasks without returned task",
            cls: "vault-dashboard-jira-issues-modal-orphans-heading",
          });
          for (const orphanGroup of epicGroup.orphanSubtaskGroups) {
            if (orphanGroup.parentIssue !== null) {
              orphanItemElement.createEl("p", {
                text: `parent ${orphanGroup.parentIssue.issueKey}`,
                cls: "vault-dashboard-jira-issues-modal-orphan-parent",
              });
            }
            const subtaskListElement = orphanItemElement.createEl("ul", {
              cls: "vault-dashboard-jira-issues-modal-subtask-list",
            });
            for (const subtask of orphanGroup.subtasks) {
              this.renderIssueRow(subtaskListElement.createEl("li"), subtask, true);
            }
          }
        }
      }
    }
  }

  private renderIssueRow(
    parentElement: HTMLElement,
    issue: JiraIssueSummary,
    isSubtask: boolean,
  ): void {
    const rowElement = parentElement.createDiv({
      cls: isSubtask
        ? "vault-dashboard-jira-issues-modal-row vault-dashboard-jira-issues-modal-row-subtask"
        : "vault-dashboard-jira-issues-modal-row",
    });

    if (isSubtask) {
      rowElement.createSpan({
        text: "↳",
        cls: "vault-dashboard-jira-issues-modal-subtask-glyph",
      });
    }

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
    const sprintNames = issue.sprints.map((sprint) => sprint.sprintName).join(" ");
    const haystack = `${issue.issueKey} ${issue.summaryText} ${issue.statusName} ${issue.issueTypeName ?? ""} ${issue.parentIssue?.issueKey ?? ""} ${issue.parentIssue?.summaryText ?? ""} ${issue.epicIssueKey ?? ""} ${sprintNames}`.toLowerCase();
    return haystack.includes(normalisedSearchText);
  });
}

function describeEpicHeading(epicKey: string, summaryText: string | null): string {
  if (epicKey === "no-epic") {
    return "No epic";
  }
  const issueKey = epicKey.startsWith("epic:") ? epicKey.slice(5) : epicKey;
  return summaryText === null || summaryText.length === 0 ? issueKey : `${issueKey} — ${summaryText}`;
}
