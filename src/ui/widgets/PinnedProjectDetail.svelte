<script lang="ts">
  import { formatRelativeModifiedTime } from "../../data/format";
  import type { PinnedProjectForWidget } from "../../data/pinnedProjects";
  import type { ShellCommandRunSnapshot } from "../../data/projectShellCommands";
  import { buildJiraSprintEpicHierarchy } from "../jiraHierarchy";
  import ProjectGitHubActions from "./ProjectGitHubActions.svelte";

  type FileTreeRow =
    | {
        rowType: "folder";
        relativeFolderPath: string;
        parentFolderPath: string;
        displayName: string;
        depth: number;
      }
    | {
        rowType: "file";
        relativeFilePath: string;
        parentFolderPath: string;
        displayName: string;
        relativeModifiedTimeLabel: string;
        depth: number;
      };

  type FileTreeFolderNode = {
    folderPath: string;
    displayName: string;
    depth: number;
    childFolderPaths: Set<string>;
    fileRows: Extract<FileTreeRow, { rowType: "file" }>[];
  };
  export let pinnedProject: PinnedProjectForWidget;
  export let shellCommandRunsByKey: Record<string, ShellCommandRunSnapshot> = {};
  export let onBack: () => void = () => {};
  export let onOpenChildFile: (pinnedProjectId: string, relativeFilePath: string) => void = () => {};
  export let onOpenChildFolder: (pinnedProjectId: string, relativeFolderPath: string) => void = () => {};
  export let onRunShellCommand: (pinnedProjectId: string, shellCommandIndex: number, commandLine: string) => void = () => {};
  export let onKillShellCommand: (pinnedProjectId: string, shellCommandIndex: number) => void = () => {};
  export let onClearShellCommandOutput: (pinnedProjectId: string, shellCommandIndex: number) => void = () => {};
  export let onCopyClaudeResumeCommand: (pinnedProjectId: string, sessionId: string) => void = () => {};
  export let onRelaunchClaudeSession: (pinnedProjectId: string, sessionId: string) => void = () => {};
  export let onStartSessionFromProjectGoals: (pinnedProjectId: string) => void = () => {};
  export let onCreateProjectGoalsFile: (pinnedProjectId: string) => void = () => {};
  export let onOpenProjectGoalsFile: (pinnedProjectId: string) => void = () => {};
  export let onCollectOpenTasksIntoProjectGoals: (pinnedProjectId: string) => void = () => {};
  export let onOpenJiraIssueInBrowser: (issueBrowserUrl: string) => void = () => {};
  export let onStartClaudeSessionFromJiraIssue: (pinnedProjectId: string, issueKey: string) => void = () => {};
  export let onRefreshGitHubActions: () => void = () => {};
  export let onDispatchGitHubWorkflow: (pinnedProjectId: string, workflowFilePath: string, branchName: string) => void = () => {};
  export let onRerunFailedGitHubJobs: (pinnedProjectId: string, runDatabaseId: number) => void = () => {};
  export let onCancelGitHubRun: (pinnedProjectId: string, runDatabaseId: number) => void = () => {};
  export let onOpenGitHubRunInBrowser: (runBrowserUrl: string) => void = () => {};

  const MAXIMUM_VISIBLE_CONTAINER_CELLS = 4;
  const FRESHNESS_GLYPH_BY_LEVEL = {
    active: "●",
    cooling: "◐",
    cold: "○",
  };

  let expandedFileTreeFolderPaths: Set<string> = new Set();
  let lastFileTreePinnedProjectId = pinnedProject.id;

  $: jiraHierarchy = buildJiraSprintEpicHierarchy(pinnedProject.jiraIssuesForProject);
  $: fileTreeRows = buildFileTreeRows(pinnedProject.childMarkdownFiles);
  $: visibleFileTreeRows = fileTreeRows.filter(isFileTreeRowVisible);
  $: if (pinnedProject.id !== lastFileTreePinnedProjectId) {
    lastFileTreePinnedProjectId = pinnedProject.id;
    expandedFileTreeFolderPaths = new Set();
  }

  function countRunningContainersIn(project: PinnedProjectForWidget): number {
    return project.pairedContainers.filter((container) => container.containerStatus === "running").length;
  }

  function renderContainerBarFor(project: PinnedProjectForWidget): string {
    if (project.dockerAvailability === "not-installed") {
      return " ".repeat(MAXIMUM_VISIBLE_CONTAINER_CELLS);
    }
    const filledCellCount = Math.min(countRunningContainersIn(project), MAXIMUM_VISIBLE_CONTAINER_CELLS);
    const emptyCellCount = Math.max(0, MAXIMUM_VISIBLE_CONTAINER_CELLS - filledCellCount);
    const overflowMarker = project.pairedContainers.length > MAXIMUM_VISIBLE_CONTAINER_CELLS ? "+" : " ";
    return "█".repeat(filledCellCount) + " ".repeat(emptyCellCount) + overflowMarker;
  }

  function describeContainerStatusFor(project: PinnedProjectForWidget): string {
    if (project.dockerAvailability === "not-installed") return "no docker";
    if (project.pairedContainers.length === 0) return "idle";
    return `${countRunningContainersIn(project)}/${project.pairedContainers.length} up`;
  }

  function buildShellCommandRunKey(pinnedProjectId: string, shellCommandIndex: number): string {
    return `${pinnedProjectId}::${shellCommandIndex}`;
  }

  function describeShellCommandStatusLabel(snapshot: ShellCommandRunSnapshot | undefined): string {
    if (!snapshot) return "ready";
    if (snapshot.status === "running") return "running…";
    if (snapshot.status === "succeeded") return "exit 0";
    if (snapshot.status === "failed") {
      return snapshot.exitCode === null ? snapshot.lastErrorMessage ?? "failed" : `exit ${snapshot.exitCode}`;
    }
    if (snapshot.status === "killed") return "killed";
    return "ready";
  }

  function resolveSessionHeadline(claudeSession: PinnedProjectForWidget["recentClaudeSessions"][number]): string {
    if (claudeSession.latestAiTitle.length > 0) {
      return claudeSession.latestAiTitle.replace(/-/g, " ");
    }
    return claudeSession.slug;
  }

  function resolveTopicArcSubline(claudeSession: PinnedProjectForWidget["recentClaudeSessions"][number]): string {
    if (claudeSession.topicTitleArc.length <= 1) return "";
    return claudeSession.topicTitleArc
      .slice(0, -1)
      .map((topicTitle) => topicTitle.replace(/-/g, " "))
      .join(" → ");
  }

  function formatShortIdeaUuid(ideaUuid: string): string {
    return ideaUuid.length > 8 ? ideaUuid.slice(0, 8) : ideaUuid;
  }

  function describeEpicHeading(epicKey: string, summaryText: string | null): string {
    if (epicKey === "no-epic") return "No epic";
    const issueKey = epicKey.startsWith("epic:") ? epicKey.slice(5) : epicKey;
    return summaryText === null || summaryText.length === 0 ? issueKey : `${issueKey} — ${summaryText}`;
  }

  function buildFileTreeRows(
    childMarkdownFiles: PinnedProjectForWidget["childMarkdownFiles"],
  ): FileTreeRow[] {
    const folderNodeByPath = new Map<string, FileTreeFolderNode>();
    const rootFolderNode = ensureFileTreeFolderNode("", folderNodeByPath);
    for (const childMarkdownFile of childMarkdownFiles) {
      const pathSegments = childMarkdownFile.relativeFilePath
        .split("/")
        .filter((segment) => segment.length > 0);
      const fileName = pathSegments.at(-1) ?? childMarkdownFile.relativeFilePath;
      let parentFolderNode = rootFolderNode;
      for (let segmentIndex = 0; segmentIndex < pathSegments.length - 1; segmentIndex += 1) {
        const folderPath = pathSegments.slice(0, segmentIndex + 1).join("/");
        const folderNode = ensureFileTreeFolderNode(folderPath, folderNodeByPath);
        parentFolderNode.childFolderPaths.add(folderPath);
        parentFolderNode = folderNode;
      }
      parentFolderNode.fileRows.push({
        rowType: "file",
        relativeFilePath: childMarkdownFile.relativeFilePath,
        parentFolderPath: parentFolderNode.folderPath,
        displayName: fileName,
        relativeModifiedTimeLabel: childMarkdownFile.relativeModifiedTimeLabel,
        depth: parentFolderNode.folderPath.length === 0 ? 0 : parentFolderNode.depth + 1,
      });
    }

    const rows: FileTreeRow[] = [];
    appendFileTreeFolderRows(rootFolderNode, folderNodeByPath, rows);
    return rows;
  }

  function ensureFileTreeFolderNode(
    folderPath: string,
    folderNodeByPath: Map<string, FileTreeFolderNode>,
  ): FileTreeFolderNode {
    const existingFolderNode = folderNodeByPath.get(folderPath);
    if (existingFolderNode !== undefined) {
      return existingFolderNode;
    }
    const folderPathSegments = folderPath.length === 0 ? [] : folderPath.split("/");
    const folderNode = {
      folderPath,
      displayName: folderPathSegments.at(-1) ?? "",
      depth: Math.max(0, folderPathSegments.length - 1),
      childFolderPaths: new Set<string>(),
      fileRows: [],
    };
    folderNodeByPath.set(folderPath, folderNode);
    return folderNode;
  }

  function appendFileTreeFolderRows(
    folderNode: FileTreeFolderNode,
    folderNodeByPath: Map<string, FileTreeFolderNode>,
    rows: FileTreeRow[],
  ): void {
    const sortedChildFolderNodes = [...folderNode.childFolderPaths]
      .map((folderPath) => folderNodeByPath.get(folderPath))
      .filter((childFolderNode): childFolderNode is FileTreeFolderNode => childFolderNode !== undefined)
      .sort((leftFolderNode, rightFolderNode) =>
        leftFolderNode.displayName.localeCompare(rightFolderNode.displayName),
      );
    for (const childFolderNode of sortedChildFolderNodes) {
      rows.push({
        rowType: "folder",
        relativeFolderPath: childFolderNode.folderPath,
        parentFolderPath: folderNode.folderPath,
        displayName: childFolderNode.displayName,
        depth: childFolderNode.depth,
      });
      appendFileTreeFolderRows(childFolderNode, folderNodeByPath, rows);
    }
    rows.push(
      ...[...folderNode.fileRows].sort((leftRow, rightRow) =>
        leftRow.displayName.localeCompare(rightRow.displayName),
      ),
    );
  }

  function isFileTreeRowVisible(fileTreeRow: FileTreeRow): boolean {
    return areAncestorFoldersExpanded(fileTreeRow.parentFolderPath);
  }

  function areAncestorFoldersExpanded(folderPath: string): boolean {
    if (folderPath.length === 0) {
      return true;
    }
    const pathSegments = folderPath.split("/");
    for (let segmentIndex = 0; segmentIndex < pathSegments.length; segmentIndex += 1) {
      const ancestorFolderPath = pathSegments.slice(0, segmentIndex + 1).join("/");
      if (!expandedFileTreeFolderPaths.has(ancestorFolderPath)) {
        return false;
      }
    }
    return true;
  }

  function handleToggleFileTreeFolder(relativeFolderPath: string): void {
    const nextExpandedFolderPaths = new Set(expandedFileTreeFolderPaths);
    if (nextExpandedFolderPaths.has(relativeFolderPath)) {
      nextExpandedFolderPaths.delete(relativeFolderPath);
    } else {
      nextExpandedFolderPaths.add(relativeFolderPath);
    }
    expandedFileTreeFolderPaths = nextExpandedFolderPaths;
  }
</script>

<main class="project-detail-page-shell">
  <article class="project-detail-page">
    <header class="project-detail-header">
      <button type="button" class="project-detail-back-button" on:click={onBack}>← pinned projects</button>
      <div class="project-detail-title-block">
        <h2>{pinnedProject.displayName || pinnedProject.folderPath}</h2>
        <p>{pinnedProject.folderPath}</p>
      </div>
    </header>

    <div class="project-detail-meta" aria-label="Project metadata">
      <span class="project-container-bar">[<span class:is-pulsing={countRunningContainersIn(pinnedProject) > 0}>{renderContainerBarFor(pinnedProject)}</span>]</span>
      <span>{describeContainerStatusFor(pinnedProject)}</span>
      {#if pinnedProject.jiraProjectKey.length > 0 && pinnedProject.jiraAvailability === "available"}
        <span>jira {pinnedProject.jiraOpenIssueCount}</span>
      {/if}
      <span data-freshness={pinnedProject.freshnessLevel}>{FRESHNESS_GLYPH_BY_LEVEL[pinnedProject.freshnessLevel]} {pinnedProject.relativeModifiedTimeLabel}</span>
      <span>{pinnedProject.markdownFileCount} {pinnedProject.markdownFileCount === 1 ? "note" : "notes"}</span>
      {#if pinnedProject.lastClaudeSessionLastActivityAtMilliseconds !== null}
        <span>claude {formatRelativeModifiedTime(pinnedProject.lastClaudeSessionLastActivityAtMilliseconds)}</span>
      {/if}
      {#if pinnedProject.procrastOrigin}
        <span>from Procrast {formatShortIdeaUuid(pinnedProject.procrastOrigin.ideaUuid)}</span>
      {/if}
    </div>

    <section class="project-detail-section">
      <h3>Project actions</h3>
      <div class="project-action-row">
        {#if pinnedProject.goalsFileExists}
          <button type="button" class="project-detail-button" on:click={() => onOpenProjectGoalsFile(pinnedProject.id)}>◇ open GOALS.md</button>
          <button type="button" class="project-detail-button" on:click={() => onStartSessionFromProjectGoals(pinnedProject.id)}>◆ plan from goals</button>
        {:else}
          <button type="button" class="project-detail-button" on:click={() => onCreateProjectGoalsFile(pinnedProject.id)}>＋ create GOALS.md</button>
        {/if}
        {#if pinnedProject.openTasks.length > 0}
          <button type="button" class="project-detail-button" on:click={() => onCollectOpenTasksIntoProjectGoals(pinnedProject.id)}>↓ collect tasks</button>
        {/if}
      </div>
    </section>

    <ProjectGitHubActions
      pinnedProjectId={pinnedProject.id}
      gitHubActionsSnapshot={pinnedProject.gitHubActionsSnapshot}
      onRefresh={onRefreshGitHubActions}
      onDispatchWorkflow={onDispatchGitHubWorkflow}
      onRerunFailedJobs={onRerunFailedGitHubJobs}
      onCancelRun={onCancelGitHubRun}
      onOpenRunInBrowser={onOpenGitHubRunInBrowser}
    />

    <section class="project-detail-section">
      <h3>Jira issues</h3>
      {#if jiraHierarchy.length === 0}
        <p class="project-detail-empty">No open Jira issues for this project.</p>
      {:else}
        <ul class="jira-hierarchy-sprint-list">
          {#each jiraHierarchy as sprintGroup (sprintGroup.sprintKey)}
            <li class="jira-hierarchy-sprint">
              <h4>{sprintGroup.sprintName}{#if sprintGroup.sprintState !== null} · {sprintGroup.sprintState}{/if}</h4>
              <ul class="jira-hierarchy-epic-list">
                {#each sprintGroup.epicGroups as epicGroup (epicGroup.epicKey)}
                  <li class="jira-hierarchy-epic">
                    <h5>{describeEpicHeading(epicGroup.epicKey, epicGroup.epicSummaryText)}</h5>
                    <ul class="jira-hierarchy-task-list">
                      {#each epicGroup.tasks as taskNode (taskNode.taskIssue?.issueKey ?? taskNode.parentIssue?.issueKey ?? "task")}
                        {@const taskIssue = taskNode.taskIssue}
                        {#if taskIssue !== null}
                          <li class="jira-hierarchy-task">
                            <div class="jira-issue-row">
                              <button type="button" class="jira-issue-key" on:click={() => onOpenJiraIssueInBrowser(taskIssue.issueBrowserUrl)}>{taskIssue.issueKey}</button>
                              <span class="jira-issue-summary">{taskIssue.summaryText}</span>
                              <span class="jira-issue-status">{taskIssue.statusName}</span>
                              <button type="button" class="jira-issue-fix-button" on:click={() => onStartClaudeSessionFromJiraIssue(pinnedProject.id, taskIssue.issueKey)}>▶ fix in claude</button>
                            </div>
                            {#if taskNode.subtasks.length > 0}
                              <ul class="jira-hierarchy-subtask-list">
                                {#each taskNode.subtasks as subtask (subtask.issueKey)}
                                  <li class="jira-issue-row jira-issue-row-subtask">
                                    <span aria-hidden="true">↳</span>
                                    <button type="button" class="jira-issue-key" on:click={() => onOpenJiraIssueInBrowser(subtask.issueBrowserUrl)}>{subtask.issueKey}</button>
                                    <span class="jira-issue-summary">{subtask.summaryText}</span>
                                    <span class="jira-issue-status">{subtask.statusName}</span>
                                    <button type="button" class="jira-issue-fix-button" on:click={() => onStartClaudeSessionFromJiraIssue(pinnedProject.id, subtask.issueKey)}>▶ fix in claude</button>
                                  </li>
                                {/each}
                              </ul>
                            {/if}
                          </li>
                        {/if}
                      {/each}
                      {#if epicGroup.orphanSubtaskGroups.length > 0}
                        <li class="jira-hierarchy-orphan-block">
                          <h6>Subtasks without returned task</h6>
                          {#each epicGroup.orphanSubtaskGroups as orphanGroup (orphanGroup.parentIssue?.issueKey ?? "no-parent")}
                            {#if orphanGroup.parentIssue !== null}
                              <p class="jira-orphan-parent">parent {orphanGroup.parentIssue.issueKey}</p>
                            {/if}
                            <ul class="jira-hierarchy-subtask-list">
                              {#each orphanGroup.subtasks as subtask (subtask.issueKey)}
                                <li class="jira-issue-row jira-issue-row-subtask">
                                  <span aria-hidden="true">↳</span>
                                  <button type="button" class="jira-issue-key" on:click={() => onOpenJiraIssueInBrowser(subtask.issueBrowserUrl)}>{subtask.issueKey}</button>
                                  <span class="jira-issue-summary">{subtask.summaryText}</span>
                                  <span class="jira-issue-status">{subtask.statusName}</span>
                                  <button type="button" class="jira-issue-fix-button" on:click={() => onStartClaudeSessionFromJiraIssue(pinnedProject.id, subtask.issueKey)}>▶ fix in claude</button>
                                </li>
                              {/each}
                            </ul>
                          {/each}
                        </li>
                      {/if}
                    </ul>
                  </li>
                {/each}
              </ul>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="project-detail-section">
      <h3>Open tasks</h3>
      {#if pinnedProject.openTasks.length === 0}
        <p class="project-detail-empty">No open tasks found in this project folder.</p>
      {:else}
        <ul class="project-detail-list">
          {#each pinnedProject.openTasks as openTask (openTask.relativeFilePath + "::" + openTask.taskText)}
            <li class="project-detail-row"><span>☐</span><span>{openTask.taskText}</span><button type="button" class="project-link-button" on:click={() => onOpenChildFile(pinnedProject.id, openTask.relativeFilePath)}>{openTask.relativeFilePath}</button></li>
          {/each}
        </ul>
        {#if pinnedProject.openTaskCollectionWasLimited}
          <p class="project-detail-empty">Showing first 200 tasks found</p>
        {/if}
      {/if}
    </section>

    <section class="project-detail-section">
      <h3>Containers</h3>
      {#if pinnedProject.pairedContainers.length === 0}
        <p class="project-detail-empty">No paired containers found for this project.</p>
      {:else}
        <ul class="project-detail-list">
          {#each pinnedProject.pairedContainers as container (container.containerName)}
            <li class="project-detail-row"><span class="vault-dashboard-status-dot" data-status={container.containerStatus}></span><span>{container.containerName}</span><span>{container.upTimeLabel}</span><span>{container.exposedPortLabel}</span><span>→</span></li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="project-detail-section">
      <h3>Files</h3>
      {#if pinnedProject.childMarkdownFiles.length === 0}
        <p class="project-detail-empty">No markdown files found in this project folder.</p>
      {:else}
        <ul class="project-detail-list file-tree-list">
          {#each visibleFileTreeRows as fileTreeRow (fileTreeRow.rowType === "folder" ? `folder:${fileTreeRow.relativeFolderPath}` : `file:${fileTreeRow.relativeFilePath}`)}
            {#if fileTreeRow.rowType === "folder"}
              {@const isFolderExpanded = expandedFileTreeFolderPaths.has(fileTreeRow.relativeFolderPath)}
              <li class="file-tree-row file-tree-folder-row" style={`--file-tree-depth: ${fileTreeRow.depth}`}>
                <button
                  type="button"
                  class="file-tree-disclosure-button"
                  aria-expanded={isFolderExpanded}
                  on:click={() => handleToggleFileTreeFolder(fileTreeRow.relativeFolderPath)}
                >
                  <span aria-hidden="true">{isFolderExpanded ? "▾" : "▸"}</span>
                  <span class="file-tree-folder-name">{fileTreeRow.displayName}/</span>
                </button>
                <button
                  type="button"
                  class="file-tree-open-button"
                  title="Open {fileTreeRow.relativeFolderPath} in the editor"
                  on:click={() => onOpenChildFolder(pinnedProject.id, fileTreeRow.relativeFolderPath)}
                >
                  open
                </button>
              </li>
            {:else}
              <li class="file-tree-row file-tree-file-row" style={`--file-tree-depth: ${fileTreeRow.depth}`}>
                <span class="file-tree-file-glyph" aria-hidden="true">·</span>
                <button type="button" class="project-link-button file-tree-file-button" on:click={() => onOpenChildFile(pinnedProject.id, fileTreeRow.relativeFilePath)}>{fileTreeRow.displayName}</button>
                <span class="file-tree-modified-time">{fileTreeRow.relativeModifiedTimeLabel}</span>
              </li>
            {/if}
          {/each}
        </ul>
      {/if}
    </section>

    <section class="project-detail-section">
      <h3>Last Claude sessions</h3>
      {#if pinnedProject.recentClaudeSessions.length === 0}
        <p class="project-detail-empty">No recent Claude Code sessions found for this project.</p>
      {:else}
        <ul class="claude-session-list">
          {#each pinnedProject.recentClaudeSessions as claudeSession (claudeSession.sessionId)}
            <li class="claude-session-row">
              <button type="button" class="claude-session-button" on:click={() => onCopyClaudeResumeCommand(pinnedProject.id, claudeSession.sessionId)}>
                <span><strong>{resolveSessionHeadline(claudeSession)}</strong> {formatRelativeModifiedTime(claudeSession.lastActivityAtMilliseconds)}</span>
                {#if resolveTopicArcSubline(claudeSession).length > 0}<span>also touched: {resolveTopicArcSubline(claudeSession)}</span>{/if}
                <span>{claudeSession.lastUserPromptPreview}</span>
              </button>
              <button type="button" class="project-detail-button" on:click={() => onRelaunchClaudeSession(pinnedProject.id, claudeSession.sessionId)}>▶ resume</button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="project-detail-section">
      <h3>Commands</h3>
      {#if pinnedProject.storedShellCommands.length === 0}
        <p class="project-detail-empty">No stored commands for this project.</p>
      {:else}
        <ul class="shell-command-list">
          {#each pinnedProject.storedShellCommands as storedShellCommand (storedShellCommand.shellCommandIndex)}
            {@const shellCommandRunKey = buildShellCommandRunKey(pinnedProject.id, storedShellCommand.shellCommandIndex)}
            {@const shellCommandRunSnapshot = shellCommandRunsByKey[shellCommandRunKey]}
            {@const isShellCommandRunning = shellCommandRunSnapshot?.status === "running"}
            <li class="shell-command-row">
              <div class="shell-command-header">
                <button type="button" class="project-detail-button" disabled={isShellCommandRunning} on:click={() => onRunShellCommand(pinnedProject.id, storedShellCommand.shellCommandIndex, storedShellCommand.commandLine)}>$ {storedShellCommand.label || storedShellCommand.commandLine}</button>
                <span>{describeShellCommandStatusLabel(shellCommandRunSnapshot)}</span>
                {#if isShellCommandRunning}
                  <button type="button" class="project-detail-button" on:click={() => onKillShellCommand(pinnedProject.id, storedShellCommand.shellCommandIndex)}>kill</button>
                {:else if shellCommandRunSnapshot && shellCommandRunSnapshot.outputTailLines.length > 0}
                  <button type="button" class="project-detail-button" on:click={() => onClearShellCommandOutput(pinnedProject.id, storedShellCommand.shellCommandIndex)}>clear</button>
                {/if}
              </div>
              {#if shellCommandRunSnapshot && shellCommandRunSnapshot.outputTailLines.length > 0}
                <pre class="shell-command-output">{shellCommandRunSnapshot.outputTailLines.join("\n")}</pre>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </article>
</main>

<style>
  .project-detail-page {
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-section);
    font-family: var(--vault-dashboard-font-family-mono);
    color: var(--vault-dashboard-text-primary);
  }

  .project-detail-header,
  .project-detail-meta,
  .project-detail-section {
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    background: var(--vault-dashboard-surface-panel);
    padding: var(--vault-dashboard-space-panel-inner);
  }

  .project-detail-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--vault-dashboard-space-panel-inner);
  }

  .project-detail-title-block {
    min-width: 0;
  }

  .project-detail-title-block h2,
  .project-detail-title-block p,
  .project-detail-section h3,
  .jira-hierarchy-sprint h4,
  .jira-hierarchy-epic h5,
  .jira-hierarchy-orphan-block h6 {
    margin: 0;
  }

  .project-detail-title-block h2 {
    font-size: var(--vault-dashboard-font-size-emphasis);
    line-height: var(--vault-dashboard-line-height-tight);
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .project-detail-title-block p {
    margin-top: var(--vault-dashboard-space-row);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-detail-section h3 {
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    text-transform: uppercase;
    color: var(--vault-dashboard-text-secondary);
  }

  .project-detail-title-block p,
  .project-detail-empty,
  .jira-orphan-parent {
    color: var(--vault-dashboard-text-secondary);
    font-style: italic;
  }

  .project-detail-meta,
  .project-action-row,
  .shell-command-header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--vault-dashboard-space-row) var(--vault-dashboard-space-inline);
    align-items: center;
  }

  .project-detail-meta {
    color: var(--vault-dashboard-text-secondary);
  }

  .project-detail-section {
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .project-detail-list,
  .jira-hierarchy-sprint-list,
  .jira-hierarchy-epic-list,
  .jira-hierarchy-task-list,
  .jira-hierarchy-subtask-list,
  .claude-session-list,
  .shell-command-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .jira-hierarchy-sprint-list {
    gap: var(--vault-dashboard-space-panel-inner);
  }

  .jira-hierarchy-sprint,
  .jira-hierarchy-epic,
  .jira-hierarchy-task,
  .jira-hierarchy-orphan-block {
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .jira-hierarchy-epic-list,
  .jira-hierarchy-subtask-list {
    padding-left: var(--vault-dashboard-space-inline);
  }

  .jira-hierarchy-sprint h4,
  .jira-hierarchy-epic h5,
  .jira-hierarchy-orphan-block h6 {
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    color: var(--vault-dashboard-text-faint);
  }

  .project-detail-row,
  .jira-issue-row,
  .claude-session-row,
  .shell-command-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
    gap: var(--vault-dashboard-space-inline);
    align-items: baseline;
    min-width: 0;
  }

  .jira-issue-row {
    padding: 2px 0;
  }

  .jira-issue-row-subtask {
    grid-template-columns: auto auto minmax(0, 1fr) auto auto;
  }

  .project-detail-button,
  .project-detail-back-button,
  .project-link-button,
  .jira-issue-key,
  .jira-issue-fix-button,
  .claude-session-button {
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    border-radius: var(--vault-dashboard-border-radius);
    background: var(--interactive-normal);
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-family: var(--vault-dashboard-font-family-mono);
    padding: 2px var(--vault-dashboard-space-row);
  }

  .project-link-button,
  .jira-issue-key {
    color: var(--vault-dashboard-text-accent);
    background: transparent;
    border-color: transparent;
    padding-left: 0;
    padding-right: 0;
    text-align: left;
  }

  .jira-issue-fix-button {
    color: var(--vault-dashboard-text-secondary);
    white-space: nowrap;
  }

  .project-detail-button:hover,
  .project-detail-back-button:hover,
  .project-link-button:hover,
  .jira-issue-key:hover,
  .jira-issue-fix-button:hover,
  .claude-session-button:hover {
    border-color: var(--vault-dashboard-border-color-accent);
  }

  .project-detail-button:focus-visible,
  .project-detail-back-button:focus-visible,
  .project-link-button:focus-visible,
  .jira-issue-key:focus-visible,
  .jira-issue-fix-button:focus-visible,
  .claude-session-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .jira-issue-summary,
  .project-link-button,
  .claude-session-button {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .jira-issue-summary {
    white-space: nowrap;
  }

  .jira-issue-status,
  .shell-command-header span,
  .project-detail-row span {
    color: var(--vault-dashboard-text-secondary);
    font-style: italic;
  }

  .project-detail-row {
    grid-template-columns: auto minmax(20ch, 1fr) minmax(20ch, auto);
  }

  .file-tree-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    padding-left: calc(var(--file-tree-depth, 0) * var(--vault-dashboard-space-inline));
  }

  .file-tree-file-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .file-tree-disclosure-button {
    display: inline-flex;
    align-items: baseline;
    gap: var(--vault-dashboard-space-row);
    min-width: 0;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-family: var(--vault-dashboard-font-family-mono);
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .file-tree-folder-name,
  .file-tree-file-button {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-tree-open-button {
    color: var(--vault-dashboard-text-faint);
    font: inherit;
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-label);
  }

  .file-tree-open-button:hover,
  .file-tree-disclosure-button:hover {
    color: var(--vault-dashboard-text-accent);
  }

  .file-tree-open-button:focus-visible,
  .file-tree-disclosure-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .file-tree-file-glyph,
  .file-tree-modified-time {
    color: var(--vault-dashboard-text-secondary);
    font-style: italic;
  }

  .claude-session-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .claude-session-button {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    text-align: left;
    background: transparent;
  }

  .shell-command-output {
    margin: var(--vault-dashboard-space-row) 0 0;
    padding: var(--vault-dashboard-space-row);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    background: var(--vault-dashboard-surface-overlay);
    overflow: auto;
  }

  .is-pulsing {
    animation: vault-dashboard-container-pulse 1.4s ease-in-out infinite;
  }

  @keyframes vault-dashboard-container-pulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .is-pulsing { animation: none; }
  }

  @media (max-width: 640px) {
    .project-detail-header,
    .project-detail-row,
    .jira-issue-row,
    .jira-issue-row-subtask,
    .claude-session-row {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
