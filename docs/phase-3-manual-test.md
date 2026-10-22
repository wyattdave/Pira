# Phase 3 — Manual test guide and migration notes

Covers the Phase 3 acceptance criteria in [phase-3-team-productivity.md](../phase-3-team-productivity.md): configurable workflows with required fields, project templates, saved filters, bulk edit, attachments, notifications and custom fields.
Run `npm test` first (83 tests: domain, service, mock parity, config parity). This guide covers UI behaviour, permissions and the hosted environment.

## Migration from Phase 2

For environments already running Phase 2 (Platform-Tools was migrated on 2026-10-16):

1. **Schema (done for Platform-Tools).** Seven new tables (Workflow Transition, Saved Filter, Notification, Notification Preference, Issue Attachment, Custom Field, Custom Field Value), Issue **Resolution**, Project **Workflow Statuses / Initial Status / Workflow Template**, and four new values on the Issue and Board Column *Status* choices (Backlog, Blocked, In Testing, Closed). All new columns are nullable; no back-fill is needed. Run order and the option-value step are in the `notes` of [`dist/config/dataverse-tables.json`](../dist/config/dataverse-tables.json). Register the seven new tables and re-register `wd_project`, `wd_issue` and `wd_boardcolumn`.
2. **Security role.** Add the seven tables to **Pira User** with the depths in [dataverse-setup.md](dataverse-setup.md) §1 (note the User-level rows).
3. **Alternate keys.** Workflow Transition (Project + From + To), Notification Preference (User), Custom Field Value (Issue + Custom Field) — §2.
4. **Plug-ins.** Replace **1**, **3** and **7**, create **18–31** ([lowcode-plugins.md](lowcode-plugins.md)). Until plug-in 3 is replaced, project workflows are only checked by the app.
5. **Existing projects keep working unchanged.** A blank *Workflow Statuses* means the default workflow (To Do, In Progress, In Review, Done, any move), exactly as in Phase 2. A lead opts in by saving a workflow or applying a template.
6. **Done vs. resolution.** Existing Done issues have no resolution. Nothing requires one until a lead adds the rule to a transition; existing Done issues are not affected.
7. **Optional:** the email/Teams flow ([notification-flow.md](notification-flow.md)).
8. **Rollback.** Everything is additive. Redeploying the Phase 2 build ignores the new tables and columns; clear *Workflow Statuses* on projects and restore Phase 2's plug-ins 1, 3 and 7 to return to the default workflow everywhere. Issues in Backlog/Blocked/In Testing/Closed must be moved to one of the four original statuses first.

## 1. Setup

### Local (no Dataverse)

`npm run dev`, then open `http://127.0.0.1:5178/dist/index.html?mock`. The mock adds to the Phase 2 data:

| Data | Details |
|---|---|
| WEB project | Uses the **Bug tracking** template: To Do, In Progress, Blocked, In Testing, Done, Closed. Done needs a resolution (and an assignee from In Progress/In Testing). Custom fields Severity, Environment, Customer reported (Bugs only). |
| PIRA project | Default workflow; custom field **Customer impact** (single choice, all types). |
| Notifications | Three for you: a mention and an assignment (unread), a status change (read). |
| Saved filters | "My open work" (yours, only you) and "Open bugs" (Priya's, shared). |

Failure injection: `piraMock.failNext('saveWorkflow')`, `piraMock.failNext('uploadAttachment')`, and for bulk edit `piraMock.failNext('bulk:PIRA-7')` makes that one issue fail.

### Hosted

Phase 2 setup plus the migration steps above, with the same Lead / Contributor / Stakeholder / Outsider identities. Use a second browser profile for the second person.

## 2. Workflow and templates

| # | Steps | Expected |
|---|---|---|
| W1 | Lead: **Project settings → Workflow** on a Phase 2 project. | "This project uses the default workflow…". Statuses list, initial status, transition matrix and required fields. |
| W2 | Untick **In Review** while issues are In Review, then **Save workflow**. | "N issues still use In Review. Move them to another status before removing it." Nothing changes. |
| W3 | Tick **Blocked**. | Blocked is added at the bottom, connected both ways to every status (untick to restrict). Moving it up/down reorders the board columns after Save. |
| W4 | Untick the To Do → Done cell. In *Required fields per transition*, tick **Resolution** for In Progress → Done. Save. | "Workflow saved". The board shows a Blocked column. To Do → Done is gone from the card ⋯ menu and the issue panel's status menu. Resolution can't be ticked for transitions into non-done statuses. |
| W5 | Drag a card from **To Do** to **Done** (or use the menu if offered). | "That status change is not allowed by the project workflow."; the card snaps back. |
| W6 | Move an In Progress card to **Done**. | A dialog asks for a **Resolution**. Cancel → the card stays. Choose *Won't Do* → the card moves; the panel shows **Resolution: Won't Do**; history has Status and Resolution rows. |
| W7 | Move it back to **To Do**. | Resolution disappears (cleared) and Resolved On is cleared. |
| W8 | Contributor opens **Workflow**. | "Leads only". |
| W9 | Hosted, as a contributor: Web API `PATCH wd_issues(<id>)` with `wd_status` = Done on an issue in To Do (not allowed by the workflow). | `[INVALID_TRANSITION]`; nothing saved. Same with In Progress → Done without `wd_resolution`: `[REQUIRED_FIELD_MISSING]`. **(Acceptance: rejected server-side even through the API; required fields validated during the transition.)** |
| W10 | **Workflow → Start from a template → Bug tracking → Apply template**. | Confirmation explains what changes. The workflow becomes the template's; Severity, Environment and Customer reported are added under Custom fields (applying again adds nothing). Fails with the "still use" message if issues sit in a status the template drops. |
| W11 | **Projects → Create project**, pick **Scrum**. | Project type switches to Scrum; the board has To Do / In Progress / In Review / Done; Done needs a resolution. |

## 3. Saved filters

| # | Steps | Expected |
|---|---|---|
| F1 | **Issues** → set Type = Bug, Open only → **Saved filters → Save current filters…**, name "Open bugs", *Project members*. | Saved; a pill shows the active filter. Menu lists it under *Your filters · Project members*. |
| F2 | Second person (member) opens **Saved filters**. | "Open bugs" appears under *Shared in this project* with your name. Selecting it shows only the issues **they** can read. They can't rename or delete it (no *Manage* entry for it). |
| F3 | Save a filter with **Assigned to me**, share it, run it as the second person. | It shows the second person's issues, not yours ("me" means whoever runs it). |
| F4 | Change any toolbar control while a saved filter is active. | The pill disappears; the toolbar now drives the list. |
| F5 | **Manage your filters…** → rename, switch to *Only me*, *Use current filters*, **Delete**. | Each saves with a toast; deleting a shared filter warns that others lose it. |
| F6 | Hosted security: as the second person, Web API `PATCH wd_savedfilters(<your filter>)`. | 403 (Write is User level). Reading the filter shows only JSON criteria, never issue data. **(Acceptance: shared filters don't leak restricted record details.)** |

## 4. Bulk edit

| # | Steps | Expected |
|---|---|---|
| B1 | **Issues** as a contributor: tick 4 issues. | Selection bar: "4 selected · Bulk edit · Clear selection". Stakeholders see no checkboxes. More than 50 selected disables Bulk edit. |
| B2 | **Bulk edit** → Field *Priority* → *Highest* → **Preview**. | Count summary ("3 will change · 1 already set · 0 can't change") and a row per issue with current → new value and outcome. Nothing saved yet. |
| B3 | **Apply**. With `piraMock.failNext('bulk:PIRA-7')` set first (mock), or with one issue the user can't edit (hosted, e.g. archived or from a stakeholder-only project via the API). | Results: "2 updated · 1 failed · 1 skipped" with the reason per issue. **Retry 1 failed** retries only that issue. **(Acceptance: no unauthorised updates; accurate success/failure reporting.)** |
| B4 | Bulk *Status → Done* on a workflow that requires a resolution, without choosing one. | Preview marks those issues "Can't change: Choose a resolution." Choose a resolution and Preview again → they change. Transitions the workflow doesn't allow are reported per issue. |
| B5 | Watch the assignee's notifications after a bulk edit of 10 of their issues. | **One** "Bulk changed" summary, not ten. |

## 5. Attachments

| # | Steps | Expected |
|---|---|---|
| A1 | Open an issue → **Attachments → + Attach file** (or drop files on the section). | Upload shows "Uploading <name>…"; the row shows name, size, uploader and time; history: "added an attachment". |
| A2 | Attach `tool.exe`, `page.html` or a file over 10 MB. | Refused with a clear message before anything is uploaded. |
| A3 | Click the file name. | It downloads with its name. No link opens in a new tab; nothing public is created. |
| A4 | Second person (member) sees the file, can download it, but has no delete button; the uploader can delete it (confirmation, history row). | |
| A5 | Hosted: as a user **without** the Pira User role, Web API `GET wd_issueattachments(<id>)/wd_file/$value`. | 403. **(Acceptance: attachments aren't accessible without permission to the underlying records.)** See the read-access note in [dataverse-setup.md](dataverse-setup.md#known-gap-project-level-read-access). |
| A6 | Archive the issue, try to attach. | "This issue is archived and read-only." |

Storage: Dataverse **file column** `wd_file` on *Issue Attachment*, max 10 MB per file (column setting and `LIMITS.attachmentMaxBytes`), up to 20 files per issue. Uses the environment's file storage capacity. To change the size, update both the column's *Maximum file size* and `attachmentMaxBytes`. SharePoint storage is not used.

## 6. Notifications

| # | Steps | Expected |
|---|---|---|
| N1 | Person B assigns an issue to person A. | A's bell shows a badge within 2 minutes (or immediately on refocusing the tab). The panel: "B assigned you KEY". Clicking it marks it read and opens the issue. |
| N2 | B comments "@A's full name …" (type `@` and pick from the list). | A gets one **mention** notification (not an extra comment notification). Mentioning someone outside the project does nothing. |
| N3 | B moves A's issue to another status / comments on it. | A gets "moved KEY In Progress → Done" / "commented on KEY". B never gets notified about their own changes. |
| N4 | A: bell → ⚙ **Notification settings** → untick *Comments on my issues*. | Comment notifications disappear from the list and count; turning it back on brings them back. Email/Teams need the optional flow. |
| N5 | Hosted: delete the Notifications table privilege from the role temporarily (or break the plug-in) and assign an issue. | The assignment saves; only the notification is missing (console warning). **(Acceptance: notification failures never roll back a save.)** |
| N6 | Inspect a notification row in Dataverse. | Recipient, issue (key only), project, event and a short detail. No summary, description or comment text. |

## 7. Custom fields

| # | Steps | Expected |
|---|---|---|
| C1 | Lead: **Project settings → Custom fields → + Add custom field**: "Estimate hours", Number, Task only. | The editor shows "Shown in: Issue panel → Details, for Task". The list shows type, where it appears and options. |
| C2 | Add another field called "estimate hours". | "Another field in this project already uses that name." |
| C3 | Open a Task → Details → *Estimate hours* = `12.5x`. | Save is disabled; the bar shows "Estimate hours must be a number (up to 4 decimal places)." `12.5` saves; history shows the change. |
| C4 | Open a Bug. | *Estimate hours* isn't shown (Task only). |
| C5 | Single choice field: remove an option that issues use. | Existing values stay and show "(retired)" in the dropdown; they can't be chosen again. |
| C6 | **Retire** a field, then **Restore** it. | Hidden from issues while retired; values come back when restored. The type can't be edited. |
| C7 | Hosted: Web API create a Custom Field Value with a `wd_numbervalue` on a Single choice field, or a choice not in the options. | `[INVALID_CUSTOM_FIELD_VALUE]`. **(Acceptance: type/value mismatches rejected.)** |

Limitations (by design for Phase 3): five types only (text, number, date, yes/no, single choice); no formulas, multi-select, user or lookup fields, default values, required custom fields or per-board field contexts; custom fields aren't searchable or filterable yet and aren't on the create dialog; up to 20 active fields per project. A Yes/No value that was cleared may read back as "No" because Dataverse Yes/No columns default to No.

## 8. Accessibility and themes

| # | Steps | Expected |
|---|---|---|
| X1 | Light and dark mode: new status pills (Backlog dashed grey, Blocked dashed accent, In Testing tinted outline, Closed solid grey), bell badge, workflow matrix, bulk preview table. | Readable in both themes; no new colours beyond the accent and greys. |
| X2 | Keyboard only: bell (Enter/Esc), transition dialog, workflow matrix checkboxes, bulk edit steps, mention list (↑/↓/Enter/Esc). | All reachable and operable; Esc closes the bell panel and dialogs. |
