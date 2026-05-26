import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { writable, type Writable } from "svelte/store";

import { DashboardView, VAULT_DASHBOARD_VIEW_TYPE } from "./view";
import { VaultDashboardSettingsTab } from "./ui/SettingsTab";
import { WorkspaceStartupPromptModal } from "./ui/WorkspaceStartupPromptModal";
import { registerDashboardCommands, refreshDynamicTabCommands } from "./commands";
import { openClaudeCodeTerminalView } from "./data/claudeTerminal";
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
      if (this.currentSettings.workspaceStartup.runDashboardWorkspaceLayoutOnStartup) {
        void this.setUpDashboardWorkspaceLayout();
      }
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VAULT_DASHBOARD_VIEW_TYPE);
  }

  async replaceSettings(nextSettings: PluginSettings): Promise<void> {
    this.currentSettings = nextSettings;
    this.settingsStore.set(nextSettings);
    await this.saveData(nextSettings);
    refreshDynamicTabCommands(this);
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
