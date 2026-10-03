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

## Persistence and limitations

Projects are saved under the existing browser storage key. Migration preserves existing records: prior unfinished events become actions; prior completed events become recorded events. The owner can refine classification in the editor.

The current personal prototype has no shared account system, backend database, subscription billing or cross-device synchronization. Dates use calendar-day precision. Backup/restore, browser end-to-end verification and final visual refinement remain work items.


## Project overview

Projects can be created and edited with name, scope, customer, currency, value excluding VAT, configurable VAT rate and free-text payment terms. A compact summary appears above task timelines. Blank financial inputs mean unknown, while explicit zero values are supported. Calculations round to two decimal places; no VAT rate is assumed. Existing project descriptions become scope without rewriting task history. Structured payment milestones and the remaining commercial fields stay in the backlog.
