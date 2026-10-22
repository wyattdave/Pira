If(
    NewRecord.wd_User.systemuserid <> OldRecord.wd_User.systemuserid,
        Error({ Kind: ErrorKind.Validation, Message: "[PERMISSION_DENIED] Preferences can't move to another person." })
)
