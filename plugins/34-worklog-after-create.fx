// Phase 4. Validates a new work log, then recalculates the issue's Time Spent (sum of non-voided logs) and writes history,
// all in the same transaction. Durations are written as 1w 2d 3h 30m (1d = 8h, 1w = 5d), like the app.
With(
    { saved: LookUp(wd_worklog, wd_worklogid = NewRecord.wd_worklogid) },
    With(
        { thisIssue: LookUp(wd_issue, wd_issueid = saved.wd_Issue.wd_issueid), m: saved.wd_minutes },
        If(
            IsBlank(thisIssue) || saved.wd_Project.wd_projectid <> thisIssue.wd_Project.wd_projectid,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORK_LOG] A work log must belong to an issue in its own project." }),
            thisIssue.wd_archived = wd_issue_new_wd_issue_wd_archived.'1',
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.wd_issuekey & " is archived and read-only." }),
            saved.wd_voided = wd_worklog_new_wd_worklog_wd_voided.'1',
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORK_LOG] New work logs can't be voided." }),
            IsBlank(m) || m < 1 || m > 1440,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORK_LOG] Log between 1m and 24h per entry." }),
            IsBlank(saved.wd_workdate) || saved.wd_workdate > DateAdd(Today(), 1, TimeUnit.Days) || saved.wd_workdate < DateAdd(Today(), -366, TimeUnit.Days),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORK_LOG] The work date must be within the last year and not in the future." }),
            IsBlank(LookUp(wd_projectmember,
                wd_Project.wd_projectid = thisIssue.wd_Project.wd_projectid &&
                wd_User.systemuserid = saved.createdby.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
                wd_projectrole <> wd_projectmember_new_wd_projectmember_wd_projectrole.'100000002')),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors can log work." }),
            Patch(wd_issue, thisIssue, { wd_timespent: Sum(Filter(wd_worklog, wd_Issue.wd_issueid = thisIssue.wd_issueid &&
                wd_voided <> wd_worklog_new_wd_worklog_wd_voided.'1'), wd_minutes) });
            Collect(wd_issuehistory, {
                wd_name: Left(thisIssue.wd_issuekey & " worklog", 100), wd_Issue: thisIssue,
                wd_eventtype: wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000001', wd_fieldname: "worklog", wd_oldvalue: "",
                wd_newvalue: Left("Logged " & Coalesce(Trim(If(m >= 2400, Int(m / 2400) & "w ") & If(Mod(m, 2400) >= 480, Int(Mod(m, 2400) / 480) & "d ") &
                    If(Mod(m, 480) >= 60, Int(Mod(m, 480) / 60) & "h ") & If(Mod(m, 60) > 0, Mod(m, 60) & "m")), "0m") &
                    " on " & Text(saved.wd_workdate, "d mmm yyyy"), 400),
                wd_operationname: "LogWork"
            })
        )
    )
)
