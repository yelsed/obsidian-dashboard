import { execFile } from "child_process";
import { shell } from "electron";
import nodePath from "path";
import { FileSystemAdapter, Notice, TFile, type App } from "obsidian";

export function resolveCurrentVaultBasePath(obsidianApplication: App): string | null {
  const vaultAdapter = obsidianApplication.vault.adapter;
  if (vaultAdapter instanceof FileSystemAdapter) {
    return vaultAdapter.getBasePath();
  }
  return null;
}

export function resolveVaultRelativeFilePathIfWithinVault(
  obsidianApplication: App,
  absoluteFilePath: string,
): string | null {
  const vaultBasePath = resolveCurrentVaultBasePath(obsidianApplication);
  if (vaultBasePath === null) {
    return null;
  }
  if (!isAbsolutePathInsideVault(absoluteFilePath, vaultBasePath)) {
    return null;
  }
  return nodePath.relative(vaultBasePath, absoluteFilePath).split(nodePath.sep).join("/");
}

export function openAbsoluteMarkdownFilePath(
  obsidianApplication: App,
  absoluteMarkdownFilePath: string,
): void {
  if (openMarkdownFileInsideObsidianIfWithinVault(obsidianApplication, absoluteMarkdownFilePath)) {
    return;
  }
  openMarkdownFileInCodeEditor(absoluteMarkdownFilePath);
}

export function openMarkdownFileInsideObsidianIfWithinVault(
  obsidianApplication: App,
  absoluteFilePath: string,
): boolean {
  if (!absoluteFilePath.toLowerCase().endsWith(".md")) {
    return false;
  }
  const vaultRelativeFilePath = resolveVaultRelativeFilePathIfWithinVault(
    obsidianApplication,
    absoluteFilePath,
  );
  if (vaultRelativeFilePath === null) {
    return false;
  }
  const matchedAbstractFile = obsidianApplication.vault.getAbstractFileByPath(
    vaultRelativeFilePath,
  );
  if (!(matchedAbstractFile instanceof TFile)) {
    return false;
  }
  void obsidianApplication.workspace.getLeaf(false).openFile(matchedAbstractFile);
  return true;
}

export function openMarkdownFileInCodeEditor(absoluteMarkdownFilePath: string): void {
  execFile("/usr/bin/open", ["-a", "Zed", absoluteMarkdownFilePath], (error) => {
    if (error) {
      new Notice("Could not open GOALS.md in Zed. Opening with the default app.");
      void shell.openPath(absoluteMarkdownFilePath);
    }
  });
}

function isAbsolutePathInsideVault(absoluteFilePath: string, vaultBasePath: string): boolean {
  const lowercasedFilePath = absoluteFilePath.toLowerCase();
  const lowercasedVaultBasePath = vaultBasePath.toLowerCase();
  return (
    lowercasedFilePath === lowercasedVaultBasePath ||
    lowercasedFilePath.startsWith(`${lowercasedVaultBasePath}/`)
  );
}
