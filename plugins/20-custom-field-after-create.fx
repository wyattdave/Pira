// Phase 3. Custom fields are configuration: leads only, single choice needs options, unique names per project.
With(
    { saved: LookUp(wd_customfield, wd_customfieldid = NewRecord.wd_customfieldid) },
    If(
        IsBlank(saved.wd_Project) || IsBlank(Trim(saved.wd_name)),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A custom field needs a project and a name." }),
        saved.wd_fieldtype = wd_customfield_new_wd_customfield_wd_fieldtype.'100000004' && IsBlank(Trim(saved.wd_options)),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Single choice fields need at least one option." }),
        CountRows(Filter(Filter(wd_customfield, wd_Project.wd_projectid = saved.wd_Project.wd_projectid),
            Lower(Trim(wd_name)) = Lower(Trim(saved.wd_name)))) > 1,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Another field in this project already uses that name." }),
        IsBlank(LookUp(wd_projectmember,
            wd_Project.wd_projectid = saved.wd_Project.wd_projectid &&
            wd_User.systemuserid = saved.createdby.systemuserid &&
            wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
            wd_projectrole = wd_projectmember_new_wd_projectmember_wd_projectrole.'100000000')),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can add custom fields." })
    )
)
