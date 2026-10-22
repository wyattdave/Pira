# Recommended Dataverse Security Roles

## Design principle

Use Dataverse security roles for table-level privileges and ownership depth, and a deliberate project membership model for project-specific access. Do not rely on UI visibility for security. The exact configuration depends on whether the app is single-business-unit, multi-business-unit, internal-only or supports guests; validate in the target environment.

## Recommended roles

### 1. Work Management Administrator

For a small number of platform/application administrators.

- Full create/read/write/delete on configuration tables (Project, Workflow, Workflow Transition, Board, Board Column, project templates and supported custom-field definitions).
- Full access to project and issue data as operationally required.
- Manage project membership and project configuration.
- Execute administrative Custom APIs.
- Avoid granting System Administrator unless the person needs environment-level administration beyond this app.

### 2. Project Lead

For a lead who manages a project but does not administer the whole environment.

- Read project and project configuration for assigned projects.
- Update project metadata except immutable key fields.
- Manage project membership within allowed policy.
- Create/read/update issues and comments in their projects.
- Manage boards, sprints and workflow configuration only if the product supports lead-level configuration.
- No delete of core records by default; archive instead.

### 3. Contributor

For users doing the work.

- Read projects and issues they are entitled to access.
- Create issues and comments in permitted projects.
- Update permitted issue fields and transition issues through valid transitions.
- Read relevant sprint/board data.
- No workflow administration, project membership administration or bulk destructive actions.
- Delete privileges on issues/comments should be denied by default unless there is a clear retention policy.

### 4. Read-only Stakeholder

For viewers, managers or business stakeholders.

- Read projects, issues, boards, sprint summaries and comments as policy permits.
- No create/update/delete on core records.
- Do not assume read access to a Project row automatically provides read access to every Issue row; configure and test actual table privileges and record sharing/ownership.

### 5. Integration / Automation identity (optional)

Use only for flows or integration components that genuinely need an application identity.

- Grant the minimum table and Custom API privileges required.
- Avoid tenant-wide broad read/write privileges where project-scoped access is possible.
- Record the identity's purpose, owner, connection references, secret/certificate rotation and failure monitoring.
- Ensure integrations do not leak issue summaries in notifications to unauthorized recipients.

## Important Dataverse security nuance

A standard Dataverse security role is not automatically a per-project ACL. If all users share the same business unit and table privileges are Organization-level, a user may be able to read every row of that table. Hiding projects in the Code App does not fix this.

Choose and document one enforcement model before implementation:

### Option A — Ownership and sharing

- Use User/Team-owned tables where suitable.
- Share project and child records with appropriate owner teams or users, or use access teams if they fit the collaboration model.
- Review sharing propagation and revoke behavior carefully as members are removed.
- Best when Dataverse row-level access must be directly enforced on each record.

### Option B — Server-enforced project access

- Keep a Project Member table with Project, User, Role and membership state.
- Route sensitive reads/writes through server-side operations that validate membership and scope.
- Do not expose broad direct table read privileges that allow users to bypass these operations through the Web API.
- This requires deliberate API/query architecture; ordinary client-side OData queries cannot enforce an application-only ACL if table privileges allow unrestricted reads.

### Option C — Business-unit/team structure

- Map projects or groups of projects to owner teams/business units where that structure aligns with the organisation.
- Use Dataverse ownership and role depth to enforce access.
- Can become administratively heavy if each project needs unique access boundaries.

A hybrid is possible, but avoid mixing models accidentally. For a multi-team internal app, evaluate owner teams/access teams against server-side membership enforcement before choosing.

## Suggested table privilege matrix

Legend: `Org Read` = Organization-level read; `User/Team` = record ownership/team depth; `Scoped` = only records available through the chosen project access model; `—` = no privilege. This is a design target, not a literal role export.

| Table | Admin | Project Lead | Contributor | Read-only |
|---|---|---|---|---|
| Project | Org Read/Write | Scoped Read/Write | Scoped Read | Scoped Read |
| Project Member | Full | Manage own projects | Read own membership as needed | — or limited read |
| Issue | Full | Scoped CRUD except hard delete | Scoped Create/Read/Update | Scoped Read |
| Sprint | Full | Scoped CRUD | Scoped Read; permitted lifecycle actions | Scoped Read |
| Board / Board Column | Full | Scoped configuration | Scoped Read | Scoped Read |
| Workflow / Transition | Full | Read; configure only if allowed | Read | Read |
| Issue Comment | Full | Scoped CRUD per retention policy | Scoped Create/Read; edit own if allowed | Scoped Read |
| Issue History | Read; controlled maintenance | Scoped Read | Scoped Read | Scoped Read |
| Issue Link | Full | Scoped CRUD | Scoped CRUD for supported link types | Scoped Read |
| Saved Filter | Full | Own/shared filters | Own/shared filters | Shared filters only |
| Notification | Admin support | Own | Own | Own |
| Attachment metadata | Full | Scoped | Scoped | Scoped Read |

Do not grant Delete on Issue History. Consider denying hard delete for Issue and Sprint in all standard roles.

## Custom API privileges

For each Custom API:

- Decide whether it is public to authenticated app users or requires a specific execution privilege.
- Grant the required privilege to intended roles only.
- Independently validate project and record access inside the operation.
- Test direct Web API invocation with a user who can invoke the API but lacks access to the target project.
- Avoid assuming that a Custom API's execution context automatically represents the caller's business permissions if the implementation runs as an elevated user.

## Required security tests

1. Contributor from Project A cannot read Project B issues through direct API calls.
2. Removing a user from a project revokes access according to the chosen model, including related comments and attachments.
3. Read-only stakeholder cannot create or edit issues via direct API calls.
4. Contributor cannot change workflow configuration or add project members.
5. A user cannot assign an issue to a project they cannot access.
6. Custom APIs reject unauthorized record IDs and invalid target project IDs.
7. Notifications do not disclose protected issue data.
8. A user with access to one project cannot infer restricted project names, issue keys or counts through search and dashboard aggregates.
9. Integration identities have no unrelated environment-wide privileges.

## Delivery note

Create custom roles with the solution and validate privilege depth, ownership type, team membership, app access and licensing in a real test environment. This document is not a substitute for exporting/importing a tested role definition.
