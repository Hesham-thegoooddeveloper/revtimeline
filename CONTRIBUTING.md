# Working on RevTimeline

## Current hold

Do not implement the remaining changes in `docs/backlog.md` until the owner authorizes them. Repository preparation and documentation work are allowed. The first part of the project overview, data-safety work, accounts and legal pages are on the published `main` branch. New changes remain unpublished until they are merged and the Pages workflow succeeds.

## Change workflow

1. Describe the requested behavior and acceptance example in an issue or backlog item.
2. Create a short-lived branch such as `feature/project-details` or `fix/hover-delay`.
3. Implement one coherent change, preserving locally saved project records.
4. Run the formatting, regression and syntax checks listed in the README. Manually inspect affected browser interactions. When fixing a defect covered by a `todo` test, remove its `todo` option so it becomes a normal regression check.
5. Update the requirements, backlog and change log to match what actually shipped.
6. Open a pull request describing the problem, resulting behavior, checks and relevant limitations.
7. Merge only when the owner authorizes that implementation. Record a milestone tag when appropriate.
8. Merge into `main` to publish: the Publish site workflow deploys to https://revtimeline.tech. Check that the workflow succeeded and the live site works before reporting the result.

Do not commit tokens, credentials, local browser exports containing real project data, or unrelated files. Keep fictitious test data separate from actual projects. A commit or pull request does not itself prove deployment or usability.

## Versioning

Use prototype milestone tags such as `v0.2.0-prototype` for identifiable code states. Keep unimplemented approved decisions in the backlog, not in the list of working features.
