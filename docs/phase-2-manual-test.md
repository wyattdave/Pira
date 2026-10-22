# Phase 2 — Manual test guide and migration notes

Covers the Phase 2 acceptance criteria in [phase-2-agile-delivery.md](../phase-2-agile-delivery.md) and the four pre-Phase 2 changes (Entra people search, parent lookups, multiple boards, explicit Save).
Run `npm test` first (53 tests: domain, service, mock parity, config parity). This guide covers UI behaviour, permissions and the hosted environment.

## Migration from Phase 1

For environments already running Phase 1 (Platform-Tools was migrated on 2026-10-15):

1. **Schema (done for Platform-Tools).** New tables Sprint, Board Issue and Issue Link; new Issue columns Story Points and Sprint. All columns are nullable, so existing rows need no back-fill. The plan is in [`dist/config/dataverse-tables.json`](../dist/config/dataverse-tables.json) (run order in its `notes`). For another environment, create them with the CAP table API in that order, then register `wd_sprint`, `wd_boardissue`, `wd_issuelink` and re-register `wd_issue`.
2. **Security role.** Add the three new tables to **Pira User** ([dataverse-setup.md](dataverse-setup.md) §1).
3. **Alternate keys.** Board Issue (Board + Issue) and Issue Link (From + To + Type) — §2.
4. **Plug-ins.** Replace the formulas of plug-ins **1** and **3**, create **12–17** ([lowcode-plugins.md](lowcode-plugins.md)). Until they exist the app's own checks still run, but nothing is enforced server-side for sprints, links or board memberships.
5. **Office 365 Users connection.** Deploying with the updated `power.config.json` adds the connection reference; users approve it on first launch.
6. **Existing ranks.** Phase 1 ranked cards per status column. Phase 2 uses one rank per project (shared by backlog, sprints and every board, like Jira). Old ranks still sort correctly; the first reorder of an issue simply places it between its new neighbours. No data change is needed.
7. **Legacy parent links.** Phase 2 only allows Epic → Story → Task/Bug parent links. Existing links that break this are left alone and still display, but saving a parent or type change on those issues is rejected until fixed. Find them with an Advanced Find / view on Issues where *Parent Issue* contains data, then compare the issue type with the parent's type (Task/Bug parents, or Story under Story/Task). Fix by changing the parent or the type.
8. **Default boards.** Each project keeps its Phase 1 board as the **default board**, which shows every issue. New boards start empty.
9. **Rollback.** The new columns and tables are additive. Redeploying the Phase 1 build ignores them; plug-ins 12–17 can stay. Restore the Phase 1 versions of plug-ins 1 and 3 if you roll the app back.

## 1. Setup

### Local (no Dataverse)

`npm run dev`, then open `http://127.0.0.1:5178/dist/index.html?mock`. The mock adds to the Phase 1 data:

| Data | Details |
|---|---|
| PIRA sprints (default board) | Sprint 1 completed, Sprint 2 active (5 issues, 1 unestimated), Sprint 3 planned |
| Extra board | **Design board** with the `ux` / `a11y` issues |
| Epic | `PIRA-7` with four children |
| Links | `PIRA-2` blocks `PIRA-3`; `PIRA-4` relates to `PIRA-2` |
| People search | "Jamie Fox" and "Robin Patel" exist in Entra but not in Dataverse |

Failure injection still works for every new function, e.g. `piraMock.failNext('planIssue')`, `piraMock.failNext('completeSprint')`.

### Hosted

Phase 1 setup plus the migration steps above, with the same Lead / Contributor / Outsider identities, plus a fourth Entra user who is **not** yet a Dataverse user.

## 2. Pre-Phase 2 changes

| # | Steps | Expected |
|---|---|---|
| P1 | Lead: **Project settings → Members**, type two letters of a colleague's name. | Results come from Entra ID (Office 365 Users). People without a Dataverse user show "not set up in Dataverse yet" and can't be added; others are added as before. |
| P2 | Remove the Office 365 Users connection (or deny it) and search again. | Search still works from Dataverse users (logged as a warning in the console). |
| P3 | Open a Task. In **Parent**, type part of an epic's summary. | Only Epics and Stories from the same project are offered; choose one, **Save**. An Epic's Parent field says Epics are top level. |
| P4 | Create issue modal: type *Story*, search a parent. | Only Epics are offered. Changing type to *Epic* clears the parent. |
| P5 | Board header → **Switch board** → **+ Create board** "Design". | New board opens empty (`#/projects/KEY/board/<id>`). The default board still shows everything. |
| P6 | Open an issue → **Boards** → *Add to board…* Design and another board → **Save**. | The issue appears on both boards and still on the default board. Card ⋯ menu on Design → *Remove from Design* removes only that membership. |
| P7 | Open an issue, change summary, priority and story points. | A bar appears at the bottom of the panel: "3 unsaved changes · Discard · Save". Nothing is written until **Save** / Ctrl+S; then one toast and one history row per field. |
| P8 | With unsaved changes, click another card or press Esc. | "Discard unsaved changes?" Cancel keeps you on the issue with your edits; Discard moves on. Reloading the page warns too. |
| P9 | Change status with unsaved edits pending. | Status saves straight away; the pending edits stay in the bar. |
| P10 | Stakeholder opens an issue. | Read-only: no inputs, no Save bar. |

## 3. Phase 2 steps

| # | Steps | Expected |
|---|---|---|
| 1 | Sidebar → **Backlog**. | Sections for the board's active and planned sprints, then **Backlog** (open issues not in a sprint, epics excluded). Each shows issue count, points and how many are not estimated (dashed "–" badge). |
| 2 | **Create sprint** (name suggested, e.g. "QAS Sprint 1"). Enter end date before start date. | "The end date can't be before the start date." Creating without dates works (Planned). |
| 3 | Drag backlog issues into the sprint; reorder within it. Repeat with the keyboard: focus a row, **Alt+↓/↑**, or **Shift+F10** → *Move to …*. | Rows move; refresh the page — order and membership are unchanged (persisted rank in Dataverse). |
| 4 | Two browsers: both drag different issues to the same gap at the same time, then refresh. | Both issues sit between the same neighbours, in the same order for both users. |
| 5 | Browser A reorders; browser B (stale) drops an issue "between" two rows that A has moved apart. | B's issue lands right after the row it was dropped below; nothing jumps elsewhere. |
| 6 | **Start sprint**. Leave dates blank. | Dates are required to start; defaults are today + 14 days. After starting: committed issues/points snapshot (see **Sprints** report). |
| 7 | Create and try to start a second sprint on the same board. | Button disabled with "Complete the active sprint first"; the server also rejects it (`[SPRINT_ACTIVE_EXISTS]`). A sprint on a different board can be active at the same time. |
| 8 | Lead: **Project settings → Boards & columns**, edit the board type to *Scrum*. Open the board. | Board shows only the active sprint's issues with a banner (dates, days left, goal, progress, **Complete sprint**). No active sprint → "No active sprint" with a link to the backlog. |
| 9 | **Complete sprint** with open issues. Click Complete without choosing. | "Choose where the open issues should go." Nothing changes. |
| 10 | Choose **Sprint → (planned sprint)**, Complete. | Open issues move to that sprint, done issues stay; Sprint Changed history on each moved issue. Choose **Backlog** in another run → open issues return to the backlog. |
| 11 | Open the completed sprint's issue, try to change its Sprint. | Sprint shows "Locked"; table editor attempts fail `[SPRINT_LOCKED]`. |
| 12 | **Sprints** report for the completed sprint. | Committed, Completed, Incomplete (moved out) and Scope change, each with points; "How these numbers are worked out" explains the definitions. Archive one of its done issues → counts in the live view exclude it; it is never counted as completed. |
| 13 | Contributor: **Reopen for correction** is not offered. Lead: reopen with a reason. | Lead sees a note "Corrected: <date>: <reason>"; the sprint is Active again (only if no other sprint is active on that board). Complete it again to re-snapshot. |
| 14 | Planned sprint → ⋯ → **Cancel sprint**. | Confirmation; its open issues return to the backlog; the sprint shows Cancelled and is locked. |
| 15 | Open an epic. | **Child issues** shows progress (done / total, points) and **+ Add child issue** (pre-selects the epic and Story type). |
| 16 | Try to make an epic's child its parent; make a Task the parent of a Story; change a Story with Task children to Task. | Each rejected with a friendly message; nothing saved (`[INVALID_PARENT_RELATIONSHIP]`, `[INVALID_PARENT_TYPE]`, `[INVALID_TYPE_CHANGE]` from the plug-ins in the table editor). |
| 17 | **Linked issues → + Link issue**: *blocks* → another issue. Then link the same pair again, then from the other issue choose *blocks* back, then link an issue to itself. | First works and shows "is blocked by" on the other issue. Then "already linked", "can't block … both ways", and self links are not selectable. Remove a link with ✕. |
| 18 | Board/epic filter: choose an epic in the board's **Epic** filter. | Only its children show; counts reload from the server. |
| 19 | **Overview** dashboard. | Status counts, open work by priority, overdue and unassigned counts, and active sprint progress. Counts come from Dataverse `$count`, so they only include rows the user can read. |
| 20 | Mock: `piraMock.failNext('planIssue')`, then move a backlog row. | Error toast; the sections reload to the server order. |
| 21 | Mock: `piraMock.failNext('completeSprint')`, complete a sprint. | Error toast; the dialog stays open and the sprint stays active. |

## 4. Metric definitions (also shown in the app)

- **Committed**: issues and points in the sprint when it was started (snapshot on the sprint row).
- **Completed**: issues in Done when the sprint was completed (live for active sprints).
- **Incomplete**: open issues at completion; they were moved to the chosen destination.
- **Scope change**: net change against the committed snapshot. Not a burndown.
- Archived issues never count. Unestimated issues count as 0 points and are listed as "not estimated".
- Story points are whole numbers from 0 to 1000 (decision: no decimals in Phase 2).

## 5. Known Phase 2 limitations

- Per-project **read** security is still open (see [dataverse-setup.md](dataverse-setup.md#known-gap-project-level-read-access)).
- Sprint completion runs as several writes (issues first, then the sprint). A failure leaves the sprint Active and a retry finishes it.
- Ranks are fractional strings. Thousands of repeated drops into exactly the same gap make them longer (column limit 64); a rebalance tool is not included yet.
- Boards are project-scoped; cross-project boards are not implemented.
- The Sprints report lists the first 50 issues of a sprint; metrics include all of them (read in pages, capped at 5,000).
- Low-code plug-ins are still a Microsoft preview feature, and their formulas couldn't be compiled locally. Paste any editor error back for a fix.
