// Validates the project, parent and sprint, then allocates the issue key on the server.
// Membership is checked by plug-in 2 once Dataverse has stamped Created By.
// Type levels: Epic 1, Story 2, Task/Bug 3. A parent must sit on a lower level number than its child.
With(
    {
        thisProject: LookUp(wd_project, wd_projectid = NewRecord.wd_Project.wd_projectid),
        newParent: LookUp(wd_issue, wd_issueid = NewRecord.wd_ParentIssue.wd_issueid),
        newSprint: LookUp(wd_sprint, wd_sprintid = NewRecord.wd_Sprint.wd_sprintid),
        newVersion: LookUp(wd_version, wd_versionid = NewRecord.wd_FixVersion.wd_versionid),
        childLevel: Switch(NewRecord.wd_issuetype, wd_issue_new_wd_issue_wd_issuetype.'100000003', 1, wd_issue_new_wd_issue_wd_issuetype.'100000002', 2, 3)
    },
    If(
        IsBlank(thisProject),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_NOT_FOUND] Choose a valid project." }),
        thisProject.wd_state = wd_project_new_wd_project_wd_state.'100000001',
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] " & thisProject.wd_key & " is archived. Restore it before adding issues." }),
        !IsBlank(newParent) && newParent.wd_Project.wd_projectid <> thisProject.wd_projectid,
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_PARENT_RELATIONSHIP] The parent issue must be in the same project." }),
        !IsBlank(newParent) &&
            Switch(newParent.wd_issuetype, wd_issue_new_wd_issue_wd_issuetype.'100000003', 1, wd_issue_new_wd_issue_wd_issuetype.'100000002', 2, 3) >= childLevel,
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_PARENT_TYPE] Epics hold Stories, Tasks and Bugs; Stories hold Tasks and Bugs." }),
        !IsBlank(newSprint) && newSprint.wd_Project.wd_projectid <> thisProject.wd_projectid,
            Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_PROJECT_MISMATCH] Only issues from the sprint's own project can be added to it." }),
        !IsBlank(newSprint) &&
            newSprint.wd_sprintstate <> wd_sprint_new_wd_sprint_wd_sprintstate.'100000000' && newSprint.wd_sprintstate <> wd_sprint_new_wd_sprint_wd_sprintstate.'100000001',
            Error({ Kind: ErrorKind.Validation, Message: "[SPRINT_LOCKED] " & newSprint.wd_name & " is completed or cancelled." }),
        // Phase 4: the fix version must be an active version of the same project.
        !IsBlank(NewRecord.wd_FixVersion) && (IsBlank(newVersion) || newVersion.wd_Project.wd_projectid <> thisProject.wd_projectid),
            Error({ Kind: ErrorKind.Validation, Message: "[VERSION_PROJECT_MISMATCH] Only versions from the issue's own project can be used." }),
        !IsBlank(newVersion) && newVersion.wd_versionstate = wd_version_new_wd_version_wd_versionstate.'100000002',
            Error({ Kind: ErrorKind.Validation, Message: "[VERSION_ARCHIVED] " & newVersion.wd_name & " is archived, so issues can't be added to it." }),
        With(
            { seq: LookUp(wd_projectsequence, wd_Project.wd_projectid = thisProject.wd_projectid) },
            If(
                IsBlank(seq),
                    Collect(wd_projectsequence, { wd_name: thisProject.wd_key, wd_Project: thisProject, wd_nextnumber: 2 });
                    Set(NewRecord.wd_issuesequence, 1);
                    Set(NewRecord.wd_issuekey, thisProject.wd_key & "-1"),
                // Write first so this transaction holds the row lock, then re-read the number.
                Patch(wd_projectsequence, seq, { wd_name: thisProject.wd_key });
                With(
                    { nextNumber: Max(1, LookUp(wd_projectsequence, wd_projectsequenceid = seq.wd_projectsequenceid).wd_nextnumber) },
                    Patch(wd_projectsequence, seq, { wd_nextnumber: nextNumber + 1 });
                    Set(NewRecord.wd_issuesequence, nextNumber);
                    Set(NewRecord.wd_issuekey, thisProject.wd_key & "-" & Text(nextNumber))
                )
            )
        );
        // Phase 3: new issues start in the project's initial status (To Do for the default workflow). Done statuses are never initial.
        Set(NewRecord.wd_status, If(IsBlank(thisProject.wd_workflowstatuses), wd_issue_new_wd_issue_wd_status.'100000000',
            Switch(Text(thisProject.wd_initialstatus, "0"),
                "100000001", wd_issue_new_wd_issue_wd_status.'100000001',
                "100000002", wd_issue_new_wd_issue_wd_status.'100000002',
                "100000004", wd_issue_new_wd_issue_wd_status.'100000004',
                "100000005", wd_issue_new_wd_issue_wd_status.'100000005',
                "100000006", wd_issue_new_wd_issue_wd_status.'100000006',
                wd_issue_new_wd_issue_wd_status.'100000000')));
        Set(NewRecord.wd_resolution, Blank());
        // Phase 4: time spent only comes from work logs; Started On is set when the initial status is an in-progress one.
        Set(NewRecord.wd_timespent, Blank());
        Set(NewRecord.wd_startedon, If(!IsBlank(thisProject.wd_workflowstatuses) &&
            Text(thisProject.wd_initialstatus, "0") in ["100000001", "100000002", "100000005", "100000006"], Now(), Blank()));
        Set(NewRecord.wd_archived, wd_issue_new_wd_issue_wd_archived.'0')
    )
)
