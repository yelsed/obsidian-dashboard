<script lang="ts">
  import type { JiraIssueSummary, JiraSnapshot } from "../../data/jira";
  import { buildJiraSprintEpicHierarchy } from "../jiraHierarchy";
  import WidgetPanel from "./WidgetPanel.svelte";

  const sampleSprint = {
    sprintId: "42",
    sprintName: "Sprint 42",
    sprintState: "active",
    startDateIsoString: null,
    endDateIsoString: null,
    completeDateIsoString: null,
  };

  export let jiraSnapshot: JiraSnapshot = {
    jiraAvailability: "available",
    issues: [
      {
        issueKey: "FS-100",
        summaryText: "Release foundations",
        statusName: "In Progress",
        statusCategoryKey: "indeterminate",
        projectKey: "FS",
        assigneeDisplayName: "You",
        priorityName: "High",
        dueDateIsoString: null,
        updatedIsoString: "2026-05-21T11:00:00.000+0000",
        issueBrowserUrl: "https://fivespark.atlassian.net/browse/FS-100",
        issueTypeName: "Epic",
        issueTypeIsSubtask: false,
        issueTypeHierarchyLevel: 1,
        parentIssue: null,
        epicIssueKey: null,
        sprints: [sampleSprint],
      },
      {
        issueKey: "FS-128",
        summaryText: "Wire the release pipeline to staging",
        statusName: "In Progress",
        statusCategoryKey: "indeterminate",
        projectKey: "FS",
        assigneeDisplayName: "You",
        priorityName: "High",
        dueDateIsoString: "2026-05-28",
        updatedIsoString: "2026-05-21T10:00:00.000+0000",
        issueBrowserUrl: "https://fivespark.atlassian.net/browse/FS-128",
        issueTypeName: "Task",
        issueTypeIsSubtask: false,
        issueTypeHierarchyLevel: 0,
        parentIssue: {
          issueKey: "FS-100",
          summaryText: "Release foundations",
          issueTypeName: "Epic",
          issueTypeIsSubtask: false,
          issueBrowserUrl: "https://fivespark.atlassian.net/browse/FS-100",
        },
        epicIssueKey: "FS-100",
        sprints: [sampleSprint],
      },
      {
        issueKey: "FS-129",
        summaryText: "Add staging smoke check",
        statusName: "To Do",
        statusCategoryKey: "new",
        projectKey: "FS",
        assigneeDisplayName: "You",
        priorityName: "Medium",
        dueDateIsoString: null,
        updatedIsoString: "2026-05-20T09:00:00.000+0000",
        issueBrowserUrl: "https://fivespark.atlassian.net/browse/FS-129",
        issueTypeName: "Sub-task",
        issueTypeIsSubtask: true,
        issueTypeHierarchyLevel: -1,
        parentIssue: {
          issueKey: "FS-128",
          summaryText: "Wire the release pipeline to staging",
          issueTypeName: "Task",
          issueTypeIsSubtask: false,
          issueBrowserUrl: "https://fivespark.atlassian.net/browse/FS-128",
        },
        epicIssueKey: "FS-100",
        sprints: [sampleSprint],
      },
    ],
    lastErrorMessage: null,
    lastRefreshedAtEpochMilliseconds: Date.now(),
  };
  export let onRefresh: () => void = () => {};
  export let onOpenIssueInBrowser: (issueBrowserUrl: string) => void = () => {};
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};

  function formatDueDateLabel(dueDateIsoString: string | null): string {
    return dueDateIsoString === null ? "" : `due ${dueDateIsoString}`;
  }

  function describeEpicHeading(epicKey: string, summaryText: string | null): string {
    if (epicKey === "no-epic") return "No epic";
    const issueKey = epicKey.startsWith("epic:") ? epicKey.slice(5) : epicKey;
    return summaryText === null || summaryText.length === 0 ? issueKey : `${issueKey} — ${summaryText}`;
  }

  $: sprintGroups = buildJiraSprintEpicHierarchy(jiraSnapshot.issues);
  $: hasAnyIssues = jiraSnapshot.issues.length > 0;
</script>

<WidgetPanel title="Jira issues" {isCollapsed} {onToggleCollapsed}>
  <button slot="header-actions" type="button" class="jira-refresh-button" on:click={onRefresh}>refresh ↻</button>

  {#if jiraSnapshot.jiraAvailability === "available" && hasAnyIssues}
    <ul class="jira-sprint-list">
      {#each sprintGroups as sprintGroup (sprintGroup.sprintKey)}
        <li class="jira-sprint-group">
          <h3 class="jira-sprint-heading">{sprintGroup.sprintName}{#if sprintGroup.sprintState !== null} · {sprintGroup.sprintState}{/if}</h3>
          <ul class="jira-epic-list">
            {#each sprintGroup.epicGroups as epicGroup (epicGroup.epicKey)}
              <li class="jira-epic-group">
                <h4 class="jira-epic-heading">{describeEpicHeading(epicGroup.epicKey, epicGroup.epicSummaryText)}</h4>
                <ul class="jira-task-list">
                  {#each epicGroup.tasks as taskNode (taskNode.taskIssue?.issueKey ?? taskNode.parentIssue?.issueKey ?? "task")}
                    {@const taskIssue = taskNode.taskIssue}
                    {#if taskIssue !== null}
                      <li class="jira-task-item">
                        <button type="button" class="jira-issue-button" title="Open {taskIssue.issueKey} in your browser" on:click={() => onOpenIssueInBrowser(taskIssue.issueBrowserUrl)}>
                          <span class="jira-issue-key">{taskIssue.issueKey}</span>
                          <span class="jira-issue-summary">{taskIssue.summaryText}</span>
                          <span class="jira-issue-status" data-status-category={taskIssue.statusCategoryKey}>{taskIssue.statusName}</span>
                          {#if taskIssue.dueDateIsoString}<span class="jira-issue-due">{formatDueDateLabel(taskIssue.dueDateIsoString)}</span>{/if}
                        </button>
                        {#if taskNode.subtasks.length > 0}
                          <ul class="jira-subtask-list">
                            {#each taskNode.subtasks as subtask (subtask.issueKey)}
                              <li>
                                <button type="button" class="jira-issue-button jira-subtask-button" title="Open {subtask.issueKey} in your browser" on:click={() => onOpenIssueInBrowser(subtask.issueBrowserUrl)}>
                                  <span class="jira-subtask-glyph">↳</span>
                                  <span class="jira-issue-key">{subtask.issueKey}</span>
                                  <span class="jira-issue-summary">{subtask.summaryText}</span>
                                  <span class="jira-issue-status" data-status-category={subtask.statusCategoryKey}>{subtask.statusName}</span>
                                </button>
                              </li>
                            {/each}
                          </ul>
                        {/if}
                      </li>
                    {/if}
                  {/each}
                  {#if epicGroup.orphanSubtaskGroups.length > 0}
                    <li class="jira-orphan-subtasks">
                      <h5>Subtasks without returned task</h5>
                      {#each epicGroup.orphanSubtaskGroups as orphanGroup (orphanGroup.parentIssue?.issueKey ?? "no-parent")}
                        {#if orphanGroup.parentIssue !== null}<p>parent {orphanGroup.parentIssue.issueKey}</p>{/if}
                        <ul class="jira-subtask-list">
                          {#each orphanGroup.subtasks as subtask (subtask.issueKey)}
                            <li>
                              <button type="button" class="jira-issue-button jira-subtask-button" title="Open {subtask.issueKey} in your browser" on:click={() => onOpenIssueInBrowser(subtask.issueBrowserUrl)}>
                                <span class="jira-subtask-glyph">↳</span>
                                <span class="jira-issue-key">{subtask.issueKey}</span>
                                <span class="jira-issue-summary">{subtask.summaryText}</span>
                                <span class="jira-issue-status" data-status-category={subtask.statusCategoryKey}>{subtask.statusName}</span>
                              </button>
                            </li>
                          {/each}
                        </ul>
                      {/each}
                    </li>
                  {/if}
                </ul>
              </li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  {:else if jiraSnapshot.jiraAvailability === "checking"}
    <p class="row-shimmer" aria-hidden="true">·········································</p>
    <ul class="jira-task-list">
      {#each Array(3) as _, shimmerRowIndex (shimmerRowIndex)}
        <li><span class="row-shimmer" aria-hidden="true">····  ··························</span></li>
      {/each}
    </ul>
  {:else if jiraSnapshot.jiraAvailability === "available"}
    <p class="widget-empty">No open issues in the mapped projects. Clean.</p>
  {:else if jiraSnapshot.jiraAvailability === "not-configured"}
    <p class="widget-empty">Connect Jira in Settings → Vault Dashboard, then set a Jira project key on a pinned project.</p>
  {:else if jiraSnapshot.jiraAvailability === "authentication-failed"}
    <p class="widget-error">! Jira rejected the request.</p>
    <p class="widget-error-hint">{jiraSnapshot.lastErrorMessage ?? "Check your account email and API token in settings."}</p>
  {:else}
    <p class="widget-error">! Could not reach Jira.</p>
    <p class="widget-error-hint">{jiraSnapshot.lastErrorMessage ?? "Reload the plugin if this persists."}</p>
  {/if}
</WidgetPanel>

<style>
  .jira-refresh-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    cursor: pointer;
    white-space: nowrap;
  }

  .jira-refresh-button:hover { color: var(--vault-dashboard-color-accent-cyan); }
  .jira-refresh-button:focus-visible { outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent); outline-offset: 2px; }

  .jira-sprint-list,
  .jira-epic-list,
  .jira-task-list,
  .jira-subtask-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .jira-sprint-list { gap: var(--vault-dashboard-space-panel-inner); }
  .jira-epic-list { padding-left: var(--vault-dashboard-space-inline); }
  .jira-subtask-list { padding-left: var(--vault-dashboard-space-panel-inner); }

  .jira-sprint-heading,
  .jira-epic-heading,
  .jira-orphan-subtasks h5 {
    margin: 0 0 var(--vault-dashboard-space-row) 0;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    color: var(--vault-dashboard-text-faint);
  }

  .jira-issue-button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    width: 100%;
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    text-align: left;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    cursor: pointer;
  }

  .jira-subtask-button { grid-template-columns: auto auto minmax(0, 1fr) auto; }
  .jira-issue-button:hover { color: var(--vault-dashboard-color-accent-cyan); }
  .jira-issue-button:focus-visible { outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent); outline-offset: 2px; }

  .jira-issue-key { color: var(--vault-dashboard-color-accent-cyan); font-weight: var(--vault-dashboard-font-weight-bold); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .jira-issue-summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--vault-dashboard-font-weight-medium); }
  .jira-issue-status { color: var(--vault-dashboard-text-secondary); font-size: var(--vault-dashboard-font-size-label); font-style: italic; white-space: nowrap; }
  .jira-issue-status[data-status-category="indeterminate"] { color: var(--vault-dashboard-color-freshness-cooling); }
  .jira-issue-status[data-status-category="done"] { color: var(--vault-dashboard-color-status-running); }
  .jira-issue-due,
  .jira-subtask-glyph,
  .jira-orphan-subtasks p { color: var(--vault-dashboard-text-faint); font-size: var(--vault-dashboard-font-size-label); font-style: italic; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .widget-empty { margin: 0; color: var(--vault-dashboard-text-secondary); }
  .widget-error { margin: 0; color: var(--vault-dashboard-color-status-stopped); }
  .widget-error-hint { margin: var(--vault-dashboard-space-row) 0 0 0; color: var(--vault-dashboard-text-secondary); font-size: var(--vault-dashboard-font-size-label); }
  .row-shimmer { color: var(--vault-dashboard-text-faint); opacity: 0.5; }
</style>
