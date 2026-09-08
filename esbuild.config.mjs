import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";
import builtinModules from "builtin-modules";
import process from "node:process";
import { copyBuildArtifactsIntoLinkedVault } from "./scripts/link-vault.mjs";

const isProductionBuild = process.argv[2] === "production";

// Keeps the linked vault's plugin folder in step with every rebuild, so `npm run dev` plus the
// hot-reload plugin reloads the dashboard without a symlink into the vault.
const copyIntoLinkedVaultPlugin = {
  name: "copy-into-linked-vault",
  setup(build) {
    build.onEnd((buildResult) => {
      if (buildResult.errors.length > 0) {
        return;
      }
      const pluginFolderPath = copyBuildArtifactsIntoLinkedVault();
      if (pluginFolderPath !== null) {
        console.log(`[link-vault] copied build into ${pluginFolderPath}`);
      }
    });
  },
};

const externalDependencies = [
  "obsidian",
  "electron",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
  ...builtinModules,
];

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: externalDependencies,
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: isProductionBuild ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  platform: "browser",
  mainFields: ["browser", "module", "main"],
  conditions: ["svelte", "browser"],
  plugins: [
    esbuildSvelte({
      compilerOptions: { css: "injected" },
      preprocess: sveltePreprocess(),
    }),
    copyIntoLinkedVaultPlugin,
  ],
});

if (isProductionBuild) {
  await context.rebuild();
  await context.dispose();
  process.exit(0);
} else {
  await context.watch();
}
