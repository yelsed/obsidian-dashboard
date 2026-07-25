<script lang="ts">
  export let title: string;
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  /* A one-glance reading of what the panel holds — "5 / 312", "3 open", "2 failing". Seven
     identically-titled panels give the eye nothing to land on; a number in the header lets the
     dashboard be read without reading any panel's contents. */
  export let summary: string = "";
</script>

<section class="vault-dashboard-panel widget" class:is-collapsed={isCollapsed}>
  <div class="widget-panel-header" class:is-collapsed={isCollapsed}>
    <button
      type="button"
      class="widget-panel-toggle"
      aria-expanded={!isCollapsed}
      on:click={onToggleCollapsed}
    >
      <h2 class="vault-dashboard-panel-heading">{title}</h2>
      {#if summary.length > 0}
        <span class="widget-panel-summary">{summary}</span>
      {/if}
      <span class="widget-panel-chevron" aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
    </button>
    <slot name="header-actions" />
  </div>

  {#if !isCollapsed}
    <div class="widget-panel-body"><slot /></div>
  {/if}
</section>

<style>
  /* The header rule bleeds to the panel edges: negative horizontal margins cancel
     the panel's inner padding, then padding restores the text inset. This is what
     turns the heading into the full-width "RECENT FILES ──────" bar. */
  .widget-panel-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--vault-dashboard-space-inline);
    margin:
      0
      calc(-1 * var(--vault-dashboard-space-panel-outer))
      var(--vault-dashboard-space-inline);
    padding:
      0
      var(--vault-dashboard-space-panel-outer)
      var(--vault-dashboard-space-row);
    border-bottom: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-strong);
  }

  /* Collapsed keeps the exact header metrics of the expanded state (padding + rule)
     so the title bar is the same height open or closed. The body gap is removed and
     the panel's bottom padding is dropped, so the full-bleed rule lands exactly on
     the panel's bottom edge — a clean title bar, no empty band below it. */
  .widget-panel-header.is-collapsed {
    margin-bottom: 0;
  }

  .vault-dashboard-panel.is-collapsed {
    padding-bottom: 0;
  }

  /* The title claims only the space it needs; the summary sits directly beside it and the
     chevron is pushed to the far edge. Previously the title and chevron were forced apart by
     space-between, which left a wide empty band that read as a gap rather than a header. */
  .widget-panel-toggle {
    display: flex;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    flex: 1 1 auto;
    min-width: 0;
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  /* The global .vault-dashboard-panel-heading carries its own border-bottom and
     padding; the panel header owns the full-bleed rule now, so strip the heading's
     to avoid a second, text-width underline. */
  .widget-panel-toggle :global(.vault-dashboard-panel-heading) {
    margin: 0;
    padding-bottom: 0;
    border-bottom: none;
    color: var(--vault-dashboard-text-primary);
    /* The title is the anchor and must stay on one line; the summary beside it is the part
       that gives way when the column is narrow. */
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .widget-panel-summary {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-variant-numeric: tabular-nums;
  }

  .widget-panel-chevron {
    flex-shrink: 0;
    margin-left: auto;
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    transition: color var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap);
  }

  .widget-panel-toggle:hover .widget-panel-chevron {
    color: var(--vault-dashboard-text-primary);
  }

  .widget-panel-toggle:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  /* display: contents keeps the body wrapper out of layout so the slotted rows
     remain direct flex children of the panel, exactly as before WidgetPanel wrapped them. */
  .widget-panel-body {
    display: contents;
  }
</style>
