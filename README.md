# Vault Dashboard

An Obsidian plugin that renders a "super overview" of the vault in a workspace pane: recently edited notes, open tasks, tag/folder stats, graph insights (orphans, hubs, broken links), and pinned project folders with a live Docker container indicator. Organised into tabs (default **Work** and **Private**), each with its own folder scope and widgets.

Pairs with [`ErickRyu/obsidian-claude-code`](https://github.com/ErickRyu/obsidian-claude-code): this plugin owns the dashboard surface, that plugin owns the AI terminal.

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
```

Symlink into a vault:

```bash
ln -s "$(pwd)" "<vault>/.obsidian/plugins/vault-dashboard"
```

Then enable **Vault Dashboard** in Obsidian → Community Plugins.

## Develop

```bash
npm run dev     # esbuild watch
npm run build   # production build + type-check
```

Reload after changes: command palette → "Reload app without saving", or toggle the plugin off/on. Manifest changes require a full Obsidian restart.

## Stack

TypeScript (strict) · Svelte 4 · esbuild · `esbuild-svelte` · `svelte-preprocess`.

## Docs

- `CLAUDE.md` — orientation for contributors and Claude Code sessions
- `PRODUCT.md` — product purpose, principles, brand
- `docs/roadmap.md` — post-MVP backlog
- `docs/design/` — design system reference
- `integrations/obsidian-claude-code-resume.patch` — patch enabling `--resume` and project-scoped Claude sessions in the companion terminal plugin

## License

MIT.
