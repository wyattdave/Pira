// Pira runtime configuration. Public values only — no secrets, tenant IDs or environment URLs.
export const APP_NAME = 'Pira';
export const THEME_STORAGE_KEY = 'pira-theme';
export const RECENT_PROJECTS_STORAGE_KEY = 'pira-recent-projects';

// Dataverse tables. `set` is the entity set name used by every SDK call.
export const TABLES = Object.freeze({
  projects: Object.freeze({ set: 'wd_projects', key: 'wd_projectid', logical: 'wd_project' }),
  projectSequences: Object.freeze({ set: 'wd_projectsequences', key: 'wd_projectsequenceid', logical: 'wd_projectsequence' }),
  projectMembers: Object.freeze({ set: 'wd_projectmembers', key: 'wd_projectmemberid', logical: 'wd_projectmember' }),
  boards: Object.freeze({ set: 'wd_boards', key: 'wd_boardid', logical: 'wd_board' }),
  boardColumns: Object.freeze({ set: 'wd_boardcolumns', key: 'wd_boardcolumnid', logical: 'wd_boardcolumn' }),
  issues: Object.freeze({ set: 'wd_issues', key: 'wd_issueid', logical: 'wd_issue' }),
  comments: Object.freeze({ set: 'wd_issuecomments', key: 'wd_issuecommentid', logical: 'wd_issuecomment' }),
  history: Object.freeze({ set: 'wd_issuehistories', key: 'wd_issuehistoryid', logical: 'wd_issuehistory' }),
  labels: Object.freeze({ set: 'wd_labels', key: 'wd_labelid', logical: 'wd_label' }),
  issueLabels: Object.freeze({ set: 'wd_issuelabels', key: 'wd_issuelabelid', logical: 'wd_issuelabel' }),
  users: Object.freeze({ set: 'systemusers', key: 'systemuserid', logical: 'systemuser' }),
  sprints: Object.freeze({ set: 'wd_sprints', key: 'wd_sprintid', logical: 'wd_sprint' }),
  boardIssues: Object.freeze({ set: 'wd_boardissues', key: 'wd_boardissueid', logical: 'wd_boardissue' }),
  issueLinks: Object.freeze({ set: 'wd_issuelinks', key: 'wd_issuelinkid', logical: 'wd_issuelink' }),
  workflowTransitions: Object.freeze({ set: 'wd_workflowtransitions', key: 'wd_workflowtransitionid', logical: 'wd_workflowtransition' }),
  savedFilters: Object.freeze({ set: 'wd_savedfilters', key: 'wd_savedfilterid', logical: 'wd_savedfilter' }),
  notifications: Object.freeze({ set: 'wd_notifications', key: 'wd_notificationid', logical: 'wd_notification' }),
  notificationPreferences: Object.freeze({ set: 'wd_notificationpreferences', key: 'wd_notificationpreferenceid', logical: 'wd_notificationpreference' }),
  attachments: Object.freeze({ set: 'wd_issueattachments', key: 'wd_issueattachmentid', logical: 'wd_issueattachment' }),
  customFields: Object.freeze({ set: 'wd_customfields', key: 'wd_customfieldid', logical: 'wd_customfield' }),
  customFieldValues: Object.freeze({ set: 'wd_customfieldvalues', key: 'wd_customfieldvalueid', logical: 'wd_customfieldvalue' }),
  versions: Object.freeze({ set: 'wd_versions', key: 'wd_versionid', logical: 'wd_version' }),
  workLogs: Object.freeze({ set: 'wd_worklogs', key: 'wd_worklogid', logical: 'wd_worklog' }),
  epicSolutions: Object.freeze({ set: 'wd_epicsolutions', key: 'wd_epicsolutionid', logical: 'wd_epicsolution' }),
});

// Phase 4/5 capabilities can be switched off independently; the UI hides them and the data service refuses their calls.
export const FEATURES = Object.freeze({
  timeTracking: true, releases: true, advancedQuery: true, analytics: true, csv: true, dependencies: true, powerPlatform: true,
});

// Office 365 Users connector (power.config.json connectionReferences) used for Entra people search.
export const PEOPLE_CONNECTOR = 'office365users';

export const ISSUE_TYPES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'task', label: 'Task', level: 3 }),
  Object.freeze({ value: 100000001, key: 'bug', label: 'Bug', level: 3 }),
  Object.freeze({ value: 100000002, key: 'story', label: 'Story', level: 2 }),
  Object.freeze({ value: 100000003, key: 'epic', label: 'Epic', level: 1 }),
]);

// Status catalogue (the Issue Status choice). Each project picks its own list from here (Project settings → Workflow).
// Category drives "open" vs "done" everywhere: filters, metrics, Resolved On and resolutions.
export const ISSUE_STATUSES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'todo', label: 'To Do', category: 'todo' }),
  Object.freeze({ value: 100000001, key: 'progress', label: 'In Progress', category: 'progress' }),
  Object.freeze({ value: 100000002, key: 'review', label: 'In Review', category: 'progress' }),
  Object.freeze({ value: 100000003, key: 'done', label: 'Done', category: 'done' }),
  Object.freeze({ value: 100000004, key: 'backlog', label: 'Backlog', category: 'todo' }),
  Object.freeze({ value: 100000005, key: 'blocked', label: 'Blocked', category: 'progress' }),
  Object.freeze({ value: 100000006, key: 'testing', label: 'In Testing', category: 'progress' }),
  Object.freeze({ value: 100000007, key: 'closed', label: 'Closed', category: 'done' }),
]);
export const STATUS_CATEGORIES = Object.freeze([
  Object.freeze({ key: 'todo', label: 'To do' }),
  Object.freeze({ key: 'progress', label: 'In progress' }),
  Object.freeze({ key: 'done', label: 'Done' }),
]);

// Issue Resolution choice. Cleared when an issue leaves a done-category status.
export const RESOLUTIONS = Object.freeze([
  Object.freeze({ value: 100000000, key: 'done', label: 'Done' }),
  Object.freeze({ value: 100000001, key: 'wontdo', label: 'Won\'t Do' }),
  Object.freeze({ value: 100000002, key: 'duplicate', label: 'Duplicate' }),
  Object.freeze({ value: 100000003, key: 'cannotreproduce', label: 'Cannot Reproduce' }),
]);

// Ordered lowest → highest so sorting by value sorts by priority.
export const PRIORITIES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'lowest', label: 'Lowest' }),
  Object.freeze({ value: 100000001, key: 'low', label: 'Low' }),
  Object.freeze({ value: 100000002, key: 'medium', label: 'Medium' }),
  Object.freeze({ value: 100000003, key: 'high', label: 'High' }),
  Object.freeze({ value: 100000004, key: 'highest', label: 'Highest' }),
]);

export const PROJECT_TYPES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'kanban', label: 'Kanban' }),
  Object.freeze({ value: 100000001, key: 'scrum', label: 'Scrum' }),
  Object.freeze({ value: 100000002, key: 'general', label: 'General' }),
]);

export const PROJECT_STATE = Object.freeze({ active: 100000000, archived: 100000001 });
export const MEMBER_ROLES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'lead', label: 'Lead' }),
  Object.freeze({ value: 100000001, key: 'contributor', label: 'Contributor' }),
  Object.freeze({ value: 100000002, key: 'stakeholder', label: 'Stakeholder' }),
]);
export const MEMBER_STATE = Object.freeze({ active: 100000000, removed: 100000001 });
export const BOARD_TYPE = Object.freeze({ kanban: 100000000, scrum: 100000001 });
export const BOARD_TYPES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'kanban', label: 'Kanban' }),
  Object.freeze({ value: 100000001, key: 'scrum', label: 'Scrum (active sprint)' }),
]);

// Sprint lifecycle. Allowed moves; Completed → Active is the lead-only correction path and needs a note.
export const SPRINT_STATES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'planned', label: 'Planned' }),
  Object.freeze({ value: 100000001, key: 'active', label: 'Active' }),
  Object.freeze({ value: 100000002, key: 'completed', label: 'Completed' }),
  Object.freeze({ value: 100000003, key: 'cancelled', label: 'Cancelled' }),
]);
export const SPRINT_STATE = Object.freeze({ planned: 100000000, active: 100000001, completed: 100000002, cancelled: 100000003 });
export const SPRINT_TRANSITIONS = Object.freeze({
  100000000: Object.freeze([100000001, 100000003]),
  100000001: Object.freeze([100000002]),
  100000002: Object.freeze([100000001]),
  100000003: Object.freeze([]),
});

// Links are stored once, From → To. Blocks and Duplicates read the other way round from the target issue.
export const LINK_TYPES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'blocks', label: 'Blocks', sOutward: 'blocks', sInward: 'is blocked by', bSymmetric: false }),
  Object.freeze({ value: 100000001, key: 'relates', label: 'Relates to', sOutward: 'relates to', sInward: 'relates to', bSymmetric: true }),
  Object.freeze({ value: 100000002, key: 'duplicates', label: 'Duplicates', sOutward: 'duplicates', sInward: 'is duplicated by', bSymmetric: false }),
]);
export const HISTORY_EVENTS = Object.freeze({
  created: 100000000, fieldChanged: 100000001, commented: 100000002, transitioned: 100000003,
  linked: 100000004, sprintChanged: 100000005, archived: 100000006,
});

// Default workflow (Jira "simplified workflow"): every status may move to every other status. Projects without a saved
// workflow (Phase 1/2 projects) use this; plug-in 3 applies the same rule server-side.
export const WORKFLOW = Object.freeze({
  initialStatus: 100000000,
  doneStatus: 100000003,
  statuses: Object.freeze([100000000, 100000001, 100000002, 100000003]),
  transitions: Object.freeze({
    100000000: Object.freeze([100000001, 100000002, 100000003]),
    100000001: Object.freeze([100000000, 100000002, 100000003]),
    100000002: Object.freeze([100000000, 100000001, 100000003]),
    100000003: Object.freeze([100000000, 100000001, 100000002]),
  }),
});

// Fields a workflow transition may require (allowlist). `column` is the yes/no column on Workflow Transition.
export const TRANSITION_REQUIREMENTS = Object.freeze([
  Object.freeze({ key: 'resolution', label: 'Resolution', column: 'wd_requireresolution' }),
  Object.freeze({ key: 'assignee', label: 'Assignee', column: 'wd_requireassignee' }),
  Object.freeze({ key: 'storyPoints', label: 'Story points', column: 'wd_requirestorypoints' }),
  Object.freeze({ key: 'dueDate', label: 'Due date', column: 'wd_requireduedate' }),
]);

// Project templates. Transitions are [from, to, [required field keys]]; 'all' = any listed status to any other.
export const PROJECT_TEMPLATES = Object.freeze([
  Object.freeze({
    key: 'kanban', label: 'Kanban', iProjectType: 100000000,
    sDescription: 'To Do, In Progress and Done. Any move is allowed.',
    aStatuses: Object.freeze([100000000, 100000001, 100000003]), iInitialStatus: 100000000, aTransitions: 'all', aCustomFields: Object.freeze([]),
  }),
  Object.freeze({
    key: 'scrum', label: 'Scrum', iProjectType: 100000001,
    sDescription: 'To Do, In Progress, In Review and Done for sprint work. Any move is allowed; Done asks for a resolution.',
    aStatuses: Object.freeze([100000000, 100000001, 100000002, 100000003]), iInitialStatus: 100000000, aTransitions: 'all',
    oRequiredInto: Object.freeze({ 100000003: Object.freeze(['resolution']) }), aCustomFields: Object.freeze([]),
  }),
  Object.freeze({
    key: 'bugs', label: 'Bug tracking', iProjectType: 100000002,
    sDescription: 'Open, In Progress, Blocked, In Testing, Done and Closed. Resolving needs a resolution and an assignee; closed bugs can be reopened.',
    aStatuses: Object.freeze([100000000, 100000001, 100000005, 100000006, 100000003, 100000007]), iInitialStatus: 100000000,
    aTransitions: Object.freeze([
      [100000000, 100000001, []], [100000000, 100000005, []], [100000000, 100000003, ['resolution']],
      [100000001, 100000005, []], [100000001, 100000006, []], [100000001, 100000003, ['resolution', 'assignee']],
      [100000005, 100000001, []], [100000005, 100000000, []],
      [100000006, 100000001, []], [100000006, 100000003, ['resolution', 'assignee']],
      [100000003, 100000007, []], [100000003, 100000000, []], [100000007, 100000000, []],
    ]),
    aCustomFields: Object.freeze([
      Object.freeze({ sName: 'Severity', iType: 100000004, sOptions: 'Critical\nMajor\nMinor\nTrivial', aIssueTypes: Object.freeze([100000001]), sDescription: 'Impact of the bug.' }),
      Object.freeze({ sName: 'Environment', iType: 100000000, sOptions: '', aIssueTypes: Object.freeze([100000001]), sDescription: 'Where it happens, e.g. browser or build.' }),
      Object.freeze({ sName: 'Customer reported', iType: 100000003, sOptions: '', aIssueTypes: Object.freeze([100000001]), sDescription: '' }),
    ]),
  }),
]);

// Custom fields: a controlled set of types only (no formulas or field contexts).
export const CUSTOM_FIELD_TYPES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'text', label: 'Text' }),
  Object.freeze({ value: 100000001, key: 'number', label: 'Number' }),
  Object.freeze({ value: 100000002, key: 'date', label: 'Date' }),
  Object.freeze({ value: 100000003, key: 'boolean', label: 'Yes / No' }),
  Object.freeze({ value: 100000004, key: 'choice', label: 'Single choice' }),
]);

// Saved filters store criteria only; results are always re-queried as the person running the filter.
export const FILTER_VISIBILITY = Object.freeze([
  Object.freeze({ value: 100000000, key: 'private', label: 'Only me' }),
  Object.freeze({ value: 100000001, key: 'project', label: 'Project members' }),
]);

// In-app notifications (outbox rows; an optional Power Automate flow can deliver them by email/Teams).
export const NOTIFICATION_EVENTS = Object.freeze([
  Object.freeze({ value: 100000000, key: 'assigned', label: 'Assigned to me', sPreference: 'bAssigned' }),
  Object.freeze({ value: 100000001, key: 'mentioned', label: 'Mentioned in a comment', sPreference: 'bMentioned' }),
  Object.freeze({ value: 100000002, key: 'status', label: 'Status changes on my issues', sPreference: 'bStatus' }),
  Object.freeze({ value: 100000003, key: 'comment', label: 'Comments on my issues', sPreference: 'bComments' }),
  Object.freeze({ value: 100000004, key: 'bulk', label: 'Bulk edits to my issues (one summary)', sPreference: 'bBulk' }),
]);
export const NOTIFICATION_DELIVERY = Object.freeze({ pending: 100000000, sent: 100000001, skipped: 100000002, failed: 100000003 });
export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  bAssigned: true, bMentioned: true, bStatus: true, bComments: true, bBulk: true, bEmail: false, bTeams: false,
});
export const NOTIFICATION_POLL_MS = 2 * 60 * 1000;

// Bulk edit: allowlisted fields only.
export const BULK_FIELDS = Object.freeze([
  Object.freeze({ key: 'status', label: 'Status' }),
  Object.freeze({ key: 'assignee', label: 'Assignee' }),
  Object.freeze({ key: 'priority', label: 'Priority' }),
  Object.freeze({ key: 'sprint', label: 'Sprint' }),
  Object.freeze({ key: 'dueDate', label: 'Due date' }),
  Object.freeze({ key: 'addLabel', label: 'Add label' }),
]);

// Attachment types Pira refuses (Dataverse also applies its own blocked-extension list).
export const BLOCKED_ATTACHMENT_EXTENSIONS = Object.freeze(['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'dll', 'js', 'vbs', 'ps1', 'hta', 'jar', 'reg', 'cpl', 'lnk', 'html', 'htm', 'svg']);

// ── Phase 4 ────────────────────────────────────────────────────

// Versions (releases). Any state may move to any other; leads only. Archived versions can't receive issues.
export const VERSION_STATES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'unreleased', label: 'Unreleased' }),
  Object.freeze({ value: 100000001, key: 'released', label: 'Released' }),
  Object.freeze({ value: 100000002, key: 'archived', label: 'Archived' }),
]);
export const VERSION_STATE = Object.freeze({ unreleased: 100000000, released: 100000001, archived: 100000002 });

// Time tracking: whole minutes everywhere. Durations are typed like Jira ("1w 2d 3h 30m"); 1d = 8h and 1w = 5d.
export const TIME_TRACKING = Object.freeze({ iMinutesPerHour: 60, iHoursPerDay: 8, iDaysPerWeek: 5 });

// Advanced query: the only fields and operators a query may use. Each kind has its own operators and value checks.
export const QUERY_FIELDS = Object.freeze([
  Object.freeze({ key: 'status', label: 'Status', kind: 'status', column: 'wd_status' }),
  Object.freeze({ key: 'statusCategory', label: 'Status category', kind: 'category', column: 'wd_status' }),
  Object.freeze({ key: 'type', label: 'Issue type', kind: 'type', column: 'wd_issuetype' }),
  Object.freeze({ key: 'priority', label: 'Priority', kind: 'priority', column: 'wd_priority' }),
  Object.freeze({ key: 'resolution', label: 'Resolution', kind: 'resolution', column: 'wd_resolution' }),
  Object.freeze({ key: 'assignee', label: 'Assignee', kind: 'user', column: '_wd_assignee_value' }),
  Object.freeze({ key: 'reporter', label: 'Reporter', kind: 'user', column: '_createdby_value' }),
  Object.freeze({ key: 'label', label: 'Label', kind: 'label', column: '' }),
  Object.freeze({ key: 'sprint', label: 'Sprint', kind: 'sprint', column: '_wd_sprint_value' }),
  Object.freeze({ key: 'fixVersion', label: 'Fix version', kind: 'version', column: '_wd_fixversion_value' }),
  Object.freeze({ key: 'summary', label: 'Summary', kind: 'text', column: 'wd_summary' }),
  Object.freeze({ key: 'dueDate', label: 'Due date', kind: 'dateOnly', column: 'wd_duedate' }),
  Object.freeze({ key: 'created', label: 'Created', kind: 'dateTime', column: 'createdon' }),
  Object.freeze({ key: 'updated', label: 'Updated', kind: 'dateTime', column: 'modifiedon' }),
  Object.freeze({ key: 'resolved', label: 'Resolved', kind: 'dateTime', column: 'wd_resolvedon' }),
  Object.freeze({ key: 'storyPoints', label: 'Story points', kind: 'number', column: 'wd_storypoints' }),
  Object.freeze({ key: 'originalEstimate', label: 'Original estimate', kind: 'duration', column: 'wd_originalestimate' }),
  Object.freeze({ key: 'remainingEstimate', label: 'Remaining estimate', kind: 'duration', column: 'wd_remainingestimate' }),
  Object.freeze({ key: 'timeSpent', label: 'Time spent', kind: 'duration', column: 'wd_timespent' }),
]);
export const QUERY_OPERATORS = Object.freeze({
  in: 'is any of', notIn: 'is none of', isEmpty: 'is empty', isNotEmpty: 'is not empty', hasAny: 'has any of', hasNone: 'has none of',
  contains: 'contains', notContains: 'does not contain', eq: '=', ne: '≠', gt: '>', ge: '≥', lt: '<', le: '≤',
  before: 'is before', after: 'is after', on: 'is on', lastDays: 'in the last (days)', nextDays: 'in the next (days)', isTrue: 'is yes', isFalse: 'is no',
});
// Operators per kind. Custom fields use cf:<id> and the kind of their field type.
export const QUERY_KIND_OPERATORS = Object.freeze({
  status: Object.freeze(['in', 'notIn']), category: Object.freeze(['in', 'notIn']), type: Object.freeze(['in', 'notIn']), priority: Object.freeze(['in', 'notIn']),
  resolution: Object.freeze(['in', 'notIn', 'isEmpty', 'isNotEmpty']), user: Object.freeze(['in', 'notIn', 'isEmpty', 'isNotEmpty']),
  label: Object.freeze(['hasAny', 'hasNone']), sprint: Object.freeze(['in', 'notIn', 'isEmpty', 'isNotEmpty']), version: Object.freeze(['in', 'notIn', 'isEmpty', 'isNotEmpty']),
  text: Object.freeze(['contains', 'notContains']), dateOnly: Object.freeze(['before', 'after', 'on', 'lastDays', 'nextDays', 'isEmpty', 'isNotEmpty']),
  dateTime: Object.freeze(['before', 'after', 'on', 'lastDays', 'isEmpty', 'isNotEmpty']),
  number: Object.freeze(['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'isEmpty', 'isNotEmpty']), duration: Object.freeze(['eq', 'gt', 'ge', 'lt', 'le', 'isEmpty', 'isNotEmpty']),
  cfText: Object.freeze(['contains', 'notContains', 'isEmpty', 'isNotEmpty']), cfNumber: Object.freeze(['eq', 'gt', 'ge', 'lt', 'le', 'isEmpty', 'isNotEmpty']),
  cfDate: Object.freeze(['before', 'after', 'on', 'isEmpty', 'isNotEmpty']), cfBoolean: Object.freeze(['isTrue', 'isFalse', 'isEmpty']),
  cfChoice: Object.freeze(['in', 'notIn', 'isEmpty', 'isNotEmpty']),
});

// CSV import: header names (case-insensitive) → draft field. Status is never imported: new issues start in the initial status.
export const CSV_IMPORT_COLUMNS = Object.freeze([
  Object.freeze({ key: 'sSummary', aHeaders: Object.freeze(['summary', 'title']), bRequired: true }),
  Object.freeze({ key: 'sDescription', aHeaders: Object.freeze(['description']) }),
  Object.freeze({ key: 'iType', aHeaders: Object.freeze(['type', 'issue type']) }),
  Object.freeze({ key: 'iPriority', aHeaders: Object.freeze(['priority']) }),
  Object.freeze({ key: 'sAssignee', aHeaders: Object.freeze(['assignee']) }),
  Object.freeze({ key: 'aLabels', aHeaders: Object.freeze(['labels', 'label']) }),
  Object.freeze({ key: 'iStoryPoints', aHeaders: Object.freeze(['story points', 'points']) }),
  Object.freeze({ key: 'sDueDate', aHeaders: Object.freeze(['due date', 'due']) }),
  Object.freeze({ key: 'iOriginalEstimate', aHeaders: Object.freeze(['original estimate', 'estimate']) }),
  Object.freeze({ key: 'sFixVersion', aHeaders: Object.freeze(['fix version', 'version']) }),
]);

// Analytics windows (weeks). Calculations are documented in docs/phase-4-design.md.
export const ANALYTICS = Object.freeze({ aWindows: Object.freeze([4, 8, 12, 26]), iDefaultWeeks: 12, iSprintOutcomes: 6, iMaxRows: 2000 });

// ── Phase 5 ────────────────────────────────────────────────────

// Deployment stages an epic links a Dataverse solution for (Epic Solution Stage choice), in promotion order.
export const SOLUTION_STAGES = Object.freeze([
  Object.freeze({ value: 100000000, key: 'dev', label: 'Dev' }),
  Object.freeze({ value: 100000001, key: 'test', label: 'Test' }),
  Object.freeze({ value: 100000002, key: 'stage', label: 'Stage' }),
  Object.freeze({ value: 100000003, key: 'prod', label: 'Prod' }),
]);
export const SOLUTION_STAGE_STORAGE_KEY = 'pira-solution-stage';

// Environments come from Power Platform for Admins V2 (ListEnvironmentsForUser); solutions from the Dataverse connector
// (ListRecordsWithOrganization), always as the signed-in user. Only Dataverse hosts on these suffixes are accepted.
export const POWER_PLATFORM = Object.freeze({
  sEnvironmentApiVersion: '2024-10-01', iEnvironmentPageSize: 500, iEnvironmentPagesMax: 10, iEnvironmentSuggestions: 50,
  iSolutionSearchTop: 50, sMakerUrl: 'https://make.powerapps.com',
  aDataverseHostSuffixes: Object.freeze(['.dynamics.com', '.dynamics.cn', '.microsoftdynamics.us', '.appsplatform.us', '.microsoftdynamics.de']),
});

export const LIMITS = Object.freeze({
  projectKeyMin: 2, projectKeyMax: 10, projectNameMax: 200, projectDescriptionMax: 4000,
  summaryMax: 255, descriptionMax: 10000, commentMax: 10000, labelMax: 50, labelsPerIssue: 10,
  historyValueMax: 400, storyPointsMax: 1000, sprintNameMax: 100, sprintGoalMax: 2000, boardNameMax: 100,
  correctionNoteMax: 400, rankMax: 64,
  customFieldNameMax: 60, customFieldDescriptionMax: 200, customFieldOptionsMax: 20, customFieldOptionMax: 100, customFieldTextMax: 400,
  customFieldNumberMax: 10000000000, customFieldsPerProject: 20, savedFilterNameMax: 100, savedFilterCriteriaMax: 4000,
  bulkEditMax: 50, attachmentMaxBytes: 10 * 1024 * 1024, attachmentsPerIssue: 20, attachmentNameMax: 200, notificationDetailMax: 200,
  estimateMaxMinutes: 1000000, workLogMaxMinutes: 1440, workLogMaxAgeDays: 366, workLogCommentMax: 1000, voidReasonMax: 400,
  versionNameMax: 100, versionDescriptionMax: 2000, queryRulesMax: 20, queryValuesMax: 30, queryDaysMax: 3650,
  csvExportMax: 5000, csvImportMax: 200, csvImportBytes: 1024 * 1024, dependencyIssuesMax: 150, dependencyExternalMax: 50,
  solutionVersionMax: 50, solutionSearchMax: 100, environmentNameMax: 200, solutionNameMax: 200, solutionUniqueNameMax: 100,
});

export const PAGING = Object.freeze({
  boardColumn: 50, issueList: 25, myWork: 25, projects: 30, comments: 20, history: 20,
  searchSuggestions: 8, userSearch: 15, members: 200, labels: 200,
  backlog: 50, sprintIssues: 50, children: 50, links: 50, boards: 50, sprints: 100, sprintMetrics: 500, parentSearch: 10,
  notifications: 20, attachments: 50, savedFilters: 50, customFields: 50, workflowTransitions: 200,
  versions: 100, workLogs: 20, exportPage: 500, epicSolutions: 10,
});

export const KEY_ALLOCATION_RETRIES = 3;
export const RECENTLY_UPDATED_DAYS = 14;
export const SEARCH_DELAY_MS = 250;
export const CACHE_TTL_MS = 5 * 60 * 1000;
// Issue writes run in small parallel batches (sprint completion, cancel) to stay polite to the Dataverse API.
export const WRITE_BATCH_SIZE = 5;

// Where the authoritative issue rules run (docs/lowcode-plugins.md):
//   'lowcode' – Dataverse automated low-code plug-ins allocate issue keys, validate transitions/membership and write history.
//   'client'  – fallback: the app does it (no server enforcement). Use only until the plug-ins are installed.
export const SERVER_LOGIC_MODES = Object.freeze({ lowcode: 'lowcode', client: 'client' });
export const SERVER_LOGIC = SERVER_LOGIC_MODES.lowcode;
