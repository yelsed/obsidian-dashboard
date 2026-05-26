import { App, Modal } from "obsidian";
import { resolveProcrastIdeaTitle, type ProcrastIdea } from "../data/procrast";

export function confirmMarkProcrastIdeaDone(
  obsidianApplication: App,
  idea: ProcrastIdea,
): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmProcrastIdeaDoneModal(obsidianApplication, idea, resolve).open();
  });
}

class ConfirmProcrastIdeaDoneModal extends Modal {
  private readonly idea: ProcrastIdea;
  private readonly resolve: (confirmed: boolean) => void;
  private hasResolved = false;

  constructor(
    obsidianApplication: App,
    idea: ProcrastIdea,
    resolve: (confirmed: boolean) => void,
  ) {
    super(obsidianApplication);
    this.idea = idea;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Mark Procrast idea done?" });
    contentEl.createEl("p", {
      text: resolveProcrastIdeaTitle(this.idea),
      cls: "setting-item-description",
    });
    contentEl.createEl("p", {
      text: "This runs procrast done for the selected idea.",
      cls: "setting-item-description",
    });

    const actionRow = contentEl.createDiv({ cls: "modal-button-container" });
    const cancelButton = actionRow.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.finish(false));

    const confirmButton = actionRow.createEl("button", {
      text: "Mark done",
      cls: "mod-warning",
    });
    confirmButton.addEventListener("click", () => this.finish(true));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.hasResolved) {
      this.hasResolved = true;
      this.resolve(false);
    }
  }

  private finish(confirmed: boolean): void {
    if (this.hasResolved) {
      return;
    }
    this.hasResolved = true;
    this.resolve(confirmed);
    this.close();
  }
}
