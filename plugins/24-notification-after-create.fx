// Phase 3. Notifications only go to members of the project, never to the sender, and carry no issue summary.
With(
    { saved: LookUp(wd_notification, wd_notificationid = NewRecord.wd_notificationid) },
    With(
        { thisIssue: LookUp(wd_issue, wd_issueid = saved.wd_Issue.wd_issueid) },
        If(
            IsBlank(saved.wd_Recipient) || IsBlank(saved.wd_Project),
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A notification needs a recipient and a project." }),
            !IsBlank(saved.wd_Issue) && (IsBlank(thisIssue) || thisIssue.wd_Project.wd_projectid <> saved.wd_Project.wd_projectid),
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] The issue must belong to the notification's project." }),
            saved.wd_Recipient.systemuserid = saved.createdby.systemuserid,
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] People aren't notified about their own changes." }),
            IsBlank(LookUp(wd_projectmember,
                wd_Project.wd_projectid = saved.wd_Project.wd_projectid && wd_User.systemuserid = saved.wd_Recipient.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000')),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project members can be notified about its issues." }),
            IsBlank(LookUp(wd_projectmember,
                wd_Project.wd_projectid = saved.wd_Project.wd_projectid && wd_User.systemuserid = saved.createdby.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
                wd_projectrole <> wd_projectmember_new_wd_projectmember_wd_projectrole.'100000002')),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only leads and contributors send project notifications." }),
            saved.wd_isread = wd_notification_new_wd_notification_wd_isread.'1' ||
                saved.wd_deliverystate <> wd_notification_new_wd_notification_wd_deliverystate.'100000000',
                Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] New notifications start unread and pending." })
        )
    )
)
