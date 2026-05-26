<script lang="ts">
  export let title: string;
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
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
      var(--vault-dashboard-space-panel-inner);
    padding:
      0
      var(--vault-dashboard-space-panel-outer)
      var(--vault-dashboard-space-panel-inner);
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

  .widget-panel-toggle {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
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
  }

  .widget-panel-chevron {
    flex-shrink: 0;
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
