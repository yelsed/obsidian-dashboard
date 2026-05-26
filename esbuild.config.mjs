import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";
import builtinModules from "builtin-modules";
import process from "node:process";

const isProductionBuild = process.argv[2] === "production";

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
  ],
});

if (isProductionBuild) {
  await context.rebuild();
  await context.dispose();
  process.exit(0);
} else {
  await context.watch();
}
