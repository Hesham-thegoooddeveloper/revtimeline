# RevTimeline

RevTimeline (formerly TrackFlow) is a project-history application. Every revision, every approval, in order. Each project contains continuous tasks, and each task records what happened through a horizontal timeline with parallel branches and merges.

**Current stage:** interactive prototype, iteration 02 plus the first part of the commercial project overview, accounts and data-safety work (see the [change log](CHANGELOG.md)). GitHub Pages published the current `main` branch on 4 October 2026. The remaining project-information fields are planned for later implementation.

## Working prototype

- Sign in with an email account (Google and LinkedIn once enabled) to keep the same projects on every device, or try it without an account in one browser. Accounts use Supabase; see supabase/schema.sql.
- Start on an All tasks tab with tasks across projects, followed by a tab for each project. The portfolio summary below shows status, next action, history, value excluding VAT, and actions due in the next 7 days.
- Work in a project workspace with a commercial title block, full-width task timelines, next actions and payment terms.
- Switch between day and night modes, or follow the device setting.
- Type in Arabic anywhere: names, descriptions and events display right to left. The interface itself is in English.
- Create projects, tasks, recorded events and actions.
- Edit a project overview: name, scope, customer, currency, value excluding VAT, VAT rate, automatically calculated VAT and total, and payment terms.
- Export all projects to a backup file and import one back, with validation and undo.
- Keep a safety copy of saved data that cannot be read, instead of overwriting it.
- Keep several open tabs in sync with each other.
- View each task from its own start, automatically fitted to its available width.
- Reorder tasks within a project by dragging their handles or using the up and down buttons.
- Drag activity points freely on a task timeline without changing their dates; use Tidy layout to reset that task's points to their date-based positions.
- Inspect full event details on hover and edit through a popup.
- Insert an event between connected events, create branches and merge paths.
- Track occurrence dates for recorded events and trigger, due and completion dates for actions.
- Preserve original due dates while shifting upcoming actions when dates change.
- Reject invalid chronology and same-path same-date overlaps without changing saved records.
- Zoom, fit, pan horizontally within a task and vertically through a project, or open a task in a larger window.
- Undo and redo application changes within the current session.
- View recorded events and active actions through an optional daily calendar.

The app uses HTML, CSS and JavaScript modules, with SVG timelines and browser-local saving for guests or Supabase sync for signed-in accounts. There is no build step. Fonts (Archivo, IBM Plex Sans, IBM Plex Sans Arabic and IBM Plex Mono) are bundled in `dist/fonts` under the SIL Open Font License. Sample data is fictitious. Clearing browser storage removes guest records, so export a backup regularly; the prototype is not yet a dependable archive for important project information. Tasks cannot yet be renamed, and projects and tasks cannot yet be deleted.

## Run locally

From the repository root:

```sh
python3 -m http.server 8080 --directory dist
```

On Windows the command is usually `python` or `py` instead of `python3`. Open `http://localhost:8080`. Use an HTTP server rather than opening the HTML directly, because the app loads JavaScript modules.

## Validate

Node.js 22 or newer can run the regression checks:

```sh
node --test tests/*.test.mjs
for f in dist/*.mjs; do node --check "$f"; done
```

These checks verify date and graph behavior. They do not replace a browser usability review. Tests marked `todo` describe known defects awaiting an authorized fix; they are reported but do not fail the run.

Source files use Prettier formatting, which CI also checks:

```sh
npx prettier@3.9.9 --check "dist/*.mjs" dist/style.css "tests/*.mjs"
```

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

`dist/` contains the served application source; it is intentionally tracked despite its directory name.

The site is published with GitHub Pages at https://revtimeline.tech. The `Publish site` workflow (`.github/workflows/pages.yml`) runs the checks and publishes `dist/` whenever `main` changes; work on other branches is not published. The domain is registered at Hostinger, whose DNS points it to GitHub Pages.

The earlier prototype, under the TrackFlow name, remains at https://trackflow-task-history.supersimpleengineeri.chatgpt.site (configured by `.openai/hosting.json`, which contains no credentials).

The repository starts from the browser upload of the baseline; earlier commits mentioned in the change log were not uploaded. Future work should use descriptive commits and pull requests, with documentation updated alongside behavior changes. A change is live only after it is merged into `main` and the Publish site workflow succeeds.
