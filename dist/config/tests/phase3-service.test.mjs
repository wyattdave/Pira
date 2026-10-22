// Phase 3 service tests for dist/js/data-service.js: workflow enforcement and required fields, workflow saving, saved filters,
// bulk edit with per-record results, attachments, notifications and custom fields. The fake evaluates the real OData filters.
// Run: node --test --experimental-test-module-mocks agent/tests/
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '11111111-1111-4111-8111-999999999999';
const BOARD_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PRIYA_ID = '44444444-4444-4444-8444-444444444444';
const OUTSIDER_ID = '66666666-6666-4666-8666-666666666666';
const AAD_ID = '55555555-5555-4555-8555-555555555555';
const TASK = 100000000, BUG = 100000001;
const TODO = 100000000, PROGRESS = 100000001, REVIEW = 100000002, DONE = 100000003, BLOCKED = 100000005;
const LEAD = 100000000, CONTRIBUTOR = 100000001;
const WONT_DO = 100000001;
const id = (iNumber) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(iNumber).padStart(12, '0')}`;
const tick = () => new Promise((fnResolve) => { setTimeout(fnResolve, 2); });

const TABLE_KEYS = {
  wd_issues: 'wd_issueid', wd_sprints: 'wd_sprintid', wd_issuelinks: 'wd_issuelinkid', wd_boardissues: 'wd_boardissueid', wd_boards: 'wd_boardid',
  wd_boardcolumns: 'wd_boardcolumnid', wd_projectmembers: 'wd_projectmemberid', systemusers: 'systemuserid', wd_issuehistories: 'wd_issuehistoryid',
  wd_projects: 'wd_projectid', wd_issuelabels: 'wd_issuelabelid', wd_labels: 'wd_labelid', wd_projectsequences: 'wd_projectsequenceid',
  wd_workflowtransitions: 'wd_workflowtransitionid', wd_savedfilters: 'wd_savedfilterid', wd_notifications: 'wd_notificationid',
  wd_notificationpreferences: 'wd_notificationpreferenceid', wd_issueattachments: 'wd_issueattachmentid', wd_customfields: 'wd_customfieldid',
  wd_customfieldvalues: 'wd_customfieldvalueid',
};
const oDb = {};
const aWrites = [];
const oFaults = { aCreateSets: [], aUpdateIds: [], oUpload: null, oDownload: null };
const oFiles = new Map();

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

const RELATIONSHIPS = ['wd_project', 'wd_assignee', 'wd_parentissue', 'wd_issue', 'wd_label', 'wd_user', 'wd_lead', 'wd_board', 'wd_sprint', 'wd_fromissue',
  'wd_toissue', 'wd_recipient', 'wd_customfield']
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
  uploadFileToRecord: async (sSet, sId, sColumn, sName, aBytes) => {
    await tick();
    aWrites.push({ sOp: 'upload', sSet, sId, sColumn, sName });
    if (oFaults.oUpload) return oFaults.oUpload;
    oFiles.set(sId, aBytes);
    return { success: true };
  },
  downloadFileFromRecord: async (sSet, sId) => {
    await tick();
    if (oFaults.oDownload) return oFaults.oDownload;
    return oFiles.has(sId) ? { success: true, data: oFiles.get(sId) } : { success: false, error: { message: 'Not found (404)' } };
  },
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
      if (oFaults.aCreateSets.includes(sSet)) throw new Error('Principal user is missing prvCreate privilege (0x80040220)');
      aWrites.push({ sOp: 'create', sSet, oRecord });
      (oDb[sSet] = oDb[sSet] || []).push({ createdon: new Date().toISOString(), _createdby_value: USER_ID, ...applyBinds(oRecord) });
      return {};
    },
    updateItem: async (sSet, sKey, sId, oChanges) => {
      await tick();
      if (oFaults.aUpdateIds.includes(sId)) throw new Error('Principal user is missing prvWritewd_issue privilege (0x80040220)');
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
  wd_issueid: id(iNumber), wd_issuekey: `PIRA-${iNumber}`, wd_summary: `Secret summary ${iNumber}`, _wd_project_value: PROJECT_ID, wd_issuetype: TASK,
  wd_status: TODO, wd_priority: 100000002, wd_rank: '', wd_archived: false, wd_storypoints: null, _wd_sprint_value: null, _wd_assignee_value: null,
  _wd_parentissue_value: null, _createdby_value: PRIYA_ID, wd_resolution: null, createdon: `2026-10-01T00:00:${String(iNumber).padStart(2, '0')}Z`, ...oFields,
});
const transitionRow = (iFrom, iTo, oFields = {}) => ({
  wd_workflowtransitionid: id(5000 + iFrom % 100 * 10 + iTo % 100), _wd_project_value: PROJECT_ID, wd_fromstatus: iFrom, wd_tostatus: iTo, wd_active: true,
  wd_requireresolution: false, wd_requireassignee: false, wd_requirestorypoints: false, wd_requireduedate: false, ...oFields,
});
const memberRow = (iNumber, sUserId, iRole, sName) => ({
  wd_projectmemberid: id(800 + iNumber), _wd_project_value: PROJECT_ID, _wd_user_value: sUserId, wd_projectrole: iRole, wd_membershipstate: 100000000,
  '_wd_user_value@OData.Community.Display.V1.FormattedValue': sName,
});
const issueOf = (iNumber) => oService.getIssue(id(iNumber));
const rowOf = (sSet, sId) => (oDb[sSet] || []).find((oRow) => oRow[TABLE_KEYS[sSet]] === sId);
const writesTo = (sSet, sOp = '') => aWrites.filter((oWrite) => oWrite.sSet === sSet && (!sOp || oWrite.sOp === sOp));

// A custom workflow: To Do → In Progress → Done (needs a resolution), Done → To Do. No To Do → Done.
function useCustomWorkflow() {
  Object.assign(oDb.wd_projects[0], { wd_workflowstatuses: `${TODO},${PROGRESS},${DONE}`, wd_initialstatus: TODO });
  oDb.wd_workflowtransitions = [transitionRow(TODO, PROGRESS), transitionRow(PROGRESS, DONE, { wd_requireresolution: true }), transitionRow(DONE, TODO)];
  oService.invalidateCache('');
}

beforeEach(() => {
  Object.keys(oDb).forEach((sKey) => delete oDb[sKey]);
  aWrites.length = 0;
  Object.assign(oFaults, { aCreateSets: [], aUpdateIds: [], oUpload: null, oDownload: null });
  oFiles.clear();
  oDb.wd_projects = [{ wd_projectid: PROJECT_ID, wd_key: 'PIRA', wd_name: 'Pira', wd_state: 100000000 }, { wd_projectid: OTHER_PROJECT_ID, wd_key: 'OPS', wd_name: 'Ops', wd_state: 100000000 }];
  oDb.wd_boards = [{ wd_boardid: BOARD_ID, wd_name: 'PIRA board', _wd_project_value: PROJECT_ID, wd_isdefault: true, wd_active: true, wd_boardtype: 100000000 }];
  oDb.wd_boardcolumns = [TODO, PROGRESS, REVIEW, DONE].map((iStatus, iIndex) => ({ wd_boardcolumnid: id(700 + iIndex), _wd_board_value: BOARD_ID, wd_name: `Col ${iStatus}`, wd_order: iIndex, wd_status: iStatus, wd_wiplimit: 0 }));
  oDb.wd_projectmembers = [memberRow(1, USER_ID, LEAD, 'Test User'), memberRow(2, PRIYA_ID, CONTRIBUTOR, 'Priya Shah')];
  oDb.systemusers = [{ systemuserid: USER_ID, fullname: 'Test User', internalemailaddress: 'test@contoso.com', azureactivedirectoryobjectid: AAD_ID, isdisabled: false }];
  oDb.wd_issues = [];
  oDb.wd_projectsequences = [{ wd_projectsequenceid: id(600), _wd_project_value: PROJECT_ID, wd_nextnumber: 50 }];
  oService.initialise({ sServerLogic: 'client' });
  oService.invalidateCache('');
});

// ── Workflow enforcement ───────────────────────────────────────

test('workflow: a transition outside the project workflow is rejected before writing, using the fresh server status', async () => {
  useCustomWorkflow();
  oDb.wd_issues.push(issueRow(1));
  const oIssue = await issueOf(1);
  await assert.rejects(oService.transitionIssue(oIssue, DONE), (oError) => oError.code === 'INVALID_TRANSITION');
  // A stale client that thinks the issue is In Progress still can't skip: the service re-reads To Do from the server.
  await assert.rejects(oService.transitionIssue({ ...oIssue, iStatus: PROGRESS }, DONE, null, { iResolution: WONT_DO }), (oError) => oError.code === 'INVALID_TRANSITION');
  await assert.rejects(oService.transitionIssue(oIssue, BLOCKED), (oError) => oError.code === 'INVALID_TRANSITION', 'statuses outside the workflow');
  assert.equal(writesTo('wd_issues', 'update').length, 0);
});

test('workflow: required fields are validated during the transition and saved in the same update', async () => {
  useCustomWorkflow();
  oDb.wd_issues.push(issueRow(1, { wd_status: PROGRESS }));
  const oIssue = await issueOf(1);
  await assert.rejects(oService.transitionIssue(oIssue, DONE), (oError) => oError.code === 'REQUIRED_FIELD_MISSING' && Boolean(oError.details.iResolution));
  assert.equal(writesTo('wd_issues', 'update').length, 0, 'nothing is written without the resolution');
  const { oIssue: oDone } = await oService.transitionIssue(oIssue, DONE, null, { iResolution: WONT_DO });
  const aUpdates = writesTo('wd_issues', 'update');
  assert.equal(aUpdates.length, 1, 'status and resolution are one update');
  assert.deepEqual([aUpdates[0].oChanges.wd_status, aUpdates[0].oChanges.wd_resolution], [DONE, WONT_DO]);
  assert.equal(oDone.iResolution, WONT_DO);
  await oService.transitionIssue(oDone, TODO);
  assert.equal(rowOf('wd_issues', id(1)).wd_resolution, null, 'reopening clears the resolution');
  assert.deepEqual(oDb.wd_issuehistories.filter((oRow) => oRow.wd_fieldname === 'resolution').map((oRow) => oRow.wd_newvalue), ['Won\'t Do', 'None']);
});

test('workflow: new issues start in the project\'s initial status', async () => {
  Object.assign(oDb.wd_projects[0], { wd_workflowstatuses: `${100000004},${TODO},${DONE}`, wd_initialstatus: 100000004 });
  oDb.wd_workflowtransitions = [transitionRow(100000004, TODO), transitionRow(TODO, DONE)];
  const { oIssue } = await oService.createIssue({ sId: PROJECT_ID, sKey: 'PIRA', bArchived: false }, { sSummary: 'New', iType: TASK, iPriority: 100000002, aLabels: [] });
  assert.equal(oIssue.iStatus, 100000004);
});

test('workflow: only leads save; statuses still in use can\'t be removed; transitions are written before the status list', async () => {
  oDb.wd_issues.push(issueRow(1, { wd_status: REVIEW }));
  const oProject = await oService.getProject(PROJECT_ID);
  const oWorkflow = { aStatuses: [TODO, PROGRESS, DONE, BLOCKED], iInitialStatus: TODO, aTransitions: [
    { iFrom: TODO, iTo: PROGRESS, aRequired: [] }, { iFrom: PROGRESS, iTo: BLOCKED, aRequired: [] }, { iFrom: BLOCKED, iTo: PROGRESS, aRequired: [] },
    { iFrom: PROGRESS, iTo: DONE, aRequired: ['resolution'] }, { iFrom: DONE, iTo: TODO, aRequired: [] }] };
  await assert.rejects(oService.saveWorkflow(oProject, oWorkflow), (oError) => oError.code === 'STATUS_IN_USE' && /In Review/.test(oError.message));
  rowOf('wd_issues', id(1)).wd_status = TODO;
  oDb.wd_projectmembers[0].wd_projectrole = CONTRIBUTOR;
  oService.invalidateCache('');
  await assert.rejects(oService.saveWorkflow(oProject, oWorkflow), (oError) => oError.code === 'PERMISSION_DENIED');
  oDb.wd_projectmembers[0].wd_projectrole = LEAD;
  oService.invalidateCache('');
  await assert.rejects(oService.saveWorkflow(oProject, { ...oWorkflow, iInitialStatus: DONE }), (oError) => oError.code === 'INVALID_WORKFLOW');
  assert.equal(aWrites.length, 0, 'invalid or unauthorised saves write nothing');
  const { oWorkflow: oSaved } = await oService.saveWorkflow(oProject, oWorkflow);
  assert.equal(oSaved.bCustom, true);
  const iLastTransition = aWrites.map((oWrite) => oWrite.sSet).lastIndexOf('wd_workflowtransitions');
  const iProjectWrite = aWrites.findIndex((oWrite) => oWrite.sSet === 'wd_projects');
  assert.ok(iLastTransition < iProjectWrite, 'the plug-in switches to the new rules only once they exist');
  assert.equal(oDb.wd_workflowtransitions.find((oRow) => oRow.wd_tostatus === DONE).wd_requireresolution, true);
  const aColumns = oDb.wd_boardcolumns.filter((oRow) => [TODO, PROGRESS, DONE, BLOCKED].includes(oRow.wd_status)).sort((oA, oB) => oA.wd_order - oB.wd_order);
  assert.deepEqual(aColumns.map((oRow) => oRow.wd_status), [TODO, PROGRESS, DONE, BLOCKED], 'a Blocked column is added and columns follow the workflow order');
  // Dropping a transition deactivates it (no Delete privilege needed) and the default board hides unused columns.
  await oService.saveWorkflow(oProject, { ...oWorkflow, aTransitions: oWorkflow.aTransitions.slice(0, 4) });
  assert.equal(oDb.wd_workflowtransitions.find((oRow) => oRow.wd_fromstatus === DONE).wd_active, false);
  assert.equal(aWrites.filter((oWrite) => oWrite.sOp === 'delete').length, 0);
  const oBoard = await oService.getBoard(oProject);
  assert.deepEqual(oBoard.aColumns.map((oColumn) => oColumn.iStatus), [TODO, PROGRESS, DONE, BLOCKED]);
});

test('templates: applying Bug tracking saves its workflow and adds its missing custom fields once', async () => {
  const oProject = await oService.getProject(PROJECT_ID);
  const { iFieldsAdded } = await oService.applyProjectTemplate(oProject, 'bugs');
  assert.equal(iFieldsAdded, 3);
  assert.equal(rowOf('wd_projects', PROJECT_ID).wd_workflowtemplate, 'bugs');
  assert.equal(oDb.wd_workflowtransitions.length, 13);
  const { iFieldsAdded: iAgain } = await oService.applyProjectTemplate(await oService.getProject(PROJECT_ID), 'bugs');
  assert.equal(iAgain, 0, 're-applying never duplicates fields');
});

// ── Saved filters ──────────────────────────────────────────────

test('saved filters: criteria only, own or shared, and only the owner can change or delete', async () => {
  const oProject = await oService.getProject(PROJECT_ID);
  const oMine = await oService.createSavedFilter(oProject, { sName: 'Mine', iVisibility: 100000000, oCriteria: { aAssigneeIds: ['me'], sSummary: 'leak?', aStatuses: [TODO] } });
  assert.deepEqual(JSON.parse(rowOf('wd_savedfilters', oMine.sId).wd_criteria), { aStatuses: [TODO], aAssigneeIds: ['me'] }, 'unknown keys never reach Dataverse');
  oDb.wd_savedfilters.push(
    { wd_savedfilterid: id(901), wd_name: 'Priya shared', _wd_project_value: PROJECT_ID, wd_criteria: '{"bOpenOnly":true}', wd_visibility: 100000001, _createdby_value: PRIYA_ID },
    { wd_savedfilterid: id(902), wd_name: 'Priya private', _wd_project_value: PROJECT_ID, wd_criteria: '{}', wd_visibility: 100000000, _createdby_value: PRIYA_ID },
    { wd_savedfilterid: id(903), wd_name: 'Other project', _wd_project_value: OTHER_PROJECT_ID, wd_criteria: '{}', wd_visibility: 100000001, _createdby_value: PRIYA_ID },
  );
  oService.invalidateCache('');
  const aFilters = await oService.listSavedFilters(PROJECT_ID);
  assert.deepEqual(aFilters.map((oFilter) => oFilter.sName).sort(), ['Mine', 'Priya shared']);
  const oShared = aFilters.find((oFilter) => !oFilter.bMine);
  await assert.rejects(oService.updateSavedFilter(oShared, { sName: 'Hijacked' }), (oError) => oError.code === 'PERMISSION_DENIED');
  await assert.rejects(oService.deleteSavedFilter(oShared), (oError) => oError.code === 'PERMISSION_DENIED');
  await oService.updateSavedFilter(oMine, { iVisibility: 100000001 });
  await oService.deleteSavedFilter(oMine);
  assert.equal(rowOf('wd_savedfilters', oMine.sId), undefined);
});

// ── Bulk edit ──────────────────────────────────────────────────

test('bulk edit: each issue is validated on its own; unauthorised records fail and the rest succeed', async () => {
  oDb.wd_issues.push(issueRow(1, { _wd_assignee_value: PRIYA_ID }), issueRow(2), issueRow(3, { wd_priority: 100000004 }), issueRow(4, { wd_archived: true }),
    issueRow(5, { _wd_project_value: OTHER_PROJECT_ID }));
  oFaults.aUpdateIds = [id(2)];
  const oProject = await oService.getProject(PROJECT_ID);
  const aIds = [1, 2, 3, 4, 5].map(id);
  const oPreview = await oService.previewBulkEdit(oProject, aIds, { sField: 'priority', value: 100000004 });
  assert.deepEqual([oPreview.iChange, oPreview.iSkip, oPreview.iBlocked], [2, 1, 2]);
  assert.equal(writesTo('wd_issues', 'update').length, 0, 'the preview writes nothing');
  const oResult = await oService.applyBulkEdit(oProject, aIds, { sField: 'priority', value: 100000004 });
  const oByKey = Object.fromEntries(oResult.aResults.map((oRow) => [oRow.sIssueId, oRow.sOutcome]));
  assert.deepEqual([oByKey[id(1)], oByKey[id(2)], oByKey[id(3)], oByKey[id(4)], oByKey[id(5)]], ['success', 'failed', 'skipped', 'failed', 'failed']);
  assert.match(oResult.aResults.find((oRow) => oRow.sIssueId === id(2)).sReason, /permission/i);
  assert.equal(rowOf('wd_issues', id(1)).wd_priority, 100000004);
  assert.equal(rowOf('wd_issues', id(5)).wd_priority, 100000002, 'an issue from another project is never touched');
  assert.deepEqual([oResult.iSucceeded, oResult.iFailed, oResult.iSkipped], [1, 3, 1]);
  // One summary per person, never to the actor, with no issue lookup or summary.
  const aNotes = oDb.wd_notifications || [];
  assert.deepEqual(aNotes.map((oRow) => [oRow._wd_recipient_value, oRow.wd_eventtype, oRow._wd_issue_value ?? null]), [[PRIYA_ID, 100000004, null]]);
  assert.ok(!/Secret summary/.test(JSON.stringify(aNotes)));
  // Retry only the failed one once the fault clears.
  oFaults.aUpdateIds = [];
  const oRetry = await oService.applyBulkEdit(oProject, [id(2)], { sField: 'priority', value: 100000004 });
  assert.equal(oRetry.iSucceeded, 1);
});

test('bulk edit: status changes follow the workflow and its required fields; stakeholders can\'t bulk edit', async () => {
  useCustomWorkflow();
  oDb.wd_issues.push(issueRow(1, { wd_status: PROGRESS }), issueRow(2, { wd_status: TODO }));
  const oProject = await oService.getProject(PROJECT_ID);
  const oNoResolution = await oService.previewBulkEdit(oProject, [id(1), id(2)], { sField: 'status', value: DONE });
  assert.deepEqual(oNoResolution.aRows.map((oRow) => oRow.sOutcome), ['blocked', 'blocked']);
  const oResult = await oService.applyBulkEdit(oProject, [id(1), id(2)], { sField: 'status', value: DONE, iResolution: WONT_DO });
  assert.deepEqual(oResult.aResults.map((oRow) => oRow.sOutcome), ['success', 'failed'], 'To Do → Done is not in the workflow');
  assert.equal(rowOf('wd_issues', id(1)).wd_resolution, WONT_DO);
  oDb.wd_projectmembers[0].wd_projectrole = 100000002;
  oService.invalidateCache('');
  await assert.rejects(oService.applyBulkEdit(oProject, [id(2)], { sField: 'priority', value: 100000004 }), (oError) => oError.code === 'PERMISSION_DENIED');
  oDb.wd_projectmembers[0].wd_projectrole = LEAD;
  oService.invalidateCache('');
  await assert.rejects(oService.applyBulkEdit(oProject, Array.from({ length: 51 }, (oItem, iIndex) => id(iIndex + 1)), { sField: 'priority', value: 100000004 }), /up to 50/);
});

// ── Notifications ──────────────────────────────────────────────

test('notifications: a delivery failure never undoes the save; actors and non-members are never notified', async () => {
  oDb.wd_issues.push(issueRow(1));
  const oIssue = await issueOf(1);
  oFaults.aCreateSets = ['wd_notifications'];
  const fnWarn = console.warn;
  console.warn = () => {};
  try {
    const { oIssue: oSaved } = await oService.updateIssue(oIssue, { sAssigneeId: PRIYA_ID, sAssigneeName: 'Priya' });
    assert.equal(oSaved.sAssigneeId, PRIYA_ID, 'the assignment is saved even though the notification failed');
  } finally {
    console.warn = fnWarn;
  }
  oFaults.aCreateSets = [];
  await oService.updateIssue(await issueOf(1), { sAssigneeId: USER_ID, sAssigneeName: 'Test User' });
  await oService.updateIssue(await issueOf(1), { sAssigneeId: OUTSIDER_ID, sAssigneeName: 'Outsider' });
  assert.equal((oDb.wd_notifications || []).length, 0, 'self-assignment and non-members produce nothing');
  await oService.addComment(await issueOf(1), 'Ping @Test User and @Priya Shah please');
  const aNotes = oDb.wd_notifications || [];
  assert.deepEqual(aNotes.map((oRow) => [oRow._wd_recipient_value, oRow.wd_eventtype]), [[PRIYA_ID, 100000001]], 'Priya (mentioned reporter) gets one mention; the author gets nothing');
  assert.ok(!JSON.stringify(aNotes).includes('Secret summary') && !JSON.stringify(aNotes).includes('Ping'), 'no summary or comment text is copied');
});

test('notifications: list and count use the recipient and preferences; marking read touches only the given rows', async () => {
  oDb.wd_notifications = [
    { wd_notificationid: id(1), _wd_recipient_value: USER_ID, wd_eventtype: 100000000, wd_isread: false, createdon: '2026-10-01T00:00:01Z' },
    { wd_notificationid: id(2), _wd_recipient_value: USER_ID, wd_eventtype: 100000003, wd_isread: false, createdon: '2026-10-01T00:00:02Z' },
    { wd_notificationid: id(3), _wd_recipient_value: PRIYA_ID, wd_eventtype: 100000000, wd_isread: false, createdon: '2026-10-01T00:00:03Z' },
  ];
  assert.equal(await oService.countUnreadNotifications(), 2);
  await oService.saveNotificationPreferences({ bComments: false });
  assert.equal(rowOf('wd_notificationpreferences', oDb.wd_notificationpreferences[0].wd_notificationpreferenceid)._wd_user_value, USER_ID);
  assert.deepEqual((await oService.listNotifications()).aNotifications.map((oItem) => oItem.sId), [id(1)]);
  await oService.markAllNotificationsRead();
  assert.deepEqual(oDb.wd_notifications.map((oRow) => oRow.wd_isread), [true, true, false], 'only the signed-in user\'s rows');
});

// ── Attachments ────────────────────────────────────────────────

const file = (sName, sText, sType = 'text/plain') => ({ name: sName, size: new TextEncoder().encode(sText).byteLength, type: sType, arrayBuffer: async () => new TextEncoder().encode(sText).buffer });

test('attachments: metadata then file upload; blocked types and failed uploads leave nothing behind', async () => {
  oDb.wd_issues.push(issueRow(1));
  const oIssue = await issueOf(1);
  await assert.rejects(oService.uploadAttachment(oIssue, file('tool.exe', 'MZ')), (oError) => oError.code === 'ATTACHMENT_REJECTED');
  assert.equal(aWrites.length, 0);
  oFaults.oUpload = { success: false, error: { message: 'File too large' } };
  await assert.rejects(oService.uploadAttachment(oIssue, file('notes.txt', 'hello')), /File too large/);
  assert.deepEqual(oDb.wd_issueattachments, [], 'the metadata row is removed when the upload fails');
  assert.deepEqual(writesTo('wd_issueattachments').map((oWrite) => oWrite.sOp), ['create', 'upload', 'delete']);
  oFaults.oUpload = null;
  aWrites.length = 0;
  const { oAttachment } = await oService.uploadAttachment(oIssue, file('C:\\fakepath\\notes.txt', 'hello'));
  assert.equal(oAttachment.sName, 'notes.txt');
  assert.deepEqual(writesTo('wd_issueattachments').map((oWrite) => oWrite.sOp), ['create', 'upload']);
  const { aBytes, sName } = await oService.downloadAttachment(oAttachment);
  assert.deepEqual([new TextDecoder().decode(aBytes), sName], ['hello', 'notes.txt']);
  await assert.rejects(oService.uploadAttachment({ ...oIssue, bArchived: true }, file('a.txt', 'x')), (oError) => oError.code === 'ISSUE_ARCHIVED');
});

test('attachments: downloads go through Dataverse access; only the uploader deletes', async () => {
  oDb.wd_issues.push(issueRow(1));
  const oIssue = await issueOf(1);
  oFaults.oDownload = { success: false, error: { message: 'Principal user is missing prvReadwd_issueattachment privilege (0x80040220)' } };
  await assert.rejects(oService.downloadAttachment({ sId: id(70), sName: 'x.txt' }), (oError) => oError.code === 'PERMISSION_DENIED');
  oFaults.oDownload = null;
  await assert.rejects(oService.downloadAttachment({ sId: id(71), sName: 'x.txt' }), (oError) => oError.code === 'ATTACHMENT_NOT_FOUND');
  await assert.rejects(oService.deleteAttachment(oIssue, { sId: id(72), sName: 'theirs.txt', sUploaderId: PRIYA_ID }), (oError) => oError.code === 'PERMISSION_DENIED');
  assert.equal(aWrites.filter((oWrite) => oWrite.sOp === 'delete').length, 0);
});

// ── Custom fields ──────────────────────────────────────────────

test('custom fields: type and value mismatches are rejected; only the type\'s column is written', async () => {
  oDb.wd_issues.push(issueRow(1, { wd_issuetype: BUG }), issueRow(2, { wd_issuetype: TASK }));
  const oProject = await oService.getProject(PROJECT_ID);
  const oPoints = await oService.createCustomField(oProject, { sName: 'Estimate', iType: 100000001, aIssueTypes: [] });
  const oSeverity = await oService.createCustomField(oProject, { sName: 'Severity', iType: 100000004, sOptions: 'Major\nMinor', aIssueTypes: [BUG] });
  await assert.rejects(oService.createCustomField(oProject, { sName: 'severity', iType: 100000000 }), (oError) => Boolean(oError.details && oError.details.sName));
  await assert.rejects(oService.createCustomField(oProject, { sName: 'Formula', iType: 100000009 }), (oError) => oError.code === 'VALIDATION_FAILED');
  const iBefore = aWrites.length;
  await assert.rejects(oService.updateIssue(await issueOf(1), { oCustomValues: { [oPoints.sId]: 'twelve' } }), (oError) => oError.code === 'INVALID_CUSTOM_FIELD_VALUE');
  await assert.rejects(oService.updateIssue(await issueOf(1), { oCustomValues: { [oSeverity.sId]: 'Critical' } }), (oError) => oError.code === 'INVALID_CUSTOM_FIELD_VALUE');
  await assert.rejects(oService.updateIssue(await issueOf(2), { oCustomValues: { [oSeverity.sId]: 'Major' } }), /isn't used for Task/);
  assert.equal(aWrites.length, iBefore, 'rejected values write nothing');
  await oService.updateIssue(await issueOf(1), { oCustomValues: { [oPoints.sId]: '12.5', [oSeverity.sId]: 'Major' } });
  const oValueRow = oDb.wd_customfieldvalues.find((oRow) => oRow._wd_customfield_value === oPoints.sId);
  assert.deepEqual([oValueRow.wd_numbervalue, oValueRow.wd_textvalue, oValueRow.wd_datevalue, oValueRow.wd_booleanvalue], [12.5, null, null, null]);
  const { oValues } = await oService.getIssueCustomFields(await issueOf(1));
  assert.deepEqual([oValues[oPoints.sId], oValues[oSeverity.sId]], [12.5, 'Major']);
  await oService.updateIssue(await issueOf(1), { oCustomValues: { [oPoints.sId]: '' } });
  assert.equal(oValueRow.wd_numbervalue, null, 'blank clears the value on the same row');
  assert.ok(oDb.wd_issuehistories.some((oRow) => oRow.wd_fieldname === 'cf:Severity' && oRow.wd_newvalue === 'Major'));
  oDb.wd_projectmembers[0].wd_projectrole = CONTRIBUTOR;
  oService.invalidateCache('');
  await assert.rejects(oService.createCustomField(oProject, { sName: 'Team', iType: 100000000 }), (oError) => oError.code === 'PERMISSION_DENIED');
});
