# Phase 4 — Manual test guide and migration notes

Covers the approved Phase 4 candidates in [phase-4-design.md](phase-4-design.md): time tracking, releases and versions, advanced querying, analytics, CSV import/export and dependency visualisation. Automation rules weren't approved and aren't built.
Run `npm test` first (119 tests, including `phase4-domain`, `phase4-service` and `phase4-features`). This guide covers UI behaviour, permissions and the hosted environment.

## Migration from Phase 3

For environments already running Phase 3 (Platform-Tools was migrated on 2026-10-21):

1. **Schema (done for Platform-Tools).** Two new tables, **Version** and **Work Log**, and five new Issue columns: *Original Estimate*, *Remaining Estimate*, *Time Spent*, *Fix Version* (lookup) and *Started On*. All are nullable, so no back-fill is needed. Issues created before Phase 4 have no *Started On* until they next move into an in-progress status, so early cycle-time figures cover fewer issues. Register the two new tables and re-register `wd_issue`.
2. **Security role.** Add Version and Work Log to **Pira User** with the depths in [dataverse-setup.md](dataverse-setup.md) §1. Work Log has **no Delete** privilege.
3. **Alternate key.** Version (Project + Version Name), §2.
4. **Plug-ins.** Replace **1**, then create **32–36** ([lowcode-plugins.md](lowcode-plugins.md)). Done on Platform-Tools.
5. **Feature flags.** `FEATURES` in [`dist/config/app-config.js`](../dist/config/app-config.js). All six are on. Turning one off hides it and makes the data service refuse its calls; nothing else changes.
6. **Rollback.** Everything is additive. Turn the flags off, or redeploy the Phase 3 build, which ignores the new tables and columns. Disable plug-ins 32–36 and restore Phase 3's plug-in 1 to stop the server-side checks.

## 1. Setup

### Local (no Dataverse)

`npm run dev`, then open `http://127.0.0.1:5178/dist/index.html?mock`. You're **Alex Morgan**, lead of PIRA. The mock adds to the Phase 3 data:

| Data | Details |
|---|---|
| Versions (PIRA) | **1.0** released 20 days ago, **1.1** due in 10 days, **2.0** due in 45 days, **0.9 beta** archived. |
| Estimates and work logs | PIRA-2: 16h estimated, 6h remaining, logs by Priya (6h) and you (4h). PIRA-3: 32h / 24h, a log by Jordan (8h) and a **voided** duplicate (2h, "Logged twice by mistake."). PIRA-4: 8h / 4h. PIRA-5: 4h original, no remaining. |
| History | 18 resolved issues over the last 12 weeks (fix version 1.0) to feed Reports. |
| Blocks links | PIRA-9 → PIRA-2, PIRA-3 → PIRA-5, PIRA-11 → PIRA-5, PIRA-12 → PIRA-11. |

Failure injection: `piraMock.failNext('<operation>')` with `logWork`, `updateWorkLog`, `voidWorkLog`, `createVersion`, `updateVersion`, `releaseVersion`, `setVersionState`, `previewCsvImport`, `importCsvIssues`, `getAnalytics` or `getDependencyGraph`.

### Hosted

Phase 3 setup plus the migration steps above, with the same Lead / Contributor / Stakeholder / Outsider identities. Use a second browser profile for the second person.

## 2. Time tracking

| # | Steps | Expected |
|---|---|---|
| T1 | Open PIRA-2. | **Time tracking** shows logged 10h and remaining 6h against a 2d original estimate, with both work logs (newest first) and their authors. |
| T2 | **Log work**: `3h`, today, a comment. | The remaining estimate is pre-filled as **3h** ("Reduced automatically…"). After **Log work**: toast "3h logged on PIRA-2"; logged 13h, remaining 3h; Activity shows the work log. |
| T3 | Log work with `2`, `25h`, `0m`, a future date or a date over a year ago. | Each is refused next to the field (bare numbers need a unit; up to 24h per entry; date rules). Nothing is saved. |
| T4 | Log `5h` on an issue with 3h remaining. | Remaining becomes **0m**, never negative. |
| T5 | Edit your own log (change it to 2h). | "Work log updated"; time spent changes by the difference; history records old → new. |
| T6 | On PIRA-3, look at Jordan's log as Alex (lead). | **Void** is offered but **Edit** isn't. The voided log is struck through with "Voided: Logged twice by mistake." and has no buttons. |
| T7 | Void Jordan's 8h log with no reason, then with a reason. | A reason is required. After voiding: "Work log voided", time spent drops by 8h, the log stays visible and struck through, and history shows the reason. |
| T8 | Edit an issue's **Original estimate** (`1d 4h`) and **Remaining estimate** in the issue form; try `abc` and `5`. | Saved as 12h; history rows for both. Invalid values are refused next to the field. |
| T9 | New issue with an original estimate of `1d`, no work logged. | Remaining estimate is also 1d. |
| T10 | Stakeholder opens an issue. | Time tracking is visible but there's no **Log work**. |
| T11 | Hosted, as a contributor: Web API `POST wd_worklogs` with `wd_minutes` = 2000, then a valid log on an issue in a project they aren't a member of. | `[INVALID_WORK_LOG] Log between 1m and 24h per entry.`, then `[PROJECT_ACCESS_DENIED] Only leads and contributors can log work.` **(Acceptance: entries validated server-side.)** |
| T12 | Hosted, as a contributor: `PATCH` someone else's work log; `DELETE` any work log. | `[PROJECT_ACCESS_DENIED] Only the person who logged the work can change it; project leads can void it.`; delete is refused by the security role. **(Acceptance: auditable history.)** |
| T13 | Hosted: `PATCH wd_issues(<id>)` with `wd_timespent` = 1. | Accepted, but *Time Spent* still equals the sum of non-voided logs: plug-in 36 replaces any direct change (plug-in 1 blanks it on create). |
| T14 | Mock: `piraMock.failNext('logWork')`, then log work. | Friendly error; the dialog stays open with the values entered. |

## 3. Releases and versions

| # | Steps | Expected |
|---|---|---|
| R1 | PIRA → **Releases**. | **Versions** tab lists 1.1, 2.0 (unreleased) and 1.0 (released) with progress bars, start and release dates; **Show archived (1)** reveals 0.9 beta. |
| R2 | **+ Create version** named `1.1`. | "Another version in this project already uses that name." Nothing saved. A release date before the start date is also refused. |
| R3 | Create `1.2` with a release date. | "Version 1.2 created". It appears in the issue panel's **Fix version** list and in the advanced query. |
| R4 | Set PIRA-4's **Fix version** to 1.1. | Saved; history row; the 1.1 progress bar includes it. Archived 0.9 beta isn't offered (it stays visible only on issues that already use it). |
| R5 | **Release** 1.1 with unfinished issues. | The dialog shows how many are unfinished and asks: **Move to** (another unreleased version), **Remove their fix version** or **Leave them in 1.1**. With *Move to* 2.0: "1.1 released · N issues moved"; the issues now show 2.0 and have history rows. |
| R6 | Mock: `piraMock.failNext('releaseVersion')` and release 2.0. | Friendly error; 2.0 stays unreleased. Releasing again finishes the job. |
| R7 | ⋯ on 1.1 → **Unrelease**; ⋯ on 2.0 → **Archive**; then **Restore (unreleased)**. | State changes each time. An archived version can't be chosen as a fix version, but its issues keep it. |
| R8 | **Release calendar** tab. | Month view with unreleased versions on their release date and released ones on the day they shipped; overdue versions are highlighted. **Previous/Next month** and **Today** work. Selecting a version opens Issues filtered to it. |
| R9 | Contributor opens **Releases**. | Read-only: no **+ Create version**, **Release** or ⋯ menu. |
| R10 | Hosted, as a contributor: `POST wd_versions`. | `[PROJECT_ACCESS_DENIED] Only project leads can manage versions.` |
| R11 | Hosted: `PATCH wd_issues(<id>)` with a fix version from another project, then an archived one. | `[VERSION_PROJECT_MISMATCH] …`, then `[VERSION_ARCHIVED] …`. |

## 4. Advanced querying

| # | Steps | Expected |
|---|---|---|
| Q1 | **Issues → Advanced**. | The query builder appears: **Match all (AND) / Match any (OR)**, **+ Condition**, **+ Group**, **Reset**, **Apply** and the hint "Runs on the server as you. Not JQL…". |
| Q2 | Build: Type *is* Bug **AND** group (Assignee *is empty* **OR** Fix version *is* 2.0). **Apply**. | The list shows only matching issues. The pill describes the query in words. |
| Q3 | Each operator kind: text *contains*; date *in the last 7 days* and *is before*; number *greater than*; label *is none of*; a custom field (e.g. Customer impact). | Results match. "Is none of" includes issues with no value; numeric comparisons never match empty values. |
| Q4 | Leave a value empty, or add more than 20 conditions. | Errors next to the condition (or a limit message). Nothing runs. |
| Q5 | Save the query (**Saved filters → Save current filters…**) as *project-shared*, using Assignee *is* **Me**. Run it as the second person. | It opens in Advanced mode with the same conditions and shows the **second person's** issues. |
| Q6 | Switch back to **Basic**, then to **Advanced** again. | Basic shows the list filtered by the basic filters only. Back in Advanced, the applied query and its conditions are still there. |
| Q7 | Browser dev tools, Network: run Q2 on the hosted app. | One `wd_issues?$filter=…` request; the filtering is done by Dataverse (paged), not in the browser. **(Acceptance: server-side filtering.)** |
| Q8 | Edit a saved filter row in Dataverse so its query uses an unknown field (e.g. `"sField":"createdby/fullname"`) or operator, then run it in Pira. | The unknown condition is dropped (or "That query isn't valid…" if nothing usable is left). Nothing but allowlisted fields reaches OData. **(Acceptance: allowlisted fields and operators only.)** |

## 5. Reports

| # | Steps | Expected |
|---|---|---|
| A1 | PIRA → **Reports**. | Tiles for lead time and cycle time (median, with 85th percentile), resolved, overdue now; Throughput (**Issues / Points**), Overdue trend (end of week), Sprint outcomes, Time tracking. "How these are calculated" lists the definitions. |
| A2 | Change **Reporting window** to 4 / 26 weeks. | Figures recalculate; issues resolved before the window are excluded. |
| A3 | Compare the figures with the definitions in [phase-4-design.md](phase-4-design.md#analytics), using the mock data (or a small hosted project you can count by hand). | They agree. **(Acceptance: definitions documented and validated; the automated version is in `phase4-domain.test.mjs`.)** |
| A4 | Move an issue into In Progress, then Done; reload Reports. | It counts in cycle time. Moving it back to In Progress and Done again keeps its first *Started On*. |
| A5 | Hosted: a person who isn't a member of the project opens its Reports link. | "You do not have access to this project". A member only gets figures from issues they can read. |
| A6 | Mock: `piraMock.failNext('getAnalytics')`. | Friendly error with **Retry**. |

## 6. CSV import and export

| # | Steps | Expected |
|---|---|---|
| C1 | **Issues** with a filter → **CSV → Export these issues**. | The download has exactly the listed issues ("Exported N issues"). It opens in Excel with accents intact. |
| C2 | Give an issue the summary `=HYPERLINK("http://example.com")` and export. | The cell starts with an apostrophe and Excel shows it as text, not a formula. |
| C3 | **CSV → Import from CSV… → Template**, fill 3 rows (one with assignee by email, one by full name, one with an unknown assignee and a bad date). | The preview says "2 issues ready to create · 1 row with problems (skipped)" and lists the problems per row. Nothing is created yet. |
| C4 | Add a **Status** column and an unknown column. | "Ignored columns: …. Status is never imported…". |
| C5 | **Import**. | Progress "Creating issues… 1 of 2"; results list each row with its new key; "2 issues imported". The issues start in the initial status with history rows. |
| C6 | Mock: `piraMock.failNext('importCsvIssues')`, import, then **Retry failed rows**. | Only the failed rows are retried; successful rows aren't duplicated. |
| C7 | Import a file over 1 MB or with more than 200 rows. | Refused before anything is created. |
| C8 | Stakeholder opens **CSV**. | Only **Export these issues**. |

## 7. Dependencies

| # | Steps | Expected |
|---|---|---|
| D1 | PIRA → **Dependencies**. | Open issues linked by "blocks": PIRA-12 → PIRA-11 → PIRA-5 and PIRA-3 → PIRA-5 in layers, blockers on the left. Unfinished issues blocked by unfinished work are marked. |
| D2 | **Scope → Version → 1.1** (or a sprint or epic). | Only that scope; linked issues outside it appear dashed ("outside this scope"). |
| D3 | Tick **Show "relates to" links**. | Dashed lines appear; layers don't change. |
| D4 | Link PIRA-5 **blocks** PIRA-12, reload. | A "blocking loop" notice; the looped issues are flagged in a final column; "(loop)" appears in **Links as a list**. |
| D5 | Select a node. | The issue panel opens. Keyboard: Tab reaches each node; Enter opens it. |

## 8. Feature flags

| # | Steps | Expected |
|---|---|---|
| X1 | Set all six `FEATURES` to `false`, reload. | No Releases, Dependencies or Reports in the sidebar; no Advanced or CSV on Issues; no Fix version, estimates or Time tracking in the issue panel. Boards, issues, sprints, comments and saved filters work as in Phase 3. |
| X2 | With flags off, open `…#/projects/PIRA/reports`. | "Page not found"; no Phase 4 requests are sent. |
| X3 | Set them back to `true`. | Everything returns; no data was lost. |
