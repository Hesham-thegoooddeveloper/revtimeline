# Requirements and decisions

This document describes the implemented prototype. Approved changes that are not implemented are tracked in [the backlog](backlog.md).

## Product model

Project → continuous task → events and connections. Submission, feedback and revision are events, not mandatory subtasks. Branches remain in the same task and can reconnect.

- Recorded event: something happened; it has an occurrence date and no due date.
- Action: something needs doing; it has a trigger date, current due date, original due date and actual completion date when done.
- One visible timeline: recorded events use occurrence date, unfinished actions use current due date, and completed actions use actual completion date.

## Date shifts and validation

A visible-date change is measured against the previous visible date, not the original plan. Later unfinished actions in the same task shift by that exact difference, including upcoming actions on branches. Original due dates and other completed records remain unchanged. Description-only edits cause no shift.

Apply changes on a trial copy. Reject the entire operation if it produces invalid chronology, a same-path same-date collision, or an action due/completion date before its trigger. Parallel paths can contain events on the same date. Do not silently repair history or partially apply a rejected shift.

Connections cannot form loops. Reversing a displayed arrow changes relationship direction without changing dates or the structural order used in chronology validation.

## Current experience

Each task starts at its own first event and opens fitted to its full history. A shared date ruler is not the default. Task zoom controls are local to each task. Mutations, undo and redo return the views to fit. A larger task workspace opens as a dialog and remains editable.

Descriptions appear above the lines. Full details appear on hover and keyboard focus. Clicking opens an editor. Plus controls between nodes insert events; small node ports currently support adding, branching and merging. The latest request to remove most node-plus controls remains pending.

My calendar is an optional daily view across projects, showing recorded events and active or overdue actions. It is separate from the default timeline overview.

Ctrl+Z/Cmd+Z undo app changes; Ctrl+Shift+Z/Cmd+Shift+Z/Ctrl+Y redo them. Text fields retain native text undo. App undo history lasts for the current session.

## Project overview

Each project can hold optional commercial details shown above the task timelines: customer, scope of supply, currency, value excluding VAT, VAT rate and payment terms (milestone, percentage and condition). VAT and the total including VAT are calculated automatically, rounded to two decimals, and only once a VAT rate has been entered; no rate is assumed. Payment terms may not exceed 100% in total; a lower total is allowed and flagged. Projects saved before this feature have no details and keep working unchanged. The other approved field groups remain in the backlog.

## Persistence and limitations

Projects are saved under the existing browser storage key, with a schema version. Migration preserves existing records: prior unfinished events become actions; prior completed events become recorded events. The owner can refine classification in the editor.

Saved data that cannot be read is copied to a separate `.unreadable-` key and never overwritten; the app shows the sample project and offers the copy for download. Export writes all projects to a JSON backup file; import validates the file, asks for confirmation, replaces all data and can be undone. When another tab saves, open tabs load that data and clear their session undo history.

The current personal prototype has no shared account system, backend database, subscription billing or cross-device synchronization. Dates use calendar-day precision. Automated browser end-to-end checks in CI and final visual refinement remain work items.
