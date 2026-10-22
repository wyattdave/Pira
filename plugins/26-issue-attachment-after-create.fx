// Phase 3. The file is uploaded by a second request (an update of the File column), which only the uploader can make
// because the security role grants Write at User level on Issue Attachments.
With(
    { saved: LookUp(wd_issueattachment, wd_issueattachmentid = NewRecord.wd_issueattachmentid) },
    With(
        { thisIssue: LookUp(wd_issue, wd_issueid = saved.wd_Issue.wd_issueid) },
        If(
            IsBlank(thisIssue),
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_NOT_FOUND] That issue could not be found." }),
            thisIssue.wd_archived = wd_issue_new_wd_issue_wd_archived.'1',
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.wd_issuekey & " is archived and read-only." }),
            IsBlank(LookUp(wd_projectmember,
                wd_Project.wd_projectid = thisIssue.wd_Project.wd_projectid &&
                wd_User.systemuserid = saved.createdby.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
                wd_projectrole <> wd_projectmember_new_wd_projectmember_wd_projectrole.'100000002')),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors can attach files." })
        )
    )
)
