// Run: node --test agent/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProjectKey, normaliseProjectKey, suggestProjectKey, validateProjectDraft, formatIssueKey, parseIssueKey,
  canTransition, assertTransition, getAllowedTransitions, rankBetween, isValidRank, compareRank,
  buildIssueFilter, matchesIssueCriteria, buildMyWorkCriteria, validateIssueDraft, validateParent,
  getProjectPermissions, toFriendlyMessage, isDuplicateKeyError, createDomainError, ERROR_CODES,
  isOverdue, formatRelativeTime, normaliseLabels, diffDisplayValues, truncateText, escapeODataString,
  assertGuid, isValidDateOnly, getInitials, validateCommentBody, parseServerError,
} from '../../dist/js/domain.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const LABEL_ID = '33333333-3333-4333-8333-333333333333';
const TODO = 100000000, PROGRESS = 100000001, REVIEW = 100000002, DONE = 100000003;

test('project keys: uppercase, 2-10 chars, starts with a letter', () => {
  assert.equal(validateProjectKey('APP'), '');
  assert.equal(validateProjectKey('ab'), '');
  assert.equal(normaliseProjectKey(' app1 '), 'APP1');
  assert.notEqual(validateProjectKey('A'), '');
  assert.notEqual(validateProjectKey('ABCDEFGHIJK'), '');
  assert.notEqual(validateProjectKey('1APP'), '');
  assert.notEqual(validateProjectKey('AP-P'), '');
  assert.notEqual(validateProjectKey(''), '');
});

test('project key suggestion and draft validation', () => {
  assert.equal(suggestProjectKey('Pira Platform'), 'PP');
  assert.equal(suggestProjectKey('Website'), 'WEBS');
  assert.equal(suggestProjectKey('2026 roadmap plan'), 'RP');
  assert.equal(validateProjectDraft({ sName: 'Pira', sKey: 'PIRA' }).bValid, true);
  const oResult = validateProjectDraft({ sName: '', sKey: 'x' });
  assert.equal(oResult.bValid, false);
  assert.ok(oResult.oErrors.sName && oResult.oErrors.sKey);
});

test('issue keys format and parse round-trip', () => {
  assert.equal(formatIssueKey('pira', 12), 'PIRA-12');
  assert.deepEqual(parseIssueKey('pira-12'), { sProjectKey: 'PIRA', iSequence: 12 });
  assert.equal(parseIssueKey('PIRA 12'), null);
  assert.equal(parseIssueKey('PIRA-'), null);
  assert.throws(() => formatIssueKey('PIRA', 0));
  assert.throws(() => formatIssueKey('P', 1));
});

test('workflow transitions are validated', () => {
  assert.equal(canTransition(TODO, PROGRESS), true);
  assert.equal(canTransition(DONE, TODO), true);
  assert.equal(canTransition(TODO, TODO), false, 'same status is not a transition');
  assert.equal(canTransition(TODO, 123), false, 'unknown target status');
  assert.equal(canTransition(999, TODO), false, 'unknown source status');
  assert.deepEqual(getAllowedTransitions(REVIEW).sort(), [TODO, PROGRESS, DONE].sort());
  assert.throws(() => assertTransition(TODO, TODO), (oError) => oError.code === ERROR_CODES.invalidTransition);
});

test('ranks: midpoints sort strictly between neighbours and stay valid', () => {
  const sFirst = rankBetween('', '');
  assert.ok(isValidRank(sFirst));
  let aRanks = [sFirst];
  for (let iIndex = 0; iIndex < 60; iIndex += 1) aRanks.push(rankBetween(aRanks[aRanks.length - 1], ''));
  for (let iIndex = 0; iIndex < 60; iIndex += 1) aRanks.unshift(rankBetween('', aRanks[0]));
  let sLow = aRanks[10], sHigh = aRanks[11];
  for (let iIndex = 0; iIndex < 40; iIndex += 1) {
    const sMid = rankBetween(sLow, sHigh);
    assert.ok(sLow < sMid && sMid < sHigh, `${sLow} < ${sMid} < ${sHigh}`);
    assert.ok(isValidRank(sMid));
    sHigh = sMid;
  }
  const aSorted = [...aRanks].sort();
  assert.deepEqual(aRanks, aSorted, 'append/prepend ranks are already ordered');
  assert.throws(() => rankBetween('m', 'c'));
  assert.equal(compareRank({ sRank: 'a' }, { sRank: 'b' }), -1);
  assert.equal(compareRank({ sRank: '' , sCreatedOn: '1' }, { sRank: 'b' }), 1);
});

test('OData filter: escapes quotes and rejects non-GUID identifiers', () => {
  const sFilter = buildIssueFilter({ sProjectId: PROJECT_ID, sText: "it's" });
  assert.match(sFilter, /_wd_project_value eq 11111111-1111-4111-8111-111111111111/);
  assert.match(sFilter, /contains\(wd_summary,'it''s'\)/);
  assert.match(sFilter, /wd_archived eq false/);
  assert.throws(() => buildIssueFilter({ sProjectId: "x' or 1 eq 1" }));
  assert.throws(() => buildIssueFilter({ aAssigneeIds: ['not-a-guid'] }));
  assert.equal(escapeODataString("a'b'c"), "a''b''c");
});

test('OData filter: statuses, assignees incl. unassigned, labels and keys', () => {
  const sFilter = buildIssueFilter({
    aStatuses: [TODO, PROGRESS], aAssigneeIds: [USER_ID, 'none'], aTypes: [100000001], aPriorities: [100000004],
    sLabelId: LABEL_ID, sText: 'pira-7',
  }, { sLabelCollection: 'wd_issue_issuelabel' });
  assert.match(sFilter, /\(wd_status eq 100000000 or wd_status eq 100000001\)/);
  assert.match(sFilter, /_wd_assignee_value eq null/);
  assert.match(sFilter, /wd_issue_issuelabel\/any\(o:o\/_wd_label_value eq 33333333-3333-4333-8333-333333333333\)/);
  assert.match(sFilter, /wd_issuekey eq 'PIRA-7'/);
  assert.throws(() => buildIssueFilter({ sLabelId: LABEL_ID }), 'label filter needs a navigation name');
  assert.throws(() => buildIssueFilter({ sDueBefore: '2026-13-40' }));
});

test('My Work criteria per tab', () => {
  const oNow = new Date(2026, 9, 14, 12, 0, 0);
  assert.deepEqual(buildMyWorkCriteria('assigned', USER_ID, oNow, 14).oCriteria, { aAssigneeIds: [USER_ID], bOpenOnly: true });
  assert.equal(buildMyWorkCriteria('overdue', USER_ID, oNow, 14).oCriteria.sDueBefore, '2026-10-14');
  assert.equal(buildMyWorkCriteria('reported', USER_ID, oNow, 14).oCriteria.sReporterId, USER_ID);
  assert.ok(buildMyWorkCriteria('recent', USER_ID, oNow, 14).oCriteria.sModifiedSince < oNow.toISOString());
  assert.ok(buildIssueFilter(buildMyWorkCriteria('recent', USER_ID, oNow, 14).oCriteria).includes('modifiedon ge'));
});

test('in-memory criteria matching mirrors the OData semantics', () => {
  const oIssue = { sId: 'i', sKey: 'PIRA-7', sSummary: 'Fix board', sProjectId: PROJECT_ID, iStatus: TODO, iType: 100000001,
    iPriority: 100000004, sAssigneeId: '', sReporterId: USER_ID, sDueDate: '2026-10-01', sModifiedOn: '2026-10-13T00:00:00.000Z', bArchived: false };
  assert.equal(matchesIssueCriteria(oIssue, { aAssigneeIds: ['none'] }), true);
  assert.equal(matchesIssueCriteria(oIssue, { aAssigneeIds: [USER_ID] }), false);
  assert.equal(matchesIssueCriteria(oIssue, { sText: 'pira-7' }), true);
  assert.equal(matchesIssueCriteria(oIssue, { sDueBefore: '2026-10-14', bOpenOnly: true }), true);
  assert.equal(matchesIssueCriteria({ ...oIssue, iStatus: DONE }, { bOpenOnly: true }), false);
  assert.equal(matchesIssueCriteria({ ...oIssue, bArchived: true }, {}), false);
  assert.equal(matchesIssueCriteria(oIssue, { sLabelId: LABEL_ID }, [LABEL_ID]), true);
  assert.equal(matchesIssueCriteria(oIssue, { sLabelId: LABEL_ID }, []), false);
});

test('issue draft validation', () => {
  const oValid = { sSummary: 'Do it', sProjectId: PROJECT_ID, iType: 100000000, iPriority: 100000002, aLabels: ['UX', 'ux', 'Back End'] };
  assert.equal(validateIssueDraft(oValid).bValid, true);
  const oResult = validateIssueDraft({ sSummary: '  ', sProjectId: 'x', iType: 5, iPriority: 5, sDueDate: '2026-02-30', aLabels: Array.from({ length: 12 }, (_, i) => `l${i}`) });
  assert.deepEqual(Object.keys(oResult.oErrors).sort(), ['aLabels', 'iPriority', 'iType', 'sDueDate', 'sProjectId', 'sSummary']);
  assert.equal(validateIssueDraft({ ...oValid, sSummary: 'x'.repeat(256) }).bValid, false);
  assert.deepEqual(normaliseLabels(['UX', 'ux', 'Back End', ' ', 'a<b>']), ['ux', 'back-end', 'ab']);
  assert.notEqual(validateCommentBody('   '), '');
  assert.equal(validateCommentBody('ok'), '');
});

test('parent validation prevents self, cross-project and cycles', () => {
  const oChild = { sId: 'c', sProjectId: PROJECT_ID };
  assert.equal(validateParent(oChild, { sId: 'p', sProjectId: PROJECT_ID }, []), '');
  assert.equal(validateParent(oChild, { sId: 'c', sProjectId: PROJECT_ID }), ERROR_CODES.invalidParent);
  assert.equal(validateParent(oChild, { sId: 'p', sProjectId: 'other' }), ERROR_CODES.invalidParent);
  assert.equal(validateParent(oChild, { sId: 'p', sProjectId: PROJECT_ID }, ['g', 'c']), ERROR_CODES.invalidParent);
  assert.equal(validateParent(oChild, null), '');
});

test('project permissions by role and membership state', () => {
  assert.deepEqual(getProjectPermissions({ bActive: true, iRole: 100000000 }), { bCanView: true, bCanEdit: true, bCanManage: true, sRole: 'lead' });
  assert.deepEqual(getProjectPermissions({ bActive: true, iRole: 100000001 }), { bCanView: true, bCanEdit: true, bCanManage: false, sRole: 'contributor' });
  assert.deepEqual(getProjectPermissions({ bActive: true, iRole: 100000002 }), { bCanView: true, bCanEdit: false, bCanManage: false, sRole: 'stakeholder' });
  assert.equal(getProjectPermissions({ bActive: false, iRole: 100000000 }).bCanView, false, 'removed members lose access');
  assert.equal(getProjectPermissions(null).bCanView, false);
  assert.equal(getProjectPermissions({ bActive: true, iRole: 100000001 }, true).bCanEdit, false, 'archived projects are read only');
});

test('friendly errors never leak raw server text', () => {
  assert.match(toFriendlyMessage(new Error('Principal user (Id=...) is missing prvCreatewd_issue privilege 0x80040220')), /permission/i);
  assert.equal(isDuplicateKeyError(new Error('A record with matching key values already exists. 0x80060892')), true);
  assert.match(toFriendlyMessage(new Error('Failed to fetch')), /could not reach/i);
  assert.equal(toFriendlyMessage(new Error('System.NullReferenceException at Foo.Bar')), 'Something went wrong. Please try again.');
  assert.match(toFriendlyMessage(createDomainError(ERROR_CODES.invalidTransition)), /workflow/);
});

test('dates, history and display helpers', () => {
  assert.equal(isOverdue('2026-10-01', TODO, '2026-10-14'), true);
  assert.equal(isOverdue('2026-10-01', DONE, '2026-10-14'), false);
  assert.equal(isOverdue('', TODO, '2026-10-14'), false);
  const oNow = new Date('2026-10-14T12:00:00Z');
  assert.equal(formatRelativeTime('2026-10-14T11:59:50Z', oNow), 'just now');
  assert.equal(formatRelativeTime('2026-10-14T10:00:00Z', oNow), '2 hours ago');
  assert.equal(formatRelativeTime('2026-10-11T12:00:00Z', oNow), '3 days ago');
  assert.equal(isValidDateOnly('2026-02-29'), false);
  assert.equal(isValidDateOnly('2028-02-29'), true);
  assert.equal(getInitials('Alex Morgan'), 'AM');
  assert.equal(getInitials(''), '?');
  const aChanges = diffDisplayValues({ priority: 'Low', summary: 'A' }, { priority: 'High', summary: 'A' }, [{ sField: 'priority', sLabel: 'Priority' }, { sField: 'summary', sLabel: 'Summary' }]);
  assert.deepEqual(aChanges, [{ sField: 'priority', sLabel: 'Priority', sOldValue: 'Low', sNewValue: 'High' }]);
  assert.equal(truncateText('x'.repeat(500)).length, 400);
  assert.equal(assertGuid(PROJECT_ID.toUpperCase()), PROJECT_ID);
});

test('plug-in error codes are mapped to their own message', () => {
  const oWrapped = new Error('Execution failed for PowerPlexPlugin: [PROJECT_ACCESS_DENIED] You must be a lead or contributor on PIRA to create issues.\r\n   at Microsoft.Crm...');
  assert.equal(toFriendlyMessage(oWrapped), 'You must be a lead or contributor on PIRA to create issues.');
  assert.deepEqual(parseServerError(new Error('[LAST_LEAD_REQUIRED]')), { sCode: 'LAST_LEAD_REQUIRED', sMessage: 'A project needs at least one lead. Make someone else a lead first.' });
  assert.equal(parseServerError(new Error('[NOT_A_PIRA_CODE] hello')), null, 'unknown codes are not trusted');
  assert.equal(toFriendlyMessage(new Error('[NOT_A_PIRA_CODE] hello')), 'Something went wrong. Please try again.');
});