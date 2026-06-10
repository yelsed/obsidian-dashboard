// Obsidian's desktop runtime is Electron, so `electron` resolves at runtime and esbuild marks
// it external. It ships no bundled type declarations here, so we declare the slice we use.
declare module "electron" {
  export const shell: {
    openExternal(url: string): Promise<void>;
    openPath(path: string): Promise<string>;
  };
}
