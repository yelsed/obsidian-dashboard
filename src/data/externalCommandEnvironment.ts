import { homedir } from "os";
import { delimiter as pathDelimiter, join as joinPath } from "path";

// macOS GUI applications launched from Finder or the Dock inherit a minimal PATH
// (/usr/bin:/bin:/usr/sbin:/sbin) that omits the directories where user-installed
// command line tools live. Spawning a bare command name then fails with ENOENT even
// though the tool is installed. Prepending the common install directories restores
// resolution regardless of how Obsidian was launched.
export function buildExternalCommandEnvironment(): NodeJS.ProcessEnv {
  const userHomeDirectory = homedir();
  const commonToolInstallDirectories = [
    joinPath(userHomeDirectory, ".cargo", "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    joinPath(userHomeDirectory, ".local", "bin"),
    joinPath(userHomeDirectory, ".bun", "bin"),
  ];

  const inheritedPathDirectories = (process.env.PATH ?? "").split(pathDelimiter);
  const deduplicatedPathDirectories = removeDuplicateStringsPreservingOrder([
    ...commonToolInstallDirectories,
    ...inheritedPathDirectories,
  ]).filter((directory) => directory.length > 0);

  return {
    ...process.env,
    PATH: deduplicatedPathDirectories.join(pathDelimiter),
  };
}

function removeDuplicateStringsPreservingOrder(values: string[]): string[] {
  const seenValues = new Set<string>();
  const uniqueValues: string[] = [];
  for (const value of values) {
    if (seenValues.has(value)) {
      continue;
    }
    seenValues.add(value);
    uniqueValues.push(value);
  }
  return uniqueValues;
}
