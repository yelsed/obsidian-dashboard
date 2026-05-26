import { ItemView, WorkspaceLeaf } from "obsidian";
import App from "./ui/App.svelte";
import type VaultDashboardPlugin from "./main";
import type { PluginSettings } from "./settings";

export const VAULT_DASHBOARD_VIEW_TYPE = "vault-dashboard";

const VAULT_DASHBOARD_DISPLAY_NAME = "Vault Dashboard";
const VAULT_DASHBOARD_ICON = "layout-dashboard";

export class DashboardView extends ItemView {
  private svelteAppInstance: App | null = null;
  private readonly plugin: VaultDashboardPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: VaultDashboardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VAULT_DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return VAULT_DASHBOARD_DISPLAY_NAME;
  }

  getIcon(): string {
    return VAULT_DASHBOARD_ICON;
  }

  async onOpen(): Promise<void> {
    const viewContainer = this.containerEl.children[1] as HTMLElement;
    viewContainer.empty();
    viewContainer.style.padding = "0";

    this.svelteAppInstance = new App({
      target: viewContainer,
      props: {
        obsidianApp: this.app,
        settingsStore: this.plugin.settingsStore,
        refreshSignalStore: this.plugin.refreshSignalStore,
        replaceSettings: (nextSettings: PluginSettings) =>
          this.plugin.replaceSettings(nextSettings),
      },
    });
  }

  async onClose(): Promise<void> {
    if (this.svelteAppInstance !== null) {
      this.svelteAppInstance.$destroy();
      this.svelteAppInstance = null;
    }
  }
}
