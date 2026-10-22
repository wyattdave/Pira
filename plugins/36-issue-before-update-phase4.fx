// Phase 4, kept apart from plug-in 3 (which is close to the 10,000-character limit). Fix version must be an active version of
// the issue's own project; Started On is stamped the first time the issue enters an in-progress status and can't be edited;
// Time Spent can't be written directly: any change is replaced by the sum of non-voided work logs (what plug-ins 34-35 write);
// fix version and estimate changes are written to history in the same transaction.
With(
    {
        newVersion: LookUp(wd_version, wd_versionid = NewRecord.wd_FixVersion.wd_versionid),
        versionChanged: NewRecord.wd_FixVersion.wd_versionid <> OldRecord.wd_FixVersion.wd_versionid,
        toProgress: NewRecord.wd_status <> OldRecord.wd_status && (
            NewRecord.wd_status = wd_issue_new_wd_issue_wd_status.'100000001' || NewRecord.wd_status = wd_issue_new_wd_issue_wd_status.'100000002' ||
            NewRecord.wd_status = wd_issue_new_wd_issue_wd_status.'100000005' || NewRecord.wd_status = wd_issue_new_wd_issue_wd_status.'100000006'),
        oe: OldRecord.wd_originalestimate, ne: NewRecord.wd_originalestimate,
        orr: OldRecord.wd_remainingestimate, nr: NewRecord.wd_remainingestimate,
        k: OldRecord.wd_issuekey
    },
    If(
        versionChanged && !IsBlank(NewRecord.wd_FixVersion) && (IsBlank(newVersion) || newVersion.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid),
            Error({ Kind: ErrorKind.Validation, Message: "[VERSION_PROJECT_MISMATCH] Only versions from " & k & "'s own project can be used." }),
        versionChanged && !IsBlank(newVersion) && newVersion.wd_versionstate = wd_version_new_wd_version_wd_versionstate.'100000002',
            Error({ Kind: ErrorKind.Validation, Message: "[VERSION_ARCHIVED] " & newVersion.wd_name & " is archived, so issues can't be added to it." }),
        If(toProgress && IsBlank(OldRecord.wd_startedon), Set(NewRecord.wd_startedon, Now()), Set(NewRecord.wd_startedon, OldRecord.wd_startedon));
        If(Coalesce(NewRecord.wd_timespent, -1) <> Coalesce(OldRecord.wd_timespent, -1),
            Set(NewRecord.wd_timespent, Sum(Filter(wd_worklog, wd_Issue.wd_issueid = OldRecord.wd_issueid &&
                wd_voided <> wd_worklog_new_wd_worklog_wd_voided.'1'), wd_minutes)));
        ForAll(
            Filter(
                Table(
                    { F: "fixVersion", O: Coalesce(OldRecord.wd_FixVersion.wd_name, "None"), N: Coalesce(newVersion.wd_name, "None") },
                    { F: "originalEstimate",
                      O: If(IsBlank(oe), "None", Coalesce(Trim(If(oe >= 2400, Int(oe / 2400) & "w ") & If(Mod(oe, 2400) >= 480, Int(Mod(oe, 2400) / 480) & "d ") & If(Mod(oe, 480) >= 60, Int(Mod(oe, 480) / 60) & "h ") & If(Mod(oe, 60) > 0, Mod(oe, 60) & "m")), "0m")),
                      N: If(IsBlank(ne), "None", Coalesce(Trim(If(ne >= 2400, Int(ne / 2400) & "w ") & If(Mod(ne, 2400) >= 480, Int(Mod(ne, 2400) / 480) & "d ") & If(Mod(ne, 480) >= 60, Int(Mod(ne, 480) / 60) & "h ") & If(Mod(ne, 60) > 0, Mod(ne, 60) & "m")), "0m")) },
                    { F: "remainingEstimate",
                      O: If(IsBlank(orr), "None", Coalesce(Trim(If(orr >= 2400, Int(orr / 2400) & "w ") & If(Mod(orr, 2400) >= 480, Int(Mod(orr, 2400) / 480) & "d ") & If(Mod(orr, 480) >= 60, Int(Mod(orr, 480) / 60) & "h ") & If(Mod(orr, 60) > 0, Mod(orr, 60) & "m")), "0m")),
                      N: If(IsBlank(nr), "None", Coalesce(Trim(If(nr >= 2400, Int(nr / 2400) & "w ") & If(Mod(nr, 2400) >= 480, Int(Mod(nr, 2400) / 480) & "d ") & If(Mod(nr, 480) >= 60, Int(Mod(nr, 480) / 60) & "h ") & If(Mod(nr, 60) > 0, Mod(nr, 60) & "m")), "0m")) }
                ),
                O <> N
            ),
            Collect(wd_issuehistory, {
                wd_name: Left(k & " " & F, 100), wd_Issue: LookUp(wd_issue, wd_issueid = OldRecord.wd_issueid),
                wd_eventtype: wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000001', wd_fieldname: F,
                wd_oldvalue: Left(O, 400), wd_newvalue: Left(N, 400), wd_operationname: "UpdateIssue"
            })
        )
    )
)
