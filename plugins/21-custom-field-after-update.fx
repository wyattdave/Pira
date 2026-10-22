// Phase 3. A field's type never changes once values may exist (retire it and add a new one instead).
With(
    { saved: LookUp(wd_customfield, wd_customfieldid = NewRecord.wd_customfieldid) },
    If(
        NewRecord.wd_Project.wd_projectid <> OldRecord.wd_Project.wd_projectid || NewRecord.wd_fieldtype <> OldRecord.wd_fieldtype,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] A custom field's project and type can't change." }),
        IsBlank(Trim(saved.wd_name)) ||
            (saved.wd_fieldtype = wd_customfield_new_wd_customfield_wd_fieldtype.'100000004' && IsBlank(Trim(saved.wd_options))),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Fields need a name, and single choice fields need options." }),
        CountRows(Filter(Filter(wd_customfield, wd_Project.wd_projectid = saved.wd_Project.wd_projectid),
            Lower(Trim(wd_name)) = Lower(Trim(saved.wd_name)))) > 1,
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Another field in this project already uses that name." }),
        IsBlank(LookUp(wd_projectmember,
            wd_Project.wd_projectid = saved.wd_Project.wd_projectid &&
            wd_User.systemuserid = saved.modifiedby.systemuserid &&
            wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
            wd_projectrole = wd_projectmember_new_wd_projectmember_wd_projectrole.'100000000')),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can change custom fields." })
    )
)
