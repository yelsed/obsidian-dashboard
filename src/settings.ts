export type FolderPath = string;

export type JiraSiteDomain = string;
export type JiraAccountEmail = string;
export type JiraApiToken = string;
export type JiraProjectKey = string;

export type WidgetIdentifier =
  | "recent-files"
  | "daily-tasks"
  | "today-recap"
  | "tag-folder-stats"
  | "graph-insights"
  | "pinned-projects"
  | "claude-sessions"
  | "procrast-ideas"
  | "jira-issues";

export const ALL_WIDGET_IDENTIFIERS: readonly WidgetIdentifier[] = [
  "recent-files",
  "daily-tasks",
  "today-recap",
  "tag-folder-stats",
  "graph-insights",
  "pinned-projects",
  "claude-sessions",
  "procrast-ideas",
  "jira-issues",
] as const;

export const DEFAULT_ENABLED_WIDGET_IDENTIFIERS: readonly WidgetIdentifier[] = [
  "recent-files",
  "daily-tasks",
  "today-recap",
  "tag-folder-stats",
  "graph-insights",
  "pinned-projects",
  "claude-sessions",
  "jira-issues",
] as const;

export const WIDGET_DISPLAY_LABEL_BY_IDENTIFIER: Record<WidgetIdentifier, string> = {
  "recent-files": "Recent files",
  "daily-tasks": "Daily note + tasks",
  "today-recap": "Today",
  "tag-folder-stats": "Tags + folders",
  "graph-insights": "Graph insights",
  "pinned-projects": "Pinned projects",
  "claude-sessions": "Claude sessions",
  "procrast-ideas": "Procrast ideas",
  "jira-issues": "Jira issues",
};

export type PinnedProject = {
  folderPath: FolderPath;
  displayName: string;
  manuallyAssignedContainerNames: string[];
  storedShellCommands: { label: string; command: string }[];
  jiraProjectKey: JiraProjectKey;
};

export type JiraConnectionSettings = {
  siteDomain: JiraSiteDomain;
  accountEmail: JiraAccountEmail;
  apiToken: JiraApiToken;
  showOnlyIssuesAssignedToCurrentUser: boolean;
};

export type ProcrastIdeaFolderMapping = {
  ideaUuid: string;
  targetFolderPath: FolderPath;
  tabName: string;
  createdAt: string;
  ideaTitle: string;
};

export type WidgetSubTabName = string;

export type WidgetSubTab = {
  name: WidgetSubTabName;
  widgetIdentifiers: WidgetIdentifier[];
};

export const DEFAULT_WIDGET_SUB_TAB_NAME = "Main";

export function buildDefaultWidgetSubTabs(): WidgetSubTab[] {
  return [
    {
      name: DEFAULT_WIDGET_SUB_TAB_NAME,
      widgetIdentifiers: [...ALL_WIDGET_IDENTIFIERS],
    },
  ];
}

export type DashboardTab = {
  name: string;
  folderScopes: FolderPath[];
  enabledWidgets: WidgetIdentifier[];
  collapsedWidgetIdentifiers: WidgetIdentifier[];
  pinnedProjects: PinnedProject[];
  widgetSubTabs: WidgetSubTab[];
  activeWidgetSubTabName: WidgetSubTabName;
};

export type WorkspaceStartupSettings = {
  runDashboardWorkspaceLayoutOnStartup: boolean;
  workspaceLayoutPromptSuppressed: boolean;
};

export type PluginSettings = {
  tabs: DashboardTab[];
  activeTabName: string;
  workspaceStartup: WorkspaceStartupSettings;
  procrastIdeaFolderMappings: ProcrastIdeaFolderMapping[];
  jiraConnection: JiraConnectionSettings;
};

export const DEFAULT_WORKSPACE_STARTUP_SETTINGS: WorkspaceStartupSettings = {
  runDashboardWorkspaceLayoutOnStartup: false,
  workspaceLayoutPromptSuppressed: false,
};

export const DEFAULT_JIRA_CONNECTION_SETTINGS: JiraConnectionSettings = {
  siteDomain: "",
  accountEmail: "",
  apiToken: "",
  showOnlyIssuesAssignedToCurrentUser: true,
};

export function isJiraConnectionConfigured(connection: JiraConnectionSettings): boolean {
  return (
    connection.siteDomain.trim().length > 0 &&
    connection.accountEmail.trim().length > 0 &&
    connection.apiToken.trim().length > 0
  );
}

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  tabs: [
    {
      name: "Work",
      folderScopes: [],
      enabledWidgets: [...DEFAULT_ENABLED_WIDGET_IDENTIFIERS],
      collapsedWidgetIdentifiers: [],
      pinnedProjects: [],
      widgetSubTabs: buildDefaultWidgetSubTabs(),
      activeWidgetSubTabName: DEFAULT_WIDGET_SUB_TAB_NAME,
    },
    {
      name: "Private",
      folderScopes: [],
      enabledWidgets: [...DEFAULT_ENABLED_WIDGET_IDENTIFIERS],
      collapsedWidgetIdentifiers: [],
      pinnedProjects: [],
      widgetSubTabs: buildDefaultWidgetSubTabs(),
      activeWidgetSubTabName: DEFAULT_WIDGET_SUB_TAB_NAME,
    },
  ],
  activeTabName: "Work",
  workspaceStartup: { ...DEFAULT_WORKSPACE_STARTUP_SETTINGS },
  procrastIdeaFolderMappings: [],
  jiraConnection: { ...DEFAULT_JIRA_CONNECTION_SETTINGS },
};

export function migrateLoadedSettings(rawLoadedSettings: unknown): PluginSettings {
  if (rawLoadedSettings === null || typeof rawLoadedSettings !== "object") {
    return cloneDefaultSettings();
  }

  const loadedSettingsRecord = rawLoadedSettings as Record<string, unknown>;
  const loadedTabsRaw = loadedSettingsRecord.tabs;

  const migratedTabs: DashboardTab[] = Array.isArray(loadedTabsRaw)
    ? loadedTabsRaw
        .map((rawTab) => migrateLoadedTab(rawTab))
        .filter((tab): tab is DashboardTab => tab !== null)
    : [];

  if (migratedTabs.length === 0) {
    return cloneDefaultSettings();
  }

  const loadedActiveTabNameRaw = loadedSettingsRecord.activeTabName;
  const activeTabName =
    typeof loadedActiveTabNameRaw === "string" &&
    migratedTabs.some((tab) => tab.name === loadedActiveTabNameRaw)
      ? loadedActiveTabNameRaw
      : migratedTabs[0].name;

  const workspaceStartup = migrateLoadedWorkspaceStartupSettings(
    loadedSettingsRecord.workspaceStartup,
  );

  return {
    tabs: migratedTabs,
    activeTabName,
    workspaceStartup,
    procrastIdeaFolderMappings: migrateLoadedProcrastIdeaFolderMappings(
      loadedSettingsRecord.procrastIdeaFolderMappings,
    ),
    jiraConnection: migrateLoadedJiraConnectionSettings(loadedSettingsRecord.jiraConnection),
  };
}

function migrateLoadedJiraConnectionSettings(
  rawJiraConnection: unknown,
): JiraConnectionSettings {
  if (rawJiraConnection === null || typeof rawJiraConnection !== "object") {
    return { ...DEFAULT_JIRA_CONNECTION_SETTINGS };
  }
  const rawJiraConnectionRecord = rawJiraConnection as Record<string, unknown>;
  return {
    siteDomain:
      typeof rawJiraConnectionRecord.siteDomain === "string"
        ? rawJiraConnectionRecord.siteDomain.trim()
        : "",
    accountEmail:
      typeof rawJiraConnectionRecord.accountEmail === "string"
        ? rawJiraConnectionRecord.accountEmail.trim()
        : "",
    apiToken:
      typeof rawJiraConnectionRecord.apiToken === "string"
        ? rawJiraConnectionRecord.apiToken
        : "",
    showOnlyIssuesAssignedToCurrentUser:
      typeof rawJiraConnectionRecord.showOnlyIssuesAssignedToCurrentUser === "boolean"
        ? rawJiraConnectionRecord.showOnlyIssuesAssignedToCurrentUser
        : true,
  };
}

function migrateLoadedWorkspaceStartupSettings(
  rawWorkspaceStartup: unknown,
): WorkspaceStartupSettings {
  if (rawWorkspaceStartup === null || typeof rawWorkspaceStartup !== "object") {
    return { ...DEFAULT_WORKSPACE_STARTUP_SETTINGS };
  }
  const rawWorkspaceStartupRecord = rawWorkspaceStartup as Record<string, unknown>;
  return {
    runDashboardWorkspaceLayoutOnStartup:
      typeof rawWorkspaceStartupRecord.runDashboardWorkspaceLayoutOnStartup === "boolean"
        ? rawWorkspaceStartupRecord.runDashboardWorkspaceLayoutOnStartup
        : false,
    workspaceLayoutPromptSuppressed:
      typeof rawWorkspaceStartupRecord.workspaceLayoutPromptSuppressed === "boolean"
        ? rawWorkspaceStartupRecord.workspaceLayoutPromptSuppressed
        : false,
  };
}

function migrateLoadedTab(rawTab: unknown): DashboardTab | null {
  if (rawTab === null || typeof rawTab !== "object") {
    return null;
  }
  const rawTabRecord = rawTab as Record<string, unknown>;
  const tabName = typeof rawTabRecord.name === "string" ? rawTabRecord.name.trim() : "";
  if (tabName.length === 0) {
    return null;
  }

  const folderScopes = Array.isArray(rawTabRecord.folderScopes)
    ? rawTabRecord.folderScopes
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

  const enabledWidgets = Array.isArray(rawTabRecord.enabledWidgets)
    ? rawTabRecord.enabledWidgets.filter(isKnownWidgetIdentifier)
    : [...DEFAULT_ENABLED_WIDGET_IDENTIFIERS];

  const collapsedWidgetIdentifiers = Array.isArray(rawTabRecord.collapsedWidgetIdentifiers)
    ? rawTabRecord.collapsedWidgetIdentifiers.filter(isKnownWidgetIdentifier)
    : [];

  const pinnedProjects = Array.isArray(rawTabRecord.pinnedProjects)
    ? rawTabRecord.pinnedProjects
        .map((rawPinnedProject) => migrateLoadedPinnedProject(rawPinnedProject))
        .filter((pinnedProject): pinnedProject is PinnedProject => pinnedProject !== null)
    : [];

  const parsedWidgetSubTabs = Array.isArray(rawTabRecord.widgetSubTabs)
    ? rawTabRecord.widgetSubTabs
        .map((rawWidgetSubTab) => migrateLoadedWidgetSubTab(rawWidgetSubTab))
        .filter((widgetSubTab): widgetSubTab is WidgetSubTab => widgetSubTab !== null)
    : [];
  const widgetSubTabs =
    parsedWidgetSubTabs.length > 0 ? parsedWidgetSubTabs : buildDefaultWidgetSubTabs();

  const rawActiveWidgetSubTabName = rawTabRecord.activeWidgetSubTabName;
  const activeWidgetSubTabName =
    typeof rawActiveWidgetSubTabName === "string" &&
    widgetSubTabs.some((widgetSubTab) => widgetSubTab.name === rawActiveWidgetSubTabName)
      ? rawActiveWidgetSubTabName
      : widgetSubTabs[0].name;

  return {
    name: tabName,
    folderScopes,
    enabledWidgets,
    collapsedWidgetIdentifiers,
    pinnedProjects,
    widgetSubTabs,
    activeWidgetSubTabName,
  };
}

function migrateLoadedWidgetSubTab(rawWidgetSubTab: unknown): WidgetSubTab | null {
  if (rawWidgetSubTab === null || typeof rawWidgetSubTab !== "object") {
    return null;
  }
  const rawWidgetSubTabRecord = rawWidgetSubTab as Record<string, unknown>;
  const widgetSubTabName =
    typeof rawWidgetSubTabRecord.name === "string" ? rawWidgetSubTabRecord.name.trim() : "";
  if (widgetSubTabName.length === 0) {
    return null;
  }
  const widgetIdentifiers = Array.isArray(rawWidgetSubTabRecord.widgetIdentifiers)
    ? rawWidgetSubTabRecord.widgetIdentifiers.filter(isKnownWidgetIdentifier)
    : [];
  return { name: widgetSubTabName, widgetIdentifiers };
}

function migrateLoadedPinnedProject(rawPinnedProject: unknown): PinnedProject | null {
  if (rawPinnedProject === null || typeof rawPinnedProject !== "object") {
    return null;
  }
  const rawPinnedProjectRecord = rawPinnedProject as Record<string, unknown>;
  const folderPath =
    typeof rawPinnedProjectRecord.folderPath === "string"
      ? rawPinnedProjectRecord.folderPath.trim()
      : "";
  if (folderPath.length === 0) {
    return null;
  }

  const displayName =
    typeof rawPinnedProjectRecord.displayName === "string"
      ? rawPinnedProjectRecord.displayName.trim()
      : "";

  const manuallyAssignedContainerNames = Array.isArray(
    rawPinnedProjectRecord.manuallyAssignedContainerNames,
  )
    ? rawPinnedProjectRecord.manuallyAssignedContainerNames.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];

  const storedShellCommands = Array.isArray(rawPinnedProjectRecord.storedShellCommands)
    ? rawPinnedProjectRecord.storedShellCommands
        .filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object")
        .map((entry) => ({
          label: typeof entry.label === "string" ? entry.label : "",
          command: typeof entry.command === "string" ? entry.command : "",
        }))
        .filter((entry) => entry.label.length > 0 && entry.command.length > 0)
    : [];

  const jiraProjectKey =
    typeof rawPinnedProjectRecord.jiraProjectKey === "string"
      ? rawPinnedProjectRecord.jiraProjectKey.trim()
      : "";

  return {
    folderPath,
    displayName,
    manuallyAssignedContainerNames,
    storedShellCommands,
    jiraProjectKey,
  };
}

function migrateLoadedProcrastIdeaFolderMappings(
  rawMappings: unknown,
): ProcrastIdeaFolderMapping[] {
  if (!Array.isArray(rawMappings)) {
    return [];
  }
  return rawMappings
    .map((rawMapping) => migrateLoadedProcrastIdeaFolderMapping(rawMapping))
    .filter((mapping): mapping is ProcrastIdeaFolderMapping => mapping !== null);
}

function migrateLoadedProcrastIdeaFolderMapping(
  rawMapping: unknown,
): ProcrastIdeaFolderMapping | null {
  if (rawMapping === null || typeof rawMapping !== "object") {
    return null;
  }
  const rawMappingRecord = rawMapping as Record<string, unknown>;
  const ideaUuid =
    typeof rawMappingRecord.ideaUuid === "string" ? rawMappingRecord.ideaUuid.trim() : "";
  const targetFolderPath =
    typeof rawMappingRecord.targetFolderPath === "string"
      ? rawMappingRecord.targetFolderPath.trim()
      : "";
  const tabName =
    typeof rawMappingRecord.tabName === "string" ? rawMappingRecord.tabName.trim() : "";
  if (ideaUuid.length === 0 || targetFolderPath.length === 0 || tabName.length === 0) {
    return null;
  }
  return {
    ideaUuid,
    targetFolderPath,
    tabName,
    createdAt:
      typeof rawMappingRecord.createdAt === "string" ? rawMappingRecord.createdAt : "",
    ideaTitle:
      typeof rawMappingRecord.ideaTitle === "string" ? rawMappingRecord.ideaTitle : "",
  };
}

function isKnownWidgetIdentifier(candidate: unknown): candidate is WidgetIdentifier {
  return (
    typeof candidate === "string" &&
    (ALL_WIDGET_IDENTIFIERS as readonly string[]).includes(candidate)
  );
}

function cloneDefaultSettings(): PluginSettings {
  return {
    tabs: DEFAULT_PLUGIN_SETTINGS.tabs.map((defaultTab) => ({
      name: defaultTab.name,
      folderScopes: [...defaultTab.folderScopes],
      enabledWidgets: [...defaultTab.enabledWidgets],
      collapsedWidgetIdentifiers: [...defaultTab.collapsedWidgetIdentifiers],
      pinnedProjects: defaultTab.pinnedProjects.map((pinnedProject) => ({
        folderPath: pinnedProject.folderPath,
        displayName: pinnedProject.displayName,
        manuallyAssignedContainerNames: [...pinnedProject.manuallyAssignedContainerNames],
        storedShellCommands: pinnedProject.storedShellCommands.map((shellCommand) => ({
          label: shellCommand.label,
          command: shellCommand.command,
        })),
        jiraProjectKey: pinnedProject.jiraProjectKey,
      })),
      widgetSubTabs: defaultTab.widgetSubTabs.map((widgetSubTab) => ({
        name: widgetSubTab.name,
        widgetIdentifiers: [...widgetSubTab.widgetIdentifiers],
      })),
      activeWidgetSubTabName: defaultTab.activeWidgetSubTabName,
    })),
    activeTabName: DEFAULT_PLUGIN_SETTINGS.activeTabName,
    workspaceStartup: { ...DEFAULT_PLUGIN_SETTINGS.workspaceStartup },
    procrastIdeaFolderMappings: DEFAULT_PLUGIN_SETTINGS.procrastIdeaFolderMappings.map(
      (mapping) => ({
        ideaUuid: mapping.ideaUuid,
        targetFolderPath: mapping.targetFolderPath,
        tabName: mapping.tabName,
        createdAt: mapping.createdAt,
        ideaTitle: mapping.ideaTitle,
      }),
    ),
    jiraConnection: { ...DEFAULT_PLUGIN_SETTINGS.jiraConnection },
  };
}

export function findTabByName(
  settings: PluginSettings,
  tabName: string,
): DashboardTab | null {
  return settings.tabs.find((tab) => tab.name === tabName) ?? null;
}

export function resolveActiveTab(settings: PluginSettings): DashboardTab {
  return findTabByName(settings, settings.activeTabName) ?? settings.tabs[0];
}

export function resolveActiveWidgetSubTab(tab: DashboardTab): WidgetSubTab {
  const matchingWidgetSubTab = tab.widgetSubTabs.find(
    (widgetSubTab) => widgetSubTab.name === tab.activeWidgetSubTabName,
  );
  return matchingWidgetSubTab ?? tab.widgetSubTabs[0];
}

// A widget never assigned to any sub-tab (e.g. introduced after the user reorganised) falls
// back to the first sub-tab so it always renders somewhere rather than vanishing.
export function resolveEffectiveWidgetSubTabName(
  tab: DashboardTab,
  widgetIdentifier: WidgetIdentifier,
): WidgetSubTabName {
  const owningWidgetSubTab = tab.widgetSubTabs.find((widgetSubTab) =>
    widgetSubTab.widgetIdentifiers.includes(widgetIdentifier),
  );
  return (owningWidgetSubTab ?? tab.widgetSubTabs[0]).name;
}

export function isWidgetOnWidgetSubTab(
  tab: DashboardTab,
  widgetIdentifier: WidgetIdentifier,
  widgetSubTabName: WidgetSubTabName,
): boolean {
  return resolveEffectiveWidgetSubTabName(tab, widgetIdentifier) === widgetSubTabName;
}

export function computeWidgetSubTabsWithWidgetAssignedTo(
  widgetSubTabs: WidgetSubTab[],
  widgetIdentifier: WidgetIdentifier,
  targetWidgetSubTabName: WidgetSubTabName,
): WidgetSubTab[] {
  return widgetSubTabs.map((widgetSubTab) => {
    if (widgetSubTab.name === targetWidgetSubTabName) {
      if (widgetSubTab.widgetIdentifiers.includes(widgetIdentifier)) {
        return widgetSubTab;
      }
      return {
        ...widgetSubTab,
        widgetIdentifiers: [...widgetSubTab.widgetIdentifiers, widgetIdentifier],
      };
    }
    return {
      ...widgetSubTab,
      widgetIdentifiers: widgetSubTab.widgetIdentifiers.filter(
        (entry) => entry !== widgetIdentifier,
      ),
    };
  });
}

export function normaliseFolderScope(folderScope: FolderPath): FolderPath {
  return folderScope.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function isFilePathWithinFolderScopes(
  filePath: FolderPath,
  folderScopes: FolderPath[],
): boolean {
  if (folderScopes.length === 0) {
    return true;
  }
  const lowercasedFilePath = filePath.toLowerCase();
  for (const rawScope of folderScopes) {
    const normalisedLowercaseScope = normaliseFolderScope(rawScope).toLowerCase();
    if (normalisedLowercaseScope.length === 0) {
      return true;
    }
    if (lowercasedFilePath === normalisedLowercaseScope) {
      return true;
    }
    if (lowercasedFilePath.startsWith(`${normalisedLowercaseScope}/`)) {
      return true;
    }
  }
  return false;
}
