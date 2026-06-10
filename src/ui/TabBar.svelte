<script lang="ts">
  type TabBarEntry = { id: string; name: string };

  export let tabs: TabBarEntry[] = [];
  export let activeTabId: string = "";
  export let areAllWidgetsCollapsed: boolean = false;
  export let onSelectTab: (tabId: string) => void = () => {};
  export let onAddTab: () => void = () => {};
  export let onToggleCollapseAllWidgets: () => void = () => {};
  export let onRefreshAllWidgets: () => void = () => {};
  export let onOpenSettings: () => void = () => {};

  function isActiveTab(tabId: string): boolean {
    return tabId === activeTabId;
  }

  function formatTabLabelForDisplay(tab: TabBarEntry): string {
    if (isActiveTab(tab.id)) {
      return tab.name.toUpperCase();
    }
    return tab.name.toLowerCase();
  }
</script>

<nav class="tab-bar" aria-label="Dashboard tabs">
  <ul class="tab-list" role="tablist">
    {#each tabs as tab (tab.id)}
      <li class="tab-list-item">
        <button
          type="button"
          class="tab-button"
          class:is-active={isActiveTab(tab.id)}
          role="tab"
          aria-selected={isActiveTab(tab.id)}
          on:click={() => onSelectTab(tab.id)}
        >
          {#if isActiveTab(tab.id)}
            <span class="tab-bracket" aria-hidden="true">[</span>
          {/if}
          {formatTabLabelForDisplay(tab)}
          {#if isActiveTab(tab.id)}
            <span class="tab-bracket" aria-hidden="true">]</span>
          {/if}
        </button>
      </li>
    {/each}
    <li class="tab-list-item">
      <button
        type="button"
        class="tab-add-button"
        aria-label="Add a new tab"
        on:click={onAddTab}
      >
        +
      </button>
    </li>
  </ul>

  <div class="tab-bar-controls">
    <button
      type="button"
      class="tab-control-button"
      aria-label={areAllWidgetsCollapsed ? "Expand all widgets" : "Collapse all widgets"}
      title={areAllWidgetsCollapsed ? "Expand all widgets" : "Collapse all widgets"}
      on:click={onToggleCollapseAllWidgets}
    >
      {areAllWidgetsCollapsed ? "⊞" : "⊟"}
    </button>
    <button
      type="button"
      class="tab-control-button"
      aria-label="Refresh all widgets"
      on:click={onRefreshAllWidgets}
    >
      ↻
    </button>
    <button
      type="button"
      class="tab-control-button"
      aria-label="Open dashboard settings"
      on:click={onOpenSettings}
    >
      ⚙
    </button>
  </div>
</nav>

<style>
  .tab-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--vault-dashboard-space-section);
    padding: var(--vault-dashboard-space-panel-outer) var(--vault-dashboard-space-pane);
    border-bottom: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-strong);
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-body);
    background: var(--vault-dashboard-surface-background);
  }

  .tab-list {
    display: flex;
    align-items: center;
    gap: var(--vault-dashboard-space-pane);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tab-list-item {
    display: inline-flex;
  }

  .tab-button,
  .tab-add-button,
  .tab-control-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    color: var(--vault-dashboard-text-secondary);
    font-family: inherit;
    font-size: inherit;
    line-height: var(--vault-dashboard-line-height-tight);
    cursor: pointer;
    transition: color var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap);
  }

  .tab-button:hover,
  .tab-add-button:hover,
  .tab-control-button:hover {
    color: var(--vault-dashboard-text-primary);
  }

  .tab-button:focus-visible,
  .tab-add-button:focus-visible,
  .tab-control-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .tab-button.is-active {
    color: var(--vault-dashboard-text-primary);
    font-weight: var(--vault-dashboard-font-weight-bold);
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
  }

  .tab-button:not(.is-active) {
    font-style: italic;
  }

  .tab-bracket {
    color: var(--vault-dashboard-color-accent-cyan);
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .tab-bar-controls {
    display: flex;
    align-items: center;
    gap: var(--vault-dashboard-space-section);
  }
</style>
