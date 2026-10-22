// Phase 4/5 feature flags: with every flag off, the data service refuses the new capabilities before touching Dataverse and
// core issue tracking still works. The config module is mocked with the real values except FEATURES.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ISSUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const aCalls = [];

const oActualConfig = await import(new URL('../../dist/config/app-config.js?actual', import.meta.url).href);
const oFeaturesOff = Object.freeze(Object.fromEntries(Object.keys(oActualConfig.FEATURES).map((sKey) => [sKey, false])));
mock.module(new URL('../../dist/config/app-config.js', import.meta.url).href, { namedExports: { ...oActualConfig, FEATURES: oFeaturesOff } });

const oRows = {
  wd_issues: [{ wd_issueid: ISSUE_ID, wd_issuekey: 'PIRA-1', wd_summary: 'Core', _wd_project_value: PROJECT_ID, wd_issuetype: 100000000, wd_status: 100000000, wd_priority: 100000002, wd_archived: false, createdon: '2026-10-01T00:00:00Z' }],
  systemusers: [{ systemuserid: USER_ID, fullname: 'Test User', isdisabled: false }],
  wd_projects: [{ wd_projectid: PROJECT_ID, wd_key: 'PIRA', wd_name: 'Pira', wd_state: 100000000 }],
};
const fakeClient = {
  retrieveMultipleRecordsAsync: async (sSet) => { aCalls.push(sSet); return { success: true, data: (oRows[sSet] || []).map((oRow) => ({ ...oRow })) }; },
  executeAsync: async () => ({ success: true, data: { ManyToOneRelationships: [{ ReferencingAttribute: 'wd_issue', ReferencingEntityNavigationPropertyName: 'nav_wd_issue' }] } }),
};
mock.module(new URL('../../dist/power-apps-data.js', import.meta.url).href, {
  namedExports: { getClient: () => fakeClient, getContext: async () => ({ user: { systemUserId: USER_ID } }) },
});
mock.module(new URL('../../dist/connectors/office365users.js', import.meta.url).href, { namedExports: { searchForUsers: async () => ({ value: [] }) } });
mock.module(new URL('../../dist/codeapp.js', import.meta.url).href, {
  namedExports: {
    initDataSources: () => {}, unwrapResult: (oResult) => oResult,
    createItem: async (sSet) => { aCalls.push(`create:${sSet}`); return {}; },
    updateItem: async (sSet) => { aCalls.push(`update:${sSet}`); return {}; },
    getItem: async (sSet) => (oRows[sSet] || [])[0] || null,
    deleteItem: async () => ({}),
  },
});

const oService = await import('../../dist/js/data-service.js');
const oDomain = await import('../../dist/js/domain.js');
oService.initialise({ sServerLogic: 'client' });

const PROJECT = { sId: PROJECT_ID, sKey: 'PIRA', sName: 'Pira', bArchived: false };
const isOff = (oError) => oError.code === 'FEATURE_DISABLED';

test('flags: the fixture really switched every Phase 4 feature off', () => {
  assert.ok(Object.keys(oActualConfig.FEATURES).length >= 6);
  Object.keys(oActualConfig.FEATURES).forEach((sKey) => assert.equal(oDomain.isFeatureEnabled(sKey), false, sKey));
});

test('flags: every disabled capability is refused before any Dataverse call', async () => {
  const oIssue = await oService.getIssue(ISSUE_ID);
  aCalls.length = 0;
  const aAttempts = [
    () => oService.listVersions(PROJECT_ID), () => oService.createVersion(PROJECT, { sName: '1' }), () => oService.getVersionProgress(PROJECT),
    () => oService.releaseVersion(PROJECT, { sId: ISSUE_ID }), () => oService.setVersionState(PROJECT, { sId: ISSUE_ID }, 100000001),
    () => oService.listWorkLogs(ISSUE_ID), () => oService.logWork(oIssue, { iMinutes: 30, sWorkDate: '2026-10-01' }),
    () => oService.updateWorkLog(oIssue, { sId: ISSUE_ID }, {}), () => oService.voidWorkLog(oIssue, { sId: ISSUE_ID }, 'x'),
    () => oService.getAnalytics(PROJECT), () => oService.exportIssues(PROJECT, {}), () => oService.previewCsvImport(PROJECT, 'Summary\nA'),
    () => oService.importCsvIssues(PROJECT, 'Summary\nA'), () => oService.getDependencyGraph(PROJECT),
    () => oService.listIssues({ oCriteria: { sProjectId: PROJECT_ID, oQuery: { sJoin: 'and', aItems: [{ sField: 'status', sOp: 'in', aValues: [100000000] }] } } }),
    () => oService.updateIssue(oIssue, { iOriginalEstimate: 60 }), () => oService.updateIssue(oIssue, { sFixVersionId: ISSUE_ID }),
    () => oService.listEnvironments(), () => oService.searchSolutions({ sUrl: 'https://org.crm.dynamics.com' }, 'x'),
    () => oService.findSolution({ sUrl: 'https://org.crm.dynamics.com' }, { sUniqueName: 'Pira' }), () => oService.listEpicSolutions(ISSUE_ID),
    () => oService.linkEpicSolution(oIssue, 100000000, {}, {}), () => oService.unlinkEpicSolution(oIssue, 100000000),
    () => oService.getLinkedSolution({}), () => oService.getStoryVersionCheck(oIssue, 100000000),
    () => oService.updateIssue(oIssue, { sSolutionVersion: '1.0' }),
  ];
  for (const fnAttempt of aAttempts) await assert.rejects(fnAttempt(), isOff, fnAttempt.toString());
  assert.deepEqual(aCalls.filter((sCall) => sCall.startsWith('create:') || sCall.startsWith('update:') || ['wd_versions', 'wd_worklogs', 'wd_epicsolutions'].includes(sCall)), []);
});

test('flags: core issue tracking is unaffected when Phase 4 is off', async () => {
  const { aIssues } = await oService.listIssues({ oCriteria: { sProjectId: PROJECT_ID } });
  assert.deepEqual(aIssues.map((oIssue) => oIssue.sKey), ['PIRA-1']);
  const { oIssue } = await oService.updateIssue(await oService.getIssue(ISSUE_ID), { sSummary: 'Still editable' });
  assert.ok(oIssue);
});
