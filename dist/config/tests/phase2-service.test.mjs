// Phase 2 service tests for dist/js/data-service.js: sprint lifecycle, incomplete-work handling, ordering conflicts,
// parent cycles, issue links and Entra people search. The fake evaluates the real OData filters the service builds.
// Run: node --test --experimental-test-module-mocks agent/tests/
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '11111111-1111-4111-8111-999999999999';
const BOARD_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BOARD_ID = '22222222-2222-4222-8222-333333333333';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const AAD_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_AAD_ID = '55555555-5555-4555-8555-666666666666';
const TASK = 100000000, STORY = 100000002, EPIC = 100000003;
const TODO = 100000000, DONE = 100000003;
const PLANNED = 100000000, ACTIVE = 100000001, COMPLETED = 100000002;
const LEAD = 100000000, CONTRIBUTOR = 100000001;
const id = (iNumber) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(iNumber).padStart(12, '0')}`;
const tick = () => new Promise((fnResolve) => { setTimeout(fnResolve, 2); });

const TABLE_KEYS = {
  wd_issues: 'wd_issueid', wd_sprints: 'wd_sprintid', wd_issuelinks: 'wd_issuelinkid', wd_boardissues: 'wd_boardissueid',
  wd_boards: 'wd_boardid', wd_projectmembers: 'wd_projectmemberid', systemusers: 'systemuserid', wd_issuehistories: 'wd_issuehistoryid',
  wd_projects: 'wd_projectid', wd_issuelabels: 'wd_issuelabelid', wd_projectsequences: 'wd_projectsequenceid',
};
const oDb = {};
const aWrites = [];
const oPeople = { fnSearch: async () => ({ value: [] }) };

// ── Minimal OData $filter evaluator (eq/ne/gt/lt, and/or, parentheses; contains/any treated as true) ──
function tokenize(sFilter) {
  const sText = sFilter.replace(/contains\([^)]*\)/g, 'true').replace(/[\w]+\/any\([^)]*\)/g, 'true');
  const aTokens = [];
  const oPattern = /\s*(\(|\)|'(?:[^']|'')*'|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|-?\d+(?:\.\d+)?|[A-Za-z_][\w.]*)/y;
  let aMatch;
  while (oPattern.lastIndex < sText.length && (aMatch = oPattern.exec(sText))) aTokens.push(aMatch[1]);
  return aTokens;
}

function parseValue(sToken) {
  if (sToken === 'null') return null;
  if (sToken === 'true' || sToken === 'false') return sToken === 'true';
  if (sToken.startsWith("'")) return sToken.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?$/.test(sToken)) return Number(sToken);
  return sToken.toLowerCase();
}

function compileFilter(sFilter) {
  const aTokens = tokenize(sFilter);
  let iPos = 0;
  const fnExpr = () => {
    let fnLeft = fnTerm();
    while (aTokens[iPos] === 'or') { iPos += 1; const fnA = fnLeft; const fnB = fnTerm(); fnLeft = (oRow) => fnA(oRow) || fnB(oRow); }
    return fnLeft;
  };
  const fnTerm = () => {
    let fnLeft = fnFactor();
    while (aTokens[iPos] === 'and') { iPos += 1; const fnA = fnLeft; const fnB = fnFactor(); fnLeft = (oRow) => fnA(oRow) && fnB(oRow); }
    return fnLeft;
  };
  const fnFactor = () => {
    if (aTokens[iPos] === '(') { iPos += 1; const fnInner = fnExpr(); iPos += 1; return fnInner; }
    if (aTokens[iPos] === 'true') { iPos += 1; return () => true; }
    const sField = aTokens[iPos]; const sOp = aTokens[iPos + 1]; const value = parseValue(aTokens[iPos + 2]);
    iPos += 3;
    return (oRow) => {
      const rowValue = oRow[sField] === undefined ? null : (typeof oRow[sField] === 'string' && /^[0-9a-f-]{36}$/i.test(oRow[sField]) ? oRow[sField].toLowerCase() : oRow[sField]);
      if (sOp === 'eq') return rowValue === value;
      if (sOp === 'ne') return rowValue !== value;
      if (rowValue === null) return false;
      return sOp === 'gt' ? rowValue > value : rowValue < value;
    };
  };
  return sFilter ? fnExpr() : () => true;
}

function applyBinds(oRecord) {
  const oRow = {};
  Object.entries(oRecord).forEach(([sKey, value]) => {
    const aBind = /^nav_(.+)@odata\.bind$/.exec(sKey);
    if (aBind) oRow[`_${aBind[1]}_value`] = value ? /\(([^)]+)\)/.exec(value)[1] : null;
    else oRow[sKey] = value;
  });
  return oRow;
}

const RELATIONSHIPS = ['wd_project', 'wd_assignee', 'wd_parentissue', 'wd_issue', 'wd_label', 'wd_user', 'wd_lead', 'wd_board', 'wd_sprint', 'wd_fromissue', 'wd_toissue']
  .map((sAttribute) => ({ ReferencingAttribute: sAttribute, ReferencingEntityNavigationPropertyName: `nav_${sAttribute}`, ReferencedEntityNavigationPropertyName: `col_${sAttribute}` }));

const fakeClient = {
  retrieveMultipleRecordsAsync: async (sSet, oOptions) => {
    await tick();
    let aRows = (oDb[sSet] || []).filter(compileFilter(oOptions.filter || ''));
    const sOrder = (oOptions.orderBy || [])[0];
    if (sOrder) {
      const [sField, sDirection] = sOrder.split(' ');
      aRows = [...aRows].sort((oA, oB) => (oA[sField] > oB[sField] ? 1 : oA[sField] < oB[sField] ? -1 : 0) * (sDirection === 'desc' ? -1 : 1));
    }
    const iCount = aRows.length;
    if (oOptions.top) aRows = aRows.slice(0, oOptions.top);
    return { success: true, data: aRows.map((oRow) => ({ ...oRow })), count: iCount };
  },
  executeAsync: async () => ({ success: true, data: { ManyToOneRelationships: RELATIONSHIPS } }),
};

mock.module(new URL('../../dist/power-apps-data.js', import.meta.url).href, {
  namedExports: { getClient: () => fakeClient, getContext: async () => ({ user: { systemUserId: USER_ID, objectId: AAD_ID } }) },
});
mock.module(new URL('../../dist/connectors/office365users.js', import.meta.url).href, {
  namedExports: { searchForUsers: (oOptions) => oPeople.fnSearch(oOptions) },
});
mock.module(new URL('../../dist/codeapp.js', import.meta.url).href, {
  namedExports: {
    initDataSources: () => {},
    unwrapResult: (oResult) => (oResult && 'data' in oResult ? oResult.data : oResult),
    createItem: async (sSet, sKey, oRecord) => {
      await tick();
      aWrites.push({ sOp: 'create', sSet, oRecord });
      (oDb[sSet] = oDb[sSet] || []).push({ createdon: new Date().toISOString(), ...applyBinds(oRecord) });
      return {};
    },
    updateItem: async (sSet, sKey, sId, oChanges) => {
      await tick();
      aWrites.push({ sOp: 'update', sSet, sId, oChanges });
      const oRow = (oDb[sSet] || []).find((oItem) => oItem[sKey] === sId);
      if (oRow) Object.assign(oRow, applyBinds(oChanges));
      return {};
    },
    getItem: async (sSet, sKey, sId) => {
      await tick();
      const oRow = (oDb[sSet] || []).find((oItem) => oItem[TABLE_KEYS[sSet]] === sId);
      return oRow ? { ...oRow } : null;
    },
    deleteItem: async (sSet, sKey, sId) => {
      await tick();
      oDb[sSet] = (oDb[sSet] || []).filter((oItem) => oItem[TABLE_KEYS[sSet]] !== sId);
      return {};
    },
  },
});

const oService = await import('../../dist/js/data-service.js');

const issueRow = (iNumber, oFields = {}) => ({
  wd_issueid: id(iNumber), wd_issuekey: `PIRA-${iNumber}`, wd_summary: `Issue ${iNumber}`, _wd_project_value: PROJECT_ID, wd_issuetype: TASK,
  wd_status: TODO, wd_priority: 100000002, wd_rank: '', wd_archived: false, wd_storypoints: null, _wd_sprint_value: null,
  _wd_parentissue_value: null, createdon: `2026-10-01T00:00:${String(iNumber).padStart(2, '0')}Z`, ...oFields,
});
const sprintRow = (iNumber, iState, oFields = {}) => ({
  wd_sprintid: id(900 + iNumber), wd_name: `PIRA Sprint ${iNumber}`, _wd_project_value: PROJECT_ID, _wd_board_value: BOARD_ID, wd_sprintstate: iState,
  wd_startdate: '2026-10-01', wd_enddate: '2026-10-14', createdon: `2026-09-0${iNumber}T00:00:00Z`, ...oFields,
});
const issueOf = async (iNumber) => oService.getIssue(id(iNumber));
const sprintOf = (iNumber) => ({ sId: id(900 + iNumber) });
const rowOf = (sSet, sId) => oDb[sSet].find((oRow) => oRow[TABLE_KEYS[sSet]] === sId);

beforeEach(() => {
  Object.keys(oDb).forEach((sKey) => delete oDb[sKey]);
  aWrites.length = 0;
  oDb.wd_projects = [{ wd_projectid: PROJECT_ID, wd_key: 'PIRA', wd_name: 'Pira', wd_state: 100000000 }];
  oDb.wd_boards = [{ wd_boardid: BOARD_ID, wd_name: 'PIRA board', _wd_project_value: PROJECT_ID, wd_isdefault: true, wd_active: true, wd_boardtype: 100000001 }];
  oDb.wd_projectmembers = [{ wd_projectmemberid: id(800), _wd_project_value: PROJECT_ID, _wd_user_value: USER_ID, wd_projectrole: LEAD, wd_membershipstate: 100000000 }];
  oDb.systemusers = [{ systemuserid: USER_ID, fullname: 'Test User', internalemailaddress: 'test@contoso.com', azureactivedirectoryobjectid: AAD_ID, isdisabled: false }];
  oDb.wd_issues = [];
  oDb.wd_sprints = [];
  oDb.wd_issuelinks = [];
  oService.initialise({ sServerLogic: 'client' });
  oService.invalidateCache('');
  oPeople.fnSearch = async () => ({ value: [] });
});

// ── Ordering ───────────────────────────────────────────────────

test('ordering: placement uses the neighbours\' current server ranks', async () => {
  oDb.wd_issues.push(issueRow(1, { wd_rank: 'b' }), issueRow(2, { wd_rank: 'd' }), issueRow(9, { wd_rank: 'h' }));
  const { oIssue } = await oService.planIssue(await issueOf(9), { sBeforeId: id(1), sAfterId: id(2) });
  assert.ok(oIssue.sRank > 'b' && oIssue.sRank < 'd', oIssue.sRank);
  assert.equal(rowOf('wd_issues', id(9)).wd_rank, oIssue.sRank, 'rank is persisted in Dataverse');
});

test('ordering conflict: a stale list (neighbours moved by someone else) still lands right after the issue above', async () => {
  // The client still shows 1 then 3, but another user has since moved 3 to the very top (rank "a").
  oDb.wd_issues.push(issueRow(1, { wd_rank: 'b' }), issueRow(2, { wd_rank: 'd' }), issueRow(3, { wd_rank: 'a' }), issueRow(9, { wd_rank: 'h' }));
  const { oIssue } = await oService.planIssue(await issueOf(9), { sBeforeId: id(1), sAfterId: id(3) });
  assert.ok(oIssue.sRank > 'b' && oIssue.sRank < 'd', `between issue 1 and its real successor: ${oIssue.sRank}`);
  const { oIssue: oTop } = await oService.planIssue(await issueOf(2), { sAfterId: id(3) });
  assert.ok(oTop.sRank < 'a', 'placing above the first issue goes before it');
  const { oIssue: oBottom } = await oService.transitionIssue(await issueOf(1), TODO, { sBeforeId: id(9) });
  assert.ok(oBottom.sRank > oIssue.sRank, 'board moves use the same placement rule');
});

test('ordering: two people dropping into the same gap both stay between the neighbours', async () => {
  oDb.wd_issues.push(issueRow(1, { wd_rank: 'b' }), issueRow(2, { wd_rank: 'd' }), issueRow(8, { wd_rank: 'p' }), issueRow(9, { wd_rank: 'q' }));
  const [oA, oB] = await Promise.all([
    oService.planIssue(await issueOf(8), { sBeforeId: id(1), sAfterId: id(2) }),
    oService.planIssue(await issueOf(9), { sBeforeId: id(1), sAfterId: id(2) }),
  ]);
  [oA.oIssue, oB.oIssue].forEach((oIssue) => assert.ok(oIssue.sRank > 'b' && oIssue.sRank < 'd'));
  const { aIssues } = await oService.listIssues({ oCriteria: { sProjectId: PROJECT_ID } });
  assert.deepEqual(aIssues.map((oIssue) => oIssue.sKey).slice(0, 1), ['PIRA-1']);
  assert.equal(aIssues[aIssues.length - 1].sKey, 'PIRA-2', 'neither drop jumped past issue 2');
});

// ── Sprint lifecycle ───────────────────────────────────────────

test('sprints: create validates dates; one active sprint per board', async () => {
  const oProject = await oService.getProject(PROJECT_ID);
  const oBoard = await oService.getBoard(oProject);
  await assert.rejects(oService.createSprint(oProject, oBoard, { sName: 'Bad', sStartDate: '2026-10-10', sEndDate: '2026-10-01' }), (oError) => oError.code === 'VALIDATION_FAILED' && Boolean(oError.details.sEndDate));
  const oPlanned = await oService.createSprint(oProject, oBoard, { sName: 'PIRA Sprint 1' });
  assert.equal(oPlanned.iState, PLANNED);
  await assert.rejects(oService.startSprint(oPlanned, {}), (oError) => oError.code === 'VALIDATION_FAILED', 'dates are required to start');
  oDb.wd_sprints.push(sprintRow(5, ACTIVE));
  await assert.rejects(oService.startSprint(oPlanned, { sStartDate: '2026-10-15', sEndDate: '2026-10-28' }), (oError) => oError.code === 'SPRINT_ACTIVE_EXISTS');
  oDb.wd_sprints.push(sprintRow(6, PLANNED, { _wd_board_value: OTHER_BOARD_ID }));
  oDb.wd_issues.push(issueRow(1, { _wd_sprint_value: id(906), wd_storypoints: 3 }), issueRow(2, { _wd_sprint_value: id(906), wd_storypoints: 5, wd_archived: true }));
  const oStarted = await oService.startSprint(sprintOf(6), {});
  assert.equal(oStarted.iState, ACTIVE, 'a different board can have its own active sprint');
  assert.deepEqual([oStarted.iCommittedIssues, oStarted.iCommittedPoints], [1, 3], 'committed snapshot excludes archived issues');
  await assert.rejects(oService.cancelSprint(oStarted), (oError) => oError.code === 'INVALID_SPRINT_TRANSITION', 'active sprints are completed, not cancelled');
});

test('sprints: completing requires an explicit destination and never drops incomplete work', async () => {
  oDb.wd_sprints.push(sprintRow(1, ACTIVE, { wd_startedon: '2026-10-01T00:00:00Z' }), sprintRow(2, PLANNED));
  oDb.wd_issues.push(
    issueRow(1, { _wd_sprint_value: id(901), wd_status: DONE, wd_storypoints: 3 }),
    issueRow(2, { _wd_sprint_value: id(901), wd_storypoints: 5 }),
    issueRow(3, { _wd_sprint_value: id(901) }),
    issueRow(4, { _wd_sprint_value: id(901), wd_status: DONE, wd_storypoints: 8, wd_archived: true }),
  );
  await assert.rejects(oService.completeSprint(sprintOf(1), ''), (oError) => oError.code === 'SPRINT_DESTINATION_REQUIRED');
  assert.equal(aWrites.length, 0, 'nothing was written');
  const { oSprint, iMoved } = await oService.completeSprint(sprintOf(1), id(902));
  assert.equal(iMoved, 2);
  assert.equal(oSprint.iState, COMPLETED);
  assert.deepEqual([oSprint.iCompletedIssues, oSprint.iCompletedPoints, oSprint.iIncompleteIssues, oSprint.iIncompletePoints], [1, 3, 2, 5], 'archived work is never counted as completed');
  assert.equal(rowOf('wd_issues', id(2))._wd_sprint_value, id(902));
  assert.equal(rowOf('wd_issues', id(3))._wd_sprint_value, id(902));
  assert.equal(rowOf('wd_issues', id(1))._wd_sprint_value, id(901), 'done work stays in the completed sprint');
  assert.equal(oDb.wd_issuehistories.filter((oRow) => oRow.wd_eventtype === 100000005).length, 2, 'Sprint Changed history per moved issue');
});

test('sprints: completing to the backlog, and invalid destinations', async () => {
  oDb.wd_sprints.push(sprintRow(1, ACTIVE), sprintRow(3, COMPLETED), sprintRow(4, PLANNED, { _wd_project_value: OTHER_PROJECT_ID }));
  oDb.wd_issues.push(issueRow(1, { _wd_sprint_value: id(901) }));
  await assert.rejects(oService.completeSprint(sprintOf(1), id(903)), (oError) => oError.code === 'SPRINT_LOCKED', 'cannot move work into a completed sprint');
  await assert.rejects(oService.completeSprint(sprintOf(1), id(904)), (oError) => oError.code === 'SPRINT_PROJECT_MISMATCH');
  await assert.rejects(oService.completeSprint(sprintOf(1), id(901)), (oError) => oError.code === 'SPRINT_LOCKED' || oError.code === 'VALIDATION_FAILED');
  assert.equal(rowOf('wd_sprints', id(901)).wd_sprintstate, ACTIVE, 'sprint stays active after a rejected completion');
  await oService.completeSprint(sprintOf(1), 'backlog');
  assert.equal(rowOf('wd_issues', id(1))._wd_sprint_value, null);
});

test('sprints: completed sprints are locked for membership and edits; reopening is lead-only with a reason', async () => {
  oDb.wd_sprints.push(sprintRow(1, COMPLETED), sprintRow(2, PLANNED));
  oDb.wd_issues.push(issueRow(1, { _wd_sprint_value: id(901), wd_status: DONE }), issueRow(2));
  await assert.rejects(oService.planIssue(await issueOf(1), { sSprintId: '' }), (oError) => oError.code === 'SPRINT_LOCKED');
  await assert.rejects(oService.planIssue(await issueOf(2), { sSprintId: id(901) }), (oError) => oError.code === 'SPRINT_LOCKED');
  await assert.rejects(oService.updateIssue(await issueOf(1), { sSprintId: id(902) }), (oError) => oError.code === 'SPRINT_LOCKED');
  await assert.rejects(oService.updateSprint(sprintOf(1), { sName: 'Renamed' }), (oError) => oError.code === 'SPRINT_LOCKED');
  await assert.rejects(oService.reopenSprint(sprintOf(1), '  '), (oError) => oError.code === 'VALIDATION_FAILED');
  oDb.wd_projectmembers[0].wd_projectrole = CONTRIBUTOR;
  oService.invalidateCache('');
  await assert.rejects(oService.reopenSprint(sprintOf(1), 'Wrong end date'), (oError) => oError.code === 'PERMISSION_DENIED');
  oDb.wd_projectmembers[0].wd_projectrole = LEAD;
  oService.invalidateCache('');
  const oReopened = await oService.reopenSprint(sprintOf(1), 'Wrong end date');
  assert.equal(oReopened.iState, ACTIVE);
  assert.match(oReopened.sCorrectionNote, /Wrong end date$/);
  const { oIssue } = await oService.planIssue(await issueOf(2), { sSprintId: id(902) });
  assert.equal(oIssue.sSprintId, id(902), 'planned sprints accept issues');
});

test('cancelling a planned sprint returns its issues to the backlog', async () => {
  oDb.wd_sprints.push(sprintRow(2, PLANNED));
  oDb.wd_issues.push(issueRow(1, { _wd_sprint_value: id(902) }), issueRow(2, { _wd_sprint_value: id(902) }), issueRow(3, { _wd_sprint_value: id(902), wd_archived: true }));
  const { iMoved, oSprint } = await oService.cancelSprint(sprintOf(2));
  assert.equal(iMoved, 2);
  assert.equal(oSprint.iState, 100000003);
  assert.ok(oDb.wd_issues.filter((oRow) => !oRow.wd_archived).every((oRow) => oRow._wd_sprint_value === null));
  assert.equal(rowOf('wd_issues', id(3))._wd_sprint_value, id(902), 'archived issues are read-only, so they are left alone');
});

// ── Hierarchy ──────────────────────────────────────────────────

test('parents: cycles, self-parenting and wrong issue types are rejected before writing', async () => {
  oDb.wd_issues.push(
    issueRow(1, { wd_issuetype: EPIC }), issueRow(2, { wd_issuetype: STORY, _wd_parentissue_value: id(1) }), issueRow(3, { wd_issuetype: TASK, _wd_parentissue_value: id(2) }),
    // Legacy (Phase 1) link that broke the type levels: a Story under a Task.
    issueRow(4, { wd_issuetype: TASK }), issueRow(5, { wd_issuetype: STORY, _wd_parentissue_value: id(4) }),
  );
  await assert.rejects(oService.updateIssue(await issueOf(3), { sParentId: id(3) }), (oError) => oError.code === 'INVALID_PARENT_RELATIONSHIP');
  await assert.rejects(oService.updateIssue(await issueOf(2), { sParentId: id(3) }), (oError) => oError.code === 'INVALID_PARENT_RELATIONSHIP', 'descendant as parent');
  await assert.rejects(oService.updateIssue(await issueOf(4), { sParentId: id(5) }), (oError) => oError.code === 'INVALID_PARENT_RELATIONSHIP', 'legacy chain cycle');
  await assert.rejects(oService.updateIssue(await issueOf(3), { sParentId: id(4) }), (oError) => oError.code === 'INVALID_PARENT_TYPE', 'a task cannot hold a task');
  await assert.rejects(oService.updateIssue(await issueOf(2), { iType: TASK }), (oError) => oError.code === 'INVALID_TYPE_CHANGE', 'it still has a task child');
  await assert.rejects(oService.createIssue({ sId: PROJECT_ID, sKey: 'PIRA', bArchived: false }, { sSummary: 'x', iType: EPIC, iPriority: 100000002, sParentId: id(1) }), (oError) => oError.code === 'INVALID_PARENT_TYPE');
  assert.equal(aWrites.filter((oWrite) => oWrite.sSet === 'wd_issues').length, 0);
  const { oIssue } = await oService.updateIssue(await issueOf(4), { sParentId: id(2), iStoryPoints: 5 });
  assert.equal(oIssue.sParentId, id(2));
  assert.equal(oIssue.iStoryPoints, 5);
});

// ── Links ──────────────────────────────────────────────────────

test('links: duplicates, contradictory pairs and self links are rejected', async () => {
  oDb.wd_issues.push(issueRow(1), issueRow(2), issueRow(3));
  const [oA, oB, oC] = await Promise.all([issueOf(1), issueOf(2), issueOf(3)]);
  assert.equal(await oService.createIssueLink(oA, 'blocks', oB), true);
  await assert.rejects(oService.createIssueLink(oA, 'blocks', oB), (oError) => oError.code === 'DUPLICATE_LINK');
  await assert.rejects(oService.createIssueLink(oB, 'blocks', oA), (oError) => oError.code === 'INVALID_LINK');
  await assert.rejects(oService.createIssueLink(oA, 'blocks-inward', oB), (oError) => oError.code === 'INVALID_LINK');
  await assert.rejects(oService.createIssueLink(oA, 'relates', oA), (oError) => oError.code === 'INVALID_LINK');
  await oService.createIssueLink(oA, 'relates', oC);
  await assert.rejects(oService.createIssueLink(oC, 'relates', oA), (oError) => oError.code === 'DUPLICATE_LINK');
  await oService.createIssueLink(oC, 'duplicates-inward', oB);
  assert.equal(oDb.wd_issuelinks.length, 3);
  const oStored = oDb.wd_issuelinks[2];
  assert.deepEqual([oStored._wd_fromissue_value, oStored._wd_toissue_value], [id(2), id(3)], 'inward choices are stored From → To');
  const aLinks = await oService.listIssueLinks(oB);
  assert.deepEqual(aLinks.map((oLink) => `${oLink.sLabel} ${oLink.oOther.sKey}`).sort(), ['duplicates PIRA-3', 'is blocked by PIRA-1']);
  await oService.deleteIssueLink(oB, aLinks[0]);
  assert.equal(oDb.wd_issuelinks.length, 2);
});

// ── People ─────────────────────────────────────────────────────

test('people search: Entra results resolve to Dataverse users; unprovisioned people cannot be added', async () => {
  oPeople.fnSearch = async (oOptions) => {
    assert.equal(oOptions.searchTerm, 'te');
    return { value: [
      { id: AAD_ID, displayName: 'Test User', mail: 'test@contoso.com' },
      { id: OTHER_AAD_ID, displayName: 'New Starter', mail: 'new@contoso.com' },
      { id: 'not-a-guid', displayName: 'Broken' },
      { id: '55555555-5555-4555-8555-777777777777', displayName: 'Disabled', accountEnabled: false },
    ] };
  };
  const aPeople = await oService.searchUsers('te');
  assert.deepEqual(aPeople.map((oPerson) => [oPerson.sName, oPerson.sId, oPerson.bProvisioned]), [['Test User', USER_ID, true], ['New Starter', '', false]]);
  await assert.rejects(oService.addMember({ sId: PROJECT_ID, sKey: 'PIRA' }, aPeople[1], CONTRIBUTOR), (oError) => oError.code === 'USER_NOT_PROVISIONED');
  assert.deepEqual(await oService.searchUsers('x'), [], 'needs two characters');
  oPeople.fnSearch = async () => { throw new Error('Connection reference not found'); };
  const aWarnings = [];
  const fnWarn = console.warn;
  console.warn = (...aArgs) => aWarnings.push(aArgs);
  try {
    const aFallback = await oService.searchUsers('test');
    assert.deepEqual(aFallback.map((oPerson) => oPerson.sId), [USER_ID], 'falls back to Dataverse users when the connector is unavailable');
  } finally {
    console.warn = fnWarn;
  }
  assert.equal(aWarnings.length, 1, 'the fallback is logged once');
});

// ── Boards ─────────────────────────────────────────────────────

test('boards: the default board lists first; issues can sit on several extra boards of their own project only', async () => {
  const oProject = await oService.getProject(PROJECT_ID);
  const oDesign = await oService.createBoard(oProject, { sName: 'Design', iType: 100000000 });
  const oOps = await oService.createBoard(oProject, { sName: 'Ops', iType: 100000000 });
  assert.equal(oDesign.aColumns.length, 4, 'new boards get the default columns');
  const aBoards = await oService.listBoards(oProject);
  assert.deepEqual(aBoards.map((oBoard) => oBoard.sName), ['PIRA board', 'Design', 'Ops']);
  oDb.wd_issues.push(issueRow(1));
  const oIssue = await issueOf(1);
  await oService.setIssueBoards(oIssue, [oDesign.sId, oOps.sId]);
  assert.deepEqual((await oService.listIssueBoardIds(oIssue.sId)).sort(), [oDesign.sId, oOps.sId].sort());
  await oService.setIssueBoards(oIssue, [oOps.sId]);
  assert.deepEqual(await oService.listIssueBoardIds(oIssue.sId), [oOps.sId]);
  await assert.rejects(oService.setIssueBoards(oIssue, [BOARD_ID]), (oError) => oError.code === 'BOARD_NOT_FOUND', 'the default board needs no membership row');
  await assert.rejects(oService.archiveBoard(oProject, aBoards[0]), /default board/);
});
