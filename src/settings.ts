export type FolderPath = string;

export type PinnedProjectId = string;
export type DashboardTabId = string;
export type WidgetSubTabId = string;

// Stable identity that survives renames and folder-path edits. Tabs, sub-tabs, and pinned
// projects are matched on this id everywhere — never on their display name or folder path —
// so two of them that happen to share a name or basename never drive each other.
export function generateStableId(): string {
  return crypto.randomUUID();
}

export type JiraSiteDomain = string;
export type JiraAccountEmail = string;
export type JiraApiToken = string;
export type JiraProjectKey = string;

export type WidgetIdentifier =
  | "recent-files"
  | "daily-tasks"
  | "tag-folder-stats"
  | "graph-insights"
  | "pinned-projects"
  | "claude-sessions"
  | "procrast-ideas"
  | "jira-issues";

export const ALL_WIDGET_IDENTIFIERS: readonly WidgetIdentifier[] = [
  "recent-files",
  "daily-tasks",
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
  "tag-folder-stats",
  "graph-insights",
  "pinned-projects",
  "claude-sessions",
  "jira-issues",
] as const;

export const WIDGET_DISPLAY_LABEL_BY_IDENTIFIER: Record<WidgetIdentifier, string> = {
  "recent-files": "Recent files",
  "daily-tasks": "Daily tasks + next workday",
  "tag-folder-stats": "Tags + folders",
  "graph-insights": "Graph insights",
  "pinned-projects": "Pinned projects",
  "claude-sessions": "Claude sessions",
  "procrast-ideas": "Procrast ideas",
  "jira-issues": "Jira issues",
};

export type PinnedProject = {
  id: PinnedProjectId;
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
  tabId: DashboardTabId;
  createdAt: string;
  ideaTitle: string;
};

export type WidgetSubTabName = string;

export type WidgetSubTab = {
  id: WidgetSubTabId;
  name: WidgetSubTabName;
  widgetIdentifiers: WidgetIdentifier[];
};

export const DEFAULT_WIDGET_SUB_TAB_NAME = "Main";

export function buildDefaultWidgetSubTabs(): WidgetSubTab[] {
  return [
    {
      id: generateStableId(),
      name: DEFAULT_WIDGET_SUB_TAB_NAME,
      widgetIdentifiers: [...ALL_WIDGET_IDENTIFIERS],
    },
  ];
}

// JavaScript Date.getDay() index: 0 = Sunday … 6 = Saturday.
export type DayOfWeekIndex = number;

export const DEFAULT_WORKING_DAY_INDICES: readonly DayOfWeekIndex[] = [1, 2, 3, 4, 5] as const;

export type DashboardTab = {
  id: DashboardTabId;
  name: string;
  folderScopes: FolderPath[];
  dailyNoteFolderPath: FolderPath;
  workingDayIndices: DayOfWeekIndex[];
  enabledWidgets: WidgetIdentifier[];
  collapsedWidgetIdentifiers: WidgetIdentifier[];
  pinnedProjects: PinnedProject[];
  widgetSubTabs: WidgetSubTab[];
  activeWidgetSubTabId: WidgetSubTabId;
};

export type WorkspaceStartupSettings = {
  runDashboardWorkspaceLayoutOnStartup: boolean;
  workspaceLayoutPromptSuppressed: boolean;
};

export type DailyTaskReminderSettings = {
  isEnabled: boolean;
  timeOfDay: string;
};

export const DEFAULT_DAILY_TASK_REMINDER_SETTINGS: DailyTaskReminderSettings = {
  isEnabled: true,
  timeOfDay: "15:45",
};

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type PluginSettings = {
  tabs: DashboardTab[];
  activeTabId: DashboardTabId;
  workspaceStartup: WorkspaceStartupSettings;
  dailyTaskReminder: DailyTaskReminderSettings;
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

export function buildDefaultDashboardTab(name: string): DashboardTab {
  const widgetSubTabs = buildDefaultWidgetSubTabs();
  return {
    id: generateStableId(),
    name,
    folderScopes: [],
    dailyNoteFolderPath: "",
    workingDayIndices: [...DEFAULT_WORKING_DAY_INDICES],
    enabledWidgets: [...DEFAULT_ENABLED_WIDGET_IDENTIFIERS],
    collapsedWidgetIdentifiers: [],
    pinnedProjects: [],
    widgetSubTabs,
    activeWidgetSubTabId: widgetSubTabs[0].id,
  };
}

export function buildDefaultPluginSettings(): PluginSettings {
  const workTab = buildDefaultDashboardTab("Work");
  const privateTab = buildDefaultDashboardTab("Private");
  return {
    tabs: [workTab, privateTab],
    activeTabId: workTab.id,
    workspaceStartup: { ...DEFAULT_WORKSPACE_STARTUP_SETTINGS },
    dailyTaskReminder: { ...DEFAULT_DAILY_TASK_REMINDER_SETTINGS },
    procrastIdeaFolderMappings: [],
    jiraConnection: { ...DEFAULT_JIRA_CONNECTION_SETTINGS },
  };
}

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = buildDefaultPluginSettings();

export function migrateLoadedSettings(rawLoadedSettings: unknown): PluginSettings {
  if (rawLoadedSettings === null || typeof rawLoadedSettings !== "object") {
    return buildDefaultPluginSettings();
  }

  const loadedSettingsRecord = rawLoadedSettings as Record<string, unknown>;
  const loadedTabsRaw = loadedSettingsRecord.tabs;

  const migratedTabs: DashboardTab[] = Array.isArray(loadedTabsRaw)
    ? loadedTabsRaw
        .map((rawTab) => migrateLoadedTab(rawTab))
        .filter((tab): tab is DashboardTab => tab !== null)
    : [];

  if (migratedTabs.length === 0) {
    return buildDefaultPluginSettings();
  }

  // Settings saved before ids existed referenced tabs by name; map the legacy name onto the
  // now-assigned id (first occurrence wins) so activeTabId and idea mappings keep pointing at
  // the same tab they used to.
  const legacyTabNameToTabId = new Map<string, DashboardTabId>();
  for (const migratedTab of migratedTabs) {
    if (!legacyTabNameToTabId.has(migratedTab.name)) {
      legacyTabNameToTabId.set(migratedTab.name, migratedTab.id);
    }
  }
  const validTabIds = new Set(migratedTabs.map((tab) => tab.id));

  const activeTabId = resolveLoadedActiveTabId(
    loadedSettingsRecord,
    validTabIds,
    legacyTabNameToTabId,
    migratedTabs[0].id,
  );

  const workspaceStartup = migrateLoadedWorkspaceStartupSettings(
    loadedSettingsRecord.workspaceStartup,
  );

  return {
    tabs: migratedTabs,
    activeTabId,
    workspaceStartup,
    dailyTaskReminder: migrateLoadedDailyTaskReminderSettings(
      loadedSettingsRecord.dailyTaskReminder,
    ),
    procrastIdeaFolderMappings: migrateLoadedProcrastIdeaFolderMappings(
      loadedSettingsRecord.procrastIdeaFolderMappings,
      validTabIds,
      legacyTabNameToTabId,
    ),
    jiraConnection: migrateLoadedJiraConnectionSettings(loadedSettingsRecord.jiraConnection),
  };
}

function resolveLoadedActiveTabId(
  loadedSettingsRecord: Record<string, unknown>,
  validTabIds: Set<DashboardTabId>,
  legacyTabNameToTabId: Map<string, DashboardTabId>,
  fallbackTabId: DashboardTabId,
): DashboardTabId {
  const loadedActiveTabIdRaw = loadedSettingsRecord.activeTabId;
  if (typeof loadedActiveTabIdRaw === "string" && validTabIds.has(loadedActiveTabIdRaw)) {
    return loadedActiveTabIdRaw;
  }
  const loadedActiveTabNameRaw = loadedSettingsRecord.activeTabName;
  if (typeof loadedActiveTabNameRaw === "string") {
    const tabIdForLegacyName = legacyTabNameToTabId.get(loadedActiveTabNameRaw);
    if (tabIdForLegacyName !== undefined) {
      return tabIdForLegacyName;
    }
  }
  return fallbackTabId;
}

function migrateLoadedDailyTaskReminderSettings(
  rawDailyTaskReminder: unknown,
): DailyTaskReminderSettings {
  if (rawDailyTaskReminder === null || typeof rawDailyTaskReminder !== "object") {
    return { ...DEFAULT_DAILY_TASK_REMINDER_SETTINGS };
  }
  const rawRecord = rawDailyTaskReminder as Record<string, unknown>;
  const timeOfDay =
    typeof rawRecord.timeOfDay === "string" && TIME_OF_DAY_PATTERN.test(rawRecord.timeOfDay.trim())
      ? rawRecord.timeOfDay.trim()
      : DEFAULT_DAILY_TASK_REMINDER_SETTINGS.timeOfDay;
  return {
    isEnabled:
      typeof rawRecord.isEnabled === "boolean"
        ? rawRecord.isEnabled
        : DEFAULT_DAILY_TASK_REMINDER_SETTINGS.isEnabled,
    timeOfDay,
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

  const tabId =
    typeof rawTabRecord.id === "string" && rawTabRecord.id.trim().length > 0
      ? rawTabRecord.id
      : generateStableId();

  const folderScopes = Array.isArray(rawTabRecord.folderScopes)
    ? rawTabRecord.folderScopes
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

  const dailyNoteFolderPath =
    typeof rawTabRecord.dailyNoteFolderPath === "string"
      ? normaliseFolderScope(rawTabRecord.dailyNoteFolderPath.trim())
      : "";

  const workingDayIndices = migrateLoadedWorkingDayIndices(rawTabRecord.workingDayIndices);

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

  const activeWidgetSubTabId = resolveLoadedActiveWidgetSubTabId(rawTabRecord, widgetSubTabs);

  return {
    id: tabId,
    name: tabName,
    folderScopes,
    dailyNoteFolderPath,
    workingDayIndices,
    enabledWidgets,
    collapsedWidgetIdentifiers,
    pinnedProjects,
    widgetSubTabs,
    activeWidgetSubTabId,
  };
}

function resolveLoadedActiveWidgetSubTabId(
  rawTabRecord: Record<string, unknown>,
  widgetSubTabs: WidgetSubTab[],
): WidgetSubTabId {
  const rawActiveWidgetSubTabId = rawTabRecord.activeWidgetSubTabId;
  if (
    typeof rawActiveWidgetSubTabId === "string" &&
    widgetSubTabs.some((widgetSubTab) => widgetSubTab.id === rawActiveWidgetSubTabId)
  ) {
    return rawActiveWidgetSubTabId;
  }
  const rawActiveWidgetSubTabName = rawTabRecord.activeWidgetSubTabName;
  if (typeof rawActiveWidgetSubTabName === "string") {
    const matchingByLegacyName = widgetSubTabs.find(
      (widgetSubTab) => widgetSubTab.name === rawActiveWidgetSubTabName,
    );
    if (matchingByLegacyName !== undefined) {
      return matchingByLegacyName.id;
    }
  }
  return widgetSubTabs[0].id;
}

function migrateLoadedWorkingDayIndices(rawWorkingDayIndices: unknown): DayOfWeekIndex[] {
  if (!Array.isArray(rawWorkingDayIndices)) {
    return [...DEFAULT_WORKING_DAY_INDICES];
  }
  const validDayIndices: DayOfWeekIndex[] = [];
  for (const rawEntry of rawWorkingDayIndices) {
    if (
      typeof rawEntry === "number" &&
      Number.isInteger(rawEntry) &&
      rawEntry >= 0 &&
      rawEntry <= 6 &&
      !validDayIndices.includes(rawEntry)
    ) {
      validDayIndices.push(rawEntry);
    }
  }
  return validDayIndices;
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
  const widgetSubTabId =
    typeof rawWidgetSubTabRecord.id === "string" && rawWidgetSubTabRecord.id.trim().length > 0
      ? rawWidgetSubTabRecord.id
      : generateStableId();
  return { id: widgetSubTabId, name: widgetSubTabName, widgetIdentifiers };
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

  const pinnedProjectId =
    typeof rawPinnedProjectRecord.id === "string" && rawPinnedProjectRecord.id.trim().length > 0
      ? rawPinnedProjectRecord.id
      : generateStableId();

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
    id: pinnedProjectId,
    folderPath,
    displayName,
    manuallyAssignedContainerNames,
    storedShellCommands,
    jiraProjectKey,
  };
}

function migrateLoadedProcrastIdeaFolderMappings(
  rawMappings: unknown,
  validTabIds: Set<DashboardTabId>,
  legacyTabNameToTabId: Map<string, DashboardTabId>,
): ProcrastIdeaFolderMapping[] {
  if (!Array.isArray(rawMappings)) {
    return [];
  }
  return rawMappings
    .map((rawMapping) =>
      migrateLoadedProcrastIdeaFolderMapping(rawMapping, validTabIds, legacyTabNameToTabId),
    )
    .filter((mapping): mapping is ProcrastIdeaFolderMapping => mapping !== null);
}

function migrateLoadedProcrastIdeaFolderMapping(
  rawMapping: unknown,
  validTabIds: Set<DashboardTabId>,
  legacyTabNameToTabId: Map<string, DashboardTabId>,
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
  const tabId = resolveLoadedMappingTabId(rawMappingRecord, validTabIds, legacyTabNameToTabId);
  if (ideaUuid.length === 0 || targetFolderPath.length === 0 || tabId === null) {
    return null;
  }
  return {
    ideaUuid,
    targetFolderPath,
    tabId,
    createdAt:
      typeof rawMappingRecord.createdAt === "string" ? rawMappingRecord.createdAt : "",
    ideaTitle:
      typeof rawMappingRecord.ideaTitle === "string" ? rawMappingRecord.ideaTitle : "",
  };
}

function resolveLoadedMappingTabId(
  rawMappingRecord: Record<string, unknown>,
  validTabIds: Set<DashboardTabId>,
  legacyTabNameToTabId: Map<string, DashboardTabId>,
): DashboardTabId | null {
  const rawTabId = rawMappingRecord.tabId;
  if (typeof rawTabId === "string" && validTabIds.has(rawTabId)) {
    return rawTabId;
  }
  const rawTabName = rawMappingRecord.tabName;
  if (typeof rawTabName === "string") {
    const tabIdForLegacyName = legacyTabNameToTabId.get(rawTabName.trim());
    if (tabIdForLegacyName !== undefined) {
      return tabIdForLegacyName;
    }
  }
  return null;
}

function isKnownWidgetIdentifier(candidate: unknown): candidate is WidgetIdentifier {
  return (
    typeof candidate === "string" &&
    (ALL_WIDGET_IDENTIFIERS as readonly string[]).includes(candidate)
  );
}

export function findTabById(
  settings: PluginSettings,
  tabId: DashboardTabId,
): DashboardTab | null {
  return settings.tabs.find((tab) => tab.id === tabId) ?? null;
}

export function resolveActiveTab(settings: PluginSettings): DashboardTab {
  return findTabById(settings, settings.activeTabId) ?? settings.tabs[0];
}

export function resolveActiveWidgetSubTab(tab: DashboardTab): WidgetSubTab {
  const matchingWidgetSubTab = tab.widgetSubTabs.find(
    (widgetSubTab) => widgetSubTab.id === tab.activeWidgetSubTabId,
  );
  return matchingWidgetSubTab ?? tab.widgetSubTabs[0];
}

// A widget never assigned to any sub-tab (e.g. introduced after the user reorganised) falls
// back to the first sub-tab so it always renders somewhere rather than vanishing.
export function resolveEffectiveWidgetSubTabId(
  tab: DashboardTab,
  widgetIdentifier: WidgetIdentifier,
): WidgetSubTabId {
  const owningWidgetSubTab = tab.widgetSubTabs.find((widgetSubTab) =>
    widgetSubTab.widgetIdentifiers.includes(widgetIdentifier),
  );
  return (owningWidgetSubTab ?? tab.widgetSubTabs[0]).id;
}

export function isWidgetOnWidgetSubTab(
  tab: DashboardTab,
  widgetIdentifier: WidgetIdentifier,
  widgetSubTabId: WidgetSubTabId,
): boolean {
  return resolveEffectiveWidgetSubTabId(tab, widgetIdentifier) === widgetSubTabId;
}

export function computeWidgetSubTabsWithWidgetAssignedTo(
  widgetSubTabs: WidgetSubTab[],
  widgetIdentifier: WidgetIdentifier,
  targetWidgetSubTabId: WidgetSubTabId,
): WidgetSubTab[] {
  return widgetSubTabs.map((widgetSubTab) => {
    if (widgetSubTab.id === targetWidgetSubTabId) {
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

export function formatDailyNoteBasenameForDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildDailyNotePathForBasename(
  dailyNoteFolderPath: FolderPath,
  dailyNoteBasename: string,
): string {
  const normalisedFolder = normaliseFolderScope(dailyNoteFolderPath);
  return normalisedFolder.length === 0
    ? `${dailyNoteBasename}.md`
    : `${normalisedFolder}/${dailyNoteBasename}.md`;
}

export function buildDailyNotePathForDate(dailyNoteFolderPath: FolderPath, date: Date): string {
  return buildDailyNotePathForBasename(dailyNoteFolderPath, formatDailyNoteBasenameForDate(date));
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
