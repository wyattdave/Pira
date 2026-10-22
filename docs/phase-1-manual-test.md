# Phase 1 — Manual test guide

Covers the Phase 1 acceptance criteria in [phase-1-foundation-issue-tracker.md](../phase-1-foundation-issue-tracker.md).
Run the automated suite first (`npm test`); this guide covers UI behaviour, permissions and the hosted environment.

## 1. Setup

### Local (no Dataverse)

1. `npm run dev`
2. Open `http://127.0.0.1:5178/dist/index.html?mock`
3. The mock signs you in as **Alex Morgan** with seeded projects:

| Project | Key | Your role | Notes |
|---|---|---|---|
| Pira Platform | PIRA | Lead | 12 issues, labels, WIP limit 3 on In Progress |
| Website Revamp | WEB | Contributor | |
| Ops Toolkit | OPS | Stakeholder | read-only |
| Legacy Intranet | LEG | Lead | archived |

Failure injection (browser console): `piraMock.failNext('transitionIssue')` — the next call to that service function fails with a permission error. Works for any exported function name (`updateIssue`, `createIssue`, `listIssues`, …).

### Hosted (Dataverse)

1. Tables already created, published and registered (2026-10-15).
2. Alternate keys + **Pira User** role configured per [dataverse-setup.md](./dataverse-setup.md).
3. The eleven low-code plug-ins created per [lowcode-plugins.md](./lowcode-plugins.md) (and its "Check they work" table run once).
4. Three test identities with the **Pira User** security role:
   - **Lead** — creates the test project (becomes lead automatically).
   - **Contributor** — added to the project as Contributor.
   - **Outsider** — has the role but is **not** a project member.
4. Deploy (`CAP deploy`) and open the app from Power Apps.

## 2. End-to-end steps

| # | Steps | Expected |
|---|---|---|
| 1 | Lead: **Projects → Create project**, name `QA Sandbox`, accept suggested key or type `QAS`. | Lands on `QAS board` with To Do / In Progress / In Review / Done, all 0. Duplicate key shows "That key is already in use." |
| 2 | Lead: **Project settings → Members**, search the Contributor, role *Contributor*, **Add**. | Contributor listed. Try demoting yourself → "A project needs at least one lead." and the role reverts. |
| 3 | Contributor: press **C** (or **+ Create**), leave Summary blank, **Create**. | Inline "Summary is required." Nothing saved. |
| 4 | Contributor: create `First issue` with labels `qa, Smoke Test`, due date yesterday. | Toast `QAS-1 created`. Card in To Do with labels `QA`, `SMOKE-TEST`. Reporter shows the Contributor (server-stamped). |
| 5 | Two people press **Create** at the same moment in `QAS`. | Keys are different (e.g. `QAS-2`, `QAS-3`). |
| 6 | Open `QAS-1`, edit the summary, then **Save** (or Ctrl+S) in the bar at the bottom of the panel. | Key unchanged; History tab shows "changed Summary". |
| 7 | Change status via the status button → **In Progress**. | Card moves column; History shows `To Do → In Progress`. |
| 8 | Drag a card to **Done**; then use the card **⋯** menu → *Move to To Do* (keyboard: Tab to card, Shift+F10). | Both move the card and record history; Done sets *Resolved*. |
| 9 | Add a comment (Ctrl+Enter). Edit it. | Author = you, relative timestamp, "edited" marker. Another user's comment has no Edit button. |
| 10 | Board filters: assignee avatar, Type, Priority, Label, search text. | Columns reload from the server; counts reflect filters; "Clear filters" resets. |
| 11 | **Your work** tabs: Assigned / Reported / Overdue / Recently updated. | `QAS-1` appears in Overdue while not Done. |
| 12 | Global search: type `QAS-1`, Enter. Type part of a summary. | Opens the issue panel; summary search lists matches. |
| 13 | Copy key button; `#/browse/QAS-1` deep link. | Key copied; deep link opens the board with the panel. |
| 14 | Lead: **Project settings → Details**, change key to `QAX`. | "The key is locked because issues exist." |
| 15 | Lead: **Project settings → Boards & columns**, rename In Progress → *Doing*, WIP 1, move a column up. | Board reflects the name/order; header shows "Over WIP" when exceeded. |
| 16 | Outsider: open `#/projects/QAS/board`. | "You do not have access to this project." |
| 17 | Stakeholder (add the Outsider as Stakeholder): open the board and an issue. | No Create button, no drag, read-only notice in the panel, no composer. |
| 18 | Lead: **Archive project** (Details → Danger zone). | Project hidden from the list (unless *Show archived*), board read-only. Restore re-enables editing. |
| 19 | Mock only: `piraMock.failNext('transitionIssue')`, then move a card. | Error toast; card returns to its original column; nothing persisted. |
| 20 | Toggle the sun/moon button, reload. | Theme persists (localStorage `pira-theme`). |
| 21 | Keyboard: Tab through the shell, `/` focuses search, `C` creates, `M` focuses the comment box, Esc closes the panel. | All reachable with visible focus rings. |
| 22 | Outsider: in make.powerapps.com → Tables → Issues → Edit, add a row for `QAS` (or POST via the Web API). | Rejected: `[PROJECT_ACCESS_DENIED]` from plug-in 2 (post-operation), and no row is left behind. |
| 23 | Contributor: in the table editor, change `QAS-1`'s Issue Key to `QAS-99`. | Rejected: `[ISSUE_IMMUTABLE]`. |

## 3. Known Phase 1 limitations

- **Reads** aren't restricted per project: a user with the Pira User role can read other projects through the Web API. Writes are enforced by the low-code plug-ins. The acceptance criterion "cannot retrieve project data through direct API requests" is **not yet met** for reads; it needs owner teams or sharing.
- Key allocation runs in plug-in 1 (sequence row written before it's read) with the `wd_issuekey` alternate key as the uniqueness backstop; confirm with step 5.
- Label history is written by the client after the label change (the UI warns if it fails); all other issue history is written by the plug-ins in the same transaction.
- Low-code plug-ins are a Microsoft preview feature.
