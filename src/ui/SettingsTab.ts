import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type VaultDashboardPlugin from "../main";
import {
  ALL_WIDGET_IDENTIFIERS,
  DEFAULT_ENABLED_WIDGET_IDENTIFIERS,
  DEFAULT_WIDGET_SUB_TAB_NAME,
  DEFAULT_WORKING_DAY_INDICES,
  WIDGET_DISPLAY_LABEL_BY_IDENTIFIER,
  buildDefaultWidgetSubTabs,
  computeWidgetSubTabsWithWidgetAssignedTo,
  normaliseFolderScope,
  resolveEffectiveWidgetSubTabName,
  type DashboardTab,
  type DayOfWeekIndex,
  type PluginSettings,
  type WidgetIdentifier,
} from "../settings";
import { testJiraConnection, type JiraConnectionTestResult } from "../data/jira";

export class VaultDashboardSettingsTab extends PluginSettingTab {
  private readonly plugin: VaultDashboardPlugin;

  // Which tab accordions are open. Persisted across the re-renders that editing
  // triggers (rename, add/remove project) so the tab you are working in stays open.
  private readonly expandedTabNames: Set<string>;

  constructor(obsidianApplication: App, plugin: VaultDashboardPlugin) {
    super(obsidianApplication, plugin);
    this.plugin = plugin;
    this.expandedTabNames = new Set([plugin.currentSettings.activeTabName]);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Vault Dashboard" });
    containerEl.createEl("p", {
      text:
        "Each tab is a separate workspace context with its own folder scope, " +
        "widgets, and pinned projects.",
      cls: "setting-item-description",
    });

    this.renderTabListSection(containerEl);

    for (const dashboardTab of this.plugin.currentSettings.tabs) {
      this.renderTabConfigurationSection(containerEl, dashboardTab);
    }

    this.renderAddTabButton(containerEl);
    this.renderDailyTaskReminderSection(containerEl);
    this.renderJiraConnectionSection(containerEl);
  }

  private renderJiraConnectionSection(parentElement: HTMLElement): void {
    const jiraSectionContainer = parentElement.createDiv({
      cls: "vault-dashboard-settings-tab-section",
    });

    jiraSectionContainer.createEl("h3", { text: "Jira connection" });
    jiraSectionContainer.createEl("p", {
      text:
        "Connect a Jira Cloud site to surface open issues for pinned projects. " +
        "Map a Jira project key onto each pinned project to scope the issues shown.",
      cls: "setting-item-description",
    });

    new Setting(jiraSectionContainer)
      .setName("Site domain")
      .setDesc("Your Jira Cloud domain without a protocol, e.g. fivespark.atlassian.net.")
      .addText((textInput) => {
        textInput.setPlaceholder("fivespark.atlassian.net");
        textInput.setValue(this.plugin.currentSettings.jiraConnection.siteDomain);
        textInput.inputEl.addEventListener("blur", async () => {
          await this.updateJiraConnection((jiraConnection) => {
            jiraConnection.siteDomain = textInput.getValue().trim();
          });
        });
      });

    new Setting(jiraSectionContainer)
      .setName("Account email")
      .setDesc("The Atlassian account email that owns the API token.")
      .addText((textInput) => {
        textInput.setPlaceholder("you@fivespark.com");
        textInput.setValue(this.plugin.currentSettings.jiraConnection.accountEmail);
        textInput.inputEl.addEventListener("blur", async () => {
          await this.updateJiraConnection((jiraConnection) => {
            jiraConnection.accountEmail = textInput.getValue().trim();
          });
        });
      });

    new Setting(jiraSectionContainer)
      .setName("API token")
      .setDesc(
        "Create one at id.atlassian.com/manage-profile/security/api-tokens. " +
          "Stored unencrypted in this vault's plugin data — rotate it if the vault is shared.",
      )
      .addText((textInput) => {
        textInput.inputEl.type = "password";
        textInput.setPlaceholder("paste API token");
        textInput.setValue(this.plugin.currentSettings.jiraConnection.apiToken);
        textInput.inputEl.addEventListener("blur", async () => {
          await this.updateJiraConnection((jiraConnection) => {
            jiraConnection.apiToken = textInput.getValue();
          });
        });
      });

    new Setting(jiraSectionContainer)
      .setName("Show only issues assigned to me")
      .setDesc("When off, the widget shows all open issues in the mapped projects.")
      .addToggle((toggleControl) => {
        toggleControl.setValue(
          this.plugin.currentSettings.jiraConnection.showOnlyIssuesAssignedToCurrentUser,
        );
        toggleControl.onChange(async (isOnlyMine) => {
          await this.updateJiraConnection((jiraConnection) => {
            jiraConnection.showOnlyIssuesAssignedToCurrentUser = isOnlyMine;
          });
        });
      });

    new Setting(jiraSectionContainer)
      .setName("Test connection")
      .setDesc("Verifies the domain, email, and token against Jira.")
      .addButton((buttonControl) => {
        buttonControl.setButtonText("Test connection");
        buttonControl.onClick(async () => {
          buttonControl.setDisabled(true);
          buttonControl.setButtonText("Testing…");
          const testResult = await testJiraConnection(this.plugin.currentSettings.jiraConnection);
          announceJiraConnectionTestResult(testResult);
          buttonControl.setDisabled(false);
          buttonControl.setButtonText("Test connection");
        });
      });
  }

  private async updateJiraConnection(
    applyChange: (jiraConnection: PluginSettings["jiraConnection"]) => void,
  ): Promise<void> {
    const updatedSettings = cloneSettings(this.plugin.currentSettings);
    applyChange(updatedSettings.jiraConnection);
    await this.plugin.replaceSettings(updatedSettings);
  }

  private renderTabListSection(parentElement: HTMLElement): void {
    new Setting(parentElement)
      .setName("Active tab")
      .setDesc("Which tab opens when the dashboard view is first revealed.")
      .addDropdown((dropdownControl) => {
        for (const dashboardTab of this.plugin.currentSettings.tabs) {
          dropdownControl.addOption(dashboardTab.name, dashboardTab.name);
        }
        dropdownControl.setValue(this.plugin.currentSettings.activeTabName);
        dropdownControl.onChange(async (selectedTabName) => {
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          updatedSettings.activeTabName = selectedTabName;
          await this.plugin.replaceSettings(updatedSettings);
        });
      });
  }

  private renderTabConfigurationSection(
    parentElement: HTMLElement,
    dashboardTab: DashboardTab,
  ): void {
    const tabSectionContainer = parentElement.createEl("details", {
      cls: "vault-dashboard-settings-tab-section",
    });
    tabSectionContainer.open = this.expandedTabNames.has(dashboardTab.name);

    const tabSummary = tabSectionContainer.createEl("summary", {
      cls: "vault-dashboard-settings-tab-summary",
    });
    tabSummary.createEl("span", {
      text: `Tab: ${dashboardTab.name}`,
      cls: "vault-dashboard-settings-tab-summary-title",
    });
    tabSummary.createEl("span", {
      text: `${dashboardTab.enabledWidgets.length} widgets · ${dashboardTab.pinnedProjects.length} pinned`,
      cls: "vault-dashboard-settings-tab-summary-meta",
    });

    tabSectionContainer.addEventListener("toggle", () => {
      if (tabSectionContainer.open) {
        this.expandedTabNames.add(dashboardTab.name);
      } else {
        this.expandedTabNames.delete(dashboardTab.name);
      }
    });

    new Setting(tabSectionContainer)
      .setName("Tab name")
      .setDesc("Rename the tab. Must remain unique.")
      .addText((textInput) => {
        textInput.setValue(dashboardTab.name);
        textInput.inputEl.addEventListener("blur", async () => {
          const renamedTabName = textInput.getValue().trim();
          if (renamedTabName.length === 0 || renamedTabName === dashboardTab.name) {
            textInput.setValue(dashboardTab.name);
            return;
          }
          const nameAlreadyTaken = this.plugin.currentSettings.tabs.some(
            (existingTab) =>
              existingTab !== dashboardTab && existingTab.name === renamedTabName,
          );
          if (nameAlreadyTaken) {
            textInput.setValue(dashboardTab.name);
            return;
          }
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          const editedTab = updatedSettings.tabs.find(
            (candidateTab) => candidateTab.name === dashboardTab.name,
          );
          if (!editedTab) {
            return;
          }
          if (updatedSettings.activeTabName === dashboardTab.name) {
            updatedSettings.activeTabName = renamedTabName;
          }
          editedTab.name = renamedTabName;
          if (this.expandedTabNames.delete(dashboardTab.name)) {
            this.expandedTabNames.add(renamedTabName);
          }
          await this.plugin.replaceSettings(updatedSettings);
          this.display();
        });
      });

    new Setting(tabSectionContainer)
      .setName("Folder scopes")
      .setDesc(
        "Comma-separated folder paths. Leave empty to scope the tab to the whole vault.",
      )
      .addTextArea((textAreaInput) => {
        textAreaInput.setValue(dashboardTab.folderScopes.join(", "));
        textAreaInput.inputEl.rows = 2;
        textAreaInput.inputEl.addEventListener("blur", async () => {
          const parsedFolderScopes = textAreaInput
            .getValue()
            .split(",")
            .map((rawEntry) => rawEntry.trim())
            .filter((trimmedEntry) => trimmedEntry.length > 0);
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          const editedTab = updatedSettings.tabs.find(
            (candidateTab) => candidateTab.name === dashboardTab.name,
          );
          if (!editedTab) {
            return;
          }
          editedTab.folderScopes = parsedFolderScopes;
          await this.plugin.replaceSettings(updatedSettings);
        });
      });

    tabSectionContainer.createEl("h4", { text: "Daily notes" });
    tabSectionContainer.createEl("p", {
      text: "Keep this tab's daily note and 'next workday' planning separate from the other tabs.",
      cls: "setting-item-description",
    });

    new Setting(tabSectionContainer)
      .setName("Daily note folder")
      .setDesc(
        "Folder this tab's daily notes live in, so each tab keeps its own daily note. " +
          "Leave empty to use the vault root.",
      )
      .addText((textInput) => {
        textInput.setPlaceholder("Work/Daily");
        textInput.setValue(dashboardTab.dailyNoteFolderPath);
        textInput.inputEl.addEventListener("blur", async () => {
          const normalisedFolderPath = normaliseFolderScope(textInput.getValue().trim());
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          const editedTab = updatedSettings.tabs.find(
            (candidateTab) => candidateTab.name === dashboardTab.name,
          );
          if (!editedTab) {
            return;
          }
          editedTab.dailyNoteFolderPath = normalisedFolderPath;
          textInput.setValue(normalisedFolderPath);
          await this.plugin.replaceSettings(updatedSettings);
        });
      });

    this.renderWorkingDaysForTab(tabSectionContainer, dashboardTab);

    tabSectionContainer.createEl("h4", { text: "Sub-tabs" });
    tabSectionContainer.createEl("p", {
      text: "Group this tab's widgets into sub-tabs. Each enabled widget shows on exactly one sub-tab. A sub-tab row only appears on the dashboard once a tab has more than one.",
      cls: "setting-item-description",
    });
    this.renderWidgetSubTabsForTab(tabSectionContainer, dashboardTab);

    const tabHasMultipleWidgetSubTabs = dashboardTab.widgetSubTabs.length > 1;

    tabSectionContainer.createEl("h4", { text: "Widgets" });
    tabSectionContainer.createEl("p", {
      text: tabHasMultipleWidgetSubTabs
        ? "Toggle which widgets appear on this tab, and choose each widget's sub-tab."
        : "Click to toggle which widgets appear on this tab.",
      cls: "setting-item-description",
    });

    if (tabHasMultipleWidgetSubTabs) {
      const widgetAssignmentList = tabSectionContainer.createDiv({
        cls: "vault-dashboard-settings-widget-list",
      });
      for (const widgetIdentifier of ALL_WIDGET_IDENTIFIERS) {
        this.renderWidgetAssignmentRow(widgetAssignmentList, dashboardTab, widgetIdentifier);
      }
    } else {
      const widgetToggleGrid = tabSectionContainer.createDiv({
        cls: "vault-dashboard-settings-widget-grid",
      });
      for (const widgetIdentifier of ALL_WIDGET_IDENTIFIERS) {
        this.renderWidgetToggleChip(widgetToggleGrid, dashboardTab, widgetIdentifier);
      }
    }

    tabSectionContainer.createEl("h4", { text: "Pinned projects" });
    this.renderPinnedProjectsForTab(tabSectionContainer, dashboardTab);

    if (this.plugin.currentSettings.tabs.length > 1) {
      new Setting(tabSectionContainer)
        .setName("Delete tab")
        .setDesc("Remove this tab and its configuration.")
        .addButton((buttonControl) => {
          buttonControl.setButtonText("Delete");
          buttonControl.setWarning();
          buttonControl.onClick(async () => {
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            updatedSettings.tabs = updatedSettings.tabs.filter(
              (candidateTab) => candidateTab.name !== dashboardTab.name,
            );
            if (updatedSettings.activeTabName === dashboardTab.name) {
              updatedSettings.activeTabName = updatedSettings.tabs[0].name;
            }
            await this.plugin.replaceSettings(updatedSettings);
            this.display();
          });
        });
    }
  }

  private renderWidgetToggleChip(
    parentElement: HTMLElement,
    dashboardTab: DashboardTab,
    widgetIdentifier: WidgetIdentifier,
  ): void {
    const isEnabled = dashboardTab.enabledWidgets.includes(widgetIdentifier);
    const chipButton = parentElement.createEl("button", {
      cls: "vault-dashboard-settings-widget-chip",
    });
    chipButton.type = "button";
    chipButton.toggleClass("is-enabled", isEnabled);
    const markElement = chipButton.createEl("span", {
      cls: "vault-dashboard-settings-widget-chip-mark",
      text: isEnabled ? "✓" : "",
    });
    chipButton.createEl("span", {
      cls: "vault-dashboard-settings-widget-chip-label",
      text: WIDGET_DISPLAY_LABEL_BY_IDENTIFIER[widgetIdentifier],
    });
    chipButton.addEventListener("click", async () => {
      const updatedSettings = cloneSettings(this.plugin.currentSettings);
      const editedTab = updatedSettings.tabs.find(
        (candidateTab) => candidateTab.name === dashboardTab.name,
      );
      if (!editedTab) {
        return;
      }
      const shouldEnable = !editedTab.enabledWidgets.includes(widgetIdentifier);
      editedTab.enabledWidgets = computeUpdatedEnabledWidgets(
        editedTab.enabledWidgets,
        widgetIdentifier,
        shouldEnable,
      );
      await this.plugin.replaceSettings(updatedSettings);
      chipButton.toggleClass("is-enabled", shouldEnable);
      markElement.setText(shouldEnable ? "✓" : "");
    });
  }

  private renderWidgetSubTabsForTab(
    parentElement: HTMLElement,
    dashboardTab: DashboardTab,
  ): void {
    dashboardTab.widgetSubTabs.forEach((widgetSubTab, widgetSubTabIndex) => {
      const widgetSubTabSetting = new Setting(parentElement)
        .setName(`Sub-tab ${widgetSubTabIndex + 1}`)
        .addText((textInput) => {
          textInput.setValue(widgetSubTab.name);
          textInput.inputEl.addEventListener("blur", async () => {
            const renamedWidgetSubTabName = textInput.getValue().trim();
            if (
              renamedWidgetSubTabName.length === 0 ||
              renamedWidgetSubTabName === widgetSubTab.name
            ) {
              textInput.setValue(widgetSubTab.name);
              return;
            }
            const nameAlreadyTaken = dashboardTab.widgetSubTabs.some(
              (candidate) =>
                candidate !== widgetSubTab && candidate.name === renamedWidgetSubTabName,
            );
            if (nameAlreadyTaken) {
              textInput.setValue(widgetSubTab.name);
              return;
            }
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            const editedTab = updatedSettings.tabs.find(
              (candidateTab) => candidateTab.name === dashboardTab.name,
            );
            if (!editedTab) {
              return;
            }
            const editedWidgetSubTab = editedTab.widgetSubTabs[widgetSubTabIndex];
            if (!editedWidgetSubTab) {
              return;
            }
            if (editedTab.activeWidgetSubTabName === editedWidgetSubTab.name) {
              editedTab.activeWidgetSubTabName = renamedWidgetSubTabName;
            }
            editedWidgetSubTab.name = renamedWidgetSubTabName;
            await this.plugin.replaceSettings(updatedSettings);
            this.display();
          });
        });

      if (dashboardTab.widgetSubTabs.length > 1) {
        widgetSubTabSetting.addButton((buttonControl) => {
          buttonControl.setButtonText("Remove");
          buttonControl.setWarning();
          buttonControl.onClick(async () => {
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            const editedTab = updatedSettings.tabs.find(
              (candidateTab) => candidateTab.name === dashboardTab.name,
            );
            if (!editedTab || editedTab.widgetSubTabs.length <= 1) {
              return;
            }
            const [removedWidgetSubTab] = editedTab.widgetSubTabs.splice(widgetSubTabIndex, 1);
            const fallbackWidgetSubTab = editedTab.widgetSubTabs[0];
            for (const widgetIdentifier of removedWidgetSubTab.widgetIdentifiers) {
              if (!fallbackWidgetSubTab.widgetIdentifiers.includes(widgetIdentifier)) {
                fallbackWidgetSubTab.widgetIdentifiers.push(widgetIdentifier);
              }
            }
            if (editedTab.activeWidgetSubTabName === removedWidgetSubTab.name) {
              editedTab.activeWidgetSubTabName = fallbackWidgetSubTab.name;
            }
            await this.plugin.replaceSettings(updatedSettings);
            this.display();
          });
        });
      }
    });

    new Setting(parentElement).addButton((buttonControl) => {
      buttonControl.setButtonText("Add sub-tab");
      buttonControl.onClick(async () => {
        const updatedSettings = cloneSettings(this.plugin.currentSettings);
        const editedTab = updatedSettings.tabs.find(
          (candidateTab) => candidateTab.name === dashboardTab.name,
        );
        if (!editedTab) {
          return;
        }
        editedTab.widgetSubTabs.push({
          name: pickNextUnusedWidgetSubTabName(editedTab),
          widgetIdentifiers: [],
        });
        await this.plugin.replaceSettings(updatedSettings);
        this.display();
      });
    });
  }

  private renderWidgetAssignmentRow(
    parentElement: HTMLElement,
    dashboardTab: DashboardTab,
    widgetIdentifier: WidgetIdentifier,
  ): void {
    const widgetRow = parentElement.createDiv({
      cls: "vault-dashboard-settings-widget-row",
    });
    this.renderWidgetToggleChip(widgetRow, dashboardTab, widgetIdentifier);

    const assignedWidgetSubTabName = resolveEffectiveWidgetSubTabName(
      dashboardTab,
      widgetIdentifier,
    );
    const widgetSubTabSelect = widgetRow.createEl("select", {
      cls: "vault-dashboard-settings-widget-row-select dropdown",
    });
    for (const widgetSubTab of dashboardTab.widgetSubTabs) {
      const optionElement = widgetSubTabSelect.createEl("option", {
        text: widgetSubTab.name,
      });
      optionElement.value = widgetSubTab.name;
      if (widgetSubTab.name === assignedWidgetSubTabName) {
        optionElement.selected = true;
      }
    }
    widgetSubTabSelect.addEventListener("change", async () => {
      const targetWidgetSubTabName = widgetSubTabSelect.value;
      const updatedSettings = cloneSettings(this.plugin.currentSettings);
      const editedTab = updatedSettings.tabs.find(
        (candidateTab) => candidateTab.name === dashboardTab.name,
      );
      if (!editedTab) {
        return;
      }
      editedTab.widgetSubTabs = computeWidgetSubTabsWithWidgetAssignedTo(
        editedTab.widgetSubTabs,
        widgetIdentifier,
        targetWidgetSubTabName,
      );
      await this.plugin.replaceSettings(updatedSettings);
    });
  }

  private renderPinnedProjectsForTab(
    parentElement: HTMLElement,
    dashboardTab: DashboardTab,
  ): void {
    if (dashboardTab.pinnedProjects.length === 0) {
      parentElement.createEl("p", {
        text: "No folders pinned yet for this tab.",
        cls: "setting-item-description",
      });
    }

    dashboardTab.pinnedProjects.forEach((pinnedProject, pinnedProjectIndex) => {
      const projectCard = parentElement.createDiv({
        cls: "vault-dashboard-settings-project-card",
      });
      const projectCardHead = projectCard.createDiv({
        cls: "vault-dashboard-settings-project-card-head",
      });
      projectCardHead.createEl("span", {
        cls: "vault-dashboard-settings-project-card-title",
        text:
          pinnedProject.displayName ||
          pinnedProject.folderPath ||
          `Pinned project #${pinnedProjectIndex + 1}`,
      });
      const removeProjectButton = projectCardHead.createEl("button", {
        cls: "vault-dashboard-settings-project-card-remove",
        text: "Remove",
      });
      removeProjectButton.type = "button";
      removeProjectButton.addEventListener("click", async () => {
        const updatedSettings = cloneSettings(this.plugin.currentSettings);
        const editedTab = updatedSettings.tabs.find(
          (candidateTab) => candidateTab.name === dashboardTab.name,
        );
        if (!editedTab) {
          return;
        }
        editedTab.pinnedProjects.splice(pinnedProjectIndex, 1);
        await this.plugin.replaceSettings(updatedSettings);
        this.display();
      });

      new Setting(projectCard)
        .setName("Display name")
        .setDesc(
          "Friendly name shown on the dashboard tile. Leave empty to fall back to the folder basename.",
        )
        .addText((textInput) => {
          textInput.setPlaceholder("e.g. Fivespark API");
          textInput.setValue(pinnedProject.displayName);
          textInput.inputEl.addEventListener("blur", async () => {
            const renamedDisplayName = textInput.getValue().trim();
            if (renamedDisplayName === pinnedProject.displayName) {
              return;
            }
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            const editedTab = updatedSettings.tabs.find(
              (candidateTab) => candidateTab.name === dashboardTab.name,
            );
            if (!editedTab) {
              return;
            }
            const editedPinnedProject = editedTab.pinnedProjects[pinnedProjectIndex];
            if (!editedPinnedProject) {
              return;
            }
            editedPinnedProject.displayName = renamedDisplayName;
            await this.plugin.replaceSettings(updatedSettings);
          });
        });

      new Setting(projectCard)
        .setName("Folder path")
        .setDesc(
          "Absolute filesystem path to a project folder " +
            "(e.g. /Users/you/code/fivespark). The folder lives on disk, not inside the vault.",
        )
        .addText((textInput) => {
          textInput.setValue(pinnedProject.folderPath);
          textInput.inputEl.addEventListener("blur", async () => {
            const renamedFolderPath = textInput.getValue().trim();
            if (renamedFolderPath === pinnedProject.folderPath) {
              return;
            }
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            const editedTab = updatedSettings.tabs.find(
              (candidateTab) => candidateTab.name === dashboardTab.name,
            );
            if (!editedTab) {
              return;
            }
            if (renamedFolderPath.length === 0) {
              editedTab.pinnedProjects.splice(pinnedProjectIndex, 1);
            } else {
              editedTab.pinnedProjects[pinnedProjectIndex].folderPath = renamedFolderPath;
            }
            await this.plugin.replaceSettings(updatedSettings);
            this.display();
          });
        });

      new Setting(projectCard)
        .setName("Container names")
        .setDesc(
          "Comma-separated Docker container names to pair manually. " +
            "Leave empty to rely on Compose label auto-detection.",
        )
        .addText((textInput) => {
          textInput.setValue(pinnedProject.manuallyAssignedContainerNames.join(", "));
          textInput.inputEl.addEventListener("blur", async () => {
            const parsedContainerNames = textInput
              .getValue()
              .split(",")
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0);
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            const editedTab = updatedSettings.tabs.find(
              (candidateTab) => candidateTab.name === dashboardTab.name,
            );
            if (!editedTab) {
              return;
            }
            const editedPinnedProject = editedTab.pinnedProjects[pinnedProjectIndex];
            if (!editedPinnedProject) {
              return;
            }
            editedPinnedProject.manuallyAssignedContainerNames = parsedContainerNames;
            await this.plugin.replaceSettings(updatedSettings);
          });
        });

      new Setting(projectCard)
        .setName("Jira project key")
        .setDesc(
          "The Jira project key (e.g. FS) whose open issues appear on this project. " +
            "Leave empty to show no Jira issues for this project.",
        )
        .addText((textInput) => {
          textInput.setPlaceholder("e.g. FS");
          textInput.setValue(pinnedProject.jiraProjectKey);
          textInput.inputEl.addEventListener("blur", async () => {
            const editedJiraProjectKey = textInput.getValue().trim();
            if (editedJiraProjectKey === pinnedProject.jiraProjectKey) {
              return;
            }
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            const editedTab = updatedSettings.tabs.find(
              (candidateTab) => candidateTab.name === dashboardTab.name,
            );
            if (!editedTab) {
              return;
            }
            const editedPinnedProject = editedTab.pinnedProjects[pinnedProjectIndex];
            if (!editedPinnedProject) {
              return;
            }
            editedPinnedProject.jiraProjectKey = editedJiraProjectKey;
            await this.plugin.replaceSettings(updatedSettings);
          });
        });

      this.renderStoredShellCommandsForPinnedProject(
        projectCard,
        dashboardTab.name,
        pinnedProject.folderPath,
        pinnedProjectIndex,
        pinnedProject.storedShellCommands,
      );
    });

    new Setting(parentElement)
      .setName("Pin a new folder")
      .setDesc("Adds a blank pinned project row. Fill in the folder path to activate it.")
      .addButton((buttonControl) => {
        buttonControl.setButtonText("+ Pin folder");
        buttonControl.onClick(async () => {
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          const editedTab = updatedSettings.tabs.find(
            (candidateTab) => candidateTab.name === dashboardTab.name,
          );
          if (!editedTab) {
            return;
          }
          editedTab.pinnedProjects.push({
            folderPath: "",
            displayName: "",
            manuallyAssignedContainerNames: [],
            storedShellCommands: [],
            jiraProjectKey: "",
          });
          await this.plugin.replaceSettings(updatedSettings);
          this.display();
        });
      });
  }

  private renderStoredShellCommandsForPinnedProject(
    parentElement: HTMLElement,
    dashboardTabName: string,
    pinnedProjectFolderPathLabel: string,
    pinnedProjectIndex: number,
    storedShellCommands: { label: string; command: string }[],
  ): void {
    const sectionContainer = parentElement.createDiv({
      cls: "vault-dashboard-settings-stored-shell-commands",
    });

    sectionContainer.createEl("h5", {
      text: `Stored shell commands for "${pinnedProjectFolderPathLabel || "(unnamed)"}"`,
    });
    sectionContainer.createEl("p", {
      text:
        'Each command runs inside the pinned folder via "sh -c <command>". ' +
        'Click "+ Add command" below to create a new row, then fill in the label and command text fields. ' +
        "The label becomes the button on the dashboard.",
      cls: "setting-item-description",
    });

    if (storedShellCommands.length === 0) {
      sectionContainer.createEl("p", {
        text: 'No commands yet. Click "+ Add command" below to create the first one.',
        cls: "setting-item-description",
      });
    }

    storedShellCommands.forEach((storedShellCommand, shellCommandIndex) => {
      new Setting(sectionContainer)
        .setName(`Command #${shellCommandIndex + 1}`)
        .setDesc("Label shown on the dashboard button, and the shell command to run.")
        .addText((labelTextInput) => {
          labelTextInput.setPlaceholder("label (e.g. compose up)");
          labelTextInput.setValue(storedShellCommand.label);
          labelTextInput.inputEl.addEventListener("blur", async () => {
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            const editedTab = updatedSettings.tabs.find(
              (candidateTab) => candidateTab.name === dashboardTabName,
            );
            if (!editedTab) {
              return;
            }
            const editedPinnedProject = editedTab.pinnedProjects[pinnedProjectIndex];
            if (!editedPinnedProject) {
              return;
            }
            const editedShellCommand = editedPinnedProject.storedShellCommands[shellCommandIndex];
            if (!editedShellCommand) {
              return;
            }
            editedShellCommand.label = labelTextInput.getValue().trim();
            await this.plugin.replaceSettings(updatedSettings);
          });
        })
        .addText((commandTextInput) => {
          commandTextInput.setPlaceholder("command (e.g. docker compose up -d)");
          commandTextInput.setValue(storedShellCommand.command);
          commandTextInput.inputEl.addEventListener("blur", async () => {
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            const editedTab = updatedSettings.tabs.find(
              (candidateTab) => candidateTab.name === dashboardTabName,
            );
            if (!editedTab) {
              return;
            }
            const editedPinnedProject = editedTab.pinnedProjects[pinnedProjectIndex];
            if (!editedPinnedProject) {
              return;
            }
            const editedShellCommand = editedPinnedProject.storedShellCommands[shellCommandIndex];
            if (!editedShellCommand) {
              return;
            }
            editedShellCommand.command = commandTextInput.getValue();
            await this.plugin.replaceSettings(updatedSettings);
          });
        })
        .addButton((buttonControl) => {
          buttonControl.setButtonText("Remove");
          buttonControl.setWarning();
          buttonControl.onClick(async () => {
            const updatedSettings = cloneSettings(this.plugin.currentSettings);
            const editedTab = updatedSettings.tabs.find(
              (candidateTab) => candidateTab.name === dashboardTabName,
            );
            if (!editedTab) {
              return;
            }
            const editedPinnedProject = editedTab.pinnedProjects[pinnedProjectIndex];
            if (!editedPinnedProject) {
              return;
            }
            editedPinnedProject.storedShellCommands.splice(shellCommandIndex, 1);
            await this.plugin.replaceSettings(updatedSettings);
            this.display();
          });
        });
    });

    new Setting(sectionContainer)
      .addButton((buttonControl) => {
        buttonControl.setButtonText("+ Add command");
        buttonControl.onClick(async () => {
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          const editedTab = updatedSettings.tabs.find(
            (candidateTab) => candidateTab.name === dashboardTabName,
          );
          if (!editedTab) {
            return;
          }
          const editedPinnedProject = editedTab.pinnedProjects[pinnedProjectIndex];
          if (!editedPinnedProject) {
            return;
          }
          editedPinnedProject.storedShellCommands.push({ label: "", command: "" });
          await this.plugin.replaceSettings(updatedSettings);
          this.display();
        });
      });
  }

  private renderWorkingDaysForTab(
    parentElement: HTMLElement,
    dashboardTab: DashboardTab,
  ): void {
    const workingDaysSetting = new Setting(parentElement)
      .setName("Working days")
      .setDesc(
        "Days you work in this tab. 'Next workday' skips the unchecked days so tasks " +
          "queued before a day off land on the day you are actually back.",
      );

    for (const dayOption of ORDERED_DAY_OF_WEEK_OPTIONS) {
      workingDaysSetting.addButton((buttonControl) => {
        buttonControl.setButtonText(dayOption.shortLabel);
        const isWorkingDay = dashboardTab.workingDayIndices.includes(dayOption.dayIndex);
        if (isWorkingDay) {
          buttonControl.setCta();
        }
        buttonControl.onClick(async () => {
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          const editedTab = updatedSettings.tabs.find(
            (candidateTab) => candidateTab.name === dashboardTab.name,
          );
          if (!editedTab) {
            return;
          }
          editedTab.workingDayIndices = toggleDayOfWeekMembership(
            editedTab.workingDayIndices,
            dayOption.dayIndex,
          );
          await this.plugin.replaceSettings(updatedSettings);
          this.display();
        });
      });
    }
  }

  private renderDailyTaskReminderSection(parentElement: HTMLElement): void {
    const reminderSectionContainer = parentElement.createDiv({
      cls: "vault-dashboard-settings-tab-section",
    });

    reminderSectionContainer.createEl("h3", { text: "Daily task reminder" });
    reminderSectionContainer.createEl("p", {
      text:
        "Pops a reminder to fill in tomorrow's tasks at the set time. " +
        "Only fires on a day that is a working day for at least one tab.",
      cls: "setting-item-description",
    });

    new Setting(reminderSectionContainer)
      .setName("Enable reminder")
      .addToggle((toggleControl) => {
        toggleControl.setValue(this.plugin.currentSettings.dailyTaskReminder.isEnabled);
        toggleControl.onChange(async (isEnabled) => {
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          updatedSettings.dailyTaskReminder.isEnabled = isEnabled;
          await this.plugin.replaceSettings(updatedSettings);
        });
      });

    new Setting(reminderSectionContainer)
      .setName("Reminder time")
      .setDesc("24-hour time, e.g. 15:45.")
      .addText((textInput) => {
        textInput.setPlaceholder("15:45");
        textInput.setValue(this.plugin.currentSettings.dailyTaskReminder.timeOfDay);
        textInput.inputEl.addEventListener("blur", async () => {
          const enteredTime = textInput.getValue().trim();
          if (!TIME_OF_DAY_PATTERN.test(enteredTime)) {
            new Notice("Enter the reminder time as HH:MM, e.g. 15:45");
            textInput.setValue(this.plugin.currentSettings.dailyTaskReminder.timeOfDay);
            return;
          }
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          updatedSettings.dailyTaskReminder.timeOfDay = enteredTime;
          await this.plugin.replaceSettings(updatedSettings);
        });
      });
  }

  private renderAddTabButton(parentElement: HTMLElement): void {
    new Setting(parentElement)
      .setName("Add tab")
      .setDesc("Create a new dashboard tab with default widgets enabled.")
      .addButton((buttonControl) => {
        buttonControl.setButtonText("+ Add tab");
        buttonControl.onClick(async () => {
          const updatedSettings = cloneSettings(this.plugin.currentSettings);
          const newTabName = pickNextUnusedTabName(updatedSettings);
          updatedSettings.tabs.push({
            name: newTabName,
            folderScopes: [],
            dailyNoteFolderPath: "",
            workingDayIndices: [...DEFAULT_WORKING_DAY_INDICES],
            enabledWidgets: [...DEFAULT_ENABLED_WIDGET_IDENTIFIERS],
            collapsedWidgetIdentifiers: [],
            pinnedProjects: [],
            widgetSubTabs: buildDefaultWidgetSubTabs(),
            activeWidgetSubTabName: DEFAULT_WIDGET_SUB_TAB_NAME,
          });
          await this.plugin.replaceSettings(updatedSettings);
          this.display();
        });
      });
  }
}

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type DayOfWeekOption = {
  dayIndex: DayOfWeekIndex;
  shortLabel: string;
};

// Monday-first display order; dayIndex is the JavaScript Date.getDay() value stored in settings.
const ORDERED_DAY_OF_WEEK_OPTIONS: readonly DayOfWeekOption[] = [
  { dayIndex: 1, shortLabel: "Mon" },
  { dayIndex: 2, shortLabel: "Tue" },
  { dayIndex: 3, shortLabel: "Wed" },
  { dayIndex: 4, shortLabel: "Thu" },
  { dayIndex: 5, shortLabel: "Fri" },
  { dayIndex: 6, shortLabel: "Sat" },
  { dayIndex: 0, shortLabel: "Sun" },
] as const;

function toggleDayOfWeekMembership(
  workingDayIndices: DayOfWeekIndex[],
  dayIndexToToggle: DayOfWeekIndex,
): DayOfWeekIndex[] {
  if (workingDayIndices.includes(dayIndexToToggle)) {
    return workingDayIndices.filter((dayIndex) => dayIndex !== dayIndexToToggle);
  }
  return [...workingDayIndices, dayIndexToToggle];
}

function announceJiraConnectionTestResult(testResult: JiraConnectionTestResult): void {
  if (testResult.outcome === "succeeded") {
    new Notice(`Connected to Jira as ${testResult.accountDisplayName}`);
    return;
  }
  if (testResult.outcome === "not-configured") {
    new Notice("Fill in the site domain, account email, and API token first");
    return;
  }
  if (testResult.outcome === "authentication-failed") {
    new Notice("Jira rejected the credentials — check the email and API token");
    return;
  }
  new Notice(`Could not reach Jira: ${testResult.message}`);
}

function computeUpdatedEnabledWidgets(
  currentlyEnabledWidgets: WidgetIdentifier[],
  toggledWidget: WidgetIdentifier,
  isWidgetEnabled: boolean,
): WidgetIdentifier[] {
  if (isWidgetEnabled) {
    if (currentlyEnabledWidgets.includes(toggledWidget)) {
      return currentlyEnabledWidgets;
    }
    return [...currentlyEnabledWidgets, toggledWidget];
  }
  return currentlyEnabledWidgets.filter((entry) => entry !== toggledWidget);
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

function pickNextUnusedWidgetSubTabName(tab: DashboardTab): string {
  let attemptIndex = tab.widgetSubTabs.length + 1;
  while (true) {
    const candidate = `Sub-tab ${attemptIndex}`;
    if (!tab.widgetSubTabs.some((widgetSubTab) => widgetSubTab.name === candidate)) {
      return candidate;
    }
    attemptIndex++;
  }
}

function cloneSettings(settings: PluginSettings): PluginSettings {
  return {
    activeTabName: settings.activeTabName,
    tabs: settings.tabs.map((dashboardTab) => ({
      name: dashboardTab.name,
      folderScopes: [...dashboardTab.folderScopes],
      dailyNoteFolderPath: dashboardTab.dailyNoteFolderPath,
      workingDayIndices: [...dashboardTab.workingDayIndices],
      enabledWidgets: [...dashboardTab.enabledWidgets],
      collapsedWidgetIdentifiers: [...dashboardTab.collapsedWidgetIdentifiers],
      pinnedProjects: dashboardTab.pinnedProjects.map((pinnedProject) => ({
        folderPath: pinnedProject.folderPath,
        displayName: pinnedProject.displayName,
        manuallyAssignedContainerNames: [...pinnedProject.manuallyAssignedContainerNames],
        storedShellCommands: pinnedProject.storedShellCommands.map((shellCommand) => ({
          label: shellCommand.label,
          command: shellCommand.command,
        })),
        jiraProjectKey: pinnedProject.jiraProjectKey,
      })),
      widgetSubTabs: dashboardTab.widgetSubTabs.map((widgetSubTab) => ({
        name: widgetSubTab.name,
        widgetIdentifiers: [...widgetSubTab.widgetIdentifiers],
      })),
      activeWidgetSubTabName: dashboardTab.activeWidgetSubTabName,
    })),
    workspaceStartup: { ...settings.workspaceStartup },
    dailyTaskReminder: { ...settings.dailyTaskReminder },
    procrastIdeaFolderMappings: settings.procrastIdeaFolderMappings.map((mapping) => ({
      ideaUuid: mapping.ideaUuid,
      targetFolderPath: mapping.targetFolderPath,
      tabName: mapping.tabName,
      createdAt: mapping.createdAt,
      ideaTitle: mapping.ideaTitle,
    })),
    jiraConnection: { ...settings.jiraConnection },
  };
}
