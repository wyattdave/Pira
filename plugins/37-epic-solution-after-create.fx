// Phase 5. A new Epic Solution row belongs to an unarchived epic in its own active project, is the only row for that epic and
// stage, links a complete solution from an https Dataverse host (or nothing), and was created by a lead or contributor.
// The link is written to the epic's history in the same transaction.
With(
    { saved: LookUp(wd_epicsolution, wd_epicsolutionid = NewRecord.wd_epicsolutionid) },
    With(
        {
            thisIssue: LookUp(wd_issue, wd_issueid = saved.wd_Issue.wd_issueid),
            sk: If(saved.wd_stage = wd_epicsolution_new_wd_epicsolution_wd_stage.'100000000', "dev",
                saved.wd_stage = wd_epicsolution_new_wd_epicsolution_wd_stage.'100000001', "test",
                saved.wd_stage = wd_epicsolution_new_wd_epicsolution_wd_stage.'100000002', "stage", "prod"),
            linked: !IsBlank(saved.wd_solutionid)
        },
        If(
            IsBlank(thisIssue) || saved.wd_Project.wd_projectid <> thisIssue.wd_Project.wd_projectid,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_EPIC_SOLUTION] A solution link must belong to an epic in its own project." }),
            thisIssue.wd_issuetype <> wd_issue_new_wd_issue_wd_issuetype.'100000003',
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_EPIC_SOLUTION] Only epics link solutions." }),
            thisIssue.wd_archived = wd_issue_new_wd_issue_wd_archived.'1',
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.wd_issuekey & " is archived and read-only." }),
            LookUp(wd_project, wd_projectid = thisIssue.wd_Project.wd_projectid).wd_state = wd_project_new_wd_project_wd_state.'100000001',
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] The project is archived. Restore it before changing solutions." }),
            IsBlank(saved.wd_stage),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_EPIC_SOLUTION] Choose a stage." }),
            CountRows(Filter(wd_epicsolution, wd_Issue.wd_issueid = thisIssue.wd_issueid && wd_stage = saved.wd_stage)) > 1,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_EPIC_SOLUTION] " & thisIssue.wd_issuekey & " already has a row for that stage." }),
            linked <> !IsBlank(saved.wd_environmentid) || linked <> !IsBlank(saved.wd_solutionuniquename) || linked <> !IsBlank(saved.wd_environmenturl),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_EPIC_SOLUTION] Choose both an environment and a solution." }),
            linked && (
                !IsMatch(saved.wd_environmenturl, "https://[a-z0-9-]+(\.[a-z0-9-]+)*\.(dynamics\.com|dynamics\.cn|microsoftdynamics\.us|appsplatform\.us|microsoftdynamics\.de)") ||
                !IsMatch(saved.wd_solutionid, "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                !IsMatch(saved.wd_environmentid, "[A-Za-z0-9-]{1,100}") ||
                !IsMatch(saved.wd_solutionuniquename, "[A-Za-z_][A-Za-z0-9_]{0,99}")),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_EPIC_SOLUTION] The environment or solution details aren't valid." }),
            IsBlank(LookUp(wd_projectmember,
                wd_Project.wd_projectid = thisIssue.wd_Project.wd_projectid &&
                wd_User.systemuserid = saved.createdby.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
                wd_projectrole <> wd_projectmember_new_wd_projectmember_wd_projectrole.'100000002')),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors can change an epic's solutions." }),
            linked,
                Collect(wd_issuehistory, {
                    wd_name: Left(thisIssue.wd_issuekey & " solution:" & sk, 100), wd_Issue: thisIssue,
                    wd_eventtype: wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000001', wd_fieldname: "solution:" & sk, wd_oldvalue: "None",
                    wd_newvalue: Left(Coalesce(saved.wd_solutionname, saved.wd_solutionuniquename) & If(!IsBlank(saved.wd_solutionversion), " " & saved.wd_solutionversion) &
                        " in " & Coalesce(saved.wd_environmentname, "environment"), 400),
                    wd_operationname: "LinkSolution"
                })
        )
    )
)
