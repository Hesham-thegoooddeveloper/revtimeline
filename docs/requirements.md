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

The app opens on All tasks across projects, with the portfolio summary below. A project's status is derived from its actions: overdue when any open action is past its due date, on track when actions are open and none is overdue, and "no open actions" otherwise. "Due in the next 7 days" includes overdue actions. Contract value is summed per currency from each project's value excluding VAT.

The visual design is Drawing office by day and Night shift by night (approved 3 October 2026). Auto follows the device's light or dark setting. The interface is in English; text the user types in Arabic displays right to left. Amounts use Latin currency codes such as "SAR" and Western digits, and dates use the Gregorian calendar.

Each task starts at its own first event and opens fitted to its full history. A shared date ruler is not the default. Task zoom controls are local to each task. Mutations, undo and redo return the views to fit. A larger task workspace opens as a dialog and remains editable.

The workspace has an All tasks tab followed by one tab per project. Tasks within a project can be reordered. Activity points can be moved horizontally and vertically for presentation without changing their dates or connections; Tidy layout removes a task's manual offsets. The Hand tool pans horizontally within a task and vertically through the project page.

The new task field appears before the tab bar. A Find field filters tasks in the current tab by project, task and activity text, and reveals matching activities on project timelines. The field clears when changing tabs. Export Excel downloads the full current tab, independent of the Find filter: all projects from All tasks, or only the active project from a project tab. The workbook includes project details, tasks, activities, payment terms and connections with numeric amounts and dates.

When an event is added from an existing point, place it a readable distance after that point and reveal both in the task viewport, leaving space to the right. For example, adding an event one day after the last event should not push the new point against the viewport edge. This placement changes only the visual layout; the chosen date stays intact, and Tidy layout or Fit returns it to the date-based position.

A task can be added from the top of the workspace with an explicit project choice; new tasks appear first. The task row offers editing for its name and optional description. Reordering shows an insertion placeholder before the order is saved. Connection lines and their controls follow a point throughout a drag. Hovering a connection shows the day interval from the two activity dates; an unfinished action makes this a scheduled interval. Fit resets both zoom and manual point offsets to the automatic date-based view. The event form can be dragged by its heading and scrolled within the viewport.

Descriptions appear above the lines. Full details appear on hover and keyboard focus. Clicking opens an editor. Plus controls between nodes insert events; small node ports currently support adding, branching and merging. The latest request to remove most node-plus controls remains pending.

My calendar is an optional daily view across projects, showing recorded events and active or overdue actions. It is separate from the default timeline overview.

Ctrl+Z/Cmd+Z undo app changes; Ctrl+Shift+Z/Cmd+Shift+Z/Ctrl+Y redo them. Text fields retain native text undo. App undo history lasts for the current session.

## Project overview

Each project can hold optional commercial details: customer, scope of supply, currency, value excluding VAT, VAT rate and payment terms (milestone, percentage and condition). VAT and the total including VAT are calculated automatically, rounded to two decimals, and only once a VAT rate has been entered; no rate is assumed. Payment terms may not exceed 100% in total; a lower total is allowed and flagged. Projects saved before this feature have no details and keep working unchanged. The other approved field groups remain in the backlog.

Project details, next actions and payment terms appear in a right information column on wide screens. On narrower screens they open in a right-side panel so the timeline retains its width.

## Persistence and limitations

Projects are saved under the existing browser storage key, with a schema version. Migration preserves existing records: prior unfinished events become actions; prior completed events become recorded events. The owner can refine classification in the editor.

Saved data that cannot be read is copied to a separate `.unreadable-` key and never overwritten; the app shows the sample project and offers the copy for download. Export writes all projects to a JSON backup file; import validates its structure and calendar dates, asks for confirmation, replaces all data and can be undone. When another tab saves, open tabs load that data and clear their session undo history.

## Accounts and syncing

Visitors land on a public page at revtimeline.tech. They can create an account with email and password (the address must be confirmed through an emailed link before signing in), sign in with Google or LinkedIn once those providers are switched on in Supabase, reset a forgotten password by email, or try the app without an account, which keeps projects in that browser only.

A signed-in person's projects are stored as one workspace in Supabase (supabase/schema.sql), protected by row-level security so only its owner can read or change it. Each device keeps a copy so the app opens instantly and works offline; changes upload in the background. A save names the version it was based on, and the server refuses it if another device saved since. In that case the latest saved version is shown and this device's version is kept, including after a reload, so the person can choose either one or download it. Other open devices load new saves within seconds. On first sign-in, the person chooses to upload the projects from that browser, start with an empty project, or start with the example project. Signing out removes the current device's copy and session without ending sessions on other devices; it is refused while changes have not yet reached the account or a conflict remains unresolved.

There is no shared team workspace, subscription billing or sign-in by username yet: accounts sign in by email. Dates use calendar-day precision. Automated browser end-to-end checks in CI and final visual refinement remain work items.
