<script lang="ts">
  import { formatRelativeModifiedTime } from "../../data/format";
  import WidgetPanel from "./WidgetPanel.svelte";

  type ContainerStatus = "running" | "paused" | "stopped";
  type FreshnessLevel = "active" | "cooling" | "cold";
  type DockerAvailability = "available" | "not-installed";
  type JiraAvailability =
    | "not-configured"
    | "checking"
    | "available"
    | "authentication-failed"
    | "errored";
  type WidgetViewState = "data" | "loading" | "empty" | "error";

  type PairedContainer = {
    containerName: string;
    imageReference: string;
    containerStatus: ContainerStatus;
    upTimeLabel: string;
    exposedPortLabel: string;
  };

  type ChildMarkdownFile = {
    relativeFilePath: string;
    relativeModifiedTimeLabel: string;
  };

  type StoredShellCommand = {
    shellCommandIndex: number;
    label: string;
    commandLine: string;
  };

  type ShellCommandRunStatus = "idle" | "running" | "succeeded" | "failed" | "killed";

  type RecentClaudeSession = {
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
  };

  function resolveSessionHeadline(claudeSession: RecentClaudeSession): string {
    if (claudeSession.latestAiTitle.length > 0) {
      return claudeSession.latestAiTitle.replace(/-/g, " ");
    }
    return claudeSession.slug;
  }

  function resolveTopicArcSubline(claudeSession: RecentClaudeSession): string {
    if (claudeSession.topicTitleArc.length <= 1) {
      return "";
    }
    return claudeSession.topicTitleArc
      .slice(0, -1)
      .map((topicTitle) => topicTitle.replace(/-/g, " "))
      .join(" → ");
  }

  type ShellCommandRunSnapshot = {
    runKey: string;
    status: ShellCommandRunStatus;
    exitCode: number | null;
    startedAtMilliseconds: number | null;
    finishedAtMilliseconds: number | null;
    outputTailLines: string[];
    lastErrorMessage: string | null;
  };

  type ProjectOpenTask = {
    taskText: string;
    relativeFilePath: string;
  };

  type ProcrastOrigin = {
    ideaUuid: string;
    ideaTitle: string;
    createdAt: string;
  };

  type JiraIssue = {
    issueKey: string;
    summaryText: string;
    statusName: string;
    statusCategoryKey: string;
    projectKey: string;
    assigneeDisplayName: string | null;
    priorityName: string | null;
    dueDateIsoString: string | null;
    issueBrowserUrl: string;
  };

  type PinnedProject = {
    id: string;
    folderPath: string;
    displayName: string;
    dockerAvailability: DockerAvailability;
    pairedContainers: PairedContainer[];
    freshnessLevel: FreshnessLevel;
    relativeModifiedTimeLabel: string;
    markdownFileCount: number;
    childMarkdownFilesPreview: ChildMarkdownFile[];
    childMarkdownFilesOverflowCount: number;
    storedShellCommands: StoredShellCommand[];
    recentClaudeSessions: RecentClaudeSession[];
    lastClaudeSessionLastActivityAtMilliseconds: number | null;
    goalsFileExists: boolean;
    openTasks: ProjectOpenTask[];
    openTaskOverflowCount: number;
    isExpanded: boolean;
    procrastOrigin?: ProcrastOrigin | null;
    jiraProjectKey: string;
    jiraAvailability: JiraAvailability;
    jiraOpenIssueCount: number;
    jiraIssuesForProject: JiraIssue[];
  };

  const MAXIMUM_VISIBLE_CONTAINER_CELLS = 4;
  const JIRA_ISSUES_INLINE_DISPLAY_LIMIT = 6;
  const FRESHNESS_GLYPH_BY_LEVEL: Record<FreshnessLevel, string> = {
    active: "●",
    cooling: "◐",
    cold: "○",
  };

  export let viewState: WidgetViewState = "data";
  export let isCollapsed: boolean = false;
  export let onToggleCollapsed: () => void = () => {};
  export let pinnedProjects: PinnedProject[] = [
    {
      id: "sample-fivespark",
      folderPath: "/fivespark",
      displayName: "Fivespark",
      dockerAvailability: "available",
      pairedContainers: [
        { containerName: "fivespark-api", imageReference: "fivespark/api:dev", containerStatus: "running", upTimeLabel: "up 2h", exposedPortLabel: ":8080" },
        { containerName: "fivespark-worker", imageReference: "fivespark/worker:dev", containerStatus: "running", upTimeLabel: "up 2h", exposedPortLabel: "" },
        { containerName: "fivespark-db", imageReference: "postgres:16", containerStatus: "running", upTimeLabel: "up 2h", exposedPortLabel: ":5432" },
        { containerName: "fivespark-storybook", imageReference: "fivespark/storybook:dev", containerStatus: "stopped", upTimeLabel: "stopped", exposedPortLabel: "" },
      ],
      freshnessLevel: "active",
      relativeModifiedTimeLabel: "2h ago",
      markdownFileCount: 7,
      childMarkdownFilesPreview: [
        { relativeFilePath: "README.md", relativeModifiedTimeLabel: "2h" },
        { relativeFilePath: "docs/architecture.md", relativeModifiedTimeLabel: "today" },
        { relativeFilePath: "docs/release-notes.md", relativeModifiedTimeLabel: "today" },
      ],
      childMarkdownFilesOverflowCount: 4,
      storedShellCommands: [],
      recentClaudeSessions: [],
      lastClaudeSessionLastActivityAtMilliseconds: null,
      goalsFileExists: true,
      openTasks: [
        { taskText: "Wire up the release pipeline", relativeFilePath: "docs/release-notes.md" },
        { taskText: "Document the worker retry policy", relativeFilePath: "docs/architecture.md" },
      ],
      openTaskOverflowCount: 3,
      isExpanded: true,
      jiraProjectKey: "FS",
      jiraAvailability: "available",
      jiraOpenIssueCount: 5,
      jiraIssuesForProject: [
        { issueKey: "FS-128", summaryText: "Wire the release pipeline to staging", statusName: "In Progress", statusCategoryKey: "indeterminate", projectKey: "FS", assigneeDisplayName: "You", priorityName: "High", dueDateIsoString: null, issueBrowserUrl: "https://fivespark.atlassian.net/browse/FS-128" },
        { issueKey: "FS-131", summaryText: "Document the worker retry policy", statusName: "To Do", statusCategoryKey: "new", projectKey: "FS", assigneeDisplayName: "You", priorityName: "Medium", dueDateIsoString: null, issueBrowserUrl: "https://fivespark.atlassian.net/browse/FS-131" },
      ],
    },
    {
      id: "sample-yelsed",
      folderPath: "/yelsed",
      displayName: "Yelsed",
      dockerAvailability: "available",
      pairedContainers: [],
      freshnessLevel: "cooling",
      relativeModifiedTimeLabel: "1d ago",
      markdownFileCount: 3,
      childMarkdownFilesPreview: [],
      childMarkdownFilesOverflowCount: 0,
      storedShellCommands: [],
      recentClaudeSessions: [],
      lastClaudeSessionLastActivityAtMilliseconds: null,
      goalsFileExists: false,
      openTasks: [],
      openTaskOverflowCount: 0,
      isExpanded: false,
      jiraProjectKey: "",
      jiraAvailability: "not-configured",
      jiraOpenIssueCount: 0,
      jiraIssuesForProject: [],
    },
    {
      id: "sample-procrast-cli",
      folderPath: "/procrast-cli",
      displayName: "Procrast CLI",
      dockerAvailability: "available",
      pairedContainers: [
        { containerName: "procrast-api", imageReference: "procrast/api:dev", containerStatus: "running", upTimeLabel: "up 5h", exposedPortLabel: ":8787" },
        { containerName: "procrast-cache", imageReference: "redis:7", containerStatus: "stopped", upTimeLabel: "stopped", exposedPortLabel: "" },
      ],
      freshnessLevel: "active",
      relativeModifiedTimeLabel: "5h ago",
      markdownFileCount: 1,
      childMarkdownFilesPreview: [],
      childMarkdownFilesOverflowCount: 0,
      storedShellCommands: [],
      recentClaudeSessions: [],
      lastClaudeSessionLastActivityAtMilliseconds: null,
      goalsFileExists: false,
      openTasks: [],
      openTaskOverflowCount: 0,
      isExpanded: false,
      jiraProjectKey: "PROC",
      jiraAvailability: "available",
      jiraOpenIssueCount: 2,
      jiraIssuesForProject: [
        { issueKey: "PROC-4", summaryText: "Cache invalidation on idea edit", statusName: "In Progress", statusCategoryKey: "indeterminate", projectKey: "PROC", assigneeDisplayName: "You", priorityName: "Medium", dueDateIsoString: null, issueBrowserUrl: "https://fivespark.atlassian.net/browse/PROC-4" },
        { issueKey: "PROC-9", summaryText: "List output pagination", statusName: "To Do", statusCategoryKey: "new", projectKey: "PROC", assigneeDisplayName: "You", priorityName: "Low", dueDateIsoString: null, issueBrowserUrl: "https://fivespark.atlassian.net/browse/PROC-9" },
      ],
    },
    {
      id: "sample-learning",
      folderPath: "/learning",
      displayName: "Learning",
      dockerAvailability: "not-installed",
      pairedContainers: [],
      freshnessLevel: "cold",
      relativeModifiedTimeLabel: "3d ago",
      markdownFileCount: 9,
      childMarkdownFilesPreview: [],
      childMarkdownFilesOverflowCount: 0,
      storedShellCommands: [],
      recentClaudeSessions: [],
      lastClaudeSessionLastActivityAtMilliseconds: null,
      goalsFileExists: false,
      openTasks: [],
      openTaskOverflowCount: 0,
      isExpanded: false,
      jiraProjectKey: "",
      jiraAvailability: "not-configured",
      jiraOpenIssueCount: 0,
      jiraIssuesForProject: [],
    },
  ];
  export let onToggleProjectExpansion: (pinnedProjectId: string) => void = () => {};
  export let onOpenChildFile: (pinnedProjectId: string, relativeFilePath: string) => void = () => {};
  export let shellCommandRunsByKey: Record<string, ShellCommandRunSnapshot> = {};
  export let onRunShellCommand: (
    pinnedProjectId: string,
    shellCommandIndex: number,
    commandLine: string,
  ) => void = () => {};
  export let onKillShellCommand: (
    pinnedProjectId: string,
    shellCommandIndex: number,
  ) => void = () => {};
  export let onClearShellCommandOutput: (
    pinnedProjectId: string,
    shellCommandIndex: number,
  ) => void = () => {};
  export let onCopyClaudeResumeCommand: (
    pinnedProjectId: string,
    sessionId: string,
  ) => void = () => {};
  export let onRelaunchClaudeSession: (
    pinnedProjectId: string,
    sessionId: string,
  ) => void = () => {};
  export let onStartSessionFromProjectGoals: (
    pinnedProjectId: string,
  ) => void = () => {};
  export let onCreateProjectGoalsFile: (
    pinnedProjectId: string,
  ) => void = () => {};
  export let onOpenProjectGoalsFile: (
    pinnedProjectId: string,
  ) => void = () => {};
  export let onCollectOpenTasksIntoProjectGoals: (
    pinnedProjectId: string,
  ) => void = () => {};
  export let onOpenJiraIssueInBrowser: (issueBrowserUrl: string) => void = () => {};
  export let onStartClaudeSessionFromJiraIssue: (
    pinnedProjectId: string,
    issueKey: string,
  ) => void = () => {};
  export let onShowAllJiraIssues: (
    pinnedProjectId: string,
    jiraProjectKey: string,
  ) => void = () => {};

  function buildShellCommandRunKey(
    pinnedProjectId: string,
    shellCommandIndex: number,
  ): string {
    return `${pinnedProjectId}::${shellCommandIndex}`;
  }

  function describeShellCommandStatusLabel(snapshot: ShellCommandRunSnapshot | undefined): string {
    if (!snapshot) {
      return "ready";
    }
    if (snapshot.status === "running") return "running…";
    if (snapshot.status === "succeeded") return `exit 0`;
    if (snapshot.status === "failed") {
      if (snapshot.exitCode === null) {
        return snapshot.lastErrorMessage ?? "failed";
      }
      return `exit ${snapshot.exitCode}`;
    }
    if (snapshot.status === "killed") return "killed";
    return "ready";
  }

  function countRunningContainersIn(project: PinnedProject): number {
    return project.pairedContainers.filter((container) => container.containerStatus === "running").length;
  }

  function renderContainerBarFor(project: PinnedProject): string {
    if (project.dockerAvailability === "not-installed") {
      return " ".repeat(MAXIMUM_VISIBLE_CONTAINER_CELLS);
    }
    const totalContainerCount = project.pairedContainers.length;
    const runningContainerCount = countRunningContainersIn(project);
    const filledCellCount = Math.min(runningContainerCount, MAXIMUM_VISIBLE_CONTAINER_CELLS);
    const emptyCellCount = Math.max(0, MAXIMUM_VISIBLE_CONTAINER_CELLS - filledCellCount);
    const overflowMarker = totalContainerCount > MAXIMUM_VISIBLE_CONTAINER_CELLS ? "+" : " ";
    return "█".repeat(filledCellCount) + " ".repeat(emptyCellCount) + overflowMarker;
  }

  function describeContainerStatusFor(project: PinnedProject): string {
    if (project.dockerAvailability === "not-installed") {
      return "no docker";
    }
    if (project.pairedContainers.length === 0) {
      return "idle";
    }
    const runningContainerCount = countRunningContainersIn(project);
    return `${runningContainerCount}/${project.pairedContainers.length} up`;
  }

  function chooseFreshnessGlyphFor(project: PinnedProject): string {
    return FRESHNESS_GLYPH_BY_LEVEL[project.freshnessLevel];
  }

  function hasAtLeastOneRunningContainer(project: PinnedProject): boolean {
    return countRunningContainersIn(project) > 0;
  }

  function shouldShowJiraBadgeFor(project: PinnedProject): boolean {
    return project.jiraProjectKey.length > 0 && project.jiraAvailability === "available";
  }

  function describeJiraBadgeFor(project: PinnedProject): string {
    const issueWord = project.jiraOpenIssueCount === 1 ? "issue" : "issues";
    return `${project.jiraOpenIssueCount} open Jira ${issueWord} in ${project.jiraProjectKey}`;
  }

  function formatShortIdeaUuid(ideaUuid: string): string {
    return ideaUuid.length > 8 ? ideaUuid.slice(0, 8) : ideaUuid;
  }

  function describeProcrastOrigin(origin: ProcrastOrigin): string {
    const title = origin.ideaTitle.trim();
    return title.length > 0
      ? `From Procrast idea ${title} (${origin.ideaUuid})`
      : `From Procrast idea ${origin.ideaUuid}`;
  }
</script>

<WidgetPanel title="Pinned projects" {isCollapsed} {onToggleCollapsed}>
  {#if viewState === "data"}
    {#if pinnedProjects.length === 0}
      <p class="widget-empty">No pinned projects yet. Add one in Settings → Vault Dashboard.</p>
    {:else}
      <ul class="project-tile-grid">
        {#each pinnedProjects as project (project.id)}
          <li class="project-tile">
            <button
              type="button"
              class="project-header"
              aria-expanded={project.isExpanded}
              on:click={() => onToggleProjectExpansion(project.id)}
            >
              <span class="project-header-top">
                <span class="project-display-name">{project.displayName || project.folderPath}</span>
                <span class="project-expand-chevron" aria-hidden="true">{project.isExpanded ? "▾" : "▸"}</span>
              </span>

              {#if project.displayName && project.displayName !== project.folderPath}
                <span class="project-folder-path" title={project.folderPath}>{project.folderPath}</span>
              {/if}

              <span class="project-meta-row">
                <span class="project-container-bar" aria-label={describeContainerStatusFor(project)}>[<span class="project-container-bar-cells" class:is-pulsing={hasAtLeastOneRunningContainer(project)}>{renderContainerBarFor(project)}</span>]</span>
                <span class="project-container-status">{describeContainerStatusFor(project)}</span>

                {#if shouldShowJiraBadgeFor(project)}
                  <span class="project-meta-separator" aria-hidden="true">·</span>
                  <span class="project-jira-badge" title={describeJiraBadgeFor(project)}>jira · {project.jiraOpenIssueCount}</span>
                {/if}

                <span class="project-meta-separator" aria-hidden="true">·</span>
                <span
                  class="project-freshness"
                  data-freshness={project.freshnessLevel}
                  aria-label="Last modified {project.relativeModifiedTimeLabel}"
                >{chooseFreshnessGlyphFor(project)}</span>
                <span class="project-modified-time">{project.relativeModifiedTimeLabel}</span>

                <span class="project-meta-separator" aria-hidden="true">·</span>
                <span class="project-note-count">{project.markdownFileCount} {project.markdownFileCount === 1 ? "note" : "notes"}</span>

                {#if project.lastClaudeSessionLastActivityAtMilliseconds !== null}
                  <span class="project-meta-separator" aria-hidden="true">·</span>
                  <span class="project-claude-indicator" title="Last Claude Code session in this folder">claude · {formatRelativeModifiedTime(project.lastClaudeSessionLastActivityAtMilliseconds)}</span>
                {/if}

                {#if project.procrastOrigin}
                  <span class="project-meta-separator" aria-hidden="true">·</span>
                  <span class="project-origin-badge" title={describeProcrastOrigin(project.procrastOrigin)}>from Procrast · {formatShortIdeaUuid(project.procrastOrigin.ideaUuid)}</span>
                {/if}
              </span>
            </button>

            {#if project.isExpanded}
              <div class="project-detail">

                <div class="project-goals-action">
                  {#if project.goalsFileExists}
                    <button
                      type="button"
                      class="project-goals-button"
                      title="Open GOALS.md for this project"
                      on:click={() => onOpenProjectGoalsFile(project.id)}
                    >
                      <span class="project-goals-glyph" aria-hidden="true">◇</span>
                      open GOALS.md
                    </button>
                    <button
                      type="button"
                      class="project-goals-button"
                      title="Start a Claude Code session seeded with GOALS.md"
                      on:click={() => onStartSessionFromProjectGoals(project.id)}
                    >
                      <span class="project-goals-glyph" aria-hidden="true">◆</span>
                      plan from goals
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="project-goals-button"
                      title="Create GOALS.md for this project"
                      on:click={() => onCreateProjectGoalsFile(project.id)}
                    >
                      <span class="project-goals-glyph" aria-hidden="true">＋</span>
                      create GOALS.md
                    </button>
                  {/if}

                  {#if project.openTasks.length > 0}
                    <button
                      type="button"
                      class="project-goals-button"
                      title="Collect this project's open tasks into GOALS.md"
                      on:click={() => onCollectOpenTasksIntoProjectGoals(project.id)}
                    >
                      <span class="project-goals-glyph" aria-hidden="true">↓</span>
                      collect tasks
                    </button>
                  {/if}
                </div>

                {#if project.openTasks.length > 0}
                  <h3 class="detail-heading">Open tasks</h3>
                  <ul class="detail-list">
                    {#each project.openTasks as openTask (openTask.relativeFilePath + "::" + openTask.taskText)}
                      <li class="detail-row project-task-row">
                        <span class="detail-bullet" aria-hidden="true">☐</span>
                        <span class="project-task-text">{openTask.taskText}</span>
                        <button
                          type="button"
                          class="detail-file-button project-task-file"
                          on:click={() => onOpenChildFile(project.id, openTask.relativeFilePath)}
                        >
                          {openTask.relativeFilePath}
                        </button>
                      </li>
                    {/each}
                    {#if project.openTaskOverflowCount > 0}
                      <li class="detail-row detail-row-overflow">
                        … {project.openTaskOverflowCount} more
                      </li>
                    {/if}
                  </ul>
                {/if}
                {#if shouldShowJiraBadgeFor(project) && project.jiraOpenIssueCount > 0}
                  <h3 class="detail-heading">Jira issues</h3>
                  <ul class="detail-list">
                    {#each project.jiraIssuesForProject.slice(0, JIRA_ISSUES_INLINE_DISPLAY_LIMIT) as jiraIssue (jiraIssue.issueKey)}
                      <li class="detail-row project-jira-row">
                        <button
                          type="button"
                          class="detail-file-button project-jira-key"
                          title="Open {jiraIssue.issueKey} in your browser"
                          on:click={() => onOpenJiraIssueInBrowser(jiraIssue.issueBrowserUrl)}
                        >
                          {jiraIssue.issueKey}
                        </button>
                        <span class="project-jira-summary">{jiraIssue.summaryText}</span>
                        <span
                          class="project-jira-status"
                          data-status-category={jiraIssue.statusCategoryKey}
                        >
                          {jiraIssue.statusName}
                        </span>
                        <button
                          type="button"
                          class="project-jira-fix-button"
                          title="Open Claude Code in this folder with the full {jiraIssue.issueKey} ticket"
                          on:click={() => onStartClaudeSessionFromJiraIssue(project.id, jiraIssue.issueKey)}
                        >
                          <span class="project-jira-fix-glyph" aria-hidden="true">▶</span>
                          fix in claude
                        </button>
                      </li>
                    {/each}
                    <li class="detail-row detail-row-overflow">
                      <button
                        type="button"
                        class="detail-see-more-button"
                        on:click={() => onShowAllJiraIssues(project.id, project.jiraProjectKey)}
                      >
                        … see all {project.jiraOpenIssueCount} issues (search + sort)
                      </button>
                    </li>
                  </ul>
                {/if}

                {#if project.dockerAvailability === "available" && project.pairedContainers.length > 0}
                  <h3 class="detail-heading">Containers</h3>
                  <ul class="detail-list">
                    {#each project.pairedContainers as container}
                      <li class="detail-row">
                        <span
                          class="vault-dashboard-status-dot"
                          data-status={container.containerStatus}
                          aria-hidden="true"
                        ></span>
                        <span class="detail-name">{container.containerName}</span>
                        <span class="detail-secondary">{container.upTimeLabel}</span>
                        <span class="detail-secondary">{container.exposedPortLabel}</span>
                        <span class="detail-action" aria-hidden="true">→</span>
                      </li>
                    {/each}
                  </ul>
                {/if}

                {#if project.childMarkdownFilesPreview.length > 0}
                  <h3 class="detail-heading">Files</h3>
                  <ul class="detail-list">
                    {#each project.childMarkdownFilesPreview as childFile}
                      <li class="detail-row">
                        <span class="detail-bullet" aria-hidden="true">·</span>
                        <button
                          type="button"
                          class="detail-file-button"
                          on:click={() => onOpenChildFile(project.id, childFile.relativeFilePath)}
                        >
                          {childFile.relativeFilePath}
                        </button>
                        <span class="detail-secondary">{childFile.relativeModifiedTimeLabel}</span>
                      </li>
                    {/each}
                    {#if project.childMarkdownFilesOverflowCount > 0}
                      <li class="detail-row detail-row-overflow">
                        … {project.childMarkdownFilesOverflowCount} more
                      </li>
                    {/if}
                  </ul>
                {/if}

                {#if project.recentClaudeSessions.length > 0}
                  <h3 class="detail-heading">Last Claude sessions</h3>
                  <ul class="claude-session-list">
                    {#each project.recentClaudeSessions as claudeSession (claudeSession.sessionId)}
                      <li class="claude-session-row">
                        <button
                          type="button"
                          class="claude-session-button"
                          title="Copy claude --resume {claudeSession.sessionId} to clipboard"
                          on:click={() => onCopyClaudeResumeCommand(project.id, claudeSession.sessionId)}
                        >
                          <span class="claude-session-row-top">
                            <span class="claude-session-slug">{resolveSessionHeadline(claudeSession)}</span>
                            <span class="claude-session-time">{formatRelativeModifiedTime(claudeSession.lastActivityAtMilliseconds)}</span>
                          </span>
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
                          on:click={() => onRelaunchClaudeSession(project.id, claudeSession.sessionId)}
                        >
                          <span class="claude-session-relaunch-glyph" aria-hidden="true">▶</span>
                          resume
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}

                {#if project.storedShellCommands.length > 0}
                  <h3 class="detail-heading">Commands</h3>
                  <ul class="shell-command-list">
                    {#each project.storedShellCommands as storedShellCommand (storedShellCommand.shellCommandIndex)}
                      {@const shellCommandRunKey = buildShellCommandRunKey(project.id, storedShellCommand.shellCommandIndex)}
                      {@const shellCommandRunSnapshot = shellCommandRunsByKey[shellCommandRunKey]}
                      {@const isShellCommandRunning = shellCommandRunSnapshot?.status === "running"}
                      <li class="shell-command-row">
                        <div class="shell-command-header">
                          <button
                            type="button"
                            class="shell-command-run-button"
                            data-status={shellCommandRunSnapshot?.status ?? "idle"}
                            disabled={isShellCommandRunning}
                            on:click={() => onRunShellCommand(project.id, storedShellCommand.shellCommandIndex, storedShellCommand.commandLine)}
                            title={storedShellCommand.commandLine}
                          >
                            <span class="shell-command-prompt" aria-hidden="true">$</span>
                            <span class="shell-command-label">{storedShellCommand.label || storedShellCommand.commandLine}</span>
                          </button>
                          <span class="shell-command-status" data-status={shellCommandRunSnapshot?.status ?? "idle"}>
                            {describeShellCommandStatusLabel(shellCommandRunSnapshot)}
                          </span>
                          {#if isShellCommandRunning}
                            <button
                              type="button"
                              class="shell-command-secondary-button"
                              on:click={() => onKillShellCommand(project.id, storedShellCommand.shellCommandIndex)}
                            >
                              kill
                            </button>
                          {:else if shellCommandRunSnapshot && shellCommandRunSnapshot.outputTailLines.length > 0}
                            <button
                              type="button"
                              class="shell-command-secondary-button"
                              on:click={() => onClearShellCommandOutput(project.id, storedShellCommand.shellCommandIndex)}
                            >
                              clear
                            </button>
                          {/if}
                        </div>
                        {#if shellCommandRunSnapshot && shellCommandRunSnapshot.outputTailLines.length > 0}
                          <pre class="shell-command-output">{shellCommandRunSnapshot.outputTailLines.join("\n")}</pre>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if viewState === "loading"}
    <ul class="project-tile-grid">
      {#each Array(3) as _, shimmerRowIndex (shimmerRowIndex)}
        <li class="project-tile">
          <span class="row-shimmer" aria-hidden="true">····················································</span>
        </li>
      {/each}
    </ul>
  {:else if viewState === "empty"}
    <p class="widget-empty">No pinned projects yet. Add one in Settings → Vault Dashboard.</p>
  {:else}
    <p class="widget-error">! Could not read project metadata.</p>
    <p class="widget-error-hint">Reload the plugin if this persists.</p>
  {/if}
</WidgetPanel>

<style>
  .project-tile-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    grid-auto-rows: max-content;
    align-items: start;
    gap: var(--vault-dashboard-space-panel-inner);
  }

  .project-tile {
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--vault-dashboard-surface-background);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    padding: var(--vault-dashboard-space-row) var(--vault-dashboard-space-inline);
  }

  .project-header {
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
    width: 100%;
    appearance: none;
    background: transparent;
    border: none;
    padding: var(--vault-dashboard-space-row) 0;
    margin: 0;
    text-align: left;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    cursor: pointer;
  }

  .project-header:hover .project-display-name {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .project-header:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .project-header-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--vault-dashboard-space-inline);
    min-width: 0;
  }

  .project-display-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .project-expand-chevron {
    flex-shrink: 0;
    color: var(--vault-dashboard-text-secondary);
  }

  .project-folder-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    direction: rtl;
    text-align: left;
  }

  /* One wrapping chip row so nothing truncates when several projects sit side by side. */
  .project-meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--vault-dashboard-space-inline);
    row-gap: var(--vault-dashboard-space-row);
    font-size: var(--vault-dashboard-font-size-label);
  }

  .project-meta-separator {
    color: var(--vault-dashboard-text-faint);
  }

  .project-container-bar {
    color: var(--vault-dashboard-text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: pre;
  }

  .project-container-bar-cells {
    color: var(--vault-dashboard-color-status-running);
    letter-spacing: -0.05em;
  }

  .project-container-bar-cells.is-pulsing {
    animation: container-pulse 1s ease-in-out infinite alternate;
  }

  @media (prefers-reduced-motion: reduce) {
    .project-container-bar-cells.is-pulsing {
      animation: none;
    }
  }

  @keyframes container-pulse {
    from { opacity: 0.6; }
    to { opacity: 1; }
  }

  .project-container-status {
    color: var(--vault-dashboard-text-secondary);
    font-style: italic;
  }

  .project-jira-badge {
    color: var(--vault-dashboard-color-accent-magenta);
    font-style: italic;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .project-freshness {
    width: 1ch;
    text-align: center;
  }

  .project-freshness[data-freshness="active"] {
    color: var(--vault-dashboard-color-freshness-active);
  }

  .project-freshness[data-freshness="cooling"] {
    color: var(--vault-dashboard-color-freshness-cooling);
  }

  .project-freshness[data-freshness="cold"] {
    color: var(--vault-dashboard-color-freshness-cold);
  }

  .project-modified-time {
    color: var(--vault-dashboard-text-faint);
    font-style: italic;
  }

  .project-claude-indicator {
    color: var(--vault-dashboard-color-accent-cyan);
    font-style: italic;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .project-note-count {
    color: var(--vault-dashboard-text-faint);
    font-style: italic;
  }

  .project-origin-badge {
    color: var(--vault-dashboard-color-accent-cyan);
    font-style: italic;
    white-space: nowrap;
  }

  .project-detail {
    margin: var(--vault-dashboard-space-row) 0 0 0;
    padding: var(--vault-dashboard-space-inline) 0 0 0;
    border-top: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-panel-inner);
    font-size: var(--vault-dashboard-font-size-label);
  }

  .detail-heading {
    margin: 0 0 var(--vault-dashboard-space-row) 0;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--vault-dashboard-letter-spacing-uppercase);
    color: var(--vault-dashboard-text-faint);
  }

  .detail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .detail-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
    align-items: baseline;
    gap: var(--vault-dashboard-space-inline);
    color: var(--vault-dashboard-text-primary);
  }

  .detail-row-overflow {
    grid-template-columns: 1fr;
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
  }

  .detail-see-more-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    cursor: pointer;
    text-align: left;
  }

  .detail-see-more-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .detail-see-more-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .detail-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .detail-secondary {
    color: var(--vault-dashboard-text-secondary);
    font-size: var(--vault-dashboard-font-size-label);
    font-variant-numeric: tabular-nums;
    font-style: italic;
  }

  .detail-action {
    color: var(--vault-dashboard-text-faint);
  }

  .detail-bullet {
    color: var(--vault-dashboard-text-faint);
  }


  .detail-file-button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-weight: var(--vault-dashboard-font-weight-medium);
    cursor: pointer;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-file-button:hover {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .detail-file-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .widget-empty {
    margin: 0 0 var(--vault-dashboard-space-panel-inner) 0;
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

  .shell-command-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-inline);
  }

  .shell-command-row {
    display: flex;
    flex-direction: column;
    gap: var(--vault-dashboard-space-row);
  }

  .shell-command-header {
    display: flex;
    align-items: center;
    gap: var(--vault-dashboard-space-inline);
    flex-wrap: wrap;
    row-gap: var(--vault-dashboard-space-row);
  }

  .shell-command-run-button {
    appearance: none;
    background: var(--vault-dashboard-surface-panel);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    border-radius: var(--vault-dashboard-border-radius);
    padding: 4px 10px;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-medium);
    cursor: pointer;
    text-align: left;
    display: inline-flex;
    align-items: center;
    gap: var(--vault-dashboard-space-row);
    transition: background var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap),
                border-color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap),
                color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap);
  }

  .shell-command-run-button:hover {
    background: var(--vault-dashboard-surface-panel-hover);
    border-color: var(--vault-dashboard-color-accent-cyan);
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .shell-command-run-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .shell-command-run-button:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .shell-command-run-button[data-status="running"] {
    border-color: var(--vault-dashboard-color-freshness-cooling);
    color: var(--vault-dashboard-text-primary);
  }

  .shell-command-run-button[data-status="succeeded"] {
    border-color: var(--vault-dashboard-color-status-running);
  }

  .shell-command-run-button[data-status="failed"],
  .shell-command-run-button[data-status="killed"] {
    border-color: var(--vault-dashboard-color-status-stopped);
  }

  .shell-command-prompt {
    color: var(--vault-dashboard-color-accent-cyan);
    font-weight: var(--vault-dashboard-font-weight-bold);
  }

  .shell-command-run-button:hover .shell-command-prompt {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .shell-command-label {
    color: inherit;
  }

  .shell-command-status {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    font-variant-numeric: tabular-nums;
  }

  .shell-command-status[data-status="running"] {
    color: var(--vault-dashboard-color-freshness-cooling);
  }

  .shell-command-status[data-status="succeeded"] {
    color: var(--vault-dashboard-color-status-running);
  }

  .shell-command-status[data-status="failed"],
  .shell-command-status[data-status="killed"] {
    color: var(--vault-dashboard-color-status-stopped);
  }

  .shell-command-secondary-button {
    appearance: none;
    background: transparent;
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    padding: 0 var(--vault-dashboard-space-row);
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    cursor: pointer;
  }

  .shell-command-secondary-button:hover {
    color: var(--vault-dashboard-text-primary);
    border-color: var(--vault-dashboard-border-color-accent);
  }

  .shell-command-secondary-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

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

  .project-goals-action {
    display: flex;
    gap: var(--vault-dashboard-space-row);
    flex-wrap: wrap;
  }

  .project-goals-button {
    appearance: none;
    background: var(--vault-dashboard-surface-panel);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    border-radius: var(--vault-dashboard-border-radius);
    padding: 4px 10px;
    color: var(--vault-dashboard-text-primary);
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    font-weight: var(--vault-dashboard-font-weight-medium);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--vault-dashboard-space-row);
    transition: background var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap),
                border-color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap),
                color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap);
  }

  .project-goals-button:hover {
    background: var(--vault-dashboard-surface-panel-hover);
    border-color: var(--vault-dashboard-color-accent-cyan);
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .project-goals-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .project-goals-glyph {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .project-task-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .project-task-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vault-dashboard-text-primary);
  }

  .project-task-file {
    color: var(--vault-dashboard-text-faint);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
  }

  .project-jira-row {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
  }

  .project-jira-fix-button {
    appearance: none;
    background: var(--vault-dashboard-surface-panel);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    border-radius: var(--vault-dashboard-border-radius);
    padding: 2px 8px;
    color: var(--vault-dashboard-text-secondary);
    font: inherit;
    font-size: var(--vault-dashboard-font-size-label);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--vault-dashboard-space-row);
    white-space: nowrap;
    transition: border-color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap),
                color var(--vault-dashboard-motion-duration-quick) var(--vault-dashboard-motion-easing-snap);
  }

  .project-jira-fix-button:hover {
    border-color: var(--vault-dashboard-color-accent-cyan);
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .project-jira-fix-button:focus-visible {
    outline: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-accent);
    outline-offset: 2px;
  }

  .project-jira-fix-glyph {
    color: var(--vault-dashboard-color-accent-cyan);
  }

  .project-jira-key {
    color: var(--vault-dashboard-color-accent-cyan);
    font-weight: var(--vault-dashboard-font-weight-bold);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex: 0 0 auto;
  }

  .project-jira-summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vault-dashboard-text-primary);
  }

  .project-jira-status {
    color: var(--vault-dashboard-text-secondary);
    font-size: var(--vault-dashboard-font-size-label);
    font-style: italic;
    white-space: nowrap;
  }

  .project-jira-status[data-status-category="indeterminate"] {
    color: var(--vault-dashboard-color-freshness-cooling);
  }

  .project-jira-status[data-status-category="done"] {
    color: var(--vault-dashboard-color-status-running);
  }

  .claude-session-row-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--vault-dashboard-space-inline);
  }

  .claude-session-slug {
    font-weight: var(--vault-dashboard-font-weight-bold);
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

  .shell-command-output {
    margin: 0;
    padding: var(--vault-dashboard-space-row) var(--vault-dashboard-space-inline);
    background: var(--vault-dashboard-surface-panel);
    border: var(--vault-dashboard-border-width) solid var(--vault-dashboard-border-color-default);
    color: var(--vault-dashboard-text-secondary);
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-label);
    line-height: var(--vault-dashboard-line-height-tight);
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 18em;
    overflow-y: auto;
  }
</style>
