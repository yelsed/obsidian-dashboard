import type { App, EventRef } from "obsidian";
import { writable, type Readable } from "svelte/store";
import { debounce } from "./format";
import {
  isFilePathWithinFolderScopes,
  normaliseFolderScope,
  type FolderPath,
} from "../settings";

export type TagStat = {
  tagName: string;
  noteCount: number;
};

export type FolderStat = {
  folderPath: string;
  noteCount: number;
};

export type TagFolderStatsSnapshot = {
  topTags: TagStat[];
  topFolders: FolderStat[];
  untaggedNoteCount: number;
};

export type TagFolderStatsStore = {
  store: Readable<TagFolderStatsSnapshot>;
  setFolderScopes: (folderScopes: FolderPath[]) => void;
  destroy: () => void;
};

const TOP_TAGS_LIMIT = 4;
const TOP_FOLDERS_LIMIT = 4;
const METADATA_EVENT_DEBOUNCE_MILLISECONDS = 300;

export function createTagFolderStatsStore(
  obsidianApplication: App,
  initialFolderScopes: FolderPath[] = [],
): TagFolderStatsStore {
  let currentFolderScopes: FolderPath[] = initialFolderScopes;

  function buildSnapshot(): TagFolderStatsSnapshot {
    const tagCountByTagName = new Map<string, number>();
    const noteCountByDisplayedFolder = new Map<string, number>();
    let untaggedNoteCount = 0;

    const filesInScope = obsidianApplication.vault
      .getMarkdownFiles()
      .filter((file) => isFilePathWithinFolderScopes(file.path, currentFolderScopes));

    for (const file of filesInScope) {
      const fileMetadataCache = obsidianApplication.metadataCache.getFileCache(file);

      const inlineTagReferences = fileMetadataCache?.tags ?? [];
      const frontmatterTagsRaw = fileMetadataCache?.frontmatter?.tags;
      const frontmatterTags = normaliseFrontmatterTags(frontmatterTagsRaw);

      const fileHasAnyTag = inlineTagReferences.length > 0 || frontmatterTags.length > 0;
      if (!fileHasAnyTag) {
        untaggedNoteCount++;
      }

      for (const tagReference of inlineTagReferences) {
        addOneToTagCount(tagCountByTagName, tagReference.tag);
      }
      for (const frontmatterTag of frontmatterTags) {
        addOneToTagCount(tagCountByTagName, frontmatterTag);
      }

      const displayedFolderPath = pickDisplayedFolderPath(file.path, currentFolderScopes);
      if (displayedFolderPath !== null) {
        noteCountByDisplayedFolder.set(
          displayedFolderPath,
          (noteCountByDisplayedFolder.get(displayedFolderPath) ?? 0) + 1,
        );
      }
    }

    const topTags = Array.from(tagCountByTagName.entries())
      .map(([tagName, noteCount]) => ({ tagName, noteCount }))
      .sort((leftTag, rightTag) => rightTag.noteCount - leftTag.noteCount)
      .slice(0, TOP_TAGS_LIMIT);

    const topFolders = Array.from(noteCountByDisplayedFolder.entries())
      .map(([folderPath, noteCount]) => ({ folderPath, noteCount }))
      .sort((leftFolder, rightFolder) => rightFolder.noteCount - leftFolder.noteCount)
      .slice(0, TOP_FOLDERS_LIMIT);

    return { topTags, topFolders, untaggedNoteCount };
  }

  const snapshotStore = writable<TagFolderStatsSnapshot>(buildSnapshot());

  const refreshSnapshotDebounced = debounce(() => {
    snapshotStore.set(buildSnapshot());
  }, METADATA_EVENT_DEBOUNCE_MILLISECONDS);

  const registeredEventReferences: EventRef[] = [
    obsidianApplication.metadataCache.on("changed", refreshSnapshotDebounced),
    obsidianApplication.metadataCache.on("resolved", refreshSnapshotDebounced),
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
      obsidianApplication.metadataCache.offref(eventReference);
      obsidianApplication.vault.offref(eventReference);
    }
  }

  return { store: snapshotStore, setFolderScopes, destroy };
}

function pickDisplayedFolderPath(
  filePath: string,
  folderScopes: FolderPath[],
): string | null {
  if (folderScopes.length === 0) {
    const topLevelFolderName = filePath.split("/")[0] ?? "";
    if (topLevelFolderName.length === 0 || topLevelFolderName === filePath) {
      return null;
    }
    return `/${topLevelFolderName}`;
  }

  for (const rawScope of folderScopes) {
    const normalisedScope = normaliseFolderScope(rawScope);
    if (normalisedScope.length === 0) {
      const topLevelFolderName = filePath.split("/")[0] ?? "";
      if (topLevelFolderName.length === 0 || topLevelFolderName === filePath) {
        return null;
      }
      return `/${topLevelFolderName}`;
    }
    if (filePath.startsWith(`${normalisedScope}/`)) {
      const relativePath = filePath.slice(normalisedScope.length + 1);
      const firstSegment = relativePath.split("/")[0] ?? "";
      if (firstSegment.length === 0 || firstSegment === relativePath) {
        return null;
      }
      return `/${normalisedScope}/${firstSegment}`;
    }
  }
  return null;
}

function addOneToTagCount(tagCountByTagName: Map<string, number>, tagNameRaw: string): void {
  const normalisedTagName = ensureLeadingHash(tagNameRaw);
  tagCountByTagName.set(
    normalisedTagName,
    (tagCountByTagName.get(normalisedTagName) ?? 0) + 1,
  );
}

function ensureLeadingHash(tagName: string): string {
  return tagName.startsWith("#") ? tagName : `#${tagName}`;
}

function normaliseFrontmatterTags(frontmatterTagsRaw: unknown): string[] {
  if (Array.isArray(frontmatterTagsRaw)) {
    return frontmatterTagsRaw.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );
  }
  if (typeof frontmatterTagsRaw === "string" && frontmatterTagsRaw.length > 0) {
    return frontmatterTagsRaw.split(/[,\s]+/).filter((entry) => entry.length > 0);
  }
  return [];
}
