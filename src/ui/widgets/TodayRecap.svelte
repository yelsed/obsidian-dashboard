<script lang="ts">
  import { tick } from "svelte";
  import WidgetPanel from "./WidgetPanel.svelte";
  import type { TodayRecapSnapshot } from "../../data/today";

  export let snapshot: TodayRecapSnapshot = {
    createdTodayFiles: [{ fileName: "Release notes", filePath: "Release notes.md" }],
    createdTodayCount: 1,
    editedTodayFiles: [
      { fileName: "Roadmap", filePath: "Roadmap.md" },
      { fileName: "Fivespark", filePath: "Fivespark.md" },
    ],
    editedTodayCount: 2,
    dayStreakLength: 4,
    nextWorkdayBasename: "2026-05-25",
    nextWorkdayHeadingLabel: "Mon 2026-05-25",
    nextWorkdayNoteExists: true,
    nextWorkdayQueuedTasks: ["Ship the staging build", "Review the worker retry PR"],
  };
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  export let onOpenFile: (filePath: string) => void = () => {};
  export let onAddNextWorkdayTask: (
    taskText: string,
  ) => Promise<boolean | void> | boolean | void = () => {};
  export let onOpenNextWorkdayNote: () => void = () => {};

  let newNextWorkdayTaskText = "";
  let isAddingNextWorkdayTask = false;
  let nextWorkdayTaskInputElement: HTMLInputElement | null = null;

  $: hasTouchedAnythingToday =
    snapshot.createdTodayCount > 0 || snapshot.editedTodayCount > 0;

  async function handleAddNextWorkdayTaskSubmit(): Promise<void> {
    const trimmedTaskText = newNextWorkdayTaskText.trim();
    if (trimmedTaskText.length === 0 || isAddingNextWorkdayTask) {
      return;
    }
    isAddingNextWorkdayTask = true;
    try {
      const didAddTask = await onAddNextWorkdayTask(trimmedTaskText);
      if (didAddTask !== false) {
        newNextWorkdayTaskText = "";
      }
    } finally {
      isAddingNextWorkdayTask = false;
      await tick();
      nextWorkdayTaskInputElement?.focus();
    }
  }

  function describeDayCount(dayCount: number): string {
    return dayCount === 1 ? "1 day" : `${dayCount} days`;
  }
</script>

<WidgetPanel title="Today" {isCollapsed} {onToggleCollapsed}>
  <ul class="recap-metric-list">
    <li class="recap-metric-row">
      <span class="recap-metric-label">created</span>
      <span class="recap-metric-value">{snapshot.createdTodayCount}</span>
    </li>
    <li class="recap-metric-row">
      <span class="recap-metric-label">edited</span>
      <span class="recap-metric-value">{snapshot.editedTodayCount}</span>
    </li>
    <li class="recap-metric-row">
      <span class="recap-metric-label">streak</span>
      <span class="recap-metric-value">{describeDayCount(snapshot.dayStreakLength)}</span>
    </li>
  </ul>

  {#if !hasTouchedAnythingToday}
    <p class="widget-empty">Nothing touched yet today.</p>
  {:else}
    {#if snapshot.createdTodayFiles.length > 0}
      <div class="touched-group">
        <h3 class="section-heading">Created</h3>
        <ul class="touched-list">
          {#each snapshot.createdTodayFiles as touchedFile (touchedFile.filePath)}
            <li class="touched-row">
              <button
                type="button"
                class="touched-button"
                on:click={() => onOpenFile(touchedFile.filePath)}
              >
                {touchedFile.fileName}
              </button>
            </li>
          {/each}
          {#if snapshot.createdTodayCount > snapshot.createdTodayFiles.length}
            <li class="touched-overflow">
              … {snapshot.createdTodayCount - snapshot.createdTodayFiles.length} more
            </li>
          {/if}
        </ul>
      </div>
    {/if}

    {#if snapshot.editedTodayFiles.length > 0}
      <div class="touched-group">
        <h3 class="section-heading">Edited</h3>
        <ul class="touched-list">
          {#each snapshot.editedTodayFiles as touchedFile (touchedFile.filePath)}
            <li class="touched-row">
              <button
                type="button"
                class="touched-button"
                on:click={() => onOpenFile(touchedFile.filePath)}
              >
                {touchedFile.fileName}
              </button>
            </li>
          {/each}
          {#if snapshot.editedTodayCount > snapshot.editedTodayFiles.length}
            <li class="touched-overflow">
              … {snapshot.editedTodayCount - snapshot.editedTodayFiles.length} more
            </li>
          {/if}
        </ul>
      </div>
    {/if}
  {/if}

  <div class="plan-section">
    <div class="plan-heading-row">
      <h3 class="section-heading">Plan {snapshot.nextWorkdayHeadingLabel}</h3>
      {#if snapshot.nextWorkdayNoteExists}
        <button type="button" class="plan-open-button" on:click={onOpenNextWorkdayNote}>
          open ▸
        </button>
      {/if}
    </div>

    {#if snapshot.nextWorkdayQueuedTasks.length > 0}
      <ul class="queued-list">
        {#each snapshot.nextWorkdayQueuedTasks as queuedTask, queuedTaskIndex (queuedTaskIndex)}
          <li class="queued-row">
            <span class="queued-checkbox" aria-hidden="true">[ ]</span>
            <span class="queued-text">{queuedTask}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <form
      class="plan-add-form"
      aria-label="Add a task for the next workday"
      on:submit|preventDefault={handleAddNextWorkdayTaskSubmit}
    >
      <span class="plan-add-checkbox" aria-hidden="true">[ ]</span>
      <label class="plan-add-label" for="next-workday-task-input">New task for next workday</label>
      <input
        id="next-workday-task-input"
        class="plan-add-input"
        type="text"
        bind:value={newNextWorkdayTaskText}
        bind:this={nextWorkdayTaskInputElement}
        placeholder="Add a todo for next workday"
        disabled={isAddingNextWorkdayTask}
      />
      <button
        type="submit"
        class="plan-add-button"
        disabled={newNextWorkdayTaskText.trim().length === 0 || isAddingNextWorkdayTask}
      >
        {isAddingNextWorkdayTask ? "adding…" : "add ↵"}
      </button>
    </form>
  </div>
</WidgetPanel>

<style>
  .recap-metric-list {
    list-style: none;
    margin: 0 0 var(--vault-dashboard-space-panel-inner) 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .recap-metric-row {
    display: grid;
    grid-template-columns: 10ch 1fr;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
  }

  .recap-metric-label {
    color: var(--vault-dashboard-text-secondary);
    font-style: italic;
  }

  .recap-metric-value {
    color: var(--vault-dashboard-text-primary);
    font-weight: var(--vault-dashboard-font-weight-bold);
    font-variant-numeric: tabular-nums;
  }

  .section-heading {
    margin: 0 0 var(--vault-dashboard-space-row) 0;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    color: var(--vault-dashboard-text-faint);
  }

  .touched-group {
    margin-bottom: var(--vault-dashboard-space-inline);
  }

  .touched-list,
  .queued-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .touched-row {
    display: block;
  }

  .touched-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    width: 100%;
    text-align: left;
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    font-weight: var(--vault-dashboard-font-weight-medium);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--vault-dashboard-motion-duration-instant) var(--vault-dashboard-motion-easing-snap);
  }

  .touched-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .touched-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .touched-overflow {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
  }

  .plan-section {
    margin-top: var(--vault-dashboard-space-section);
    padding-top: var(--vault-dashboard-space-inline);
    border-top: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
  }

  .plan-heading-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--vault-dashboard-space-inline);
  }

  .plan-open-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    cursor: pointer;
  }

  .plan-open-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .plan-open-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .queued-row {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    color: var(--vault-dashboard-text-secondary);
  }

  .queued-checkbox {
    color: var(--vault-dashboard-text-faint);
  }

  .queued-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plan-add-form {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    margin-top: var(--vault-dashboard-space-inline);
    padding: var(--vault-dashboard-space-row) 0;
    border-top: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
  }

  .plan-add-checkbox {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .plan-add-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .plan-add-input {
    min-width: 0;
    width: 100%;
    appearance: none;
    background: transparent;
    border: 0;
    box-shadow: none;
    padding: var(--vault-dashboard-space-row) 0;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-weight: var(--vault-dashboard-font-weight-medium);
  }

  .plan-add-input::placeholder {
    color: var(--vault-dashboard-text-faint);
    font-style: italic;
  }

  .plan-add-input:focus,
  .plan-add-input:focus-visible {
    outline: none;
    box-shadow: none;
  }

  .plan-add-form:focus-within {
    border-color: var(--vault-dashboard-border-color-accent);
  }

  .plan-add-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: var(--vault-dashboard-space-row) 0;
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    cursor: pointer;
    white-space: nowrap;
  }

  .plan-add-button:hover:not(:disabled) {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .plan-add-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .plan-add-button:disabled,
  .plan-add-input:disabled {
    cursor: default;
    opacity: 0.65;
    pointer-events: none;
  }

  .widget-empty {
    margin: 0 0 var(--vault-dashboard-space-inline) 0;
    color: var(--vault-dashboard-text-secondary);
  }
</style>
