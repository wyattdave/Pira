# Pira — Dataverse low-code plug-ins

Pira's server-side rules run as **automated low-code plug-ins** (Power Fx), so no .NET SDK or C# assembly is needed. They replace the C# plug-in / Custom APIs planned in [server-side-dataverse.md](../server-side-dataverse.md).

The app is already switched over: `SERVER_LOGIC = 'lowcode'` in [`dist/config/app-config.js`](../dist/config/app-config.js). In this mode the app no longer allocates issue keys or writes issue history. **Create the plug-ins before you deploy the app.** If they're missing, creating an issue fails with "Pira's Dataverse plug-ins are not installed…" and the unnumbered row is archived. To run without the plug-ins for a while, set `SERVER_LOGIC` to `'client'` and redeploy.

> **Preview feature.** Microsoft documents automated low-code plug-ins as preview: "not meant for production use". Platform-Tools is a Production-type environment. Instant low-code plug-ins have already been dropped in favour of *Functions*. Re-check the feature status before relying on this for real work, and keep the `'client'` fallback in mind.

## How the plug-ins know who is acting

`User()` is **not available** in low-code plug-ins (the editor reports "'User' is a recognized but not supported function"), and there is no other "current user" function. Pira therefore uses the columns Dataverse stamps with the calling user itself:

- **`Created By`** on create, **`Modified By`** on update. The client can't set these, and they're only reliable once the row is saved.
- So every "is this person allowed?" check runs in a **post-operation** plug-in. Post-operation plug-ins run inside the same database transaction, so `Error()` there **rolls back the whole save**, including anything the pre-operation plug-in did (key number, history rows).
- Everything that doesn't depend on the user (key allocation, transitions, immutable fields, history) stays in **pre-operation**, because only pre-operation can change the incoming row (`Set(NewRecord.…)`).

One consequence for memberships: a post-operation check can't tell "a lead stepping down" from "a contributor promoting themselves". So **nobody can change their own membership**; another lead does it. That also guarantees a project always keeps a lead. The app enforces the same rule (your own row is read-only in Project settings → Members).

## What the plug-ins enforce

| # | Plug-in | Table | Event | Stage | Rules |
|---|---|---|---|---|---|
| 1 | Pira · Issue · Before create | Issues | Create | Pre-operation | Project exists and is active; parent is in the same project **and a higher type (Epic → Story → Task/Bug)**; **sprint is in the same project and Planned/Active**; **allocates the issue key**; forces the **project's initial status** (Phase 3; To Do for the default workflow), Resolution blank and Archived = No |
| 2 | Pira · Issue · After create | Issues | Create | Post-operation | Creator is an active lead/contributor (else rolled back); writes the "created" history row |
| 3 | Pira · Issue · Before update | Issues | Update | Pre-operation | Key, sequence and project are immutable; archived issues and projects are read-only; **status change must be an allowed transition of the project's workflow** (Phase 3: active Workflow Transition rows when the project has its own workflow, else any move between the four default statuses); **the transition's required fields (resolution, assignee, story points, due date) must be filled in the same update**; parent rules incl. **type levels and type changes vs. children**; **completed/cancelled sprints keep their issues; new sprint must be open and in the project**; stamps/clears Resolved On; **clears Resolution when leaving Done/Closed**; writes status, field (incl. story points, resolution), **sprint** and archive history |
| 4 | Pira · Issue · After update | Issues | Update | Post-operation | Modifier is an active lead/contributor (else rolled back) |
| 5 | Pira · Comment · After create | Issue Comments | Create | Post-operation | Issue not archived; author is an active lead/contributor; writes "commented" history |
| 6 | Pira · Project · Before create | Projects | Create | Pre-operation | Key upper-cased, 2–10 characters, unique; state = Active |
| 7 | Pira · Project · Before update | Projects | Update | Pre-operation | **Key locked once issues exist**; key format and uniqueness; Phase 3: **workflow status list format, initial status is an open listed status, no issues left in a removed status** |
| 8 | Pira · Project · After update | Projects | Update | Post-operation | Only project leads can change a project |
| 9 | Pira · Member · After create | Project Members | Create | Post-operation | Only project leads add people; the project's creator may add themselves as the first lead |
| 10 | Pira · Member · Before update | Project Members | Update | Pre-operation | Project and person can't change; stamps Removed On |
| 11 | Pira · Member · After update | Project Members | Update | Post-operation | Only project leads; nobody changes their own row (so a lead always remains) |
| 12 | Pira · Sprint · Before create | Sprints | Create | Pre-operation | Phase 2. Project active; board in the same project; end not before start; state forced to Planned |
| 13 | Pira · Sprint · Before update | Sprints | Update | Pre-operation | Phase 2. Project/board immutable; **allowed state moves only**; **one active sprint per board**; dates required to start; **completed sprints locked** except a reopen with a new correction note; cancelled sprints locked; stamps Started On / Completed On |
| 14 | Pira · Sprint · After create | Sprints | Create | Post-operation | Phase 2. Creator is an active lead/contributor |
| 15 | Pira · Sprint · After update | Sprints | Update | Post-operation | Phase 2. Modifier is an active lead/contributor; **only leads may reopen a completed sprint** |
| 16 | Pira · Board Issue · After create | Board Issues | Create | Post-operation | Phase 2. Board and issue in the same project; not the default board; no duplicate row; creator is a lead/contributor |
| 17 | Pira · Issue Link · After create | Issue Links | Create | Post-operation | Phase 2. **No self links, duplicate directed links or contradictory pairs** (A blocks B and B blocks A); Relates To is symmetric; creator is a lead/contributor of the From issue's project |
| 18 | Pira · Workflow Transition · After create | Workflow Transitions | Create | Post-operation | Phase 3. **Leads only**; project active; two different catalogue statuses; no duplicate; resolution can only be required into Done/Closed |
| 19 | Pira · Workflow Transition · After update | Workflow Transitions | Update | Post-operation | Phase 3. **Leads only**; project and statuses can't change (deactivate instead); resolution rule |
| 20 | Pira · Custom Field · After create | Custom Fields | Create | Post-operation | Phase 3. **Leads only**; name required and unique in the project; single choice needs options |
| 21 | Pira · Custom Field · After update | Custom Fields | Update | Post-operation | Phase 3. **Leads only**; project and **field type can't change**; name unique; single choice needs options |
| 22 | Pira · Custom Field Value · After create | Custom Field Values | Create | Post-operation | Phase 3. Field and issue in the same project; field active; issue not archived; **only the column for the field's type holds a value; choice values must be one of the options; field must apply to the issue type**; creator is a lead/contributor |
| 23 | Pira · Custom Field Value · After update | Custom Field Values | Update | Post-operation | Phase 3. Same as 22 for the modifier; issue and field can't change |
| 24 | Pira · Notification · After create | Notifications | Create | Post-operation | Phase 3. **Recipient is an active member of the project** (no notifications about projects people can't see); issue belongs to the project; nobody notifies themselves; sender is a lead/contributor; starts unread and pending |
| 25 | Pira · Notification · After update | Notifications | Update | Post-operation | Phase 3. Content (recipient, issue, project, event, detail, count) can't change; **only the recipient marks it read** |
| 26 | Pira · Issue Attachment · After create | Issue Attachments | Create | Post-operation | Phase 3. Issue exists and isn't archived; uploader is a lead/contributor of the issue's project |
| 27 | Pira · Issue Attachment · After update | Issue Attachments | Update | Post-operation | Phase 3. The issue can't change; archived issues' files are read-only |
| 28 | Pira · Notification Preference · After create | Notification Preferences | Create | Post-operation | Phase 3. People only create their own preferences; one row per person |
| 29 | Pira · Notification Preference · After update | Notification Preferences | Update | Post-operation | Phase 3. The person can't change |
| 30 | Pira · Saved Filter · After create | Saved Filters | Create | Post-operation | Phase 3. Creator is an active member of the filter's project |
| 31 | Pira · Saved Filter · After update | Saved Filters | Update | Post-operation | Phase 3. The project can't change |
| 32 | Pira · Version · After create | Versions | Create | Post-operation | Phase 4. **Leads only**; project active; name required and unique in the project; release date not before start date; new versions start Unreleased |
| 33 | Pira · Version · After update | Versions | Update | Post-operation | Phase 4. **Leads only**; project can't change; unique name; dates in order; Released needs a release date |
| 34 | Pira · Work Log · After create | Work Logs | Create | Post-operation | Phase 4. Issue in the log's project and not archived; **1 minute to 24 hours**; work date within the last year and not in the future; not created voided; author is a lead/contributor; **recalculates the issue's Time Spent** (sum of non-voided logs) and writes a "worklog" history row |
| 35 | Pira · Work Log · After update | Work Logs | Update | Post-operation | Phase 4. Issue/project can't change; **voided logs are locked**; only the **author** edits; a **lead may only void** someone else's log; voiding needs a reason; same duration/date rules; recalculates Time Spent; history |
| 36 | Pira · Issue · Before update (Phase 4) | Issues | Update | Pre-operation | Phase 4. **Fix version must be an active version of the issue's project**; **Started On** is stamped the first time the issue enters an in-progress status and can't be edited otherwise; **Time Spent can't be written directly** (any change is replaced by the sum of non-voided work logs); fix version and estimate history. Kept separate from plug-in 3, which is close to the 10,000-character limit |
| 37 | Pira · Epic Solution · After create | Epic Solutions | Create | Post-operation | Phase 5. Issue is an **unarchived epic** in the row's (active) project; **one row per epic and stage**; a link is complete (environment id, https Dataverse URL, solution GUID, SchemaName) or empty; creator is a lead/contributor; "solution:&lt;stage&gt;" history on the epic |
| 38 | Pira · Epic Solution · After update | Epic Solutions | Update | Post-operation | Phase 5. **Epic, project and stage can't change**; epic not archived, project active; link complete or fully cleared (unlink); same URL/id checks; modifier is a lead/contributor; history when the environment or solution changes |
| 39 | Pira · Issue · Before update (Phase 5) | Issues | Update | Pre-operation | Phase 5. **Solution Version only on stories** (cleared automatically on other types); up to four dotted numbers (`[INVALID_SOLUTION_VERSION]`); "solutionVersion" history |

Errors start with a code such as `[PROJECT_ACCESS_DENIED]`; the app turns these into friendly messages (`parseServerError` in `dist/js/domain.js`).

What stays in the app: rank (card order), label, link, board-membership, custom-field and attachment history (those live in their own tables), comment-edit rules (the security role already limits Write to the author), notification creation (best effort, after the save; see [notification-flow.md](notification-flow.md)), bulk edit orchestration (each issue is still saved through plug-ins 3 and 4), and early validation for nicer messages.

**Phase 2 upgrade (environments already running Phase 1):** replace the formulas of plug-ins **1** and **3** with the versions below, then create plug-ins **12–17**. Plug-ins 2 and 4–11 are unchanged.

**Phase 3 upgrade (environments already running Phase 2):** replace the formulas of plug-ins **1**, **3** and **7**, then create plug-ins **18–31**. Plug-ins 2, 4–6 and 8–17 are unchanged. Projects without a saved workflow keep the default rules, so existing projects behave exactly as before until a lead saves a workflow.

**Phase 4 upgrade (environments already running Phase 3):** replace the formula of plug-in **1** (adds the fix-version check, Started On for in-progress initial statuses, and clears a client-supplied Time Spent), then create plug-ins **32–36**. Everything else is unchanged. The Phase 4 formulas are only kept in [`plugins/`](../plugins) (`32-` to `36-*.fx`, logical names as stored) to avoid two copies drifting apart; to paste one into the Accelerator, swap the logical names for display names as in the sections below.

**Phase 4 deployed with dv-native (2026-10-21):** plug-ins 1 and 32–36 imported into *Pira-plugins* in Platform-Tools (every import compiled) and their steps switched on. Plug-in 36 was redeployed the same day to protect Time Spent.

**Phase 5 upgrade (environments already running Phase 4):** create plug-ins **37–39** from [`plugins/`](../plugins) (`37-` to `39-*.fx`). Nothing else changes. Deployed with dv-native to *Pira-plugins* in Platform-Tools on 2026-10-21 (all three compiled on import, steps switched on). Not yet exercised with real writes: run the Phase 5 rows of *Check they work* below. Plug-in 39 runs on every issue update; if it ever blocks unrelated saves, turn its step off and the app still validates the version client-side.

**Deployed with dv-native (2026-10-16):** plug-ins 1, 3, 7 and 18–31 are in Platform-Tools in the solution *Pira-plugins* (`PiraPlugins`). Their source is in [`plugins/`](../plugins): one `.fx` formula (logical names, as Dataverse stores them) and one `.plugin.json` spec each. Redeploy with `dv-native deploy --spec plugins/<file>.plugin.json --environment https://orgc34f5157.crm.dynamics.com/`, then turn the step on again if needed (dv-native currently imports new steps switched off). **`plugins/` is the deployed source of truth:** Dataverse limits an expression to 10,000 characters, so [`plugins/03-issue-before-update.fx`](../plugins/03-issue-before-update.fx) is a compacted version of the plug-in 3 formula below (same rules; the readable version below is about 13,700 characters).

## Prerequisites

- Your account has System Administrator or System Customizer in Platform-Tools.
- The **Dataverse Accelerator** app is installed (Power Platform admin center → Environments → Platform-Tools → Resources → Dynamics 365 apps). Update it if an update is offered.
- Recommended: a **Pira** solution with publisher **wyattdave** (see [dataverse-setup.md](dataverse-setup.md) §3) so the plug-ins can move between environments.
- Optional, for debugging: Settings → Advanced settings → Administration → System Settings → Customization → *Enable logging to plug-in trace log* = **All**.

## How to create each plug-in

1. Play the **Dataverse Accelerator** app → **Create automated plug-in** (or **New action → Automated plugin**).
2. **Name**: as in the table above (e.g. `Pira · Issue · Before create`).
3. **Table** and **Run this plug-in rule when the row is**: as in the table.
4. Paste the formula into **Expression**. Check there are no red underlines (yellow delegation warnings are expected on `CountRows`/`Filter` and are fine for project-sized data).
5. **Advanced options** → **When should this run**: as in the table; **Solution**: Pira.
6. **Save**.

If the editor rejects a name, open the table in make.powerapps.com and compare display names. They were taken from the generated schemas in `dist/config/*.Schema.json`. Some likely editor fixes:

- **Status column.** Issues has our *Status* column (`wd_status`) and Dataverse's built-in *Status* (`statecode`, Active/Inactive). When display names clash, Power Fx renames both to `'Status (wd_status)'` / `'Status (statecode)'`, so a plain `NewRecord.Status` doesn't work. The formulas therefore use the logical name `wd_status`, which always resolves; the editor may show it as `'Status (wd_status)'` after saving. If `'Status (Issues)'.'To Do'` is ever flagged, type `'Status` and pick the choice whose values are To Do / In Progress / In Review / Done.
- If the editor treats **Archived** as a Boolean, replace `'Archived (Issues)'.Yes` / `.No` with `true` / `false`.
- If `Text(OldRecord.wd_status)` (or Priority / Issue Type) is rejected, use a `Switch` instead, e.g. `Switch(OldRecord.wd_status, 'Status (Issues)'.'To Do', "To Do", 'Status (Issues)'.'In Progress', "In Progress", 'Status (Issues)'.'In Review', "In Review", "Done")`.
- **"'Sprints' isn't recognized" when editing an existing plug-in.** Seen on plug-in 3 after the Sprints table was added: the editor for a plug-in created before a table existed doesn't know that table. Plug-in 3 therefore reads sprint data through the Issue's own *Sprint* lookup (`OldRecord.Sprint.'Sprint State'`). If another older plug-in hits the same error, delete it and create it again with the same formula. Phase 3's plug-in 3 reads the new *Workflow Transitions* table, so if the editor says it isn't recognized, delete plug-in 3 and create it again with the new formula.
- **Two "Notifications" tables.** Dataverse has a system *Notification* table (in-app notifications, `appnotification`). If the editor shows both, Power Fx names them `'Notifications (wd_notifications)'` and `'Notifications (appnotifications)'`; use the `wd_` one in plug-ins 24–25.
- **Status numbers.** Plug-ins 1, 3 and 7 turn the *Status* choice into its number with a `Switch` (To Do 100000000 … Closed 100000007), because the workflow tables store numbers. Keep that list in step with `ISSUE_STATUSES` in `dist/config/app-config.js`.

Paste any error text back to me and I'll correct the formula.

---

### 1 · Pira · Issue · Before create — Issues · Create · Pre-operation

> Phase 4 adds three rules to this formula (deployed version: [`plugins/01-issue-before-create.fx`](../plugins/01-issue-before-create.fx)): the *Fix Version* must be an unarchived version of the same project (`[VERSION_PROJECT_MISMATCH]` / `[VERSION_ARCHIVED]`); *Time Spent* is cleared (it only comes from work logs); *Started On* is set to now when the project's initial status is an in-progress one.

```powerfx
// Validates the project, parent and sprint, then allocates the issue key on the server.
// Membership is checked by plug-in 2 once Dataverse has stamped Created By.
// Type levels: Epic 1, Story 2, Task/Bug 3. A parent must sit on a lower level number than its child.
With(
    {
        thisProject: LookUp(Projects, Project = NewRecord.Project.Project),
        newParent: LookUp(Issues, Issue = NewRecord.'Parent Issue'.Issue),
        newSprint: LookUp(Sprints, Sprint = NewRecord.Sprint.Sprint),
        childLevel: Switch(NewRecord.'Issue Type', 'Issue Type (Issues)'.Epic, 1, 'Issue Type (Issues)'.Story, 2, 3)
    },
    If(
        IsBlank(thisProject),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_NOT_FOUND] Choose a valid project." }),
        thisProject.'Project State' = 'Project State (Projects)'.Archived,
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] " & thisProject.'Project Key' & " is archived. Restore it before adding issues." }),
        !IsBlank(newParent) && newParent.Project.Project <> thisProject.Project,
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_PARENT_RELATIONSHIP] The parent issue must be in the same project." }),
        !IsBlank(newParent) &&
            Switch(newParent.'Issue Type', 'Issue Type (Issues)'.Epic, 1, 'Issue Type (Issues)'.Story, 2, 3) >= childLevel,
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_PARENT_TYPE] Epics hold Stories, Tasks and Bugs; Stories hold Tasks and Bugs." }),
        !IsBlank(newSprint) && newSprint.Project.Project <> thisProject.Project,
            Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_PROJECT_MISMATCH] Only issues from the sprint's own project can be added to it." }),
        !IsBlank(newSprint) &&
            newSprint.'Sprint State' <> 'Sprint State (Sprints)'.Planned && newSprint.'Sprint State' <> 'Sprint State (Sprints)'.Active,
            Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_LOCKED] " & newSprint.'Sprint Name' & " is completed or cancelled." }),
        With(
            { seq: LookUp('Project Sequences', Project.Project = thisProject.Project) },
            If(
                IsBlank(seq),
                    Collect('Project Sequences', { 'Sequence Name': thisProject.'Project Key', Project: thisProject, 'Next Number': 2 });
                    Set(NewRecord.'Issue Sequence', 1);
                    Set(NewRecord.'Issue Key', thisProject.'Project Key' & "-1"),
                // Write first so this transaction holds the row lock, then re-read the number.
                Patch('Project Sequences', seq, { 'Sequence Name': thisProject.'Project Key' });
                With(
                    { nextNumber: Max(1, LookUp('Project Sequences', 'Project Sequence' = seq.'Project Sequence').'Next Number') },
                    Patch('Project Sequences', seq, { 'Next Number': nextNumber + 1 });
                    Set(NewRecord.'Issue Sequence', nextNumber);
                    Set(NewRecord.'Issue Key', thisProject.'Project Key' & "-" & Text(nextNumber))
                )
            )
        );
        // Phase 3: new issues start in the project's initial status (To Do for the default workflow). Done statuses are never initial.
        Set(NewRecord.wd_status, If(IsBlank(thisProject.'Workflow Statuses'), 'Status (Issues)'.'To Do',
            Switch(thisProject.'Initial Status',
                100000001, 'Status (Issues)'.'In Progress',
                100000002, 'Status (Issues)'.'In Review',
                100000004, 'Status (Issues)'.Backlog,
                100000005, 'Status (Issues)'.Blocked,
                100000006, 'Status (Issues)'.'In Testing',
                'Status (Issues)'.'To Do')));
        Set(NewRecord.Resolution, Blank());
        Set(NewRecord.Archived, 'Archived (Issues)'.No)
    )
)
```

### 2 · Pira · Issue · After create — Issues · Create · Post-operation

```powerfx
// Created By is the calling user. Error() here rolls back the whole create (including the key number).
With(
    { saved: LookUp(Issues, Issue = NewRecord.Issue) },
    If(
        IsBlank(LookUp('Project Members',
            Project.Project = saved.Project.Project &&
            User.User = saved.'Created By'.User &&
            'Membership State' = 'Membership State (Project Members)'.Active &&
            'Project Role' <> 'Project Role (Project Members)'.Stakeholder)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] You must be a lead or contributor on this project to create issues." }),
        Collect('Issue History', {
            'History Name': Left(saved.'Issue Key' & " created", 100),
            Issue: saved,
            'Event Type': 'Event Type (Issue History)'.Created,
            'New Value': Left(saved.Summary, 400),
            'Operation Name': "CreateIssue"
        })
    )
)
```

### 3 · Pira · Issue · Before update — Issues · Update · Pre-operation

```powerfx
// Who made the change is checked by plug-in 4 (Modified By); a rejection there also rolls back this history.
// Phase 3: projects with their own workflow (Workflow Statuses not blank) only allow active Workflow Transition rows,
// and a transition's required fields must be filled in the same update. Other projects keep the default any-to-any rule.
With(
    {
        thisProject: LookUp(Projects, Project = OldRecord.Project.Project),
        thisIssue: LookUp(Issues, Issue = OldRecord.Issue),
        newParent: LookUp(Issues, Issue = NewRecord.'Parent Issue'.Issue),
        // Type levels: Epic 1, Story 2, Task/Bug 3. Keep in step with ISSUE_TYPES in dist/config/app-config.js.
        newLevel: Switch(NewRecord.'Issue Type', 'Issue Type (Issues)'.Epic, 1, 'Issue Type (Issues)'.Story, 2, 3),
        // Status choice as its number. Keep in step with ISSUE_STATUSES in dist/config/app-config.js.
        fromNo: Switch(OldRecord.wd_status,
            'Status (Issues)'.'To Do', 100000000, 'Status (Issues)'.'In Progress', 100000001, 'Status (Issues)'.'In Review', 100000002,
            'Status (Issues)'.Done, 100000003, 'Status (Issues)'.Backlog, 100000004, 'Status (Issues)'.Blocked, 100000005,
            'Status (Issues)'.'In Testing', 100000006, 100000007),
        toNo: Switch(NewRecord.wd_status,
            'Status (Issues)'.'To Do', 100000000, 'Status (Issues)'.'In Progress', 100000001, 'Status (Issues)'.'In Review', 100000002,
            'Status (Issues)'.Done, 100000003, 'Status (Issues)'.Backlog, 100000004, 'Status (Issues)'.Blocked, 100000005,
            'Status (Issues)'.'In Testing', 100000006, 100000007),
        fromDone: OldRecord.wd_status = 'Status (Issues)'.Done || OldRecord.wd_status = 'Status (Issues)'.Closed,
        toDone: NewRecord.wd_status = 'Status (Issues)'.Done || NewRecord.wd_status = 'Status (Issues)'.Closed
    },
    With(
        {
            customWorkflow: !IsBlank(thisProject.'Workflow Statuses'),
            rule: LookUp('Workflow Transitions',
                Project.Project = OldRecord.Project.Project && 'From Status' = fromNo && 'To Status' = toNo &&
                Active = 'Active (Workflow Transitions)'.Yes),
            statusChanged: NewRecord.wd_status <> OldRecord.wd_status
        },
        If(
            NewRecord.'Issue Key' <> OldRecord.'Issue Key' ||
            NewRecord.'Issue Sequence' <> OldRecord.'Issue Sequence' ||
            NewRecord.Project.Project <> OldRecord.Project.Project,
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_IMMUTABLE] An issue's key and project can't be changed." }),
            OldRecord.Archived = 'Archived (Issues)'.Yes,
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & OldRecord.'Issue Key' & " is archived and read-only." }),
            thisProject.'Project State' = 'Project State (Projects)'.Archived,
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] " & thisProject.'Project Key' & " is archived. Restore it before changing issues." }),
            // Default workflow: any move between To Do, In Progress, In Review and Done. Keep in step with WORKFLOW in app-config.js.
            statusChanged && !customWorkflow && (fromNo > 100000003 || toNo > 100000003),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_TRANSITION] " & Text(OldRecord.wd_status) & " to " & Text(NewRecord.wd_status) & " isn't allowed by the project workflow." }),
            // Project workflow: the target is one of the project's statuses and the move is an active transition.
            statusChanged && customWorkflow &&
                (IsBlank(rule) || Find("," & Text(toNo, "0") & ",", "," & thisProject.'Workflow Statuses' & ",") = 0),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_TRANSITION] " & Text(OldRecord.wd_status) & " to " & Text(NewRecord.wd_status) & " isn't allowed by the project workflow." }),
            statusChanged && !IsBlank(rule) && rule.'Require Resolution' = 'Require Resolution (Workflow Transitions)'.Yes && IsBlank(NewRecord.Resolution),
                Error({ Kind: ErrorKind.Validation, Message: "[REQUIRED_FIELD_MISSING] Choose a resolution to move " & OldRecord.'Issue Key' & " to " & Text(NewRecord.wd_status) & "." }),
            statusChanged && !IsBlank(rule) && rule.'Require Assignee' = 'Require Assignee (Workflow Transitions)'.Yes && IsBlank(NewRecord.Assignee),
                Error({ Kind: ErrorKind.Validation, Message: "[REQUIRED_FIELD_MISSING] Assign " & OldRecord.'Issue Key' & " before moving it to " & Text(NewRecord.wd_status) & "." }),
            statusChanged && !IsBlank(rule) && rule.'Require Story Points' = 'Require Story Points (Workflow Transitions)'.Yes && IsBlank(NewRecord.'Story Points'),
                Error({ Kind: ErrorKind.Validation, Message: "[REQUIRED_FIELD_MISSING] Estimate story points for " & OldRecord.'Issue Key' & " before moving it to " & Text(NewRecord.wd_status) & "." }),
            statusChanged && !IsBlank(rule) && rule.'Require Due Date' = 'Require Due Date (Workflow Transitions)'.Yes && IsBlank(NewRecord.'Due Date'),
                Error({ Kind: ErrorKind.Validation, Message: "[REQUIRED_FIELD_MISSING] Set a due date for " & OldRecord.'Issue Key' & " before moving it to " & Text(NewRecord.wd_status) & "." }),
            !IsBlank(NewRecord.'Parent Issue') &&
                NewRecord.'Parent Issue'.Issue <> OldRecord.'Parent Issue'.Issue &&
                (NewRecord.'Parent Issue'.Issue = OldRecord.Issue ||
                 LookUp(Issues, Issue = NewRecord.'Parent Issue'.Issue).Project.Project <> OldRecord.Project.Project ||
                 LookUp(Issues, Issue = NewRecord.'Parent Issue'.Issue).'Parent Issue'.Issue = OldRecord.Issue),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_PARENT_RELATIONSHIP] The parent must be another issue in the same project and can't create a loop." }),
            !IsBlank(newParent) &&
                (NewRecord.'Parent Issue'.Issue <> OldRecord.'Parent Issue'.Issue || NewRecord.'Issue Type' <> OldRecord.'Issue Type') &&
                Switch(newParent.'Issue Type', 'Issue Type (Issues)'.Epic, 1, 'Issue Type (Issues)'.Story, 2, 3) >= newLevel,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_PARENT_TYPE] Epics hold Stories, Tasks and Bugs; Stories hold Tasks and Bugs." }),
            NewRecord.'Issue Type' <> OldRecord.'Issue Type' &&
                !IsBlank(LookUp(Issues, 'Parent Issue'.Issue = OldRecord.Issue && Archived <> 'Archived (Issues)'.Yes &&
                    Switch('Issue Type', 'Issue Type (Issues)'.Epic, 1, 'Issue Type (Issues)'.Story, 2, 3) <= newLevel)),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_TYPE_CHANGE] That issue type doesn't fit its children." }),
            // Sprint membership: completed and cancelled sprints keep their issues; the new sprint must be open and in this project.
            // Sprint data is read through the Sprint lookup, so this plug-in never names the Sprints table (see the note above).
            NewRecord.Sprint.Sprint <> OldRecord.Sprint.Sprint && !IsBlank(OldRecord.Sprint) &&
                (OldRecord.Sprint.'Sprint State' = 'Sprint State (Sprints)'.Completed || OldRecord.Sprint.'Sprint State' = 'Sprint State (Sprints)'.Cancelled),
                Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_LOCKED] " & OldRecord.Sprint.'Sprint Name' & " is completed or cancelled, so its issues are locked." }),
            NewRecord.Sprint.Sprint <> OldRecord.Sprint.Sprint && !IsBlank(NewRecord.Sprint) && NewRecord.Sprint.Project.Project <> OldRecord.Project.Project,
                Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_PROJECT_MISMATCH] Only issues from the sprint's own project can be added to it." }),
            NewRecord.Sprint.Sprint <> OldRecord.Sprint.Sprint && !IsBlank(NewRecord.Sprint) &&
                NewRecord.Sprint.'Sprint State' <> 'Sprint State (Sprints)'.Planned && NewRecord.Sprint.'Sprint State' <> 'Sprint State (Sprints)'.Active,
                Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_LOCKED] " & NewRecord.Sprint.'Sprint Name' & " is completed or cancelled." }),

            // Valid change: stamp Resolved On, clear the resolution when reopened, and record history in the same transaction.
            If(
                statusChanged,
                    If(
                        toDone && !fromDone, Set(NewRecord.'Resolved On', Now()),
                        fromDone && !toDone, Set(NewRecord.'Resolved On', Blank())
                    );
                    If(!toDone, Set(NewRecord.Resolution, Blank()));
                    Collect('Issue History', {
                        'History Name': Left(OldRecord.'Issue Key' & " status", 100),
                        Issue: thisIssue,
                        'Event Type': 'Event Type (Issue History)'.Transitioned,
                        'Field Name': "status",
                        'Old Value': Text(OldRecord.wd_status),
                        'New Value': Text(NewRecord.wd_status),
                        'Operation Name': "TransitionIssue"
                    })
            );
            If(
                NewRecord.Archived = 'Archived (Issues)'.Yes,
                    Collect('Issue History', {
                        'History Name': Left(OldRecord.'Issue Key' & " archived", 100),
                        Issue: thisIssue,
                        'Event Type': 'Event Type (Issue History)'.Archived,
                        'Field Name': "archived",
                        'Old Value': "No",
                        'New Value': "Yes",
                        'Operation Name': "ArchiveIssue"
                    })
            );
            If(
                NewRecord.Sprint.Sprint <> OldRecord.Sprint.Sprint,
                    Collect('Issue History', {
                        'History Name': Left(OldRecord.'Issue Key' & " sprint", 100),
                        Issue: thisIssue,
                        'Event Type': 'Event Type (Issue History)'.'Sprint Changed',
                        'Field Name': "sprint",
                        'Old Value': Coalesce(OldRecord.Sprint.'Sprint Name', "Backlog"),
                        'New Value': Coalesce(NewRecord.Sprint.'Sprint Name', "Backlog"),
                        'Operation Name': "UpdateIssue"
                    })
            );
            ForAll(
                Filter(
                    Table(
                        { FieldName: "summary",     OldText: OldRecord.Summary,                                     NewText: NewRecord.Summary },
                        { FieldName: "description", OldText: Left(OldRecord.Description, 120),                      NewText: Left(NewRecord.Description, 120) },
                        { FieldName: "type",        OldText: Text(OldRecord.'Issue Type'),                          NewText: Text(NewRecord.'Issue Type') },
                        { FieldName: "priority",    OldText: Text(OldRecord.Priority),                              NewText: Text(NewRecord.Priority) },
                        { FieldName: "assignee",    OldText: Coalesce(OldRecord.Assignee.'Full Name', "Unassigned"), NewText: Coalesce(NewRecord.Assignee.'Full Name', "Unassigned") },
                        { FieldName: "dueDate",     OldText: Coalesce(Text(OldRecord.'Due Date', "d mmm yyyy"), "None"), NewText: Coalesce(Text(NewRecord.'Due Date', "d mmm yyyy"), "None") },
                        { FieldName: "parent",      OldText: Coalesce(OldRecord.'Parent Issue'.'Issue Key', "None"),  NewText: Coalesce(NewRecord.'Parent Issue'.'Issue Key', "None") },
                        { FieldName: "points",      OldText: Coalesce(Text(OldRecord.'Story Points'), "None"),      NewText: Coalesce(Text(NewRecord.'Story Points'), "None") },
                        // Phase 3. Resolution is cleared outside Done/Closed, whatever the request sent.
                        { FieldName: "resolution",  OldText: Coalesce(Text(OldRecord.Resolution), "None"),          NewText: If(toDone, Coalesce(Text(NewRecord.Resolution), "None"), "None") }
                    ),
                    Coalesce(OldText, "") <> Coalesce(NewText, "")
                ),
                Collect('Issue History', {
                    'History Name': Left(OldRecord.'Issue Key' & " " & FieldName, 100),
                    Issue: thisIssue,
                    'Event Type': 'Event Type (Issue History)'.'Field Changed',
                    'Field Name': FieldName,
                    'Old Value': Left(OldText, 400),
                    'New Value': Left(NewText, 400),
                    'Operation Name': "UpdateIssue"
                })
            )
        )
    )
)
```

### 4 · Pira · Issue · After update — Issues · Update · Post-operation

```powerfx
// Modified By on the saved row is the calling user. Error() rolls back the update and plug-in 3's history rows.
With(
    { saved: LookUp(Issues, Issue = NewRecord.Issue) },
    If(
        IsBlank(LookUp('Project Members',
            Project.Project = saved.Project.Project &&
            User.User = saved.'Modified By'.User &&
            'Membership State' = 'Membership State (Project Members)'.Active &&
            'Project Role' <> 'Project Role (Project Members)'.Stakeholder)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] You must be a lead or contributor on this project to change its issues." })
    )
)
```

### 5 · Pira · Comment · After create — Issue Comments · Create · Post-operation

```powerfx
With(
    {
        thisIssue: LookUp(Issues, Issue = NewRecord.Issue.Issue),
        author: LookUp('Issue Comments', 'Issue Comment' = NewRecord.'Issue Comment').'Created By'
    },
    If(
        IsBlank(thisIssue),
            Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_NOT_FOUND] That issue could not be found." }),
        thisIssue.Archived = 'Archived (Issues)'.Yes,
            Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.'Issue Key' & " is archived and read-only." }),
        IsBlank(LookUp('Project Members',
            Project.Project = thisIssue.Project.Project &&
            User.User = author.User &&
            'Membership State' = 'Membership State (Project Members)'.Active &&
            'Project Role' <> 'Project Role (Project Members)'.Stakeholder)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] You must be a lead or contributor on this project to comment." }),
        Collect('Issue History', {
            'History Name': Left(thisIssue.'Issue Key' & " comment", 100),
            Issue: thisIssue,
            'Event Type': 'Event Type (Issue History)'.Commented,
            'Field Name': "comment",
            'New Value': Left(NewRecord.Body, 120),
            'Operation Name': "AddComment"
        })
    )
)
```

### 6 · Pira · Project · Before create — Projects · Create · Pre-operation

```powerfx
With(
    { newKey: Upper(Trim(NewRecord.'Project Key')) },
    If(
        !IsMatch(newKey, "[A-Z][A-Z0-9]{1,9}"),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Project keys must be 2-10 letters or numbers and start with a letter." }),
        !IsBlank(LookUp(Projects, 'Project Key' = newKey)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_KEY_TAKEN] " & newKey & " is already used by another project." }),
        Set(NewRecord.'Project Key', newKey);
        Set(NewRecord.'Project State', 'Project State (Projects)'.Active)
    )
)
```

### 7 · Pira · Project · Before update — Projects · Update · Pre-operation

```powerfx
// Phase 3: also checks the workflow columns. Who changed them (leads only) is checked by plug-in 8.
With(
    {
        newKey: Upper(Trim(NewRecord.'Project Key')),
        newList: "," & NewRecord.'Workflow Statuses' & ","
    },
    If(
        newKey <> OldRecord.'Project Key' && !IsBlank(LookUp(Issues, Project.Project = OldRecord.Project)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_KEY_LOCKED] The project key can't change once the project has issues." }),
        !IsMatch(newKey, "[A-Z][A-Z0-9]{1,9}"),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Project keys must be 2-10 letters or numbers and start with a letter." }),
        newKey <> OldRecord.'Project Key' && !IsBlank(LookUp(Projects, 'Project Key' = newKey && Project <> OldRecord.Project)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_KEY_TAKEN] " & newKey & " is already used by another project." }),
        !IsBlank(NewRecord.'Workflow Statuses') && !IsMatch(NewRecord.'Workflow Statuses', "1000000[0-7](,1000000[0-7])*"),
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] The workflow status list isn't valid." }),
        !IsBlank(NewRecord.'Workflow Statuses') &&
            (Find("," & Text(NewRecord.'Initial Status', "0") & ",", newList) = 0 ||
             NewRecord.'Initial Status' = 100000003 || NewRecord.'Initial Status' = 100000007),
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] The initial status must be an open status from the workflow." }),
        // The inner Filter is delegated (one project); the status test then runs over that project's issues only.
        !IsBlank(NewRecord.'Workflow Statuses') && NewRecord.'Workflow Statuses' <> Coalesce(OldRecord.'Workflow Statuses', "") &&
            !IsBlank(LookUp(
                Filter(Issues, Project.Project = OldRecord.Project && Archived <> 'Archived (Issues)'.Yes),
                Find("," & Text(Switch(wd_status,
                    'Status (Issues)'.'To Do', 100000000, 'Status (Issues)'.'In Progress', 100000001, 'Status (Issues)'.'In Review', 100000002,
                    'Status (Issues)'.Done, 100000003, 'Status (Issues)'.Backlog, 100000004, 'Status (Issues)'.Blocked, 100000005,
                    'Status (Issues)'.'In Testing', 100000006, 100000007), "0") & ",", newList) = 0)),
            Error({ Kind: ErrorKind.Validation, Message: "[STATUS_IN_USE] Some issues still use a status that isn't in the new workflow. Move them first." }),
        Set(NewRecord.'Project Key', newKey)
    )
)
```

### 8 · Pira · Project · After update — Projects · Update · Post-operation

```powerfx
With(
    { actor: LookUp(Projects, Project = NewRecord.Project).'Modified By' },
    If(
        IsBlank(LookUp('Project Members',
            Project.Project = NewRecord.Project &&
            User.User = actor.User &&
            'Membership State' = 'Membership State (Project Members)'.Active &&
            'Project Role' = 'Project Role (Project Members)'.Lead)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can change project settings." })
    )
)
```

### 9 · Pira · Member · After create — Project Members · Create · Post-operation

```powerfx
With(
    {
        actor: LookUp('Project Members', 'Project Member' = NewRecord.'Project Member').'Created By',
        thisProject: LookUp(Projects, Project = NewRecord.Project.Project),
        otherActive: Filter('Project Members',
            Project.Project = NewRecord.Project.Project &&
            'Project Member' <> NewRecord.'Project Member' &&
            'Membership State' = 'Membership State (Project Members)'.Active)
    },
    If(
        IsBlank(thisProject),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_NOT_FOUND] Choose a valid project." }),
        // Bootstrap: whoever created the project adds themselves as its first lead.
        CountRows(otherActive) = 0 &&
            thisProject.'Created By'.User = actor.User &&
            NewRecord.User.User = actor.User &&
            NewRecord.'Project Role' = 'Project Role (Project Members)'.Lead,
            Blank(),
        IsBlank(LookUp(otherActive, User.User = actor.User && 'Project Role' = 'Project Role (Project Members)'.Lead)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can add members." })
    )
)
```

### 10 · Pira · Member · Before update — Project Members · Update · Pre-operation

```powerfx
If(
    NewRecord.Project.Project <> OldRecord.Project.Project || NewRecord.User.User <> OldRecord.User.User,
        Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A membership's project and person can't be changed." }),
    NewRecord.'Membership State' = 'Membership State (Project Members)'.Removed &&
        OldRecord.'Membership State' = 'Membership State (Project Members)'.Active,
        Set(NewRecord.'Removed On', Now())
)
```

### 11 · Pira · Member · After update — Project Members · Update · Post-operation

```powerfx
// The modifier must be a lead and can't be editing their own row, so at least one lead (them) always remains.
With(
    { actor: LookUp('Project Members', 'Project Member' = NewRecord.'Project Member').'Modified By' },
    If(
        NewRecord.User.User = actor.User,
            Error({ Kind: ErrorKind.Validation, Message: "[PERMISSION_DENIED] You can't change your own membership. Ask another project lead." }),
        IsBlank(LookUp('Project Members',
            Project.Project = NewRecord.Project.Project &&
            User.User = actor.User &&
            'Membership State' = 'Membership State (Project Members)'.Active &&
            'Project Role' = 'Project Role (Project Members)'.Lead)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can change members." })
    )
)
```

### 12 · Pira · Sprint · Before create — Sprints · Create · Pre-operation

```powerfx
With(
    {
        thisProject: LookUp(Projects, Project = NewRecord.Project.Project),
        thisBoard: LookUp(Boards, Board = NewRecord.Board.Board)
    },
    If(
        IsBlank(thisProject),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_NOT_FOUND] Choose a valid project." }),
        thisProject.'Project State' = 'Project State (Projects)'.Archived,
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] " & thisProject.'Project Key' & " is archived." }),
        IsBlank(thisBoard) || thisBoard.Project.Project <> thisProject.Project,
            Error({ Kind: ErrorKind.Validation, Message: "[BOARD_NOT_FOUND] Choose a board in this project." }),
        !IsBlank(NewRecord.'Start Date') && !IsBlank(NewRecord.'End Date') && NewRecord.'End Date' < NewRecord.'Start Date',
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] The end date can't be before the start date." }),
        Set(NewRecord.'Sprint State', 'Sprint State (Sprints)'.Planned)
    )
)
```

### 13 · Pira · Sprint · Before update — Sprints · Update · Pre-operation

```powerfx
// Lifecycle: Planned → Active or Cancelled; Active → Completed; Completed → Active only to correct it (needs a new note).
With(
    {
        transitions: Table(
            { FromState: 'Sprint State (Sprints)'.Planned,   ToState: 'Sprint State (Sprints)'.Active },
            { FromState: 'Sprint State (Sprints)'.Planned,   ToState: 'Sprint State (Sprints)'.Cancelled },
            { FromState: 'Sprint State (Sprints)'.Active,    ToState: 'Sprint State (Sprints)'.Completed },
            { FromState: 'Sprint State (Sprints)'.Completed, ToState: 'Sprint State (Sprints)'.Active }
        ),
        otherActive: LookUp(Sprints,
            Board.Board = OldRecord.Board.Board && Sprint <> OldRecord.Sprint &&
            'Sprint State' = 'Sprint State (Sprints)'.Active)
    },
    If(
        NewRecord.Project.Project <> OldRecord.Project.Project || NewRecord.Board.Board <> OldRecord.Board.Board,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A sprint's project and board can't be changed." }),
        OldRecord.'Sprint State' = 'Sprint State (Sprints)'.Cancelled,
            Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_LOCKED] Cancelled sprints can't be changed." }),
        NewRecord.'Sprint State' <> OldRecord.'Sprint State' &&
            IsBlank(LookUp(transitions, FromState = OldRecord.'Sprint State' && ToState = NewRecord.'Sprint State')),
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_SPRINT_TRANSITION] That sprint change isn't allowed." }),
        OldRecord.'Sprint State' = 'Sprint State (Sprints)'.Completed && NewRecord.'Sprint State' = 'Sprint State (Sprints)'.Completed,
            Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_LOCKED] " & OldRecord.'Sprint Name' & " is completed. A lead can reopen it for correction." }),
        OldRecord.'Sprint State' = 'Sprint State (Sprints)'.Completed &&
            (IsBlank(NewRecord.'Correction Note') || NewRecord.'Correction Note' = OldRecord.'Correction Note'),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Reopening a completed sprint needs a new correction note." }),
        NewRecord.'Sprint State' = 'Sprint State (Sprints)'.Active && (IsBlank(NewRecord.'Start Date') || IsBlank(NewRecord.'End Date')),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Set start and end dates before starting the sprint." }),
        !IsBlank(NewRecord.'Start Date') && !IsBlank(NewRecord.'End Date') && NewRecord.'End Date' < NewRecord.'Start Date',
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] The end date can't be before the start date." }),
        NewRecord.'Sprint State' = 'Sprint State (Sprints)'.Active && OldRecord.'Sprint State' <> 'Sprint State (Sprints)'.Active && !IsBlank(otherActive),
            Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_ACTIVE_EXISTS] " & otherActive.'Sprint Name' & " is already active on this board." }),
        If(
            NewRecord.'Sprint State' = 'Sprint State (Sprints)'.Active && OldRecord.'Sprint State' = 'Sprint State (Sprints)'.Planned,
                Set(NewRecord.'Started On', Now()),
            NewRecord.'Sprint State' = 'Sprint State (Sprints)'.Completed,
                Set(NewRecord.'Completed On', Now()),
            NewRecord.'Sprint State' = 'Sprint State (Sprints)'.Active && OldRecord.'Sprint State' = 'Sprint State (Sprints)'.Completed,
                Set(NewRecord.'Completed On', Blank())
        )
    )
)
```

### 14 · Pira · Sprint · After create — Sprints · Create · Post-operation

```powerfx
With(
    { saved: LookUp(Sprints, Sprint = NewRecord.Sprint) },
    If(
        IsBlank(LookUp('Project Members',
            Project.Project = saved.Project.Project &&
            User.User = saved.'Created By'.User &&
            'Membership State' = 'Membership State (Project Members)'.Active &&
            'Project Role' <> 'Project Role (Project Members)'.Stakeholder)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors can plan sprints." })
    )
)
```

### 15 · Pira · Sprint · After update — Sprints · Update · Post-operation

```powerfx
// Modified By is the caller. Reopening a completed sprint (the correction path) is for project leads only.
With(
    { saved: LookUp(Sprints, Sprint = NewRecord.Sprint) },
    With(
        { actor: LookUp('Project Members',
            Project.Project = saved.Project.Project &&
            User.User = saved.'Modified By'.User &&
            'Membership State' = 'Membership State (Project Members)'.Active) },
        If(
            IsBlank(actor) || actor.'Project Role' = 'Project Role (Project Members)'.Stakeholder,
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors can change sprints." }),
            OldRecord.'Sprint State' = 'Sprint State (Sprints)'.Completed && actor.'Project Role' <> 'Project Role (Project Members)'.Lead,
                Error({ Kind: ErrorKind.Validation, Message: "[PERMISSION_DENIED] Only project leads can reopen a completed sprint." })
        )
    )
)
```

### 16 · Pira · Board Issue · After create — Board Issues · Create · Post-operation

```powerfx
With(
    { saved: LookUp('Board Issues', 'Board Issue' = NewRecord.'Board Issue') },
    With(
        {
            thisBoard: LookUp(Boards, Board = saved.Board.Board),
            thisIssue: LookUp(Issues, Issue = saved.Issue.Issue)
        },
        If(
            IsBlank(thisBoard) || IsBlank(thisIssue) || thisBoard.Project.Project <> thisIssue.Project.Project,
                Error({ Kind: ErrorKind.Validation, Message: "[BOARD_NOT_FOUND] Issues can only be added to boards in their own project." }),
            thisBoard.'Is Default' = 'Is Default (Boards)'.Yes,
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] The default board already shows every issue." }),
            CountRows(Filter('Board Issues', Board.Board = thisBoard.Board && Issue.Issue = thisIssue.Issue)) > 1,
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] That issue is already on this board." }),
            IsBlank(LookUp('Project Members',
                Project.Project = thisIssue.Project.Project &&
                User.User = saved.'Created By'.User &&
                'Membership State' = 'Membership State (Project Members)'.Active &&
                'Project Role' <> 'Project Role (Project Members)'.Stakeholder)),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors can change boards." })
        )
    )
)
```

### 17 · Pira · Issue Link · After create — Issue Links · Create · Post-operation

```powerfx
// Links are stored once (From → To). "A blocks B" and "B blocks A" together is a contradiction; Relates To is symmetric.
With(
    { saved: LookUp('Issue Links', 'Issue Link' = NewRecord.'Issue Link') },
    With(
        {
            fromIssue: LookUp(Issues, Issue = saved.'From Issue'.Issue),
            toIssue: LookUp(Issues, Issue = saved.'To Issue'.Issue)
        },
        If(
            IsBlank(fromIssue) || IsBlank(toIssue),
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_NOT_FOUND] Both linked issues must exist." }),
            fromIssue.Issue = toIssue.Issue,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_LINK] An issue can't link to itself." }),
            CountRows(Filter('Issue Links', 'From Issue'.Issue = fromIssue.Issue && 'To Issue'.Issue = toIssue.Issue && 'Link Type' = saved.'Link Type')) > 1,
                Error({ Kind: ErrorKind.Validation, Message: "[DUPLICATE_LINK] Those issues are already linked that way." }),
            !IsBlank(LookUp('Issue Links', 'From Issue'.Issue = toIssue.Issue && 'To Issue'.Issue = fromIssue.Issue && 'Link Type' = saved.'Link Type')),
                Error({ Kind: ErrorKind.Validation, Message: If(saved.'Link Type' = 'Link Type (Issue Links)'.'Relates To',
                    "[DUPLICATE_LINK] Those issues are already related.",
                    "[INVALID_LINK] Two issues can't block or duplicate each other both ways.") }),
            IsBlank(LookUp('Project Members',
                Project.Project = fromIssue.Project.Project &&
                User.User = saved.'Created By'.User &&
                'Membership State' = 'Membership State (Project Members)'.Active &&
                'Project Role' <> 'Project Role (Project Members)'.Stakeholder)),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] You must be a lead or contributor to link issues." })
        )
    )
)
```

### 18 · Pira · Workflow Transition · After create — Workflow Transitions · Create · Post-operation

```powerfx
// Phase 3. Only leads change a project's workflow. Status values are Issue Status numbers (100000000-100000007).
With(
    { saved: LookUp('Workflow Transitions', 'Workflow Transition' = NewRecord.'Workflow Transition') },
    With(
        { thisProject: LookUp(Projects, Project = saved.Project.Project) },
        If(
            IsBlank(thisProject),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_NOT_FOUND] Choose a valid project." }),
            thisProject.'Project State' = 'Project State (Projects)'.Archived,
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] " & thisProject.'Project Key' & " is archived." }),
            saved.'From Status' < 100000000 || saved.'From Status' > 100000007 || saved.'To Status' < 100000000 || saved.'To Status' > 100000007 ||
                saved.'From Status' = saved.'To Status',
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] A transition must connect two different statuses." }),
            saved.'Require Resolution' = 'Require Resolution (Workflow Transitions)'.Yes && saved.'To Status' <> 100000003 && saved.'To Status' <> 100000007,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] A resolution can only be required when moving to Done or Closed." }),
            CountRows(Filter('Workflow Transitions', Project.Project = saved.Project.Project && 'From Status' = saved.'From Status' && 'To Status' = saved.'To Status')) > 1,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] That transition already exists. Reactivate it instead." }),
            IsBlank(LookUp('Project Members',
                Project.Project = saved.Project.Project &&
                User.User = saved.'Created By'.User &&
                'Membership State' = 'Membership State (Project Members)'.Active &&
                'Project Role' = 'Project Role (Project Members)'.Lead)),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can change the workflow." })
        )
    )
)
```

### 19 · Pira · Workflow Transition · After update — Workflow Transitions · Update · Post-operation

```powerfx
// Phase 3. Transitions are switched off with Active = No, never re-pointed, so history of the workflow stays readable.
With(
    { saved: LookUp('Workflow Transitions', 'Workflow Transition' = NewRecord.'Workflow Transition') },
    If(
        NewRecord.Project.Project <> OldRecord.Project.Project ||
        NewRecord.'From Status' <> OldRecord.'From Status' || NewRecord.'To Status' <> OldRecord.'To Status',
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] A transition's project and statuses can't change. Deactivate it and add a new one." }),
        saved.'Require Resolution' = 'Require Resolution (Workflow Transitions)'.Yes && saved.'To Status' <> 100000003 && saved.'To Status' <> 100000007,
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] A resolution can only be required when moving to Done or Closed." }),
        IsBlank(LookUp('Project Members',
            Project.Project = saved.Project.Project &&
            User.User = saved.'Modified By'.User &&
            'Membership State' = 'Membership State (Project Members)'.Active &&
            'Project Role' = 'Project Role (Project Members)'.Lead)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can change the workflow." })
    )
)
```

### 20 · Pira · Custom Field · After create — Custom Fields · Create · Post-operation

```powerfx
// Phase 3. Custom fields are configuration: leads only, a controlled set of types, unique names per project.
With(
    { saved: LookUp('Custom Fields', 'Custom Field' = NewRecord.'Custom Field') },
    If(
        IsBlank(saved.Project) || IsBlank(Trim(saved.'Field Name')),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A custom field needs a project and a name." }),
        saved.'Field Type' = 'Field Type (Custom Fields)'.'Single Choice' && IsBlank(Trim(saved.Options)),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Single choice fields need at least one option." }),
        CountRows(Filter(Filter('Custom Fields', Project.Project = saved.Project.Project), Lower(Trim('Field Name')) = Lower(Trim(saved.'Field Name')))) > 1,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Another field in this project already uses that name." }),
        IsBlank(LookUp('Project Members',
            Project.Project = saved.Project.Project &&
            User.User = saved.'Created By'.User &&
            'Membership State' = 'Membership State (Project Members)'.Active &&
            'Project Role' = 'Project Role (Project Members)'.Lead)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can add custom fields." })
    )
)
```

### 21 · Pira · Custom Field · After update — Custom Fields · Update · Post-operation

```powerfx
// Phase 3. A field's type never changes once values may exist (retire it and add a new one instead).
With(
    { saved: LookUp('Custom Fields', 'Custom Field' = NewRecord.'Custom Field') },
    If(
        NewRecord.Project.Project <> OldRecord.Project.Project || NewRecord.'Field Type' <> OldRecord.'Field Type',
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A custom field's project and type can't change." }),
        IsBlank(Trim(saved.'Field Name')) ||
            (saved.'Field Type' = 'Field Type (Custom Fields)'.'Single Choice' && IsBlank(Trim(saved.Options))),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Fields need a name, and single choice fields need options." }),
        CountRows(Filter(Filter('Custom Fields', Project.Project = saved.Project.Project), Lower(Trim('Field Name')) = Lower(Trim(saved.'Field Name')))) > 1,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Another field in this project already uses that name." }),
        IsBlank(LookUp('Project Members',
            Project.Project = saved.Project.Project &&
            User.User = saved.'Modified By'.User &&
            'Membership State' = 'Membership State (Project Members)'.Active &&
            'Project Role' = 'Project Role (Project Members)'.Lead)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can change custom fields." })
    )
)
```

### 22 · Pira · Custom Field Value · After create — Custom Field Values · Create · Post-operation

Plug-in 23 uses the same formula with `'Modified By'` instead of `'Created By'`, plus the first check below.

```powerfx
// Phase 3. Values are validated by type on the server: only the column for the field's type may hold a value,
// choice values must be one of the options (one per line), and the field must apply to the issue's type.
// Yes/No columns default to No, so Boolean Value is only checked for Yes/No fields.
With(
    { saved: LookUp('Custom Field Values', 'Custom Field Value' = NewRecord.'Custom Field Value') },
    With(
        {
            thisField: LookUp('Custom Fields', 'Custom Field' = saved.'Custom Field'.'Custom Field'),
            thisIssue: LookUp(Issues, Issue = saved.Issue.Issue),
            hasValue: !IsBlank(saved.'Text Value') || !IsBlank(saved.'Number Value') || !IsBlank(saved.'Date Value')
        },
        If(
            IsBlank(thisField) || IsBlank(thisIssue) || thisField.Project.Project <> thisIssue.Project.Project,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_CUSTOM_FIELD_VALUE] The field and the issue must belong to the same project." }),
            thisField.Active = 'Active (Custom Fields)'.No,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_CUSTOM_FIELD_VALUE] " & thisField.'Field Name' & " is retired." }),
            thisIssue.Archived = 'Archived (Issues)'.Yes,
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.'Issue Key' & " is archived and read-only." }),
            Switch(thisField.'Field Type',
                'Field Type (Custom Fields)'.Text, !IsBlank(saved.'Number Value') || !IsBlank(saved.'Date Value') || Len(saved.'Text Value') > 400,
                'Field Type (Custom Fields)'.Number, !IsBlank(saved.'Text Value') || !IsBlank(saved.'Date Value'),
                'Field Type (Custom Fields)'.Date, !IsBlank(saved.'Text Value') || !IsBlank(saved.'Number Value'),
                'Field Type (Custom Fields)'.'Yes No', hasValue,
                !IsBlank(saved.'Number Value') || !IsBlank(saved.'Date Value') ||
                    (!IsBlank(saved.'Text Value') && Find(Char(10) & saved.'Text Value' & Char(10), Char(10) & thisField.Options & Char(10)) = 0)
            ),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_CUSTOM_FIELD_VALUE] That value doesn't match the " & thisField.'Field Name' & " field type." }),
            hasValue && !IsBlank(thisField.'Issue Types') &&
                Find("," & Text(Switch(thisIssue.'Issue Type', 'Issue Type (Issues)'.Task, 100000000, 'Issue Type (Issues)'.Bug, 100000001,
                    'Issue Type (Issues)'.Story, 100000002, 100000003), "0") & ",", "," & thisField.'Issue Types' & ",") = 0,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_CUSTOM_FIELD_VALUE] " & thisField.'Field Name' & " isn't used for this issue type." }),
            IsBlank(LookUp('Project Members',
                Project.Project = thisIssue.Project.Project &&
                User.User = saved.'Created By'.User &&
                'Membership State' = 'Membership State (Project Members)'.Active &&
                'Project Role' <> 'Project Role (Project Members)'.Stakeholder)),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] You must be a lead or contributor to change custom field values." })
        )
    )
)
```

### 23 · Pira · Custom Field Value · After update — Custom Field Values · Update · Post-operation

Same formula as 22 with `saved.'Modified By'` in the membership check, and this extra first branch inside the inner `If(`:

```powerfx
NewRecord.Issue.Issue <> OldRecord.Issue.Issue || NewRecord.'Custom Field'.'Custom Field' <> OldRecord.'Custom Field'.'Custom Field',
    Error({ Kind: ErrorKind.Validation, Message: "[INVALID_CUSTOM_FIELD_VALUE] A value's issue and field can't change." }),
```

### 24 · Pira · Notification · After create — Notifications · Create · Post-operation

```powerfx
// Phase 3. Notifications only go to members of the project (so nobody hears about issues they can't open),
// never to the sender, and carry no issue summary (the app writes only the event and a short detail).
With(
    { saved: LookUp(Notifications, Notification = NewRecord.Notification) },
    With(
        { thisIssue: LookUp(Issues, Issue = saved.Issue.Issue) },
        If(
            IsBlank(saved.Recipient) || IsBlank(saved.Project),
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A notification needs a recipient and a project." }),
            !IsBlank(saved.Issue) && (IsBlank(thisIssue) || thisIssue.Project.Project <> saved.Project.Project),
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] The issue must belong to the notification's project." }),
            saved.Recipient.User = saved.'Created By'.User,
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] People aren't notified about their own changes." }),
            IsBlank(LookUp('Project Members',
                Project.Project = saved.Project.Project && User.User = saved.Recipient.User &&
                'Membership State' = 'Membership State (Project Members)'.Active)),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project members can be notified about its issues." }),
            IsBlank(LookUp('Project Members',
                Project.Project = saved.Project.Project && User.User = saved.'Created By'.User &&
                'Membership State' = 'Membership State (Project Members)'.Active &&
                'Project Role' <> 'Project Role (Project Members)'.Stakeholder)),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors send project notifications." }),
            saved.'Is Read' = 'Is Read (Notifications)'.Yes || saved.'Delivery State' <> 'Delivery State (Notifications)'.Pending,
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] New notifications start unread and pending." })
        )
    )
)
```

### 25 · Pira · Notification · After update — Notifications · Update · Post-operation

```powerfx
// Phase 3. Content is fixed. Only the recipient marks a notification read; the optional delivery flow updates Delivery State.
With(
    { actor: LookUp(Notifications, Notification = NewRecord.Notification).'Modified By' },
    If(
        NewRecord.Recipient.User <> OldRecord.Recipient.User || NewRecord.Issue.Issue <> OldRecord.Issue.Issue ||
        NewRecord.Project.Project <> OldRecord.Project.Project || NewRecord.'Event Type' <> OldRecord.'Event Type' ||
        NewRecord.Detail <> OldRecord.Detail || NewRecord.'Item Count' <> OldRecord.'Item Count',
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A notification's content can't be changed." }),
        actor.User <> OldRecord.Recipient.User && (NewRecord.'Is Read' <> OldRecord.'Is Read' || NewRecord.'Read On' <> OldRecord.'Read On'),
            Error({ Kind: ErrorKind.Validation, Message: "[PERMISSION_DENIED] Only the recipient can mark a notification read." })
    )
)
```

### 26 · Pira · Issue Attachment · After create — Issue Attachments · Create · Post-operation

```powerfx
// Phase 3. The file itself is uploaded by a second request (an update of the File column), which only the uploader can make:
// the security role grants Write at User level on Issue Attachments.
With(
    { saved: LookUp('Issue Attachments', 'Issue Attachment' = NewRecord.'Issue Attachment') },
    With(
        { thisIssue: LookUp(Issues, Issue = saved.Issue.Issue) },
        If(
            IsBlank(thisIssue),
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_NOT_FOUND] That issue could not be found." }),
            thisIssue.Archived = 'Archived (Issues)'.Yes,
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.'Issue Key' & " is archived and read-only." }),
            IsBlank(LookUp('Project Members',
                Project.Project = thisIssue.Project.Project &&
                User.User = saved.'Created By'.User &&
                'Membership State' = 'Membership State (Project Members)'.Active &&
                'Project Role' <> 'Project Role (Project Members)'.Stakeholder)),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors can attach files." })
        )
    )
)
```

### 27 · Pira · Issue Attachment · After update — Issue Attachments · Update · Post-operation

```powerfx
With(
    { thisIssue: LookUp(Issues, Issue = OldRecord.Issue.Issue) },
    If(
        NewRecord.Issue.Issue <> OldRecord.Issue.Issue,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] An attachment can't move to another issue." }),
        thisIssue.Archived = 'Archived (Issues)'.Yes,
            Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.'Issue Key' & " is archived and read-only." })
    )
)
```

### 28 · Pira · Notification Preference · After create — Notification Preferences · Create · Post-operation

```powerfx
With(
    { saved: LookUp('Notification Preferences', 'Notification Preference' = NewRecord.'Notification Preference') },
    If(
        saved.User.User <> saved.'Created By'.User,
            Error({ Kind: ErrorKind.Validation, Message: "[PERMISSION_DENIED] You can only set your own notification preferences." }),
        CountRows(Filter('Notification Preferences', User.User = saved.User.User)) > 1,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] You already have notification preferences. Change those instead." })
    )
)
```

### 29 · Pira · Notification Preference · After update — Notification Preferences · Update · Post-operation

```powerfx
If(
    NewRecord.User.User <> OldRecord.User.User,
        Error({ Kind: ErrorKind.Validation, Message: "[PERMISSION_DENIED] Preferences can't move to another person." })
)
```

### 30 · Pira · Saved Filter · After create — Saved Filters · Create · Post-operation

```powerfx
// Phase 3. A filter stores criteria only; sharing it never shares issue data (results are queried as the viewer).
With(
    { saved: LookUp('Saved Filters', 'Saved Filter' = NewRecord.'Saved Filter') },
    If(
        IsBlank(saved.Project),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A saved filter belongs to a project." }),
        IsBlank(LookUp('Project Members',
            Project.Project = saved.Project.Project &&
            User.User = saved.'Created By'.User &&
            'Membership State' = 'Membership State (Project Members)'.Active)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project members can save filters in this project." })
    )
)
```

### 31 · Pira · Saved Filter · After update — Saved Filters · Update · Post-operation

```powerfx
// Write and Delete are User-level in the security role, so only the owner gets this far.
If(
    NewRecord.Project.Project <> OldRecord.Project.Project,
        Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A saved filter can't move to another project." })
)
```

---

## Check they work

Do these in the hosted app as a **non-admin** user with the Pira User role, and look at the Issue History table to confirm each row was written once.

| Check | Expected |
|---|---|
| Create an issue in a project you lead | Gets the next key (e.g. `QAS-1`); History tab shows "created the issue" |
| Outsider (not a member) creates an issue in the table editor or via the Web API | Error `[PROJECT_ACCESS_DENIED]`, **and no new row and no history row exist afterwards**. This confirms the post-operation rollback; if a row remains, stop and tell me. |
| Two people create issues in the same project at the same moment (or run two creates in parallel) | Different keys. If one shows "Another issue was created at the same moment", the app retried; the `Issue Key` alternate key is the guarantee |
| Move a card to Done, then back | Status history rows; Resolved On set, then cleared |
| Edit summary, priority, assignee, due date, parent | One "changed …" history row per field |
| Stakeholder edits an issue in the table editor | `[PROJECT_ACCESS_DENIED]`; the issue and its history are unchanged |
| Change a project's key after it has issues | `[PROJECT_KEY_LOCKED]` |
| Change your own role in the table editor | `[PERMISSION_DENIED] You can't change your own membership` |
| Edit an issue's Issue Key in the table editor | `[ISSUE_IMMUTABLE]` |
| Phase 2: start a second sprint on a board that already has an active one | `[SPRINT_ACTIVE_EXISTS]` |
| Phase 2: set a sprint's End Date before its Start Date (table editor) | `[VALIDATION_FAILED]` |
| Phase 2: edit a completed sprint's dates in the table editor | `[SPRINT_LOCKED]` |
| Phase 2: move an issue out of a completed sprint (table editor) | `[SPRINT_LOCKED]`; the issue is unchanged |
| Phase 2: contributor reopens a completed sprint with a note | `[PERMISSION_DENIED]`; a lead can do it |
| Phase 2: make an Epic the parent of another Epic, or a Task the parent of a Story | `[INVALID_PARENT_TYPE]` |
| Phase 2: change a Story with Task children into a Task | `[INVALID_TYPE_CHANGE]` |
| Phase 2: create Issue Links A blocks B, then B blocks A | Second one fails `[INVALID_LINK]` and is rolled back |
| Phase 2: add an issue to another project's board (Board Issues table editor) | `[BOARD_NOT_FOUND]` |
| Phase 2: change sprint / story points in the app | One "Sprint Changed" / "Story points" history row each |
| Phase 3: in a project with its own workflow, set an issue's Status to a move the workflow doesn't allow (table editor or Web API) | `[INVALID_TRANSITION]`; the issue and its history are unchanged |
| Phase 3: move an issue to Done through the Web API without a Resolution when the transition requires one | `[REQUIRED_FIELD_MISSING]`; nothing saved |
| Phase 3: move a Done issue back to To Do | Resolution is cleared; "Resolution" history row |
| Phase 3: a contributor adds a Workflow Transition row | `[PROJECT_ACCESS_DENIED]`, row rolled back |
| Phase 3: remove a status that still has issues by editing the project's Workflow Statuses | `[STATUS_IN_USE]` |
| Phase 3: put a Number Value on a Single choice field's value row, or a choice that isn't an option | `[INVALID_CUSTOM_FIELD_VALUE]` |
| Phase 3: create a Notification for someone who isn't a project member | `[PROJECT_ACCESS_DENIED]`, row rolled back |
| Phase 3: mark someone else's notification read | `[PERMISSION_DENIED]` |
| Phase 3: attach a file to an archived issue (Web API) | `[ISSUE_ARCHIVED]` |
| Phase 3: download another user's attachment as a user **without** the Pira User role | Dataverse returns 403; the app shows "You do not have permission…" |
| Phase 4: give an issue a Fix Version from another project, or an archived one (table editor / Web API) | `[VERSION_PROJECT_MISMATCH]` / `[VERSION_ARCHIVED]`; nothing saved |
| Phase 4: a contributor creates or renames a Version | `[PROJECT_ACCESS_DENIED]`, row rolled back |
| Phase 4: two versions with the same name in one project | `[VERSION_NAME_TAKEN]` |
| Phase 4: create a Work Log of 0 or 1,500 minutes, or dated next week | `[INVALID_WORK_LOG]`, nothing saved and Time Spent unchanged |
| Phase 4: log 2h in the app, then void it with a reason | Time Spent goes up by 120 then back down; two "worklog" history rows (logged, voided) |
| Phase 4: edit someone else's work log (Web API), or un-void a voided one | `[PROJECT_ACCESS_DENIED]` / `[WORK_LOG_LOCKED]` |
| Phase 4: set Time Spent on an issue directly, then log 30m | The next log recalculates Time Spent from the logs (the direct edit is overwritten) |
| Phase 4: move an issue To Do → In Progress → To Do → In Progress | Started On is set once, on the first move, and never changes after |
| Phase 5: create an Epic Solution row for a Task, or a second row for the same epic and stage (Web API) | `[INVALID_EPIC_SOLUTION]`, row rolled back |
| Phase 5: set an Epic Solution's URL to `https://evil.example` or move it to another stage | `[INVALID_EPIC_SOLUTION]`; nothing saved |
| Phase 5: a stakeholder links or unlinks a solution (Web API) | `[PROJECT_ACCESS_DENIED]` |
| Phase 5: set Solution Version `v1` on a story; set `1.0` on a task | `[INVALID_SOLUTION_VERSION]`; the task's value is cleared silently |
| Phase 5: change a story with Solution Version 1.2 to a Task | Saved; Solution Version is cleared and a "solutionVersion" history row is written |

If a plug-in fails with a runtime error, open it in the Accelerator, fix the red underline, save again, and check the plug-in trace log. Per Microsoft's tips, re-saving also fixes the "Failed response received from APIM" error.

## Limits to know about

- **Reads aren't protected.** Plug-ins only run on create/update/delete, so anyone with the Pira User role can still *read* every project through the Web API. Per-project read access needs owner teams or sharing (Phase 2+).
- **They run as the calling user.** Users therefore still need the table privileges the plug-ins use (for example Create on Issue History and Write on Project Sequence), so a determined user could add fake history rows through the Web API. They can't edit or delete history: the role grants no Write or Delete there.
- **Other writers.** Any flow, integration or admin tool that updates Pira rows must run as a user who is a project member; otherwise plug-ins 4, 8 and 11 reject the change (because Modified By is that identity).
- **Key allocation under load.** The sequence row is written before it's read, so concurrent creates in one project should queue on the row lock. This hasn't been tested in your environment yet; the `Issue Key` alternate key plus the app's retry keeps keys unique regardless. **Add that alternate key before go-live.**
- **Loop check depth.** Plug-in 3 rejects self-parenting and direct two-issue loops. Phase 2 type levels (Epic → Story → Task/Bug) make any *new* loop impossible, because every parent link must go up a level. Links created in Phase 1 that break the levels (e.g. a Story under a Task) could still be part of a longer loop; the app walks the full chain before saving, and the Phase 2 migration notes in [phase-2-manual-test.md](phase-2-manual-test.md#migration-from-phase-1) show how to find and fix them.
- **Labels, boards and board columns.** Writes to Labels, Issue Labels, Boards and Board Columns aren't checked by a plug-in yet. Board Issues (plug-in 16) and Issue Links (plug-in 17) are.
- **Deleting links and board memberships.** Low-code plug-ins here only cover create/update; removal relies on the security role's Delete privilege on Issue Links and Board Issues (grant it only at the levels in [dataverse-setup.md](dataverse-setup.md)).
- **Sprint completion isn't one transaction.** The app moves open issues first (each is validated by plug-in 3), then completes the sprint (plug-in 13). If something fails half way, the sprint stays Active and running Complete again finishes the job.
- **Project lead field.** The informational *Project Lead* column is set by the app and not re-checked; authority always comes from Project Member rows.
- **Time limit.** Each plug-in must finish within 2 minutes; these do only a few lookups and writes.
- **Display names.** The formulas use display names. Renaming a table, column or choice later breaks them until they're re-saved.
- **Phase 3: saving a workflow isn't one transaction.** The app writes transition rows first and the project's status list last, so the plug-ins only switch to the new rules once all rows exist. If a save fails half way, Save again finishes it.
- **Phase 3: reads still aren't per project.** Attachments, saved filters and notifications are protected by the security role like everything else. With Org-level Read, any Pira user can read any attachment through the Web API, exactly as they can read any issue. Closing that needs the record-level security already listed for issues.
- **Phase 3: required fields are checked on status changes only.** Clearing a resolution or assignee later (without a status change) isn't blocked, matching Jira.
- **Phase 3: bulk edit isn't all-or-nothing.** Each issue is saved separately and checked by plug-ins 3 and 4, so one rejected issue never blocks the others; the app lists every result and retries only failures.
- **Phase 3: notifications are best effort.** They're written after the issue save, by the person making the change. A failed notification never undoes the save. Delivery by email/Teams is a separate, optional flow ([notification-flow.md](notification-flow.md)).
- **Phase 4: Time Spent is derived, not locked.** Plug-ins 34–35 recalculate it from the work logs on every log change, but a direct API edit of the Issue column isn't blocked (the plug-in's own update can't be told apart from a person's). The next log change corrects it; reports and the app always treat the logs as the record.
- **Phase 4: logging work and adjusting the remaining estimate are two writes.** The log is saved (with its history and Time Spent) first, then the app updates the remaining estimate. If the second write fails, the app says so and the estimate can be fixed by hand.
- **Phase 4: releasing isn't one transaction.** Unfinished issues move first (each checked by plug-ins 3, 4 and 36), then the version is marked released. Releasing again finishes a partly failed release.
- **Phase 4: work-log dates use the server's day.** "Not in the future" allows one day of slack so people ahead of UTC can log today's work.

## Rollback

1. Set `SERVER_LOGIC = 'client'` in `dist/config/app-config.js` and redeploy (the app takes over keys and history again).
2. In the Dataverse Accelerator, delete (or remove from the solution) plug-ins 1, 2, 3 and 5 so they don't double up history. The others only validate and can stay.
3. Phase 3 only: to go back to the Phase 2 workflow behaviour, clear *Workflow Statuses* on every project (the default any-to-any rule applies again) and restore the Phase 2 formulas of plug-ins 1, 3 and 7 (this file at commit `f7339bc`). Plug-ins 18–31 only validate and can stay.
4. Phase 4 only: switch the Phase 4 features off in `FEATURES` (`dist/config/app-config.js`) and redeploy. Plug-ins 32–36 only validate or derive values for Phase 4 columns and can stay; to remove them, turn their steps off (or delete them from *Pira-plugins*) and restore plug-in 1 from `plugins/01-issue-before-create.fx` at commit `d71b7ea`. In 'client' mode the app takes over Time Spent, Started On and work-log history.
