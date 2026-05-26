<script lang="ts">
  import WidgetPanel from "./WidgetPanel.svelte";

  type WidgetViewState = "data" | "loading" | "empty" | "error";

  type OrphanNoteEntry = {
    filePath: string;
    displayLabel: string;
  };

  type HubNoteEntry = {
    filePath: string;
    displayLabel: string;
    incomingLinkCount: number;
  };

  type BrokenLinkEntry = {
    sourceFilePath: string;
    unresolvedTargetName: string;
  };

  export let viewState: WidgetViewState = "data";
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  export let orphanNoteCount: number = 0;
  export let orphanNotes: OrphanNoteEntry[] = [];
  export let hubNoteLabels: string[] = [];
  export let hubNotes: HubNoteEntry[] = [];
  export let brokenLinkCount: number = 0;
  export let brokenLinks: BrokenLinkEntry[] = [];
  export let mostLinkedNoteFileName: string = "(none)";
  export let mostLinkedNoteFilePath: string = "";
  export let mostLinkedNoteIncomingLinkCount: number = 0;
  export let mostLinkingNoteFileName: string = "(none)";
  export let mostLinkingNoteFilePath: string = "";
  export let mostLinkingNoteOutgoingLinkCount: number = 0;
  export let onOpenFileByPath: (filePath: string) => void = () => {};

  let isOrphanListExpanded = false;
  let isBrokenLinkListExpanded = false;

  function toggleOrphanList(): void {
    isOrphanListExpanded = !isOrphanListExpanded;
  }

  function toggleBrokenLinkList(): void {
    isBrokenLinkListExpanded = !isBrokenLinkListExpanded;
  }

  function handleOpenIfPathAvailable(filePath: string): void {
    if (filePath.length === 0) {
      return;
    }
    onOpenFileByPath(filePath);
  }
</script>

<WidgetPanel title="Graph" {isCollapsed} {onToggleCollapsed}>
  {#if viewState === "data"}
    <ul class="metric-list">
      <li class="metric-row">
        <span class="metric-label">Orphans</span>
        <button
          type="button"
          class="metric-value-button"
          aria-expanded={isOrphanListExpanded}
          on:click={toggleOrphanList}
          disabled={orphanNoteCount === 0}
        >
          {orphanNoteCount} {isOrphanListExpanded ? "▾" : "▸"}
        </button>
      </li>
      {#if isOrphanListExpanded && orphanNotes.length > 0}
        <li class="metric-detail">
          <ul class="drilldown-list">
            {#each orphanNotes as orphanNote (orphanNote.filePath)}
              <li class="drilldown-row">
                <button
                  type="button"
                  class="drilldown-button"
                  on:click={() => onOpenFileByPath(orphanNote.filePath)}
                  title={orphanNote.filePath}
                >
                  {orphanNote.displayLabel}
                </button>
                <span class="drilldown-secondary">{orphanNote.filePath}</span>
              </li>
            {/each}
            {#if orphanNoteCount > orphanNotes.length}
              <li class="drilldown-overflow">
                … {orphanNoteCount - orphanNotes.length} more
              </li>
            {/if}
          </ul>
        </li>
      {/if}

      <li class="metric-row">
        <span class="metric-label">Hubs</span>
        {#if hubNotes.length > 0}
          <span class="metric-hub-list">
            {#each hubNotes as hubNote, hubIndex (hubNote.filePath)}
              {#if hubIndex > 0}<span class="metric-separator">,&nbsp;</span>{/if}
              <button
                type="button"
                class="metric-value-button metric-inline-button"
                on:click={() => onOpenFileByPath(hubNote.filePath)}
                title="{hubNote.filePath} — {hubNote.incomingLinkCount} incoming"
              >
                {hubNote.displayLabel}
              </button>
            {/each}
          </span>
        {:else}
          <span class="metric-value-muted">{hubNoteLabels.length > 0 ? hubNoteLabels.join(", ") : "(none)"}</span>
        {/if}
      </li>

      <li class="metric-row">
        <span class="metric-label">Broken links</span>
        <button
          type="button"
          class="metric-value-button"
          aria-expanded={isBrokenLinkListExpanded}
          on:click={toggleBrokenLinkList}
          disabled={brokenLinkCount === 0}
        >
          {brokenLinkCount} {isBrokenLinkListExpanded ? "▾" : "▸"}
        </button>
      </li>
      {#if isBrokenLinkListExpanded && brokenLinks.length > 0}
        <li class="metric-detail">
          <ul class="drilldown-list">
            {#each brokenLinks as brokenLink (brokenLink.sourceFilePath + "::" + brokenLink.unresolvedTargetName)}
              <li class="drilldown-row">
                <button
                  type="button"
                  class="drilldown-button"
                  on:click={() => onOpenFileByPath(brokenLink.sourceFilePath)}
                  title="Open {brokenLink.sourceFilePath}"
                >
                  {brokenLink.sourceFilePath}
                </button>
                <span class="drilldown-arrow" aria-hidden="true">→</span>
                <span class="drilldown-broken-target">{brokenLink.unresolvedTargetName}</span>
              </li>
            {/each}
            {#if brokenLinkCount > brokenLinks.length}
              <li class="drilldown-overflow">
                … {brokenLinkCount - brokenLinks.length} more
              </li>
            {/if}
          </ul>
        </li>
      {/if}

      <li class="metric-row">
        <span class="metric-label">Most linked</span>
        <button
          type="button"
          class="metric-value-button"
          on:click={() => handleOpenIfPathAvailable(mostLinkedNoteFilePath)}
          disabled={mostLinkedNoteFilePath.length === 0}
          title={mostLinkedNoteFilePath}
        >
          {mostLinkedNoteFileName}
          <span class="metric-suffix">({mostLinkedNoteIncomingLinkCount} in)</span>
        </button>
      </li>

      <li class="metric-row">
        <span class="metric-label">Most linking</span>
        <button
          type="button"
          class="metric-value-button"
          on:click={() => handleOpenIfPathAvailable(mostLinkingNoteFilePath)}
          disabled={mostLinkingNoteFilePath.length === 0}
          title={mostLinkingNoteFilePath}
        >
          {mostLinkingNoteFileName}
          <span class="metric-suffix">({mostLinkingNoteOutgoingLinkCount} out)</span>
        </button>
      </li>
    </ul>
  {:else if viewState === "loading"}
    <ul class="metric-list">
      {#each Array(5) as _, shimmerRowIndex (shimmerRowIndex)}
        <li class="metric-row"><span class="row-shimmer" aria-hidden="true">·····························</span></li>
      {/each}
    </ul>
  {:else if viewState === "empty"}
    <p class="widget-empty">Vault graph not yet indexed for this tab's scope.</p>
  {:else}
    <p class="widget-error">! Could not read graph data.</p>
    <p class="widget-error-hint">Reload the plugin if this persists.</p>
  {/if}
</WidgetPanel>

<style>
  .metric-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .metric-row {
    display: grid;
    grid-template-columns: 14ch 1fr;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
  }

  .metric-label {
    color: var(--vault-dashboard-text-secondary);
    font-style: italic;
  }

  .metric-value-muted {
    color: var(--vault-dashboard-text-faint);
  }

  .metric-value-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-weight: var(--vault-dashboard-font-weight-medium);
    cursor: pointer;
    text-align: left;
  }

  .metric-value-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .metric-value-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .metric-value-button:disabled {
    color: var(--vault-dashboard-text-faint);
    cursor: default;
  }

  .metric-value-button:disabled:hover {
    color: var(--vault-dashboard-text-faint);
  }

  .metric-inline-button {
    display: inline;
  }

  .metric-hub-list {
    display: inline;
    color: var(--vault-dashboard-text-primary);
  }

  .metric-separator {
    color: var(--vault-dashboard-text-faint);
  }

  .metric-suffix {
    color: var(--vault-dashboard-text-faint);
    font-variant-numeric: tabular-nums;
    font-style: italic;
    font-weight: var(--vault-dashboard-font-weight-regular);
  }

  .metric-detail {
    grid-column: 1 / -1;
    padding: var(--vault-dashboard-space-row) 0 var(--vault-dashboard-space-row) var(--vault-dashboard-space-section);
    border-left: 2px solid var(--vault-dashboard-border-color-strong);
    margin-left: var(--vault-dashboard-space-row);
  }

  .drilldown-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .drilldown-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
  }

  .drilldown-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-weight: var(--vault-dashboard-font-weight-medium);
    cursor: pointer;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drilldown-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .drilldown-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .drilldown-secondary {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drilldown-arrow {
    color: var(--vault-dashboard-text-faint);
  }

  .drilldown-broken-target {
    color: var(--vault-dashboard-color-status-stopped);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drilldown-overflow {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
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
