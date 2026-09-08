# Vault Dashboard

An Obsidian plugin that renders a "super overview" of the vault in a workspace pane: recently edited notes, open tasks, tag/folder stats, graph insights (orphans, hubs, broken links), and pinned project folders with a live Docker container indicator. Organised into tabs (default **Work** and **Private**), each with its own folder scope and widgets.

Claude Code actions (resume a session, plan from `GOALS.md`, fix a Jira issue) copy a ready-to-paste `cd … && claude …` command line to the clipboard. The dashboard observes; it never spawns a terminal itself.

## Requirements

- Obsidian **1.12.4+** (built-in Obsidian CLI)
- Desktop only (`isDesktopOnly: true`) — uses Node `child_process` for Docker and Procrast integrations
- Node + npm for building

## Install (from source)

```bash
git clone <this-repo> obsidian-dashboard
cd obsidian-dashboard
npm install
npm run build
npm run link -- /path/to/vault
```

`npm run link` copies `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/vault-dashboard/` and remembers the vault in a gitignored `.vaultpath`,
so later builds redeploy on their own. It is deliberately a copy and not a symlink: a symlink into
the vault gets committed by the vault's own git repository as an absolute path, which then resolves
on exactly one machine. `OBSIDIAN_VAULT` works instead of the argument.

Then enable **Vault Dashboard** in Obsidian → Community Plugins.

## Develop

```bash
npm run dev     # esbuild watch
npm run build   # production build + type-check
npm run link    # copy the current build into the remembered vault
```

Both `dev` and `build` copy into the linked vault after every successful rebuild, so
[`pjeby/hot-reload`](https://github.com/pjeby/hot-reload) picks the new `main.js` up on its own.
Without it: command palette → "Reload app without saving", or toggle the plugin off and on.
Manifest changes still require a full Obsidian restart.

## Stack

TypeScript (strict) · Svelte 4 · esbuild · `esbuild-svelte` · `svelte-preprocess`.

## Docs

- `CLAUDE.md` — orientation for contributors and Claude Code sessions
- `PRODUCT.md` — product purpose, principles, brand
- `docs/roadmap.md` — post-MVP backlog
- `docs/design/` — design system reference

## License

MIT.
