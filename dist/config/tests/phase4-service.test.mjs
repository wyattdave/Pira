// Phase 4 service tests for dist/js/data-service.js: fix versions and estimates on issues, Started On, versions and releasing,
// work logs (validation, permissions, Time Spent, history), advanced-query OData, CSV export/import, analytics and dependencies.
// The fake evaluates the real OData filters (eq/ne/gt/ge/lt/le, and/or/not, dates); lambdas and contains() count as true.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '11111111-1111-4111-8111-999999999999';
const BOARD_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PRIYA_ID = '44444444-4444-4444-8444-444444444444';
const AAD_ID = '55555555-5555-4555-8555-555555555555';
const TASK = 100000000, BUG = 100000001;
const TODO = 100000000, PROGRESS = 100000001, DONE = 100000003;
const LEAD = 100000000, CONTRIBUTOR = 100000001, STAKEHOLDER = 100000002;
const UNRELEASED = 100000000, RELEASED = 100000001, ARCHIVED = 100000002;
const id = (iNumber) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(iNumber).padStart(12, '0')}`;
const tick = () => new Promise((fnResolve) => { setTimeout(fnResolve, 2); });
const today = () => { const oDate = new Date(); return `${oDate.getFullYear()}-${String(oDate.getMonth() + 1).padStart(2, '0')}-${String(oDate.getDate()).padStart(2, '0')}`; };

const TABLE_KEYS = {
  wd_issues: 'wd_issueid', wd_sprints: 'wd_sprintid', wd_issuelinks: 'wd_issuelinkid', wd_boardissues: 'wd_boardissueid', wd_boards: 'wd_boardid',
  wd_boardcolumns: 'wd_boardcolumnid', wd_projectmembers: 'wd_projectmemberid', systemusers: 'systemuserid', wd_issuehistories: 'wd_issuehistoryid',
  wd_projects: 'wd_projectid', wd_issuelabels: 'wd_issuelabelid', wd_labels: 'wd_labelid', wd_projectsequences: 'wd_projectsequenceid',
  wd_workflowtransitions: 'wd_workflowtransitionid', wd_savedfilters: 'wd_savedfilterid', wd_notifications: 'wd_notificationid',
  wd_notificationpreferences: 'wd_notificationpreferenceid', wd_issueattachments: 'wd_issueattachmentid', wd_customfields: 'wd_customfieldid',
  wd_customfieldvalues: 'wd_customfieldvalueid', wd_versions: 'wd_versionid', wd_worklogs: 'wd_worklogid',
};
const oDb = {};
const aWrites = [];
const aQueries = [];
const oFaults = { fnCreate: null };

// ── Minimal OData $filter evaluator ──
function tokenize(sFilter) {
  const sText = sFilter.replace(/contains\([^)]*\)/g, 'true').replace(/[\w]+\/any\([^)]*\)/g, 'true');
  const aTokens = [];
  const oPattern = /\s*(\(|\)|'(?:[^']|'')*'|\d{4}-\d{2}-\d{2}T[\d:.]+Z|\d{4}-\d{2}-\d{2}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|-?\d+(?:\.\d+)?|[A-Za-z_][\w.]*)/y;
  let aMatch;
  while (oPattern.lastIndex < sText.length && (aMatch = oPattern.exec(sText))) aTokens.push(aMatch[1]);
  return aTokens;
}

function parseValue(sToken) {
  if (sToken === 'null') return null;
  if (sToken === 'true' || sToken === 'false') return sToken === 'true';
  if (sToken.startsWith("'")) return sToken.slice(1, -1).replace(/''/g, "'");
  if (/^\d{4}-\d{2}-\d{2}/.test(sToken)) return sToken;
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
    if (aTokens[iPos] === 'not') { iPos += 1; const fnInner = fnFactor(); return (oRow) => !fnInner(oRow); }
    if (aTokens[iPos] === '(') { iPos += 1; const fnInner = fnExpr(); iPos += 1; return fnInner; }
    if (aTokens[iPos] === 'true') { iPos += 1; return () => true; }
    const sField = aTokens[iPos]; const sOp = aTokens[iPos + 1]; const value = parseValue(aTokens[iPos + 2]);
    iPos += 3;
    return (oRow) => {
      const rowValue = oRow[sField] === undefined ? null : (typeof oRow[sField] === 'string' && /^[0-9a-f-]{36}$/i.test(oRow[sField]) ? oRow[sField].toLowerCase() : oRow[sField]);
      if (sOp === 'eq') return rowValue === value;
      if (sOp === 'ne') return rowValue !== value;
      if (rowValue === null) return false;
      return { gt: rowValue > value, ge: rowValue >= value, lt: rowValue < value, le: rowValue <= value }[sOp];
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

const RELATIONSHIPS = ['wd_project', 'wd_assignee', 'wd_parentissue', 'wd_issue', 'wd_label', 'wd_user', 'wd_lead', 'wd_board', 'wd_sprint', 'wd_fromissue',
  'wd_toissue', 'wd_recipient', 'wd_customfield', 'wd_fixversion']
  .map((sAttribute) => ({ ReferencingAttribute: sAttribute, ReferencingEntityNavigationPropertyName: `nav_${sAttribute}`, ReferencedEntityNavigationPropertyName: `col_${sAttribute}` }));

const fakeClient = {
  retrieveMultipleRecordsAsync: async (sSet, oOptions) => {
    await tick();
    aQueries.push({ sSet, sFilter: oOptions.filter || '' });
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
mock.module(new URL('../../dist/connectors/office365users.js', import.meta.url).href, { namedExports: { searchForUsers: async () => ({ value: [] }) } });
mock.module(new URL('../../dist/codeapp.js', import.meta.url).href, {
  namedExports: {
    initDataSources: () => {},
    unwrapResult: (oResult) => (oResult && 'data' in oResult ? oResult.data : oResult),
    createItem: async (sSet, sKey, oRecord) => {
      await tick();
      if (oFaults.fnCreate) oFaults.fnCreate(sSet, oRecord);
      aWrites.push({ sOp: 'create', sSet, oRecord });
      (oDb[sSet] = oDb[sSet] || []).push({ createdon: new Date().toISOString(), _createdby_value: USER_ID, ...applyBinds(oRecord) });
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
      aWrites.push({ sOp: 'delete', sSet, sId });
      oDb[sSet] = (oDb[sSet] || []).filter((oItem) => oItem[TABLE_KEYS[sSet]] !== sId);
      return {};
    },
  },
});

const oService = await import('../../dist/js/data-service.js');

const issueRow = (iNumber, oFields = {}) => ({
  wd_issueid: id(iNumber), wd_issuekey: `PIRA-${iNumber}`, wd_summary: `Summary ${iNumber}`, _wd_project_value: PROJECT_ID, wd_issuetype: TASK,
  wd_status: TODO, wd_priority: 100000002, wd_rank: '', wd_archived: false, wd_storypoints: null, _wd_sprint_value: null, _wd_assignee_value: null,
  _wd_parentissue_value: null, _createdby_value: PRIYA_ID, wd_resolution: null, wd_originalestimate: null, wd_remainingestimate: null, wd_timespent: 0,
  _wd_fixversion_value: null, wd_startedon: null, createdon: `2026-10-01T00:00:${String(iNumber % 60).padStart(2, '0')}Z`, ...oFields,
});
const versionRow = (iNumber, sName, iState = UNRELEASED, oFields = {}) => ({
  wd_versionid: id(900 + iNumber), wd_name: sName, _wd_project_value: PROJECT_ID, wd_versionstate: iState, wd_startdate: null, wd_releasedate: null, ...oFields,
});
const worklogRow = (iNumber, iIssue, iMinutes, oFields = {}) => ({
  wd_worklogid: id(1000 + iNumber), _wd_issue_value: id(iIssue), _wd_project_value: PROJECT_ID, wd_minutes: iMinutes, wd_workdate: today(), wd_workcomment: '',
  wd_voided: false, _createdby_value: USER_ID, createdon: new Date().toISOString(), ...oFields,
});
const memberRow = (iNumber, sUserId, iRole, sName) => ({
  wd_projectmemberid: id(800 + iNumber), _wd_project_value: PROJECT_ID, _wd_user_value: sUserId, wd_projectrole: iRole, wd_membershipstate: 100000000,
  '_wd_user_value@OData.Community.Display.V1.FormattedValue': sName,
});
const issueOf = (iNumber) => oService.getIssue(id(iNumber));
const rowOf = (sSet, sId) => (oDb[sSet] || []).find((oRow) => oRow[TABLE_KEYS[sSet]] === sId);
const writesTo = (sSet, sOp = '') => aWrites.filter((oWrite) => oWrite.sSet === sSet && (!sOp || oWrite.sOp === sOp));
const historyFields = () => (oDb.wd_issuehistories || []).map((oRow) => oRow.wd_fieldname);
const setMyRole = (iRole) => { oDb.wd_projectmembers[0].wd_projectrole = iRole; oService.invalidateCache(''); };
const useLowcode = () => { oService.initialise({ sServerLogic: 'lowcode' }); oService.invalidateCache(''); };

beforeEach(() => {
  Object.keys(oDb).forEach((sKey) => delete oDb[sKey]);
  aWrites.length = 0;
  aQueries.length = 0;
  oFaults.fnCreate = null;
  oDb.wd_projects = [{ wd_projectid: PROJECT_ID, wd_key: 'PIRA', wd_name: 'Pira', wd_state: 100000000 }, { wd_projectid: OTHER_PROJECT_ID, wd_key: 'OPS', wd_name: 'Ops', wd_state: 100000000 }];
  oDb.wd_boards = [{ wd_boardid: BOARD_ID, wd_name: 'PIRA board', _wd_project_value: PROJECT_ID, wd_isdefault: true, wd_active: true, wd_boardtype: 100000000 }];
  oDb.wd_boardcolumns = [TODO, PROGRESS, 100000002, DONE].map((iStatus, iIndex) => ({ wd_boardcolumnid: id(700 + iIndex), _wd_board_value: BOARD_ID, wd_name: `Col ${iStatus}`, wd_order: iIndex, wd_status: iStatus, wd_wiplimit: 0 }));
  oDb.wd_projectmembers = [memberRow(1, USER_ID, LEAD, 'Test User'), memberRow(2, PRIYA_ID, CONTRIBUTOR, 'Priya Shah')];
  oDb.systemusers = [
    { systemuserid: USER_ID, fullname: 'Test User', internalemailaddress: 'test@contoso.com', azureactivedirectoryobjectid: AAD_ID, isdisabled: false },
    { systemuserid: PRIYA_ID, fullname: 'Priya Shah', internalemailaddress: 'priya@contoso.com', isdisabled: false },
  ];
  oDb.wd_issues = [];
  oDb.wd_versions = [versionRow(1, '1.0'), versionRow(2, '2.0'), versionRow(3, 'Old', ARCHIVED), { ...versionRow(4, 'Ops 1'), _wd_project_value: OTHER_PROJECT_ID }];
  oDb.wd_worklogs = [];
  oDb.wd_projectsequences = [{ wd_projectsequenceid: id(600), _wd_project_value: PROJECT_ID, wd_nextnumber: 50 }];
  oService.initialise({ sServerLogic: 'client' });
  oService.invalidateCache('');
});

const PROJECT = { sId: PROJECT_ID, sKey: 'PIRA', sName: 'Pira', bArchived: false };
const DRAFT = { sSummary: 'New issue', iType: TASK, iPriority: 100000002 };

// ── Issues: fix version, estimates, Started On ─────────────────

test('issues: a fix version must be an active version of the same project; a first estimate seeds the remaining estimate', async () => {
  await assert.rejects(oService.createIssue(PROJECT, { ...DRAFT, sFixVersionId: id(904) }), (oError) => oError.code === 'VERSION_PROJECT_MISMATCH');
  await assert.rejects(oService.createIssue(PROJECT, { ...DRAFT, sFixVersionId: id(903) }), (oError) => oError.code === 'VERSION_ARCHIVED');
  assert.equal(writesTo('wd_issues', 'create').length, 0, 'nothing is written for an invalid fix version');
  const { oIssue } = await oService.createIssue(PROJECT, { ...DRAFT, sFixVersionId: id(902), iOriginalEstimate: 720 });
  assert.equal(oIssue.sFixVersionId, id(902));
  assert.deepEqual([oIssue.iOriginalEstimate, oIssue.iRemainingEstimate, oIssue.iTimeSpent], [720, 720, 0]);
  await assert.rejects(oService.createIssue(PROJECT, { ...DRAFT, iOriginalEstimate: -5 }), (oError) => oError.code === 'VALIDATION_FAILED');
});

test('issues: estimate and fix version edits are validated and recorded in history (client mode)', async () => {
  oDb.wd_issues.push(issueRow(1));
  await assert.rejects(oService.updateIssue(await issueOf(1), { iRemainingEstimate: 1.5 }), (oError) => oError.code === 'VALIDATION_FAILED');
  await assert.rejects(oService.updateIssue(await issueOf(1), { sFixVersionId: id(903) }), (oError) => oError.code === 'VERSION_ARCHIVED');
  assert.equal(writesTo('wd_issues', 'update').length, 0);
  const { oIssue } = await oService.updateIssue(await issueOf(1), { sFixVersionId: id(901), iOriginalEstimate: 480 });
  assert.deepEqual([oIssue.sFixVersionId, oIssue.iOriginalEstimate, oIssue.iRemainingEstimate], [id(901), 480, 480]);
  assert.deepEqual(historyFields().sort(), ['fixVersion', 'originalEstimate', 'remainingEstimate']);
  const oHistory = oDb.wd_issuehistories.find((oRow) => oRow.wd_fieldname === 'originalEstimate');
  assert.deepEqual([oHistory.wd_oldvalue, oHistory.wd_newvalue], ['None', '1d']);
});

test('issues: Started On is stamped the first time an issue enters an in-progress status, by the client only in client mode', async () => {
  oDb.wd_issues.push(issueRow(1), issueRow(2));
  await oService.transitionIssue(await issueOf(1), PROGRESS);
  const sStarted = rowOf('wd_issues', id(1)).wd_startedon;
  assert.ok(sStarted);
  await oService.transitionIssue(await issueOf(1), TODO);
  await oService.transitionIssue(await issueOf(1), PROGRESS);
  assert.equal(rowOf('wd_issues', id(1)).wd_startedon, sStarted, 'only the first start counts');
  useLowcode();
  await oService.transitionIssue(await issueOf(2), PROGRESS);
  assert.equal(writesTo('wd_issues', 'update').filter((oWrite) => oWrite.sId === id(2)).some((oWrite) => 'wd_startedon' in oWrite.oChanges), false, 'plug-in 36 stamps it');
});

// ── Versions ───────────────────────────────────────────────────

test('versions: only leads create them; names stay unique per project; new versions start unreleased', async () => {
  setMyRole(CONTRIBUTOR);
  await assert.rejects(oService.createVersion(PROJECT, { sName: '3.0' }), (oError) => oError.code === 'PERMISSION_DENIED');
  setMyRole(LEAD);
  await assert.rejects(oService.createVersion(PROJECT, { sName: ' 2.0 ' }), (oError) => oError.code === 'VERSION_NAME_TAKEN');
  await assert.rejects(oService.createVersion(PROJECT, { sName: 'x', sStartDate: '2026-11-02', sReleaseDate: '2026-11-01' }), (oError) => oError.code === 'INVALID_VERSION');
  assert.equal(writesTo('wd_versions').length, 0);
  const oVersion = await oService.createVersion(PROJECT, { sName: 'Ops 1', sReleaseDate: '2026-12-01' });
  assert.equal(oVersion.iState, UNRELEASED, 'a name used in another project is fine');
  assert.equal(rowOf('wd_versions', oVersion.sId)._wd_project_value, PROJECT_ID);
  await assert.rejects(oService.createVersion({ ...PROJECT, bArchived: true }, { sName: '9' }), (oError) => oError.code === 'PROJECT_ARCHIVED');
});

test('versions: releasing asks about unfinished issues, moves them to an unreleased version first, then marks the release', async () => {
  oDb.wd_issues.push(issueRow(1, { _wd_fixversion_value: id(901), wd_status: DONE, wd_storypoints: 3 }), issueRow(2, { _wd_fixversion_value: id(901) }), issueRow(3, { _wd_fixversion_value: id(901), wd_archived: true }));
  const oVersion = (await oService.listVersions(PROJECT_ID)).find((oItem) => oItem.sName === '1.0');
  await assert.rejects(oService.releaseVersion(PROJECT, oVersion), (oError) => oError.code === 'VERSION_DESTINATION_REQUIRED');
  await assert.rejects(oService.releaseVersion(PROJECT, oVersion, { sDestination: id(904) }), (oError) => oError.code === 'VERSION_PROJECT_MISMATCH');
  assert.equal(writesTo('wd_issues', 'update').length + writesTo('wd_versions', 'update').length, 0);
  const oProgress = await oService.getVersionProgress(PROJECT);
  assert.deepEqual([oProgress[id(901)].iIssues, oProgress[id(901)].iDone], [2, 1], 'archived issues never count');
  const { oVersion: oReleased, iMoved } = await oService.releaseVersion(PROJECT, oVersion, { sDestination: id(902), sReleaseDate: '2026-10-20' });
  assert.equal(iMoved, 1);
  assert.equal(rowOf('wd_issues', id(2))._wd_fixversion_value, id(902));
  assert.equal(rowOf('wd_issues', id(3))._wd_fixversion_value, id(901), 'archived issues stay put');
  assert.deepEqual([oReleased.iState, oReleased.sReleaseDate, Boolean(oReleased.sReleasedOn)], [RELEASED, '2026-10-20', true]);
  const iVersionWrite = aWrites.findIndex((oWrite) => oWrite.sSet === 'wd_versions');
  assert.ok(aWrites.findIndex((oWrite) => oWrite.sSet === 'wd_issues') < iVersionWrite, 'issues move before the version is released');
  await assert.rejects(oService.releaseVersion(PROJECT, oReleased, { sDestination: 'keep' }), (oError) => oError.code === 'VALIDATION_FAILED');
  const oTwo = (await oService.listVersions(PROJECT_ID)).find((oItem) => oItem.sName === '2.0');
  const iBefore = writesTo('wd_issues').length;
  await oService.releaseVersion(PROJECT, oTwo, { sDestination: 'keep' });
  assert.equal(writesTo('wd_issues').length, iBefore, '"keep" leaves the issues alone');
});

test('versions: state changes are lead-only; archived versions can be restored', async () => {
  const oOld = (await oService.listVersions(PROJECT_ID)).find((oItem) => oItem.sName === 'Old');
  setMyRole(STAKEHOLDER);
  await assert.rejects(oService.setVersionState(PROJECT, oOld, UNRELEASED), (oError) => oError.code === 'PERMISSION_DENIED');
  setMyRole(LEAD);
  assert.equal((await oService.setVersionState(PROJECT, oOld, UNRELEASED)).iState, UNRELEASED);
  await assert.rejects(oService.setVersionState(PROJECT, oOld, 42), (oError) => oError.code === 'VALIDATION_FAILED');
});

// ── Work logs ──────────────────────────────────────────────────

test('work logs: validated, members only, recalculate Time Spent from non-voided logs and adjust the remaining estimate (client mode)', async () => {
  oDb.wd_issues.push(issueRow(1, { wd_originalestimate: 480, wd_remainingestimate: 300, wd_timespent: 60 }));
  oDb.wd_worklogs.push(worklogRow(1, 1, 60), worklogRow(2, 1, 999, { wd_voided: true }));
  await assert.rejects(oService.logWork(await issueOf(1), { iMinutes: 0, sWorkDate: today() }), (oError) => oError.code === 'INVALID_WORK_LOG');
  await assert.rejects(oService.logWork(await issueOf(1), { iMinutes: 60, sWorkDate: '2020-01-01' }), (oError) => oError.code === 'INVALID_WORK_LOG');
  setMyRole(STAKEHOLDER);
  await assert.rejects(oService.logWork(await issueOf(1), { iMinutes: 60, sWorkDate: today() }), (oError) => oError.code === 'PERMISSION_DENIED');
  setMyRole(LEAD);
  assert.equal(writesTo('wd_worklogs').length, 0);
  const { oWorkLog, oIssue, bRemainingSaved } = await oService.logWork(await issueOf(1), { iMinutes: 90, sWorkDate: today(), sComment: ' Fixed it ' });
  const oRow = rowOf('wd_worklogs', oWorkLog.sId);
  assert.deepEqual([oRow._wd_issue_value, oRow._wd_project_value, oRow.wd_minutes, oRow.wd_workcomment, oRow.wd_voided], [id(1), PROJECT_ID, 90, 'Fixed it', false]);
  assert.deepEqual([oIssue.iTimeSpent, oIssue.iRemainingEstimate, bRemainingSaved], [150, 210, true], 'voided logs never count');
  assert.ok(historyFields().includes('worklog') && historyFields().includes('remainingEstimate'));
  await oService.logWork(await issueOf(1), { iMinutes: 30, sWorkDate: today(), iRemainingEstimate: null });
  assert.equal(rowOf('wd_issues', id(1)).wd_remainingestimate, null, 'an explicit remaining estimate wins');
  rowOf('wd_issues', id(1)).wd_archived = true;
  await assert.rejects(oService.logWork({ ...(await issueOf(1)), bArchived: false }, { iMinutes: 30, sWorkDate: today() }), (oError) => oError.code === 'ISSUE_ARCHIVED', 'checked against the fresh server row');
});

test('work logs: in lowcode mode the plug-ins own Time Spent and work-log history', async () => {
  useLowcode();
  oDb.wd_issues.push(issueRow(1, { wd_remainingestimate: 120 }));
  await oService.logWork(await issueOf(1), { iMinutes: 60, sWorkDate: today() });
  assert.equal(writesTo('wd_issues', 'update').some((oWrite) => 'wd_timespent' in oWrite.oChanges), false);
  assert.equal(historyFields().includes('worklog'), false);
  assert.equal(rowOf('wd_issues', id(1)).wd_remainingestimate, 60, 'the remaining estimate is still adjusted');
});

test('work logs: only the author edits; authors or leads void with a reason; voided logs are locked', async () => {
  oDb.wd_issues.push(issueRow(1));
  oDb.wd_worklogs.push(worklogRow(1, 1, 60, { _createdby_value: PRIYA_ID }), worklogRow(2, 1, 45));
  const oIssue = await issueOf(1);
  const { aWorkLogs } = await oService.listWorkLogs(id(1));
  const oPriyas = aWorkLogs.find((oLog) => oLog.sAuthorId === PRIYA_ID);
  const oMine = aWorkLogs.find((oLog) => oLog.sAuthorId === USER_ID);
  await assert.rejects(oService.updateWorkLog(oIssue, oPriyas, { iMinutes: 30 }), (oError) => oError.code === 'PERMISSION_DENIED');
  const { oWorkLog: oEdited } = await oService.updateWorkLog(oIssue, oMine, { iMinutes: 75 });
  assert.equal(oEdited.iMinutes, 75);
  assert.equal(rowOf('wd_issues', id(1)).wd_timespent, 135);
  await assert.rejects(oService.voidWorkLog(oIssue, oPriyas, ' '), (oError) => oError.code === 'VALIDATION_FAILED');
  setMyRole(CONTRIBUTOR);
  await assert.rejects(oService.voidWorkLog(oIssue, oPriyas, 'Duplicate'), (oError) => oError.code === 'PERMISSION_DENIED');
  setMyRole(LEAD);
  const { oWorkLog: oVoided, oIssue: oAfter } = await oService.voidWorkLog(oIssue, oPriyas, 'Duplicate');
  assert.deepEqual([oVoided.bVoided, oVoided.sVoidReason, oAfter.iTimeSpent], [true, 'Duplicate', 75]);
  await assert.rejects(oService.voidWorkLog(oIssue, oPriyas, 'Again'), (oError) => oError.code === 'WORK_LOG_LOCKED');
  const oHistory = oDb.wd_issuehistories.filter((oRow) => oRow.wd_fieldname === 'worklog').map((oRow) => oRow.wd_newvalue);
  assert.ok(oHistory.some((sValue) => sValue.startsWith('Voided: Duplicate')));
});

// ── Advanced query ─────────────────────────────────────────────

test('query: listIssues sends allowlisted OData with navigation names from metadata and "me" resolved to the caller', async () => {
  oDb.wd_issues.push(issueRow(1, { _wd_assignee_value: USER_ID, wd_timespent: 300 }), issueRow(2, { wd_timespent: 30 }), issueRow(3, { _wd_assignee_value: PRIYA_ID, wd_timespent: 600 }));
  oDb.wd_customfields = [{ wd_customfieldid: id(77), _wd_project_value: PROJECT_ID, wd_name: 'Severity', wd_fieldtype: 100000004, wd_options: 'Major\nMinor', wd_active: true }];
  const oQuery = { sJoin: 'and', aItems: [
    { sField: 'timeSpent', sOp: 'ge', aValues: [60] },
    { sJoin: 'or', aItems: [{ sField: 'assignee', sOp: 'in', aValues: ['me'] }, { sField: 'label', sOp: 'hasAny', aValues: [id(42)] }] },
    { sField: `cf:${id(77)}`, sOp: 'in', aValues: ["Major') or (1 eq 1"] },
  ] };
  const { aIssues } = await oService.listIssues({ oCriteria: { sProjectId: PROJECT_ID, oQuery } });
  const sFilter = aQueries.filter((oQueryItem) => oQueryItem.sSet === 'wd_issues').pop().sFilter;
  assert.match(sFilter, /wd_timespent ge 60/);
  assert.match(sFilter, new RegExp(`_wd_assignee_value eq ${USER_ID}`));
  assert.match(sFilter, /col_wd_issue\/any\(o:o\/_wd_label_value eq /);
  assert.ok(sFilter.includes("o/wd_textvalue eq 'Major'') or (1 eq 1'"), 'text is escaped inside its quotes');
  assert.deepEqual(aIssues.map((oIssue) => oIssue.sKey).sort(), ['PIRA-1', 'PIRA-3'], 'evaluated by the fake (lambdas count as true)');
  await assert.rejects(oService.listIssues({ oCriteria: { oQuery: { sJoin: 'and', aItems: [{ sField: `cf:${id(77)}`, sOp: 'isEmpty', aValues: [] }] } } }), (oError) => oError.code === 'INVALID_QUERY');
});

// ── CSV ────────────────────────────────────────────────────────

test('csv: export uses the same filter as the list and neutralises formulas', async () => {
  oDb.wd_issues.push(issueRow(1, { wd_summary: '=HYPERLINK("http://x")', wd_originalestimate: 480 }), issueRow(2, { wd_archived: true }), { ...issueRow(3), _wd_project_value: OTHER_PROJECT_ID });
  const { sCsv, iCount, bTruncated, sFileName } = await oService.exportIssues(PROJECT, {});
  assert.deepEqual([iCount, bTruncated], [1, false], 'archived and other-project issues are not exported');
  assert.match(sFileName, /^PIRA-issues-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.match(sCsv.split('\r\n')[1], /^PIRA-1,"'=HYPERLINK\(""http:\/\/x""\)",Task,/);
});

test('csv: import re-plans the file, creates rows in order with per-row results, and retries only failed lines', async () => {
  const sCsv = 'Summary,Assignee,Fix version\nFirst,priya@contoso.com,2.0\nBroken,nobody,\nSecond,,\nThird,,Old\n';
  const oPreview = await oService.previewCsvImport(PROJECT, sCsv);
  assert.deepEqual(oPreview.aRows.map((oRow) => oRow.sOutcome), ['create', 'error', 'create', 'error']);
  assert.equal(writesTo('wd_issues').length, 0, 'the preview writes nothing');
  oFaults.fnCreate = (sSet, oRecord) => { if (sSet === 'wd_issues' && oRecord.wd_summary === 'Second') throw new Error('Principal user is missing prvCreatewd_issue privilege (0x80040220)'); };
  const oResult = await oService.importCsvIssues(PROJECT, sCsv);
  assert.deepEqual(oResult.aResults.map((oRow) => [oRow.iLine, oRow.sOutcome]), [[2, 'success'], [4, 'failed']]);
  assert.deepEqual([oResult.iSucceeded, oResult.iFailed, oResult.iSkipped], [1, 1, 2]);
  const oFirst = oDb.wd_issues.find((oRow) => oRow.wd_summary === 'First');
  assert.deepEqual([oFirst._wd_assignee_value, oFirst._wd_fixversion_value], [PRIYA_ID, id(902)]);
  oFaults.fnCreate = null;
  const oRetry = await oService.importCsvIssues(PROJECT, sCsv, { aOnlyLines: [4] });
  assert.deepEqual(oRetry.aResults.map((oRow) => [oRow.iLine, oRow.sOutcome]), [[4, 'success']]);
  assert.equal(oDb.wd_issues.filter((oRow) => oRow.wd_summary === 'First').length, 1, 'the retry never duplicates successful rows');
  setMyRole(STAKEHOLDER);
  await assert.rejects(oService.previewCsvImport(PROJECT, sCsv), (oError) => oError.code === 'PERMISSION_DENIED');
});

// ── Analytics & dependencies ───────────────────────────────────

test('analytics: queries are scoped to the project and window, exclude archived issues, and feed the documented calculations', async () => {
  const sRecent = new Date(Date.now() - 3 * 86400000).toISOString();
  const sCreated = new Date(Date.now() - 7 * 86400000).toISOString();
  oDb.wd_issues.push(
    issueRow(1, { wd_status: DONE, wd_resolvedon: sRecent, createdon: sCreated, wd_startedon: new Date(Date.now() - 5 * 86400000).toISOString(), wd_storypoints: 5 }),
    issueRow(2, { wd_status: DONE, wd_resolvedon: sRecent, createdon: sCreated, wd_archived: true }),
    issueRow(3, { wd_status: DONE, wd_resolvedon: '2020-01-01T00:00:00Z', createdon: '2019-12-01T00:00:00Z' }),
    issueRow(4, { wd_duedate: '2020-01-01', wd_originalestimate: 120, wd_remainingestimate: 60 }),
  );
  const oReport = await oService.getAnalytics(PROJECT, { iWeeks: 4 });
  assert.deepEqual([oReport.oLeadTime.iCount, oReport.oLeadTime.fMedian, oReport.oCycleTime.fMedian], [1, 4, 2]);
  assert.equal(oReport.aThroughput.reduce((iSum, oBucket) => iSum + oBucket.iPoints, 0), 5);
  assert.equal(oReport.aOverdue[oReport.aOverdue.length - 1].iOverdue, 1);
  assert.equal(oReport.oTime.iOpenRemaining, 60);
  const aFilters = aQueries.filter((oItem) => oItem.sSet === 'wd_issues').map((oItem) => oItem.sFilter);
  assert.ok(aFilters.every((sFilter) => sFilter.includes(`_wd_project_value eq ${PROJECT_ID}`) && sFilter.includes('wd_archived eq false')));
  assert.ok(aFilters.some((sFilter) => /wd_resolvedon ge \d{4}-\d{2}-\d{2}T/.test(sFilter)));
  await assert.rejects(oService.getAnalytics(PROJECT, { iWeeks: 5 }), (oError) => oError.code === 'VALIDATION_FAILED');
});

test('dependencies: links are read for the scope, outside blockers become external nodes and "relates to" is optional', async () => {
  oDb.wd_issues.push(issueRow(1), issueRow(2), issueRow(3), issueRow(4, { wd_status: DONE }), { ...issueRow(9), _wd_project_value: OTHER_PROJECT_ID });
  oDb.wd_issuelinks = [
    { wd_issuelinkid: id(51), _wd_fromissue_value: id(1), _wd_toissue_value: id(2), wd_linktype: 100000000 },
    { wd_issuelinkid: id(52), _wd_fromissue_value: id(9), _wd_toissue_value: id(1), wd_linktype: 100000000 },
    { wd_issuelinkid: id(53), _wd_fromissue_value: id(3), _wd_toissue_value: id(2), wd_linktype: 100000001 },
  ];
  const oGraph = await oService.getDependencyGraph(PROJECT, { sScope: 'open' });
  assert.deepEqual(oGraph.aNodes.map((oNode) => `${oNode.sId === id(9) ? 'EXT' : oNode.sId.slice(-1)}:${oNode.iLevel}`).sort(), ['1:1', '2:2', 'EXT:0']);
  assert.equal(oGraph.aNodes.find((oNode) => oNode.sId === id(9)).bExternal, true);
  assert.equal(oGraph.iScopeIssues, 3, 'done issues are outside the "open" scope');
  const oRelated = await oService.getDependencyGraph(PROJECT, { sScope: 'open', bIncludeRelated: true });
  assert.equal(oRelated.aEdges.length, 3);
  await assert.rejects(oService.getDependencyGraph(PROJECT, { sScope: 'sprint', sScopeId: 'nope' }), (oError) => oError.code === 'VALIDATION_FAILED');
});
