<script lang="ts">
  import { formatRelativeModifiedTime } from "../../data/format";
  import type { FreshnessLevel, PinnedProjectForWidget, ProcrastOriginForWidget } from "../../data/pinnedProjects";
  import WidgetPanel from "./WidgetPanel.svelte";

  type WidgetViewState = "data" | "loading" | "empty" | "error";

  const MAXIMUM_VISIBLE_CONTAINER_CELLS = 4;
  const FRESHNESS_GLYPH_BY_LEVEL: Record<FreshnessLevel, string> = {
    active: "●",
    cooling: "◐",
    cold: "○",
  };

  export let viewState: WidgetViewState = "data";
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  export let pinnedProjects: PinnedProjectForWidget[] = [];
  export let onOpenProjectDetail: (pinnedProjectId: string) => void = () => {};

  function countRunningContainersIn(project: PinnedProjectForWidget): number {
    return project.pairedContainers.filter((container) => container.containerStatus === "running").length;
  }

  function renderContainerBarFor(project: PinnedProjectForWidget): string {
    if (project.dockerAvailability === "not-installed") {
      return " ".repeat(MAXIMUM_VISIBLE_CONTAINER_CELLS);
    }
    const totalContainerCount = project.pairedContainers.length;
    const runningContainerCount = countRunningContainersIn(project);
    const filledCellCount = Math.min(runningContainerCount, MAXIMUM_VISIBLE_CONTAINER_CELLS);
    const emptyCellCount = Math.max(0, MAXIMUM_VISIBLE_CONTAINER_CELLS - filledCellCount);
    const overflowMarker = totalContainerCount > MAXIMUM_VISIBLE_CONTAINER_CELLS ? "+" : " ";
    return "█".repeat(filledCellCount) + " ".repeat(emptyCellCount) + overflowMarker;
  }

  function describeContainerStatusFor(project: PinnedProjectForWidget): string {
    if (project.dockerAvailability === "not-installed") {
      return "no docker";
    }
    if (project.pairedContainers.length === 0) {
      return "idle";
    }
    const runningContainerCount = countRunningContainersIn(project);
    return `${runningContainerCount}/${project.pairedContainers.length} up`;
  }

  function chooseFreshnessGlyphFor(project: PinnedProjectForWidget): string {
    return FRESHNESS_GLYPH_BY_LEVEL[project.freshnessLevel];
  }

  function hasAtLeastOneRunningContainer(project: PinnedProjectForWidget): boolean {
    return countRunningContainersIn(project) > 0;
  }

  function shouldShowJiraBadgeFor(project: PinnedProjectForWidget): boolean {
    return project.jiraProjectKey.length > 0 && project.jiraAvailability === "available";
  }

  function describeJiraBadgeFor(project: PinnedProjectForWidget): string {
    const issueWord = project.jiraOpenIssueCount === 1 ? "issue" : "issues";
    return `${project.jiraOpenIssueCount} open Jira ${issueWord} in ${project.jiraProjectKey}`;
  }

  function formatShortIdeaUuid(ideaUuid: string): string {
    return ideaUuid.length > 8 ? ideaUuid.slice(0, 8) : ideaUuid;
  }

  function describeProcrastOrigin(origin: ProcrastOriginForWidget): string {
    const title = origin.ideaTitle.trim();
    return title.length > 0
      ? `From Procrast idea ${title} (${origin.ideaUuid})`
      : `From Procrast idea ${origin.ideaUuid}`;
  }
</script>

<WidgetPanel title="Pinned projects" {isCollapsed} {onToggleCollapsed}>
  {#if viewState === "data"}
    {#if pinnedProjects.length === 0}
      <div class="project-empty-state">No pinned projects yet.</div>
    {:else}
      <ul class="project-summary-list">
        {#each pinnedProjects as project (project.id)}
          <li class="project-summary-item">
            <button
              type="button"
              class="project-summary-row"
              title="Open pinned project detail"
              on:click={() => onOpenProjectDetail(project.id)}
            >
              <span class="project-summary-name-block">
                <span class="project-display-name">{project.displayName || project.folderPath}</span>
                {#if project.displayName && project.displayName !== project.folderPath}
                  <span class="project-folder-path">{project.folderPath}</span>
                {/if}
              </span>
              <span class="project-summary-meta">
                <span class="project-container-bar" aria-label={describeContainerStatusFor(project)}>[<span class="project-container-bar-cells" class:is-pulsing={hasAtLeastOneRunningContainer(project)}>{renderContainerBarFor(project)}</span>]</span>
                <span class="project-container-status">{describeContainerStatusFor(project)}</span>
                {#if shouldShowJiraBadgeFor(project)}
                  <span class="project-jira-badge" title={describeJiraBadgeFor(project)}>jira {project.jiraOpenIssueCount}</span>
                {/if}
                <span class="project-freshness" data-freshness={project.freshnessLevel} aria-label="Last modified {project.relativeModifiedTimeLabel}">{chooseFreshnessGlyphFor(project)}</span>
                <span class="project-modified-time">{project.relativeModifiedTimeLabel}</span>
                <span class="project-note-count">{project.markdownFileCount} {project.markdownFileCount === 1 ? "note" : "notes"}</span>
                {#if project.lastClaudeSessionLastActivityAtMilliseconds !== null}
                  <span class="project-claude-indicator" title="Last Claude Code session in this folder">claude {formatRelativeModifiedTime(project.lastClaudeSessionLastActivityAtMilliseconds)}</span>
                {/if}
                {#if project.procrastOrigin}
                  <span class="project-origin-badge" title={describeProcrastOrigin(project.procrastOrigin)}>from Procrast {formatShortIdeaUuid(project.procrastOrigin.ideaUuid)}</span>
                {/if}
                <span class="project-detail-link">detail ▸</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if viewState === "loading"}
    <ul class="project-summary-list">
      {#each Array(3) as _, shimmerRowIndex (shimmerRowIndex)}
        <li class="project-summary-item">
          <span class="project-summary-row row-shimmer" aria-hidden="true">····················································</span>
        </li>
      {/each}
    </ul>
  {:else if viewState === "empty"}
    <div class="project-empty-state">No pinned projects yet.</div>
  {:else}
    <div class="project-empty-state">Pinned projects are unavailable.</div>
  {/if}
</WidgetPanel>

<style>
  .project-summary-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .project-summary-item {
    margin: 0;
    padding: 0;
  }

  .project-summary-row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(22ch, 1fr) minmax(0, auto);
    align-items: center;
    column-gap: var(--vault-dashboard-space-panel-inner);
    row-gap: var(--vault-dashboard-space-row);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    border-radius: var(--vault-dashboard-border-radius);
    background: transparent;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-family: var(--vault-dashboard-font-family-mono);
    line-height: var(--vault-dashboard-line-height-tight);
    min-height: 44px;
    padding: var(--vault-dashboard-space-row) var(--vault-dashboard-space-inline);
    text-align: left;
    cursor: pointer;
  }

  .project-summary-row:hover,
  .project-summary-row:focus-visible {
    border-color: var(--vault-dashboard-border-color-accent);
  }

  .project-summary-row:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .project-summary-name-block {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 0.1rem;
  }

  .project-summary-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: flex-end;
    gap: var(--vault-dashboard-space-row) var(--vault-dashboard-space-inline);
    min-width: 0;
    color: var(--vault-dashboard-text-secondary);
  }

  .project-display-name,
  .project-folder-path,
  .project-container-status,
  .project-modified-time,
  .project-note-count,
  .project-claude-indicator,
  .project-origin-badge,
  .project-detail-link,
  .project-jira-badge {
    white-space: nowrap;
  }

  .project-display-name {
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 700;
  }

  .project-folder-path,
  .project-container-status,
  .project-modified-time,
  .project-note-count,
  .project-claude-indicator,
  .project-origin-badge {
    color: var(--vault-dashboard-text-secondary);
    font-style: italic;
  }

  .project-container-bar {
    color: var(--vault-dashboard-text-faint);
  }

  .project-container-bar-cells {
    color: var(--vault-dashboard-color-accent-blue);
  }

  .project-freshness[data-freshness="active"] {
    color: var(--vault-dashboard-color-freshness-active);
  }

  .project-freshness[data-freshness="cooling"] {
    color: var(--vault-dashboard-color-freshness-cooling);
  }

  .project-freshness[data-freshness="cold"] {
    color: var(--vault-dashboard-color-freshness-cold);
  }

  .project-jira-badge,
  .project-detail-link {
    color: var(--vault-dashboard-text-accent);
    font-weight: var(--vault-dashboard-font-weight-bold);
    text-transform: lowercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-flat);
  }

  .project-empty-state {
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    padding: var(--vault-dashboard-space-panel-inner);
    color: var(--vault-dashboard-text-secondary);
    font-family: var(--vault-dashboard-font-family-mono);
  }

  .row-shimmer {
    color: var(--vault-dashboard-text-faint);
    overflow: hidden;
  }

  @keyframes vault-dashboard-container-pulse {
    0%, 100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
  }

  .is-pulsing {
    animation: vault-dashboard-container-pulse 1.4s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .is-pulsing {
      animation: none;
    }
  }

  @media (max-width: 640px) {
    .project-summary-row {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .project-summary-meta {
      justify-content: flex-start;
    }

    .project-display-name,
    .project-folder-path,
    .project-container-status,
    .project-modified-time,
    .project-note-count,
    .project-claude-indicator,
    .project-origin-badge,
    .project-detail-link,
    .project-jira-badge {
      white-space: normal;
    }
  }
</style>
