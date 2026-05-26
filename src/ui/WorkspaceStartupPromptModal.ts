import { App, Modal } from "obsidian";

export type WorkspaceStartupPromptCallbacks = {
  onConfirmRunOnStartup: () => void;
  onSuppressFuturePrompts: () => void;
};

export class WorkspaceStartupPromptModal extends Modal {
  private readonly callbacks: WorkspaceStartupPromptCallbacks;

  constructor(app: App, callbacks: WorkspaceStartupPromptCallbacks) {
    super(app);
    this.callbacks = callbacks;
  }

  onOpen(): void {
    this.titleEl.setText("Save as startup layout?");
    this.contentEl.createEl("p", {
      text: "Open this dashboard and the Claude Code terminal automatically every time this vault loads?",
    });

    const buttonRow = this.contentEl.createDiv({ cls: "modal-button-container" });

    const confirmButton = buttonRow.createEl("button", { text: "Yes, every startup" });
    confirmButton.addClass("mod-cta");
    confirmButton.addEventListener("click", () => {
      this.callbacks.onConfirmRunOnStartup();
      this.close();
    });

    const dismissButton = buttonRow.createEl("button", { text: "Not now" });
    dismissButton.addEventListener("click", () => {
      this.close();
    });

    const suppressButton = buttonRow.createEl("button", { text: "Don't ask again" });
    suppressButton.addEventListener("click", () => {
      this.callbacks.onSuppressFuturePrompts();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
