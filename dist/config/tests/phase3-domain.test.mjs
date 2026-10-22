// Phase 3 domain tests: configurable workflows, required fields, templates, custom fields, saved filters, bulk edit planning,
// notification planning and attachment checks. Run: node --test agent/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKFLOW, canTransition, assertTransition, getAllowedTransitions, getTransitionRequirements, validateTransitionFields, assertTransitionFields,
  buildTemplateWorkflow, getProjectTemplate, validateWorkflow, diffWorkflowTransitions, workflowFromRecords, parseStatusList, serialiseStatusList,
  removedStatuses, isDoneStatus, buildIssueFilter, matchesIssueCriteria, normaliseCustomFieldValue, validateCustomFieldDraft, customFieldAppliesTo,
  formatCustomFieldValue, sanitiseFilterCriteria, parseFilterCriteria, serialiseFilterCriteria, resolveFilterCriteria, validateSavedFilterDraft,
  validateBulkChange, planBulkEdit, describeBulkChange, extractMentions, finaliseNotifications, planCommentNotifications, planStatusNotifications,
  planAssignmentNotifications, planBulkNotifications, enabledNotificationEvents, normaliseNotificationPreferences, sanitiseFileName,
  validateAttachment, formatFileSize, ERROR_CODES,
} from '../../dist/js/domain.js';

const TODO = 100000000, PROGRESS = 100000001, REVIEW = 100000002, DONE = 100000003, BACKLOG = 100000004, BLOCKED = 100000005, TESTING = 100000006, CLOSED = 100000007;
const TASK = 100000000, BUG = 100000001;
const WONT_DO = 100000001;
const id = (iNumber) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(iNumber).padStart(12, '0')}`;
const ME = id(1), PRIYA = id(2), JORDAN = id(3), OUTSIDER = id(9);

// ── Workflow ───────────────────────────────────────────────────

test('workflow: the default stays any-to-any across the four original statuses', () => {
  assert.equal(DEFAULT_WORKFLOW.bCustom, false);
  assert.deepEqual(getAllowedTransitions(REVIEW).sort(), [TODO, PROGRESS, DONE].sort());
  assert.equal(canTransition(TODO, BLOCKED), false, 'catalogue statuses outside the workflow are not reachable');
  assert.ok(isDoneStatus(DONE) && isDoneStatus(CLOSED) && !isDoneStatus(TESTING), 'done comes from the status category');
});

test('workflow: a project workflow only allows its own transitions', () => {
  const oWorkflow = buildTemplateWorkflow(getProjectTemplate('bugs'));
  assert.equal(canTransition(TODO, PROGRESS, oWorkflow), true);
  assert.equal(canTransition(TODO, TESTING, oWorkflow), false, 'To Do → In Testing is not in the Bug tracking template');
  assert.equal(canTransition(CLOSED, DONE, oWorkflow), false);
  assert.throws(() => assertTransition(TODO, TESTING, oWorkflow), (oError) => oError.code === ERROR_CODES.invalidTransition);
  assert.deepEqual(getAllowedTransitions(TODO, oWorkflow), [PROGRESS, BLOCKED, DONE], 'menu order follows the workflow status order');
});

test('workflow: templates expand "all" and add required fields', () => {
  const oScrum = buildTemplateWorkflow(getProjectTemplate('scrum'));
  assert.equal(oScrum.aTransitions.length, 12, 'four statuses, every move');
  assert.deepEqual(getTransitionRequirements(PROGRESS, DONE, oScrum), ['resolution']);
  assert.deepEqual(getTransitionRequirements(DONE, PROGRESS, oScrum), []);
  const oBugs = buildTemplateWorkflow(getProjectTemplate('bugs'));
  assert.deepEqual(getTransitionRequirements(TESTING, DONE, oBugs), ['resolution', 'assignee']);
  ['kanban', 'scrum', 'bugs'].forEach((sKey) => assert.equal(validateWorkflow(buildTemplateWorkflow(getProjectTemplate(sKey))).bValid, true, `${sKey} template is valid`));
});

test('workflow: required fields are checked against the values after the move', () => {
  const aRequired = ['resolution', 'assignee', 'storyPoints', 'dueDate'];
  const oErrors = validateTransitionFields(aRequired, { iResolution: null, sAssigneeId: '', iStoryPoints: null, sDueDate: '' });
  assert.deepEqual(Object.keys(oErrors).sort(), ['iResolution', 'iStoryPoints', 'sAssigneeId', 'sDueDate']);
  assert.deepEqual(validateTransitionFields(aRequired, { iResolution: WONT_DO, sAssigneeId: ME, iStoryPoints: 0, sDueDate: '2026-11-01' }), {}, 'zero story points is a valid estimate');
  assert.throws(() => assertTransitionFields(['resolution'], { iResolution: 5 }), (oError) => oError.code === ERROR_CODES.requiredFieldMissing && /resolution/.test(oError.message));
});

test('workflow: validation errors block saving, warnings do not', () => {
  const fnErrors = (oWorkflow) => validateWorkflow(oWorkflow).oErrors;
  assert.ok(fnErrors({ aStatuses: [TODO, PROGRESS], iInitialStatus: TODO, aTransitions: [{ iFrom: TODO, iTo: PROGRESS, aRequired: [] }] }).aStatuses, 'needs a done status');
  assert.ok(fnErrors({ aStatuses: [TODO, DONE], iInitialStatus: DONE, aTransitions: [{ iFrom: DONE, iTo: TODO, aRequired: [] }] }).iInitialStatus, 'cannot start done');
  assert.ok(fnErrors({ aStatuses: [TODO, DONE, TODO], iInitialStatus: TODO, aTransitions: [] }).aStatuses, 'duplicate statuses');
  assert.ok(fnErrors({ aStatuses: [TODO, DONE], iInitialStatus: TODO, aTransitions: [{ iFrom: TODO, iTo: DONE, aRequired: [] }, { iFrom: TODO, iTo: DONE, aRequired: [] }] }).aTransitions, 'duplicate transitions');
  assert.ok(fnErrors({ aStatuses: [TODO, PROGRESS, DONE], iInitialStatus: TODO, aTransitions: [{ iFrom: TODO, iTo: PROGRESS, aRequired: ['resolution'] }] }).aTransitions, 'resolution only into done');
  assert.ok(fnErrors({ aStatuses: [TODO, DONE], iInitialStatus: TODO, aTransitions: [{ iFrom: TODO, iTo: DONE, aRequired: ['summary'] }] }).aTransitions, 'only allowlisted requirements');
  assert.ok(fnErrors({ aStatuses: [TODO, DONE], iInitialStatus: TODO, aTransitions: [{ iFrom: TODO, iTo: BLOCKED, aRequired: [] }] }).aTransitions, 'transitions must use listed statuses');
  const oResult = validateWorkflow({ aStatuses: [TODO, BLOCKED, DONE], iInitialStatus: TODO, aTransitions: [{ iFrom: TODO, iTo: DONE, aRequired: [] }] });
  assert.equal(oResult.bValid, true);
  assert.equal(oResult.aWarnings.length, 2, 'Blocked is unreachable and is a dead end');
});

test('workflow: stored rows round-trip; removed transitions are deactivated, never deleted', () => {
  assert.equal(workflowFromRecords('', 0, []), DEFAULT_WORKFLOW, 'no status list = default workflow');
  assert.deepEqual(parseStatusList(`${TODO}, 123, ${DONE},${TODO}`), [TODO, DONE], 'unknown and repeated values are dropped');
  assert.equal(serialiseStatusList([DONE, TODO, 42]), `${DONE},${TODO}`);
  const aRows = [
    { sId: 'a', iFrom: TODO, iTo: DONE, aRequired: [], bActive: true },
    { sId: 'b', iFrom: DONE, iTo: TODO, aRequired: [], bActive: false },
    { sId: 'c', iFrom: TODO, iTo: BLOCKED, aRequired: [], bActive: true },
  ];
  const oWorkflow = workflowFromRecords(`${TODO},${DONE}`, BACKLOG, aRows);
  assert.equal(oWorkflow.iInitialStatus, TODO, 'an initial status outside the list falls back to the first status');
  assert.deepEqual(oWorkflow.aTransitions.map((oItem) => `${oItem.iFrom}>${oItem.iTo}`), [`${TODO}>${DONE}`], 'inactive and out-of-list rows are ignored');
  const oDiff = diffWorkflowTransitions(aRows, [{ iFrom: DONE, iTo: TODO, aRequired: [] }, { iFrom: TODO, iTo: PROGRESS, aRequired: ['assignee'] }]);
  assert.deepEqual(oDiff.aCreate.map((oItem) => oItem.iTo), [PROGRESS]);
  assert.deepEqual(oDiff.aUpdate.map((oItem) => oItem.sId), ['b'], 'an inactive row is reactivated, not duplicated');
  assert.deepEqual(oDiff.aDeactivate.map((oItem) => oItem.sId), ['a', 'c']);
  assert.deepEqual(removedStatuses({ aStatuses: [TODO, REVIEW, DONE] }, { aStatuses: [TODO, DONE] }), [REVIEW]);
});

test('open-only filters exclude every done-category status', () => {
  const sFilter = buildIssueFilter({ bOpenOnly: true });
  assert.match(sFilter, new RegExp(`wd_status ne ${DONE}`));
  assert.match(sFilter, new RegExp(`wd_status ne ${CLOSED}`));
  assert.equal(matchesIssueCriteria({ iStatus: CLOSED, bArchived: false, sSummary: '', sKey: '' }, { bOpenOnly: true }), false);
});

// ── Custom fields ──────────────────────────────────────────────

test('custom fields: values must match the field type', () => {
  const fnField = (iType, sOptions = '') => ({ sName: 'Field', iType, sOptions });
  assert.deepEqual(normaliseCustomFieldValue(fnField(100000001), '12.25'), { value: 12.25, sError: '' });
  assert.ok(normaliseCustomFieldValue(fnField(100000001), '12abc').sError, 'number rejects text');
  assert.ok(normaliseCustomFieldValue(fnField(100000001), '1.23456').sError, 'at most four decimals');
  assert.ok(normaliseCustomFieldValue(fnField(100000002), '2026-02-30').sError, 'date rejects impossible dates');
  assert.equal(normaliseCustomFieldValue(fnField(100000003), 'yes').value, true);
  assert.ok(normaliseCustomFieldValue(fnField(100000003), 'maybe').sError);
  assert.equal(normaliseCustomFieldValue(fnField(100000004, 'Major\nMinor'), 'Minor').value, 'Minor');
  assert.ok(normaliseCustomFieldValue(fnField(100000004, 'Major\nMinor'), 'minor').sError, 'choice must match an option exactly');
  assert.ok(normaliseCustomFieldValue(fnField(100000000), 'x'.repeat(401)).sError, 'text length limit');
  assert.deepEqual(normaliseCustomFieldValue(fnField(100000001), '  '), { value: null, sError: '' }, 'blank clears');
  assert.equal(formatCustomFieldValue(fnField(100000003), false), 'No');
});

test('custom fields: definitions are validated and scoped to issue types', () => {
  assert.ok(validateCustomFieldDraft({ sName: 'Severity', iType: 100000004, sOptions: '' }).oErrors.sOptions, 'choice needs options');
  assert.ok(validateCustomFieldDraft({ sName: 'X', iType: 999 }).oErrors.iType, 'only the controlled set of types');
  assert.ok(validateCustomFieldDraft({ sName: 'X', iType: 100000000, aIssueTypes: [42] }).oErrors.aIssueTypes);
  assert.equal(validateCustomFieldDraft({ sName: 'Env', iType: 100000000, aIssueTypes: [BUG] }).bValid, true);
  assert.equal(customFieldAppliesTo({ aIssueTypes: [BUG] }, TASK), false);
  assert.equal(customFieldAppliesTo({ aIssueTypes: [] }, TASK), true, 'no types = all types');
});

// ── Saved filters ──────────────────────────────────────────────

test('saved filters: only allowlisted, valid criteria are stored', () => {
  const oClean = sanitiseFilterCriteria({
    sText: ' bug ', aStatuses: [TODO, 7, 'x'], aAssigneeIds: ['me', 'none', 'not-a-guid', ME.toUpperCase()], sLabelId: 'bad', bOpenOnly: 'yes',
    sProjectId: id(50), sFilter: 'wd_issueid ne null', aExcludeTypes: [TASK],
  });
  assert.deepEqual(oClean, { sText: 'bug', aStatuses: [TODO], aAssigneeIds: ['me', 'none', ME] });
  assert.deepEqual(parseFilterCriteria('{not json'), {});
  assert.equal(serialiseFilterCriteria({ bOpenOnly: true, sSprintId: 'none' }), '{"sSprintId":"none","bOpenOnly":true}');
});

test('saved filters: running a filter forces its project and resolves "me" to the viewer', () => {
  const oCriteria = resolveFilterCriteria({ aAssigneeIds: ['me'], sProjectId: id(77) }, PRIYA, id(50));
  assert.deepEqual(oCriteria, { aAssigneeIds: [PRIYA], sProjectId: id(50) });
  assert.ok(validateSavedFilterDraft({ sName: '', iVisibility: 100000000, oCriteria: {} }).oErrors.sName);
  assert.ok(validateSavedFilterDraft({ sName: 'Mine', iVisibility: 5, oCriteria: {} }).oErrors.iVisibility);
});

// ── Bulk edit ──────────────────────────────────────────────────

const issue = (iNumber, oFields = {}) => ({
  sId: id(100 + iNumber), sKey: `PIRA-${iNumber}`, sSummary: `Issue ${iNumber}`, iStatus: TODO, iPriority: 100000002, sAssigneeId: '', sReporterId: PRIYA,
  sDueDate: '', iStoryPoints: null, sSprintId: '', aLabels: [], bArchived: false, iResolution: null, ...oFields,
});

test('bulk edit: only allowlisted fields with valid values and a bounded batch', () => {
  assert.throws(() => validateBulkChange({ sField: 'wd_issuekey', value: 'X' }, 1), (oError) => oError.code === ERROR_CODES.validation);
  assert.throws(() => validateBulkChange({ sField: 'priority', value: 1 }, 1), /priority/i);
  assert.throws(() => validateBulkChange({ sField: 'priority', value: 100000004 }, 51), /up to 50/);
  assert.throws(() => validateBulkChange({ sField: 'assignee', value: 'nobody' }, 1));
  assert.deepEqual(validateBulkChange({ sField: 'addLabel', value: ' Needs QA ' }, 2), { sField: 'addLabel', value: 'needs-qa' });
});

test('bulk edit: the preview reports change, skip and blocked per issue', () => {
  const oWorkflow = buildTemplateWorkflow(getProjectTemplate('bugs'));
  const aIssues = [issue(1), issue(2, { iStatus: DONE }), issue(3, { bArchived: true }), issue(4, { iStatus: TESTING }), issue(5, { iStatus: PROGRESS, sAssigneeId: ME })];
  const oPlan = planBulkEdit(aIssues, { sField: 'status', value: DONE, iResolution: null }, { oWorkflow });
  assert.deepEqual(oPlan.aRows.map((oRow) => oRow.sOutcome), ['blocked', 'skip', 'blocked', 'blocked', 'blocked']);
  assert.match(oPlan.aRows[0].sReason, /resolution/i, 'required resolution missing');
  assert.match(oPlan.aRows[2].sReason, /archived/i);
  const oWithResolution = planBulkEdit(aIssues, { sField: 'status', value: DONE, iResolution: WONT_DO }, { oWorkflow });
  assert.deepEqual(oWithResolution.aRows.map((oRow) => oRow.sOutcome), ['change', 'skip', 'blocked', 'blocked', 'change'], 'In Testing → Done also needs an assignee');
  assert.equal(oWithResolution.iChange, 2);
  assert.equal(describeBulkChange({ sField: 'priority', value: 100000004 }), 'Priority → Highest');
});

// ── Notifications ──────────────────────────────────────────────

const aMembers = [{ sUserId: ME, sUserName: 'Alex Morgan' }, { sUserId: PRIYA, sUserName: 'Priya Shah' }, { sUserId: JORDAN, sUserName: 'Sam' }, { sUserId: id(4), sUserName: 'Sam Ortiz' }];

test('notifications: mentions match whole member names only', () => {
  assert.deepEqual(extractMentions('Thanks @Priya Shah and @sam ortiz!', aMembers), [PRIYA, id(4)], 'longest name wins; case-insensitive');
  assert.deepEqual(extractMentions('email priya@Priya Shahx or @Unknown Person', aMembers), [], 'no partial words, no email addresses, no non-members');
  assert.deepEqual(extractMentions('cc @Sam', aMembers), [JORDAN]);
});

test('notifications: one per recipient, never the actor or a non-member, and no issue summaries', () => {
  const oIssue = { sAssigneeId: PRIYA, sReporterId: ME };
  const aPlans = [...planCommentNotifications(oIssue, [PRIYA, OUTSIDER, ME]), ...planStatusNotifications(oIssue, TODO, DONE)];
  const aFinal = finaliseNotifications(aPlans, ME, aMembers.map((oMember) => oMember.sUserId));
  assert.deepEqual(aFinal.map((oPlan) => [oPlan.sRecipientId, oPlan.iEvent]), [[PRIYA, 100000001]], 'the mention outranks comment/status for the same person');
  assert.deepEqual(planAssignmentNotifications({ sAssigneeId: PRIYA }, PRIYA), [], 'no notification when the assignee does not change');
  assert.ok(aPlans.every((oPlan) => !/Issue \d/.test(oPlan.sDetail)), 'details never carry the summary');
});

test('notifications: bulk edits send one summary per person and preferences filter events', () => {
  const aPlans = planBulkNotifications([issue(1, { sAssigneeId: PRIYA }), issue(2, { sAssigneeId: JORDAN }), issue(3)], 'Priority → High');
  assert.deepEqual(aPlans.map((oPlan) => [oPlan.sRecipientId, oPlan.iCount]).sort(), [[JORDAN, 1], [PRIYA, 3]].sort());
  assert.equal(enabledNotificationEvents({ bMentioned: false, bBulk: false }).length, 3);
  assert.deepEqual(normaliseNotificationPreferences({ bEmail: 'yes', bStatus: false }).bEmail, false, 'non-boolean input keeps the default');
});

// ── Attachments ────────────────────────────────────────────────

test('attachments: names are sanitised; risky types, empty files and oversize files are refused', () => {
  assert.equal(sanitiseFileName('C:\\temp\\..\\<report>.pdf'), 'report.pdf');
  assert.equal(sanitiseFileName('...'), 'attachment');
  assert.equal(sanitiseFileName(`${'a'.repeat(300)}.docx`).length, 200);
  assert.ok(sanitiseFileName(`${'a'.repeat(300)}.docx`).endsWith('.docx'));
  assert.match(validateAttachment({ sName: 'run.EXE', iSize: 10 }), /\.exe/);
  assert.match(validateAttachment({ sName: 'page.html', iSize: 10 }), /security/);
  assert.match(validateAttachment({ sName: 'a.txt', iSize: 0 }), /empty/);
  assert.match(validateAttachment({ sName: 'a.txt', iSize: 10 * 1024 * 1024 + 1 }), /10 MB/);
  assert.match(validateAttachment({ sName: 'a.txt', iSize: 5 }, 20), /up to 20/);
  assert.equal(validateAttachment({ sName: 'a.txt', iSize: 5 }), '');
  assert.equal(formatFileSize(1536), '1.5 KB');
});
