import { App, Modal, Notice, Setting } from "obsidian";
import { promises as filesystemPromises } from "fs";
import nodePath from "path";
import os from "os";
import { launchInObsidianClaudeTerminal } from "../data/claudeTerminal";
import {
  readOpenProcrastIdeas,
  resolveProcrastIdeaTitle,
  type ProcrastIdea,
} from "../data/procrast";
import {
  resolveActiveTab,
  type DashboardTab,
  type PluginSettings,
  type ProcrastIdeaFolderMapping,
} from "../settings";

export type PlanProcrastIdeaFlowRequest = {
  obsidianApp: App;
  getSettings: () => PluginSettings;
  replaceSettings: (nextSettings: PluginSettings) => Promise<void>;
  initialIdea?: ProcrastIdea;
};

type PlanProcrastIdeaModalOptions = {
  dashboardTab: DashboardTab;
  ideas: ProcrastIdea[];
  initialIdeaUuid: string;
  onConfirm: (selection: PlanProcrastIdeaSelection) => Promise<void> | void;
};

type PlanProcrastIdeaSelection = {
  idea: ProcrastIdea;
  targetFolderPath: string;
  shouldCreateFolder: boolean;
  shouldPinProject: boolean;
};

const PROCRAST_PLAN_PROMPT_PREFIX = "/procrast:plan-idea";

export async function openPlanProcrastIdeaFlow(
  request: PlanProcrastIdeaFlowRequest,
): Promise<void> {
  const activeTab = resolveActiveTab(request.getSettings());
  const ideas = request.initialIdea ? [request.initialIdea] : await readIdeasForCommandPalette();

  new PlanProcrastIdeaModal(request.obsidianApp, {
    dashboardTab: activeTab,
    ideas,
    initialIdeaUuid: request.initialIdea?.uuid ?? ideas[0]?.uuid ?? "",
    onConfirm: async (selection) => {
      await executePlanProcrastIdeaSelection(request, activeTab.name, selection);
    },
  }).open();
}

async function readIdeasForCommandPalette(): Promise<ProcrastIdea[]> {
  const snapshot = await readOpenProcrastIdeas();
  if (snapshot.availability === "not-installed") {
    new Notice("Procrast CLI not found — enter an idea UUID manually");
    return [];
  }
  if (snapshot.availability === "unauthenticated") {
    new Notice("Log in to Procrast from a terminal — enter an idea UUID manually");
    return [];
  }
  if (snapshot.availability === "errored") {
    new Notice("Could not load Procrast ideas — enter an idea UUID manually");
    return [];
  }
  return snapshot.ideas;
}

class PlanProcrastIdeaModal extends Modal {
  private readonly options: PlanProcrastIdeaModalOptions;
  private selectedIdeaUuid: string;
  private ideaUuidInputElement: HTMLInputElement | null = null;
  private existingFolderInputElement: HTMLInputElement | null = null;
  private newFolderInputElement: HTMLInputElement | null = null;
  private pinnedFolderSelectElement: HTMLSelectElement | null = null;
  private shouldAutoPinTargetFolder = true;
  private ideaPreviewElement: HTMLElement | null = null;

  constructor(obsidianApplication: App, options: PlanProcrastIdeaModalOptions) {
    super(obsidianApplication);
    this.options = options;
    this.selectedIdeaUuid = options.initialIdeaUuid;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Plan a Procrast idea here" });
    contentEl.createEl("p", {
      text: "Choose a Procrast idea, choose or create a target folder, then start Claude Code with the Procrast planning command.",
      cls: "setting-item-description",
    });

    this.renderIdeaPicker(contentEl);
    this.renderFolderPicker(contentEl);
    this.renderActions(contentEl);
    this.updateIdeaPreview();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderIdeaPicker(parentElement: HTMLElement): void {
    parentElement.createEl("h3", { text: "Idea" });

    if (this.options.ideas.length > 0) {
      new Setting(parentElement)
        .setName("Open idea")
        .setDesc("Loaded from procrast list --json --hide-done --sort smart.")
        .addDropdown((dropdownControl) => {
          for (const idea of this.options.ideas) {
            dropdownControl.addOption(idea.uuid, resolveProcrastIdeaTitle(idea));
          }
          dropdownControl.setValue(this.selectedIdeaUuid);
          dropdownControl.onChange((ideaUuid) => {
            this.selectedIdeaUuid = ideaUuid;
            if (this.ideaUuidInputElement !== null) {
              this.ideaUuidInputElement.value = ideaUuid;
            }
            this.updateIdeaPreview();
          });
        });
    }

    new Setting(parentElement)
      .setName("Idea UUID")
      .setDesc("Use this for command-palette planning or to override the selected open idea.")
      .addText((textInput) => {
        textInput.setValue(this.selectedIdeaUuid);
        textInput.setPlaceholder("Procrast idea UUID");
        this.ideaUuidInputElement = textInput.inputEl;
        textInput.onChange((ideaUuid) => {
          this.selectedIdeaUuid = ideaUuid.trim();
          this.updateIdeaPreview();
        });
      });

    this.ideaPreviewElement = parentElement.createDiv({ cls: "setting-item-description" });
  }

  private renderFolderPicker(parentElement: HTMLElement): void {
    parentElement.createEl("h3", { text: "Target folder" });

    new Setting(parentElement)
      .setName("Pinned folder")
      .setDesc("Use an existing pinned project folder on this dashboard tab.")
      .addDropdown((dropdownControl) => {
        dropdownControl.addOption("", "Choose pinned folder…");
        for (const pinnedProject of this.options.dashboardTab.pinnedProjects) {
          const label = pinnedProject.displayName.trim() || pinnedProject.folderPath;
          dropdownControl.addOption(pinnedProject.folderPath, label);
        }
        this.pinnedFolderSelectElement = dropdownControl.selectEl;
      });

    new Setting(parentElement)
      .setName("Existing folder path")
      .setDesc("Absolute path to an existing folder. Overrides the pinned-folder dropdown.")
      .addText((textInput) => {
        textInput.setPlaceholder("/Users/you/code/project");
        this.existingFolderInputElement = textInput.inputEl;
      });

    new Setting(parentElement)
      .setName("New folder path")
      .setDesc("Created only if this field is filled. Overrides the existing-folder choices.")
      .addText((textInput) => {
        textInput.setPlaceholder("/Users/you/code/new-project");
        this.newFolderInputElement = textInput.inputEl;
      });

    new Setting(parentElement)
      .setName("Pin target folder to this tab")
      .setDesc("Enabled by default so the planned project appears on the dashboard.")
      .addToggle((toggleControl) => {
        toggleControl.setValue(this.shouldAutoPinTargetFolder);
        toggleControl.onChange((shouldAutoPin) => {
          this.shouldAutoPinTargetFolder = shouldAutoPin;
        });
      });
  }

  private renderActions(parentElement: HTMLElement): void {
    const actionRow = parentElement.createDiv({ cls: "modal-button-container" });
    const cancelButton = actionRow.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());

    const confirmButton = actionRow.createEl("button", {
      text: "Plan here",
      cls: "mod-cta",
    });
    confirmButton.addEventListener("click", () => {
      void this.confirmSelection();
    });
  }

  private async confirmSelection(): Promise<void> {
    const ideaUuid = this.ideaUuidInputElement?.value.trim() ?? this.selectedIdeaUuid.trim();
    if (ideaUuid.length === 0) {
      new Notice("Choose or enter a Procrast idea UUID");
      return;
    }

    const newFolderPath = this.newFolderInputElement?.value.trim() ?? "";
    const existingFolderPath = this.existingFolderInputElement?.value.trim() ?? "";
    const pinnedFolderPath = this.pinnedFolderSelectElement?.value.trim() ?? "";
    const targetFolderPath = newFolderPath || existingFolderPath || pinnedFolderPath;
    if (targetFolderPath.length === 0) {
      new Notice("Choose or enter a target folder");
      return;
    }

    const selectedIdea = this.resolveSelectedIdea(ideaUuid);
    this.close();
    await this.options.onConfirm({
      idea: selectedIdea,
      targetFolderPath,
      shouldCreateFolder: newFolderPath.length > 0,
      shouldPinProject: this.shouldAutoPinTargetFolder,
    });
  }

  private resolveSelectedIdea(ideaUuid: string): ProcrastIdea {
    const loadedIdea = this.options.ideas.find((idea) => idea.uuid === ideaUuid);
    if (loadedIdea !== undefined) {
      return loadedIdea;
    }
    return {
      uuid: ideaUuid,
      content: "",
      refinedContent: "",
      refinementSummary: "",
      summaryTitle: "",
      actionSteps: [],
      creativeAngles: [],
      keyQuestions: [],
      priority: "",
      dueDate: null,
      completedAt: null,
      createdAt: "",
      updatedAt: "",
    };
  }

  private updateIdeaPreview(): void {
    if (this.ideaPreviewElement === null) {
      return;
    }
    const selectedIdea = this.options.ideas.find((idea) => idea.uuid === this.selectedIdeaUuid);
    this.ideaPreviewElement.empty();
    if (selectedIdea === undefined) {
      this.ideaPreviewElement.setText(
        this.selectedIdeaUuid.length > 0
          ? `Planning idea ${this.selectedIdeaUuid}`
          : "No Procrast idea selected yet.",
      );
      return;
    }
    this.ideaPreviewElement.setText(
      `${resolveProcrastIdeaTitle(selectedIdea)} · ${selectedIdea.uuid}`,
    );
  }
}

async function executePlanProcrastIdeaSelection(
  request: PlanProcrastIdeaFlowRequest,
  activeTabName: string,
  selection: PlanProcrastIdeaSelection,
): Promise<void> {
  const targetFolderPath = resolveEnteredFolderPath(selection.targetFolderPath);
  const canUseTargetFolder = selection.shouldCreateFolder
    ? await createTargetFolderIfNeeded(targetFolderPath)
    : await verifyExistingTargetFolder(targetFolderPath);
  if (!canUseTargetFolder) {
    return;
  }

  const ideaTitle = resolveProcrastIdeaTitle(selection.idea);
  const nextSettings = recordProcrastIdeaFolderMapping(
    request.getSettings(),
    activeTabName,
    selection.idea.uuid,
    ideaTitle,
    targetFolderPath,
    selection.shouldPinProject,
  );

  await request.replaceSettings(nextSettings);

  const initialPromptText = `${PROCRAST_PLAN_PROMPT_PREFIX} ${selection.idea.uuid}`;
  await launchInObsidianClaudeTerminal(request.obsidianApp, {
    workingDirectoryAbsolutePath: targetFolderPath,
    initialPromptText,
    fallbackShellCommandLine: buildClaudeStartCommandLine(targetFolderPath, initialPromptText),
  });
}

async function createTargetFolderIfNeeded(targetFolderPath: string): Promise<boolean> {
  try {
    await filesystemPromises.mkdir(targetFolderPath, { recursive: true });
    return true;
  } catch {
    new Notice("Could not create target folder");
    return false;
  }
}

async function verifyExistingTargetFolder(targetFolderPath: string): Promise<boolean> {
  try {
    const targetStatistics = await filesystemPromises.stat(targetFolderPath);
    if (targetStatistics.isDirectory()) {
      return true;
    }
    new Notice("Target path is not a folder");
    return false;
  } catch {
    new Notice("Target folder does not exist");
    return false;
  }
}

function recordProcrastIdeaFolderMapping(
  settings: PluginSettings,
  activeTabName: string,
  ideaUuid: string,
  ideaTitle: string,
  targetFolderPath: string,
  shouldPinProject: boolean,
): PluginSettings {
  const nextSettings = clonePluginSettings(settings);
  const nextMapping: ProcrastIdeaFolderMapping = {
    ideaUuid,
    targetFolderPath,
    tabName: activeTabName,
    createdAt: new Date().toISOString(),
    ideaTitle,
  };

  nextSettings.procrastIdeaFolderMappings = nextSettings.procrastIdeaFolderMappings
    .filter(
      (mapping) =>
        mapping.tabName !== activeTabName ||
        !folderPathsPointToSameLocation(mapping.targetFolderPath, targetFolderPath),
    )
    .concat(nextMapping);

  if (shouldPinProject) {
    const activeTab = nextSettings.tabs.find((tab) => tab.name === activeTabName);
    if (
      activeTab !== undefined &&
      !activeTab.pinnedProjects.some((project) =>
        folderPathsPointToSameLocation(project.folderPath, targetFolderPath),
      )
    ) {
      activeTab.pinnedProjects.push({
        folderPath: targetFolderPath,
        displayName: nodePath.basename(targetFolderPath),
        manuallyAssignedContainerNames: [],
        storedShellCommands: [],
        jiraProjectKey: "",
      });
    }
  }

  return nextSettings;
}

function clonePluginSettings(settings: PluginSettings): PluginSettings {
  return {
    activeTabName: settings.activeTabName,
    workspaceStartup: { ...settings.workspaceStartup },
    tabs: settings.tabs.map((dashboardTab) => ({
      name: dashboardTab.name,
      folderScopes: [...dashboardTab.folderScopes],
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

function resolveEnteredFolderPath(rawFolderPath: string): string {
  const trimmedFolderPath = rawFolderPath.trim();
  if (trimmedFolderPath === "~") {
    return os.homedir();
  }
  if (trimmedFolderPath.startsWith("~/")) {
    return nodePath.resolve(os.homedir(), trimmedFolderPath.slice(2));
  }
  return nodePath.resolve(trimmedFolderPath);
}

function folderPathsPointToSameLocation(leftFolderPath: string, rightFolderPath: string): boolean {
  return nodePath.resolve(leftFolderPath) === nodePath.resolve(rightFolderPath);
}

function buildClaudeStartCommandLine(folderPath: string, initialPromptText: string): string {
  return `cd ${quoteShellArgument(folderPath)} && claude ${quoteShellArgument(initialPromptText)}`;
}

function quoteShellArgument(argumentValue: string): string {
  return `'${argumentValue.replace(/'/g, "'\\''")}'`;
}
