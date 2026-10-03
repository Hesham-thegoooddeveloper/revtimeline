# Change log

## New interface: Drawing office by day, Night shift by night — 3 October 2026

Authorized by the owner after reviewing the design proposal. Not yet published.

- New layout with a side menu, a Portfolio screen and a redesigned project workspace. Each screen has its own address (`#/portfolio`, `#/project/<id>`), so reloading keeps your place.
- Portfolio: project count, open and overdue actions, contract value per currency, a project table with status, next action and history, and the actions due in the next 7 days.
- Project workspace: a title block with customer, scope, value, VAT and total; full-width task timelines; clickable next actions with date shifts shown; and payment terms with a proportion bar.
- Day, night and auto modes. Auto follows the device setting; a chosen mode is remembered on the device.
- Text typed in Arabic displays right to left in titles, lists, previews and timeline labels. The interface stays in English and amounts stay as "SAR".
- Fonts are bundled with the app instead of relying on system fonts.
- Added portfolio summary functions with tests.


Authorized by the owner. Not yet published to the live Site.

- Added an editable project overview with project name, scope, customer, currency, value excluding VAT, configurable VAT rate, automatically calculated VAT and total, and payment terms. No VAT rate is assumed: VAT and total stay blank until a rate is entered. Payment terms cannot exceed 100% in total, and a note appears when they add up to less. Existing task timelines and saved data are preserved; projects without details show a prompt to add them. Project edits can be undone.
- Added Export backup and Import backup. Imports are validated (structure, references and safe IDs), confirmed before replacing data, and can be undone.
- Saved data that cannot be read is now kept as a separate copy and is never overwritten; a banner offers to download it. Previously the sample project silently replaced it.
- Open tabs now load each other's saved changes instead of overwriting them.
- Validation messages name the events involved.
- Summary cards now count recorded events, open actions and completed actions correctly, and the legend matches the timeline colours.
- Fixed a click being ignored after a drag released outside the timeline, undo shortcuts acting behind open dialogs, unexpected errors leaving partial changes, and item creation failing when the app is opened over plain HTTP from another device.
- Added a schema version to saved data, plus regression tests for the new behaviour. The trigger-date shift question (audit #4) remains open as a `todo` test.

## Audit maintenance — 3 October 2026

No behavior change. Reformatted the app, model, sample, styles and tests into readable source with Prettier (`.prettierrc.json`) and added a formatting check to CI. Removed CSS rules for elements that no longer exist (date ruler, task text buttons, focused rows, right toolbar). Added regression tests for backward shifts, event-type switches, repeatable migration and shift scope, plus `todo` tests for three known defects awaiting authorization: trigger dates not shifting, validation errors not naming the event, and malformed stored data failing at startup.

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
