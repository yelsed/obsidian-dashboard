# Product

## Register

product

## Users

Primary: a single developer-leaning Obsidian power user who lives in the vault daily and pairs notes with code. The user keeps a `Work` context and a `Private` context in the same vault and runs a sidebar Claude Code terminal (`ErickRyu/obsidian-claude-code`) next to the dashboard.

Secondary: a small group of like-minded power users — comfortable in a terminal, opinionated about typography and density, allergic to soft-SaaS dashboards. They would adopt this plugin if it shipped, but the design does not bend to make it discoverable to a casual Obsidian user.

The job to be done: open the dashboard once in the morning, get a vault-scale super-overview (recent files, open tasks, tag/folder stats, graph health, pinned project folders with live Docker status), and use it as the launch surface for the day's work. Tabs (`Work`, `Private`, …) scope every widget so the dashboard is the same surface in two different contexts.

## Product Purpose

A workspace pane inside Obsidian that renders a single super-overview of the vault. It is complementary to the sidebar Claude Code terminal — the dashboard owns context and observation, the terminal owns conversation and action. Together they form the user's morning ritual: glance at the dashboard, kick off the day from the terminal.

Success looks like: the user opens the dashboard each morning without thinking about it, gets a complete read of vault state in under five seconds, and uses the pinned-projects widget as the launch point for `npm run dev`, `docker compose up`, daily-note creation, and Claude sessions — all triggered through the existing Obsidian Command palette / Obsidian CLI / sidebar terminal, never re-implemented inside the plugin.

The dashboard is also Claude-Code-drivable: every user-facing command registers a stable `vault-dashboard:<id>` so `obsidian command run …` from a terminal session works end-to-end.

## Brand Personality

Three words: **terminal, expert, calm.**

- **Terminal** — monospace typography, box-drawing characters, ANSI-flavoured accents, hairline borders, square corners, no shadows. Reads as a single TUI surface when seen next to the Claude Code sidebar.
- **Expert** — assumes a power user. No tutorial copy, no onboarding hand-holding, no "Did you know?" tooltips. Empty states are short and a little dry ("Nothing open in this tab's scope. Clean.").
- **Calm** — almost no motion. Status dots do not pulse unless a Docker container is actively running. Tab switches do not fade. The dashboard's job is to be glanceable, not animated.

Voice: pragmatic, descriptive, no fluff. Identifiers in code are long and self-documenting; copy on screen is short and direct. Same rules apply to anything user-facing.

## Anti-references

The dashboard must not look or feel like:

- **Notion / Linear-style soft SaaS.** No rounded corners, no drop shadows, no pastel gradients, no decorative emoji in headings, no big-number hero metric tiles.
- **Generic "productivity dashboard" templates.** No identical-card grids of `BIG NUMBER / tiny label`, no gradient accent stripes on the left edge of cards, no "Welcome back, Desley 👋" greeting strips.
- **Grafana / Datadog-style heavy customization UIs.** No drag-to-resize, no theme builder, no widget gallery picker drawer. The dashboard is opinionated — tabs scope, widgets are fixed, density is one knob.
- **Cluttered Obsidian community plugins.** No mixed icon sets, no plugin-specific color theming that ignores the active Obsidian theme, no tightly-packed UI that looks bolted on. The dashboard inherits Obsidian's theme variables and behaves like a native ItemView.

## Design Principles

1. **TUI native, not TUI cosplay.** The dashboard is a real Svelte UI that happens to read like a terminal. Box characters and monospace are tools for alignment and density, not aesthetic decoration. Anything that does not earn its character cells gets cut.
2. **Tab is the unit of scope.** Every widget filters by the active tab's folder scope, every setting belongs to a tab, every command takes a tab name. The dashboard never reads "the whole vault" when a tab declares scope.
3. **The dashboard observes; the terminal acts.** No buttons that run shell scripts directly. Anything that executes goes through the Claude Code terminal so the user sees the output. The dashboard launches actions, it does not perform them.
4. **Inherit Obsidian theme, never override.** Every colour, background, border, and accent resolves through an Obsidian CSS variable (`--background-primary`, `--text-normal`, `--color-green`, `--interactive-accent`, etc.). The dashboard therefore tracks the user's active theme — stock light, stock dark, or any community theme — automatically and without a JS listener. No hardcoded hex values, no plugin-specific palette.
5. **External integrations degrade silently.** Docker missing → indicator hides. Procrast missing → widget shows an empty state. Claude terminal missing → fallback to clipboard with a one-line hint. Never a stack trace, never a red banner.
6. **Stability over surface area.** Stable command IDs prefixed `vault-dashboard:` are public contract. Settings schemas migrate forward. New tabs and widgets are additive; renames require migrations.

## Accessibility & Inclusion

Target: **WCAG 2.1 AA.**

- Contrast: all foreground/background pairs resolve through Obsidian theme variables (`--text-normal`, `--text-muted`, `--background-primary`, etc.), so contrast is whatever the active Obsidian theme provides. Stock light and dark themes already pass AA; third-party themes are the user's choice. Custom accents (status dots, freshness markers) are layered so they remain distinguishable on both light and dark themes.
- Keyboard: tab bar, widget headers, expandable rows, and pinned-project chevrons are all reachable via `Tab` / `Shift+Tab`, activated with `Enter` / `Space`. Focus rings use Obsidian's native focus styling, not a custom outline.
- Motion: the design is already low-motion. The only animation is the Docker container "running" pulse — gated behind `prefers-reduced-motion: reduce` so users who opt out never see it.
- Color-only signaling: every status dot is paired with a glyph (`●`, `◐`, `○`) or a word (`up`, `idle`, `no docker`) so the meaning survives without color.
- Screen reader: each widget panel is a `role="region"` with an `aria-labelledby` pointing at its uppercase heading. Status dots get `aria-label` text matching the glyph fallback.

This is the floor. Distribution is not the goal, so we do not chase AAA, but anything below AA is a bug.
