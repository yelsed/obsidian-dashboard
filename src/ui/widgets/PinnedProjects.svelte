<script lang="ts">
  import type { FreshnessLevel, PinnedProjectForWidget, ProcrastOriginForWidget } from "../../data/pinnedProjects";
  import { isRunFinished, type WorkflowRunSummary } from "../../data/githubActions";
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

  function resolveMostRecentWorkflowRunFor(
    project: PinnedProjectForWidget,
  ): WorkflowRunSummary | null {
    const snapshot = project.gitHubActionsSnapshot;
    if (snapshot === null || snapshot.availability !== "available") {
      return null;
    }
    return snapshot.recentRuns[0] ?? null;
  }

  function describeWorkflowRunGlyph(mostRecentRun: WorkflowRunSummary): string {
    if (!isRunFinished(mostRecentRun)) {
      return "◐";
    }
    if (mostRecentRun.runConclusion === "success") {
      return "✓";
    }
    if (mostRecentRun.runConclusion === "cancelled" || mostRecentRun.runConclusion === "skipped") {
      return "⊘";
    }
    return "✗";
  }

  function describeWorkflowRunOutcomeCategory(mostRecentRun: WorkflowRunSummary): string {
    if (!isRunFinished(mostRecentRun)) {
      return "active";
    }
    if (mostRecentRun.runConclusion === "success") {
      return "success";
    }
    if (mostRecentRun.runConclusion === "cancelled" || mostRecentRun.runConclusion === "skipped") {
      return "neutral";
    }
    return "failure";
  }

  function describeWorkflowRunTooltip(mostRecentRun: WorkflowRunSummary): string {
    const outcome = isRunFinished(mostRecentRun)
      ? (mostRecentRun.runConclusion ?? "completed").replace("_", " ")
      : "running";
    return `${mostRecentRun.workflowName} ${outcome} on ${mostRecentRun.headBranchName}`;
  }

  // Whichever of these is true is the reason to look at this panel right now, so the header
  // states it instead of making the reader scan every row for a red glyph.
  $: pinnedProjectsSummary =
    viewState !== "data" || pinnedProjects.length === 0
      ? ""
      : [
          `${pinnedProjects.length} pinned`,
          countProjectsWithRunningContainers(pinnedProjects) > 0
            ? `${countProjectsWithRunningContainers(pinnedProjects)} running`
            : null,
          countProjectsWithFailingWorkflow(pinnedProjects) > 0
            ? `${countProjectsWithFailingWorkflow(pinnedProjects)} ci failing`
            : null,
        ]
          .filter((onePart) => onePart !== null)
          .join(" · ");

  function countProjectsWithRunningContainers(
    projects: PinnedProjectForWidget[],
  ): number {
    return projects.filter((project) => countRunningContainersIn(project) > 0).length;
  }

  function countProjectsWithFailingWorkflow(projects: PinnedProjectForWidget[]): number {
    return projects.filter((project) => {
      const mostRecentRun = resolveMostRecentWorkflowRunFor(project);
      return (
        mostRecentRun !== null &&
        isRunFinished(mostRecentRun) &&
        mostRecentRun.runConclusion !== "success" &&
        mostRecentRun.runConclusion !== "cancelled" &&
        mostRecentRun.runConclusion !== "skipped"
      );
    }).length;
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

<WidgetPanel
  title="Pinned projects"
  summary={pinnedProjectsSummary}
  {isCollapsed}
  {onToggleCollapsed}
>
  {#if viewState === "data"}
    {#if pinnedProjects.length === 0}
      <div class="project-empty-state">No pinned projects yet.</div>
    {:else}
      <!-- The data rows are buttons carrying their own aria-labels, so this header is a visual
           legend only; announcing it again would just repeat what each row already says. -->
      <div class="project-column-header" aria-hidden="true">
        <span class="project-column-name">project</span>
        <span class="project-summary-meta">
          <span class="project-column-label project-column-label-docker">docker</span>
          <span class="project-column-label">ci</span>
          <span class="project-column-label project-column-label-age">last edit</span>
          <span class="project-column-label"></span>
        </span>
      </div>
      <ul class="project-summary-list">
        {#each pinnedProjects as project (project.id)}
          {@const mostRecentWorkflowRun = resolveMostRecentWorkflowRunFor(project)}
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
                {#if project.procrastOrigin}
                  <span class="project-origin-badge" title={describeProcrastOrigin(project.procrastOrigin)}>from Procrast {formatShortIdeaUuid(project.procrastOrigin.ideaUuid)}</span>
                {/if}
              </span>
              <!-- Every cell is rendered on every row, empty when a project has nothing to say for
                   it. A conditional cell would collapse its track and shift each row's remaining
                   signals sideways, which is what made this a run-on string rather than a table. -->
              <span class="project-summary-meta">
                <span class="project-container-bar" aria-label={describeContainerStatusFor(project)}>[<span class="project-container-bar-cells" class:is-pulsing={hasAtLeastOneRunningContainer(project)}>{renderContainerBarFor(project)}</span>]</span>
                <span class="project-container-status">{describeContainerStatusFor(project)}</span>
                <span class="project-workflow-badge" data-outcome={mostRecentWorkflowRun === null ? "none" : describeWorkflowRunOutcomeCategory(mostRecentWorkflowRun)} title={mostRecentWorkflowRun === null ? "" : describeWorkflowRunTooltip(mostRecentWorkflowRun)}>
                  {mostRecentWorkflowRun === null ? "" : `${describeWorkflowRunGlyph(mostRecentWorkflowRun)} ci`}
                </span>
                <span class="project-freshness" data-freshness={project.freshnessLevel} aria-label="Last modified {project.relativeModifiedTimeLabel}">{chooseFreshnessGlyphFor(project)}</span>
                <span class="project-modified-time">{project.relativeModifiedTimeLabel}</span>
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

  /* Mirrors the data row's outer grid and horizontal padding exactly, so each label sits over the
     column it names. Without this the row is a line of glyphs you have to already know how to read. */
  .project-column-header {
    display: grid;
    grid-template-columns: minmax(22ch, 1fr) minmax(0, auto);
    align-items: baseline;
    column-gap: var(--vault-dashboard-space-panel-inner);
    padding: 0 var(--vault-dashboard-space-inline) var(--vault-dashboard-space-row);
    margin-bottom: var(--vault-dashboard-space-row);
    /* Transparent side borders so the header's content box is inset exactly as far as the data
       row's, which carries a real border. */
    border: var(--vault-dashboard-border-width) solid transparent;
    border-bottom-color: var(--vault-dashboard-border-color-default);
    box-sizing: border-box;
  }

  .project-column-name,
  .project-column-label {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    text-transform: uppercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    white-space: nowrap;
    overflow: hidden;
  }

  .project-column-label {
    text-align: right;
  }

  /* The container bar and its status word are one idea, as are the freshness dot and the age. */
  .project-column-label-docker,
  .project-column-label-age {
    grid-column: span 2;
  }

  .project-summary-row {
    width: 100%;
    /* `all: unset` in styles.css resets box-sizing to content-box, so `width: 100%` plus padding
       and border made this button 26px wider than the list item holding it — the row overflowed
       the panel and the trailing column was pushed past its right edge. */
    box-sizing: border-box;
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

  /* Fixed tracks, sized to the widest value each signal can hold, so containers sit above
     containers and timestamps above timestamps down the whole list. */
  .project-summary-meta {
    display: grid;
    /* Sized in ch, but the last track carries a "▸" and box-drawing glyphs are wider than one
       character cell in most monospace fallbacks, so it gets headroom rather than exact ch math. */
    grid-template-columns: 7ch 9ch 5ch 2ch 6ch 12ch;
    align-items: baseline;
    justify-content: end;
    gap: var(--vault-dashboard-space-row) var(--vault-dashboard-space-inline);
    min-width: 0;
    color: var(--vault-dashboard-text-secondary);
  }

  .project-summary-meta > * {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-container-status,
  .project-modified-time,
  .project-workflow-badge {
    text-align: right;
  }

  .project-detail-link {
    text-align: right;
  }

  .project-display-name,
  .project-folder-path,
  .project-container-status,
  .project-modified-time,
  .project-origin-badge,
  .project-detail-link {
    white-space: nowrap;
  }

  /* Both lines must truncate, not just the name: a deep folder path is longer than the display
     name and would otherwise run underneath the meta column on the right. */
  .project-display-name,
  .project-folder-path {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-display-name {
    font-weight: 700;
  }

  .project-folder-path,
  .project-container-status,
  .project-modified-time,
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

  .project-workflow-badge {
    white-space: nowrap;
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .project-workflow-badge[data-outcome="success"] {
    color: var(--vault-dashboard-color-status-running);
  }

  .project-workflow-badge[data-outcome="failure"] {
    color: var(--vault-dashboard-color-status-stopped);
  }

  .project-workflow-badge[data-outcome="active"] {
    color: var(--vault-dashboard-color-freshness-cooling);
  }

  .project-workflow-badge[data-outcome="neutral"] {
    color: var(--vault-dashboard-text-faint);
  }

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

    /* Once the signals wrap, there are no columns left for the labels to sit above, and a header
       pointing at nothing is worse than none. */
    .project-column-header {
      display: none;
    }

    /* Six fixed tracks do not fit a narrow pane, so below this width the signals wrap as a
       flow again. Alignment is worth less than legibility once the row has to break anyway. */
    .project-summary-meta {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-start;
    }

    .project-summary-meta > :empty {
      display: none;
    }

    .project-display-name,
    .project-folder-path,
    .project-container-status,
    .project-modified-time,
    .project-origin-badge,
    .project-detail-link {
      white-space: normal;
    }
  }
</style>
