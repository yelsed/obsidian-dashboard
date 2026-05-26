<script lang="ts">
  import { tick } from "svelte";
  import WidgetPanel from "./WidgetPanel.svelte";

  type OpenTask = {
    taskContent: string;
    sourceFolderName: string;
  };

  type WidgetViewState = "data" | "loading" | "empty" | "error";

  export let viewState: WidgetViewState = "data";
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  export let todayDailyNoteLabel: string = "2026-05-18 daily";
  export let todayDailyNoteExists: boolean = true;
  export let openTasks: OpenTask[] = [
    { taskContent: "Reply to client review", sourceFolderName: "fivespark" },
    { taskContent: "Push staging build", sourceFolderName: "fivespark" },
    { taskContent: "Read incident postmortem", sourceFolderName: "learning" },
    { taskContent: "Refactor procrast list output", sourceFolderName: "yelsed" },
  ];
  export let totalOpenTaskCount: number = 12;
  export let tasksCreatedTodayCount: number = 3;
  export let onOpenDailyNote: () => void = () => {};
  export let onCreateDailyNote: () => void = () => {};
  export let onSelectTask: (task: OpenTask) => void = () => {};
  export let onAddDailyTask: (taskText: string) => Promise<boolean | void> | boolean | void = () => {};

  let newTaskText = "";
  let isAddingDailyTask = false;
  let dailyTaskInputElement: HTMLInputElement | null = null;

  async function handleAddDailyTaskSubmit(): Promise<void> {
    const trimmedTaskText = newTaskText.trim();
    if (trimmedTaskText.length === 0 || isAddingDailyTask) {
      return;
    }
    isAddingDailyTask = true;
    try {
      const didAddTask = await onAddDailyTask(trimmedTaskText);
      if (didAddTask !== false) {
        newTaskText = "";
      }
    } finally {
      isAddingDailyTask = false;
      await tick();
      dailyTaskInputElement?.focus();
    }
  }
</script>

<WidgetPanel title="Daily note + tasks" {isCollapsed} {onToggleCollapsed}>
  {#if viewState === "data"}
    <div class="daily-note-line">
      {#if todayDailyNoteExists}
        <button type="button" class="daily-note-button" on:click={onOpenDailyNote}>
          {todayDailyNoteLabel}
        </button>
        <span class="daily-note-trailing-dots" aria-hidden="true">·······························</span>
        <span class="daily-note-trailing-action">open</span>
      {:else}
        <button type="button" class="daily-note-button" on:click={onCreateDailyNote}>
          {todayDailyNoteLabel}
        </button>
        <span class="daily-note-trailing-dots" aria-hidden="true">·······························</span>
        <span class="daily-note-trailing-action">create ▸</span>
      {/if}
    </div>

    <form
      class="daily-task-add-form"
      aria-label="Add task to today's daily note"
      on:submit|preventDefault={handleAddDailyTaskSubmit}
    >
      <span class="daily-task-add-checkbox" aria-hidden="true">[ ]</span>
      <label class="daily-task-add-label" for="daily-task-add-input">New task</label>
      <input
        id="daily-task-add-input"
        class="daily-task-add-input"
        type="text"
        bind:value={newTaskText}
        bind:this={dailyTaskInputElement}
        placeholder="Add task to today"
        disabled={isAddingDailyTask}
      />
      <button
        type="submit"
        class="daily-task-add-button"
        disabled={newTaskText.trim().length === 0 || isAddingDailyTask}
      >
        {isAddingDailyTask ? "adding…" : "add ↵"}
      </button>
    </form>

    {#if openTasks.length === 0}
      <p class="widget-empty">No open tasks. Clean.</p>
    {:else}
      <ul class="task-list">
        {#each openTasks as task}
          <li class="task-row">
            <button type="button" class="task-button" on:click={() => onSelectTask(task)}>
              <span class="task-checkbox" aria-hidden="true">[ ]</span>
              <span class="task-content">{task.taskContent}</span>
              <span class="task-source">{task.sourceFolderName}</span>
            </button>
          </li>
        {/each}
      </ul>
      <p class="widget-footnote">
        {totalOpenTaskCount} open tasks
        <span aria-hidden="true">·</span>
        {tasksCreatedTodayCount} created today
      </p>
    {/if}
  {:else if viewState === "loading"}
    <p class="row-shimmer" aria-hidden="true">·········································</p>
    <ul class="task-list">
      {#each Array(4) as _, shimmerRowIndex (shimmerRowIndex)}
        <li class="task-row"><span class="row-shimmer" aria-hidden="true">[ ]  ··························</span></li>
      {/each}
    </ul>
  {:else if viewState === "empty"}
    <p class="widget-empty">Nothing open in this tab's scope. Clean.</p>
  {:else}
    <p class="widget-error">! Could not aggregate tasks.</p>
    <p class="widget-error-hint">Reload the plugin if this persists.</p>
  {/if}
</WidgetPanel>

<style>
  .daily-note-line {
    display: flex;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    margin-bottom: var(--vault-dashboard-space-panel-inner);
    color: var(--vault-dashboard-text-primary);
  }

  .daily-note-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    cursor: pointer;
    text-align: left;
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .daily-note-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .daily-note-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .daily-note-trailing-dots {
    flex: 1;
    color: var(--vault-dashboard-text-faint);
    overflow: hidden;
    white-space: nowrap;
  }

  .daily-note-trailing-action {
    color: var(--vault-dashboard-text-secondary);
  }

  .daily-task-add-form {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    margin-bottom: var(--vault-dashboard-space-panel-inner);
    padding: var(--vault-dashboard-space-row) 0;
    border-top: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    border-bottom: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
  }

  .daily-task-add-checkbox {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .daily-task-add-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .daily-task-add-input {
    min-width: 0;
    width: 100%;
    height: auto;
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: var(--vault-dashboard-border-radius);
    box-shadow: none;
    padding: var(--vault-dashboard-space-row) 0;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-weight: var(--vault-dashboard-font-weight-medium);
    line-height: var(--vault-dashboard-line-height-default);
  }

  .daily-task-add-input::placeholder {
    color: var(--vault-dashboard-text-faint);
    font-style: italic;
  }

  .daily-task-add-input:focus,
  .daily-task-add-input:focus-visible {
    outline: none;
    box-shadow: none;
  }

  .daily-task-add-form:focus-within {
    border-color: var(--vault-dashboard-border-color-accent);
  }

  .daily-task-add-button {
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

  .daily-task-add-button:hover:not(:disabled) {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .daily-task-add-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .daily-task-add-button:disabled,
  .daily-task-add-input:disabled {
    cursor: default;
    opacity: 0.65;
    pointer-events: none;
  }

  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .task-row {
    display: block;
  }

  .task-button {
    display: grid;
    grid-template-columns: auto 1fr auto;
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

  .task-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .task-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .task-checkbox {
    color: var(--vault-dashboard-text-secondary);
  }

  .task-content {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--vault-dashboard-font-weight-medium);
  }

  .task-source {
    color: var(--vault-dashboard-text-secondary);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
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

  .row-shimmer {
    color: var(--vault-dashboard-text-faint);
    opacity: 0.5;
  }
</style>
