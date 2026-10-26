# Dataverse Work Management App — Codex Handoff

A phased implementation brief for a Jira-inspired Power Apps Code App backed by Dataverse. This is a pragmatic work-management product, not a Jira clone or a promise of Jira API compatibility.

## Documents

1. `phase-1-foundation-issue-tracker.md` — projects, membership, issues, comments, history, My Work and basic Kanban.
2. `phase-2-agile-delivery.md` — backlog, sprints, epics, story points, relationships and dashboards.
3. `phase-3-team-productivity.md` — notifications, attachments, bulk edits, configurable workflows and custom fields.
4. `phase-4-advanced-capabilities.md` — automation, time tracking, release management, advanced query and analytics.
5. `server-side-dataverse.md` — plug-ins, Custom APIs, transaction boundaries, key generation, validation and deployment guidance.
6. `security-roles.md` — recommended Dataverse roles, project-level access approach and security tests.
7. `dataverse-schema-erd.md` — logical table schema, relationships and Mermaid ERD.

## Instructions for Codex

- Read this README and the relevant phase document before changing code.
- Inspect the existing repository and its current Code Apps setup first. Preserve its established conventions and do not replace working scaffolding without a reason.
- Implement one phase at a time. Do not silently start later phases.
- Before implementation, report the current architecture, assumptions, dependencies and proposed files to change.
- Use TypeScript with strict typing. Keep UI, domain logic and Dataverse data access separated.
- Use the supported Power Apps Code Apps / Dataverse integration already configured in the repository. Do not invent unsupported SDK calls or assume that ordinary browser code can bypass Dataverse security.
- Use the logical names and choices in `dataverse-schema-erd.md` as proposed names; inspect solution conventions and reconcile prefixes before creating metadata.
- Treat the schema as a logical baseline. Confirm column types, relationship cascade behavior, ownership model, auditing and environment limits before deployment.
- Never enforce security only in the UI. Dataverse privileges and server-side validation must enforce access and invariants.
- Never generate issue keys in the browser with `CountRows`, `MAX + 1`, timestamps alone, or client-side counters.
- Add tests for domain logic, permissions, concurrency and failure paths. Include manual test steps for Code App UI behavior.
- Do not commit secrets, environment-specific URLs, tenant IDs or connection credentials.
- Keep deployments solution-aware and environment-variable driven. Document any manual Dataverse configuration.

## Product principles

- Prioritise everyday issue tracking and Kanban before broad Jira parity.
- Dataverse is the source of truth.
- Issue keys are readable identifiers; Dataverse GUIDs remain the primary internal identifiers.
- Prefer simple, explicit workflows over a general-purpose workflow designer in the first release.
- Keep optional Power Automate and Power BI integrations out of the critical path for core CRUD and workflow integrity.
- Design for paging, selective column retrieval and server-side filtering from the start.

---

# Pira — Phases 1–5 implementation

Pira is a Power Apps Code App (plain HTML/CSS/ES modules, no build step) on Dataverse. Look and feel: Jira-style shell, single electric-cyan accent on charcoal, with a light mode (toggle in the top bar, remembered in localStorage).

Phase 2 adds backlog and sprint planning, scrum boards, sprint reports, story points, epics/child progress, issue links, a basic dashboard, multiple boards per project, Entra ID people search (Office 365 Users) and explicit Save / Discard for issue edits. Manual tests and migration notes: [docs/phase-2-manual-test.md](docs/phase-2-manual-test.md).

Phase 3 adds per-project workflows (8 statuses, allowed transitions, required fields such as a resolution when moving to Done), project templates (Kanban, Scrum, Bug tracking), saved filters (private or shared with the project), bulk edit with preview and per-issue results, attachments (Dataverse file column), in-app notifications with preferences and an optional email/Teams flow, and custom fields (text, number, date, yes/no, single choice). Manual tests and migration notes: [docs/phase-3-manual-test.md](docs/phase-3-manual-test.md); optional flow: [docs/notification-flow.md](docs/notification-flow.md).

Phase 4 adds the approved advanced capabilities, each behind a feature flag (`FEATURES` in `app-config.js`): time tracking (estimates, work logs that are voided rather than deleted, Time Spent derived by plug-ins), releases and versions (fix version, release with unfinished-issue handling, release calendar), an advanced query builder (allowlisted fields and operators, AND/OR groups, translated to OData and filtered by Dataverse as the user), reports (lead/cycle time, throughput, overdue trend, sprint outcomes, estimate accuracy), CSV export and import with a dry run, and a dependency graph. Automation rules weren't approved and aren't built. Design notes and analytics definitions: [docs/phase-4-design.md](docs/phase-4-design.md); manual tests and migration notes: [docs/phase-4-manual-test.md](docs/phase-4-manual-test.md).

Phase 5 links Power Platform solutions to epics: per epic, one solution for each of Dev, Test, Stage and Prod, chosen with a searchable environment picker (Power Platform for Admins V2, *Retrieve a list of environments*) and then a searchable solution picker (Dataverse connector, `solutions` table in that environment). Choosing an environment auto-selects the solution with the same SchemaName as the nearest linked stage. Each stage shows the live version and modified date and links to the solution in make.powerapps.com. Stories get a *Solution version* field and a Dev/Test/Stage/Prod check that shows the stage's version and whether it matches. Feature flag `FEATURES.powerPlatform`. Manual tests and migration notes: [docs/phase-5-manual-test.md](docs/phase-5-manual-test.md).

## Structure

```text
power.config.json            Code App manifest (app name, environment, Dataverse data sources)
dist/                        Deployed as-is
  index.html                 Shell + theme CSS (all markup inside #root)
  index.js                   Boot, router, sidebar, global search, shortcuts
  codeapp.js, power-apps-data.js   Code App SDK (do not edit)
  connectors/office365users.js     Office 365 Users connector wrapper (from codeapp-js; do not edit)
  connectors/powerplatformadminv2.js, connectors/commondataserviceforapps.js   Phase 5 connector wrappers (generated by CAP; do not edit)
  config/app-config.js       Tables, choice values, workflow, templates, sprint lifecycle, link types, notification events, feature flags, query allowlist, limits
  config/dataverse-tables.json     Schema plan used to create the wd_ tables with CAP
  config/decision-log.md     Decisions, constraints and change log
  js/domain.js               Pure rules: keys, validation, workflows, ranking, sprints, hierarchy, links, custom fields, filters, bulk plans, notifications, attachments, OData filters, durations, versions, queries, analytics, CSV, dependency graphs
  js/data-service.js         All Dataverse + connector access (paged, filtered, selected server-side)
  js/ui/*.js                 Board, backlog, sprints, issue panel, create issue, lists, bulk edit, notifications, projects/overview, settings (workflow, custom fields), releases, query builder, CSV, reports, dependencies, epic solutions / version check, dialogs, pickers, DOM helpers
agent/                       Not deployed
  mockup-*.html              Design mockups (mockup 1 chosen)
  dev/mock-data-service.js   In-memory twin of data-service.js for local UI work
  dev/serve.mjs              Local static server
  tests/*.test.mjs           Node test suites
docs/phase-1-manual-test.md  Manual/hosted test script (Phase 1)
docs/phase-2-manual-test.md  Manual/hosted test script + migration notes (Phase 2)
docs/phase-3-manual-test.md  Manual/hosted test script + migration notes, custom-field limits, attachment storage (Phase 3)
docs/notification-flow.md    Optional Power Automate email/Teams delivery (Phase 3)
docs/phase-4-design.md       Design notes per Phase 4 capability, analytics definitions, Power BI guidance
docs/phase-4-manual-test.md  Manual/hosted test script + migration notes (Phase 4)
docs/phase-5-manual-test.md  Manual/hosted test script + migration notes (Phase 5)
plugins/                     Low-code plug-in formulas and dv-native specs (Phase 3 changes, Phase 4 and Phase 5)
```

## Run locally

```powershell
npm run dev     # http://127.0.0.1:5178/dist/index.html?mock
npm test        # domain + service + mock-parity tests (Node 22, no dependencies)
npm run check   # syntax-check every module
```

`?mock` only works on localhost; it swaps in `agent/dev/mock-data-service.js`. Without it the app needs the Power Apps host.

## Dataverse setup (environment: Platform-Tools, publisher `wyattdave`, prefix `wd`)

1. ✅ Tables created and published (2026-10-15) from `dist/config/dataverse-tables.json` with the CAP `createDataverseTable` API, one at a time in dependency order. The CAP sequence often needs one retry about 60 seconds after a 400 "not found in the MetadataCache" error, because the new table's metadata is still propagating. Phase 2 tables (Sprint, Board Issue, Issue Link) and Issue columns (Story Points, Sprint) were added the same way. Phase 3 (2026-10-16) added seven tables, Issue Resolution, three Project workflow columns, and four *Status* options on Issue and Board Column (via `InsertOptionValue`, since CAP skips existing columns). Phase 4 (2026-10-21) added Version and Work Log, and five Issue columns (estimates, Time Spent, Fix Version, Started On). Phase 5 (2026-10-21) added Epic Solution and the Issue *Solution Version* column.
2. ✅ Registered in `power.config.json → databaseReferences` (23 `wd_` tables + `systemusers`) plus the **Office 365 Users**, **Power Platform for Admins V2** and **Microsoft Dataverse** connection references; schemas in `dist/config/*.Schema.json`. `npm test` checks that `TABLES` in `app-config.js` matches both.
3. ⏳ Manual: security role **Pira User** (incl. the Phase 2–5 tables, some at User level; no Delete on Work Log or Epic Solution), eleven alternate keys, solution membership. Full privilege matrix and steps are in [docs/dataverse-setup.md](docs/dataverse-setup.md).
4. ✅ Platform-Tools: the thirty-nine automated **low-code plug-ins** (Power Fx) are deployed with dv-native into *Pira-plugins* and enabled (Phase 3–5 sources in `plugins/`). Other environments: [docs/lowcode-plugins.md](docs/lowcode-plugins.md). Upgrading from Phase 4: add 37–39.
5. ⏳ Deploy: `CAP deploy`; users approve the Office 365 Users, Power Platform for Admins V2 and Dataverse connections on first launch.
6. Optional: the email/Teams notification flow ([docs/notification-flow.md](docs/notification-flow.md)).

## Server-side logic

`SERVER_LOGIC` in `dist/config/app-config.js` chooses where the authoritative rules run:

- `'lowcode'` (default): Dataverse automated low-code plug-ins allocate issue keys, validate transitions against each project's workflow (including required fields), membership, immutable keys, custom field values, notifications, attachments and the last-lead rule, and write issue history inside the same transaction. The app keeps only early validation, ranking and label history.
- `'client'`: fallback that does the same work in the browser, with no server enforcement. Use it only while the plug-ins aren't installed.

## Known limitations (Phases 1–5)

- Low-code plug-ins are a Microsoft **preview** feature.
- Plug-ins only run on writes, so per-project **read** access isn't enforced server-side (needs owner teams or sharing). See [docs/lowcode-plugins.md](docs/lowcode-plugins.md#limits-to-know-about).
- Reporter, comment author and history "changed by" use Dataverse's server-stamped `createdby`.
- Workflows choose from a fixed catalogue of eight statuses (To Do, In Progress, In Review, Done, Backlog, Blocked, In Testing, Closed); new status names need a new choice value. A blank project workflow means the Phase 1/2 default (any move). Saving a workflow is several writes (transitions, project, board columns); saving again finishes a partly failed save.
- Bulk edit is up to 50 issues, one write each (not atomic); results show exactly which issues failed, and **Retry** repeats only those.
- Notifications are polled (every 2 minutes and when the tab regains focus), not pushed. Email/Teams needs the optional flow.
- Custom fields: five types, no formulas, multi-select, user/lookup fields, defaults or required custom fields; not searchable or filterable yet. Attachments: 10 MB per file, 20 per issue, in Dataverse file storage.
- Order is one base-36 fractional rank per project (`wd_rank`), shared by the backlog, sprints and every board. Moves are ranked from the neighbours' current server values.
- Hierarchy is Epic → Story → Task/Bug. Phase 1 parent links that break it are kept but must be fixed before their parent/type can change.
- Sprint completion is several writes (issues, then sprint); a retry finishes a partly failed completion.
- Boards are project-scoped; the default board shows every issue, extra boards show only issues added to them.
- Phase 4: one fix version per issue (no affected versions). Releasing a version is several writes (issues, then version); releasing again finishes it. The advanced query is a visual builder, not JQL. Reports read up to 2,000 issues per query and the overdue trend uses today's due dates (no snapshots). CSV import is up to 200 issues per file and doesn't import status, comments or custom fields. The dependency graph shows up to 150 issues plus 50 outside the scope. Issues created before Phase 4 have no Started On until they next move, so early cycle-time figures cover fewer issues.
- Phase 5: one solution per epic and stage (four fixed stages). Environments and versions are read live as the signed-in user, so people without access to an environment see why instead of a version; the stored version is only a snapshot from when it was linked. The solution picker shows the first 50 matches by name (type more to narrow). Only stories carry a solution version; the check compares the saved value with the parent epic's solution in the chosen stage.

See `docs/phase-1-manual-test.md` to `docs/phase-5-manual-test.md` for the acceptance walkthroughs.
