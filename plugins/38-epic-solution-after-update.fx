// Phase 5. An Epic Solution row keeps its epic, project and stage; the epic stays unarchived in an active project; a solution is
// either complete from an https Dataverse host or fully cleared (unlink); only leads and contributors change it. Changes to the
// linked environment or solution are written to the epic's history in the same transaction.
With(
    { saved: LookUp(wd_epicsolution, wd_epicsolutionid = NewRecord.wd_epicsolutionid) },
    With(
        {
            thisIssue: LookUp(wd_issue, wd_issueid = OldRecord.wd_Issue.wd_issueid),
            sk: If(OldRecord.wd_stage = wd_epicsolution_new_wd_epicsolution_wd_stage.'100000000', "dev",
                OldRecord.wd_stage = wd_epicsolution_new_wd_epicsolution_wd_stage.'100000001', "test",
                OldRecord.wd_stage = wd_epicsolution_new_wd_epicsolution_wd_stage.'100000002', "stage", "prod"),
            linked: !IsBlank(saved.wd_solutionid),
            wasLinked: !IsBlank(OldRecord.wd_solutionid)
        },
        If(
            saved.wd_Issue.wd_issueid <> OldRecord.wd_Issue.wd_issueid || saved.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid ||
                saved.wd_stage <> OldRecord.wd_stage,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_EPIC_SOLUTION] A solution link can't move to another epic, project or stage." }),
            thisIssue.wd_archived = wd_issue_new_wd_issue_wd_archived.'1',
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.wd_issuekey & " is archived and read-only." }),
            LookUp(wd_project, wd_projectid = thisIssue.wd_Project.wd_projectid).wd_state = wd_project_new_wd_project_wd_state.'100000001',
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] The project is archived. Restore it before changing solutions." }),
            linked <> !IsBlank(saved.wd_environmentid) || linked <> !IsBlank(saved.wd_solutionuniquename) || linked <> !IsBlank(saved.wd_environmenturl),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_EPIC_SOLUTION] Choose both an environment and a solution, or unlink both." }),
            linked && (
                !IsMatch(saved.wd_environmenturl, "https://[a-z0-9-]+(\.[a-z0-9-]+)*\.(dynamics\.com|dynamics\.cn|microsoftdynamics\.us|appsplatform\.us|microsoftdynamics\.de)") ||
                !IsMatch(saved.wd_solutionid, "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                !IsMatch(saved.wd_environmentid, "[A-Za-z0-9-]{1,100}") ||
                !IsMatch(saved.wd_solutionuniquename, "[A-Za-z_][A-Za-z0-9_]{0,99}")),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_EPIC_SOLUTION] The environment or solution details aren't valid." }),
            IsBlank(LookUp(wd_projectmember,
                wd_Project.wd_projectid = thisIssue.wd_Project.wd_projectid &&
                wd_User.systemuserid = saved.modifiedby.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
                wd_projectrole <> wd_projectmember_new_wd_projectmember_wd_projectrole.'100000002')),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors can change an epic's solutions." }),
            Coalesce(saved.wd_solutionid, "") <> Coalesce(OldRecord.wd_solutionid, "") || Coalesce(saved.wd_environmentid, "") <> Coalesce(OldRecord.wd_environmentid, ""),
                Collect(wd_issuehistory, {
                    wd_name: Left(thisIssue.wd_issuekey & " solution:" & sk, 100), wd_Issue: thisIssue,
                    wd_eventtype: wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000001', wd_fieldname: "solution:" & sk,
                    wd_oldvalue: If(wasLinked, Left(Coalesce(OldRecord.wd_solutionname, OldRecord.wd_solutionuniquename) &
                        If(!IsBlank(OldRecord.wd_solutionversion), " " & OldRecord.wd_solutionversion) & " in " & Coalesce(OldRecord.wd_environmentname, "environment"), 400), "None"),
                    wd_newvalue: If(linked, Left(Coalesce(saved.wd_solutionname, saved.wd_solutionuniquename) &
                        If(!IsBlank(saved.wd_solutionversion), " " & saved.wd_solutionversion) & " in " & Coalesce(saved.wd_environmentname, "environment"), 400), "None"),
                    wd_operationname: If(linked, "LinkSolution", "UnlinkSolution")
                })
        )
    )
)
