// Phase 3. Content is fixed. Only the recipient marks a notification read; the optional delivery flow updates Delivery State.
With(
    { actor: LookUp(wd_notification, wd_notificationid = NewRecord.wd_notificationid).modifiedby },
    If(
        NewRecord.wd_Recipient.systemuserid <> OldRecord.wd_Recipient.systemuserid || NewRecord.wd_Issue.wd_issueid <> OldRecord.wd_Issue.wd_issueid ||
        NewRecord.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid || NewRecord.wd_eventtype <> OldRecord.wd_eventtype ||
        NewRecord.wd_detail <> OldRecord.wd_detail || NewRecord.wd_itemcount <> OldRecord.wd_itemcount,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A notification's content can't be changed." }),
        actor.systemuserid <> OldRecord.wd_Recipient.systemuserid &&
            (NewRecord.wd_isread <> OldRecord.wd_isread || NewRecord.wd_readon <> OldRecord.wd_readon),
            Error({ Kind: ErrorKind.Validation, Message: "[PERMISSION_DENIED] Only the recipient can mark a notification read." })
    )
)
