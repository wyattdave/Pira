With(
    { thisIssue: LookUp(wd_issue, wd_issueid = OldRecord.wd_Issue.wd_issueid) },
    If(
        NewRecord.wd_Issue.wd_issueid <> OldRecord.wd_Issue.wd_issueid,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] An attachment can't move to another issue." }),
        thisIssue.wd_archived = wd_issue_new_wd_issue_wd_archived.'1',
            Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.wd_issuekey & " is archived and read-only." })
    )
)
