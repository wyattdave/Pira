// Phase 4. Only project leads add versions. New versions start unreleased, names are unique per project and the release
// date can't be before the start date.
With(
    { saved: LookUp(wd_version, wd_versionid = NewRecord.wd_versionid) },
    With(
        { thisProject: LookUp(wd_project, wd_projectid = saved.wd_Project.wd_projectid) },
        If(
            IsBlank(thisProject),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_NOT_FOUND] Choose a valid project." }),
            thisProject.wd_state = wd_project_new_wd_project_wd_state.'100000001',
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ARCHIVED] " & thisProject.wd_key & " is archived. Restore it before adding versions." }),
            IsBlank(Trim(saved.wd_name)),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_VERSION] Version name is required." }),
            !IsBlank(saved.wd_startdate) && !IsBlank(saved.wd_releasedate) && saved.wd_releasedate < saved.wd_startdate,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_VERSION] The release date can't be before the start date." }),
            saved.wd_versionstate <> wd_version_new_wd_version_wd_versionstate.'100000000',
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_VERSION] New versions start unreleased." }),
            CountRows(Filter(Filter(wd_version, wd_Project.wd_projectid = thisProject.wd_projectid),
                Lower(Trim(wd_name)) = Lower(Trim(saved.wd_name)))) > 1,
                Error({ Kind: ErrorKind.Validation, Message: "[VERSION_NAME_TAKEN] Another version in " & thisProject.wd_key & " already uses that name." }),
            IsBlank(LookUp(wd_projectmember,
                wd_Project.wd_projectid = thisProject.wd_projectid &&
                wd_User.systemuserid = saved.createdby.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
                wd_projectrole = wd_projectmember_new_wd_projectmember_wd_projectrole.'100000000')),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] Only project leads can manage versions." })
        )
    )
)
