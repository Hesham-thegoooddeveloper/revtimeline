# Working on RevTimeline

## Current hold

Do not implement the changes in `docs/backlog.md` until the owner authorizes them. Repository preparation and documentation work are allowed. The owner authorized the first part of the project overview and the data-safety work on 3 October 2026; those changes are in the repository, but the live website remains at iteration 02 until it is republished.

## Change workflow

1. Describe the requested behavior and acceptance example in an issue or backlog item.
2. Create a short-lived branch such as `feature/project-details` or `fix/hover-delay`.
3. Implement one coherent change, preserving locally saved project records.
4. Run the formatting, regression and syntax checks listed in the README. Manually inspect affected browser interactions. When fixing a defect covered by a `todo` test, remove its `todo` option so it becomes a normal regression check.
5. Update the requirements, backlog and change log to match what actually shipped.
6. Open a pull request describing the problem, resulting behavior, checks and relevant limitations.
7. Merge only when the owner authorizes that implementation. Record a milestone tag when appropriate.
8. Publish the approved source to the existing Site through its deployment workflow, and verify deployment success before reporting the live result.

Do not commit tokens, credentials, local browser exports containing real project data, or unrelated files. Keep fictitious test data separate from actual projects. A commit or pull request does not itself prove deployment or usability.

## Versioning

Use prototype milestone tags such as `v0.2.0-prototype` for identifiable code states. Keep unimplemented approved decisions in the backlog, not in the list of working features.
