<script lang="ts">
  type SearchableSelectOption = {
    value: string;
    label: string;
  };

  export let options: SearchableSelectOption[] = [];
  export let selectedValue: string = "";
  export let placeholderLabel: string = "select…";
  export let searchPlaceholderLabel: string = "search…";
  export let emptyResultLabel: string = "no matches";
  export let accessibleLabel: string = "";
  export let isDisabled: boolean = false;
  export let onSelect: (selectedOptionValue: string) => void = () => {};

  let rootElement: HTMLDivElement | null = null;
  let triggerElement: HTMLButtonElement | null = null;
  let isPanelOpen = false;
  let searchText = "";
  let highlightedOptionIndex = 0;

  /* A listbox is only announced correctly when the search box owns it by id and points at the
     highlighted row; without these a screen reader reads the typing but never the result. */
  const instanceId = `searchable-select-${Math.random().toString(36).slice(2, 10)}`;
  $: listboxElementId = `${instanceId}-listbox`;
  $: highlightedOptionElementId = `${instanceId}-option-${highlightedOptionIndex}`;

  // Cleared on every open so the full list is shown, which is the whole point of putting the
  // search inside the panel rather than in the closed control.
  $: normalisedSearchText = searchText.trim().toLowerCase();
  $: visibleOptions =
    normalisedSearchText.length === 0
      ? options
      : options.filter((oneOption) => oneOption.label.toLowerCase().includes(normalisedSearchText));
  $: selectedOptionLabel =
    options.find((oneOption) => oneOption.value === selectedValue)?.label ?? "";

  function openPanel(): void {
    if (isDisabled) {
      return;
    }
    searchText = "";
    highlightedOptionIndex = Math.max(
      0,
      options.findIndex((oneOption) => oneOption.value === selectedValue),
    );
    isPanelOpen = true;
  }

  /* Focus is inside the panel while it is open, so tearing the panel down without handing focus
     back would drop the keyboard user at the top of the document. */
  function closePanel(shouldReturnFocusToTrigger: boolean = false): void {
    isPanelOpen = false;
    if (shouldReturnFocusToTrigger) {
      triggerElement?.focus();
    }
  }

  function togglePanel(): void {
    if (isPanelOpen) {
      closePanel();
      return;
    }
    openPanel();
  }

  function chooseOptionAtIndex(optionIndex: number): void {
    const chosenOption = visibleOptions[optionIndex];
    if (chosenOption === undefined) {
      return;
    }
    onSelect(chosenOption.value);
    closePanel(true);
  }

  /* Hover highlighting listens for mousemove rather than mouseenter on purpose. Scrolling the
     keyboard highlight into view slides a different option under a stationary pointer, and the
     browser fires mouseenter for it — which would drag the highlight back and make the arrow keys
     look like they were dropping presses. mousemove only fires when the pointer really moves. */
  function moveHighlightBy(offset: number): void {
    if (visibleOptions.length === 0) {
      return;
    }
    const nextIndex = highlightedOptionIndex + offset;
    if (nextIndex < 0) {
      highlightedOptionIndex = visibleOptions.length - 1;
      return;
    }
    if (nextIndex >= visibleOptions.length) {
      highlightedOptionIndex = 0;
      return;
    }
    highlightedOptionIndex = nextIndex;
  }

  function handleSearchKeydown(keyboardEvent: KeyboardEvent): void {
    if (keyboardEvent.key === "ArrowDown") {
      keyboardEvent.preventDefault();
      moveHighlightBy(1);
      return;
    }
    if (keyboardEvent.key === "ArrowUp") {
      keyboardEvent.preventDefault();
      moveHighlightBy(-1);
      return;
    }
    if (keyboardEvent.key === "Enter") {
      keyboardEvent.preventDefault();
      chooseOptionAtIndex(highlightedOptionIndex);
      return;
    }
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      closePanel(true);
      return;
    }
    if (keyboardEvent.key === "Tab") {
      closePanel();
    }
  }

  function focusElementOnMount(element: HTMLElement): void {
    element.focus();
  }

  /* With a couple of hundred branches the highlight walks straight out of the scroll box, so the
     arrow keys appear to stop working. Keeping the highlighted row in view is what makes the
     keyboard path usable on a real repository. */
  function scrollHighlightedOptionIntoView(): void {
    if (!isPanelOpen || rootElement === null) {
      return;
    }
    const highlightedElement = rootElement.querySelector(`#${CSS.escape(highlightedOptionElementId)}`);
    highlightedElement?.scrollIntoView({ block: "nearest" });
  }

  $: if (isPanelOpen) {
    void highlightedOptionIndex;
    queueMicrotask(scrollHighlightedOptionIntoView);
  }

  // Closing on any click outside this component — rather than stopping propagation from inside
  // it — is what lets opening a second picker close the first one.
  function closeWhenClickLandsOutside(clickEvent: MouseEvent): void {
    if (!isPanelOpen || rootElement === null) {
      return;
    }
    if (clickEvent.target instanceof Node && rootElement.contains(clickEvent.target)) {
      return;
    }
    closePanel();
  }

  // Typing shrinks the list, so a highlight parked past the new end would make Enter do nothing.
  $: if (highlightedOptionIndex >= visibleOptions.length) {
    highlightedOptionIndex = 0;
  }
</script>

<svelte:window on:click={closeWhenClickLandsOutside} />

<div class="searchable-select" bind:this={rootElement}>
  <button
    type="button"
    class="searchable-select-trigger"
    class:is-placeholder={selectedOptionLabel.length === 0}
    bind:this={triggerElement}
    aria-label={accessibleLabel}
    aria-expanded={isPanelOpen}
    aria-haspopup="listbox"
    aria-controls={isPanelOpen ? listboxElementId : undefined}
    disabled={isDisabled}
    on:click={togglePanel}
  >
    <span class="searchable-select-value">{selectedOptionLabel || placeholderLabel}</span>
    <span class="searchable-select-chevron" aria-hidden="true">{isPanelOpen ? "▴" : "▾"}</span>
  </button>

  {#if isPanelOpen}
    <div class="searchable-select-panel">
      <input
        class="searchable-select-search"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={listboxElementId}
        aria-activedescendant={visibleOptions.length > 0 ? highlightedOptionElementId : undefined}
        aria-label={accessibleLabel}
        placeholder={searchPlaceholderLabel}
        spellcheck="false"
        autocomplete="off"
        bind:value={searchText}
        on:keydown={handleSearchKeydown}
        use:focusElementOnMount
      />

      {#if visibleOptions.length === 0}
        <p class="searchable-select-empty">{emptyResultLabel}</p>
      {:else}
        <ul class="searchable-select-list" role="listbox" id={listboxElementId} aria-label={accessibleLabel}>
          {#each visibleOptions as oneOption, optionIndex (oneOption.value)}
            <li role="presentation">
              <button
                type="button"
                class="searchable-select-option"
                class:is-highlighted={optionIndex === highlightedOptionIndex}
                class:is-selected={oneOption.value === selectedValue}
                id="{instanceId}-option-{optionIndex}"
                role="option"
                tabindex="-1"
                aria-selected={oneOption.value === selectedValue}
                on:mousemove={() => (highlightedOptionIndex = optionIndex)}
                on:click={() => chooseOptionAtIndex(optionIndex)}
              >{oneOption.label}</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .searchable-select {
    position: relative;
    flex: 1 1 10rem;
    min-width: 0;
    max-width: 22rem;
  }

  /* box-sizing is restored explicitly because the global `.vault-dashboard button { all: unset }`
     reset clears it along with everything else. */
  .searchable-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--vault-dashboard-space-inline);
    width: 100%;
    min-height: var(--vault-dashboard-control-height);
    box-sizing: border-box;
    appearance: none;
    background: var(--vault-dashboard-surface-background);
    color: var(--vault-dashboard-text-primary);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    border-radius: 0;
    padding: 0 var(--vault-dashboard-space-inline);
    font: inherit;
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-label);
    text-align: left;
    cursor: pointer;
  }

  .searchable-select-trigger:hover:not(:disabled) {
    border-color: var(--vault-dashboard-border-color-accent);
  }

  .searchable-select-trigger:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .searchable-select-trigger:disabled {
    color: var(--vault-dashboard-text-faint);
    cursor: default;
  }

  .searchable-select-trigger.is-placeholder .searchable-select-value {
    color: var(--vault-dashboard-text-faint);
    font-style: italic;
  }

  .searchable-select-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .searchable-select-chevron {
    color: var(--vault-dashboard-text-faint);
  }

  .searchable-select-panel {
    position: absolute;
    z-index: 20;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
    background: var(--vault-dashboard-surface-panel);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    padding: var(--vault-dashboard-space-row);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }

  .searchable-select-search {
    width: 100%;
    height: var(--vault-dashboard-control-height);
    box-sizing: border-box;
    appearance: none;
    background: var(--vault-dashboard-surface-background);
    color: var(--vault-dashboard-text-primary);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    border-radius: 0;
    padding: 0 var(--vault-dashboard-space-inline);
    font: inherit;
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-label);
  }

  .searchable-select-search:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: -1px;
  }

  .searchable-select-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 14rem;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Block rather than flex: `text-overflow: ellipsis` only applies to a block container's own
     text, and a long branch name has to truncate rather than run past the panel edge.
     line-height carries the vertical centring that align-items would have given. */
  .searchable-select-option {
    display: block;
    width: 100%;
    min-height: var(--vault-dashboard-control-height);
    line-height: var(--vault-dashboard-control-height);
    box-sizing: border-box;
    appearance: none;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0 var(--vault-dashboard-space-inline);
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-label);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .searchable-select-option.is-highlighted {
    background: var(--vault-dashboard-surface-background);
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .searchable-select-option.is-selected {
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .searchable-select-empty {
    margin: 0;
    padding: 0 var(--vault-dashboard-space-inline);
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
  }
</style>
