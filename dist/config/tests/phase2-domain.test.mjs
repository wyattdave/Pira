// Phase 2 domain rules: sprints, hierarchy, story points, links, metrics, ranking and query criteria.
// Run: node --test agent/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSprintDraft, canSprintTransition, assertSprintTransition, findOtherActiveSprint, suggestSprintName, computeSprintMetrics,
  describeScopeChange, planSprintCompletion, validateParent, validateTypeChange, getAllowedParentTypes, canHaveChildren,
  parseStoryPoints, isValidStoryPoints, validateIssueDraft, validateIssueLink, LINK_CHOICES, describeLink, compareRank, isRankOrdered,
  buildIssueFilter, matchesIssueCriteria, ERROR_CODES, isSprintLocked, toFriendlyMessage, createDomainError,
} from '../../dist/js/domain.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '22222222-2222-4222-8222-222222222222';
const SPRINT_ID = '33333333-3333-4333-8333-333333333333';
const PARENT_ID = '44444444-4444-4444-8444-444444444444';
const TASK = 100000000, BUG = 100000001, STORY = 100000002, EPIC = 100000003;
const TODO = 100000000, DONE = 100000003;
const PLANNED = 100000000, ACTIVE = 100000001, COMPLETED = 100000002, CANCELLED = 100000003;
const BLOCKS = 100000000, RELATES = 100000001, DUPLICATES = 100000002;

test('sprint drafts: name required, dates valid, end not before start, dates required to start', () => {
  assert.equal(validateSprintDraft({ sName: 'S1' }).bValid, true, 'planned sprints may have no dates');
  assert.deepEqual(Object.keys(validateSprintDraft({ sName: 'S1' }, true).oErrors).sort(), ['sEndDate', 'sStartDate']);
  assert.equal(validateSprintDraft({ sName: '' }).oErrors.sName, 'Sprint name is required.');
  assert.match(validateSprintDraft({ sName: 'S', sStartDate: '2026-10-15', sEndDate: '2026-10-14' }).oErrors.sEndDate, /before the start/);
  assert.equal(validateSprintDraft({ sName: 'S', sStartDate: '2026-10-15', sEndDate: '2026-10-15' }, true).bValid, true, 'one-day sprint is fine');
  assert.ok(validateSprintDraft({ sName: 'S', sStartDate: '2026-02-30' }).oErrors.sStartDate);
  assert.ok(validateSprintDraft({ sName: 'x'.repeat(101) }).oErrors.sName);
});

test('sprint lifecycle transitions', () => {
  assert.equal(canSprintTransition(PLANNED, ACTIVE), true);
  assert.equal(canSprintTransition(PLANNED, CANCELLED), true);
  assert.equal(canSprintTransition(ACTIVE, COMPLETED), true);
  assert.equal(canSprintTransition(COMPLETED, ACTIVE), true, 'lead correction path');
  assert.equal(canSprintTransition(ACTIVE, CANCELLED), false, 'active sprints are completed, not cancelled');
  assert.equal(canSprintTransition(PLANNED, COMPLETED), false);
  assert.equal(canSprintTransition(CANCELLED, ACTIVE), false);
  assert.throws(() => assertSprintTransition(COMPLETED, CANCELLED), (oError) => oError.code === ERROR_CODES.invalidSprintTransition);
  assert.equal(isSprintLocked(COMPLETED) && isSprintLocked(CANCELLED) && !isSprintLocked(ACTIVE), true);
});

test('only one active sprint per board', () => {
  const aSprints = [
    { sId: 'a', sBoardId: BOARD_ID, iState: ACTIVE }, { sId: 'b', sBoardId: BOARD_ID, iState: PLANNED }, { sId: 'c', sBoardId: 'other', iState: ACTIVE },
  ];
  assert.equal(findOtherActiveSprint(aSprints, BOARD_ID, 'b').sId, 'a');
  assert.equal(findOtherActiveSprint(aSprints, BOARD_ID, 'a'), null, 'the sprint itself does not conflict');
  assert.equal(findOtherActiveSprint(aSprints, 'none'), null);
  assert.equal(suggestSprintName('pira', [{ sName: 'PIRA Sprint 2' }, { sName: 'Hotfix' }]), 'PIRA Sprint 3');
  assert.equal(suggestSprintName('PIRA', []), 'PIRA Sprint 1');
});

test('sprint metrics exclude archived issues and treat unestimated as 0 points', () => {
  const aIssues = [
    { iStatus: DONE, iStoryPoints: 3 }, { iStatus: TODO, iStoryPoints: 5 }, { iStatus: TODO, iStoryPoints: null },
    { iStatus: DONE, iStoryPoints: 8, bArchived: true }, { iStatus: TODO, iStoryPoints: 2, bArchived: true },
  ];
  assert.deepEqual(computeSprintMetrics(aIssues), { iIssues: 3, iDone: 1, iOpen: 2, iPoints: 8, iDonePoints: 3, iOpenPoints: 5, iUnestimated: 1 });
  assert.deepEqual(describeScopeChange({ sStartedOn: 'x', iCommittedIssues: 2, iCommittedPoints: 10 }, computeSprintMetrics(aIssues)), { iIssueDelta: 1, iPointDelta: -2 });
  assert.equal(describeScopeChange({ sStartedOn: '' }, computeSprintMetrics(aIssues)), null, 'no scope change before start');
});

test('completing a sprint needs an explicit destination for open work', () => {
  const aIssues = [{ sId: 'done', iStatus: DONE }, { sId: 'open', iStatus: TODO }, { sId: 'gone', iStatus: TODO, bArchived: true }];
  assert.throws(() => planSprintCompletion(aIssues, ''), (oError) => oError.code === ERROR_CODES.sprintDestinationRequired);
  assert.deepEqual(planSprintCompletion(aIssues, 'backlog').aMove.map((oIssue) => oIssue.sId), ['open']);
  assert.equal(planSprintCompletion(aIssues, 'backlog').sTargetSprintId, '');
  assert.equal(planSprintCompletion(aIssues, SPRINT_ID).sTargetSprintId, SPRINT_ID);
  assert.throws(() => planSprintCompletion(aIssues, "x' or 1 eq 1"), (oError) => oError.code === ERROR_CODES.validation);
  assert.deepEqual(planSprintCompletion([{ iStatus: DONE }], '').aMove, [], 'nothing open: no destination needed');
});

test('hierarchy: Epic → Story → Task/Bug, never sideways or upwards', () => {
  assert.deepEqual(getAllowedParentTypes(TASK).sort(), [STORY, EPIC].sort());
  assert.deepEqual(getAllowedParentTypes(STORY), [EPIC]);
  assert.deepEqual(getAllowedParentTypes(EPIC), []);
  assert.equal(canHaveChildren(EPIC) && canHaveChildren(STORY) && !canHaveChildren(TASK) && !canHaveChildren(BUG), true);
  const oChild = { sId: 'c', sProjectId: PROJECT_ID, iType: TASK };
  assert.equal(validateParent(oChild, { sId: 'p', sProjectId: PROJECT_ID, iType: STORY }), '');
  assert.equal(validateParent(oChild, { sId: 'p', sProjectId: PROJECT_ID, iType: BUG }), ERROR_CODES.invalidParentType);
  assert.equal(validateParent({ ...oChild, iType: STORY }, { sId: 'p', sProjectId: PROJECT_ID, iType: STORY }), ERROR_CODES.invalidParentType);
  assert.equal(validateParent({ ...oChild, iType: EPIC }, { sId: 'p', sProjectId: PROJECT_ID, iType: EPIC }), ERROR_CODES.invalidParentType);
  // Legacy links that broke the levels are still caught by the ancestor walk.
  assert.equal(validateParent({ ...oChild, iType: TASK }, { sId: 'p', sProjectId: PROJECT_ID, iType: STORY }, ['c']), ERROR_CODES.invalidParent);
  assert.equal(validateTypeChange(STORY, { iType: EPIC }, [TASK]), '');
  assert.equal(validateTypeChange(TASK, null, [BUG]), ERROR_CODES.invalidTypeChange, 'a parent of a bug cannot become a task');
  assert.equal(validateTypeChange(EPIC, { iType: STORY }, []), ERROR_CODES.invalidTypeChange);
  assert.match(toFriendlyMessage(createDomainError(ERROR_CODES.invalidParentType)), /Epics hold Stories/);
});

test('story points: whole numbers 0-1000 or not estimated', () => {
  assert.deepEqual(parseStoryPoints(''), { iPoints: null, sError: '' });
  assert.deepEqual(parseStoryPoints(' 8 '), { iPoints: 8, sError: '' });
  assert.equal(parseStoryPoints('0').iPoints, 0);
  ['2.5', '-1', '1001', 'abc', '1e3'].forEach((sValue) => assert.notEqual(parseStoryPoints(sValue).sError, '', sValue));
  assert.equal(isValidStoryPoints(13) && !isValidStoryPoints(1.5) && !isValidStoryPoints(-2), true);
  const oDraft = { sSummary: 'x', sProjectId: PROJECT_ID, iType: TASK, iPriority: 100000002 };
  assert.equal(validateIssueDraft({ ...oDraft, iStoryPoints: null }).bValid, true);
  assert.ok(validateIssueDraft({ ...oDraft, iStoryPoints: 2.5 }).oErrors.iStoryPoints);
  assert.ok(validateIssueDraft({ ...oDraft, sSprintId: 'nope' }).oErrors.sSprintId);
});

test('issue links: stored once, no self links, duplicates or contradictory pairs', () => {
  const oLink = { sFromId: 'a', sToId: 'b', iType: BLOCKS };
  assert.equal(validateIssueLink(oLink, []), '');
  assert.equal(validateIssueLink({ ...oLink, sToId: 'a' }, []), ERROR_CODES.invalidLink, 'self link');
  assert.equal(validateIssueLink({ ...oLink, iType: 5 }, []), ERROR_CODES.invalidLink, 'unknown type');
  assert.equal(validateIssueLink(oLink, [oLink]), ERROR_CODES.duplicateLink);
  assert.equal(validateIssueLink({ sFromId: 'b', sToId: 'a', iType: BLOCKS }, [oLink]), ERROR_CODES.invalidLink, 'A blocks B and B blocks A');
  assert.equal(validateIssueLink({ sFromId: 'b', sToId: 'a', iType: DUPLICATES }, [{ sFromId: 'a', sToId: 'b', iType: DUPLICATES }]), ERROR_CODES.invalidLink);
  assert.equal(validateIssueLink({ sFromId: 'b', sToId: 'a', iType: RELATES }, [{ sFromId: 'a', sToId: 'b', iType: RELATES }]), ERROR_CODES.duplicateLink, 'relates to is symmetric');
  assert.equal(validateIssueLink({ sFromId: 'a', sToId: 'b', iType: RELATES }, [oLink]), '', 'different types can co-exist');
  assert.deepEqual(LINK_CHOICES.map((oChoice) => oChoice.sLabel), ['blocks', 'is blocked by', 'relates to', 'duplicates', 'is duplicated by']);
  assert.equal(describeLink(BLOCKS, true), 'is blocked by');
});

test('ranking: ties break on created date then id, so every client sorts the same way', () => {
  const aIssues = [
    { sId: 'b', sRank: 'm', sCreatedOn: '2026-10-01' }, { sId: 'a', sRank: 'm', sCreatedOn: '2026-10-01' },
    { sId: 'c', sRank: 'm', sCreatedOn: '2026-09-01' }, { sId: 'd', sRank: 'h', sCreatedOn: '2026-12-01' }, { sId: 'e', sRank: '', sCreatedOn: '2026-01-01' },
  ];
  const aOrder = [...aIssues].sort(compareRank).map((oIssue) => oIssue.sId);
  assert.deepEqual(aOrder, ['d', 'c', 'a', 'b', 'e']);
  assert.deepEqual([...aIssues].reverse().sort(compareRank).map((oIssue) => oIssue.sId), aOrder, 'input order does not matter');
  assert.equal(isRankOrdered('b', 'd'), true);
  assert.equal(isRankOrdered('d', 'b') || isRankOrdered('', 'b') || isRankOrdered('b', 'b'), false);
});

test('OData filter and in-memory matching for sprint, board, parent and excluded types', () => {
  const sFilter = buildIssueFilter({ sProjectId: PROJECT_ID, sSprintId: 'none', sParentId: PARENT_ID, aExcludeTypes: [EPIC], sBoardId: BOARD_ID }, { sBoardCollection: 'wd_issue_boardissue' });
  assert.match(sFilter, /_wd_sprint_value eq null/);
  assert.match(sFilter, /_wd_parentissue_value eq 44444444-4444-4444-8444-444444444444/);
  assert.match(sFilter, /wd_issuetype ne 100000003/);
  assert.match(sFilter, /wd_issue_boardissue\/any\(o:o\/_wd_board_value eq 22222222-2222-4222-8222-222222222222\)/);
  assert.match(buildIssueFilter({ sSprintId: SPRINT_ID }), /_wd_sprint_value eq 33333333/);
  assert.throws(() => buildIssueFilter({ sBoardId: BOARD_ID }), 'board filter needs a navigation name');
  assert.throws(() => buildIssueFilter({ sSprintId: "x' or 1 eq 1" }));
  const oIssue = { sId: 'i', sKey: 'P-1', sSummary: 's', sProjectId: PROJECT_ID, iType: TASK, iStatus: TODO, sSprintId: '', sParentId: PARENT_ID, bArchived: false };
  assert.equal(matchesIssueCriteria(oIssue, { sSprintId: 'none' }), true);
  assert.equal(matchesIssueCriteria({ ...oIssue, sSprintId: SPRINT_ID }, { sSprintId: 'none' }), false);
  assert.equal(matchesIssueCriteria(oIssue, { sParentId: PARENT_ID, aExcludeTypes: [EPIC] }), true);
  assert.equal(matchesIssueCriteria({ ...oIssue, iType: EPIC }, { aExcludeTypes: [EPIC] }), false);
  assert.equal(matchesIssueCriteria(oIssue, { sBoardId: BOARD_ID }, [], [BOARD_ID]), true);
  assert.equal(matchesIssueCriteria(oIssue, { sBoardId: BOARD_ID }, [], []), false);
});
