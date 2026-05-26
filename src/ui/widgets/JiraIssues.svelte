<script lang="ts">
  import type { JiraIssueSummary, JiraSnapshot } from "../../data/jira";
  import WidgetPanel from "./WidgetPanel.svelte";

  export let jiraSnapshot: JiraSnapshot = {
    jiraAvailability: "available",
    issues: [
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
      },
      {
        issueKey: "FS-131",
        summaryText: "Document the worker retry policy",
        statusName: "To Do",
        statusCategoryKey: "new",
        projectKey: "FS",
        assigneeDisplayName: "You",
        priorityName: "Medium",
        dueDateIsoString: null,
        updatedIsoString: "2026-05-20T09:00:00.000+0000",
        issueBrowserUrl: "https://fivespark.atlassian.net/browse/FS-131",
      },
    ],
    lastErrorMessage: null,
    lastRefreshedAtEpochMilliseconds: Date.now(),
  };
  export let onRefresh: () => void = () => {};
  export let onOpenIssueInBrowser: (issueBrowserUrl: string) => void = () => {};
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};

  type IssueGroup = {
    projectKey: string;
    issues: JiraIssueSummary[];
  };

  function groupIssuesByProjectKey(issues: JiraIssueSummary[]): IssueGroup[] {
    const groupsByProjectKey = new Map<string, IssueGroup>();
    for (const issue of issues) {
      const existingGroup = groupsByProjectKey.get(issue.projectKey);
      if (existingGroup === undefined) {
        groupsByProjectKey.set(issue.projectKey, {
          projectKey: issue.projectKey,
          issues: [issue],
        });
      } else {
        existingGroup.issues.push(issue);
      }
    }
    return [...groupsByProjectKey.values()];
  }

  function formatDueDateLabel(dueDateIsoString: string | null): string {
    if (dueDateIsoString === null) {
      return "";
    }
    return `due ${dueDateIsoString}`;
  }

  $: issueGroups = groupIssuesByProjectKey(jiraSnapshot.issues);
  $: hasAnyIssues = jiraSnapshot.issues.length > 0;
</script>

<WidgetPanel title="Jira issues" {isCollapsed} {onToggleCollapsed}>
  <button slot="header-actions" type="button" class="jira-refresh-button" on:click={onRefresh}>refresh ↻</button>

  {#if jiraSnapshot.jiraAvailability === "available" && hasAnyIssues}
    <ul class="jira-group-list">
      {#each issueGroups as issueGroup (issueGroup.projectKey)}
        <li class="jira-group">
          <h3 class="jira-group-heading">{issueGroup.projectKey}</h3>
          <ul class="jira-issue-list">
            {#each issueGroup.issues as issue (issue.issueKey)}
              <li class="jira-issue-row">
                <button
                  type="button"
                  class="jira-issue-button"
                  title="Open {issue.issueKey} in your browser"
                  on:click={() => onOpenIssueInBrowser(issue.issueBrowserUrl)}
                >
                  <span class="jira-issue-key">{issue.issueKey}</span>
                  <span class="jira-issue-summary">{issue.summaryText}</span>
                  <span
                    class="jira-issue-status"
                    data-status-category={issue.statusCategoryKey}
                  >
                    {issue.statusName}
                  </span>
                  {#if issue.dueDateIsoString}
                    <span class="jira-issue-due">{formatDueDateLabel(issue.dueDateIsoString)}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  {:else if jiraSnapshot.jiraAvailability === "checking"}
    <p class="row-shimmer" aria-hidden="true">·········································</p>
    <ul class="jira-issue-list">
      {#each Array(3) as _, shimmerRowIndex (shimmerRowIndex)}
        <li class="jira-issue-row"><span class="row-shimmer" aria-hidden="true">····  ··························</span></li>
      {/each}
    </ul>
  {:else if jiraSnapshot.jiraAvailability === "available"}
    <p class="widget-empty">No open issues in the mapped projects. Clean.</p>
  {:else if jiraSnapshot.jiraAvailability === "not-configured"}
    <p class="widget-empty">
      Connect Jira in Settings → Vault Dashboard, then set a Jira project key on a pinned project.
    </p>
  {:else if jiraSnapshot.jiraAvailability === "authentication-failed"}
    <p class="widget-error">! Jira rejected the request.</p>
    <p class="widget-error-hint">
      {jiraSnapshot.lastErrorMessage ?? "Check your account email and API token in settings."}
    </p>
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

  .jira-refresh-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .jira-refresh-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .jira-group-list,
  .jira-issue-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .jira-group-list {
    gap: var(--vault-dashboard-space-panel-inner);
  }

  .jira-group-heading {
    margin: 0 0 var(--vault-dashboard-space-row) 0;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    color: var(--vault-dashboard-text-faint);
  }

  .jira-issue-row {
    display: block;
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

  .jira-issue-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .jira-issue-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .jira-issue-key {
    color: var(--vault-dashboard-color-accent-cyan);
    font-weight: var(--vault-dashboard-font-weight-bold);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .jira-issue-summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--vault-dashboard-font-weight-medium);
  }

  .jira-issue-status {
    color: var(--vault-dashboard-text-secondary);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    white-space: nowrap;
  }

  .jira-issue-status[data-status-category="indeterminate"] {
    color: var(--vault-dashboard-color-freshness-cooling);
  }

  .jira-issue-status[data-status-category="done"] {
    color: var(--vault-dashboard-color-status-running);
  }

  .jira-issue-due {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .widget-empty {
    margin: 0;
    color: var(--vault-dashboard-text-secondary);
  }

  .widget-error {
    margin: 0;
    color: var(--vault-dashboard-color-status-stopped);
  }

  .widget-error-hint {
    margin: var(--vault-dashboard-space-row) 0 0 0;
    color: var(--vault-dashboard-text-secondary);
    font-size: var(--vault-dashboard-font-size-label);
  }

  .row-shimmer {
    color: var(--vault-dashboard-text-faint);
    opacity: 0.5;
  }
</style>
