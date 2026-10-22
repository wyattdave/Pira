# Phase 1 — Foundation and Issue Tracker

## Goal

Deliver a reliable first release in which a team can manage day-to-day work without a spreadsheet. Focus on projects, issues, issue details, comments, history, My Work and a basic Kanban board.

## Scope

### In scope

- Project list and project overview.
- Create/edit/archive projects with a unique project key (for example, `APP`).
- Project membership and project-level roles.
- Issue types: Task, Bug, Story, Epic. Epic may initially be a simple parent issue type; advanced epic UX belongs in Phase 2.
- Create, read and edit issues with summary, description, type, status, priority, assignee, reporter, labels, due date and parent issue.
- Server-generated issue key, e.g. `APP-123`.
- Issue detail view/panel with comments and activity history.
- Basic Kanban board with configured columns, cards, quick status change and filters for assignee, priority, type and label.
- My Work view for assigned-to-me, reported-by-me, overdue and recently updated issues.
- Search by issue key and summary; server-side paging.
- Friendly loading, empty, validation, permission and error states.
- Responsive layout suitable for common desktop and tablet widths.

### Explicitly out of scope

- Sprints, sprint burndown, advanced backlog planning.
- Arbitrary workflow designer or arbitrary custom fields.
- JQL compatibility, automation rule builder, time tracking and release management.
- Jira import, Jira API compatibility or Marketplace integrations.
- Complex cross-project portfolio views.

## Proposed screens

1. **App shell** — project switcher, navigation, current-user menu.
2. **My Work** — tabs or saved views for Assigned to me, Reported by me, Overdue and Recently updated.
3. **Projects** — searchable project list and create-project flow.
4. **Project overview** — project metadata, members, issue counts and board entry point.
5. **Board** — columns and cards, filter bar, create issue action.
6. **Issue details** — editable fields, comments, history and linked parent.
7. **Project settings** — project key/name/lead, membership and basic board column mapping.

## Data model dependencies

Use the baseline schema in `dataverse-schema-erd.md`. Phase 1 requires at minimum:

- Project
- Project Member
- Issue
- Board and Board Column (or one documented default board configuration if a board table is deferred)
- Issue Comment
- Issue History

Do not store multiple labels as an unstructured comma-separated field if a normalized label table is practical. If labels are implemented as a multi-select choice initially, document the trade-off and ensure filtering works.

## Domain rules

- Project keys are unique, uppercase, 2–10 characters, and immutable after issues exist unless a controlled migration feature is explicitly implemented.
- Issue keys are unique and immutable once assigned. Use Dataverse GUID as the internal identity.
- Every issue belongs to exactly one project.
- New issues start in the project's configured initial status.
- A user can see and edit only records allowed by Dataverse privileges and project access policy.
- Reporter defaults to the current authenticated user, but is not trusted if supplied by a client.
- Status changes must go through the domain/service operation that validates the transition and records history.
- Soft archive projects rather than deleting projects with issues.
- Deleting comments or issues must follow a documented retention policy; prefer deactivation/archive for issues.

## UX requirements

- Create issue should be available from the project and board contexts and retain the current project.
- Use optimistic updates only where rollback and conflict handling are implemented.
- Board cards show issue key, summary, type, priority and assignee.
- Keyboard navigation and accessible labels must be supported; drag-and-drop must have a non-drag alternative for changing status/order.
- Show the issue key prominently with a copy action.
- Avoid loading all issues into the browser. Apply filters and paging at the data source.
- Do not fetch every comment/history row for every card; fetch details when an issue is opened.

## Implementation sequence

1. Inspect repo, Code App bootstrap, Dataverse connection/data access and current conventions.
2. Define typed domain models and a data-access abstraction.
3. Add/validate Dataverse schema and solution components.
4. Implement project listing and project creation.
5. Implement membership checks and issue create/update/read.
6. Implement server-side issue-key allocation and history creation.
7. Implement issue details, comments and history timeline.
8. Implement board query, cards, status transition and filtering.
9. Implement My Work and search.
10. Add tests, accessibility pass, performance checks and deployment notes.

## Acceptance criteria

- A permitted user can create a project, add members and create an issue.
- Two concurrent issue creations in one project never receive the same key.
- An issue's key remains unchanged after edits.
- A status change validates the configured transition and creates a history event.
- A user without project access cannot retrieve project data through direct API requests, not merely through hidden UI.
- Board filtering and paging happen server-side; no unbounded issue query is used.
- Comment creation and issue edits show the correct author and timestamps.
- Failed saves show an actionable error and do not leave the UI falsely showing a persisted change.
- Automated tests cover key allocation, transition validation, project membership and permission-denied cases.

## Codex deliverables

- Working Phase 1 UI and data-access code.
- Dataverse solution components or a precise schema creation checklist if metadata generation is outside the repo's workflow.
- Unit/integration tests where supported.
- `docs/phase-1-manual-test.md` with setup, test identities and end-to-end steps.
- Updated README with local run/build/deploy instructions and known limitations.
