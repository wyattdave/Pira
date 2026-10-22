# Phase 4 — Advanced Capabilities

## Goal

Add advanced features only where user demand justifies their cost. This phase must not destabilise core issue tracking.

## Candidate scope

### Automation rules

- Trigger: issue created, selected field changed, status transitioned, due date approaching, sprint started/completed.
- Conditions: project, type, priority, status, assignee, labels and supported custom fields.
- Actions: assign user, change priority/status where allowed, add label, create comment, notify user.
- Rules have enabled/disabled state, owner, execution history and loop protection.
- Avoid arbitrary code execution or user-supplied scripts.

### Time tracking

- Original estimate, work-log entries, time spent and remaining estimate.
- Validate duration and date values; define edit/delete permissions for work logs.
- Clearly distinguish estimates from actual logged work.

### Releases and versions

- Project version/release records with name, description, start/release dates and status.
- Link issues to affected/fix versions if needed.
- Defer deployment pipelines and software delivery integrations unless required.

### Advanced querying

- Visual query builder with AND/OR groups, operators and field-aware controls.
- Saved and shareable filters.
- Server-side query translation using a strict allowlist of fields/operators; never concatenate untrusted user input into FetchXML or OData strings.
- Do not promise full JQL compatibility.

### Analytics

- Cycle time, throughput, overdue trends and sprint outcomes with documented calculations.
- Power BI for advanced cross-project reporting where licensing and access model permit.
- Ensure reporting respects security and does not accidentally bypass record access through an over-privileged integration identity.

### Other candidates

- Dependency visualisation.
- Release calendar.
- CSV import/export with validation and dry-run mode.
- Selected Teams integration.

## Non-goals unless explicitly approved

- Full Jira Marketplace compatibility.
- General-purpose workflow scripting.
- Full Jira Service Management, Assets or test management replacement.
- Exact JQL implementation.
- Cross-tenant federation or anonymous public issue access.

## Acceptance criteria

- Automation has execution logs, retry limits and loop protection.
- Query builder accepts only allowlisted fields/operators and uses server-side filtering.
- Time tracking validates entries and retains an auditable history.
- Analytics definitions are documented and validated against test datasets.
- Integrations fail gracefully and do not become dependencies for core issue CRUD.
- Feature flags or configuration can disable unfinished capabilities safely.

## Codex delivery approach

Before implementing a candidate, add a short design note containing user problem, data model impact, security impact, operational cost, acceptance criteria and why it belongs in this phase. Implement only approved candidates; do not treat every bullet as a mandatory commitment.
