<script lang="ts">
  import { formatRelativeModifiedTime } from "../../data/format";
  import {
    describeRunOutcomeLabel,
    isRunFinished,
    sortWorkflowsByMostRecentRun,
    type DispatchableWorkflowSummary,
    type GitHubProjectActionsSnapshot,
    type WorkflowRunSummary,
  } from "../../data/githubActions";
  import SearchableSelect from "../SearchableSelect.svelte";

  export let pinnedProjectId: string;
  export let gitHubActionsSnapshot: GitHubProjectActionsSnapshot | null = null;
  export let onRefresh: () => void = () => {};
  export let onDispatchWorkflow: (
    pinnedProjectId: string,
    workflowFilePath: string,
    branchName: string,
  ) => void = () => {};
  export let onRerunFailedJobs: (pinnedProjectId: string, runDatabaseId: number) => void = () => {};
  export let onCancelRun: (pinnedProjectId: string, runDatabaseId: number) => void = () => {};
  export let onOpenRunInBrowser: (runBrowserUrl: string) => void = () => {};

  // Null means "the user has not picked anything yet", which is what lets both fields keep
  // tracking the newest branch and last-used workflow as polling refreshes them. Once picked,
  // the choice wins until it disappears from the repository.
  let pickedBranchName: string | null = null;
  let pickedWorkflowFilePath: string | null = null;

  $: branchNamesNewestFirst = gitHubActionsSnapshot?.branchNames ?? [];
  $: workflowsLastUsedFirst =
    gitHubActionsSnapshot === null
      ? []
      : sortWorkflowsByMostRecentRun(
          gitHubActionsSnapshot.dispatchableWorkflows,
          gitHubActionsSnapshot.recentRuns,
        );

  $: branchOptions = branchNamesNewestFirst.map((branchName) => ({
    value: branchName,
    label: branchName,
  }));
  $: workflowOptions = workflowsLastUsedFirst.map((oneWorkflow) => ({
    value: oneWorkflow.workflowFilePath,
    label: oneWorkflow.workflowName,
  }));

  $: effectiveBranchName =
    pickedBranchName !== null && branchNamesNewestFirst.includes(pickedBranchName)
      ? pickedBranchName
      : branchNamesNewestFirst[0] ?? "";

  $: effectiveWorkflowFilePath = resolveEffectiveWorkflowFilePath(
    workflowsLastUsedFirst,
    pickedWorkflowFilePath,
  );

  $: isDispatchable =
    gitHubActionsSnapshot !== null &&
    !gitHubActionsSnapshot.isDispatchInFlight &&
    effectiveBranchName.length > 0 &&
    effectiveWorkflowFilePath.length > 0;

  function resolveEffectiveWorkflowFilePath(
    dispatchableWorkflows: DispatchableWorkflowSummary[],
    explicitlyPickedFilePath: string | null,
  ): string {
    const isStillOffered = dispatchableWorkflows.some(
      (oneWorkflow) => oneWorkflow.workflowFilePath === explicitlyPickedFilePath,
    );
    if (explicitlyPickedFilePath !== null && isStillOffered) {
      return explicitlyPickedFilePath;
    }
    return dispatchableWorkflows[0]?.workflowFilePath ?? "";
  }

  function handleDispatchClick(): void {
    if (!isDispatchable) {
      return;
    }
    onDispatchWorkflow(pinnedProjectId, effectiveWorkflowFilePath, effectiveBranchName);
  }

  function describeRunGlyph(oneRun: WorkflowRunSummary): string {
    if (!isRunFinished(oneRun)) {
      return oneRun.runStatus === "in_progress" ? "◐" : "●";
    }
    if (oneRun.runConclusion === "success") {
      return "✓";
    }
    if (oneRun.runConclusion === "cancelled" || oneRun.runConclusion === "skipped") {
      return "⊘";
    }
    return "✗";
  }

  function isActionInFlightForRun(oneRun: WorkflowRunSummary): boolean {
    return gitHubActionsSnapshot?.runIdsWithActionInFlight.includes(oneRun.runDatabaseId) ?? false;
  }

  function describeRunOutcomeCategory(oneRun: WorkflowRunSummary): string {
    if (!isRunFinished(oneRun)) {
      return "active";
    }
    if (oneRun.runConclusion === "success") {
      return "success";
    }
    if (oneRun.runConclusion === "cancelled" || oneRun.runConclusion === "skipped") {
      return "neutral";
    }
    return "failure";
  }

  function isRerunnable(oneRun: WorkflowRunSummary): boolean {
    return isRunFinished(oneRun) && oneRun.runConclusion !== "success";
  }
</script>

<section class="project-detail-section">
  <div class="section-header">
    <h3 class="section-heading">GitHub Actions</h3>
    {#if gitHubActionsSnapshot !== null}
      <button type="button" class="section-refresh-button" on:click={onRefresh}>refresh ↻</button>
    {/if}
  </div>

  {#if gitHubActionsSnapshot === null}
    <p class="section-empty">This folder is not a GitHub repository.</p>
  {:else if gitHubActionsSnapshot.availability === "checking"}
    <p class="row-shimmer" aria-hidden="true">·········································</p>
  {:else if gitHubActionsSnapshot.availability === "not-installed"}
    <p class="section-empty">Install the GitHub CLI (<code>brew install gh</code>) to see workflow runs.</p>
  {:else if gitHubActionsSnapshot.availability === "unauthenticated"}
    <p class="section-empty">Run <code>gh auth login</code> in a terminal to see workflow runs.</p>
  {:else if gitHubActionsSnapshot.availability === "rate-limited"}
    <p class="section-empty">GitHub rate limit reached. Runs reappear once it resets.</p>
  {:else if gitHubActionsSnapshot.availability === "errored"}
    <p class="section-error">! Could not read workflow runs.</p>
    <p class="section-error-hint" title={gitHubActionsSnapshot.lastErrorMessage ?? ""}>
      {gitHubActionsSnapshot.lastErrorMessage ?? "Reload the plugin if this persists."}
    </p>
  {:else}
    <div class="dispatch-row">
      <SearchableSelect
        options={branchOptions}
        selectedValue={effectiveBranchName}
        accessibleLabel="Branch to run on"
        placeholderLabel="branch"
        searchPlaceholderLabel="search branches…"
        emptyResultLabel="no branch matches"
        isDisabled={branchOptions.length === 0}
        onSelect={(branchName) => (pickedBranchName = branchName)}
      />

      <span class="dispatch-glyph" aria-hidden="true">▸</span>
      <SearchableSelect
        options={workflowOptions}
        selectedValue={effectiveWorkflowFilePath}
        accessibleLabel="Workflow to run"
        placeholderLabel="workflow"
        searchPlaceholderLabel="search workflows…"
        emptyResultLabel="no workflow matches"
        isDisabled={workflowOptions.length === 0}
        onSelect={(workflowFilePath) => (pickedWorkflowFilePath = workflowFilePath)}
      />

      <button
        type="button"
        class="dispatch-button"
        disabled={!isDispatchable}
        on:click={handleDispatchClick}
      >
        {gitHubActionsSnapshot.isDispatchInFlight ? "running…" : "run ▸"}
      </button>
    </div>

    {#if gitHubActionsSnapshot.branchListWasTruncated}
      <p class="section-note">Showing the {gitHubActionsSnapshot.branchNames.length} most recently committed branches.</p>
    {/if}

    {#if gitHubActionsSnapshot.lastErrorMessage !== null}
      <p class="section-error" title={gitHubActionsSnapshot.lastErrorMessage}>
        ! {gitHubActionsSnapshot.lastErrorMessage}
      </p>
    {/if}

    {#if gitHubActionsSnapshot.recentRuns.length === 0}
      <p class="section-empty">No workflow runs yet.</p>
    {:else}
      <ul class="run-list">
        {#each gitHubActionsSnapshot.recentRuns as oneRun (oneRun.runDatabaseId)}
          <li class="run-row" data-outcome={describeRunOutcomeCategory(oneRun)}>
            <span class="run-glyph">{describeRunGlyph(oneRun)}</span>
            <span class="run-workflow-name">{oneRun.workflowName}</span>
            <span class="run-branch">{oneRun.headBranchName}</span>
            <span class="run-outcome">{describeRunOutcomeLabel(oneRun)}</span>
            <span class="run-time">{formatRelativeModifiedTime(oneRun.createdAtEpochMilliseconds)}</span>
            <span class="run-actions">
              {#if isRerunnable(oneRun)}
                <button
                  type="button"
                  class="run-action-button"
                  title="Re-run the failed jobs of this run"
                  disabled={isActionInFlightForRun(oneRun)}
                  on:click={() => onRerunFailedJobs(pinnedProjectId, oneRun.runDatabaseId)}
                >{isActionInFlightForRun(oneRun) ? "rerun…" : "rerun ↻"}</button>
              {/if}
              {#if !isRunFinished(oneRun)}
                <button
                  type="button"
                  class="run-action-button"
                  title="Cancel this run"
                  disabled={isActionInFlightForRun(oneRun)}
                  on:click={() => onCancelRun(pinnedProjectId, oneRun.runDatabaseId)}
                >{isActionInFlightForRun(oneRun) ? "cancel…" : "cancel ✕"}</button>
              {/if}
              <button
                type="button"
                class="run-action-button"
                title="Open this run on github.com"
                on:click={() => onOpenRunInBrowser(oneRun.runBrowserUrl)}
              >↗</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  /* Svelte scopes styles per component, so the surface treatment that PinnedProjectDetail
     gives its own sections does not reach this one. Both are expressed purely in shared
     design tokens, so they stay in step without a shared stylesheet. */
  .project-detail-section {
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    background: var(--vault-dashboard-surface-panel);
    padding: var(--vault-dashboard-space-panel-inner);
  }

  /* The rule bleeds to the section edges the same way WidgetPanel's does: negative horizontal
     margins cancel the section padding, then padding restores the text inset. */
  .section-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--vault-dashboard-space-inline);
    margin:
      0
      calc(-1 * var(--vault-dashboard-space-panel-inner))
      var(--vault-dashboard-space-row);
    padding:
      0
      var(--vault-dashboard-space-panel-inner)
      var(--vault-dashboard-space-row);
    border-bottom: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-strong);
  }

  .section-heading {
    margin: 0;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    color: var(--vault-dashboard-text-primary);
  }

  .section-refresh-button {
    flex: 0 0 auto;
    box-sizing: border-box;
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

  .section-refresh-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .section-refresh-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .run-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Reads as one command line — branch, then workflow, then the trigger — rather than three
     unrelated controls floating in the section. */
  .dispatch-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--vault-dashboard-space-row);
    padding: var(--vault-dashboard-space-row) var(--vault-dashboard-space-inline);
    background: var(--vault-dashboard-surface-background);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
  }

  .dispatch-glyph {
    flex: 0 0 auto;
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    line-height: 1;
  }

  /* The global `.vault-dashboard button { all: unset }` reset also drops min-width to 0, so a
     button in a flex row will happily shrink until its own label spills past its border. Every
     button in this section pins its basis instead of relying on content size. */
  .dispatch-button {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    box-sizing: border-box;
    margin-left: auto;
    appearance: none;
    background: var(--vault-dashboard-color-accent-blue);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-color-accent-blue);
    border-radius: 0;
    min-height: var(--vault-dashboard-control-height);
    padding: 0 var(--vault-dashboard-space-inline);
    color: var(--vault-dashboard-text-on-accent);
    font: inherit;
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    text-transform: uppercase;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap),
      color var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap);
  }

  .dispatch-button:hover:not(:disabled) {
    background: transparent;
    color: var(--vault-dashboard-color-accent-blue);
  }

  .dispatch-button:disabled {
    background: transparent;
    border-color: var(--vault-dashboard-border-color-default);
    color: var(--vault-dashboard-text-faint);
    cursor: default;
  }

  .run-row {
    display: grid;
    /* Every track except the name is a fixed size on purpose: each row is its own grid, so an
       `auto` track would be measured per row and the columns would stagger down the list. */
    grid-template-columns: 1ch minmax(0, 1fr) 18ch 10ch 5ch 12ch;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    padding: var(--vault-dashboard-space-row);
    border-bottom: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    transition: background var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap);
  }

  .run-row:last-child {
    border-bottom: none;
  }

  .run-row:hover {
    background: var(--vault-dashboard-surface-panel-hover);
  }

  .run-glyph {
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .run-row[data-outcome="success"] .run-glyph {
    color: var(--vault-dashboard-color-status-running);
  }

  .run-row[data-outcome="failure"] .run-glyph,
  .run-row[data-outcome="failure"] .run-outcome {
    color: var(--vault-dashboard-color-status-stopped);
  }

  .run-row[data-outcome="active"] .run-glyph,
  .run-row[data-outcome="active"] .run-outcome {
    color: var(--vault-dashboard-color-freshness-cooling);
  }

  .run-row[data-outcome="neutral"] .run-glyph {
    color: var(--vault-dashboard-text-faint);
  }

  /* An unfinished run is the one thing worth looking at, so it is the only row at full strength. */
  .run-workflow-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vault-dashboard-text-secondary);
  }

  .run-row[data-outcome="active"] .run-workflow-name {
    color: var(--vault-dashboard-text-primary);
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  /* Failures keep their prominence through contrast on the name and colour on the glyph and
     outcome word, rather than a coloured edge stripe. */
  .run-row[data-outcome="failure"] .run-workflow-name {
    color: var(--vault-dashboard-text-primary);
  }

  .run-branch {
    justify-self: start;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 6px;
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
  }

  .run-time {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  .run-outcome {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--vault-dashboard-text-secondary);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    white-space: nowrap;
  }

  .run-action-button:disabled {
    color: var(--vault-dashboard-text-faint);
    cursor: default;
  }

  .run-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--vault-dashboard-space-row);
    white-space: nowrap;
  }

  /* Row actions stay out of the way until the row is under the pointer or reached by keyboard,
     so the list reads as data first and a control panel second. */
  .run-action-button {
    flex: 0 0 auto;
    box-sizing: border-box;
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--vault-dashboard-text-faint);
    font: inherit;
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-label);
    opacity: 0;
    cursor: pointer;
    transition: opacity var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap);
  }

  .run-row:hover .run-action-button,
  .run-action-button:focus-visible {
    opacity: 1;
    color: var(--vault-dashboard-text-secondary);
  }

  .run-action-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .run-action-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .run-action-button {
      opacity: 1;
    }
  }

  .section-empty {
    margin: 0;
    color: var(--vault-dashboard-text-secondary);
  }

  /* `gh` stderr is unbounded — a DNS failure returns three sentences and two URLs. Clamping keeps
     one bad poll from pushing the run list off screen; the full text stays in the title attribute
     and can still be selected and copied. */
  .section-error,
  .section-error-hint {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .section-error {
    margin: 0;
    color: var(--vault-dashboard-color-status-stopped);
  }

  .section-error-hint {
    margin: var(--vault-dashboard-space-row) 0 0 0;
    color: var(--vault-dashboard-text-secondary);
    font-size: var(--vault-dashboard-font-size-label);
  }

  .section-note {
    margin: 0;
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
  }

  .row-shimmer {
    color: var(--vault-dashboard-text-faint);
    opacity: 0.5;
  }
</style>
