// Phase 3: also checks the workflow columns. Who changed them (leads only) is checked by plug-in 8.
With(
    {
        newKey: Upper(Trim(NewRecord.wd_key)),
        newList: "," & NewRecord.wd_workflowstatuses & ","
    },
    If(
        newKey <> OldRecord.wd_key && !IsBlank(LookUp(wd_issue, wd_Project.wd_projectid = OldRecord.wd_projectid)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_KEY_LOCKED] The project key can't change once the project has issues." }),
        !IsMatch(newKey, "[A-Z][A-Z0-9]{1,9}"),
            Error({ Kind: ErrorKind.Validation, Message: "[VALIDATION_FAILED] Project keys must be 2-10 letters or numbers and start with a letter." }),
        newKey <> OldRecord.wd_key && !IsBlank(LookUp(wd_project, wd_key = newKey && wd_projectid <> OldRecord.wd_projectid)),
            Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_KEY_TAKEN] " & newKey & " is already used by another project." }),
        !IsBlank(NewRecord.wd_workflowstatuses) && !IsMatch(NewRecord.wd_workflowstatuses, "1000000[0-7](,1000000[0-7])*"),
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] The workflow status list isn't valid." }),
        !IsBlank(NewRecord.wd_workflowstatuses) &&
            (Find("," & Text(NewRecord.wd_initialstatus, "0") & ",", newList) = 0 ||
             NewRecord.wd_initialstatus = 100000003 || NewRecord.wd_initialstatus = 100000007),
            Error({ Kind: ErrorKind.Validation, Message: "[INVALID_WORKFLOW] The initial status must be an open status from the workflow." }),
        // The inner Filter is delegated (one project); the status test then runs over that project's issues only.
        !IsBlank(NewRecord.wd_workflowstatuses) && NewRecord.wd_workflowstatuses <> Coalesce(OldRecord.wd_workflowstatuses, "") &&
            !IsBlank(LookUp(
                Filter(wd_issue, wd_Project.wd_projectid = OldRecord.wd_projectid && wd_archived <> wd_issue_new_wd_issue_wd_archived.'1'),
                Find("," & Text(Switch(wd_status,
                    wd_issue_new_wd_issue_wd_status.'100000000', 100000000, wd_issue_new_wd_issue_wd_status.'100000001', 100000001,
                    wd_issue_new_wd_issue_wd_status.'100000002', 100000002, wd_issue_new_wd_issue_wd_status.'100000003', 100000003,
                    wd_issue_new_wd_issue_wd_status.'100000004', 100000004, wd_issue_new_wd_issue_wd_status.'100000005', 100000005,
                    wd_issue_new_wd_issue_wd_status.'100000006', 100000006, 100000007), "0") & ",", newList) = 0)),
            Error({ Kind: ErrorKind.Validation, Message: "[STATUS_IN_USE] Some issues still use a status that isn't in the new workflow. Move them first." }),
        Set(NewRecord.wd_key, newKey)
    )
)
