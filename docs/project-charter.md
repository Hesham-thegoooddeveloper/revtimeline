# Project charter

**Name:** RevTimeline (formerly TrackFlow), at revtimeline.tech. **Date:** 3 October 2026. **Stage:** core-concept validation through an interactive prototype.

## Problem and objective

A project manager needs to reconstruct everything that happened to a task across weeks or months, including related requests, parallel activity, time gaps and changes to expected dates. A task status alone cannot explain this history.

Build a simple visual workspace in which one continuous task contains a chronological graph of events. Start with personal use on one computer, validate usefulness, and consider a multi-user subscription product later.

## Scope and success

The first usable personal version should support projects, tasks, events, branches, merges, trustworthy dates, navigation and recoverable saving. The current prototype demonstrates the interactions, but dependable backup and restore are still a milestone before relying on it for important history.

Proposed measures: time to record an event, time to reconstruct a task history, confusing interactions, date errors, and successful record recovery. Targets and observed results are not yet established. Do not claim commercial success or reduced project delays without evidence.

## Milestones

| Milestone | Deliverable | Current status |
|---|---|---|
| Discovery | Task-history model and interaction requirements | Completed for initial prototype |
| Prototype | Working timelines, branches, dates and navigation | Iteration 02 deployed |
| Core refinement | Latest owner feedback and approved project overview | Overview started; other approved changes pending |
| Personal MVP | Refined interaction, backup/restore and dependable saving | Backup/restore and safer saving implemented |
| Personal validation | Real usage evidence and lessons learned | Pending |
| Productization decision | External validation, architecture and operating costs | Later |
| Subscription product | Accounts, shared projects, permissions and billing | Later |

Use milestones rather than promising fixed completion dates before the remaining scope is estimated.

## Risks and dependencies

Dense timelines may be hard to read. Automatic shifts can surprise the user. Browser-local records can be lost. Branches may eventually need more nuanced scheduling. Calendar gaps measure elapsed time, not responsibility or work effort.

Mitigate through clear inspection, preserved original dates, atomic rejection of invalid changes, usability review, and recovery testing. Dependencies include owner feedback, representative task histories and an authenticated GitHub connection for repository publication.

## Case study

Retain the problem statement, discovery handoff, concept art, decisions, source history, test results, owner feedback and measurable usage outcomes. Use fictitious or explicitly permitted project data in published examples.
