# CLAUDE.md — Vault Dashboard plugin

This document orients future Claude Code sessions to this plugin. Read it before making changes.

---

## What this plugin is

An Obsidian plugin that renders a "super overview" of the vault inside a workspace pane. It surfaces recently edited notes, open tasks, tag/folder statistics, graph insights (orphans, hubs, broken links), and pinned project folders with a live Docker container indicator. The dashboard is organised into tabs (default: **Work** and **Private**), each with its own folder scope, pinned projects, and widget layout.

This plugin is paired with the existing community plugin `ErickRyu/obsidian-claude-code`, which provides a Claude Code terminal in the Obsidian sidebar. The two plugins are intentionally complementary: this plugin owns the dashboard surface, that plugin owns the AI terminal.

The dashboard is also intended to be drivable from Claude Code via the built-in **Obsidian CLI** (Obsidian v1.12.4+). All user-facing commands are registered with stable IDs prefixed `vault-dashboard:` so `obsidian command run vault-dashboard:<id>` works from the terminal. Command registration arrives in the post-MVP backlog (`docs/roadmap.md`).

---

## Stack

- **Language**: TypeScript (strict mode).
- **UI framework**: Svelte 4 (small bundle, reactive, idiomatic for Obsidian plugins).
- **Bundler**: esbuild + `esbuild-svelte` + `svelte-preprocess`.
- **Runtime**: Obsidian desktop (`isDesktopOnly: true` in `manifest.json`). Mobile is out of scope — we rely on Node APIs (`child_process`) for Docker and Procrast integrations.
- **Minimum Obsidian version**: 1.12.4 (the version that ships the built-in Obsidian CLI).

---

## File layout

```
obsidian-dashboard/
├── CLAUDE.md                 # This file.
├── manifest.json             # Obsidian plugin manifest.
├── package.json
├── tsconfig.json
├── esbuild.config.mjs        # esbuild + svelte bundling config.
├── styles.css                # Global styles that must escape Svelte scoping.
├── main.js                   # esbuild output. Generated, gitignored.
├── docs/
│   ├── roadmap.md            # Post-MVP backlog (read before adding features).
│   └── design/               # Phase 1 mockups + design system reference.
├── src/
│   ├── main.ts               # Plugin entry point. Registers the view + commands.
│   ├── view.ts               # DashboardView extends ItemView. Mounts the Svelte App.
│   ├── settings.ts           # Settings tab + PluginSettings schema (added Phase 3).
│   ├── data/
│   │   ├── vault.ts          # Shared helpers over app.vault + app.metadataCache.
│   │   ├── recents.ts        # Recently modified files and folders.
│   │   ├── tasks.ts          # Open task aggregation across the vault.
│   │   ├── tags.ts           # Tag and folder statistics.
│   │   ├── graph.ts          # Orphans, hubs, broken links.
│   │   └── docker.ts         # Running container detection (Phase 5).
│   └── ui/
│       ├── App.svelte        # Dashboard root. Hosts the tab bar and widget grid.
│       ├── TabBar.svelte     # Work/Private/... tab switcher.
│       └── widgets/
│           ├── WidgetPanel.svelte     # Shared collapsible panel shell (sharpened header + collapse).
│           ├── RecentFiles.svelte
│           ├── DailyTasks.svelte
│           ├── TagFolderStats.svelte
│           ├── GraphInsights.svelte
│           └── PinnedProjects.svelte  # Contains the per-project Docker indicator.
```

Design tokens live in `styles.css` (the `.vault-dashboard { … }` custom-property block),
which Obsidian auto-loads. There is no separate `tokens.css` — per-component styling stays
inside each Svelte file's scoped `<style>`.

The plugin is symlinked into a test vault to develop. From the plugin directory:

```bash
ln -s "$(pwd)" "<path-to-test-vault>/.obsidian/plugins/vault-dashboard"
```

After the symlink is in place, enable "Vault Dashboard" in Obsidian's Community Plugins settings.

---

## Build and develop

```bash
npm install              # First time only.
npm run dev              # esbuild watch. Rebuilds main.js on change.
npm run build            # Production build with type-check.
```

After every code change, reload the plugin in Obsidian:

- Command palette → "Reload app without saving" (clean), or
- Disable + re-enable "Vault Dashboard" in Community Plugins.

If you change `manifest.json`, you must fully reload Obsidian — hot reload does not pick up manifest changes.

---

## Settings schema (current and planned)

Phase 0 ships with no settings yet. Phase 3 introduces:

```ts
type FolderPath = string;
type WidgetIdentifier =
  | "recent-files"
  | "daily-tasks"
  | "tag-folder-stats"
  | "graph-insights"
  | "pinned-projects";

interface PinnedProject {
  folderPath: FolderPath;
  manuallyAssignedContainerNames: string[];
  storedShellCommands: { label: string; command: string }[];
}

interface DashboardTab {
  name: string;
  folderScopes: FolderPath[];
  enabledWidgets: WidgetIdentifier[];
  pinnedProjects: PinnedProject[];
}

interface PluginSettings {
  tabs: DashboardTab[];
  activeTabName: string;
}
```

Defaults: two tabs, **Work** and **Private**, both starting with no folder scopes and all widgets enabled.

---

## Tab and widget invariants

These rules hold across all widgets and must not be broken when adding features:

1. **A widget never reads from the global vault unfiltered when a tab has folder scopes set.** If the active tab declares scopes, the widget must filter to files whose paths begin with one of those scope prefixes.
2. **A widget renders an empty state, not an error, when its data source is unavailable.** Examples: no recent edits today, no open tasks, `docker` not installed, Procrast CLI missing.
3. **Per-tab state is serialisable.** No closures, no Map/Set objects in `PluginSettings`. Use arrays of plain objects so settings round-trip through JSON.
4. **Widgets subscribe to vault events through Svelte stores defined in `src/data/`.** Components do not call `app.vault.on(...)` directly — that lives in the data layer so listeners are deduplicated and disposable.
5. **The dashboard view tears down all subscriptions in `onClose`.** Anything that allocates a listener, an interval, or a poller registers a disposer the view can call.

---

## Code style rules — load-bearing

The user has explicitly asked for this style. Future Claude sessions must follow it:

1. **Be maximally descriptive.** Do not cut corners on being obvious. Code must read like prose to a human.
2. **Use long, self-documenting identifiers.** `pinnedProjectsByTabName` is better than `ppbt`. `recentlyModifiedMarkdownFiles` is better than `recents`. Spell things out.
3. **One function does one thing**, named after exactly what it does. If you find yourself writing "and" in the function name, split it.
4. **Comments are only for what genuinely needs one.** A comment justifies its existence by explaining a *why* that the code cannot — a non-obvious constraint, a hidden invariant, a surprising workaround, a load-bearing edge case. **Never** write a comment that paraphrases the next line of code. The name already does that. No tutorial comments. No section banners. No "// returns the file list" above a function called `getMarkdownFiles`.
5. **No abbreviations** unless they are industry-standard (URL, API, ID, HTTP are fine; `fldr`, `tabSrv`, `cfg`, `tmp` are not).
6. **Prefer explicit code over dense one-liners.** Spreading a chain over multiple lines is fine when it improves readability. Early returns are fine. Nested ternaries are not.
7. **Types describe domain intent.** Introduce named types like `type FolderPath = string` or `type ContainerName = string` when the bare primitive loses meaning. Use discriminated unions for state machines.
8. **No dead code.** No commented-out blocks. No "just in case" exports. If it isn't used, delete it.

When you finish a file, re-read it as a stranger would. If a line needs a comment to explain *what* it does, rename the identifiers and split the line until it doesn't.

---

## Where things go

- **Want to add a new widget?** Create `src/ui/widgets/<Name>.svelte`, a matching data module in `src/data/`, register it in `WidgetIdentifier`, add a default entry to the per-tab `enabledWidgets`, and render it from `App.svelte`. Update the design tokens if it needs a new visual primitive.
- **Want to add a new tab field?** Extend `DashboardTab` in `src/settings.ts`, add a migration in the settings loader that fills the field for tabs saved by older versions, update the settings UI.
- **Want to add a new external integration?** Create a new file in `src/data/` and shell out via `child_process.spawn`. Always treat absence of the external tool as a soft empty state, never as a fatal error.

---

## Claude Code terminal integration (`obsidian-claude-code`)

The dashboard drives the companion `obsidian-claude-code` plugin (ErickRyu, manifest id `obsidian-claude-code`, "Claude Code Terminal") to resume and start Claude sessions in-app. That plugin is **not on the community registry as a prebuilt** — its GitHub releases ship only the `node-pty` natives, so it must be built from source.

### Local install layout

- **Fork / build source**: `~/yelsed/obsidian-claude-code` (cloned, `npm install` already run, node-pty rebuilt for Obsidian's Electron via its `postinstall`).
- **Vault install**: `<test-vault>/.obsidian/plugins/obsidian-claude-code` is a **directory symlink** to that fork (hot-reload supports directory symlinks). Rebuilding the fork redeploys `main.js` automatically; a full Obsidian restart is still needed to register a newly added plugin or a manifest change.
- `node-pty` auto-downloads on first load via the plugin's `ensureNodePty` (needs internet once). The `claude` CLI must be on `PATH`.

### The local patch (required for resume/goals)

Upstream exposes no public API to launch claude with `--resume <id>` in an arbitrary project folder — its terminal spawns one `claude` in the vault cwd. We patch two files to add that:

- `src/claude-terminal-view.ts` — adds `TerminalSpawnOverride { cwd?, extraArgs? }`, a constructor param, and applies it in `spawnClaude` (`cwd` and appended args).
- `src/main.ts` — adds `pendingTerminalSpawnOverride`, threads it through the `registerView` factory, and adds the public method:
  `openClaudeSessionInFolder(folderPath, resumeSessionId?, initialPromptText?)`.

The patch is saved at **`integrations/obsidian-claude-code-resume.patch`**. Re-apply after an upstream update:

```bash
cd ~/yelsed/obsidian-claude-code
git pull
git apply ~/yelsed/obsidian-dashboard/integrations/obsidian-claude-code-resume.patch
npm run build   # symlink redeploys main.js; restart Obsidian
```

### How the dashboard calls it

`src/data/claudeTerminal.ts` owns the handoff. `launchInObsidianClaudeTerminal(app, request)`:
1. Finds the plugin instance via `app.plugins.plugins["obsidian-claude-code"]`.
2. If `openClaudeSessionInFolder` exists (patched build) → calls it → `"ran-in-terminal"`.
3. Else opens the terminal (`openClaudeCodeTerminalView`, command id `obsidian-claude-code:open-claude-terminal`) + copies the command → `"copied-to-clipboard"`.
4. Else clipboard only → `"unavailable"`. Never throws when the plugin is absent.

Resume button passes `resumeSessionId`; the GOALS.md button passes `initialPromptText` (typed into a fresh claude, not auto-submitted). `setup-workspace` reuses `openClaudeCodeTerminalView` to dock the terminal.

---

## Pointers

- **Roadmap and backlog**: `docs/roadmap.md`. Read before proposing new features. Many ideas are already triaged there.
- **Design system**: `docs/design/` (populated by Phase 1).
- **Original plan**: `~/.claude/plans/plugin-marketplace-add-piped-dusk.md`.
- **Claude terminal patch**: `integrations/obsidian-claude-code-resume.patch` (re-apply after upstream updates — see the integration section above).
