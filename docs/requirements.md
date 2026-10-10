# Requirements and decisions

This document describes the implemented prototype. Approved changes that are not implemented are tracked in [the backlog](backlog.md).

## Product model

Project → continuous task → events and connections. Submission, feedback and revision are events, not mandatory subtasks. Branches remain in the same task and can reconnect.

- Recorded event: something happened; it has an occurrence date and no due date.
- Action: something needs doing; it has a trigger date, an optional current target date, an original target date when one has been set, and an actual completion date when done.
- One visible timeline: recorded events use occurrence date, unfinished actions use their target date or trigger date when no target is set, and completed actions use actual completion date.

## Date entry and validation

A date edit changes only the selected activity. Its original target date remains recorded, and all other activities keep their dates. Connections describe relationships independently of dates.

Dates must be real Gregorian calendar dates. Connected activities may have dates in any order, including the same day; action target and completion dates may also differ in either direction from the trigger. Actions without a target date stay open but are not overdue or due soon. Reject only missing or invalid dates, without changing other records.

Connections cannot form loops. Reversing a displayed arrow changes relationship direction without changing dates.

## Current experience

The app opens on All tasks across projects, with a right information panel showing the total number of projects, contract value excluding VAT grouped by currency, open and overdue action counts, and the next open actions. A project's status is derived from its actions: overdue when any open action is past its due date, on track when actions are open and none is overdue, and "no open actions" otherwise. The project list remains below the task cards.

The visual design is Drawing office by day and Night shift by night (approved 3 October 2026). Auto follows the device's light or dark setting. The interface is in English; text the user types in Arabic displays right to left. Amounts use Latin currency codes such as "SAR" and Western digits, and dates use the Gregorian calendar.

Each task starts at its own first event with readable date spacing; longer histories scroll horizontally. A shared date ruler is not the default. Task zoom controls are local to each task. Mutations, undo and redo return the views to the normal readable density. A larger task workspace opens as a dialog and remains editable.

The workspace has an All tasks tab followed by one tab per project. Tasks within a project can be reordered. Activity points can be moved horizontally and vertically for presentation without changing their dates or connections; Tidy layout removes a task's manual offsets. The Hand tool pans horizontally within a task and vertically through the project page.

Activities on the same path may share a calendar day. Automatic layout stacks them vertically in connection order, with a newly connected same-day activity below its predecessor. Tidy layout restores readable date spacing and scrolls longer histories. Fit clears manual offsets and compresses every date column into the task's horizontal viewport. At dense fit levels, the points and connections remain compact while an activity index below the timeline shows every name and date; selecting an entry opens that activity for editing. The index is available in the larger task dialog and on narrow screens. Neither Tidy nor Fit changes dates. Zoom controls let the user change density without changing dates.

The new task field appears before the tab bar. A Find field filters tasks in the current tab by project, task and activity text, and reveals matching activities on project timelines. The field clears when changing tabs. Export Excel downloads the full current tab, independent of the Find filter: all projects from All tasks, or only the active project from a project tab. The workbook includes project details, tasks, activities, payment terms and connections with numeric amounts and dates.

When an event is added from an existing point, place it a readable distance after that point and reveal both in the task viewport, leaving space to the right. For example, adding an event one day after the last event should not push the new point against the viewport edge. This placement changes only the visual layout; the chosen date stays intact, and Tidy layout or Fit returns it to the date-based position.

A task can be added from the top of the workspace with an explicit project choice; new tasks appear first. The task row offers editing for its name and optional description. Reordering shows an insertion placeholder before the order is saved. Connection lines and their controls follow a point throughout a drag. Hovering a connection shows the day interval from the two activity dates; an unfinished action makes this a scheduled interval. Fit resets both zoom and manual point offsets to the automatic date-based view. The event form can be dragged by its heading and scrolled within the viewport.

Descriptions appear above the lines. Full details appear on hover and keyboard focus. Clicking opens an editor. Plus controls between nodes insert events; small node ports currently support adding, branching and merging. The latest request to remove most node-plus controls remains pending.

The event editor identifies its project and task, uses visual cards for recorded events and actions, and has a collapsible How dates work explanation. It opens near the top of the viewport, scrolls inside itself, and can still be dragged. Activity dates use a consistent in-app month picker or typed `YYYY-MM-DD` values. A + handle to the left of each activity opens Add before, defaulting to one day before the selected activity. Saving inserts it before that activity in the connection graph without changing existing dates. A task-level Add several flow can collect recorded events and actions, including untargeted actions, and save all of them in one atomic operation. By default, the new activities connect by their dates around the selected activity; the user can choose entered-order connections instead, regardless of dates. A connection dialog lets the user reverse or delete a connection; the right point handle can create a replacement connection.

My calendar is an optional month view across projects, with activity markers, month navigation, a date picker and selected-day details. Selecting an activity opens it in its project. It is separate from the default timeline overview.

Ctrl+Z/Cmd+Z undo app changes; Ctrl+Shift+Z/Cmd+Shift+Z/Ctrl+Y redo them. Text fields retain native text undo. App undo history lasts for the current session.

## Project overview

Each project can hold optional commercial details: project number, customer, contractor, scope of supply, currency, value excluding VAT, VAT rate and payment terms (milestone, percentage and condition). VAT and the total including VAT are calculated automatically, rounded to two decimals, and only once a VAT rate has been entered; no rate is assumed. Payment terms may not exceed 100% in total; a lower total is allowed and flagged. Projects saved before this feature keep working unchanged, and missing fields display as "Not set". The other approved field groups remain in the backlog.

The old left rail has been removed; calendar, colour mode and account controls appear in a compact header. Project details, payment terms and next actions appear in a right information column on wide screens. On narrower screens, project and portfolio information open in right-side drawers so the timeline retains its width.

## Persistence and limitations

Projects are saved under the existing browser storage key, with a schema version. Migration preserves existing records: prior unfinished events become actions; prior completed events become recorded events. The owner can refine classification in the editor.

Saved data that cannot be read is copied to a separate `.unreadable-` key and never overwritten; the app shows the sample project and offers the copy for download. Export writes all projects to a JSON backup file; import validates its structure and calendar dates, asks for confirmation, replaces all data and can be undone. When another tab saves, open tabs load that data and clear their session undo history.

## Accounts and syncing

Visitors land on a public page at revtimeline.tech. They can create an account with email and password (the address must be confirmed through an emailed link before signing in), sign in with Google or LinkedIn once those providers are switched on in Supabase, reset a forgotten password by email, or try the app without an account, which keeps projects in that browser only.

A signed-in person's projects are stored as one workspace in Supabase (supabase/schema.sql), protected by row-level security so only its owner can read or change it. Each device keeps a copy so the app opens instantly and works offline; changes upload in the background. A save names the version it was based on, and the server refuses it if another device saved since. In that case the latest saved version is shown and this device's version is kept, including after a reload, so the person can choose either one or download it. Other open devices load new saves within seconds. On first sign-in, the person chooses to upload the projects from that browser, start with an empty project, or start with the example project. Signing out removes the current device's copy and session without ending sessions on other devices; it is refused while changes have not yet reached the account or a conflict remains unresolved.

There is no shared team workspace, subscription billing or sign-in by username yet: accounts sign in by email. Dates use calendar-day precision. Automated browser end-to-end checks in CI and final visual refinement remain work items.
