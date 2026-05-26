<script lang="ts">
  import { onDestroy } from "svelte";
  import { get, type Writable } from "svelte/store";
  import { FileSystemAdapter, Notice, TFile, type App as ObsidianApplication } from "obsidian";

  import TabBar from "./TabBar.svelte";
  import WidgetSubTabBar from "./WidgetSubTabBar.svelte";
  import RecentFiles from "./widgets/RecentFiles.svelte";
  import DailyTasks from "./widgets/DailyTasks.svelte";
  import TodayRecap from "./widgets/TodayRecap.svelte";
  import TagFolderStats from "./widgets/TagFolderStats.svelte";
  import GraphInsights from "./widgets/GraphInsights.svelte";
  import PinnedProjects from "./widgets/PinnedProjects.svelte";
  import ClaudeSessions from "./widgets/ClaudeSessions.svelte";
  import ProcrastIdeas from "./widgets/ProcrastIdeas.svelte";
  import JiraIssues from "./widgets/JiraIssues.svelte";

  import { execFile } from "child_process";
  import { shell } from "electron";
  import { promises as filesystemPromises } from "fs";
  import nodePath from "path";

  import { createRecentlyModifiedFilesStore } from "../data/recents";
  import { createOpenTasksStore, formatDailyNoteBasenameForDate } from "../data/tasks";
  import { createTodayRecapStore } from "../data/today";
  import { createTagFolderStatsStore } from "../data/tags";
  import { createGraphInsightsStore } from "../data/graph";
  import { createDockerContainersStore } from "../data/docker";
  import {
    createPinnedProjectsStore,
    collectAllOpenTasksForProjectFolder,
    type ProjectOpenTaskForWidget,
  } from "../data/pinnedProjects";
  import {
    createProjectShellCommandsStore,
    buildShellCommandRunKey,
  } from "../data/projectShellCommands";
  import {
    buildSearchQueryForTag,
    buildSearchQueryForFolder,
    buildSearchQueryForUntaggedNotes,
    openGlobalSearchWithQuery,
  } from "../data/search";
  import { copyTextToClipboardWithFallback } from "../data/clipboard";
  import { launchInObsidianClaudeTerminal } from "../data/claudeTerminal";
  import { createProcrastIdeasStore, type ProcrastIdea } from "../data/procrast";
  import {
    createJiraIssuesStore,
    fetchJiraIssueDetail,
    buildClaudePromptForJiraIssue,
  } from "../data/jira";
  import { openPlanProcrastIdeaFlow } from "./PlanProcrastIdeaModal";
  import { confirmMarkProcrastIdeaDone } from "./ConfirmProcrastIdeaDoneModal";
  import { ProcrastIdeaDetailsModal } from "./ProcrastIdeaDetailsModal";
  import { JiraIssuesModal } from "./JiraIssuesModal";
  import {
    ALL_WIDGET_IDENTIFIERS,
    DEFAULT_ENABLED_WIDGET_IDENTIFIERS,
    DEFAULT_WIDGET_SUB_TAB_NAME,
    buildDefaultWidgetSubTabs,
    resolveActiveTab,
    resolveActiveWidgetSubTab,
    isWidgetOnWidgetSubTab,
    type DashboardTab,
    type FolderPath,
    type PluginSettings,
    type WidgetIdentifier,
  } from "../settings";

  export let obsidianApp: ObsidianApplication;
  export let settingsStore: Writable<PluginSettings>;
  export let refreshSignalStore: Writable<number>;
  export let replaceSettings: (nextSettings: PluginSettings) => Promise<void>;

  const initialSettingsSnapshot = get(settingsStore);
  const initialActiveTab = resolveActiveTab(initialSettingsSnapshot);

  const recentlyModifiedFilesStore = createRecentlyModifiedFilesStore(
    obsidianApp,
    5,
    30,
    initialActiveTab.folderScopes,
  );
  const openTasksStore = createOpenTasksStore(obsidianApp, initialActiveTab.folderScopes);
  const todayRecapStore = createTodayRecapStore(obsidianApp, initialActiveTab.folderScopes);
  const tagFolderStatsStore = createTagFolderStatsStore(obsidianApp, initialActiveTab.folderScopes);
  const graphInsightsStore = createGraphInsightsStore(obsidianApp, initialActiveTab.folderScopes);
  const dockerContainersStore = createDockerContainersStore();
  const pinnedProjectsStore = createPinnedProjectsStore();
  const projectShellCommandsStore = createProjectShellCommandsStore();
  const procrastIdeasStore = createProcrastIdeasStore();
  const jiraIssuesStore = createJiraIssuesStore();

  const recentlyModifiedFilesData = recentlyModifiedFilesStore.store;
  const openTasksData = openTasksStore.store;
  const todayRecapData = todayRecapStore.store;
  const tagFolderStatsData = tagFolderStatsStore.store;
  const graphInsightsData = graphInsightsStore.store;
  const dockerSnapshotData = dockerContainersStore.store;
  const pinnedProjectsForWidgetData = pinnedProjectsStore.store;
  const shellCommandRunsForWidgetData = projectShellCommandsStore.store;
  const procrastIdeasSnapshotData = procrastIdeasStore.store;
  const jiraSnapshotData = jiraIssuesStore.store;

  let expandedPinnedProjectFolderPaths: Set<string> = new Set();
  let hasRequestedInitialProcrastIdeasRefresh = false;

  pinnedProjectsStore.setPinnedProjectsConfig(initialActiveTab.pinnedProjects);
  pinnedProjectsStore.setProcrastIdeaFolderMappings(
    initialSettingsSnapshot.procrastIdeaFolderMappings.filter(
      (mapping) => mapping.tabName === initialActiveTab.name,
    ),
  );
  dockerContainersStore.startPolling();

  jiraIssuesStore.setConnectionSettings(initialSettingsSnapshot.jiraConnection);
  jiraIssuesStore.setProjectKeysToQuery(
    collectJiraProjectKeysFromPinnedProjects(initialActiveTab.pinnedProjects),
  );
  jiraIssuesStore.startPolling();

  const unsubscribeDockerSnapshot = dockerSnapshotData.subscribe((dockerSnapshot) => {
    pinnedProjectsStore.setDockerSnapshot(dockerSnapshot);
  });

  const unsubscribeJiraSnapshot = jiraSnapshotData.subscribe((jiraSnapshot) => {
    pinnedProjectsStore.setJiraSnapshot(jiraSnapshot);
  });

  let hasReceivedInitialRefreshSignal = false;
  const unsubscribeRefreshSignal = refreshSignalStore.subscribe(() => {
    if (!hasReceivedInitialRefreshSignal) {
      hasReceivedInitialRefreshSignal = true;
      return;
    }
    refreshAllDashboardData();
  });

  $: currentSettings = $settingsStore;
  $: activeTab = resolveActiveTab(currentSettings);
  $: tabNames = currentSettings.tabs.map((tab) => tab.name);
  $: activeFolderScopes = activeTab.folderScopes;
  $: activeFolderScopesKey = activeFolderScopes.join(" ");
  $: enabledWidgetsForActiveTab = activeTab.enabledWidgets;
  $: activeWidgetSubTab = resolveActiveWidgetSubTab(activeTab);
  $: widgetSubTabNamesForActiveTab = activeTab.widgetSubTabs.map(
    (widgetSubTab) => widgetSubTab.name,
  );
  $: shouldShowWidgetSubTabBar = activeTab.widgetSubTabs.length > 1;
  // Derived as a Set so the template gates depend on a reactive value directly; calling a
  // function inside {#if} does not re-evaluate when the active sub-tab changes.
  $: visibleWidgetIdentifiersOnActiveSubTab = new Set<WidgetIdentifier>(
    ALL_WIDGET_IDENTIFIERS.filter(
      (widgetIdentifier) =>
        enabledWidgetsForActiveTab.includes(widgetIdentifier) &&
        isWidgetOnWidgetSubTab(activeTab, widgetIdentifier, activeWidgetSubTab.name),
    ),
  );
  $: collapsedWidgetIdentifiersForActiveTab = new Set<WidgetIdentifier>(
    activeTab.collapsedWidgetIdentifiers,
  );
  $: areAllEnabledWidgetsCollapsed =
    enabledWidgetsForActiveTab.length > 0 &&
    enabledWidgetsForActiveTab.every((widgetIdentifier) =>
      collapsedWidgetIdentifiersForActiveTab.has(widgetIdentifier),
    );

  let lastAppliedFolderScopesKey: string = initialActiveTab.folderScopes.join(" ");
  $: if (activeFolderScopesKey !== lastAppliedFolderScopesKey) {
    lastAppliedFolderScopesKey = activeFolderScopesKey;
    recentlyModifiedFilesStore.setFolderScopes(activeFolderScopes);
    openTasksStore.setFolderScopes(activeFolderScopes);
    tagFolderStatsStore.setFolderScopes(activeFolderScopes);
    graphInsightsStore.setFolderScopes(activeFolderScopes);
    todayRecapStore.setFolderScopes(activeFolderScopes);
  }

  $: activePinnedProjectsConfig = activeTab.pinnedProjects;
  $: activePinnedProjectsConfigKey = activePinnedProjectsConfig
    .map((pinnedProject) =>
      [
        pinnedProject.folderPath,
        pinnedProject.displayName,
        pinnedProject.manuallyAssignedContainerNames.join("|"),
        pinnedProject.storedShellCommands
          .map((shellCommand) => `${shellCommand.label}=${shellCommand.command}`)
          .join("|"),
      ].join("::"),
    )
    .join("\n");

  $: activeProcrastIdeaFolderMappings = currentSettings.procrastIdeaFolderMappings.filter(
    (mapping) => mapping.tabName === activeTab.name,
  );
  $: activeProcrastIdeaFolderMappingsKey = activeProcrastIdeaFolderMappings
    .map((mapping) =>
      [
        mapping.ideaUuid,
        mapping.targetFolderPath,
        mapping.tabName,
        mapping.createdAt,
        mapping.ideaTitle,
      ].join("::"),
    )
    .join("\n");

  let lastAppliedPinnedProjectsConfigKey: string = activePinnedProjectsConfigKey;
  $: if (activePinnedProjectsConfigKey !== lastAppliedPinnedProjectsConfigKey) {
    lastAppliedPinnedProjectsConfigKey = activePinnedProjectsConfigKey;
    pinnedProjectsStore.setPinnedProjectsConfig(activePinnedProjectsConfig);
  }

  $: jiraConnectionSettings = currentSettings.jiraConnection;
  $: jiraConnectionSettingsKey = [
    jiraConnectionSettings.siteDomain,
    jiraConnectionSettings.accountEmail,
    jiraConnectionSettings.apiToken,
    String(jiraConnectionSettings.showOnlyIssuesAssignedToCurrentUser),
  ].join("::");

  let lastAppliedJiraConnectionSettingsKey: string = jiraConnectionSettingsKey;
  $: if (jiraConnectionSettingsKey !== lastAppliedJiraConnectionSettingsKey) {
    lastAppliedJiraConnectionSettingsKey = jiraConnectionSettingsKey;
    jiraIssuesStore.setConnectionSettings(jiraConnectionSettings);
  }

  $: activeJiraProjectKeys = collectJiraProjectKeysFromPinnedProjects(activePinnedProjectsConfig);
  $: activeJiraProjectKeysKey = activeJiraProjectKeys.join(",");

  let lastAppliedJiraProjectKeysKey: string = activeJiraProjectKeysKey;
  $: if (activeJiraProjectKeysKey !== lastAppliedJiraProjectKeysKey) {
    lastAppliedJiraProjectKeysKey = activeJiraProjectKeysKey;
    jiraIssuesStore.setProjectKeysToQuery(activeJiraProjectKeys);
  }

  let lastAppliedProcrastIdeaFolderMappingsKey: string = activeProcrastIdeaFolderMappingsKey;
  $: if (activeProcrastIdeaFolderMappingsKey !== lastAppliedProcrastIdeaFolderMappingsKey) {
    lastAppliedProcrastIdeaFolderMappingsKey = activeProcrastIdeaFolderMappingsKey;
    pinnedProjectsStore.setProcrastIdeaFolderMappings(activeProcrastIdeaFolderMappings);
  }

  let lastSeenActiveTabReference: DashboardTab = initialActiveTab;
  $: if (activeTab !== lastSeenActiveTabReference) {
    lastSeenActiveTabReference = activeTab;
    expandedPinnedProjectFolderPaths = new Set();
    pinnedProjectsStore.setExpandedFolderPaths(expandedPinnedProjectFolderPaths);
  }

  onDestroy(() => {
    unsubscribeDockerSnapshot();
    unsubscribeJiraSnapshot();
    unsubscribeRefreshSignal();
    recentlyModifiedFilesStore.destroy();
    openTasksStore.destroy();
    todayRecapStore.destroy();
    tagFolderStatsStore.destroy();
    graphInsightsStore.destroy();
    dockerContainersStore.destroy();
    pinnedProjectsStore.destroy();
    projectShellCommandsStore.destroy();
    procrastIdeasStore.destroy();
    jiraIssuesStore.destroy();
  });

  function isWidgetEnabledForActiveTab(widgetIdentifier: WidgetIdentifier): boolean {
    return enabledWidgetsForActiveTab.includes(widgetIdentifier);
  }

  function handleTabSelection(selectedTabName: string): void {
    if (selectedTabName === currentSettings.activeTabName) {
      return;
    }
    void replaceSettings({ ...currentSettings, activeTabName: selectedTabName });
  }

  function handleWidgetSubTabSelection(selectedWidgetSubTabName: string): void {
    if (selectedWidgetSubTabName === activeTab.activeWidgetSubTabName) {
      return;
    }
    const nextTabs = currentSettings.tabs.map((tab) =>
      tab.name === activeTab.name
        ? { ...tab, activeWidgetSubTabName: selectedWidgetSubTabName }
        : tab,
    );
    void replaceSettings({ ...currentSettings, tabs: nextTabs });
  }

  function handleAddTabRequest(): void {
    const newTabName = pickNextUnusedTabName(currentSettings);
    const newTab: DashboardTab = {
      name: newTabName,
      folderScopes: [],
      enabledWidgets: [...DEFAULT_ENABLED_WIDGET_IDENTIFIERS],
      collapsedWidgetIdentifiers: [],
      pinnedProjects: [],
      widgetSubTabs: buildDefaultWidgetSubTabs(),
      activeWidgetSubTabName: DEFAULT_WIDGET_SUB_TAB_NAME,
    };
    void replaceSettings({
      ...currentSettings,
      tabs: [...currentSettings.tabs, newTab],
      activeTabName: newTabName,
    });
  }

  function handleToggleWidgetCollapsed(widgetIdentifier: WidgetIdentifier): void {
    const isCurrentlyCollapsed =
      activeTab.collapsedWidgetIdentifiers.includes(widgetIdentifier);
    const nextCollapsedWidgetIdentifiers = isCurrentlyCollapsed
      ? activeTab.collapsedWidgetIdentifiers.filter(
          (identifier) => identifier !== widgetIdentifier,
        )
      : [...activeTab.collapsedWidgetIdentifiers, widgetIdentifier];
    persistCollapsedWidgetIdentifiersForActiveTab(nextCollapsedWidgetIdentifiers);
  }

  function handleToggleCollapseAllWidgets(): void {
    const nextCollapsedWidgetIdentifiers = areAllEnabledWidgetsCollapsed
      ? []
      : [...enabledWidgetsForActiveTab];
    persistCollapsedWidgetIdentifiersForActiveTab(nextCollapsedWidgetIdentifiers);
  }

  function persistCollapsedWidgetIdentifiersForActiveTab(
    nextCollapsedWidgetIdentifiers: WidgetIdentifier[],
  ): void {
    const nextTabs = currentSettings.tabs.map((tab) =>
      tab.name === activeTab.name
        ? { ...tab, collapsedWidgetIdentifiers: nextCollapsedWidgetIdentifiers }
        : tab,
    );
    void replaceSettings({ ...currentSettings, tabs: nextTabs });
  }

  function refreshAllDashboardData(): void {
    recentlyModifiedFilesStore.setFolderScopes(activeFolderScopes);
    openTasksStore.setFolderScopes(activeFolderScopes);
    tagFolderStatsStore.setFolderScopes(activeFolderScopes);
    graphInsightsStore.setFolderScopes(activeFolderScopes);
    todayRecapStore.setFolderScopes(activeFolderScopes);
    pinnedProjectsStore.setPinnedProjectsConfig(activePinnedProjectsConfig);
    if (isWidgetEnabledForActiveTab("procrast-ideas")) {
      void procrastIdeasStore.refresh();
    }
    jiraIssuesStore.refreshNow();
  }

  function handleRefreshAllWidgetsRequest(): void {
    refreshAllDashboardData();
  }

  function handleRefreshJiraIssues(): void {
    jiraIssuesStore.refreshNow();
  }

  function handleOpenJiraIssueInBrowser(issueBrowserUrl: string): void {
    void shell.openExternal(issueBrowserUrl);
  }

  function handleShowAllJiraIssuesForProject(
    pinnedProjectFolderPath: string,
    jiraProjectKey: string,
  ): void {
    const projectForWidget = get(pinnedProjectsForWidgetData).find(
      (project) => project.folderPath === pinnedProjectFolderPath,
    );
    if (projectForWidget === undefined) {
      return;
    }
    new JiraIssuesModal(obsidianApp, {
      jiraProjectKey,
      pinnedProjectFolderPath,
      issues: projectForWidget.jiraIssuesForProject,
      onOpenIssueInBrowser: handleOpenJiraIssueInBrowser,
      onStartClaudeSessionFromJiraIssue: handleStartClaudeSessionFromJiraIssue,
    }).open();
  }

  async function handleStartClaudeSessionFromJiraIssue(
    pinnedProjectFolderPath: string,
    issueKey: string,
  ): Promise<void> {
    new Notice(`Fetching ${issueKey} from Jira…`);
    const detailResult = await fetchJiraIssueDetail(currentSettings.jiraConnection, issueKey);
    if (!detailResult.ok) {
      new Notice(`Could not load ${issueKey}: ${detailResult.message}`);
      return;
    }
    const initialPromptText = buildClaudePromptForJiraIssue(detailResult.issue);
    void launchInObsidianClaudeTerminal(obsidianApp, {
      workingDirectoryAbsolutePath: pinnedProjectFolderPath,
      initialPromptText,
      fallbackShellCommandLine: buildClaudeStartFromGoalsCommandLine(
        pinnedProjectFolderPath,
        initialPromptText,
      ),
    });
  }

  function collectJiraProjectKeysFromPinnedProjects(
    pinnedProjects: DashboardTab["pinnedProjects"],
  ): string[] {
    const distinctProjectKeys = new Set<string>();
    for (const pinnedProject of pinnedProjects) {
      const trimmedProjectKey = pinnedProject.jiraProjectKey.trim();
      if (trimmedProjectKey.length > 0) {
        distinctProjectKeys.add(trimmedProjectKey);
      }
    }
    return [...distinctProjectKeys];
  }

  $: procrastIdeaRelevanceTerms = buildProcrastIdeaRelevanceTerms(
    activeFolderScopes,
    activePinnedProjectsConfig,
  );

  $: if (
    enabledWidgetsForActiveTab.includes("procrast-ideas") &&
    !hasRequestedInitialProcrastIdeasRefresh
  ) {
    hasRequestedInitialProcrastIdeasRefresh = true;
    void procrastIdeasStore.refresh();
  }

  function handleOpenSettingsRequest(): void {
    const obsidianAppWithSetting = obsidianApp as ObsidianApplication & {
      setting: {
        open: () => void;
        openTabById: (tabId: string) => void;
      };
    };
    obsidianAppWithSetting.setting.open();
    obsidianAppWithSetting.setting.openTabById("vault-dashboard");
  }

  function handleOpenFileInActiveLeaf(filePath: FolderPath): void {
    const targetFile = obsidianApp.vault.getAbstractFileByPath(filePath);
    if (targetFile === null) {
      return;
    }
    void obsidianApp.workspace.getLeaf(false).openFile(targetFile as never);
  }

  function handleSelectRecentFile(fileName: string): void {
    const matchedFile = $recentlyModifiedFilesData.recentlyModifiedFiles.find(
      (recentFile) => recentFile.fileName === fileName,
    );
    if (matchedFile) {
      handleOpenFileInActiveLeaf(matchedFile.filePath);
    }
  }

  function handleSelectTask(task: { sourceFilePath: string }): void {
    handleOpenFileInActiveLeaf(task.sourceFilePath);
  }

  function handleSelectTagFromStats(tagName: string): void {
    openGlobalSearchWithQuery(
      obsidianApp,
      buildSearchQueryForTag(tagName, activeTab.folderScopes),
    );
  }

  function handleSelectFolderFromStats(folderPath: string): void {
    openGlobalSearchWithQuery(
      obsidianApp,
      buildSearchQueryForFolder(folderPath),
    );
  }

  function handleShowUntaggedNotesFromStats(): void {
    openGlobalSearchWithQuery(
      obsidianApp,
      buildSearchQueryForUntaggedNotes(activeTab.folderScopes),
    );
  }

  function handleOpenDailyNote(): void {
    const todayLabel = $openTasksData.todayDailyNoteLabel.replace(/\s+daily$/, "");
    const matchedFile = obsidianApp.vault
      .getMarkdownFiles()
      .find((file) => file.basename === todayLabel);
    if (matchedFile) {
      handleOpenFileInActiveLeaf(matchedFile.path);
    }
  }

  function handleCreateDailyNote(): void {
    const obsidianAppWithCommands = obsidianApp as ObsidianApplication & {
      commands: { executeCommandById: (commandId: string) => boolean };
    };
    obsidianAppWithCommands.commands.executeCommandById("daily-notes");
  }

  async function handleAddDailyTask(taskText: string): Promise<boolean> {
    const trimmedTaskText = taskText.trim();
    if (trimmedTaskText.length === 0) {
      return false;
    }

    const dailyTaskLine = `- [ ] ${trimmedTaskText}`;
    let dailyNoteFile = findTodayDailyNoteFile();
    if (dailyNoteFile === null) {
      handleCreateDailyNote();
      dailyNoteFile = await waitForTodayDailyNoteFile();
    }
    if (dailyNoteFile === null) {
      dailyNoteFile = await createFallbackDailyNoteWithTask(dailyTaskLine);
      if (dailyNoteFile === null) {
        return false;
      }
      new Notice("Created daily note and added task");
      refreshAllDashboardData();
      return true;
    }

    try {
      const currentDailyNoteContents = await obsidianApp.vault.cachedRead(dailyNoteFile);
      const taskSeparator =
        currentDailyNoteContents.length === 0 || currentDailyNoteContents.endsWith("\n")
          ? ""
          : "\n";
      await obsidianApp.vault.modify(
        dailyNoteFile,
        `${currentDailyNoteContents}${taskSeparator}${dailyTaskLine}\n`,
      );
      new Notice("Added task to daily note");
      refreshAllDashboardData();
      return true;
    } catch {
      new Notice("Could not add task to daily note");
      return false;
    }
  }

  function findTodayDailyNoteFile(): TFile | null {
    const todayLabel = $openTasksData.todayDailyNoteLabel.replace(/\s+daily$/, "");
    return (
      obsidianApp.vault
        .getMarkdownFiles()
        .find((file) => file.basename === todayLabel) ?? null
    );
  }

  async function waitForTodayDailyNoteFile(): Promise<TFile | null> {
    for (let attemptIndex = 0; attemptIndex < 15; attemptIndex++) {
      const dailyNoteFile = findTodayDailyNoteFile();
      if (dailyNoteFile !== null) {
        return dailyNoteFile;
      }
      await delay(100);
    }
    return null;
  }

  async function createFallbackDailyNoteWithTask(taskLine: string): Promise<TFile | null> {
    const todayLabel = $openTasksData.todayDailyNoteLabel.replace(/\s+daily$/, "");
    try {
      return await obsidianApp.vault.create(`${todayLabel}.md`, `${taskLine}\n`);
    } catch {
      new Notice("Could not create today's daily note");
      return null;
    }
  }

  function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  async function handleAddTaskForNextWorkday(taskText: string): Promise<boolean> {
    const trimmedTaskText = taskText.trim();
    if (trimmedTaskText.length === 0) {
      return false;
    }
    const nextWorkdayBasename = get(todayRecapData).nextWorkdayBasename;
    const didAddTask = await appendTaskLineToDailyNoteByBasename(
      nextWorkdayBasename,
      `- [ ] ${trimmedTaskText}`,
    );
    if (didAddTask) {
      new Notice(`Added task for ${nextWorkdayBasename}`);
      refreshAllDashboardData();
    }
    return didAddTask;
  }

  function handleOpenNextWorkdayNote(): void {
    const nextWorkdayBasename = get(todayRecapData).nextWorkdayBasename;
    const matchedFile = obsidianApp.vault
      .getMarkdownFiles()
      .find((file) => file.basename === nextWorkdayBasename);
    if (matchedFile) {
      handleOpenFileInActiveLeaf(matchedFile.path);
    }
  }

  async function appendTaskLineToDailyNoteByBasename(
    dailyNoteBasename: string,
    taskLine: string,
  ): Promise<boolean> {
    const existingDailyNoteFile = obsidianApp.vault
      .getMarkdownFiles()
      .find((file) => file.basename === dailyNoteBasename) ?? null;

    if (existingDailyNoteFile === null) {
      try {
        await obsidianApp.vault.create(`${dailyNoteBasename}.md`, `${taskLine}\n`);
        return true;
      } catch {
        new Notice("Could not create the daily note");
        return false;
      }
    }

    try {
      const currentContents = await obsidianApp.vault.cachedRead(existingDailyNoteFile);
      const taskSeparator =
        currentContents.length === 0 || currentContents.endsWith("\n") ? "" : "\n";
      await obsidianApp.vault.modify(
        existingDailyNoteFile,
        `${currentContents}${taskSeparator}${taskLine}\n`,
      );
      return true;
    } catch {
      new Notice("Could not add task to the daily note");
      return false;
    }
  }

  function pickNextUnusedTabName(settings: PluginSettings): string {
    let attemptIndex = settings.tabs.length + 1;
    while (true) {
      const candidate = `Tab ${attemptIndex}`;
      if (!settings.tabs.some((existingTab) => existingTab.name === candidate)) {
        return candidate;
      }
      attemptIndex++;
    }
  }

  function handleTogglePinnedProjectExpansion(displayedFolderPath: string): void {
    const nextExpandedFolderPaths = new Set(expandedPinnedProjectFolderPaths);
    if (nextExpandedFolderPaths.has(displayedFolderPath)) {
      nextExpandedFolderPaths.delete(displayedFolderPath);
    } else {
      nextExpandedFolderPaths.add(displayedFolderPath);
    }
    expandedPinnedProjectFolderPaths = nextExpandedFolderPaths;
    pinnedProjectsStore.setExpandedFolderPaths(expandedPinnedProjectFolderPaths);
  }

  function handleOpenPinnedProjectChildFile(
    pinnedProjectFolderPath: string,
    relativeChildFilePath: string,
  ): void {
    const absoluteChildFilePath = nodePath.resolve(
      pinnedProjectFolderPath,
      relativeChildFilePath,
    );
    openAbsoluteMarkdownFilePath(absoluteChildFilePath);
  }

  function openAbsoluteMarkdownFilePath(absoluteMarkdownFilePath: string): void {
    if (openMarkdownFileInsideObsidianIfWithinVault(absoluteMarkdownFilePath)) {
      return;
    }
    openMarkdownFileInCodeEditor(absoluteMarkdownFilePath);
  }

  function openMarkdownFileInCodeEditor(absoluteMarkdownFilePath: string): void {
    execFile("/usr/bin/open", ["-a", "Zed", absoluteMarkdownFilePath], (error) => {
      if (error) {
        new Notice("Could not open GOALS.md in Zed — opening with the default app");
        void shell.openPath(absoluteMarkdownFilePath);
      }
    });
  }

  function openMarkdownFileInsideObsidianIfWithinVault(
    absoluteFilePath: string,
  ): boolean {
    if (!absoluteFilePath.toLowerCase().endsWith(".md")) {
      return false;
    }
    const vaultRelativeFilePath =
      resolveVaultRelativeFilePathIfWithinVault(absoluteFilePath);
    if (vaultRelativeFilePath === null) {
      return false;
    }
    const matchedAbstractFile = obsidianApp.vault.getAbstractFileByPath(vaultRelativeFilePath);
    if (!(matchedAbstractFile instanceof TFile)) {
      return false;
    }
    void obsidianApp.workspace.getLeaf(false).openFile(matchedAbstractFile);
    return true;
  }

  function resolveVaultRelativeFilePathIfWithinVault(
    absoluteFilePath: string,
  ): string | null {
    const vaultBasePath = resolveCurrentVaultBasePath();
    if (vaultBasePath === null) {
      return null;
    }
    if (!isAbsolutePathInsideVault(absoluteFilePath, vaultBasePath)) {
      return null;
    }
    return nodePath
      .relative(vaultBasePath, absoluteFilePath)
      .split(nodePath.sep)
      .join("/");
  }

  function resolveCurrentVaultBasePath(): string | null {
    const vaultAdapter = obsidianApp.vault.adapter;
    if (vaultAdapter instanceof FileSystemAdapter) {
      return vaultAdapter.getBasePath();
    }
    return null;
  }

  function isAbsolutePathInsideVault(
    absoluteFilePath: string,
    vaultBasePath: string,
  ): boolean {
    const lowercasedFilePath = absoluteFilePath.toLowerCase();
    const lowercasedVaultBasePath = vaultBasePath.toLowerCase();
    return (
      lowercasedFilePath === lowercasedVaultBasePath ||
      lowercasedFilePath.startsWith(`${lowercasedVaultBasePath}/`)
    );
  }

  function handleRunPinnedProjectShellCommand(
    pinnedProjectFolderPath: string,
    shellCommandIndex: number,
    commandLine: string,
  ): void {
    projectShellCommandsStore.startCommandRun({
      runKey: buildShellCommandRunKey(pinnedProjectFolderPath, shellCommandIndex),
      workingDirectoryAbsolutePath: pinnedProjectFolderPath,
      commandLine,
    });
  }

  function handleKillPinnedProjectShellCommand(
    pinnedProjectFolderPath: string,
    shellCommandIndex: number,
  ): void {
    projectShellCommandsStore.killCommandRun(
      buildShellCommandRunKey(pinnedProjectFolderPath, shellCommandIndex),
    );
  }

  function buildClaudeResumeCommandLine(
    pinnedProjectFolderPath: string,
    sessionId: string,
  ): string {
    return `cd ${quoteShellArgument(pinnedProjectFolderPath)} && claude --resume ${quoteShellArgument(sessionId)}`;
  }

  const PROJECT_GOALS_FILE_NAME = "GOALS.md";
  const PROJECT_GOALS_FILE_TEMPLATE = "# Goals\n\n- \n";

  function buildClaudeStartFromGoalsCommandLine(
    pinnedProjectFolderPath: string,
    initialPromptText: string,
  ): string {
    return `cd ${quoteShellArgument(pinnedProjectFolderPath)} && claude ${quoteShellArgument(initialPromptText)}`;
  }

  function quoteShellArgument(argumentValue: string): string {
    return `'${argumentValue.replace(/'/g, "'\\''")}'`;
  }

  function resolveProjectGoalsFilePath(pinnedProjectFolderPath: string): string {
    return nodePath.resolve(pinnedProjectFolderPath, PROJECT_GOALS_FILE_NAME);
  }

  function buildProjectGoalsPlanningPrompt(projectGoalsMarkdown: string): string {
    return `Here are the goals from GOALS.md:\n\n---\n${projectGoalsMarkdown}\n---\n\nPlease make a plan to accomplish these goals.`;
  }

  async function handleCreateProjectGoalsFile(
    pinnedProjectFolderPath: string,
  ): Promise<void> {
    const absoluteGoalsFilePath = resolveProjectGoalsFilePath(pinnedProjectFolderPath);
    const vaultRelativeGoalsFilePath =
      resolveVaultRelativeFilePathIfWithinVault(absoluteGoalsFilePath);

    if (vaultRelativeGoalsFilePath !== null) {
      const existingGoalsFile =
        obsidianApp.vault.getAbstractFileByPath(vaultRelativeGoalsFilePath);
      if (existingGoalsFile instanceof TFile) {
        new Notice("GOALS.md already exists — opening it");
        void obsidianApp.workspace.getLeaf(false).openFile(existingGoalsFile);
        refreshAllDashboardData();
        return;
      }

      try {
        const createdGoalsFile = await obsidianApp.vault.create(
          vaultRelativeGoalsFilePath,
          PROJECT_GOALS_FILE_TEMPLATE,
        );
        new Notice("Created GOALS.md");
        void obsidianApp.workspace.getLeaf(false).openFile(createdGoalsFile);
        refreshAllDashboardData();
        return;
      } catch {
        const existingAfterFailedCreate =
          obsidianApp.vault.getAbstractFileByPath(vaultRelativeGoalsFilePath);
        if (existingAfterFailedCreate instanceof TFile) {
          new Notice("GOALS.md already exists — opening it");
          void obsidianApp.workspace.getLeaf(false).openFile(existingAfterFailedCreate);
          refreshAllDashboardData();
          return;
        }
        new Notice("Could not create GOALS.md");
        return;
      }
    }

    try {
      await filesystemPromises.writeFile(absoluteGoalsFilePath, PROJECT_GOALS_FILE_TEMPLATE, {
        encoding: "utf8",
        flag: "wx",
      });
      new Notice("Created GOALS.md");
    } catch (error) {
      if (isFileAlreadyExistsError(error)) {
        new Notice("GOALS.md already exists — opening it");
      } else {
        new Notice("Could not create GOALS.md");
        return;
      }
    }

    openAbsoluteMarkdownFilePath(absoluteGoalsFilePath);
    refreshAllDashboardData();
  }

  function isErrorWithCode(error: unknown, expectedCode: string): boolean {
    return (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === expectedCode
    );
  }

  function isFileAlreadyExistsError(error: unknown): boolean {
    return isErrorWithCode(error, "EEXIST");
  }

  function isFileNotFoundError(error: unknown): boolean {
    return isErrorWithCode(error, "ENOENT");
  }

  function handleOpenProjectGoalsFile(pinnedProjectFolderPath: string): void {
    openAbsoluteMarkdownFilePath(resolveProjectGoalsFilePath(pinnedProjectFolderPath));
  }

  async function readProjectGoalsPrompt(
    pinnedProjectFolderPath: string,
  ): Promise<string | null> {
    try {
      const projectGoalsMarkdown = await filesystemPromises.readFile(
        resolveProjectGoalsFilePath(pinnedProjectFolderPath),
        "utf8",
      );
      return buildProjectGoalsPlanningPrompt(projectGoalsMarkdown);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        new Notice("GOALS.md no longer exists — refreshing");
        refreshAllDashboardData();
      } else {
        new Notice("Could not read GOALS.md");
      }
      return null;
    }
  }

  function handleCopyClaudeResumeCommandToClipboard(
    pinnedProjectFolderPath: string,
    sessionId: string,
  ): void {
    const resumeCommandLine = buildClaudeResumeCommandLine(pinnedProjectFolderPath, sessionId);
    void copyTextToClipboardWithFallback(resumeCommandLine).then((wasCopied) => {
      new Notice(
        wasCopied
          ? "Resume command copied to clipboard"
          : "Could not copy resume command",
      );
    });
  }

  function handleRelaunchClaudeSession(
    pinnedProjectFolderPath: string,
    sessionId: string,
  ): void {
    void launchInObsidianClaudeTerminal(obsidianApp, {
      workingDirectoryAbsolutePath: pinnedProjectFolderPath,
      resumeSessionId: sessionId,
      fallbackShellCommandLine: buildClaudeResumeCommandLine(pinnedProjectFolderPath, sessionId),
    });
  }

  async function handleStartClaudeSessionFromProjectGoals(
    pinnedProjectFolderPath: string,
  ): Promise<void> {
    const initialPromptText = await readProjectGoalsPrompt(pinnedProjectFolderPath);
    if (initialPromptText === null) {
      return;
    }
    void launchInObsidianClaudeTerminal(obsidianApp, {
      workingDirectoryAbsolutePath: pinnedProjectFolderPath,
      initialPromptText,
      fallbackShellCommandLine: buildClaudeStartFromGoalsCommandLine(
        pinnedProjectFolderPath,
        initialPromptText,
      ),
    });
  }

  const COLLECTED_OPEN_TASKS_HEADING_PATTERN = /^## Open tasks \(collected /m;

  function buildCollectedOpenTasksSectionMarkdown(
    collectedOpenTasks: ProjectOpenTaskForWidget[],
    collectedOnIsoDate: string,
  ): string {
    const taskLines = collectedOpenTasks.map(
      (openTask) => `- [ ] ${openTask.taskText}  (${openTask.relativeFilePath})`,
    );
    return `## Open tasks (collected ${collectedOnIsoDate})\n${taskLines.join("\n")}\n`;
  }

  // Re-collecting replaces the previous collected block rather than appending, so the
  // section never accumulates stale duplicates across runs while any hand-written content
  // above or below it survives untouched.
  function mergeCollectedTasksSectionIntoGoalsMarkdown(
    existingGoalsMarkdown: string,
    collectedTasksSectionMarkdown: string,
  ): string {
    const headingMatch = existingGoalsMarkdown.match(COLLECTED_OPEN_TASKS_HEADING_PATTERN);
    if (headingMatch === null || headingMatch.index === undefined) {
      const trimmedExisting = existingGoalsMarkdown.replace(/\s*$/, "");
      const leadingSeparator = trimmedExisting.length === 0 ? "" : "\n\n";
      return `${trimmedExisting}${leadingSeparator}${collectedTasksSectionMarkdown}`;
    }

    const markdownBeforeSection = existingGoalsMarkdown.slice(0, headingMatch.index);
    const markdownFromSectionStart = existingGoalsMarkdown.slice(headingMatch.index);
    const markdownAfterCollectedHeadingPrefix = markdownFromSectionStart.slice(
      headingMatch[0].length,
    );
    const nextHeadingMatch = markdownAfterCollectedHeadingPrefix.match(/^## /m);
    const markdownAfterSection =
      nextHeadingMatch === null || nextHeadingMatch.index === undefined
        ? ""
        : markdownAfterCollectedHeadingPrefix.slice(nextHeadingMatch.index);

    const trimmedBefore = markdownBeforeSection.replace(/\s*$/, "");
    const leadingSeparator = trimmedBefore.length === 0 ? "" : "\n\n";
    const trailingBlock = markdownAfterSection.length === 0 ? "" : `\n${markdownAfterSection}`;
    return `${trimmedBefore}${leadingSeparator}${collectedTasksSectionMarkdown}${trailingBlock}`;
  }

  async function readExistingProjectGoalsMarkdownOrTemplate(
    absoluteGoalsFilePath: string,
  ): Promise<string> {
    try {
      return await filesystemPromises.readFile(absoluteGoalsFilePath, "utf8");
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return PROJECT_GOALS_FILE_TEMPLATE;
      }
      throw error;
    }
  }

  async function writeProjectGoalsMarkdown(
    absoluteGoalsFilePath: string,
    goalsMarkdown: string,
  ): Promise<boolean> {
    const vaultRelativeGoalsFilePath =
      resolveVaultRelativeFilePathIfWithinVault(absoluteGoalsFilePath);

    if (vaultRelativeGoalsFilePath !== null) {
      try {
        const existingGoalsFile =
          obsidianApp.vault.getAbstractFileByPath(vaultRelativeGoalsFilePath);
        if (existingGoalsFile instanceof TFile) {
          await obsidianApp.vault.modify(existingGoalsFile, goalsMarkdown);
        } else {
          await obsidianApp.vault.create(vaultRelativeGoalsFilePath, goalsMarkdown);
        }
        return true;
      } catch {
        return false;
      }
    }

    try {
      await filesystemPromises.writeFile(absoluteGoalsFilePath, goalsMarkdown, {
        encoding: "utf8",
      });
      return true;
    } catch {
      return false;
    }
  }

  async function handleCollectOpenTasksIntoProjectGoals(
    pinnedProjectFolderPath: string,
  ): Promise<void> {
    const collectedOpenTasks = await collectAllOpenTasksForProjectFolder(
      pinnedProjectFolderPath,
    );
    if (collectedOpenTasks.length === 0) {
      new Notice("No open tasks to collect");
      return;
    }

    const collectedTasksSectionMarkdown = buildCollectedOpenTasksSectionMarkdown(
      collectedOpenTasks,
      formatDailyNoteBasenameForDate(new Date()),
    );
    const absoluteGoalsFilePath = resolveProjectGoalsFilePath(pinnedProjectFolderPath);

    let mergedGoalsMarkdown: string;
    try {
      const existingGoalsMarkdown =
        await readExistingProjectGoalsMarkdownOrTemplate(absoluteGoalsFilePath);
      mergedGoalsMarkdown = mergeCollectedTasksSectionIntoGoalsMarkdown(
        existingGoalsMarkdown,
        collectedTasksSectionMarkdown,
      );
    } catch {
      new Notice("Could not read GOALS.md");
      return;
    }

    const wasWritten = await writeProjectGoalsMarkdown(
      absoluteGoalsFilePath,
      mergedGoalsMarkdown,
    );
    if (!wasWritten) {
      new Notice("Could not write GOALS.md");
      return;
    }

    new Notice(
      `Collected ${collectedOpenTasks.length} ${collectedOpenTasks.length === 1 ? "task" : "tasks"} into GOALS.md`,
    );
    openAbsoluteMarkdownFilePath(absoluteGoalsFilePath);
    refreshAllDashboardData();
  }

  function handleClearPinnedProjectShellCommandOutput(
    pinnedProjectFolderPath: string,
    shellCommandIndex: number,
  ): void {
    projectShellCommandsStore.clearCommandRunOutput(
      buildShellCommandRunKey(pinnedProjectFolderPath, shellCommandIndex),
    );
  }

  function handleCopyProcrastIdeaUuid(ideaUuid: string): void {
    void copyTextToClipboardWithFallback(ideaUuid).then((wasCopied) => {
      new Notice(wasCopied ? "Procrast idea UUID copied" : "Could not copy idea UUID");
    });
  }

  function handleShowProcrastIdeaDetails(idea: ProcrastIdea): void {
    new ProcrastIdeaDetailsModal(obsidianApp, idea).open();
  }

  function handlePlanProcrastIdeaHere(idea: ProcrastIdea): void {
    void openPlanProcrastIdeaFlow({
      obsidianApp,
      getSettings: () => get(settingsStore),
      replaceSettings,
      initialIdea: idea,
    });
  }

  async function handleMarkProcrastIdeaDone(idea: ProcrastIdea): Promise<void> {
    const wasConfirmed = await confirmMarkProcrastIdeaDone(obsidianApp, idea);
    if (!wasConfirmed) {
      return;
    }

    const result = await procrastIdeasStore.markDone(idea.uuid);
    if (result.ok) {
      new Notice("Marked Procrast idea done");
      await procrastIdeasStore.refresh();
      return;
    }

    if (result.availability === "not-installed") {
      new Notice("Procrast CLI not found");
      return;
    }
    if (result.availability === "unauthenticated") {
      new Notice("Log in to Procrast from a terminal");
      return;
    }
    new Notice("Could not mark Procrast idea done");
  }

  function buildProcrastIdeaRelevanceTerms(
    folderScopes: FolderPath[],
    pinnedProjects: DashboardTab["pinnedProjects"],
  ): string[] {
    const relevanceTerms = new Set<string>();
    for (const folderScope of folderScopes) {
      addPathTerms(relevanceTerms, folderScope);
    }
    for (const pinnedProject of pinnedProjects) {
      addPathTerms(relevanceTerms, pinnedProject.folderPath);
      const displayName = pinnedProject.displayName.trim();
      if (displayName.length > 0) {
        relevanceTerms.add(displayName);
      }
    }
    return [...relevanceTerms];
  }

  function addPathTerms(relevanceTerms: Set<string>, rawPath: string): void {
    const trimmedPath = rawPath.trim();
    if (trimmedPath.length === 0) {
      return;
    }
    relevanceTerms.add(trimmedPath);
    const basename = nodePath.basename(trimmedPath);
    if (basename.length > 0 && basename !== trimmedPath) {
      relevanceTerms.add(basename);
    }
  }

</script>

<div class="vault-dashboard" data-density="comfortable">
  <TabBar
    {tabNames}
    activeTabName={currentSettings.activeTabName}
    areAllWidgetsCollapsed={areAllEnabledWidgetsCollapsed}
    onSelectTab={handleTabSelection}
    onAddTab={handleAddTabRequest}
    onToggleCollapseAllWidgets={handleToggleCollapseAllWidgets}
    onRefreshAllWidgets={handleRefreshAllWidgetsRequest}
    onOpenSettings={handleOpenSettingsRequest}
  />

  {#if shouldShowWidgetSubTabBar}
    <WidgetSubTabBar
      widgetSubTabNames={widgetSubTabNamesForActiveTab}
      activeWidgetSubTabName={activeWidgetSubTab.name}
      onSelectWidgetSubTab={handleWidgetSubTabSelection}
    />
  {/if}

  <main class="widget-grid">
    {#if visibleWidgetIdentifiersOnActiveSubTab.has("recent-files")}
      <div class="widget-cell">
        <RecentFiles
          recentlyModifiedFiles={$recentlyModifiedFilesData.recentlyModifiedFiles}
          totalRecentlyModifiedCount={$recentlyModifiedFilesData.totalRecentlyModifiedCount}
          recencyWindowLabel={$recentlyModifiedFilesData.recencyWindowLabel}
          viewState={$recentlyModifiedFilesData.recentlyModifiedFiles.length === 0
            ? "empty"
            : "data"}
          isCollapsed={collapsedWidgetIdentifiersForActiveTab.has("recent-files")}
          onToggleCollapsed={() => handleToggleWidgetCollapsed("recent-files")}
          onSelectFile={handleSelectRecentFile}
        />
      </div>
    {/if}

    {#if visibleWidgetIdentifiersOnActiveSubTab.has("daily-tasks")}
      <div class="widget-cell">
        <DailyTasks
          isCollapsed={collapsedWidgetIdentifiersForActiveTab.has("daily-tasks")}
          onToggleCollapsed={() => handleToggleWidgetCollapsed("daily-tasks")}
          openTasks={$openTasksData.openTasks}
          totalOpenTaskCount={$openTasksData.totalOpenTaskCount}
          tasksCreatedTodayCount={$openTasksData.tasksCreatedTodayCount}
          todayDailyNoteLabel={$openTasksData.todayDailyNoteLabel}
          todayDailyNoteExists={$openTasksData.todayDailyNoteExists}
          viewState="data"
          onSelectTask={handleSelectTask}
          onOpenDailyNote={handleOpenDailyNote}
          onCreateDailyNote={handleCreateDailyNote}
          onAddDailyTask={handleAddDailyTask}
        />
      </div>
    {/if}

    {#if visibleWidgetIdentifiersOnActiveSubTab.has("today-recap")}
      <div class="widget-cell">
        <TodayRecap
          snapshot={$todayRecapData}
          isCollapsed={collapsedWidgetIdentifiersForActiveTab.has("today-recap")}
          onToggleCollapsed={() => handleToggleWidgetCollapsed("today-recap")}
          onOpenFile={handleOpenFileInActiveLeaf}
          onAddNextWorkdayTask={handleAddTaskForNextWorkday}
          onOpenNextWorkdayNote={handleOpenNextWorkdayNote}
        />
      </div>
    {/if}

    {#if visibleWidgetIdentifiersOnActiveSubTab.has("tag-folder-stats")}
      <div class="widget-cell">
        <TagFolderStats
          isCollapsed={collapsedWidgetIdentifiersForActiveTab.has("tag-folder-stats")}
          onToggleCollapsed={() => handleToggleWidgetCollapsed("tag-folder-stats")}
          topTags={$tagFolderStatsData.topTags}
          topFolders={$tagFolderStatsData.topFolders}
          untaggedNoteCount={$tagFolderStatsData.untaggedNoteCount}
          viewState={$tagFolderStatsData.topTags.length === 0 &&
          $tagFolderStatsData.topFolders.length === 0
            ? "empty"
            : "data"}
          onSelectTag={handleSelectTagFromStats}
          onSelectFolder={handleSelectFolderFromStats}
          onShowUntaggedNotes={handleShowUntaggedNotesFromStats}
        />
      </div>
    {/if}

    {#if visibleWidgetIdentifiersOnActiveSubTab.has("graph-insights")}
      <div class="widget-cell">
        <GraphInsights
          isCollapsed={collapsedWidgetIdentifiersForActiveTab.has("graph-insights")}
          onToggleCollapsed={() => handleToggleWidgetCollapsed("graph-insights")}
          orphanNoteCount={$graphInsightsData.orphanNoteCount}
          orphanNotes={$graphInsightsData.orphanNotes}
          hubNoteLabels={$graphInsightsData.hubNoteLabels}
          hubNotes={$graphInsightsData.hubNotes}
          brokenLinkCount={$graphInsightsData.brokenLinkCount}
          brokenLinks={$graphInsightsData.brokenLinks}
          mostLinkedNoteFileName={$graphInsightsData.mostLinkedNoteFileName}
          mostLinkedNoteFilePath={$graphInsightsData.mostLinkedNoteFilePath}
          mostLinkedNoteIncomingLinkCount={$graphInsightsData.mostLinkedNoteIncomingLinkCount}
          mostLinkingNoteFileName={$graphInsightsData.mostLinkingNoteFileName}
          mostLinkingNoteFilePath={$graphInsightsData.mostLinkingNoteFilePath}
          mostLinkingNoteOutgoingLinkCount={$graphInsightsData.mostLinkingNoteOutgoingLinkCount}
          viewState="data"
          onOpenFileByPath={handleOpenFileInActiveLeaf}
        />
      </div>
    {/if}

    {#if visibleWidgetIdentifiersOnActiveSubTab.has("procrast-ideas")}
      <div class="widget-cell widget-cell-wide">
        <ProcrastIdeas
          isCollapsed={collapsedWidgetIdentifiersForActiveTab.has("procrast-ideas")}
          onToggleCollapsed={() => handleToggleWidgetCollapsed("procrast-ideas")}
          procrastSnapshot={$procrastIdeasSnapshotData}
          relevanceTerms={procrastIdeaRelevanceTerms}
          onCopyIdeaUuid={handleCopyProcrastIdeaUuid}
          onPlanHere={handlePlanProcrastIdeaHere}
          onMarkDone={handleMarkProcrastIdeaDone}
          onShowDetails={handleShowProcrastIdeaDetails}
          onRefresh={() => void procrastIdeasStore.refresh()}
        />
      </div>
    {/if}

    {#if visibleWidgetIdentifiersOnActiveSubTab.has("pinned-projects")}
      <div class="widget-cell widget-cell-wide">
        <PinnedProjects
          isCollapsed={collapsedWidgetIdentifiersForActiveTab.has("pinned-projects")}
          onToggleCollapsed={() => handleToggleWidgetCollapsed("pinned-projects")}
          pinnedProjects={$pinnedProjectsForWidgetData}
          viewState={$pinnedProjectsForWidgetData.length === 0 ? "empty" : "data"}
          shellCommandRunsByKey={$shellCommandRunsForWidgetData}
          onToggleProjectExpansion={handleTogglePinnedProjectExpansion}
          onOpenChildFile={handleOpenPinnedProjectChildFile}
          onRunShellCommand={handleRunPinnedProjectShellCommand}
          onKillShellCommand={handleKillPinnedProjectShellCommand}
          onClearShellCommandOutput={handleClearPinnedProjectShellCommandOutput}
          onCopyClaudeResumeCommand={handleCopyClaudeResumeCommandToClipboard}
          onRelaunchClaudeSession={handleRelaunchClaudeSession}
          onStartSessionFromProjectGoals={handleStartClaudeSessionFromProjectGoals}
          onCreateProjectGoalsFile={handleCreateProjectGoalsFile}
          onOpenProjectGoalsFile={handleOpenProjectGoalsFile}
          onCollectOpenTasksIntoProjectGoals={handleCollectOpenTasksIntoProjectGoals}
          onOpenJiraIssueInBrowser={handleOpenJiraIssueInBrowser}
          onStartClaudeSessionFromJiraIssue={handleStartClaudeSessionFromJiraIssue}
          onShowAllJiraIssues={handleShowAllJiraIssuesForProject}
        />
      </div>
    {/if}

    {#if visibleWidgetIdentifiersOnActiveSubTab.has("jira-issues")}
      <div class="widget-cell widget-cell-wide">
        <JiraIssues
          isCollapsed={collapsedWidgetIdentifiersForActiveTab.has("jira-issues")}
          onToggleCollapsed={() => handleToggleWidgetCollapsed("jira-issues")}
          jiraSnapshot={$jiraSnapshotData}
          onRefresh={handleRefreshJiraIssues}
          onOpenIssueInBrowser={handleOpenJiraIssueInBrowser}
        />
      </div>
    {/if}

    {#if visibleWidgetIdentifiersOnActiveSubTab.has("claude-sessions")}
      <div class="widget-cell widget-cell-wide">
        <ClaudeSessions
          isCollapsed={collapsedWidgetIdentifiersForActiveTab.has("claude-sessions")}
          onToggleCollapsed={() => handleToggleWidgetCollapsed("claude-sessions")}
          pinnedProjects={$pinnedProjectsForWidgetData}
          onCopyClaudeResumeCommand={handleCopyClaudeResumeCommandToClipboard}
          onRelaunchClaudeSession={handleRelaunchClaudeSession}
        />
      </div>
    {/if}
  </main>
</div>

<style>
  .vault-dashboard {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--vault-dashboard-surface-background);
    color: var(--vault-dashboard-text-primary);
    font-family: var(--vault-dashboard-font-family-mono);
    font-size: var(--vault-dashboard-font-size-body);
    line-height: var(--vault-dashboard-line-height-default);
    font-feature-settings: var(--vault-dashboard-tabular-feature-settings);
  }

  .widget-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: var(--vault-dashboard-space-pane);
    padding: var(--vault-dashboard-space-pane);
    overflow: auto;
    align-items: start;
  }

  .widget-cell {
    min-width: 0;
  }

  .widget-cell-wide {
    grid-column: 1 / -1;
  }

</style>
