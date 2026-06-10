import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { writable, type Writable } from "svelte/store";

import { DashboardView, VAULT_DASHBOARD_VIEW_TYPE } from "./view";
import { VaultDashboardSettingsTab } from "./ui/SettingsTab";
import { WorkspaceStartupPromptModal } from "./ui/WorkspaceStartupPromptModal";
import { registerDashboardCommands, refreshDynamicTabCommands } from "./commands";
import { openClaudeCodeTerminalView } from "./data/claudeTerminal";
import { rollOverOpenTasksIntoCurrentDailyNote } from "./data/rollover";
import {
  DEFAULT_PLUGIN_SETTINGS,
  findTabByName,
  migrateLoadedSettings,
  type PluginSettings,
} from "./settings";

export default class VaultDashboardPlugin extends Plugin {
  public currentSettings: PluginSettings = DEFAULT_PLUGIN_SETTINGS;
  public readonly settingsStore: Writable<PluginSettings> = writable(DEFAULT_PLUGIN_SETTINGS);
  public readonly refreshSignalStore: Writable<number> = writable(0);
  public readonly registeredTabCommandIds: Set<string> = new Set();

  private dailyTaskReminderTimeoutId: number | null = null;

  async onload(): Promise<void> {
    const rawLoadedSettings = await this.loadData();
    this.currentSettings = migrateLoadedSettings(rawLoadedSettings);
    this.settingsStore.set(this.currentSettings);

    this.registerView(
      VAULT_DASHBOARD_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new DashboardView(leaf, this),
    );

    this.addRibbonIcon("layout-dashboard", "Open Vault Dashboard", () =>
      this.activateDashboardView(),
    );

    registerDashboardCommands(this);

    this.addSettingTab(new VaultDashboardSettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.rollOverOpenTasksForAllTabs();
      if (this.currentSettings.workspaceStartup.runDashboardWorkspaceLayoutOnStartup) {
        void this.setUpDashboardWorkspaceLayout();
      }
    });

    this.scheduleDailyTaskReminder();
  }

  async rollOverOpenTasksForAllTabs(): Promise<void> {
    for (const dashboardTab of this.currentSettings.tabs) {
      try {
        await rollOverOpenTasksIntoCurrentDailyNote(
          this.app,
          dashboardTab.dailyNoteFolderPath,
          dashboardTab.workingDayIndices,
        );
      } catch {
        // One tab's daily-note folder being unwritable must not block the others.
      }
    }
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VAULT_DASHBOARD_VIEW_TYPE);
    this.clearDailyTaskReminder();
  }

  async replaceSettings(nextSettings: PluginSettings): Promise<void> {
    this.currentSettings = nextSettings;
    this.settingsStore.set(nextSettings);
    await this.saveData(nextSettings);
    refreshDynamicTabCommands(this);
    this.scheduleDailyTaskReminder();
  }

  private clearDailyTaskReminder(): void {
    if (this.dailyTaskReminderTimeoutId !== null) {
      window.clearTimeout(this.dailyTaskReminderTimeoutId);
      this.dailyTaskReminderTimeoutId = null;
    }
  }

  private scheduleDailyTaskReminder(): void {
    this.clearDailyTaskReminder();

    const reminder = this.currentSettings.dailyTaskReminder;
    if (!reminder.isEnabled) {
      return;
    }

    const millisecondsUntilReminder = computeMillisecondsUntilNextReminder(
      reminder.timeOfDay,
      new Date(),
    );
    if (millisecondsUntilReminder === null) {
      return;
    }

    this.dailyTaskReminderTimeoutId = window.setTimeout(() => {
      this.dailyTaskReminderTimeoutId = null;
      this.fireDailyTaskReminderIfTodayIsAWorkingDay();
      this.scheduleDailyTaskReminder();
    }, millisecondsUntilReminder);
  }

  private fireDailyTaskReminderIfTodayIsAWorkingDay(): void {
    const todayDayOfWeekIndex = new Date().getDay();
    const todayIsAWorkingDayForAnyTab = this.currentSettings.tabs.some((tab) =>
      tab.workingDayIndices.includes(todayDayOfWeekIndex),
    );
    if (!todayIsAWorkingDayForAnyTab) {
      return;
    }
    new Notice("Fill in tomorrow's tasks");
  }

  requestDashboardDataRefresh(): void {
    this.refreshSignalStore.update((previousRefreshCount) => previousRefreshCount + 1);
  }

  switchToDashboardTab(tabName: string): void {
    if (findTabByName(this.currentSettings, tabName) === null) {
      return;
    }
    if (this.currentSettings.activeTabName === tabName) {
      return;
    }
    void this.replaceSettings({ ...this.currentSettings, activeTabName: tabName });
  }

  async activateDashboardView(): Promise<void> {
    const existingLeaves = this.app.workspace.getLeavesOfType(VAULT_DASHBOARD_VIEW_TYPE);

    if (existingLeaves.length > 0) {
      this.app.workspace.revealLeaf(existingLeaves[0]);
      return;
    }

    const newLeafInMainPane = this.app.workspace.getLeaf("tab");
    await newLeafInMainPane.setViewState({
      type: VAULT_DASHBOARD_VIEW_TYPE,
      active: true,
    });
    this.app.workspace.revealLeaf(newLeafInMainPane);
  }

  async setUpDashboardWorkspaceLayout(): Promise<void> {
    await this.activateDashboardView();

    const claudeTerminalOpened = openClaudeCodeTerminalView(this.app);
    if (!claudeTerminalOpened) {
      new Notice("Install obsidian-claude-code to dock the Claude terminal");
    }

    this.maybePromptToSaveWorkspaceLayoutForStartup();
  }

  private maybePromptToSaveWorkspaceLayoutForStartup(): void {
    const workspaceStartup = this.currentSettings.workspaceStartup;
    if (
      workspaceStartup.runDashboardWorkspaceLayoutOnStartup ||
      workspaceStartup.workspaceLayoutPromptSuppressed
    ) {
      return;
    }

    new WorkspaceStartupPromptModal(this.app, {
      onConfirmRunOnStartup: () => {
        void this.replaceSettings({
          ...this.currentSettings,
          workspaceStartup: {
            ...this.currentSettings.workspaceStartup,
            runDashboardWorkspaceLayoutOnStartup: true,
          },
        });
      },
      onSuppressFuturePrompts: () => {
        void this.replaceSettings({
          ...this.currentSettings,
          workspaceStartup: {
            ...this.currentSettings.workspaceStartup,
            workspaceLayoutPromptSuppressed: true,
          },
        });
      },
    }).open();
  }
}

function computeMillisecondsUntilNextReminder(timeOfDay: string, now: Date): number | null {
  const timeMatch = timeOfDay.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (timeMatch === null) {
    return null;
  }
  const reminderHour = Number(timeMatch[1]);
  const reminderMinute = Number(timeMatch[2]);

  const nextReminderMoment = new Date(now);
  nextReminderMoment.setHours(reminderHour, reminderMinute, 0, 0);
  if (nextReminderMoment.getTime() <= now.getTime()) {
    nextReminderMoment.setDate(nextReminderMoment.getDate() + 1);
  }
  return nextReminderMoment.getTime() - now.getTime();
}
