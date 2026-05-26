import type { App } from "obsidian";
import { normaliseFolderScope, type FolderPath } from "../settings";

type ObsidianApplicationWithInternalPlugins = App & {
  internalPlugins: {
    getPluginById: (
      pluginId: string,
    ) => {
      instance?: {
        openGlobalSearch?: (query: string) => void;
      };
    } | null;
  };
};

export function buildSearchQueryForTag(
  tagName: string,
  folderScopes: FolderPath[],
): string {
  const queryFragments: string[] = [buildTagOperand(tagName)];
  for (const pathOperand of buildPathOperandsForFolderScopes(folderScopes)) {
    queryFragments.push(pathOperand);
  }
  return queryFragments.join(" ");
}

export function buildSearchQueryForFolder(folderPath: FolderPath): string {
  const pathOperand = buildPathOperandForFolderPath(folderPath);
  if (pathOperand === null) {
    return "";
  }
  return pathOperand;
}

export function buildSearchQueryForUntaggedNotes(
  folderScopes: FolderPath[],
): string {
  const queryFragments: string[] = ["-tag:*"];
  for (const pathOperand of buildPathOperandsForFolderScopes(folderScopes)) {
    queryFragments.push(pathOperand);
  }
  return queryFragments.join(" ");
}

export function openGlobalSearchWithQuery(
  obsidianApplication: App,
  query: string,
): void {
  if (query.length === 0) {
    return;
  }
  const internalPluginsApi = (obsidianApplication as ObsidianApplicationWithInternalPlugins)
    .internalPlugins;
  const globalSearchPlugin = internalPluginsApi.getPluginById("global-search");
  if (globalSearchPlugin === null) {
    return;
  }
  const openGlobalSearchFunction = globalSearchPlugin.instance?.openGlobalSearch;
  if (typeof openGlobalSearchFunction !== "function") {
    return;
  }
  openGlobalSearchFunction.call(globalSearchPlugin.instance, query);
}

function buildTagOperand(tagName: string): string {
  const tagNameWithoutLeadingHash = tagName.replace(/^#+/, "");
  return `tag:#${tagNameWithoutLeadingHash}`;
}

function buildPathOperandsForFolderScopes(folderScopes: FolderPath[]): string[] {
  const pathOperands: string[] = [];
  for (const folderScope of folderScopes) {
    const pathOperand = buildPathOperandForFolderPath(folderScope);
    if (pathOperand !== null) {
      pathOperands.push(pathOperand);
    }
  }
  return pathOperands;
}

function buildPathOperandForFolderPath(folderPath: FolderPath): string | null {
  const normalisedFolderPath = normaliseFolderScope(folderPath);
  if (normalisedFolderPath.length === 0) {
    return null;
  }
  return `path:"${normalisedFolderPath}/"`;
}
