// Copies the built plugin into a vault's plugin folder. Deliberately a copy and not a symlink:
// a symlink into the vault gets committed by the vault's own git repo as an absolute path, which
// then resolves on exactly one machine.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const PLUGIN_FOLDER_NAME = "vault-dashboard";
const BUILD_ARTIFACT_FILE_NAMES = ["main.js", "manifest.json", "styles.css"];

const repositoryRootPath = path.resolve(import.meta.dirname, "..");
const storedVaultPathFilePath = path.join(repositoryRootPath, ".vaultpath");

function readStoredVaultPath() {
  if (!existsSync(storedVaultPathFilePath)) {
    return null;
  }
  const storedVaultPath = readFileSync(storedVaultPathFilePath, "utf8").trim();
  return storedVaultPath.length > 0 ? storedVaultPath : null;
}

function resolveVaultPath(requestedVaultPath) {
  const candidateVaultPath =
    requestedVaultPath ?? process.env.OBSIDIAN_VAULT ?? readStoredVaultPath();
  if (candidateVaultPath === null || candidateVaultPath === undefined) {
    throw new Error(
      "No vault known. Pass one: npm run link -- /path/to/vault (or set OBSIDIAN_VAULT).",
    );
  }
  const absoluteVaultPath = path.resolve(candidateVaultPath);
  if (!existsSync(path.join(absoluteVaultPath, ".obsidian"))) {
    throw new Error(`${absoluteVaultPath} has no .obsidian folder — not an Obsidian vault.`);
  }
  return absoluteVaultPath;
}

export function copyBuildArtifactsIntoVault(vaultPath) {
  const pluginFolderPath = path.join(vaultPath, ".obsidian", "plugins", PLUGIN_FOLDER_NAME);
  mkdirSync(pluginFolderPath, { recursive: true });

  for (const artifactFileName of BUILD_ARTIFACT_FILE_NAMES) {
    const sourceFilePath = path.join(repositoryRootPath, artifactFileName);
    if (!existsSync(sourceFilePath)) {
      throw new Error(`${artifactFileName} is missing — run npm run build first.`);
    }
    const destinationFilePath = path.join(pluginFolderPath, artifactFileName);
    copyFileSync(sourceFilePath, destinationFilePath);
    if (!statSync(destinationFilePath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Copy of ${artifactFileName} did not land in ${pluginFolderPath}.`);
    }
  }

  return pluginFolderPath;
}

// Used by esbuild after every successful rebuild. Silent when this machine has never been linked.
export function copyBuildArtifactsIntoLinkedVault() {
  const storedVaultPath = readStoredVaultPath();
  if (storedVaultPath === null || !existsSync(path.join(storedVaultPath, ".obsidian"))) {
    return null;
  }
  return copyBuildArtifactsIntoVault(storedVaultPath);
}

function main() {
  const vaultPath = resolveVaultPath(process.argv[2]);
  const pluginFolderPath = copyBuildArtifactsIntoVault(vaultPath);
  writeFileSync(storedVaultPathFilePath, `${vaultPath}\n`, "utf8");
  console.log(`Linked ${PLUGIN_FOLDER_NAME} into ${pluginFolderPath}`);
}

if (process.argv[1] === import.meta.filename) {
  try {
    main();
  } catch (linkError) {
    console.error(linkError.message);
    process.exit(1);
  }
}
