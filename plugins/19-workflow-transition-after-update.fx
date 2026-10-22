// Phase 3. Transitions are switched off with Active = No, never re-pointed, so history of the workflow stays readable.
With(
    { saved: LookUp(wd_workflowtransition, wd_workflowtransitionid = NewRecord.wd_workflowtransitionid) },
    If(
        NewRecord.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid ||
        NewRecord.wd_fromstatus <> OldRecord.wd_fromstatus || NewRecord.wd_tostatus <> OldRecord.wd_tostatus,
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] A transition's project and statuses can't change. Deactivate it and add a new one." }),
        saved.wd_requireresolution = wd_workflowtransition_new_wd_workflowtransition_wd_requireresolution.'1' &&
            saved.wd_tostatus <> 100000003 && saved.wd_tostatus <> 100000007,
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] A resolution can only be required when moving to Done or Closed." }),
        IsBlank(LookUp(wd_projectmember,
            wd_Project.wd_projectid = saved.wd_Project.wd_projectid &&
            wd_User.systemuserid = saved.modifiedby.systemuserid &&
            wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
            wd_projectrole = wd_projectmember_new_wd_projectmember_wd_projectrole.'100000000')),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can change the workflow." })
    )
)
