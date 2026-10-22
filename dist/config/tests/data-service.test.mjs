// Service-level tests for dist/js/data-service.js against an in-memory fake of codeapp.js / power-apps-data.js.
// Run: node --test --experimental-test-module-mocks agent/tests/
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SEQUENCE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';
const AAD_ID = '55555555-5555-4555-8555-555555555555';
const TODO = 100000000, PROGRESS = 100000001, DONE = 100000003;

const oStore = { sequences: [], issues: [], history: [], members: [], projects: [], writes: [], bPluginInstalled: false };
const tick = () => new Promise((fnResolve) => { setTimeout(fnResolve, 5); });

function resetStore() {
  oStore.sequences = [{ wd_projectsequenceid: SEQUENCE_ID, _wd_project_value: PROJECT_ID, wd_nextnumber: 1 }];
  oStore.issues = [];
  oStore.history = [];
  oStore.members = [{ wd_projectmemberid: 'm1', _wd_project_value: PROJECT_ID, _wd_user_value: USER_ID, wd_projectrole: 100000000, wd_membershipstate: 100000000 }];
  oStore.projects = [{ wd_projectid: PROJECT_ID, wd_key: 'PIRA', wd_name: 'Pira', wd_state: 100000000 }];
  oStore.writes = [];
  oStore.bPluginInstalled = false;
}

// Emulates the "Issue · Before/After create" low-code plug-ins: server-side key allocation and a Created history row.
function runCreatePlugin(oRecord) {
  const oSequence = oStore.sequences[0];
  const iNumber = oSequence.wd_nextnumber;
  oSequence.wd_nextnumber = iNumber + 1;
  oRecord.wd_issuekey = `PIRA-${iNumber}`;
  oRecord.wd_issuesequence = iNumber;
  oStore.history.push({ wd_eventtype: 100000000, wd_operationname: 'CreateIssue', bServer: true });
}

const RELATIONSHIPS = ['wd_project', 'wd_assignee', 'wd_parentissue', 'wd_issue', 'wd_label', 'wd_user', 'wd_lead', 'wd_board']
  .map((sAttribute) => ({ ReferencingAttribute: sAttribute, ReferencingEntityNavigationPropertyName: `nav_${sAttribute}`, ReferencedEntityNavigationPropertyName: `col_${sAttribute}` }));

function rowsFor(sSet, sFilter = '') {
  switch (sSet) {
    case 'systemusers': return [{ systemuserid: USER_ID, fullname: 'Test User', internalemailaddress: 'test@contoso.com' }];
    case 'wd_projectsequences': return oStore.sequences.map((oRow) => ({ ...oRow }));
    case 'wd_projectmembers': return oStore.members.filter((oRow) => oRow.wd_membershipstate === 100000000 || sFilter.includes('_wd_user_value eq')).map((oRow) => ({ ...oRow }));
    case 'wd_projects': {
      const aMatch = /wd_key eq '([^']+)'/.exec(sFilter);
      return oStore.projects.filter((oRow) => !aMatch || oRow.wd_key === aMatch[1]).map((oRow) => ({ ...oRow }));
    }
    case 'wd_issues': {
      const aKey = /wd_issuekey eq '([^']+)'/.exec(sFilter);
      if (aKey) return oStore.issues.filter((oRow) => oRow.wd_issuekey === aKey[1]).map((oRow) => ({ ...oRow }));
      if (sFilter.includes('wd_rank ne null')) return [];
      return oStore.issues.filter((oRow) => !sFilter.includes('_wd_project_value eq') || oRow.projectId === PROJECT_ID).map((oRow) => ({ ...oRow }));
    }
    default: return [];
  }
}

const fakeClient = {
  retrieveMultipleRecordsAsync: async (sSet, oOptions) => {
    await tick();
    const aRows = rowsFor(sSet, oOptions.filter || '');
    return { success: true, data: oOptions.top ? aRows.slice(0, oOptions.top) : aRows, count: aRows.length };
  },
  executeAsync: async () => ({ success: true, data: { ManyToOneRelationships: RELATIONSHIPS } }),
};

mock.module(new URL('../../dist/power-apps-data.js', import.meta.url).href, {
  namedExports: { getClient: () => fakeClient, getContext: async () => ({ user: { objectId: AAD_ID } }) },
});
mock.module(new URL('../../dist/codeapp.js', import.meta.url).href, {
  namedExports: {
    initDataSources: () => {},
    unwrapResult: (oResult) => { if (oResult && oResult.success === false) throw new Error('failed'); return oResult && 'data' in oResult ? oResult.data : oResult; },
    createItem: async (sSet, sKey, oRecord) => {
      await tick();
      oStore.writes.push({ sOp: 'create', sSet, oRecord });
      if (sSet === 'wd_issues') {
        oRecord = { ...oRecord };
        if (!oRecord.wd_issuekey && oStore.bPluginInstalled) runCreatePlugin(oRecord);
        if (oRecord.wd_issuekey && oStore.issues.some((oRow) => oRow.wd_issuekey === oRecord.wd_issuekey)) throw new Error('A record with matching key values already exists. (0x80060892)');
        oStore.issues.push({ ...oRecord, projectId: PROJECT_ID, _wd_project_value: PROJECT_ID, _createdby_value: USER_ID, createdon: new Date().toISOString(), modifiedon: new Date().toISOString() });
      }
      if (sSet === 'wd_issuehistories') oStore.history.push(oRecord);
      return {};
    },
    updateItem: async (sSet, sKey, sId, oChanges) => {
      await tick();
      oStore.writes.push({ sOp: 'update', sSet, sId, oChanges });
      const aTable = { wd_projectsequences: oStore.sequences, wd_issues: oStore.issues, wd_projectmembers: oStore.members }[sSet] || [];
      const oRow = aTable.find((oItem) => oItem[sKey] === sId);
      if (oRow) Object.assign(oRow, oChanges);
      return {};
    },
    getItem: async (sSet, sKey, sId) => {
      await tick();
      const oRow = (sSet === 'wd_issues' ? oStore.issues : sSet === 'wd_projects' ? oStore.projects : []).find((oItem) => oItem[sKey] === sId);
      return oRow ? { ...oRow } : null;
    },
    deleteItem: async () => ({}),
  },
});

const oService = await import('../../dist/js/data-service.js');
const oProject = { sId: PROJECT_ID, sKey: 'PIRA', sName: 'Pira', bArchived: false };
const oDraft = (sSummary) => ({ sSummary, iType: 100000000, iPriority: 100000002, sDescription: '', aLabels: [] });
const clientHistoryWrites = () => oStore.writes.filter((oWrite) => oWrite.sOp === 'create' && oWrite.sSet === 'wd_issuehistories');

// Tests default to the client fallback; the low-code plug-in mode is exercised explicitly at the end.
beforeEach(() => {
  resetStore();
  oService.initialise({ sServerLogic: 'client' });
  oService.invalidateCache('');
});

test('createIssue allocates sequential keys and records a Created history event', async () => {
  const { oIssue: oFirst } = await oService.createIssue(oProject, oDraft('First'));
  const { oIssue: oSecond } = await oService.createIssue(oProject, oDraft('Second'));
  assert.equal(oFirst.sKey, 'PIRA-1');
  assert.equal(oSecond.sKey, 'PIRA-2');
  assert.equal(oStore.sequences[0].wd_nextnumber, 3);
  assert.equal(oStore.history.filter((oRow) => oRow.wd_eventtype === 100000000).length, 2);
  const oCreate = oStore.writes.find((oWrite) => oWrite.sOp === 'create' && oWrite.sSet === 'wd_issues').oRecord;
  assert.equal(oCreate.wd_status, TODO, 'new issues start in the initial status');
  assert.ok(!Object.keys(oCreate).some((sField) => sField.includes('reporter') || sField.includes('createdby')), 'reporter is never client-supplied');
  assert.equal(oCreate['nav_wd_project@odata.bind'], `/wd_projects(${PROJECT_ID})`);
});

test('two concurrent creations in one project never receive the same key', async () => {
  const aResults = await Promise.all([
    oService.createIssue(oProject, oDraft('Concurrent A')),
    oService.createIssue(oProject, oDraft('Concurrent B')),
    oService.createIssue(oProject, oDraft('Concurrent C')),
  ]);
  const aKeys = aResults.map((oResult) => oResult.oIssue.sKey);
  assert.equal(new Set(aKeys).size, 3, `keys must be unique: ${aKeys.join(', ')}`);
  assert.equal(new Set(oStore.issues.map((oRow) => oRow.wd_issuekey)).size, oStore.issues.length);
});

test('allocation skips numbers already used by existing issues', async () => {
  oStore.issues.push({ wd_issueid: 'x', wd_issuekey: 'PIRA-1', projectId: PROJECT_ID });
  const { oIssue } = await oService.createIssue(oProject, oDraft('After existing'));
  assert.equal(oIssue.sKey, 'PIRA-2');
});

test('issue keys stay unchanged after edits', async () => {
  const { oIssue } = await oService.createIssue(oProject, oDraft('Editable'));
  const { oIssue: oEdited } = await oService.updateIssue(oIssue, { sSummary: 'Edited summary', iPriority: 100000004 });
  assert.equal(oEdited.sKey, oIssue.sKey);
  const aUpdates = oStore.writes.filter((oWrite) => oWrite.sOp === 'update' && oWrite.sSet === 'wd_issues');
  assert.ok(aUpdates.every((oWrite) => !('wd_issuekey' in oWrite.oChanges)), 'updates never write the key');
  const aFields = oStore.history.filter((oRow) => oRow.wd_eventtype === 100000001).map((oRow) => oRow.wd_fieldname).sort();
  assert.deepEqual(aFields, ['priority', 'summary']);
});

test('status change validates against the fresh server status and writes history', async () => {
  const { oIssue } = await oService.createIssue(oProject, oDraft('Workflow'));
  const { oIssue: oMoved } = await oService.transitionIssue(oIssue, PROGRESS);
  assert.equal(oMoved.iStatus, PROGRESS);
  const oEvent = oStore.history.find((oRow) => oRow.wd_eventtype === 100000003);
  assert.deepEqual([oEvent.wd_fieldname, oEvent.wd_oldvalue, oEvent.wd_newvalue], ['status', 'To Do', 'In Progress']);
  await oService.transitionIssue({ ...oIssue, iStatus: TODO }, DONE);
  const oRow = oStore.issues.find((oItem) => oItem.wd_issueid === oIssue.sId);
  assert.equal(oRow.wd_status, DONE);
  assert.ok(oRow.wd_resolvedon, 'resolved date stamped when moving to Done');
  await assert.rejects(oService.transitionIssue(oIssue, 123), (oError) => oError.code === 'INVALID_TRANSITION');
});

test('validation and parent rules are enforced before writing', async () => {
  await assert.rejects(oService.createIssue(oProject, oDraft('   ')), (oError) => oError.code === 'VALIDATION_FAILED' && Boolean(oError.details.sSummary));
  await assert.rejects(oService.createIssue({ ...oProject, bArchived: true }, oDraft('Archived')), (oError) => oError.code === 'PROJECT_ARCHIVED');
  const { oIssue } = await oService.createIssue(oProject, oDraft('Self parent'));
  await assert.rejects(oService.updateIssue(oIssue, { sParentId: oIssue.sId }), (oError) => oError.code === 'INVALID_PARENT_RELATIONSHIP');
  assert.equal(oStore.writes.filter((oWrite) => oWrite.sSet === 'wd_issues' && oWrite.sOp === 'update').length, 0);
});

test('project key is immutable once issues exist', async () => {
  await oService.createIssue(oProject, oDraft('Locks the key'));
  await assert.rejects(oService.updateProject({ ...oProject, sDescription: '', iType: 100000000, sLeadId: USER_ID }, { sKey: 'NEWK' }),
    (oError) => oError.code === 'PROJECT_KEY_LOCKED');
});

test('membership: nobody edits their own row, and the last lead cannot be demoted or removed', async () => {
  const [oSelf] = await oService.listMembers(PROJECT_ID);
  await assert.rejects(oService.updateMemberRole(oProject, oSelf, 100000001), (oError) => oError.code === 'PERMISSION_DENIED' && /your own membership/.test(oError.message));
  await assert.rejects(oService.removeMember(oProject, oSelf), (oError) => oError.code === 'PERMISSION_DENIED');
  // The signed-in user is a contributor; someone else is the only lead.
  oStore.members[0].wd_projectrole = 100000001;
  oStore.members.push({ wd_projectmemberid: 'm2', _wd_project_value: PROJECT_ID, _wd_user_value: OTHER_USER_ID, wd_projectrole: 100000000, wd_membershipstate: 100000000 });
  oService.invalidateCache('');
  const oOnlyLead = (await oService.listMembers(PROJECT_ID)).find((oMember) => oMember.sUserId === OTHER_USER_ID);
  await assert.rejects(oService.updateMemberRole(oProject, oOnlyLead, 100000001), /at least one lead/);
  await assert.rejects(oService.removeMember(oProject, oOnlyLead), /at least one lead/);
  oStore.members.push({ wd_projectmemberid: 'm3', _wd_project_value: PROJECT_ID, _wd_user_value: '66666666-6666-4666-8666-666666666666', wd_projectrole: 100000000, wd_membershipstate: 100000000 });
  oService.invalidateCache('');
  await oService.removeMember(oProject, oOnlyLead);
  const oRow = oStore.members.find((oMember) => oMember.wd_projectmemberid === 'm2');
  assert.equal(oRow.wd_membershipstate, 100000001, 'removal deactivates rather than deletes');
  assert.ok(oRow.wd_removedon);
});

test('only the author can edit a comment (permission denied otherwise)', async () => {
  await assert.rejects(oService.updateComment({ sId: 'c1', sAuthorId: OTHER_USER_ID, sBody: 'theirs' }, 'mine now'), (oError) => oError.code === 'PERMISSION_DENIED');
});

// ── Low-code plug-in mode ──────────────────────────────────────

test('lowcode mode: the server allocates the key and the client writes no issue history', async () => {
  oService.initialise({ sServerLogic: 'lowcode' });
  oStore.bPluginInstalled = true;
  const { oIssue } = await oService.createIssue(oProject, oDraft('Server numbered'));
  assert.equal(oIssue.sKey, 'PIRA-1');
  const oCreate = oStore.writes.find((oWrite) => oWrite.sOp === 'create' && oWrite.sSet === 'wd_issues').oRecord;
  assert.ok(!('wd_issuekey' in oCreate) && !('wd_issuesequence' in oCreate), 'client never sends the key in lowcode mode');
  assert.equal(oStore.writes.filter((oWrite) => oWrite.sSet === 'wd_projectsequences').length, 0, 'client does not touch the sequence');
  await oService.transitionIssue(oIssue, PROGRESS);
  const oStatusWrite = oStore.writes.find((oWrite) => oWrite.sOp === 'update' && oWrite.sSet === 'wd_issues').oChanges;
  assert.deepEqual(Object.keys(oStatusWrite), ['wd_status'], 'Resolved On is stamped by the plug-in, not the client');
  await oService.updateIssue(oIssue, { sSummary: 'Renamed' });
  await oService.archiveIssue(oIssue);
  assert.equal(clientHistoryWrites().length, 0, 'created/field/transition/archive history comes from the plug-ins');
  assert.equal(oStore.history.filter((oRow) => oRow.bServer).length, 1);
});

test('lowcode mode: label changes are still recorded by the client', async () => {
  oService.initialise({ sServerLogic: 'lowcode' });
  oStore.bPluginInstalled = true;
  const { oIssue } = await oService.createIssue(oProject, oDraft('Labelled'));
  await oService.updateIssue(oIssue, { aLabels: ['qa'] });
  assert.deepEqual(clientHistoryWrites().map((oWrite) => oWrite.oRecord.wd_fieldname), ['labels']);
});

test('lowcode mode: a missing plug-in is reported and the unnumbered issue is hidden', async () => {
  oService.initialise({ sServerLogic: 'lowcode' });
  await assert.rejects(oService.createIssue(oProject, oDraft('No plug-in')), (oError) => oError.code === 'SERVER_LOGIC_MISSING');
  assert.equal(oStore.issues[0].wd_archived, true);
});

test('lowcode mode: concurrent creates retry when the alternate key rejects a duplicate', async () => {
  oService.initialise({ sServerLogic: 'lowcode' });
  oStore.bPluginInstalled = true;
  oStore.issues.push({ wd_issueid: 'existing', wd_issuekey: 'PIRA-1', projectId: PROJECT_ID });
  const { oIssue } = await oService.createIssue(oProject, oDraft('After a race'));
  assert.equal(oIssue.sKey, 'PIRA-2');
});