# Unreleased — Project overview

- Create and edit project name, scope, customer, currency, value excluding VAT, configurable VAT rate and payment terms.
- Show calculated VAT and total above existing task timelines. Unknown VAT remains blank; zero VAT is supported.
- Preserve saved projects and use existing undo/redo and browser saving.

# Change log

## Repository baseline — 3 October 2026

Prepared the current iteration 02 code for GitHub while preserving its existing Git history. Added project charter, requirements, approved pending decisions, regression checks and a contribution workflow. The live website was not changed by this baseline preparation.

## Prototype iteration 02 — 3 October 2026

- Independent fitted task timelines and editable task dialogs.
- Descriptions above paths and full hover/focus inspection.
- Midpoint insertion controls, arrows and displayed arrow reversal.
- Recorded-event/action distinction and trigger/due/completion fields.
- Automatic shifts with preserved original due dates.
- Atomic rejection of invalid chronology and same-path overlaps.
- Undo/redo and an optional daily calendar.
- Migration of prior locally saved data.

Source commits: `f006964` and `8fa2af8`. They are retained exactly as originally recorded.

## Initial prototype — 3 October 2026

Created project/task timelines, minimal event editing, branching, merging, zoom, pan, contextual inspection and browser-local saving.

Source commit: `44b80d0`.

