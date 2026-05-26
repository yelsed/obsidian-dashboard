<script lang="ts">
  import WidgetPanel from "./WidgetPanel.svelte";

  type RecentlyModifiedFile = {
    fileName: string;
    relativeModifiedTime: string;
    isMostRecent: boolean;
  };

  type WidgetViewState = "data" | "loading" | "empty" | "error";

  export let viewState: WidgetViewState = "data";
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  export let recentlyModifiedFiles: RecentlyModifiedFile[] = [
    { fileName: "Project plan", relativeModifiedTime: "02:14", isMostRecent: true },
    { fileName: "Meeting notes", relativeModifiedTime: "today", isMostRecent: false },
    { fileName: "Roadmap rewrite", relativeModifiedTime: "2d", isMostRecent: false },
    { fileName: "Idea: ESP32 boards", relativeModifiedTime: "3d", isMostRecent: false },
    { fileName: "Daily/2026-05-15", relativeModifiedTime: "3d", isMostRecent: false },
  ];
  export let totalRecentlyModifiedCount: number = 312;
  export let recencyWindowLabel: string = "30d";
  export let errorMessage: string = "Could not read vault metadata.";
  export let onSelectFile: (fileName: string) => void = () => {};
</script>

<WidgetPanel title="Recent files" {isCollapsed} {onToggleCollapsed}>
  {#if viewState === "data"}
    <ul class="row-list">
      {#each recentlyModifiedFiles as fileEntry}
        <li class="row" class:is-most-recent={fileEntry.isMostRecent}>
          <button
            type="button"
            class="row-button"
            on:click={() => onSelectFile(fileEntry.fileName)}
          >
            <span class="row-leading-glyph" aria-hidden="true">
              {fileEntry.isMostRecent ? ">" : " "}
            </span>
            <span class="row-label">{fileEntry.fileName}</span>
            <span class="row-trailing">{fileEntry.relativeModifiedTime}</span>
          </button>
        </li>
      {/each}
    </ul>
    <p class="widget-footnote">
      Showing {recentlyModifiedFiles.length} of {totalRecentlyModifiedCount} modified in {recencyWindowLabel}
    </p>
  {:else if viewState === "loading"}
    <ul class="row-list">
      {#each Array(5) as _, shimmerRowIndex (shimmerRowIndex)}
        <li class="row"><span class="row-shimmer" aria-hidden="true">····························</span></li>
      {/each}
    </ul>
  {:else if viewState === "empty"}
    <p class="widget-empty">No files modified in this tab's scope yet.</p>
  {:else}
    <p class="widget-error">! {errorMessage}</p>
    <p class="widget-error-hint">Reload the plugin if this persists.</p>
  {/if}
</WidgetPanel>

<style>
  .row-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .row {
    display: block;
  }

  .row-button {
    display: grid;
    grid-template-columns: 1ch 1fr auto;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    width: 100%;
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    text-align: left;
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    cursor: pointer;
    transition: color var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap);
  }

  .row-button:hover,
  .row.is-most-recent .row-button {
    color: var(--vault-dashboard-text-primary);
  }

  .row-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .row-leading-glyph {
    color: var(--vault-dashboard-color-accent-cyan);
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .row-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--vault-dashboard-font-weight-medium);
  }

  .row.is-most-recent .row-label {
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .row-trailing {
    color: var(--vault-dashboard-text-faint);
    font-variant-numeric: tabular-nums;
    font-style: italic;
    transition: color var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap);
  }

  .row.is-most-recent .row-trailing,
  .row-button:hover .row-trailing {
    color: var(--vault-dashboard-text-secondary);
  }

  .row-shimmer {
    color: var(--vault-dashboard-text-faint);
    opacity: 0.5;
  }

  .widget-footnote {
    margin: var(--vault-dashboard-space-panel-inner) 0 0 0;
    padding-top: var(--vault-dashboard-space-row);
    border-top: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    font-size: var(--vault-dashboard-font-size-label);
    color: var(--vault-dashboard-text-faint);
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
</style>
