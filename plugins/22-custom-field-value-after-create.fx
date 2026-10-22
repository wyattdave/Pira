// Phase 3. Only the column for the field's type may hold a value, choice values must be one of the options (one per line),
// and the field must apply to the issue's type. Yes/No columns default to No, so Boolean Value isn't checked.
With(
    { saved: LookUp(wd_customfieldvalue, wd_customfieldvalueid = NewRecord.wd_customfieldvalueid) },
    With(
        {
            thisField: LookUp(wd_customfield, wd_customfieldid = saved.wd_CustomField.wd_customfieldid),
            thisIssue: LookUp(wd_issue, wd_issueid = saved.wd_Issue.wd_issueid),
            hasValue: !IsBlank(saved.wd_textvalue) || !IsBlank(saved.wd_numbervalue) || !IsBlank(saved.wd_datevalue)
        },
        If(
            IsBlank(thisField) || IsBlank(thisIssue) || thisField.wd_Project.wd_projectid <> thisIssue.wd_Project.wd_projectid,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_CUSTOM_FIELD_VALUE] The field and the issue must belong to the same project." }),
            thisField.wd_active = wd_customfield_new_wd_customfield_wd_active.'0',
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_CUSTOM_FIELD_VALUE] " & thisField.wd_name & " is retired." }),
            thisIssue.wd_archived = wd_issue_new_wd_issue_wd_archived.'1',
                Error({ Kind: ErrorKind.Validation, Message: "[ISSUE_ARCHIVED] " & thisIssue.wd_issuekey & " is archived and read-only." }),
            Switch(thisField.wd_fieldtype,
                wd_customfield_new_wd_customfield_wd_fieldtype.'100000000', !IsBlank(saved.wd_numbervalue) || !IsBlank(saved.wd_datevalue) || Len(saved.wd_textvalue) > 400,
                wd_customfield_new_wd_customfield_wd_fieldtype.'100000001', !IsBlank(saved.wd_textvalue) || !IsBlank(saved.wd_datevalue),
                wd_customfield_new_wd_customfield_wd_fieldtype.'100000002', !IsBlank(saved.wd_textvalue) || !IsBlank(saved.wd_numbervalue),
                wd_customfield_new_wd_customfield_wd_fieldtype.'100000003', hasValue,
                !IsBlank(saved.wd_numbervalue) || !IsBlank(saved.wd_datevalue) ||
                    (!IsBlank(saved.wd_textvalue) && Find(Char(10) & saved.wd_textvalue & Char(10), Char(10) & thisField.wd_options & Char(10)) = 0)
            ),
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_CUSTOM_FIELD_VALUE] That value doesn't match the " & thisField.wd_name & " field type." }),
            hasValue && !IsBlank(thisField.wd_issuetypes) &&
                Find("," & Text(Switch(thisIssue.wd_issuetype,
                    wd_issue_new_wd_issue_wd_issuetype.'100000000', 100000000, wd_issue_new_wd_issue_wd_issuetype.'100000001', 100000001,
                    wd_issue_new_wd_issue_wd_issuetype.'100000002', 100000002, 100000003), "0") & ",", "," & thisField.wd_issuetypes & ",") = 0,
                Error({ Kind: ErrorKind.Validation, Message: "[INVALID_CUSTOM_FIELD_VALUE] " & thisField.wd_name & " isn't used for this issue type." }),
            IsBlank(LookUp(wd_projectmember,
                wd_Project.wd_projectid = thisIssue.wd_Project.wd_projectid &&
                wd_User.systemuserid = saved.createdby.systemuserid &&
                wd_membershipstate = wd_projectmember_new_wd_projectmember_wd_membershipstate.'100000000' &&
                wd_projectrole <> wd_projectmember_new_wd_projectmember_wd_projectrole.'100000002')),
                Error({ Kind: ErrorKind.Validation, Message: "[PROJECT_ACCESS_DENIED] You must be a lead or contributor to change custom field values." })
        )
    )
)
