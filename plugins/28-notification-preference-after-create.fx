With(
    { saved: LookUp(wd_notificationpreference, wd_notificationpreferenceid = NewRecord.wd_notificationpreferenceid) },
    If(
        saved.wd_User.systemuserid <> saved.createdby.systemuserid,
            Error({ Kind: ErrorKind.Validation, Message: "[PERMISSION_DENIED] You can only set your own notification preferences." }),
        CountRows(Filter(wd_notificationpreference, wd_User.systemuserid = saved.wd_User.systemuserid)) > 1,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] You already have notification preferences. Change those instead." })
    )
)
