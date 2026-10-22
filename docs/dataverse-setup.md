# Pira — Dataverse setup (manual steps)

Environment: **Platform-Tools** (`9b45eff8-d905-e28a-918f-2e315619890d`, `https://orgc34f5157.crm.dynamics.com/`).
Publisher prefix: `wd`. The ten tables below were created and published with the CAP table API on 2026-10-15 and verified against [`dist/config/dataverse-tables.json`](../dist/config/dataverse-tables.json).

| Table (display) | Logical name | Entity set |
|---|---|---|
| Project | `wd_project` | `wd_projects` |
| Project Sequence | `wd_projectsequence` | `wd_projectsequences` |
| Project Member | `wd_projectmember` | `wd_projectmembers` |
| Board | `wd_board` | `wd_boards` |
| Board Column | `wd_boardcolumn` | `wd_boardcolumns` |
| Issue | `wd_issue` | `wd_issues` |
| Issue Comment | `wd_issuecomment` | `wd_issuecomments` |
| Issue History | `wd_issuehistory` | `wd_issuehistories` |
| Label | `wd_label` | `wd_labels` |
| Issue Label | `wd_issuelabel` | `wd_issuelabels` |
| Sprint (Phase 2) | `wd_sprint` | `wd_sprints` |
| Board Issue (Phase 2) | `wd_boardissue` | `wd_boardissues` |
| Issue Link (Phase 2) | `wd_issuelink` | `wd_issuelinks` |
| Workflow Transition (Phase 3) | `wd_workflowtransition` | `wd_workflowtransitions` |
| Saved Filter (Phase 3) | `wd_savedfilter` | `wd_savedfilters` |
| Notification (Phase 3) | `wd_notification` | `wd_notifications` |
| Notification Preference (Phase 3) | `wd_notificationpreference` | `wd_notificationpreferences` |
| Issue Attachment (Phase 3) | `wd_issueattachment` | `wd_issueattachments` |
| Custom Field (Phase 3) | `wd_customfield` | `wd_customfields` |
| Custom Field Value (Phase 3) | `wd_customfieldvalue` | `wd_customfieldvalues` |
| Version (Phase 4) | `wd_version` | `wd_versions` |
| Work Log (Phase 4) | `wd_worklog` | `wd_worklogs` |
| Epic Solution (Phase 5) | `wd_epicsolution` | `wd_epicsolutions` |

Phase 2 (created, published and registered with the CAP table API on 2026-10-15) also added **Story Points** (`wd_storypoints`, whole number 0–1000) and **Sprint** (`wd_sprint`, lookup) to Issue.

Phase 3 (created, published and registered on 2026-10-16) added the seven tables above, **Resolution** (`wd_resolution`, choice) to Issue, and **Workflow Statuses** (`wd_workflowstatuses`), **Initial Status** (`wd_initialstatus`) and **Workflow Template** (`wd_workflowtemplate`) to Project. The *Status* choice on Issue and on Board Column gained **Backlog** (100000004), **Blocked** (100000005), **In Testing** (100000006) and **Closed** (100000007) through the `InsertOptionValue` Web API action, because the CAP table API skips columns that already exist. Issue Attachment's **File** column (`wd_file`) is a Dataverse file column limited to 10 MB.

Phase 4 (created, published and registered on 2026-10-21) added **Version** and **Work Log**, and five Issue columns: **Original Estimate** (`wd_originalestimate`), **Remaining Estimate** (`wd_remainingestimate`) and **Time Spent** (`wd_timespent`), all whole minutes; **Fix Version** (`wd_fixversion`, lookup to Version); and **Started On** (`wd_startedon`, the first time the issue entered an in-progress status, used for cycle time). Existing issues have blank Started On, so they're left out of cycle time until they move again.

Phase 5 (created, published and registered on 2026-10-21) added **Epic Solution** (one row per epic and stage: Dev/Test/Stage/Prod, with the Power Platform environment and the Dataverse solution linked there) and **Solution Version** (`wd_solutionversion`, text) on Issue, used by stories only.

## 1. Security role — "Pira User"

Create a new security role (Power Platform admin center → Environment → Settings → Users + permissions → Security roles → **New role**), name it **Pira User**, business unit = root. Then set the privileges below on the **Custom Entities** tab (and **Business Management** for User).

Depth key: **Org** = Organization, **User** = User (own records only), blank = None.

| Table | Create | Read | Write | Delete | Append | Append To | Assign | Share |
|---|---|---|---|---|---|---|---|---|
| Project | Org | Org | Org | | Org | Org | | |
| Project Sequence | Org | Org | Org | | Org | | | |
| Project Member | Org | Org | Org | | Org | | | |
| Board | Org | Org | Org | | Org | Org | | |
| Board Column | Org | Org | Org | | Org | | | |
| Issue | Org | Org | Org | | Org | Org | | |
| Issue Comment | Org | Org | **User** | | Org | | | |
| Issue History | Org | Org | | | Org | | | |
| Label | Org | Org | | | Org | Org | | |
| Issue Label | Org | Org | | **Org** | Org | | | |
| Sprint (Phase 2) | Org | Org | Org | | Org | Org | | |
| Board Issue (Phase 2) | Org | Org | | **Org** | Org | | | |
| Issue Link (Phase 2) | Org | Org | | **Org** | Org | | | |
| Workflow Transition (Phase 3) | Org | Org | Org | | Org | | | |
| Saved Filter (Phase 3) | Org | Org | **User** | **User** | Org | | | |
| Notification (Phase 3) | Org | Org | Org | | Org | | | |
| Notification Preference (Phase 3) | **User** | **User** | **User** | | Org | | | |
| Issue Attachment (Phase 3) | Org | Org | **User** | **User** | Org | | | |
| Custom Field (Phase 3) | Org | Org | Org | | Org | Org | | |
| Custom Field Value (Phase 3) | Org | Org | Org | | Org | | | |
| Version (Phase 4) | Org | Org | Org | | Org | Org | | |
| Work Log (Phase 4) | Org | Org | Org | | Org | | | |
| Epic Solution (Phase 5) | Org | Org | Org | | Org | | | |
| User (`systemuser`, Business Management tab) | | Org | | | | Org | | |

Why these choices:

- **Org-level Read/Write** is needed because records are owned by whoever created them, everyone on a project must see and edit them, and the low-code plug-ins run as the calling user. The plug-ins ([lowcode-plugins.md](lowcode-plugins.md)) restrict *writes* to project members; reads are not restricted per project (see Known gap below).
- **No Delete** on Project, Issue, Comment, History or Sprint: Pira archives or cancels instead of deleting, and history must be append-only. Issue Label, Board Issue and Issue Link are the exceptions (removing a label, a board membership or a link deletes its row).
- **Issue Comment Write = User** means Dataverse itself only lets people edit their own comments, matching the UI rule.
- **Issue History has no Write**, so history rows can't be altered once written.
- **Append / Append To** are required for the lookups (for example, Issue appends to Project; Comment appends to Issue; Project Member and Issue append to User).
- **Phase 3:**
  - *Workflow Transition* and *Custom Field* need Org Write because any lead may change them; plug-ins 18–21 allow leads only. There's no Delete: transitions and fields are deactivated/retired instead.
  - *Saved Filter* Write/Delete = **User**, so only the owner can change or delete a filter. Read is Org so project members can use shared filters; "Only me" hides a filter in Pira but isn't a secret (it only holds criteria, never issue data).
  - *Notification* needs Org Read/Write because the sender owns the row but the recipient reads it and marks it read (plug-in 25 limits who changes what). Rows contain no summaries.
  - *Notification Preference* is entirely **User** level: people only see and change their own row. Give the optional notification flow's account Org Read on it ([notification-flow.md](notification-flow.md)).
  - *Issue Attachment* Write/Delete = **User**: only the uploader can replace or delete their file. Downloads use Read, so anyone who can read the issue can read its files (no public links are ever created).
  - Append To on **Project** (transitions, filters, notifications, custom fields), **Issue** (notifications, attachments, values) and **Custom Field** (values) is already covered by the Org Append To on those tables.
- **Phase 4:**
  - *Version* needs Org Write because any lead may edit or release a version; plug-ins 32–33 allow leads only. No Delete: versions are archived. Append To lets issues point at a version (Fix Version).
  - *Work Log* needs Org Write because a lead may void someone else's log; plug-in 35 lets authors edit their own logs and leads only void. **No Delete**, so time records can't disappear: they are voided with a reason and stay visible. The Issue's Time Spent is recalculated by plug-ins 34–35 as the person logging work, which is covered by the existing Issue Write.
- **Phase 5:**
  - *Epic Solution* needs Org Write because any lead or contributor may change any stage's link; plug-ins 37–38 enforce that and keep epic, project and stage fixed. **No Delete**: unlinking empties the row, so every change goes through plug-in 38 and history.
  - The rows only hold IDs, names and a version snapshot. Versions shown in the app are read live from each environment *as the signed-in user* through the Dataverse connector, so people only see solutions they could already open there.

Assign **Pira User** together with the standard **Basic User** role to everyone who should use the app (directly or via a team / Entra group team). Share the Code App with the same people after deployment.

Optional **Pira Admin** role for 1–2 maintainers: copy Pira User and set every Pira table to Org for all privileges, including Delete (use for data clean-up only).

## 2. Alternate keys (uniqueness guards)

In **make.powerapps.com → Tables → (table) → Keys → New key**. The tables are empty, so the keys will build immediately (status goes Pending → Active within a few minutes).

| Table | Key display name | Columns |
|---|---|---|
| Project | Project Key | `Project Key` (`wd_key`) |
| Issue | Issue Key | `Issue Key` (`wd_issuekey`) |
| Project Sequence | One Sequence Per Project | `Project` (`wd_project`) |
| Project Member | One Membership Per User | `Project` (`wd_project`) + `User` (`wd_user`) |
| Board Issue (Phase 2) | One Row Per Board And Issue | `Board` (`wd_board`) + `Issue` (`wd_issue`) |
| Issue Link (Phase 2) | One Link Per Direction And Type | `From Issue` (`wd_fromissue`) + `To Issue` (`wd_toissue`) + `Link Type` (`wd_linktype`) |
| Workflow Transition (Phase 3) | One Transition Per Move | `Project` (`wd_project`) + `From Status` (`wd_fromstatus`) + `To Status` (`wd_tostatus`) |
| Notification Preference (Phase 3) | One Preference Row Per User | `User` (`wd_user`) |
| Custom Field Value (Phase 3) | One Value Per Issue And Field | `Issue` (`wd_issue`) + `Custom Field` (`wd_customfield`) |
| Version (Phase 4) | One Version Name Per Project | `Project` (`wd_project`) + `Version Name` (`wd_name`) |
| Epic Solution (Phase 5) | One Solution Per Epic And Stage | `Issue` (`wd_issue`) + `Stage` (`wd_stage`) |

The Issue key is the important one: it is what guarantees two people creating issues at the same moment never get the same key (the app retries automatically when Dataverse rejects a duplicate).

## 3. Solution (recommended)

The tables were created without a solution, so they currently live in the Default solution. To move them between environments later: **Solutions → New solution** "Pira" with publisher **wyattdave** → **Add existing → Table** → select the twenty-three `wd_` tables (choose *Include all objects*). Add the Pira User role to the same solution, and the optional notification flow with its connection references and the `wd_PiraAppUrl` environment variable ([notification-flow.md](notification-flow.md)).

## 4. Low-code plug-ins (server-side rules)

Create the thirty-nine automated low-code plug-ins in [lowcode-plugins.md](lowcode-plugins.md) **before deploying the app**. They allocate issue keys, validate status transitions against each project's workflow (including required fields), membership, sprint lifecycle, hierarchy, links, custom field values, notifications, attachments, versions, work logs and epic solutions, and write issue history. Add them to the Pira solution. Upgrading from Phase 1: replace plug-ins 1 and 3 and add 12–17. Upgrading from Phase 2: replace plug-ins 1, 3 and 7 and add 18–31. Upgrading from Phase 3: replace plug-in 1 and add 32–36 (already done in Platform-Tools on 2026-10-21). Upgrading from Phase 4: add 37–39 (already done in Platform-Tools on 2026-10-21).

## 4a. Office 365 Users connection (Phase 2 people search)

`power.config.json` now has an **Office 365 Users** connection reference (`office365users`). Project leads search Entra ID through it when adding members. On first launch after deploying, Power Apps asks each user to allow the connection. The person you add must also exist as a Dataverse user in Platform-Tools (they do once they're in the environment's security group or have been added in the admin center). If not, Pira shows them as "not set up in Dataverse yet" and can't add them. If the connection isn't available, the search falls back to Dataverse users.

## 4b. Power Platform connections (Phase 5 epic solutions)

`power.config.json` has two more connection references, generated with CAP from existing connections in Platform-Tools:

- **Power Platform for Admins V2** (`powerplatformadminv2`): *Retrieve a list of environments* (`ListEnvironmentsForUser`, api-version `2024-10-01`) fills the environment picker. It only returns environments the signed-in user can access; Pira keeps the ones with a Dataverse URL.
- **Microsoft Dataverse** (`commondataserviceforapps`): *List rows from selected environment* (`ListRecordsWithOrganization`) reads the `solutions` table (visible solutions only) in the chosen environment for the solution picker, the SchemaName auto-select and the live version / modified date.

Both are OAuth connections, so each user consents on first use and sees only what their own account can read. No service principal is involved. Pira never writes to those environments. A person without access to an environment simply gets "You don't have access…" for that stage.

## 5. Optional

- Enable auditing on **Issue** (Table properties → Advanced → *Audit changes to its data*) if you want Dataverse audit history in addition to Pira's own history.
- Phase 3: the email/Teams notification flow ([notification-flow.md](notification-flow.md)). In-app notifications work without it.
- Phase 3: the environment's **blocked file extensions** (System Settings → General) also apply to attachments, on top of Pira's own list (`BLOCKED_ATTACHMENT_EXTENSIONS` in `app-config.js`).

## Known gap: project-level read access

The low-code plug-ins stop non-members from *changing* a project's data, but plug-ins don't run on reads. With Org-level Read, anyone with the Pira User role can read every Pira project through the Dataverse Web API, even ones they aren't a member of. The app hides them, but that is UI-only. Closing this needs record-level security (an owner team per project, or access-team sharing). It's still open after Phase 2: dashboard counts use Dataverse `$count`, so they only ever include rows the user can read, but with Org-level Read that is every row.

Phase 3 keeps the same model and doesn't widen it: attachments download through the user's own Dataverse access (no public links), saved filters hold only criteria and always query as the person running them, and notifications hold no issue summaries and only go to project members. Once per-project read security exists, all three follow it automatically.

Phase 4 keeps it too: reports, CSV export and the dependency view all query Dataverse as the signed-in user, so they can never show more than that person could read through the Web API. Don't build Power BI reports on a shared service account; connect as each viewer so the same Dataverse security applies (see [phase-4-design.md](phase-4-design.md#analytics)).
