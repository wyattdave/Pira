# Phase 3 — Team Productivity

## Goal

Make the app configurable and efficient for multiple teams without introducing a general-purpose enterprise workflow platform prematurely.

## Scope

- In-app notifications for assignment, mention, status change and comment activity where relevant.
- Optional Power Automate integration for email/Teams delivery; core issue operations must not depend on flow completion.
- Attachments with metadata, secure access and documented storage approach (Dataverse file columns or SharePoint).
- Bulk edit for selected issues, with a preview of affected records and per-record failure reporting.
- Configurable workflow statuses and allowed transitions per project or project template.
- Required-field rules on selected transitions, such as requiring a resolution before moving to Done.
- Saved filters with owner, scope and sharing model defined.
- Custom fields limited initially to a controlled set of types: text, number, date, boolean and single choice. Defer arbitrary formula fields and complex field contexts.
- Project templates for common workflows.
- Notification preferences to reduce noise.

## Security and integrity

- Server-side workflow validation is authoritative; client validation is only a UX aid.
- Bulk operations must validate each issue independently and return a clear result set. Use an atomic transaction only where all-or-nothing semantics are explicitly intended and feasible.
- Attachment download must be authorized by Dataverse/SharePoint access controls. Do not expose public links by default.
- Saved filter sharing must not grant access to records the recipient cannot otherwise read.
- Custom-field definitions are configuration, not a reason to bypass Dataverse security. Validate field types and values server-side.
- Notifications should avoid exposing restricted issue summaries to users who lack access.

## UX requirements

- Bulk edit requires a count, field/value preview and confirmation.
- Show partial failure clearly; allow retry only for failed items.
- Workflow configuration UI should remain simple: status list, initial status, transition matrix and optional required fields.
- Custom-field configuration should clearly show where fields appear and which issue types use them.
- Notification settings should have sensible defaults and avoid notification storms for bulk edits.

## Implementation sequence

1. Define workflow configuration schema and migration defaults.
2. Add server-side transition validator and tests before exposing configuration UI.
3. Implement saved filters and sharing behavior.
4. Implement bulk edit service with authorization and partial result reporting.
5. Implement attachment integration and access tests.
6. Implement notifications and optional flow trigger/outbox pattern if reliable delivery is required.
7. Add limited custom fields and project templates.

## Acceptance criteria

- A disallowed status transition is rejected server-side even if invoked directly through the API.
- Required fields are validated during the transition operation.
- Bulk edit does not update unauthorized records and reports successes/failures accurately.
- Shared filters do not leak restricted record details.
- Attachments are not accessible to users who lack permission to the underlying issue/file.
- Notification delivery failures do not roll back an otherwise successful issue save.
- Custom-field type/value mismatches are rejected.

## Codex deliverables

- Workflow configuration, saved filters, bulk edit, attachment handling and notifications.
- Security tests and deployment notes for flow connections/environment variables.
- Documentation of custom-field limitations and supported attachment storage configuration.
