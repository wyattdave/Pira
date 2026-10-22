// Write and Delete are User-level in the security role, so only the owner gets this far.
If(
    NewRecord.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid,
        Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A saved filter can't move to another project." })
)
