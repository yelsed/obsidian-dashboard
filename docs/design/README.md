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

## Pinned projects widget (with Docker indicator)

```
┌─ PINNED PROJECTS ───────────────────────────────────────────────────┐
│ /fivespark        [███ ] 3/4 up    ●  2h ago    7 notes   ▸         │
│ /yelsed           [    ] idle      ○  1d ago    3 notes   ▸         │
│ /procrast-cli     [█   ] 1/2 up    ●  5h ago    1 note    ▸         │
│ /learning         [    ] no docker ·  3d ago    9 notes   ▸         │
│                                                                     │
│ + Pin folder                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

Per project card, left to right:

1. **Folder path**, rendered with leading slash.
2. **Docker container bar** — `[████]` segments where each filled cell is a
   running container, up to four. Beyond four, render `[████+]`.
3. **Docker count summary** — `3/4 up`, `idle` (no containers paired but Docker
   is reachable), `no docker` (Docker CLI not on `$PATH`).
4. **Freshness dot** — `●` (active <7d, green), `◐` (cooling <30d, yellow),
   `○` (cold ≥30d, faint).
5. **Last modified relative timestamp**.
6. **Markdown-file count inside the folder.**
7. **Expand chevron** — clicking expands inline.

**Expanded card**

```
│ /fivespark        [███ ] 3/4 up    ●  2h ago    7 notes   ▾         │
│   Containers                                                        │
│     ● fivespark-api          up 2h    :8080  →                      │
│     ● fivespark-worker       up 2h            →                     │
│     ● fivespark-db           up 2h    :5432  →                      │
│     ○ fivespark-storybook    stopped         →                      │
│   Files                                                             │
│     · README.md                                       2h            │
│     · docs/architecture.md                            today         │
│     · docs/release-notes.md                           today         │
│     ... 4 more                                                      │
```

- Container rows use the same status dot system as the project header.
- The `→` is a future affordance for "run a stored shell command in this
  container's working directory" — wired in the backlog phase, but the icon
  is reserved in the layout from MVP day one.
- File rows open the markdown file in the main editor when clicked.

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
