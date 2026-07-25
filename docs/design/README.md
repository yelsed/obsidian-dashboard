# Vault Dashboard — Design Reference

This document is the locked design reference produced in Phase 1. All Phase 2+
implementation must match what is shown here. Update this file (and the Svelte
mockup stubs in `src/ui/widgets/`) before changing any visual behaviour.

The visual direction is **Terminal aesthetic**: monospace typography, ANSI-flavoured
accents, square corners, hairline borders, no shadows. The dashboard is meant
to read as a single TUI surface when seen next to the Claude Code sidebar.

Design tokens live in the `.vault-dashboard { … }` custom-property block in
`styles.css` (Obsidian auto-loads it). Every component reads from those tokens;
no hardcoded colours, sizes, or font stacks.

---

## Overall layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [WORK] private  learning  +                                  ⚙  ↻    │   ← TabBar
├──────────────────────────────────────────────────────────────────────┤
│ ┌─ RECENT FILES ────────────┐ ┌─ DAILY NOTE + TASKS ───────────────┐ │
│ │ > Project plan      02:14 │ │ 2026-05-18 daily ·····  open ▾    │ │
│ │   Meeting notes     today │ │ [ ] Reply to client review        │ │
│ │   Roadmap rewrite   2d    │ │ [ ] Push staging build            │ │
│ │   Idea: ESP32       3d    │ │ [ ] Read incident postmortem      │ │
│ │                           │ │ 12 open tasks · 3 created today   │ │
│ └───────────────────────────┘ └────────────────────────────────────┘ │
│ ┌─ TAGS + FOLDERS ──────────┐ ┌─ GRAPH ────────────────────────────┐ │
│ │ #work     ████████   42  │ │ Orphans      7                     │ │
│ │ #ideas    █████      28  │ │ Hubs         daily/, MOC-*         │ │
│ │ #refs     ███        19  │ │ Broken links 3                     │ │
│ │ /fivespark           96  │ │ Most linked  README.md (24 in)     │ │
│ │ /yelsed              31  │ │                                    │ │
│ └───────────────────────────┘ └────────────────────────────────────┘ │
│ ┌─ PINNED PROJECTS ────────────────────────────────────────────────┐ │
│ │ /fivespark      [███ ] 3/4 up   ● 2h     ▸                       │ │
│ │ /yelsed         [    ] idle     ○ 1d     ▸                       │ │
│ │ /procrast-cli   [█   ] 1/2 up   ● 5h     ▸                       │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

- The tab bar pins to the top. Active tab is rendered in brackets with bold weight.
- The widget grid is a CSS grid, two columns on wide layouts, single column under ~720px.
- The "Pinned Projects" widget always spans the full width of the grid.

---

## Tab bar

States:

```
[WORK] private  learning  +                                  ⚙  ↻
```

```
work  [PRIVATE] learning  +                                  ⚙  ↻
```

```
work  private  learning  [NEW TAB ▢]                         ⚙  ↻
```

Rules:

- Active tab is wrapped in `[...]` brackets and uses `--vault-dashboard-text-primary`.
- Inactive tabs use `--vault-dashboard-text-secondary`.
- The `+` is the "add tab" affordance. The trailing `⚙` opens settings, `↻`
  forces a refresh of all widgets.
- Hovering a tab does not change the brackets — only the text colour shifts
  to `--vault-dashboard-text-primary`.

---

## Recent files widget

```
┌─ RECENT FILES ─────────────────────────────────┐
│ > Project plan                          02:14  │
│   Meeting notes                         today  │
│   Roadmap rewrite                       2d     │
│   Idea: ESP32 boards                    3d     │
│   Daily/2026-05-15                      3d     │
│                                                │
│ Showing 5 of 312 modified in 30d               │
└────────────────────────────────────────────────┘
```

- The leading `>` marks the most recently modified file. Highlight uses
  `--vault-dashboard-color-accent-cyan`.
- Timestamps are right-aligned, fixed-width, tabular numbers.
- The footer line is `--vault-dashboard-text-faint`, `--vault-dashboard-font-size-micro`.

**Empty state**

```
┌─ RECENT FILES ─────────────────────────────────┐
│                                                │
│ No files modified in this tab's scope yet.     │
│                                                │
└────────────────────────────────────────────────┘
```

**Loading state** — render five lines of `····` shimmer placeholders.

**Error state**

```
┌─ RECENT FILES ─────────────────────────────────┐
│ ! Could not read vault metadata.               │
│   Reload the plugin if this persists.          │
└────────────────────────────────────────────────┘
```

---

## Daily note + open tasks widget

```
┌─ DAILY NOTE + TASKS ─────────────────────────────┐
│ 2026-05-18 daily ·······························  │
│ [ ] Reply to client review            fivespark   │
│ [ ] Push staging build                fivespark   │
│ [ ] Read incident postmortem          learning    │
│ [ ] Refactor procrast list output     yelsed      │
│                                                   │
│ 12 open tasks · 3 created today                   │
└───────────────────────────────────────────────────┘
```

- The daily-note line links to the daily note for today. If today's daily note
  doesn't exist yet, the line reads `2026-05-18 daily ·····  create ▸`.
- Tasks are sorted by source-file modified time, most recent first.
- The folder name on the right uses `--vault-dashboard-text-secondary`.
- Up to five tasks display by default. The footer line shows the total.

**Empty state**

```
┌─ DAILY NOTE + TASKS ─────────────────────────────┐
│ 2026-05-18 daily ·····  create ▸                  │
│                                                   │
│ Nothing open in this tab's scope. Clean.          │
└───────────────────────────────────────────────────┘
```

---

## Tags + folders widget

```
┌─ TAGS + FOLDERS ───────────────────────────────┐
│ TAGS                                           │
│   #work          ████████        42            │
│   #ideas         █████           28            │
│   #refs          ███             19            │
│   #procrast      ██              11            │
│                                                │
│ FOLDERS                                        │
│   /fivespark                     96            │
│   /yelsed                        31            │
│   /learning                      14            │
│                                                │
│ 7 untagged notes ▸                             │
└────────────────────────────────────────────────┘
```

- Bar widths normalise to the top tag count. Bars use box-drawing characters
  rendered in monospace so they line up regardless of font size.
- The "untagged notes" line opens a list when clicked.

---

## Graph insights widget

```
┌─ GRAPH ────────────────────────────────────────┐
│ Orphans          7   ▸                         │
│ Hubs             daily/, MOC-*                 │
│ Broken links     3   ▸                         │
│ Most linked      README.md          (24 in)    │
│ Most linking     daily/2026-05-15   (18 out)   │
└────────────────────────────────────────────────┘
```

- "Orphans" and "Broken links" each expand into a list of files when clicked.
- Hub heuristic: notes with ≥10 incoming links from this tab's scope.

---

## Pinned projects widget and detail page

```
┌─ PINNED PROJECTS ─────────────────────────────────────────────────────────────┐
│ /fivespark      [███ ] 3/4 up  jira 12  ● 2h ago  7 notes  claude 1h  ▸     │
│ /yelsed         [    ] idle             ○ 1d ago  3 notes             ▸     │
│ /procrast-cli   [█   ] 1/2 up  jira 4   ● 5h ago  1 note   idea ab12  ▸     │
│ /learning       [    ] no docker        · 3d ago  9 notes             ▸     │
│                                                                              │
│ + Pin folder                                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

The overview is a compact full-width list: one row per pinned project, no
inline expansion and no per-project action buttons. Row columns, left to right:

1. **Display name or folder path**, with the folder path shown as secondary text
   when a custom display name exists.
2. **Docker container bar** — `[████]` segments where each filled cell is a
   running container, up to four. Beyond four, render `[████+]`.
3. **Docker count summary** — `3/4 up`, `idle` (no containers paired but Docker
   is reachable), `no docker` (Docker CLI not on `$PATH`).
4. **Jira open count**, only when Jira is configured for the project.
5. **Freshness glyph** — `●` (active <7d), `◐` (cooling <30d), `○` (cold ≥30d),
   plus the last modified relative timestamp.
6. **Markdown note count** inside the folder.
7. **Last Claude Code session age**, when a session was found for the folder.
8. **Origin badge**, when the project was pinned from Procrast.
9. **Detail affordance** — `detail ▸`; clicking anywhere on the row opens the
   page-level project detail view.

**Detail page**

```
← pinned projects

/fivespark
/Users/desleylangeveld/yelsed/fivespark

[███ ] 3/4 up   jira 12   ● 2h ago   7 notes   claude 1h

Project actions
Jira issues
Open tasks
Containers
Files
Last Claude sessions
Commands
```

The detail page is dashboard page state, not a modal. It replaces the widget
grid until the user activates `← pinned projects` or switches dashboard tabs.
It keeps the same square, hairline, monospace vocabulary as the rest of the
dashboard and reuses `--vault-dashboard-*` theme variables.

Section order is fixed: Project actions, Jira issues, Open tasks, Containers,
Files, Last Claude sessions, Commands.
The Files section renders markdown files as a collapsible folder tree. Folder
names expand and collapse their children; the separate `open` action opens that
folder with the system folder opener. File rows open the markdown file as before.
Open tasks are collected only from task-bearing markdown files such as
`GOALS.md`, `tasks.md`, `todo.md`, and their singular variants.

Jira issues render as sprint → epic → task → subtask hierarchy while preserving
Jira's returned rank order inside each group. Issues without a sprint go under
`No sprint`; issues without an epic go under `No epic`; subtasks whose parent
task is not in the fetched issue set go under `Subtasks without returned task`,
with the parent key shown when Jira supplied it.

**Empty state**

```
┌─ PINNED PROJECTS ──────────────────────────────┐
│                                                │
│ No pinned projects yet.                        │
│                                                │
│ + Pin folder                                   │
└────────────────────────────────────────────────┘
```

---

## Universal states

Every widget supports four states. Designs above show the data state.

- **Data**: rendered as illustrated above.
- **Loading**: shimmer placeholders that match the rough shape of the data state.
- **Empty**: a single short sentence explaining the absence, no apology.
- **Error**: a one-line message starting with `!`, followed by a recovery hint.

---

## Motion

- Hovering a clickable row shifts its text colour to `--vault-dashboard-text-primary` over `--vault-dashboard-motion-duration-instant`.
- Expanding a project card animates the height over `--vault-dashboard-motion-duration-quick` using `--vault-dashboard-motion-easing-snap`.
- Status dots do not pulse by default. The Docker indicator dot pulses gently
  (1s loop, 0.5→1.0 opacity) only while at least one container is `running`.
- No bounces, no scale animations, no fades on tab switch.

---

## Density

The dashboard ships in `comfortable` density. A `compact` mode is wired in
the tokens for future use (tighter row spacing). Both modes use the same
typography sizes — density only affects vertical padding inside panels.
