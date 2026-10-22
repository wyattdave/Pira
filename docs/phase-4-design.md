# Pira — Phase 4 design notes

The Phase 4 brief asks for a short design note before each candidate, and says to build only approved candidates. Approved on 2026-10-21: **time tracking, releases and versions, advanced querying, analytics, CSV import/export and dependency visualisation**. **Automation rules were not approved** and aren't built.

Every capability has a flag in `FEATURES` ([`dist/config/app-config.js`](../dist/config/app-config.js)). With a flag off, the UI hides the feature and the data service refuses its calls (`FEATURE_DISABLED`) before touching Dataverse; core issue tracking is unaffected (`agent/tests/phase4-features.test.mjs`).

## Time tracking

- **User problem.** Teams want to compare what they planned with what it took, without a separate timesheet tool.
- **Data model.** Issue gets *Original Estimate*, *Remaining Estimate* and *Time Spent* (whole minutes). New **Work Log** table: issue, project, minutes (1–1,440), work date, comment, voided + reason + voided on. Author = Dataverse *Created By*.
- **Rules.** Durations are typed like Jira (`1w 2d 3h 30m`, 1d = 8h, 1w = 5d); bare numbers are refused because "2" is ambiguous. One entry is 1 minute to 24 hours, dated within the last year and not in the future (one day of time-zone slack). Logging work reduces the remaining estimate automatically (never below zero; it starts from original − spent if blank), and the person can override it. A first original estimate also becomes the remaining estimate while nothing is logged.
- **Estimates vs actuals.** Estimates are edited with the issue's other fields; only work logs add up to Time Spent. The issue panel shows logged and remaining side by side, and the Original estimate separately.
- **Auditable history.** Work logs are **never deleted** (no Delete privilege). The author edits or voids their own log; a lead can only void someone else's. Voided logs stay visible, struck through, with the reason, and are locked. Every log, edit and void writes an issue history row, and *Time Spent* is recalculated from the non-voided logs in the same transaction (plug-ins 34–35). Time Spent can't be written directly: plug-in 1 blanks it on create and plug-in 36 replaces any direct change with the sum of the logs.
- **Security.** Leads and contributors log work on issues in their projects; stakeholders and outsiders can't (plug-in 34). Logs follow the same Org-level read model as issues.
- **Operational cost.** One table, three Issue columns, two plug-ins. One extra query when the issue panel opens.

## Releases and versions

- **User problem.** Teams need to group work into a release, see how far along it is, and ship it deliberately.
- **Data model.** New **Version** table: project, name (unique per project), description, start and release dates, state (Unreleased / Released / Archived), released on. Issue gets one *Fix Version* lookup. Decision: **one fix version per issue** (no affected-versions list); it covers the brief's "if needed" and keeps queries simple. A many-to-many can be added later without changing existing data.
- **Rules.** Only leads create, edit, release, unrelease, archive and restore versions (plug-ins 32–33). An issue's fix version must be an unarchived version of its own project (plug-ins 1 and 36). Releasing asks what to do with unfinished issues (move to another unreleased version, clear their fix version, or leave them), moves them first and then marks the version released; releasing again finishes a partly failed release. Archived versions keep their issues but can't receive new ones.
- **Release calendar.** A month view of unreleased versions on their release dates (released ones on their ship day), with overdue versions highlighted. No deployment pipelines or delivery integrations (out of scope).
- **Operational cost.** One table, one Issue lookup, two plug-ins, plus the Phase 4 additions to plug-ins 1 and 36. Progress for every version comes from one query.

## Advanced querying

- **User problem.** The basic filters can't express "unassigned bugs in 2.0 **or** anything blocked that's overdue".
- **Design.** A visual builder (Issues → **Advanced**): conditions joined by AND or OR, plus one level of groups. Up to 20 conditions and 30 values per condition. Queries are saved and shared with the existing saved filters (private or project), and "Me" always means whoever runs the filter.
- **Strict allowlist.** Only the fields in `QUERY_FIELDS` (status, status category, type, priority, resolution, assignee, reporter, label, sprint, fix version, summary, due/created/updated/resolved dates, story points, estimates, time spent) and the project's custom fields (`cf:<id>`), each with only its kind's operators (`QUERY_KIND_OPERATORS`). Values are type-checked (statuses from the catalogue, GUIDs for people/labels/sprints/versions, real dates, bounded numbers). Unknown fields, operators or values are dropped when a saved query is loaded and rejected (`INVALID_QUERY`) when one is run.
- **Translation.** `buildQueryFilter` turns the query into OData. Text values are escaped inside quotes, GUIDs and numbers are emitted only after validation, and nothing from the user is ever concatenated raw. Filtering runs in Dataverse, as the signed-in user, with paging. Labels and custom fields use `any()` lambdas; "is none of" and "does not contain" use `not … any()`. Every generated form was checked against Platform-Tools (read-only `$top=1` queries) on 2026-10-21.
- **Where it runs.** Code Apps can't host server code, so the translation runs in the app's data layer; Dataverse executes the filter server-side and applies the caller's security. This is the same trust model as Phase 3 saved filters: a query can only narrow what the caller can already read.
- **Semantics.** "Is none of" includes empty values (an unassigned issue *is* none of Sam); numeric comparisons never match empty values. Date conditions on date-time columns use the user's local day. **Not JQL**: there's no text query language and no promise of JQL compatibility.

## Analytics

Reports (project sidebar → **Reports**) for the last 4, 8, 12 or 26 weeks. Calculations are pure functions in `dist/js/domain.js`, tested against a fixed dataset in `agent/tests/phase4-domain.test.mjs`.

| Measure | Definition |
|---|---|
| Lead time | Resolved On − Created On, in days, for issues resolved in the window that are still in a done status and not archived. Median, 85th percentile (nearest rank) and average. |
| Cycle time | Resolved On − Started On. *Started On* is set the first time an issue enters an in-progress status (In Progress, In Review, Blocked, In Testing) and never moves after. Issues that went straight to done are excluded and counted separately. Issues created before Phase 4 have no Started On until they next move. |
| Throughput | Issues (or story points) resolved per week, Monday to Sunday in the user's time zone. The last week is the current, partial one. |
| Overdue trend | For each week, issues that were open at the end of that week (now, for the current week) with a due date before that week's last day (today, for the current week). Uses today's due dates and resolution dates, so a moved due date or a reopened issue counts as it is now (no snapshots are stored). |
| Sprint outcomes | Completed sprints: committed issues/points (snapshot when started), completed and incomplete (snapshot when completed). Say/do = completed points ÷ committed points. |
| Estimate accuracy | Time spent ÷ original estimate, over resolved issues in the window that had an original estimate. |
| Open time | Sums of original estimate, remaining estimate and time spent over open issues, plus how many have no estimate. |

- **Scope and limits.** Archived issues are always excluded. Each report query reads at most 2,000 issues; the page says so if a limit was hit.
- **Security.** Every figure comes from Dataverse queries run as the signed-in user, so reports can't show more than that person can read. There's no integration identity.
- **Power BI.** For cross-project reporting, use Power BI with the Dataverse connector **signed in as each viewer** (DirectQuery, or import with row-level security that mirrors project membership). Don't publish a dataset refreshed by a shared service account to people who aren't members of every project in it: that would bypass Pira's access model. Reuse the definitions above so numbers match the app.

## CSV import and export

- **Export.** Issues → **CSV → Export these issues** downloads exactly what the current filter (basic, advanced or saved) returns for the signed-in user, up to 5,000 issues, as UTF-8 with a BOM. Cells that a spreadsheet could execute (starting with `=`, `+`, `-`, `@`, tab or carriage return) are prefixed with an apostrophe.
- **Import with a dry run.** Issues → **CSV → Import from CSV…**: up to 200 issues and 1 MB per file. The preview parses the file (RFC 4180), maps columns by header name, and validates every row the same way as the create form: type, priority, people (project members by email or exact full name; ambiguous names are refused), labels, story points, ISO dates, estimates and fix versions (existing, unarchived). Nothing is written until **Import**. Status is never imported (new issues start in the workflow's initial status; the plug-ins enforce it anyway).
- **Results.** Rows are created one at a time in file order (so keys follow the file), each through the normal create path and plug-ins. The result lists every row; **Retry failed rows** re-plans from the same file and runs only those lines, so successful rows are never duplicated.
- **Security.** Leads and contributors only. The import runs as the user, so it can't do anything the create form can't.

## Dependency visualisation

- **View.** Project sidebar → **Dependencies**: "blocks" links drawn left to right, so blockers come first. Scope: open issues, a sprint, a version or an epic's children (up to 150 issues). Issues outside the scope that block or are blocked by one inside appear as dashed external nodes (up to 50). "Relates to" links can be shown as dashed lines but never change the layout.
- **Signals.** Unfinished work that is blocked by unfinished work is marked; **blocking loops** (A blocks B blocks C blocks A) can't be layered, so their issues are flagged in a final column with a notice. A text list of every link is provided for screen readers.
- **Cost.** Read-only: one issue query, one link query per 20 issues, and one query per 20 external issues.

## Acceptance criteria (brief) → where they're met

| Criterion | Evidence |
|---|---|
| Query builder accepts only allowlisted fields/operators and uses server-side filtering | `sanitiseQuery` / `validateQuery` / `buildQueryFilter`; domain tests for injection, unknown fields, depth and limits; service test checks the OData sent; forms verified on Dataverse |
| Time tracking validates entries and keeps an auditable history | `validateWorkLog`, plug-ins 34–35, no Delete privilege, void-with-reason; domain and service tests |
| Analytics definitions documented and validated against test datasets | Table above; `phase4-domain.test.mjs` analytics tests |
| Integrations fail gracefully and aren't dependencies for core CRUD | Phase 4 tables/plug-ins only touch Phase 4 columns; flags off leave core CRUD working (feature test) |
| Feature flags can disable unfinished capabilities safely | `FEATURES`; refused before any Dataverse call |
| Automation has execution logs, retry limits and loop protection | Not applicable: automation was not approved |
