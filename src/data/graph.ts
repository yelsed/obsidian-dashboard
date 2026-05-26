import type { App, EventRef } from "obsidian";
import { writable, type Readable } from "svelte/store";
import { debounce } from "./format";
import { isFilePathWithinFolderScopes, type FolderPath } from "../settings";

export type BrokenLinkEntry = {
  sourceFilePath: string;
  unresolvedTargetName: string;
};

export type HubNoteEntry = {
  filePath: string;
  displayLabel: string;
  incomingLinkCount: number;
};

export type OrphanNoteEntry = {
  filePath: string;
  displayLabel: string;
};

export type GraphInsightsSnapshot = {
  orphanNoteCount: number;
  orphanNotes: OrphanNoteEntry[];
  hubNoteLabels: string[];
  hubNotes: HubNoteEntry[];
  brokenLinkCount: number;
  brokenLinks: BrokenLinkEntry[];
  mostLinkedNoteFileName: string;
  mostLinkedNoteFilePath: string;
  mostLinkedNoteIncomingLinkCount: number;
  mostLinkingNoteFileName: string;
  mostLinkingNoteFilePath: string;
  mostLinkingNoteOutgoingLinkCount: number;
};

const ORPHAN_LIST_LIMIT = 100;
const BROKEN_LINK_LIST_LIMIT = 100;

export type GraphInsightsStore = {
  store: Readable<GraphInsightsSnapshot>;
  setFolderScopes: (folderScopes: FolderPath[]) => void;
  destroy: () => void;
};

const HUB_INCOMING_LINK_THRESHOLD = 10;
const HUB_LABELS_LIMIT = 3;
const METADATA_EVENT_DEBOUNCE_MILLISECONDS = 400;

export function createGraphInsightsStore(
  obsidianApplication: App,
  initialFolderScopes: FolderPath[] = [],
): GraphInsightsStore {
  let currentFolderScopes: FolderPath[] = initialFolderScopes;

  function buildSnapshot(): GraphInsightsSnapshot {
    const resolvedLinks = obsidianApplication.metadataCache.resolvedLinks;
    const unresolvedLinks = obsidianApplication.metadataCache.unresolvedLinks;

    const incomingLinkCountByTargetPath = new Map<string, number>();
    const outgoingLinkCountBySourcePath = new Map<string, number>();

    for (const sourcePath of Object.keys(resolvedLinks)) {
      if (!isFilePathWithinFolderScopes(sourcePath, currentFolderScopes)) {
        continue;
      }
      const targets = resolvedLinks[sourcePath];
      let outgoingTotalForSource = 0;
      for (const targetPath of Object.keys(targets)) {
        if (!isFilePathWithinFolderScopes(targetPath, currentFolderScopes)) {
          continue;
        }
        const linkCount = targets[targetPath];
        outgoingTotalForSource += linkCount;
        incomingLinkCountByTargetPath.set(
          targetPath,
          (incomingLinkCountByTargetPath.get(targetPath) ?? 0) + linkCount,
        );
      }
      outgoingLinkCountBySourcePath.set(sourcePath, outgoingTotalForSource);
    }

    const orphanNotes: OrphanNoteEntry[] = [];
    for (const file of obsidianApplication.vault.getMarkdownFiles()) {
      if (!isFilePathWithinFolderScopes(file.path, currentFolderScopes)) {
        continue;
      }
      const incoming = incomingLinkCountByTargetPath.get(file.path) ?? 0;
      const outgoing = outgoingLinkCountBySourcePath.get(file.path) ?? 0;
      if (incoming === 0 && outgoing === 0) {
        orphanNotes.push({
          filePath: file.path,
          displayLabel: filePathToDisplayLabel(file.path),
        });
      }
    }
    const orphanNoteCount = orphanNotes.length;
    const orphanNotesLimited = orphanNotes.slice(0, ORPHAN_LIST_LIMIT);

    const brokenLinks: BrokenLinkEntry[] = [];
    let brokenLinkCount = 0;
    for (const sourcePath of Object.keys(unresolvedLinks)) {
      if (!isFilePathWithinFolderScopes(sourcePath, currentFolderScopes)) {
        continue;
      }
      const unresolvedTargets = unresolvedLinks[sourcePath];
      for (const targetName of Object.keys(unresolvedTargets)) {
        brokenLinkCount += unresolvedTargets[targetName];
        brokenLinks.push({ sourceFilePath: sourcePath, unresolvedTargetName: targetName });
      }
    }
    const brokenLinksLimited = brokenLinks.slice(0, BROKEN_LINK_LIST_LIMIT);

    const sortedByIncoming = Array.from(incomingLinkCountByTargetPath.entries()).sort(
      (leftEntry, rightEntry) => rightEntry[1] - leftEntry[1],
    );

    const hubNotes: HubNoteEntry[] = sortedByIncoming
      .filter(([, incomingCount]) => incomingCount >= HUB_INCOMING_LINK_THRESHOLD)
      .slice(0, HUB_LABELS_LIMIT)
      .map(([filePath, incomingCount]) => ({
        filePath,
        displayLabel: filePathToDisplayLabel(filePath),
        incomingLinkCount: incomingCount,
      }));
    const hubNoteLabels = hubNotes.map((hubNote) => hubNote.displayLabel);

    const [mostLinkedPath, mostLinkedIncomingCount] = sortedByIncoming[0] ?? ["", 0];

    const sortedByOutgoing = Array.from(outgoingLinkCountBySourcePath.entries()).sort(
      (leftEntry, rightEntry) => rightEntry[1] - leftEntry[1],
    );

    const [mostLinkingPath, mostLinkingOutgoingCount] = sortedByOutgoing[0] ?? ["", 0];

    return {
      orphanNoteCount,
      orphanNotes: orphanNotesLimited,
      hubNoteLabels,
      hubNotes,
      brokenLinkCount,
      brokenLinks: brokenLinksLimited,
      mostLinkedNoteFileName: mostLinkedPath
        ? filePathToDisplayLabel(mostLinkedPath)
        : "(none)",
      mostLinkedNoteFilePath: mostLinkedPath,
      mostLinkedNoteIncomingLinkCount: mostLinkedIncomingCount,
      mostLinkingNoteFileName: mostLinkingPath
        ? filePathToDisplayLabel(mostLinkingPath)
        : "(none)",
      mostLinkingNoteFilePath: mostLinkingPath,
      mostLinkingNoteOutgoingLinkCount: mostLinkingOutgoingCount,
    };
  }

  const snapshotStore = writable<GraphInsightsSnapshot>(buildSnapshot());

  const refreshSnapshotDebounced = debounce(() => {
    snapshotStore.set(buildSnapshot());
  }, METADATA_EVENT_DEBOUNCE_MILLISECONDS);

  const registeredEventReferences: EventRef[] = [
    obsidianApplication.metadataCache.on("resolved", refreshSnapshotDebounced),
    obsidianApplication.metadataCache.on("changed", refreshSnapshotDebounced),
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

function filePathToDisplayLabel(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf("/");
  if (lastSlashIndex < 0) {
    return filePath;
  }
  return filePath.slice(lastSlashIndex + 1);
}
