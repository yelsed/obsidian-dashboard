<script lang="ts">
  type WidgetSubTabEntry = { id: string; name: string };

  export let widgetSubTabs: WidgetSubTabEntry[] = [];
  export let activeWidgetSubTabId: string = "";
  export let onSelectWidgetSubTab: (widgetSubTabId: string) => void = () => {};

  function isActiveWidgetSubTab(widgetSubTabId: string): boolean {
    return widgetSubTabId === activeWidgetSubTabId;
  }
</script>

<nav class="widget-sub-tab-bar" aria-label="Widget sub-tabs">
  <ul class="widget-sub-tab-list" role="tablist">
    {#each widgetSubTabs as widgetSubTab (widgetSubTab.id)}
      <li class="widget-sub-tab-list-item">
        <button
          type="button"
          class="widget-sub-tab-button"
          class:is-active={isActiveWidgetSubTab(widgetSubTab.id)}
          role="tab"
          aria-selected={isActiveWidgetSubTab(widgetSubTab.id)}
          on:click={() => onSelectWidgetSubTab(widgetSubTab.id)}
        >
          {widgetSubTab.name}
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .widget-sub-tab-bar {
    display: flex;
    align-items: center;
    gap: var(--vault-dashboard-space-pane);
    padding: var(--vault-dashboard-space-inline) var(--vault-dashboard-space-pane);
    border-bottom: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-label);
    background: var(--vault-dashboard-surface-background);
  }

  .widget-sub-tab-list {
    display: flex;
    align-items: center;
    gap: var(--vault-dashboard-space-section);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .widget-sub-tab-list-item {
    display: inline-flex;
  }

  .widget-sub-tab-button {
    appearance: none;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--vault-dashboard-space-row) 0;
    margin: 0;
    color: var(--vault-dashboard-text-secondary);
    font-family: inherit;
    font-size: inherit;
    line-height: var(--vault-dashboard-line-height-tight);
    cursor: pointer;
    transition: color var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap),
      border-color var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap);
  }

  .widget-sub-tab-button:hover {
    color: var(--vault-dashboard-text-primary);
  }

  .widget-sub-tab-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .widget-sub-tab-button.is-active {
    color: var(--vault-dashboard-text-primary);
    font-weight: var(--vault-dashboard-font-weight-bold);
    border-bottom-color: var(--vault-dashboard-color-accent-cyan);
  }

  .widget-sub-tab-button:not(.is-active) {
    font-style: italic;
  }
</style>
