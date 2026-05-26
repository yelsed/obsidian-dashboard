import { Notice } from "obsidian";
import type VaultDashboardPlugin from "./main";
import { openPlanProcrastIdeaFlow } from "./ui/PlanProcrastIdeaModal";

const SWITCH_TAB_COMMAND_ID_PREFIX = "switch-tab-";
const OPEN_TAB_COMMAND_ID_PREFIX = "open-tab-";

export function registerDashboardCommands(plugin: VaultDashboardPlugin): void {
  plugin.addCommand({
    id: "open",
    name: "Open dashboard",
    callback: () => {
      void plugin.activateDashboardView();
    },
  });

  plugin.addCommand({
    id: "refresh",
    name: "Refresh dashboard data",
    callback: () => {
      plugin.requestDashboardDataRefresh();
    },
  });

  plugin.addCommand({
    id: "start-day",
    name: "Start day on the active tab",
    callback: () => {
      void plugin.activateDashboardView();
    },
  });

  plugin.addCommand({
    id: "setup-workspace",
    name: "Set up workspace with the Claude Code terminal",
    callback: () => {
      void plugin.setUpDashboardWorkspaceLayout();
    },
  });

  registerArgumentDrivenCommandStub(plugin, "pin-project", "Pin a project folder");
  registerArgumentDrivenCommandStub(plugin, "unpin-project", "Unpin a project folder");
  registerArgumentDrivenCommandStub(plugin, "capture", "Quick capture into the active tab");
  registerArgumentDrivenCommandStub(plugin, "run-project-command", "Run a stored project command");
  registerPlanProcrastIdeaCommand(plugin);

  refreshDynamicTabCommands(plugin);
}

export function refreshDynamicTabCommands(plugin: VaultDashboardPlugin): void {
  for (const dashboardTab of plugin.currentSettings.tabs) {
    registerSwitchToTabCommandOnce(plugin, dashboardTab.name);
    registerOpenTabCommandOnce(plugin, dashboardTab.name);
  }
}

function registerSwitchToTabCommandOnce(
  plugin: VaultDashboardPlugin,
  tabName: string,
): void {
  const commandId = `${SWITCH_TAB_COMMAND_ID_PREFIX}${slugifyTabNameForCommandId(tabName)}`;
  if (plugin.registeredTabCommandIds.has(commandId)) {
    return;
  }
  plugin.registeredTabCommandIds.add(commandId);
  plugin.addCommand({
    id: commandId,
    name: `Switch to ${tabName} tab`,
    callback: () => {
      plugin.switchToDashboardTab(tabName);
    },
  });
}

function registerOpenTabCommandOnce(
  plugin: VaultDashboardPlugin,
  tabName: string,
): void {
  const commandId = `${OPEN_TAB_COMMAND_ID_PREFIX}${slugifyTabNameForCommandId(tabName)}`;
  if (plugin.registeredTabCommandIds.has(commandId)) {
    return;
  }
  plugin.registeredTabCommandIds.add(commandId);
  plugin.addCommand({
    id: commandId,
    name: `Open dashboard on ${tabName} tab`,
    callback: () => {
      void plugin.activateDashboardView().then(() => {
        plugin.switchToDashboardTab(tabName);
      });
    },
  });
}

function registerArgumentDrivenCommandStub(
  plugin: VaultDashboardPlugin,
  commandId: string,
  humanReadableName: string,
): void {
  plugin.addCommand({
    id: commandId,
    name: humanReadableName,
    callback: () => {
      new Notice(`"${humanReadableName}" is not available yet from the command palette.`);
    },
  });
}

function registerPlanProcrastIdeaCommand(plugin: VaultDashboardPlugin): void {
  plugin.addCommand({
    id: "plan-procrast-idea",
    name: "Plan a Procrast idea into a folder",
    callback: () => {
      void openPlanProcrastIdeaFlow({
        obsidianApp: plugin.app,
        getSettings: () => plugin.currentSettings,
        replaceSettings: (nextSettings) => plugin.replaceSettings(nextSettings),
      });
    },
  });
}

function slugifyTabNameForCommandId(tabName: string): string {
  return tabName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}
