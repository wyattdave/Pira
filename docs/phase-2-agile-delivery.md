# Phase 2 — Agile Delivery

## Goal

Enable a development team to plan and track a sprint end to end while retaining the reliability and usability of Phase 1.

## Scope

- Backlog view for issues not assigned to an active/completed sprint.
- Prioritised ordering with persistent rank/order values and stable sorting.
- Create, edit, start, complete and cancel sprints.
- Sprint goal, start date, end date and lifecycle status.
- Add/remove issues from a sprint; reorder backlog and sprint issues.
- Story points on applicable issue types.
- Epic/parent-child navigation and filtering.
- Issue links: blocks, is blocked by, relates to, duplicates (with duplicate direction rules documented).
- Sprint board view.
- Sprint summary: completed vs incomplete issues, points completed and scope changes. Clearly label estimates as simple metrics, not a full Jira-equivalent burndown.
- Basic project dashboard with issue status counts, priority counts, overdue work and sprint progress.

## Domain rules

- A project may have multiple sprints but only one active sprint per board unless multi-active sprint behavior is deliberately supported.
- Sprint start/end dates are validated; end must not precede start.
- Only issues from the relevant project/board can be assigned to a sprint unless cross-project boards are explicitly implemented.
- Completing a sprint must not silently discard incomplete work. Offer explicit choices to move incomplete issues to backlog or a target sprint.
- A completed sprint is read-only for lifecycle dates and membership except for an administrator correction path.
- Story points are nullable and non-negative; define whether decimals are allowed (recommended: whole numbers in the first release).
- Parent-child relationships must not permit an issue to be its own parent or create cycles.
- Issue-link records must prevent duplicate directed relationships and invalid self-links.
- Ordering must be persisted in Dataverse and must be stable under concurrent edits. Do not rely on client array order.

## UX requirements

- Backlog has separate sections for backlog and each sprint.
- Drag-and-drop reordering has accessible keyboard alternatives.
- Sprint actions require confirmation when they affect multiple issues.
- Show sprint dates, goal, issue count and points summary.
- Make it obvious which issues are outside the sprint and which have no estimate.
- Epic views show child issue progress without fetching every field from unrelated projects.

## Implementation sequence

1. Review Phase 1 schema and add Sprint, ordering/rank fields and issue links.
2. Implement server-side sprint lifecycle operations and validations.
3. Implement backlog queries and persistent ordering.
4. Implement sprint planning and membership changes.
5. Implement sprint board and issue parent/link interactions.
6. Implement sprint summary and basic dashboard aggregates.
7. Add tests for sprint transitions, incomplete work handling, parent cycles and ordering conflicts.

## Acceptance criteria

- Users can create a sprint, add issues, start it and complete it.
- Completing a sprint requires an explicit destination for incomplete issues.
- Backlog and sprint ordering persists after refresh and is stable under concurrent edits.
- Invalid parent cycles and self-links are rejected server-side.
- Dashboard aggregates respect the current user's data access.
- Sprint metrics use documented definitions and do not silently count cancelled/deleted issues as completed.
- Paging and query filtering remain server-side.

## Codex deliverables

- Backlog, sprint planning, sprint board and summary views.
- Required Dataverse schema changes and server-side operations.
- Tests and a Phase 2 manual test guide.
- Migration/deployment notes for environments already running Phase 1.
