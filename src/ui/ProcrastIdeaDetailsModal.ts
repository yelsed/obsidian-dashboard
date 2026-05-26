import { App, Modal } from "obsidian";
import { resolveProcrastIdeaTitle, type ProcrastIdea } from "../data/procrast";

export class ProcrastIdeaDetailsModal extends Modal {
  private readonly idea: ProcrastIdea;

  constructor(obsidianApplication: App, idea: ProcrastIdea) {
    super(obsidianApplication);
    this.idea = idea;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vault-dashboard-procrast-details-modal");

    contentEl.createEl("h2", { text: resolveProcrastIdeaTitle(this.idea) });
    this.appendKeyValue(contentEl, "uuid", this.idea.uuid);
    this.appendKeyValue(contentEl, "priority", this.idea.priority.trim() || "normal");
    if (this.idea.dueDate !== null) {
      this.appendKeyValue(contentEl, "due", this.idea.dueDate);
    }

    this.appendSectionIfPresent(contentEl, "Summary", this.idea.refinementSummary);
    this.appendSectionIfPresent(contentEl, "Refined content", this.idea.refinedContent);
    if (this.idea.refinedContent.trim().length === 0) {
      this.appendSectionIfPresent(contentEl, "Captured content", this.idea.content);
    }
    this.appendListIfPresent(contentEl, "Action steps", this.idea.actionSteps, true);
    this.appendListIfPresent(contentEl, "Creative angles", this.idea.creativeAngles, false);
    this.appendListIfPresent(contentEl, "Key questions", this.idea.keyQuestions, false);

    const closeRow = contentEl.createDiv({ cls: "modal-button-container" });
    const closeButton = closeRow.createEl("button", { text: "Close", cls: "mod-cta" });
    closeButton.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private appendKeyValue(parentElement: HTMLElement, key: string, value: string): void {
    if (value.trim().length === 0) {
      return;
    }
    const row = parentElement.createDiv({ cls: "vault-dashboard-procrast-detail-kv" });
    row.createSpan({ text: key, cls: "vault-dashboard-procrast-detail-key" });
    row.createSpan({ text: value, cls: "vault-dashboard-procrast-detail-value" });
  }

  private appendSectionIfPresent(
    parentElement: HTMLElement,
    heading: string,
    bodyText: string,
  ): void {
    const trimmedBodyText = bodyText.trim();
    if (trimmedBodyText.length === 0) {
      return;
    }
    parentElement.createEl("h3", {
      text: heading,
      cls: "vault-dashboard-procrast-detail-heading",
    });
    parentElement.createEl("p", {
      text: trimmedBodyText,
      cls: "vault-dashboard-procrast-detail-paragraph",
    });
  }

  private appendListIfPresent(
    parentElement: HTMLElement,
    heading: string,
    entries: string[],
    ordered: boolean,
  ): void {
    const presentEntries = entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    if (presentEntries.length === 0) {
      return;
    }
    parentElement.createEl("h3", {
      text: heading,
      cls: "vault-dashboard-procrast-detail-heading",
    });
    const listElement = parentElement.createEl(ordered ? "ol" : "ul", {
      cls: "vault-dashboard-procrast-detail-list",
    });
    for (const entry of presentEntries) {
      listElement.createEl("li", { text: entry });
    }
  }
}
