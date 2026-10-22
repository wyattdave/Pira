// Phase 3. Only leads change a project's workflow. Status values are Issue Status numbers (100000000-100000007).
With(
    { saved: LookUp(wd_workflowtransition, wd_workflowtransitionid = NewRecord.wd_workflowtransitionid) },
    With(
        { thisProject: LookUp(wd_project, wd_projectid = saved.wd_Project.wd_projectid) },
        If(
            IsBlank(thisProject),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_NOT_FOUND] Choose a valid project." }),
            thisProject.wd_state = wd_project_new_wd_project_wd_state.'100000001',
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] " & thisProject.wd_key & " is archived." }),
            saved.wd_fromstatus < 100000000 || saved.wd_fromstatus > 100000007 || saved.wd_tostatus < 100000000 || saved.wd_tostatus > 100000007 ||
                saved.wd_fromstatus = saved.wd_tostatus,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] A transition must connect two different statuses." }),
            saved.wd_requireresolution = wd_workflowtransition_new_wd_workflowtransition_wd_requireresolution.'1' &&
                saved.wd_tostatus <> 100000003 && saved.wd_tostatus <> 100000007,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] A resolution can only be required when moving to Done or Closed." }),
            CountRows(Filter(wd_workflowtransition,
                wd_Project.wd_projectid = saved.wd_Project.wd_projectid && wd_fromstatus = saved.wd_fromstatus && wd_tostatus = saved.wd_tostatus)) > 1,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] That transition already exists. Reactivate it instead." }),
            IsBlank(LookUp(wd_projectmember,
                wd_Project.wd_projectid = saved.wd_Project.wd_projectid &&
                wd_User.systemuserid = saved.createdby.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
                wd_projectrole = wd_projectmember_new_wd_projectmember_wd_projectrole.'100000000')),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can change the workflow." })
        )
    )
)
