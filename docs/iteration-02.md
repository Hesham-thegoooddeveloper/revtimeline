# Prototype iteration 02

3 October 2026. Scope: refine the core timeline concept before moving to personal production use.

## User decisions

The default overview has independent task timelines, each starting at its first event and fitting its full history. A shared calendar ruler is removed from the default. My calendar is an optional daily view of recorded events and active actions across projects.

The user selected two event types. Recorded events have an occurrence date and no due date. Actions have a trigger date, current due date, original due date retained for comparison, and actual completion date when done. Current due or actual completion positions an action on the single visible timeline. Recorded events are not rescheduled by automatic shifts.

## Implemented interaction changes

Insert controls at the midpoint of each connection insert an event into that connection. Separate small connection ports retain branch creation and merging. Full descriptions and applicable dates appear on hover or keyboard focus. Labels sit above the event line, with staggered label rows and node tracks at dense zoom levels.

Each task has zoom, fit and expand icons in its lower right corner. Expand opens a task workspace dialog without replacing the overview. Opening projects, committing changes, deleting, moving and undoing return task views to fit. Manual zoom is retained during navigation until a mutation or explicit fit.

Ctrl+Z or Cmd+Z undoes application changes outside text fields. Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y redo them. Native text undo remains available inside input fields. Undo history is session-local; project data remains saved under the prior browser storage key.

Moves and edits are validated on a trial copy. Invalid chronological ordering, same-path same-date collisions, and dates before action triggers leave all records unchanged. Simultaneous events can use parallel paths. Connections cannot create loops. Arrow reversal changes the displayed relationship direction without changing chronological dates or the structural ordering used to validate scheduling.

Blue and teal identify recorded events and actions. The overall design remains simple; final UI polish is deferred until the core concept is validated.

## Migration and verification

Existing locally saved unfinished events become actions using their prior planned date as trigger and original due date. Existing completed events become recorded events using their actual date. Previous fields are retained to avoid losing their original data. More precise historical classification can be changed in the editor.

Verified scenarios: sample record validity, original date retention, +2-day shifting, no double application of shifts, completed history staying fixed, invalid-order rollback including shifted records, same-path collision rollback, valid same-day branches, cycle rejection, and migration of old records. JavaScript syntax and static DOM references checked. Browser visual and end-to-end review remain a user-facing validation step.

## Next review

Try a customer-comments recorded event followed by an action to send revised drawings. Set a trigger and due date, complete it late, inspect the shifted upcoming actions, and undo the change. Check hover readability, insertion, popup navigation, and arrow direction.
