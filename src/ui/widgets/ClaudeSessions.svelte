<script lang="ts">
  import { formatRelativeModifiedTime } from "../../data/format";
  import type { PinnedProjectForWidget } from "../../data/pinnedProjects";
  import WidgetPanel from "./WidgetPanel.svelte";

  type FlattenedClaudeSession = {
    sessionId: string;
    slug: string;
    latestAiTitle: string;
    topicTitleArc: string[];
    lastActivityAtMilliseconds: number;
    firstUserPromptPreview: string;
    lastUserPromptPreview: string;
    editedFileBaseNames: string[];
    editedFileTotalCount: number;
    totalMessageCount: number;
    gitBranch: string | null;
    projectFolderPath: string;
    projectDisplayName: string;
  };

  function resolveSessionHeadline(claudeSession: FlattenedClaudeSession): string {
    if (claudeSession.latestAiTitle.length > 0) {
      return claudeSession.latestAiTitle.replace(/-/g, " ");
    }
    return claudeSession.slug;
  }

  function resolveTopicArcSubline(claudeSession: FlattenedClaudeSession): string {
    if (claudeSession.topicTitleArc.length <= 1) {
      return "";
    }
    return claudeSession.topicTitleArc
      .slice(0, -1)
      .map((topicTitle) => topicTitle.replace(/-/g, " "))
      .join(" → ");
  }

  const MAXIMUM_FLATTENED_SESSIONS_DISPLAYED = 10;

  export let pinnedProjects: PinnedProjectForWidget[] = [];
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  export let onCopyClaudeResumeCommand: (
    pinnedProjectFolderPath: string,
    sessionId: string,
  ) => void = () => {};
  export let onRelaunchClaudeSession: (
    pinnedProjectFolderPath: string,
    sessionId: string,
  ) => void = () => {};

  $: flattenedRecentSessions = flattenSessionsAcrossPinnedProjects(pinnedProjects);

  function flattenSessionsAcrossPinnedProjects(
    pinnedProjectsList: PinnedProjectForWidget[],
  ): FlattenedClaudeSession[] {
    const allSessions: FlattenedClaudeSession[] = [];
    for (const pinnedProject of pinnedProjectsList) {
      for (const claudeSession of pinnedProject.recentClaudeSessions) {
        allSessions.push({
          sessionId: claudeSession.sessionId,
          slug: claudeSession.slug,
          latestAiTitle: claudeSession.latestAiTitle,
          topicTitleArc: claudeSession.topicTitleArc,
          lastActivityAtMilliseconds: claudeSession.lastActivityAtMilliseconds,
          firstUserPromptPreview: claudeSession.firstUserPromptPreview,
          lastUserPromptPreview: claudeSession.lastUserPromptPreview,
          editedFileBaseNames: claudeSession.editedFileBaseNames,
          editedFileTotalCount: claudeSession.editedFileTotalCount,
          totalMessageCount: claudeSession.totalMessageCount,
          gitBranch: claudeSession.gitBranch,
          projectFolderPath: pinnedProject.folderPath,
          projectDisplayName:
            pinnedProject.displayName.length > 0
              ? pinnedProject.displayName
              : pinnedProject.folderPath,
        });
      }
    }
    allSessions.sort(
      (leftEntry, rightEntry) =>
        rightEntry.lastActivityAtMilliseconds - leftEntry.lastActivityAtMilliseconds,
    );
    return allSessions.slice(0, MAXIMUM_FLATTENED_SESSIONS_DISPLAYED);
  }
</script>

<WidgetPanel title="Claude sessions" {isCollapsed} {onToggleCollapsed}>
  {#if flattenedRecentSessions.length === 0}
    <p class="widget-empty">No Claude sessions in pinned projects yet.</p>
  {:else}
    <ul class="claude-session-list">
      {#each flattenedRecentSessions as claudeSession (claudeSession.projectFolderPath + "::" + claudeSession.sessionId)}
        <li class="claude-session-row">
          <button
            type="button"
            class="claude-session-button"
            title="Copy `claude --resume {claudeSession.sessionId}` to clipboard"
            on:click={() => onCopyClaudeResumeCommand(claudeSession.projectFolderPath, claudeSession.sessionId)}
          >
            <span class="claude-session-row-top">
              <span class="claude-session-project">{claudeSession.projectDisplayName}</span>
              <span class="claude-session-time">{formatRelativeModifiedTime(claudeSession.lastActivityAtMilliseconds)}</span>
            </span>
            <span class="claude-session-slug">{resolveSessionHeadline(claudeSession)}</span>
            {#if resolveTopicArcSubline(claudeSession).length > 0}
              <span class="claude-session-topic-arc">also touched: {resolveTopicArcSubline(claudeSession)}</span>
            {/if}
            <span class="claude-session-prompt">{claudeSession.lastUserPromptPreview}</span>
            {#if claudeSession.editedFileBaseNames.length > 0}
              <span class="claude-session-edits">
                <span class="claude-session-edits-label">edits</span>
                <span class="claude-session-edits-files">
                  {claudeSession.editedFileBaseNames.join(", ")}{#if claudeSession.editedFileTotalCount > claudeSession.editedFileBaseNames.length}
                    &nbsp;+{claudeSession.editedFileTotalCount - claudeSession.editedFileBaseNames.length}
                  {/if}
                </span>
              </span>
            {/if}
          </button>
          <button
            type="button"
            class="claude-session-relaunch-button"
            title="Resume this session in the Obsidian Claude Code terminal"
            on:click={() => onRelaunchClaudeSession(claudeSession.projectFolderPath, claudeSession.sessionId)}
          >
            <span class="claude-session-relaunch-glyph" aria-hidden="true">▶</span>
            resume
          </button>
        </li>
      {/each}
    </ul>
    <p class="widget-footnote">
      Showing {flattenedRecentSessions.length} most recent — click to copy, or resume in the terminal.
    </p>
  {/if}
</WidgetPanel>

<style>
  .claude-session-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .claude-session-row {
    display: flex;
    align-items: stretch;
    gap: var(--vault-dashboard-space-row);
  }

  .claude-session-button {
    appearance: none;
    background: transparent;
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    padding: var(--vault-dashboard-space-row) var(--vault-dashboard-space-inline);
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    cursor: pointer;
    transition: border-color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap),
                color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap);
  }

  .claude-session-button:hover {
    border-color: var(--vault-dashboard-color-accent-cyan);
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .claude-session-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .claude-session-relaunch-button {
    appearance: none;
    background: transparent;
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    padding: var(--vault-dashboard-space-row) var(--vault-dashboard-space-inline);
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--vault-dashboard-space-row);
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    cursor: pointer;
    transition: border-color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap),
                color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap);
  }

  .claude-session-relaunch-button:hover {
    border-color: var(--vault-dashboard-color-accent-cyan);
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .claude-session-relaunch-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .claude-session-relaunch-glyph {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .claude-session-row-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--vault-dashboard-space-inline);
  }

  .claude-session-project {
    color: var(--vault-dashboard-color-accent-cyan);
    font-weight: var(--vault-dashboard-font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    font-size: var(--vault-dashboard-font-size-label);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .claude-session-time {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .claude-session-slug {
    font-weight: var(--vault-dashboard-font-weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .claude-session-prompt {
    color: var(--vault-dashboard-text-secondary);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: normal;
    word-break: break-word;
    line-height: var(--vault-dashboard-line-height-tight, 1.35);
  }

  .claude-session-topic-arc {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .claude-session-edits {
    display: flex;
    align-items: baseline;
    gap: var(--vault-dashboard-space-row);
    margin-top: 4px;
    font-size: var(--vault-dashboard-font-size-label);
    color: var(--vault-dashboard-text-faint);
    overflow: hidden;
  }

  .claude-session-edits-label {
    color: var(--vault-dashboard-text-faint);
    text-transform: uppercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    font-weight: var(--vault-dashboard-font-weight-bold);
    flex-shrink: 0;
  }

  .claude-session-edits-files {
    color: var(--vault-dashboard-text-secondary);
    font-family: var(--vault-dashboard-font-family-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .widget-empty {
    margin: 0;
    color: var(--vault-dashboard-text-secondary);
  }

  .widget-footnote {
    margin: var(--vault-dashboard-space-panel-inner) 0 0 0;
    padding-top: var(--vault-dashboard-space-row);
    border-top: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    font-size: var(--vault-dashboard-font-size-label);
    color: var(--vault-dashboard-text-faint);
    font-style: italic;
  }
</style>
