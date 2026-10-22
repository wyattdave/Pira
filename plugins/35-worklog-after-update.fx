// Phase 4. Work logs are never deleted. The author may edit or void their own log; a project lead may void (only void) anyone's.
// Voided logs are locked. Time Spent is recalculated and the change is written to history in the same transaction.
With(
    { saved: LookUp(wd_worklog, wd_worklogid = NewRecord.wd_worklogid) },
    With(
        {
            thisIssue: LookUp(wd_issue, wd_issueid = OldRecord.wd_Issue.wd_issueid),
            m: saved.wd_minutes,
            om: OldRecord.wd_minutes,
            voiding: saved.wd_voided = wd_worklog_new_wd_worklog_wd_voided.'1',
            member: LookUp(wd_projectmember,
                wd_Project.wd_projectid = OldRecord.wd_Project.wd_projectid &&
                wd_User.systemuserid = saved.modifiedby.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
                wd_projectrole <> wd_projectmember_new_wd_projectmember_wd_projectrole.'100000002')
        },
        If(
            NewRecord.wd_Issue.wd_issueid <> OldRecord.wd_Issue.wd_issueid || NewRecord.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORK_LOG] A work log can't move to another issue." }),
            OldRecord.wd_voided = wd_worklog_new_wd_worklog_wd_voided.'1',
                Error({ Kind: ErrorKind.Validation, Message: "[WORK_LOG_LOCKED] Voided work logs can't be changed." }),
            thisIssue.wd_archived = wd_issue_new_wd_issue_wd_archived.'1',
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.wd_issuekey & " is archived and read-only." }),
            IsBlank(member),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors can change work logs." }),
            saved.modifiedby.systemuserid <> saved.createdby.systemuserid &&
                !(voiding && member.wd_projectrole = wd_projectmember_new_wd_projectmember_wd_projectrole.'100000000' && m = om &&
                    saved.wd_workdate = OldRecord.wd_workdate && Coalesce(saved.wd_workcomment, "") = Coalesce(OldRecord.wd_workcomment, "")),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only the person who logged the work can change it; project leads can void it." }),
            voiding && IsBlank(Trim(saved.wd_voidreason)),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORK_LOG] Give a reason for voiding the work log." }),
            IsBlank(m) || m < 1 || m > 1440,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORK_LOG] Log between 1m and 24h per entry." }),
            IsBlank(saved.wd_workdate) || (saved.wd_workdate <> OldRecord.wd_workdate &&
                (saved.wd_workdate > DateAdd(Today(), 1, TimeUnit.Days) || saved.wd_workdate < DateAdd(Today(), -366, TimeUnit.Days))),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORK_LOG] The work date must be within the last year and not in the future." }),
            Patch(wd_issue, thisIssue, { wd_timespent: Sum(Filter(wd_worklog, wd_Issue.wd_issueid = thisIssue.wd_issueid &&
                wd_voided <> wd_worklog_new_wd_worklog_wd_voided.'1'), wd_minutes) });
            With(
                {
                    oldText: Coalesce(Trim(If(om >= 2400, Int(om / 2400) & "w ") & If(Mod(om, 2400) >= 480, Int(Mod(om, 2400) / 480) & "d ") &
                        If(Mod(om, 480) >= 60, Int(Mod(om, 480) / 60) & "h ") & If(Mod(om, 60) > 0, Mod(om, 60) & "m")), "0m") & " on " & Text(OldRecord.wd_workdate, "d mmm yyyy"),
                    newText: Coalesce(Trim(If(m >= 2400, Int(m / 2400) & "w ") & If(Mod(m, 2400) >= 480, Int(Mod(m, 2400) / 480) & "d ") &
                        If(Mod(m, 480) >= 60, Int(Mod(m, 480) / 60) & "h ") & If(Mod(m, 60) > 0, Mod(m, 60) & "m")), "0m") & " on " & Text(saved.wd_workdate, "d mmm yyyy")
                },
                Collect(wd_issuehistory, {
                    wd_name: Left(thisIssue.wd_issuekey & " worklog", 100), wd_Issue: thisIssue,
                    wd_eventtype: wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000001', wd_fieldname: "worklog", wd_oldvalue: Left(oldText, 400),
                    wd_newvalue: Left(If(voiding, "Voided: " & saved.wd_voidreason, newText), 400),
                    wd_operationname: If(voiding, "VoidWorkLog", "EditWorkLog")
                })
            )
        )
    )
)
