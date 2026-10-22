# Server-Side Dataverse Design

## Purpose

Specify the server-side operations needed to keep issue identity, workflow, relationships and sprint operations reliable. The UI may validate early for usability, but server-side logic is authoritative.

## Recommended pattern

Use Dataverse plug-ins for synchronous validation and record-level invariants where the pipeline is appropriate. Use Dataverse Custom APIs for explicit multi-step domain operations that clients should invoke as one named operation. Use asynchronous plug-ins or Power Automate for non-critical side effects such as notifications. Avoid implementing every CRUD action as a Custom API without a concrete need.

All names below are proposed. Apply the solution publisher prefix consistently before creating components.

## Required operations

### 1. Allocate issue key

**Recommended Custom API:** `new_AllocateIssueKey` (or internal operation called from issue creation).

Inputs: `ProjectId`.

Output: `IssueKey` and optionally allocated sequence.

Requirements:

- Validate caller can create issues in the project.
- Resolve the project's immutable key and sequence state.
- Allocate the next number using a concurrency-safe strategy. A simple read/increment/update without concurrency handling is not sufficient.
- Prefer a dedicated Project Sequence row per project, optimistic concurrency using row version/ETag with bounded retries, or another explicitly tested atomic allocation strategy.
- Create the issue and sequence allocation in one transaction if implemented as a single Custom API/plug-in operation.
- Add an alternate key on Issue Key as a final uniqueness guard, but do not rely on uniqueness errors as the normal allocation mechanism.
- Never allocate by `CountRows`, `MAX + 1` in client code, or a browser-side counter.
- Handle retry safely. If the operation may be retried, use a client request/idempotency token or ensure a duplicate create cannot occur.

Alternative: implement issue creation itself as `new_CreateIssue` so key allocation and issue creation can be coordinated within one server-side transaction. This is the preferred design if the project supports Custom APIs.

### 2. Create issue

**Recommended Custom API:** `new_CreateIssue`.

Inputs: project ID, summary, description, issue type, priority and optional permitted fields.

Server responsibilities:

- Validate project exists, is active and caller has permission.
- Set reporter from the authenticated execution context unless an authorized override is supported.
- Validate issue type and initial status.
- Allocate issue sequence and key safely.
- Validate parent issue belongs to the allowed project scope and does not create a cycle.
- Create issue and initial history event.
- Return issue ID, issue key and relevant version information.

Keep input contract stable and version changes deliberately. Do not accept arbitrary column names from the client.

### 3. Transition issue

**Recommended Custom API:** `new_TransitionIssue`.

Inputs: issue ID, target status ID, optional resolution and comment, optional expected row version.

Server responsibilities:

- Retrieve issue and current status.
- Validate caller can transition the issue.
- Confirm transition exists in the project's workflow.
- Validate required fields and resolution rules.
- Apply status and resolution changes.
- Create structured history entries for changed fields.
- Optionally enqueue a notification/outbox record; do not synchronously call external services.
- Reject stale writes when an expected version is supplied and conflicts matter.

### 4. Reorder issue

**Recommended Custom API:** `new_ReorderIssue`.

Inputs: issue ID, target list/sprint/column, before/after anchor issue ID or target rank, expected version.

Requirements:

- Verify access to the issue and target board/project/sprint.
- Validate target scope and state.
- Persist ordering using a rank strategy that tolerates inserts between records; avoid rewriting every row on each drag.
- Handle concurrent moves and stale anchors explicitly.
- Return the persisted rank/order and conflict outcome.

### 5. Sprint lifecycle

**Recommended Custom APIs:** `new_StartSprint`, `new_CompleteSprint`, optionally `new_CancelSprint`.

Start:

- Verify permissions, valid dates and no conflicting active sprint on the board if one-active-sprint is the chosen rule.
- Validate sprint is in Planned state.
- Set start/end lifecycle fields and history/audit details.

Complete:

- Require an explicit policy for incomplete issues: return to backlog or move to a selected sprint.
- Validate target sprint and project compatibility.
- Apply the move and sprint completion as a consistent operation where feasible.
- Record history and a sprint snapshot/summary if reporting requires stable historical results.
- Do not silently discard incomplete work.

### 6. Bulk update

**Recommended Custom API:** `new_BulkUpdateIssues` only if needed after Phase 3.

- Accept a bounded list of issue IDs and an allowlisted field/value payload.
- Enforce per-record authorization and field-specific validation.
- Limit batch size; return per-record success/failure codes.
- Use atomic all-or-nothing behavior only if explicitly designed. Otherwise report partial outcomes accurately.
- Prevent the client from passing arbitrary logical names or privileged system fields.

## Plug-in responsibilities

Use plug-ins for defensive enforcement if records can be changed through forms, imports, flows or APIs that bypass the Code App's intended Custom API path.

Suggested synchronous validation plug-ins:

- Issue Create/Update: validate project/type/parent invariants and immutable key behavior.
- Issue Update: prevent direct status changes that bypass transition validation, if the chosen architecture can reliably distinguish authorized transition operations.
- Sprint Update: enforce lifecycle invariants.
- Issue Link Create: prevent self-links, duplicate relationships and invalid link types.
- Project Update: prevent changing project key once issues exist.

Important: a plug-in must not blindly block all status updates if the Custom API's internal update triggers the same plug-in. Use a robust operation marker/context design that cannot be spoofed by an ordinary client, or centralise the validation in a shared domain service called by both paths. Document and test the pipeline execution order.

## History strategy

Create a structured `Issue History` row for meaningful domain changes. Recommended fields: Issue, Changed By, Changed On, Event Type, Field Logical Name, Old Value (display-safe text), New Value (display-safe text), Correlation ID, optional operation name.

- Do not store secrets or large descriptions in history.
- For lookup changes, store the referenced record ID plus a display snapshot if useful.
- For status changes, retain old/new status IDs and display values.
- Consider Dataverse auditing as an additional compliance mechanism, not a replacement for a product-friendly timeline.
- Prevent untrusted clients from fabricating history events; create them server-side.

## Concurrency and transactions

- Use row version/ETag optimistic concurrency where supported and appropriate.
- Handle concurrency faults with bounded retry and user-visible conflict feedback.
- Use alternate keys for uniqueness constraints, not as a substitute for allocation logic.
- Keep synchronous transactions short; never make HTTP calls to Teams, email or third-party APIs inside a synchronous transaction.
- For durable side effects, create an outbox/notification record transactionally and process it asynchronously.
- Confirm transaction behavior for Custom API plug-ins in the actual Dataverse execution pipeline; do not assume arbitrary multi-request client batches are atomic.

## Security

- Enforce authorization on every Custom API.
- Configure Custom API execution privilege deliberately. Do not mark APIs as broadly executable without considering data access.
- Do not elevate to SYSTEM or use an elevated execution identity casually. If an operation runs with elevated privileges, explicitly validate the caller's rights and allowed project scope first.
- Avoid returning fields the caller is not entitled to read.
- Test with least-privilege users, not only System Administrator.

## Error contract

Return clear, stable domain error codes such as:

- `PROJECT_NOT_FOUND`
- `PROJECT_ACCESS_DENIED`
- `ISSUE_KEY_CONFLICT`
- `INVALID_TRANSITION`
- `REQUIRED_FIELD_MISSING`
- `STALE_RECORD_VERSION`
- `INVALID_PARENT_RELATIONSHIP`
- `SPRINT_HAS_INCOMPLETE_ISSUES`
- `TARGET_SPRINT_INVALID`

Map these to safe user messages in the client. Do not expose stack traces or internal environment details.

## Deployment and testing

- Ship plug-ins, Custom APIs, tables, choices and security privileges in a managed solution for downstream environments.
- Use environment variables for configurable values; do not hard-code tenant/environment URLs.
- Document registration steps only if the repository's build/deployment tooling cannot package them.
- Unit-test pure domain rules independently from Dataverse.
- Add integration tests for key allocation concurrency, transition validation, parent cycles, sprint completion, privilege failures and stale versions.
- Test plug-in recursion/depth and pipeline ordering.
- Include a deployment smoke test and rollback notes.
