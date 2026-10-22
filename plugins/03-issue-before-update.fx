// Docs: plug-in 3 in docs/lowcode-plugins.md. Compacted to fit the 10,000-character expression limit.
With({
 thisProject: LookUp(wd_project, wd_projectid = OldRecord.wd_Project.wd_projectid),
 thisIssue: LookUp(wd_issue, wd_issueid = OldRecord.wd_issueid),
 newParent: LookUp(wd_issue, wd_issueid = NewRecord.wd_ParentIssue.wd_issueid),
 newLevel: Switch(NewRecord.wd_issuetype, wd_issue_new_wd_issue_wd_issuetype.'100000003', 1, wd_issue_new_wd_issue_wd_issuetype.'100000002', 2, 3),
 nos: Table(
  {S: wd_issue_new_wd_issue_wd_status.'100000000', N: 100000000}, {S: wd_issue_new_wd_issue_wd_status.'100000001', N: 100000001},
  {S: wd_issue_new_wd_issue_wd_status.'100000002', N: 100000002}, {S: wd_issue_new_wd_issue_wd_status.'100000003', N: 100000003},
  {S: wd_issue_new_wd_issue_wd_status.'100000004', N: 100000004}, {S: wd_issue_new_wd_issue_wd_status.'100000005', N: 100000005},
  {S: wd_issue_new_wd_issue_wd_status.'100000006', N: 100000006}, {S: wd_issue_new_wd_issue_wd_status.'100000007', N: 100000007}),
 k: OldRecord.wd_issuekey,
 toName: Text(NewRecord.wd_status)
},
With({
 fromNo: LookUp(nos, S = OldRecord.wd_status).N,
 toNo: LookUp(nos, S = NewRecord.wd_status).N,
 changed: NewRecord.wd_status <> OldRecord.wd_status,
 newSprint: NewRecord.wd_Sprint.wd_sprintid <> OldRecord.wd_Sprint.wd_sprintid
},
With({
 fromDone: fromNo = 100000003 || fromNo = 100000007,
 toDone: toNo = 100000003 || toNo = 100000007,
 rule: LookUp(wd_workflowtransition, wd_Project.wd_projectid = OldRecord.wd_Project.wd_projectid && wd_fromstatus = fromNo && wd_tostatus = toNo &&
  wd_active = wd_workflowtransition_new_wd_workflowtransition_wd_active.'1')
},
If(
 NewRecord.wd_issuekey <> k || NewRecord.wd_issuesequence <> OldRecord.wd_issuesequence || NewRecord.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid,
  Error({Kind: ErrorKind.Validation, Message: "[ISSUE_IMMUTABLE] An issue's key and project can't be changed."}),
 OldRecord.wd_archived = wd_issue_new_wd_issue_wd_archived.'1',
  Error({Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & k & " is archived and read-only."}),
 thisProject.wd_state = wd_project_new_wd_project_wd_state.'100000001',
  Error({Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] " & thisProject.wd_key & " is archived. Restore it before changing issues."}),
 // Default workflow: any move between the first four statuses. Own workflow: an active transition to a listed status.
 changed && If(IsBlank(thisProject.wd_workflowstatuses), fromNo > 100000003 || toNo > 100000003,
  IsBlank(rule) || Find("," & Text(toNo, "0") & ",", "," & thisProject.wd_workflowstatuses & ",") = 0),
  Error({Kind: ErrorKind.Validation, Message: "[INVALID_TRANSITION] " & Text(OldRecord.wd_status) & " to " & toName & " isn't allowed by the project workflow."}),
 changed && !IsBlank(rule) && rule.wd_requireresolution = wd_workflowtransition_new_wd_workflowtransition_wd_requireresolution.'1' && IsBlank(NewRecord.wd_resolution),
  Error({Kind: ErrorKind.Validation, Message: "[REQUIRED_FIELD_MISSING] Choose a resolution to move " & k & " to " & toName & "."}),
 changed && !IsBlank(rule) && rule.wd_requireassignee = wd_workflowtransition_new_wd_workflowtransition_wd_requireassignee.'1' && IsBlank(NewRecord.wd_Assignee),
  Error({Kind: ErrorKind.Validation, Message: "[REQUIRED_FIELD_MISSING] Assign " & k & " before moving it to " & toName & "."}),
 changed && !IsBlank(rule) && rule.wd_requirestorypoints = wd_workflowtransition_new_wd_workflowtransition_wd_requirestorypoints.'1' && IsBlank(NewRecord.wd_storypoints),
  Error({Kind: ErrorKind.Validation, Message: "[REQUIRED_FIELD_MISSING] Estimate story points for " & k & " before moving it to " & toName & "."}),
 changed && !IsBlank(rule) && rule.wd_requireduedate = wd_workflowtransition_new_wd_workflowtransition_wd_requireduedate.'1' && IsBlank(NewRecord.wd_duedate),
  Error({Kind: ErrorKind.Validation, Message: "[REQUIRED_FIELD_MISSING] Set a due date for " & k & " before moving it to " & toName & "."}),
 !IsBlank(newParent) && newParent.wd_issueid <> OldRecord.wd_ParentIssue.wd_issueid &&
  (newParent.wd_issueid = OldRecord.wd_issueid || newParent.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid || newParent.wd_ParentIssue.wd_issueid = OldRecord.wd_issueid),
  Error({Kind: ErrorKind.Validation, Message: "[INVALID_PARENT_RELATIONSHIP] The parent must be another issue in the same project and can't create a loop."}),
 !IsBlank(newParent) && (newParent.wd_issueid <> OldRecord.wd_ParentIssue.wd_issueid || NewRecord.wd_issuetype <> OldRecord.wd_issuetype) &&
  Switch(newParent.wd_issuetype, wd_issue_new_wd_issue_wd_issuetype.'100000003', 1, wd_issue_new_wd_issue_wd_issuetype.'100000002', 2, 3) >= newLevel,
  Error({Kind: ErrorKind.Validation, Message: "[INVALID_PARENT_TYPE] Epics hold Stories, Tasks and Bugs; Stories hold Tasks and Bugs."}),
 NewRecord.wd_issuetype <> OldRecord.wd_issuetype &&
  !IsBlank(LookUp(wd_issue, wd_ParentIssue.wd_issueid = OldRecord.wd_issueid && wd_archived <> wd_issue_new_wd_issue_wd_archived.'1' &&
   Switch(wd_issuetype, wd_issue_new_wd_issue_wd_issuetype.'100000003', 1, wd_issue_new_wd_issue_wd_issuetype.'100000002', 2, 3) <= newLevel)),
  Error({Kind: ErrorKind.Validation, Message: "[INVALID_TYPE_CHANGE] That issue type doesn't fit its children."}),
 // Completed and cancelled sprints keep their issues; the new sprint must be open and in this project.
 newSprint && !IsBlank(OldRecord.wd_Sprint) &&
  (OldRecord.wd_Sprint.wd_sprintstate = wd_sprint_new_wd_sprint_wd_sprintstate.'100000002' || OldRecord.wd_Sprint.wd_sprintstate = wd_sprint_new_wd_sprint_wd_sprintstate.'100000003'),
  Error({Kind: ErrorKind.Validation, Message: "[SPRINT_LOCKED] " & OldRecord.wd_Sprint.wd_name & " is completed or cancelled, so its issues are locked."}),
 newSprint && !IsBlank(NewRecord.wd_Sprint) && NewRecord.wd_Sprint.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid,
  Error({Kind: ErrorKind.Validation, Message: "[SPRINT_PROJECT_MISMATCH] Only issues from the sprint's own project can be added to it."}),
 newSprint && !IsBlank(NewRecord.wd_Sprint) &&
  NewRecord.wd_Sprint.wd_sprintstate <> wd_sprint_new_wd_sprint_wd_sprintstate.'100000000' && NewRecord.wd_Sprint.wd_sprintstate <> wd_sprint_new_wd_sprint_wd_sprintstate.'100000001',
  Error({Kind: ErrorKind.Validation, Message: "[SPRINT_LOCKED] " & NewRecord.wd_Sprint.wd_name & " is completed or cancelled."}),
 // Valid: stamp Resolved On, clear the resolution outside Done/Closed, and write history in the same transaction.
 If(changed,
  If(toDone && !fromDone, Set(NewRecord.wd_resolvedon, Now()), fromDone && !toDone, Set(NewRecord.wd_resolvedon, Blank()));
  If(!toDone, Set(NewRecord.wd_resolution, Blank())));
 ForAll(
  Filter(
   Table(
    {F: "status", O: Text(OldRecord.wd_status), N: toName, E: 3, P: "TransitionIssue"},
    {F: "archived", O: "No", N: If(NewRecord.wd_archived = wd_issue_new_wd_issue_wd_archived.'1', "Yes", "No"), E: 6, P: "ArchiveIssue"},
    {F: "sprint", O: Coalesce(OldRecord.wd_Sprint.wd_name, "Backlog"), N: Coalesce(NewRecord.wd_Sprint.wd_name, "Backlog"), E: 5, P: "UpdateIssue"},
    {F: "summary", O: OldRecord.wd_summary, N: NewRecord.wd_summary, E: 1, P: "UpdateIssue"},
    {F: "description", O: Left(OldRecord.wd_description, 120), N: Left(NewRecord.wd_description, 120), E: 1, P: "UpdateIssue"},
    {F: "type", O: Text(OldRecord.wd_issuetype), N: Text(NewRecord.wd_issuetype), E: 1, P: "UpdateIssue"},
    {F: "priority", O: Text(OldRecord.wd_priority), N: Text(NewRecord.wd_priority), E: 1, P: "UpdateIssue"},
    {F: "assignee", O: Coalesce(OldRecord.wd_Assignee.fullname, "Unassigned"), N: Coalesce(NewRecord.wd_Assignee.fullname, "Unassigned"), E: 1, P: "UpdateIssue"},
    {F: "dueDate", O: Coalesce(Text(OldRecord.wd_duedate, "d mmm yyyy"), "None"), N: Coalesce(Text(NewRecord.wd_duedate, "d mmm yyyy"), "None"), E: 1, P: "UpdateIssue"},
    {F: "parent", O: Coalesce(OldRecord.wd_ParentIssue.wd_issuekey, "None"), N: Coalesce(NewRecord.wd_ParentIssue.wd_issuekey, "None"), E: 1, P: "UpdateIssue"},
    {F: "points", O: Coalesce(Text(OldRecord.wd_storypoints), "None"), N: Coalesce(Text(NewRecord.wd_storypoints), "None"), E: 1, P: "UpdateIssue"},
    {F: "resolution", O: Coalesce(Text(OldRecord.wd_resolution), "None"), N: If(toDone, Coalesce(Text(NewRecord.wd_resolution), "None"), "None"), E: 1, P: "UpdateIssue"}
   ),
   Coalesce(O, "") <> Coalesce(N, "")
  ),
  Collect(wd_issuehistory, {wd_name: Left(k & " " & F, 100), wd_Issue: thisIssue, wd_eventtype: Switch(E, 3, wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000003', 6, wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000006',
    5, wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000005', wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000001'), wd_fieldname: F,
   wd_oldvalue: Left(O, 400), wd_newvalue: Left(N, 400), wd_operationname: P})
 )
))))
