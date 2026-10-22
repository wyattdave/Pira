// Phase 5 service tests for dist/js/data-service.js: environments (Power Platform for Admins V2), solutions (Dataverse
// connector, read as the user), epic solution links per stage, unlinking, the story solution version and its version check.
// The Dataverse fake evaluates the real OData filters; contains() counts as true. Connectors are faked per environment URL.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PRIYA_ID = '44444444-4444-4444-8444-444444444444';
const AAD_ID = '55555555-5555-4555-8555-555555555555';
const TASK = 100000000, STORY = 100000002, EPIC = 100000003;
const LEAD = 100000000, STAKEHOLDER = 100000002;
const DEV = 100000000, TEST = 100000001, PROD = 100000003;
const DEV_URL = 'https://contoso-dev.crm.dynamics.com', TEST_URL = 'https://contoso-test.crm.dynamics.com';
const id = (iNumber) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(iNumber).padStart(12, '0')}`;
const tick = () => new Promise((fnResolve) => { setTimeout(fnResolve, 2); });

const TABLE_KEYS = {
  wd_issues: 'wd_issueid', wd_projectmembers: 'wd_projectmemberid', systemusers: 'systemuserid', wd_issuehistories: 'wd_issuehistoryid',
  wd_projects: 'wd_projectid', wd_issuelabels: 'wd_issuelabelid', wd_labels: 'wd_labelid', wd_epicsolutions: 'wd_epicsolutionid',
};
const oDb = {};
const aWrites = [];
const oConnector = { aEnvironmentCalls: [], aSolutionCalls: [], aEnvironments: [], oSolutions: {}, oFail: {} };

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
      return sOp === 'eq' ? rowValue === value : rowValue !== value;
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

const RELATIONSHIPS = ['wd_project', 'wd_assignee', 'wd_parentissue', 'wd_issue', 'wd_label', 'wd_user', 'wd_sprint', 'wd_fixversion']
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
    if (oOptions.top) aRows = aRows.slice(0, oOptions.top);
    return { success: true, data: aRows.map((oRow) => ({ ...oRow })) };
  },
  executeAsync: async () => ({ success: true, data: { ManyToOneRelationships: RELATIONSHIPS } }),
};

mock.module(new URL('../../dist/power-apps-data.js', import.meta.url).href, {
  namedExports: { getClient: () => fakeClient, getContext: async () => ({ user: { systemUserId: USER_ID, objectId: AAD_ID } }) },
});
mock.module(new URL('../../dist/connectors/office365users.js', import.meta.url).href, { namedExports: { searchForUsers: async () => ({ value: [] }) } });
mock.module(new URL('../../dist/connectors/powerplatformadminv2.js', import.meta.url).href, {
  namedExports: {
    ListEnvironmentsForUser: async (sApiVersion, sFilter, sSelect, iTop, iSkip) => {
      await tick();
      oConnector.aEnvironmentCalls.push({ sApiVersion, iTop, iSkip });
      if (oConnector.oFail.environments) throw new Error(oConnector.oFail.environments);
      return { value: oConnector.aEnvironments.slice(iSkip, iSkip + iTop) };
    },
  },
});
mock.module(new URL('../../dist/connectors/commondataserviceforapps.js', import.meta.url).href, {
  namedExports: {
    ListRecordsWithOrganization: async (sOrganization, sEntity, sPrefer, sAccept, bFull, bMip, sSelect, sFilter, sOrderBy, sExpand, sFetchXml, iTop) => {
      await tick();
      oConnector.aSolutionCalls.push({ sOrganization, sEntity, sSelect, sFilter, sOrderBy, iTop });
      if (oConnector.oFail[sOrganization]) throw new Error(oConnector.oFail[sOrganization]);
      return { value: (oConnector.oSolutions[sOrganization] || []).filter(compileFilter(sFilter)).slice(0, iTop).map((oRow) => ({ ...oRow })) };
    },
  },
});
mock.module(new URL('../../dist/codeapp.js', import.meta.url).href, {
  namedExports: {
    initDataSources: () => {},
    unwrapResult: (oResult) => (oResult && 'data' in oResult ? oResult.data : oResult),
    createItem: async (sSet, sKey, oRecord) => {
      await tick();
      aWrites.push({ sOp: 'create', sSet, oRecord });
      (oDb[sSet] = oDb[sSet] || []).push({ createdon: new Date().toISOString(), modifiedon: new Date().toISOString(), _createdby_value: USER_ID, ...applyBinds(oRecord) });
      return {};
    },
    updateItem: async (sSet, sKey, sId, oChanges) => {
      await tick();
      aWrites.push({ sOp: 'update', sSet, sId, oChanges });
      const oRow = (oDb[sSet] || []).find((oItem) => oItem[sKey] === sId);
      if (oRow) Object.assign(oRow, applyBinds(oChanges), { modifiedon: new Date().toISOString() });
      return {};
    },
    getItem: async (sSet, sKey, sId) => {
      await tick();
      const oRow = (oDb[sSet] || []).find((oItem) => oItem[TABLE_KEYS[sSet]] === sId);
      return oRow ? { ...oRow } : null;
    },
    deleteItem: async (sSet) => { aWrites.push({ sOp: 'delete', sSet }); return {}; },
  },
});

const oService = await import('../../dist/js/data-service.js');

const issueRow = (iNumber, iType, oFields = {}) => ({
  wd_issueid: id(iNumber), wd_issuekey: `PIRA-${iNumber}`, wd_summary: `Summary ${iNumber}`, _wd_project_value: PROJECT_ID, wd_issuetype: iType,
  wd_status: 100000000, wd_priority: 100000002, wd_archived: false, _wd_parentissue_value: null, wd_solutionversion: null, createdon: '2026-10-01T00:00:00Z', ...oFields,
});
const solutionRow = (iNumber, sUniqueName, sVersion) => ({
  solutionid: id(500 + iNumber), uniquename: sUniqueName, friendlyname: `${sUniqueName} solution`, version: sVersion, modifiedon: '2026-10-20T10:00:00Z', ismanaged: false, isvisible: true,
});
const DEV_ENV = { sId: 'env-dev', sName: 'Contoso Dev', sUrl: DEV_URL };
const TEST_ENV = { sId: 'env-test', sName: 'Contoso Test', sUrl: TEST_URL };
const writesTo = (sSet, sOp = '') => aWrites.filter((oWrite) => oWrite.sSet === sSet && (!sOp || oWrite.sOp === sOp));
const historyRows = () => oDb.wd_issuehistories || [];
const epic = () => oService.getIssue(id(1));
const story = () => oService.getIssue(id(2));

beforeEach(() => {
  Object.keys(oDb).forEach((sKey) => delete oDb[sKey]);
  aWrites.length = 0;
  Object.assign(oConnector, { aEnvironmentCalls: [], aSolutionCalls: [], oFail: {} });
  oConnector.aEnvironments = [
    { id: 'env-test', displayName: 'Contoso Test', type: 'Sandbox', url: `${TEST_URL}/`, state: 'Enabled' },
    { id: 'env-dev', displayName: 'Contoso Dev', type: 'Sandbox', url: DEV_URL, state: 'Enabled' },
    { id: 'env-teams', displayName: 'Teams only', type: 'Teams' },
    { id: 'env-evil', displayName: 'Evil', type: 'Sandbox', url: 'https://evil.example' },
  ];
  oConnector.oSolutions = {
    [DEV_URL]: [solutionRow(1, 'PiraCore', '1.3.0.0'), solutionRow(2, 'Other', '2.0')],
    [TEST_URL]: [solutionRow(11, 'PiraCore', '1.2.0.0')],
  };
  oDb.wd_projects = [{ wd_projectid: PROJECT_ID, wd_key: 'PIRA', wd_name: 'Pira', wd_state: 100000000 }];
  oDb.wd_projectmembers = [{ wd_projectmemberid: id(800), _wd_project_value: PROJECT_ID, _wd_user_value: USER_ID, wd_projectrole: LEAD, wd_membershipstate: 100000000 }];
  oDb.systemusers = [{ systemuserid: USER_ID, fullname: 'Test User', azureactivedirectoryobjectid: AAD_ID, isdisabled: false }, { systemuserid: PRIYA_ID, fullname: 'Priya', isdisabled: false }];
  oDb.wd_issues = [issueRow(1, EPIC), issueRow(2, STORY, { _wd_parentissue_value: id(1), wd_solutionversion: '1.2.0.0' }), issueRow(3, TASK)];
  oDb.wd_epicsolutions = [];
  oService.initialise({ sServerLogic: 'client' });
  oService.invalidateCache('');
});

// ── Environments and solutions ─────────────────────────────────

test('environments: Dataverse environments only, safe URLs, sorted, fetched once with the documented api-version', async () => {
  const aEnvironments = await oService.listEnvironments();
  assert.deepEqual(aEnvironments.map((oItem) => [oItem.sId, oItem.sUrl]), [['env-dev', DEV_URL], ['env-test', TEST_URL]]);
  await oService.listEnvironments();
  assert.equal(oConnector.aEnvironmentCalls.length, 1, 'cached');
  assert.equal(oConnector.aEnvironmentCalls[0].sApiVersion, '2024-10-01');
  await oService.listEnvironments({ bRefresh: true });
  assert.equal(oConnector.aEnvironmentCalls.length, 2);
});

test('environments: pages with $top/$skip until a short page', async () => {
  oConnector.aEnvironments = Array.from({ length: 501 }, (_, iIndex) => ({ id: `env-${iIndex}`, displayName: `Env ${String(iIndex).padStart(3, '0')}`, url: `https://org${iIndex}.crm.dynamics.com` }));
  const aEnvironments = await oService.listEnvironments();
  assert.equal(aEnvironments.length, 501);
  assert.deepEqual(oConnector.aEnvironmentCalls.map((oCall) => oCall.iSkip), [0, 500]);
});

test('environments: connector failures become friendly errors', async () => {
  oConnector.oFail.environments = 'Connector ListEnvironmentsForUser failed: 500 internal <secret detail>';
  await assert.rejects(oService.listEnvironments(), (oError) => oError.code === 'POWER_PLATFORM_UNAVAILABLE' && !oError.message.includes('secret'));
  oConnector.oFail.environments = 'Forbidden (status 403)';
  await assert.rejects(oService.listEnvironments({ bRefresh: true }), (oError) => oError.code === 'PERMISSION_DENIED');
});

test('solutions: searched in the chosen environment as the organization, visible only, escaped, first page by name', async () => {
  const aSolutions = await oService.searchSolutions(DEV_ENV, "pi'ra");
  assert.equal(aSolutions.length, 2);
  const oCall = oConnector.aSolutionCalls[0];
  assert.equal(oCall.sOrganization, DEV_URL);
  assert.equal(oCall.sEntity, 'solutions');
  assert.equal(oCall.sSelect, 'solutionid,uniquename,friendlyname,version,modifiedon,ismanaged');
  assert.equal(oCall.sFilter, "isvisible eq true and (contains(friendlyname,'pi''ra') or contains(uniquename,'pi''ra'))");
  assert.equal(oCall.sOrderBy, 'friendlyname asc');
  assert.equal(oCall.iTop, 50);
  await oService.searchSolutions(DEV_ENV, "pi'ra");
  assert.equal(oConnector.aSolutionCalls.length, 1, 'cached');
});

test('solutions: find by SchemaName or id; unsafe environments and names never reach the connector', async () => {
  assert.equal((await oService.findSolution(TEST_ENV, { sUniqueName: 'PiraCore' })).sVersion, '1.2.0.0');
  assert.equal(await oService.findSolution(TEST_ENV, { sUniqueName: 'Missing' }), null);
  assert.equal((await oService.findSolution(DEV_ENV, { sSolutionId: id(502) })).sUniqueName, 'Other');
  const iCalls = oConnector.aSolutionCalls.length;
  await assert.rejects(oService.findSolution({ sUrl: 'https://evil.example' }, { sUniqueName: 'PiraCore' }));
  await assert.rejects(oService.findSolution(DEV_ENV, { sUniqueName: "x' or true" }));
  await assert.rejects(oService.searchSolutions({ sUrl: 'http://contoso-dev.crm.dynamics.com' }, ''));
  assert.equal(oConnector.aSolutionCalls.length, iCalls);
});

// ── Epic links ─────────────────────────────────────────────────

test('link: creates one row per stage from the live solution, bound to the epic and project, with history', async () => {
  const oStale = { sId: id(501), sUniqueName: 'PiraCore', sVersion: '0.0.0.1-from-browser' };
  const { oLink, aLinks, oSolution, bHistorySaved } = await oService.linkEpicSolution(await epic(), DEV, DEV_ENV, oStale);
  assert.equal(bHistorySaved, true);
  assert.equal(oSolution.sVersion, '1.3.0.0');
  assert.equal(aLinks.length, 1);
  assert.deepEqual([oLink.iStage, oLink.sEnvironmentId, oLink.sEnvironmentUrl, oLink.sSolutionUniqueName, oLink.sSolutionVersion], [DEV, 'env-dev', DEV_URL, 'PiraCore', '1.3.0.0']);
  const [oCreate] = writesTo('wd_epicsolutions', 'create');
  assert.equal(oCreate.oRecord['nav_wd_issue@odata.bind'], `/wd_issues(${id(1)})`);
  assert.equal(oCreate.oRecord['nav_wd_project@odata.bind'], `/wd_projects(${PROJECT_ID})`);
  assert.equal(oCreate.oRecord.wd_name, 'PIRA-1 · Dev');
  assert.deepEqual(historyRows().map((oRow) => [oRow.wd_fieldname, oRow.wd_oldvalue, oRow.wd_newvalue]), [['solution:dev', 'None', 'PiraCore solution 1.3.0.0 in Contoso Dev']]);
});

test('link: changing a stage updates its row; other stages are separate rows', async () => {
  await oService.linkEpicSolution(await epic(), DEV, DEV_ENV, { sId: id(501), sUniqueName: 'PiraCore' });
  await oService.linkEpicSolution(await epic(), DEV, DEV_ENV, { sId: id(502), sUniqueName: 'Other' });
  const { aLinks } = await oService.linkEpicSolution(await epic(), TEST, TEST_ENV, { sId: id(511), sUniqueName: 'PiraCore' });
  assert.equal(writesTo('wd_epicsolutions', 'create').length, 2);
  assert.equal(writesTo('wd_epicsolutions', 'update').length, 1);
  assert.deepEqual(aLinks.map((oLink) => [oLink.iStage, oLink.sSolutionUniqueName]), [[DEV, 'Other'], [TEST, 'PiraCore']]);
});

test('link: refused for non-epics, stakeholders, unknown environments and solutions missing from the environment', async () => {
  const oSolution = { sId: id(501), sUniqueName: 'PiraCore' };
  await assert.rejects(oService.linkEpicSolution(await oService.getIssue(id(3)), DEV, DEV_ENV, oSolution), (oError) => oError.code === 'INVALID_EPIC_SOLUTION');
  await assert.rejects(oService.linkEpicSolution(await epic(), DEV, { ...DEV_ENV, sId: 'env-test' }, oSolution), (oError) => oError.code === 'INVALID_EPIC_SOLUTION');
  await assert.rejects(oService.linkEpicSolution(await epic(), DEV, { sId: 'env-x', sUrl: 'https://other.crm.dynamics.com' }, oSolution), (oError) => oError.code === 'INVALID_EPIC_SOLUTION');
  await assert.rejects(oService.linkEpicSolution(await epic(), TEST, TEST_ENV, oSolution), (oError) => oError.code === 'SOLUTION_NOT_FOUND');
  await assert.rejects(oService.linkEpicSolution(await epic(), 42, DEV_ENV, oSolution), (oError) => oError.code === 'INVALID_EPIC_SOLUTION');
  oDb.wd_projectmembers[0].wd_projectrole = STAKEHOLDER;
  oService.invalidateCache('');
  await assert.rejects(oService.linkEpicSolution(await epic(), DEV, DEV_ENV, oSolution), (oError) => oError.code === 'PERMISSION_DENIED');
  assert.deepEqual(writesTo('wd_epicsolutions'), []);
});

test('link: in lowcode mode the plug-ins own the history', async () => {
  oService.initialise({ sServerLogic: 'lowcode' });
  const { bHistorySaved } = await oService.linkEpicSolution(await epic(), DEV, DEV_ENV, { sId: id(501), sUniqueName: 'PiraCore' });
  assert.equal(bHistorySaved, true);
  assert.deepEqual(historyRows(), []);
});

test('unlink: empties the row (never deletes) and records history; unlinking an empty stage is a no-op', async () => {
  await oService.linkEpicSolution(await epic(), DEV, DEV_ENV, { sId: id(501), sUniqueName: 'PiraCore' });
  const { aLinks } = await oService.unlinkEpicSolution(await epic(), DEV);
  assert.equal(aLinks[0].sSolutionId, '');
  assert.equal(writesTo('wd_epicsolutions', 'delete').length, 0);
  assert.deepEqual(Object.values(writesTo('wd_epicsolutions', 'update').pop().oChanges), Array(8).fill(null));
  assert.equal(historyRows().pop().wd_newvalue, 'None');
  const iWrites = aWrites.length;
  await oService.unlinkEpicSolution(await epic(), PROD);
  assert.equal(aWrites.length, iWrites);
});

// ── Stories ────────────────────────────────────────────────────

test('story version: stories only, validated, cleared automatically when the story becomes a task', async () => {
  const { oIssue } = await oService.updateIssue(await story(), { sSolutionVersion: ' 1.4.0.0 ' });
  assert.equal(oIssue.sSolutionVersion, '1.4.0.0');
  assert.equal(writesTo('wd_issues', 'update').pop().oChanges.wd_solutionversion, '1.4.0.0');
  assert.deepEqual(historyRows().map((oRow) => [oRow.wd_fieldname, oRow.wd_oldvalue, oRow.wd_newvalue]), [['solutionVersion', '1.2.0.0', '1.4.0.0']]);
  await assert.rejects(oService.updateIssue(await story(), { sSolutionVersion: 'v1' }), (oError) => Boolean(oError.details && oError.details.sSolutionVersion));
  await assert.rejects(oService.updateIssue(await oService.getIssue(id(3)), { sSolutionVersion: '1.0' }), (oError) => Boolean(oError.details && oError.details.sSolutionVersion));
  const { oIssue: oTask } = await oService.updateIssue(await story(), { iType: TASK });
  assert.equal(oTask.sSolutionVersion, '');
  assert.equal(writesTo('wd_issues', 'update').pop().oChanges.wd_solutionversion, null);
});

test('version check: compares the story with its epic\'s live solution for the chosen stage', async () => {
  await oService.linkEpicSolution(await epic(), DEV, DEV_ENV, { sId: id(501), sUniqueName: 'PiraCore' });
  await oService.linkEpicSolution(await epic(), TEST, TEST_ENV, { sId: id(511), sUniqueName: 'PiraCore' });
  const oTest = await oService.getStoryVersionCheck(await story(), TEST);
  assert.deepEqual([oTest.oCheck.sState, oTest.oEpic.sKey, oTest.oSolution.sVersion], ['match', 'PIRA-1', '1.2.0.0']);
  assert.equal((await oService.getStoryVersionCheck(await story(), DEV)).oCheck.sState, 'newer');
  assert.equal((await oService.getStoryVersionCheck(await story(), PROD)).oCheck.sState, 'noSolution');
  oConnector.oSolutions[TEST_URL][0].version = '1.1.0.0';
  assert.equal((await oService.getStoryVersionCheck(await story(), TEST)).oCheck.sState, 'match', 'cached until refreshed');
  assert.equal((await oService.getStoryVersionCheck(await story(), TEST, { bRefresh: true })).oCheck.sState, 'older');
  oConnector.oSolutions[TEST_URL] = [];
  assert.equal((await oService.getStoryVersionCheck(await story(), TEST, { bRefresh: true })).oCheck.sState, 'missing');
  oConnector.oFail[TEST_URL] = 'Connector ListRecordsWithOrganization failed: timeout';
  const oFailed = await oService.getStoryVersionCheck(await story(), TEST, { bRefresh: true });
  assert.equal(oFailed.oCheck.sState, 'unavailable');
  assert.ok(oFailed.sError);
});

test('version check: stories without an epic parent, and non-stories', async () => {
  oDb.wd_issues[1]._wd_parentissue_value = null;
  assert.equal((await oService.getStoryVersionCheck(await story(), DEV)).oCheck.sState, 'noEpic');
  await assert.rejects(oService.getStoryVersionCheck(await oService.getIssue(id(3)), DEV), (oError) => oError.code === 'VALIDATION_FAILED');
  await assert.rejects(oService.getStoryVersionCheck(await story(), 7), (oError) => oError.code === 'VALIDATION_FAILED');
});
