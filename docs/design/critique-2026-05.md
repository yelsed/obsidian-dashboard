# Design critique — 2026-05

A read-through of the dashboard UI after the widget set grew (recent files, daily tasks, tags,
graph, pinned projects, Jira, Procrast, Claude sessions). The terminal aesthetic is coherent and the
token system is sound, but the component layer has drifted: the same visual job is solved a slightly
different way in each widget. This file records the findings and the agreed direction so the rollout
has a checklist.

## Direction: "Sharpen the terminal"

Keep the monospace / brutalist / square-corner / hairline look. Push it, don't replace it:

- **Section headers** become full-width rules — the heading text sits on a bar that bleeds to the
  panel edges (`RECENT FILES ──────────`). Heading colour goes to `text-primary` (was `text-muted`).
- **Stronger hover / active contrast** in rows.
- **Sharper hierarchy** — the brightest thing in a panel is its title and its freshest/active row.
- **Stay monochrome.** Cyan is reserved for *interactive / link* affordances, not decoration.

This direction is delivered through one shared primitive, `src/ui/widgets/WidgetPanel.svelte`, which
also carries the new collapse behaviour.

## Findings (the audit)

1. **Dead `tokens.css`.** `src/ui/tokens.css` claimed to be the single source of truth but was
   imported nowhere — the live tokens are in `styles.css` (auto-loaded by Obsidian). The two had
   drifted (e.g. `space-row` 4px vs 8px). **Resolved:** `tokens.css` deleted; `styles.css` is the
   source of truth; per-component styles stay in each `.svelte` scoped block.

2. **No shared panel-header primitive.** Every widget hand-rolled
   `<section class="vault-dashboard-panel"><h2 class="vault-dashboard-panel-heading">`. **Resolved
   for the pilot:** `WidgetPanel.svelte` owns the section + sharpened header + collapse. Rollout: move
   the other widgets onto it (Jira/Procrast pass their refresh button through the `header-actions`
   slot).

3. **No shared button / row / empty / loading primitives.** Buttons come in three flavours
   (transparent, filled-secondary, bordered) with slightly different transitions; loading skeletons
   differ per widget (row counts and heights); grid column templates are ad hoc per widget. *Rollout:*
   extract a shared button + row + skeleton, or at least one documented pattern each.

4. **Cyan is overloaded.** It marks the most-recent file, every hover, the active tab brackets,
   project-origin badges, and session slugs — so "freshest" and "clickable" look identical. *Rollout:*
   keep cyan for interactive/link only; give "most-recent / active" a non-cyan treatment
   (weight + `text-primary`, already most of the way there).

5. **Empty-state voice varies.** "...yet." vs "Clean." vs "not yet indexed for this tab's scope."
   *Rollout:* one terse, consistent voice.

## Pilot (this pass)

Recent Files is converted to `WidgetPanel`: sharpened full-width header, click-to-collapse, and a
small row sharpen (freshest row's timestamp reads one step stronger). Collapse state persists
per-tab; a tab-bar control collapses/expands all widgets at once.

## Rollout checklist

- [x] DailyTasks → WidgetPanel
- [x] TagFolderStats → WidgetPanel
- [x] GraphInsights → WidgetPanel
- [x] PinnedProjects → WidgetPanel
- [x] JiraIssues → WidgetPanel (refresh button via `header-actions`)
- [x] ProcrastIdeas → WidgetPanel (refresh button via `header-actions`)
- [x] ClaudeSessions → WidgetPanel
- [ ] Extract shared button / row / empty / loading primitives (finding 3)
- [ ] Disambiguate cyan (finding 4)
- [ ] Unify empty-state voice (finding 5)

Every widget now shares the sharpened header + collapse. The remaining three items
(shared button/row/empty/loading primitives, cyan disambiguation, empty-state voice) are the
deeper consistency work — separate follow-up, not blocking.
