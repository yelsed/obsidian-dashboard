<script lang="ts">
  import {
    resolveProcrastIdeaTitle,
    type ProcrastIdea,
    type ProcrastSnapshot,
  } from "../../data/procrast";
  import WidgetPanel from "./WidgetPanel.svelte";

  type ProcrastWidgetViewState = "checking" | "available" | "not-installed" | "unauthenticated" | "errored";

  export let procrastSnapshot: ProcrastSnapshot = {
    availability: "checking",
    ideas: [],
    lastErrorMessage: null,
    lastUpdatedAtMilliseconds: null,
  };
  export let relevanceTerms: string[] = [];
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  export let onCopyIdeaUuid: (ideaUuid: string) => void = () => {};
  export let onPlanHere: (idea: ProcrastIdea) => void = () => {};
  export let onMarkDone: (idea: ProcrastIdea) => void = () => {};
  export let onShowDetails: (idea: ProcrastIdea) => void = () => {};
  export let onRefresh: () => void = () => {};

  $: viewState = procrastSnapshot.availability as ProcrastWidgetViewState;
  $: normalisedRelevanceTerms = relevanceTerms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 2);


  function isIdeaRelevantToActiveTab(idea: ProcrastIdea): boolean {
    if (normalisedRelevanceTerms.length === 0) {
      return false;
    }
    const searchableIdeaText = [
      idea.summaryTitle,
      idea.content,
      idea.refinedContent,
      idea.refinementSummary,
      idea.actionSteps.join(" "),
      idea.creativeAngles.join(" "),
      idea.keyQuestions.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return normalisedRelevanceTerms.some((term) => searchableIdeaText.includes(term));
  }

  function formatPriorityLabel(priority: string): string {
    const trimmedPriority = priority.trim();
    return trimmedPriority.length > 0 ? trimmedPriority : "normal";
  }

  function formatShortDateLabel(dateValue: string | null): string | null {
    if (dateValue === null || dateValue.trim().length === 0) {
      return null;
    }
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return dateValue;
    }
    return parsedDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: parsedDate.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });
  }

  function describeRefinementState(idea: ProcrastIdea): string {
    if (idea.refinedContent.trim().length > 0 || idea.refinementSummary.trim().length > 0) {
      return "refined";
    }
    return "raw";
  }

  function buildIdeaPreview(idea: ProcrastIdea): string {
    const previewSource = idea.refinementSummary.trim() || idea.refinedContent.trim() || idea.content.trim();
    if (previewSource.length <= 220) {
      return previewSource;
    }
    return `${previewSource.slice(0, 217)}…`;
  }

  function formatIdeaNumber(ideaIndex: number): string {
    return String(ideaIndex + 1).padStart(2, "0");
  }

  function shortUuid(ideaUuid: string): string {
    return ideaUuid.length > 8 ? ideaUuid.slice(0, 8) : ideaUuid;
  }

</script>

<WidgetPanel title="Procrast ideas" {isCollapsed} {onToggleCollapsed}>
  <button slot="header-actions" type="button" class="procrast-refresh-button" on:click={onRefresh}>refresh</button>

  {#if viewState === "available"}
    <p class="procrast-widget-subline">{procrastSnapshot.ideas.length} open, smart sorted</p>
  {/if}

  {#if viewState === "checking"}
    <p class="row-shimmer" aria-hidden="true">·········································</p>
  {:else if viewState === "not-installed"}
    <p class="widget-empty">Procrast CLI not found.</p>
    <p class="widget-error-hint">Install Procrast or make sure the procrast command is on PATH.</p>
  {:else if viewState === "unauthenticated"}
    <p class="widget-empty">Log in to Procrast from a terminal.</p>
    <p class="widget-error-hint">Run procrast login, then refresh this widget.</p>
  {:else if viewState === "errored"}
    <p class="widget-error">! Could not load Procrast ideas.</p>
    {#if procrastSnapshot.lastErrorMessage !== null}
      <p class="widget-error-hint">{procrastSnapshot.lastErrorMessage}</p>
    {/if}
  {:else if procrastSnapshot.ideas.length === 0}
    <p class="widget-empty">No open Procrast ideas.</p>
  {:else}
    <ul class="procrast-idea-list">
      {#each procrastSnapshot.ideas as idea, ideaIndex (idea.uuid)}
        {@const dueDateLabel = formatShortDateLabel(idea.dueDate)}
        {@const updatedAtLabel = formatShortDateLabel(idea.updatedAt)}
        {@const isRelevant = isIdeaRelevantToActiveTab(idea)}
        <li class="procrast-idea-row" class:is-relevant={isRelevant}>
          <div class="procrast-idea-index" aria-hidden="true">{formatIdeaNumber(ideaIndex)}</div>

          <div class="procrast-idea-main">
            <div class="procrast-idea-title-row">
              <h3 class="procrast-idea-title">{resolveProcrastIdeaTitle(idea)}</h3>
              <span class="procrast-idea-priority">{formatPriorityLabel(idea.priority)}</span>
            </div>

            <div class="procrast-idea-meta-row">
              <span>{describeRefinementState(idea)}</span>
              <span aria-hidden="true">·</span>
              <span>{shortUuid(idea.uuid)}</span>
              {#if dueDateLabel !== null}
                <span aria-hidden="true">·</span>
                <span>due {dueDateLabel}</span>
              {:else if updatedAtLabel !== null}
                <span aria-hidden="true">·</span>
                <span>updated {updatedAtLabel}</span>
              {/if}
              {#if isRelevant}
                <span aria-hidden="true">·</span>
                <span class="procrast-idea-relevance">matches tab</span>
              {/if}
            </div>

            <p class="procrast-idea-preview">{buildIdeaPreview(idea)}</p>

          </div>

          <div class="procrast-idea-actions" aria-label="Actions for {resolveProcrastIdeaTitle(idea)}">
            <button
              type="button"
              class="procrast-action-button"
              on:click={() => onShowDetails(idea)}
            >
              details
            </button>
            <button type="button" class="procrast-action-button" on:click={() => onCopyIdeaUuid(idea.uuid)}>
              copy uuid
            </button>
            <button type="button" class="procrast-action-button primary" on:click={() => onPlanHere(idea)}>
              plan here
            </button>
            <button type="button" class="procrast-action-button danger" on:click={() => onMarkDone(idea)}>
              done
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</WidgetPanel>

<style>
  .procrast-widget-subline {
    margin: 0 0 var(--vault-dashboard-space-panel-inner);
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    text-transform: lowercase;
  }

  .procrast-refresh-button,
  .procrast-action-button {
    appearance: none;
    background: transparent;
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    color: var(--vault-dashboard-text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    padding: 2px var(--vault-dashboard-space-row);
    text-transform: lowercase;
    transition: border-color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap),
                color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap),
                background-color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap);
  }

  .procrast-refresh-button:hover,
  .procrast-action-button:hover {
    border-color: var(--vault-dashboard-color-accent-cyan);
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .procrast-refresh-button:focus-visible,
  .procrast-action-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .procrast-idea-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: var(--vault-dashboard-space-panel-inner);
    align-items: start;
  }

  .procrast-idea-row {
    display: grid;
    grid-template-columns: 3ch minmax(0, 1fr);
    grid-template-rows: auto auto;
    gap: 0 var(--vault-dashboard-space-inline);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    background: var(--vault-dashboard-surface-background);
    padding: var(--vault-dashboard-space-panel-inner);
  }

  .procrast-idea-row.is-relevant {
    border-color: color-mix(in srgb, var(--vault-dashboard-color-accent-cyan) 55%, var(--vault-dashboard-border-color-default));
  }

  .procrast-idea-index {
    grid-row: 1 / span 2;
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    line-height: var(--vault-dashboard-line-height-default);
    padding-top: 2px;
  }

  .procrast-idea-main {
    min-width: 0;
  }

  .procrast-idea-title-row,
  .procrast-idea-meta-row,
  .procrast-idea-actions {
    display: flex;
    align-items: baseline;
    gap: var(--vault-dashboard-space-row);
  }

  .procrast-idea-title-row {
    justify-content: space-between;
  }

  .procrast-idea-title {
    min-width: 0;
    margin: 0;
    color: var(--vault-dashboard-text-primary);
    font-size: var(--vault-dashboard-font-size-body);
    font-weight: var(--vault-dashboard-font-weight-bold);
    line-height: var(--vault-dashboard-line-height-default);
  }

  .procrast-idea-priority,
  .procrast-idea-meta-row {
    color: var(--vault-dashboard-text-secondary);
    font-size: var(--vault-dashboard-font-size-label);
    text-transform: lowercase;
  }

  .procrast-idea-meta-row {
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .procrast-idea-relevance,
  .procrast-action-button.primary {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .procrast-idea-preview {
    margin: var(--vault-dashboard-space-row) 0 0;
    color: var(--vault-dashboard-text-secondary);
    white-space: pre-wrap;
  }

  .procrast-idea-preview {
    max-width: 72ch;
  }

  .procrast-idea-actions {
    grid-column: 2;
    flex-wrap: wrap;
    margin-top: var(--vault-dashboard-space-panel-inner);
  }


  .procrast-action-button.danger {
    color: var(--vault-dashboard-text-secondary);
  }

  .procrast-action-button.danger:hover {
    border-color: var(--vault-dashboard-color-status-stopped);
    color: var(--vault-dashboard-color-status-stopped);
  }


  @media (max-width: 720px) {
    .procrast-idea-list {
      grid-template-columns: 1fr;
    }
  }
</style>
