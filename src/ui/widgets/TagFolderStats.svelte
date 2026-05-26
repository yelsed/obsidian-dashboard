<script lang="ts">
  import WidgetPanel from "./WidgetPanel.svelte";

  type TagStat = {
    tagName: string;
    noteCount: number;
  };

  type FolderStat = {
    folderPath: string;
    noteCount: number;
  };

  type WidgetViewState = "data" | "loading" | "empty" | "error";

  const MAXIMUM_BAR_WIDTH_IN_CHARACTERS = 10;
  const BAR_FILL_CHARACTER = "█";

  export let viewState: WidgetViewState = "data";
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  export let topTags: TagStat[] = [
    { tagName: "#work", noteCount: 42 },
    { tagName: "#ideas", noteCount: 28 },
    { tagName: "#refs", noteCount: 19 },
    { tagName: "#procrast", noteCount: 11 },
  ];
  export let topFolders: FolderStat[] = [
    { folderPath: "/fivespark", noteCount: 96 },
    { folderPath: "/yelsed", noteCount: 31 },
    { folderPath: "/learning", noteCount: 14 },
  ];
  export let untaggedNoteCount: number = 7;
  export let onShowUntaggedNotes: () => void = () => {};
  export let onSelectTag: (tagName: string) => void = () => {};
  export let onSelectFolder: (folderPath: string) => void = () => {};

  function renderProportionalBarFor(noteCount: number, peakNoteCount: number): string {
    if (peakNoteCount === 0) {
      return "";
    }
    const proportion = noteCount / peakNoteCount;
    const filledCellCount = Math.max(1, Math.round(proportion * MAXIMUM_BAR_WIDTH_IN_CHARACTERS));
    return BAR_FILL_CHARACTER.repeat(filledCellCount);
  }

  $: peakTagCount = topTags.length > 0 ? Math.max(...topTags.map((tag) => tag.noteCount)) : 0;
</script>

<WidgetPanel title="Tags + folders" {isCollapsed} {onToggleCollapsed}>
  {#if viewState === "data"}
    <div class="subgroup">
      <h3 class="subgroup-heading">Tags</h3>
      <ul class="row-list">
        {#each topTags as tag}
          <li class="row">
            <button type="button" class="row-button" on:click={() => onSelectTag(tag.tagName)}>
              <span class="row-label">{tag.tagName}</span>
              <span class="row-bar" aria-hidden="true">{renderProportionalBarFor(tag.noteCount, peakTagCount)}</span>
              <span class="row-count">{tag.noteCount}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>

    <div class="subgroup">
      <h3 class="subgroup-heading">Folders</h3>
      <ul class="row-list">
        {#each topFolders as folder}
          <li class="row">
            <button type="button" class="row-button" on:click={() => onSelectFolder(folder.folderPath)}>
              <span class="row-label">{folder.folderPath}</span>
              <span class="row-spacer" aria-hidden="true"></span>
              <span class="row-count">{folder.noteCount}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>

    {#if untaggedNoteCount > 0}
      <button type="button" class="footnote-button" on:click={onShowUntaggedNotes}>
        {untaggedNoteCount} untagged notes ▸
      </button>
    {/if}
  {:else if viewState === "loading"}
    <ul class="row-list">
      {#each Array(6) as _, shimmerRowIndex (shimmerRowIndex)}
        <li class="row"><span class="row-shimmer" aria-hidden="true">····························</span></li>
      {/each}
    </ul>
  {:else if viewState === "empty"}
    <p class="widget-empty">No tagged notes in this tab's scope yet.</p>
  {:else}
    <p class="widget-error">! Could not compute tag statistics.</p>
    <p class="widget-error-hint">Reload the plugin if this persists.</p>
  {/if}
</WidgetPanel>

<style>
  .subgroup {
    margin-bottom: var(--vault-dashboard-space-section);
  }

  .subgroup:last-of-type {
    margin-bottom: 0;
  }

  .subgroup-heading {
    margin: 0 0 var(--vault-dashboard-space-inline) 0;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    color: var(--vault-dashboard-text-faint);
  }

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
    grid-template-columns: 12ch 1fr auto;
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

  .row-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .row-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .row-bar {
    color: var(--vault-dashboard-color-accent-blue);
    letter-spacing: -0.05em;
    overflow: hidden;
    white-space: nowrap;
  }

  .row-spacer {
    display: block;
  }

  .row-count {
    font-variant-numeric: tabular-nums;
    color: var(--vault-dashboard-text-secondary);
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .row-button .row-label {
    font-weight: var(--vault-dashboard-font-weight-medium);
  }

  .footnote-button {
    margin-top: var(--vault-dashboard-space-section);
    padding-top: var(--vault-dashboard-space-row);
    border-top: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    appearance: none;
    background: transparent;
    border-left: none;
    border-right: none;
    border-bottom: none;
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    font-style: italic;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .footnote-button:hover {
    color: var(--vault-dashboard-text-primary);
  }

  .footnote-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
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
