# Roadmap — Vault Dashboard

This document tracks everything that is **not** in the MVP but is planned, considered, or explicitly out of scope. Read this before proposing a new feature — it is likely already triaged here.

The MVP itself lives in the original plan at `~/.claude/plans/plugin-marketplace-add-piped-dusk.md`.

---

## Post-MVP backlog

Features that are wanted, agreed on, and queued to ship after the MVP is stable.

### Claude Code integration

The plugin runs alongside the existing `ErickRyu/obsidian-claude-code` plugin, which provides a Claude Code terminal in the sidebar. The dashboard becomes much more useful once it can also drive that terminal.

- **Claude sessions widget per tab.** Each tab tracks the Claude conversations started from its surface (start time, label, working directory, source action). Clicking a session entry resumes it in the sidebar. Provides a per-tab "what was I working on" recall.
- **Stored shell commands per pinned project.** Each pinned project keeps a small list of named shell commands (for example, `npm run dev`, `git status`, `docker compose up`). Clicking a command sends it to the Claude Code terminal with the project folder as the working directory. The project card becomes a launcher.
- **"Start day" daily ritual per tab.** A single button on the tab header opens that tab's daily note, lists yesterday's incomplete tasks, and sends a configurable morning prompt to Claude with the tab's pinned projects supplied as context. One click, full warm-up.

**Inter-process communication layers to investigate**, in order of preference:

1. Direct API surface on the `obsidian-claude-code` plugin (preferred). Check whether it exposes a callable method or event to inject prompts into a session.
2. `app.commands.executeCommandById("obsidian-claude-code:<command>")` combined with clipboard injection and focus stealing.
3. Copy command to clipboard, show a toast that says "Press Cmd+V in the terminal". Acceptable but friction-heavy.

All features should work even at layer 3 — degrade gracefully if no API is exposed.

### Procrast integration

The user runs a separate CLI called `procrast` for capturing ideas. The dashboard should be aware of it but not threaded through every widget.

- **Procrast widget**, opt-in per tab, off by default. Shells `procrast list --json` and renders idea cards.
- **"Plan Here" flow.** Click on an idea card opens a modal with a folder picker (existing folders plus "New folder…"). On confirmation, the plugin creates the folder if needed, sends `/procrast:plan-idea <uuid>` to the Claude Code terminal with the chosen folder as the working directory, and records the idea-UUID-to-folder mapping in plugin data.
- **Folder badge for Procrast origin.** Folders created via the Plan Here flow display a "from Procrast idea" badge so the relationship is visible from the dashboard.

### Quick capture

- A single input at the top of the dashboard. Per-tab smart routing: each tab declares where captured text goes (daily note inbox, end of a specific file, a Procrast capture, etc.).
- A configurable keyboard shortcut focuses the input from anywhere in Obsidian.

### Obsidian CLI command registration

All user-facing actions register stable command IDs prefixed `vault-dashboard:` so the built-in Obsidian CLI surfaces them and Claude can drive the dashboard from the terminal:

```
vault-dashboard:open
vault-dashboard:open-tab           # arg: tab name
vault-dashboard:switch-tab         # arg: tab name
vault-dashboard:refresh
vault-dashboard:pin-project        # arg: folder path
vault-dashboard:unpin-project      # arg: folder path
vault-dashboard:capture            # arg: text body
vault-dashboard:start-day          # optional arg: tab name
vault-dashboard:run-project-command  # args: folder path, command label
vault-dashboard:plan-procrast-idea   # args: idea UUID, target folder path
```

This is the integration surface for `pablo-mano/Obsidian-CLI-skill` to drive everything end-to-end from a Claude Code session.

### Workspace layout setup

- A "Setup workspace" command opens the dashboard in the main pane and the Claude Code terminal in the right sidebar, then offers to save the result as the startup layout.

---

## Later — nice-to-have

Ideas that are interesting but not yet committed. Promote to backlog when you decide they earn the build time.

- **Activity timeline.** A chronological river at the bottom of each tab that interleaves file edits, Procrast captures, and Claude sessions. Vault-scale `git log`.
- **Project status auto-detect.** Active (edited within 7 days), cooling (within 30 days), cold (older). Cold projects collapse by default; clicking expands them and revives them in the recents list.
- **Saved smart filters per tab.** Persisted Dataview-style queries materialised as temporary widgets ("notes tagged #fivespark untouched 7d", "tasks due this week").
- **Idea cross-pollination.** When the Procrast widget is enabled on a tab, surface only ideas whose content matches the tab's pinned tags or folder names.
- **Mini-graph per tab scope.** A tab-scoped graph view instead of the global Obsidian graph. Smaller and more relevant.
- **Snippets and templates panel per tab.** Tab-scoped templates that drop into the tab's default folder. Drivable from the Obsidian CLI.
- **Per-tab MCP and skill loadout.** Switching tabs reconfigures the Claude Code environment (which MCP servers connect, which skills are active). Work tab = Procrast + Figma; Private tab = Procrast only.

---

## Out of scope

Explicitly will not be built unless the constraints change.

- **Mobile support.** The plugin is desktop-only because we rely on Node APIs (`child_process`) for Docker detection and Procrast CLI shell-outs. Obsidian Mobile has no Node runtime.
- **Time-travel slider.** Replaying the state of the vault on a previous day was an early creative idea but is too invasive to scope reliably.
- **Two-way command-center buttons** that run arbitrary shell scripts directly from the dashboard. Anything that runs a shell command should go through the Claude Code terminal so the user sees the output.
- **Publishing to the Obsidian community plugin registry.** This is a personal tool; the maintenance and review overhead of public distribution is not worth it right now.

---

## Decisions log

Short notes on choices that have already been made and shouldn't be re-litigated without a strong reason.

- **The terminal half of the original idea is delegated to `ErickRyu/obsidian-claude-code`.** We deliberately do not embed our own terminal — they ship xterm.js + node-pty with no Python bridge and have already solved Claude Code integration.
- **The "Work / Private" split is implemented as tabs, not a single toggle.** Each tab owns its scope folders, widgets, and pinned projects independently. The model also generalises beyond two tabs — you can add Learning, Side projects, etc.
- **The Procrast widget is opt-in per tab and off by default.** Procrast is part of the user's wider workflow, but it should not be omnipresent. Each tab decides whether it cares.
- **Design comes before widget implementation.** Phase 1 of the plan locks the design tokens and produces static mockups of every widget. Subsequent phases implement against the locked design.
- **All external integrations degrade silently.** If `docker` is missing, the Docker indicator hides itself. If `procrast` is missing, the Procrast widget shows an empty state. We never surface a stack trace to the user.
