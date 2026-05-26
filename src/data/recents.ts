import type { App, EventRef, TFile } from "obsidian";
import { writable, type Readable } from "svelte/store";
import { debounce, formatRelativeModifiedTime } from "./format";
import { isFilePathWithinFolderScopes, type FolderPath } from "../settings";

export type RecentlyModifiedFile = {
  fileName: string;
  filePath: string;
  relativeModifiedTime: string;
  isMostRecent: boolean;
};

export type RecentlyModifiedFilesSnapshot = {
  recentlyModifiedFiles: RecentlyModifiedFile[];
  totalRecentlyModifiedCount: number;
  recencyWindowLabel: string;
};

export type RecentlyModifiedFilesStore = {
  store: Readable<RecentlyModifiedFilesSnapshot>;
  setFolderScopes: (folderScopes: FolderPath[]) => void;
  destroy: () => void;
};

const DEFAULT_VISIBLE_COUNT = 5;
const DEFAULT_RECENCY_WINDOW_DAYS = 30;
const VAULT_EVENT_DEBOUNCE_MILLISECONDS = 250;

export function createRecentlyModifiedFilesStore(
  obsidianApplication: App,
  visibleCount: number = DEFAULT_VISIBLE_COUNT,
  recencyWindowDays: number = DEFAULT_RECENCY_WINDOW_DAYS,
  initialFolderScopes: FolderPath[] = [],
): RecentlyModifiedFilesStore {
  let currentFolderScopes: FolderPath[] = initialFolderScopes;

  function buildSnapshot(): RecentlyModifiedFilesSnapshot {
    const recencyWindowMilliseconds = recencyWindowDays * 24 * 60 * 60 * 1000;
    const cutoffTimestamp = Date.now() - recencyWindowMilliseconds;

    const filesWithinRecencyWindow = obsidianApplication.vault
      .getMarkdownFiles()
      .filter((file: TFile) => isFilePathWithinFolderScopes(file.path, currentFolderScopes))
      .filter((file: TFile) => file.stat.mtime >= cutoffTimestamp)
      .sort((leftFile, rightFile) => rightFile.stat.mtime - leftFile.stat.mtime);

    const visibleFiles = filesWithinRecencyWindow
      .slice(0, visibleCount)
      .map((file, indexInList) => ({
        fileName: file.basename,
        filePath: file.path,
        relativeModifiedTime: formatRelativeModifiedTime(file.stat.mtime),
        isMostRecent: indexInList === 0,
      }));

    return {
      recentlyModifiedFiles: visibleFiles,
      totalRecentlyModifiedCount: filesWithinRecencyWindow.length,
      recencyWindowLabel: `${recencyWindowDays}d`,
    };
  }

  const snapshotStore = writable<RecentlyModifiedFilesSnapshot>(buildSnapshot());
  const refreshSnapshotDebounced = debounce(() => {
    snapshotStore.set(buildSnapshot());
  }, VAULT_EVENT_DEBOUNCE_MILLISECONDS);

  const registeredEventReferences: EventRef[] = [
    obsidianApplication.vault.on("modify", refreshSnapshotDebounced),
    obsidianApplication.vault.on("create", refreshSnapshotDebounced),
    obsidianApplication.vault.on("delete", refreshSnapshotDebounced),
    obsidianApplication.vault.on("rename", refreshSnapshotDebounced),
  ];

  function setFolderScopes(nextFolderScopes: FolderPath[]): void {
    currentFolderScopes = nextFolderScopes;
    snapshotStore.set(buildSnapshot());
  }

  function destroy(): void {
    refreshSnapshotDebounced.cancel();
    for (const eventReference of registeredEventReferences) {
      obsidianApplication.vault.offref(eventReference);
    }
  }

  return { store: snapshotStore, setFolderScopes, destroy };
}
