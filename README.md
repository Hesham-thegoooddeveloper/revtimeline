# TrackFlow

TrackFlow is a personal project-history application. Each project contains continuous tasks, and each task records what happened through a horizontal timeline with parallel branches and merges.

**Current stage:** interactive prototype, iteration 02. The deployed interface remains unchanged while this repository baseline is prepared. The commercial project overview and the latest interaction changes are approved for later implementation; they are not part of the working app yet.

## Working prototype

- Create projects, tasks, recorded events and actions.
- View each task from its own start, automatically fitted to its available width.
- Inspect full event details on hover and edit through a popup.
- Insert an event between connected events, create branches and merge paths.
- Track occurrence dates for recorded events and trigger, due and completion dates for actions.
- Preserve original due dates while shifting upcoming actions when dates change.
- Reject invalid chronology and same-path same-date overlaps without changing saved records.
- Zoom, fit, pan and open a task in a larger window.
- Undo and redo application changes within the current session.
- View recorded events and active actions through an optional daily calendar.

The app uses HTML, CSS and JavaScript modules, with SVG timelines and browser-local saving. There is no build step or backend. Sample data is fictitious. Clearing browser storage removes local records; the prototype is not yet a dependable archive for important project information.

## Run locally

From the repository root:

```sh
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. Use an HTTP server rather than opening the HTML directly, because the app loads JavaScript modules.

## Validate

Node.js 22 or newer can run the regression checks:

```sh
node --test tests/model.test.mjs
node --check dist/app.mjs
node --check dist/model.mjs
node --check dist/sample.mjs
```

These checks verify date and graph behavior. They do not replace a browser usability review.

## Project records

- [Project charter and milestones](docs/project-charter.md)
- [Current requirements and decisions](docs/requirements.md)
- [Approved pending changes](docs/backlog.md)
- [Change log](CHANGELOG.md)
- [Iteration 02 notes](docs/iteration-02.md)
- [Contribution and release workflow](CONTRIBUTING.md)
- [Original discovery handoff](docs/references/original-discovery-handoff.docx)
- [Original concept art](docs/references/project-alpha-concept.png)

The original handoff is a historical reference. Later decisions in the requirements and backlog supersede it where they differ.

## Source and deployment

`dist/` contains the served application source; it is intentionally tracked despite its directory name. `.openai/hosting.json` identifies the existing private hosted Site and contains no credentials. Keep the Site identity when continuing work on that same deployment.

Live prototype: https://trackflow-task-history.supersimpleengineeri.chatgpt.site

This baseline preserves the existing Git history. Future work should use descriptive commits and pull requests, with documentation updated alongside behavior changes. A GitHub commit alone does not mean the live Site has been republished.
