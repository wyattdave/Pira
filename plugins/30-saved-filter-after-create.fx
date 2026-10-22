// Phase 3. A filter stores criteria only; sharing it never shares issue data (results are queried as the viewer).
With(
    { saved: LookUp(wd_savedfilter, wd_savedfilterid = NewRecord.wd_savedfilterid) },
    If(
        IsBlank(saved.wd_Project),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A saved filter belongs to a project." }),
        IsBlank(LookUp(wd_projectmember,
            wd_Project.wd_projectid = saved.wd_Project.wd_projectid &&
            wd_User.systemuserid = saved.createdby.systemuserid &&
            wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000')),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project members can save filters in this project." })
    )
)
