// Phase 5. Solution Version belongs to stories only: it is cleared automatically when the issue isn't a story, must be up to
// four numbers separated by dots, and changes are written to history in the same transaction.
With(
    {
        isStory: NewRecord.wd_issuetype = wd_issue_new_wd_issue_wd_issuetype.'100000002',
        sv: Trim(NewRecord.wd_solutionversion),
        k: OldRecord.wd_issuekey
    },
    If(
        isStory && !IsBlank(sv) && !IsMatch(sv, "\d{1,9}(\.\d{1,9}){0,3}"),
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_SOLUTION_VERSION] Use numbers separated by dots, e.g. 1.0.0.2." }),
        Set(NewRecord.wd_solutionversion, If(isStory && !IsBlank(sv), sv, Blank()));
        If(If(isStory && !IsBlank(sv), sv, "") <> Coalesce(OldRecord.wd_solutionversion, ""),
            Collect(wd_issuehistory, {
                wd_name: Left(k & " solutionVersion", 100), wd_Issue: LookUp(wd_issue, wd_issueid = OldRecord.wd_issueid),
                wd_eventtype: wd_issuehistory_new_wd_issuehistory_wd_eventtype.'100000001', wd_fieldname: "solutionVersion",
                wd_oldvalue: Coalesce(OldRecord.wd_solutionversion, "None"), wd_newvalue: If(isStory && !IsBlank(sv), sv, "None"),
                wd_operationname: "UpdateIssue"
            }))
    )
)
