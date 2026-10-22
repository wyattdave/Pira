// Phase 5 domain rules: solution versions, Dataverse URL safety, environment/solution mapping, OData filters, maker links,
// auto-select by SchemaName across stages and the story version check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSolutionVersion, compareSolutionVersions, getVersionCheck, normaliseDataverseUrl, mapEnvironment, filterEnvironments,
  buildSolutionSearchFilter, buildSolutionLookupFilter, mapSolution, buildSolutionUrl, pickAutoSelectUniqueName, pickAutoSelectSource, validateEpicSolutionDraft,
  epicSolutionsByStage, describeEpicSolution, buildStoryVersionCheck, validateIssueDraft, isStoryType, isEpicType, getSolutionStageByKey,
} from '../../dist/js/domain.js';

const DEV = 100000000, TEST = 100000001, STAGE = 100000002, PROD = 100000003;
const SOLUTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const link = (iStage, sUniqueName, oFields = {}) => ({
  iStage, sEnvironmentId: `env-${iStage}`, sEnvironmentName: `Env ${iStage}`, sEnvironmentUrl: 'https://org.crm.dynamics.com', sSolutionId: SOLUTION_ID,
  sSolutionUniqueName: sUniqueName, sSolutionName: sUniqueName, sSolutionVersion: '1.0.0.0', ...oFields,
});

test('solution version: blank allowed, up to four numeric segments, length capped', () => {
  ['', '  ', '1', '1.0', '1.0.0.2', ' 12.3.45.6789 '].forEach((sValue) => assert.equal(validateSolutionVersion(sValue), '', sValue));
  ['v1.0', '1.0.0.0.0', '1..0', '1.0-beta', '-1', '1.a', `${'1.'.repeat(30)}1`].forEach((sValue) => assert.notEqual(validateSolutionVersion(sValue), '', sValue));
});

test('solution version: numeric comparison per segment, missing segments are zero', () => {
  assert.equal(compareSolutionVersions('1.2', '1.2.0.0'), 0);
  assert.equal(compareSolutionVersions('1.10.0.0', '1.9.9.9'), 1);
  assert.equal(compareSolutionVersions('1.0.0.2', '1.0.0.10'), -1);
  assert.equal(compareSolutionVersions('2', '10'), -1);
  assert.equal(compareSolutionVersions('x', '1.0'), null);
  assert.equal(getVersionCheck('1.2.0.0', '1.2').sState, 'match');
  assert.equal(getVersionCheck('1.2.0.0', '1.1.9.9').sState, 'older');
  assert.equal(getVersionCheck('1.2.0.0', '1.3').sState, 'newer');
  assert.equal(getVersionCheck('', '1.3').sState, 'noExpected');
  assert.equal(getVersionCheck('1.0', '').sState, 'noActual');
});

test('dataverse url: only https Dataverse origins are accepted', () => {
  assert.equal(normaliseDataverseUrl('https://OrgC34F5157.crm.dynamics.com/'), 'https://orgc34f5157.crm.dynamics.com');
  assert.equal(normaliseDataverseUrl('https://contoso.crm4.dynamics.com'), 'https://contoso.crm4.dynamics.com');
  assert.equal(normaliseDataverseUrl('https://org.crm.microsoftdynamics.us'), 'https://org.crm.microsoftdynamics.us');
  [
    'http://org.crm.dynamics.com', 'https://org.crm.dynamics.com.evil.example', 'https://evil.example/?x=.dynamics.com', 'https://dynamics.com.evil.example',
    'https://.dynamics.com', 'https://user:pw@org.crm.dynamics.com', 'https://org.crm.dynamics.com:8443', 'https://org.crm.dynamics.com/api/data',
    'https://org.crm.dynamics.com/?a=1', 'javascript:alert(1)', '', null, 'not a url',
  ].forEach((sUrl) => assert.equal(normaliseDataverseUrl(sUrl), '', String(sUrl)));
});

test('environments: rows without Dataverse or with unsafe ids are dropped; filtering by name, type or host', () => {
  const aRows = [
    { id: '9b45eff8-d905-e28a-918f-2e315619890d', displayName: 'Platform-Tools', type: 'Production', url: 'https://orgc34f5157.crm.dynamics.com', state: 'Enabled' },
    { id: 'Default-11111111-1111-4111-8111-111111111111', displayName: 'Contoso (default)', type: 'Default', url: 'https://contoso.crm.dynamics.com/' },
    { id: 'no-dataverse', displayName: 'No DV', type: 'Sandbox' },
    { id: 'bad id/../x', displayName: 'Bad', url: 'https://bad.crm.dynamics.com' },
    { id: 'evil', displayName: 'Evil', url: 'https://evil.example' },
  ];
  const aEnvironments = aRows.map(mapEnvironment).filter(Boolean);
  assert.deepEqual(aEnvironments.map((oItem) => oItem.sName), ['Platform-Tools', 'Contoso (default)']);
  assert.equal(aEnvironments[1].sUrl, 'https://contoso.crm.dynamics.com');
  assert.deepEqual(filterEnvironments(aEnvironments, 'tools').map((oItem) => oItem.sName), ['Platform-Tools']);
  assert.deepEqual(filterEnvironments(aEnvironments, 'DEFAULT').map((oItem) => oItem.sName), ['Contoso (default)']);
  assert.deepEqual(filterEnvironments(aEnvironments, 'orgc34').map((oItem) => oItem.sName), ['Platform-Tools']);
  assert.equal(filterEnvironments(aEnvironments, '').length, 2);
});

test('solutions: search filter escapes quotes and keeps to visible solutions; lookups validate before querying', () => {
  assert.equal(buildSolutionSearchFilter(''), 'isvisible eq true');
  assert.equal(buildSolutionSearchFilter(" O'Brien "), "isvisible eq true and (contains(friendlyname,'O''Brien') or contains(uniquename,'O''Brien'))");
  assert.equal(buildSolutionLookupFilter({ sUniqueName: 'PiraCore' }), "uniquename eq 'PiraCore'");
  assert.equal(buildSolutionLookupFilter({ sSolutionId: SOLUTION_ID.toUpperCase() }), `solutionid eq ${SOLUTION_ID}`);
  assert.throws(() => buildSolutionLookupFilter({ sUniqueName: "x' or 1 eq 1 or uniquename eq '" }));
  assert.throws(() => buildSolutionLookupFilter({ sSolutionId: 'not-a-guid' }));
  assert.equal(mapSolution({ solutionid: SOLUTION_ID, uniquename: 'PiraCore', friendlyname: 'Pira Core', version: '1.0.0.2', modifiedon: '2026-10-16T12:49:38Z', ismanaged: false }).sVersion, '1.0.0.2');
  assert.equal(mapSolution({ solutionid: 'x', uniquename: 'PiraCore' }), null);
  assert.equal(mapSolution({ solutionid: SOLUTION_ID, uniquename: 'bad name' }), null);
});

test('maker link: built only from a safe environment id and solution GUID', () => {
  assert.equal(buildSolutionUrl('9b45eff8-d905-e28a-918f-2e315619890d', SOLUTION_ID.toUpperCase()),
    `https://make.powerapps.com/environments/9b45eff8-d905-e28a-918f-2e315619890d/solutions/${SOLUTION_ID}`);
  assert.equal(buildSolutionUrl('Default-abc', SOLUTION_ID), `https://make.powerapps.com/environments/Default-abc/solutions/${SOLUTION_ID}`);
  assert.equal(buildSolutionUrl('../evil', SOLUTION_ID), '');
  assert.equal(buildSolutionUrl('env', 'javascript:alert(1)'), '');
});

test('auto-select: nearest earlier stage first, then the nearest later stage', () => {
  const aLinks = [link(DEV, 'FromDev'), link(STAGE, 'FromStage')];
  assert.equal(pickAutoSelectUniqueName(aLinks, TEST), 'FromDev');
  assert.equal(pickAutoSelectUniqueName(aLinks, PROD), 'FromStage');
  assert.equal(pickAutoSelectUniqueName([link(PROD, 'FromProd')], DEV), 'FromProd');
  assert.equal(pickAutoSelectUniqueName([link(DEV, 'Only')], DEV), '', 'never suggests the stage itself');
  assert.equal(pickAutoSelectUniqueName([{ ...link(DEV, 'Cleared'), sSolutionId: '' }], TEST), '', 'unlinked rows are ignored');
  assert.equal(pickAutoSelectUniqueName(aLinks, 42), '');
  assert.equal(pickAutoSelectSource([link(DEV, 'Same'), link(TEST, 'Same')], STAGE).iStage, TEST, 'the source is the nearest stage, not the first with that name');
});

test('epic solution draft, stage rows and history text', () => {
  const oEnvironment = { sId: 'env-1', sUrl: 'https://org.crm.dynamics.com' };
  const oSolution = { sId: SOLUTION_ID, sUniqueName: 'PiraCore' };
  assert.equal(validateEpicSolutionDraft({ iStage: DEV, oEnvironment, oSolution }).bValid, true);
  assert.deepEqual(Object.keys(validateEpicSolutionDraft({ iStage: 5, oEnvironment: { sId: 'x', sUrl: 'https://evil.example' }, oSolution: { sId: 'x' } }).oErrors).sort(),
    ['iStage', 'sEnvironmentId', 'sSolutionId']);
  const aRows = epicSolutionsByStage([link(TEST, 'PiraCore'), { ...link(PROD, 'Gone'), sSolutionId: '' }]);
  assert.deepEqual(aRows.map((oRow) => [oRow.oStage.key, oRow.bLinked]), [['dev', false], ['test', true], ['stage', false], ['prod', false]]);
  assert.equal(describeEpicSolution(link(DEV, 'PiraCore')), 'PiraCore 1.0.0.0 in Env 100000000');
  assert.equal(describeEpicSolution(null), 'None');
  assert.equal(getSolutionStageByKey('prod').value, PROD);
});

test('story version check: every state', () => {
  const oSolution = { sVersion: '1.2.0.0' };
  assert.equal(buildStoryVersionCheck({ sExpected: '1.2', bHasEpic: false }).sState, 'noEpic');
  assert.equal(buildStoryVersionCheck({ sExpected: '1.2', bHasEpic: true, oLink: null }).sState, 'noSolution');
  assert.equal(buildStoryVersionCheck({ sExpected: '1.2', bHasEpic: true, oLink: link(DEV, 'X'), bFailed: true }).sState, 'unavailable');
  assert.equal(buildStoryVersionCheck({ sExpected: '1.2', bHasEpic: true, oLink: link(DEV, 'X'), oSolution: null }).sState, 'missing');
  assert.equal(buildStoryVersionCheck({ sExpected: '1.2', bHasEpic: true, oLink: link(DEV, 'X'), oSolution }).sState, 'match');
  assert.equal(buildStoryVersionCheck({ sExpected: '1.3', bHasEpic: true, oLink: link(DEV, 'X'), oSolution }).sState, 'older');
  assert.equal(buildStoryVersionCheck({ sExpected: '', bHasEpic: true, oLink: link(DEV, 'X'), oSolution }).sState, 'noExpected');
});

test('issue draft: only stories carry a valid solution version', () => {
  const oDraft = { sSummary: 'S', sProjectId: PROJECT_ID, iType: 100000002, iPriority: 100000002, aLabels: [] };
  assert.equal(isStoryType(100000002) && isEpicType(100000003) && !isStoryType(100000000), true);
  assert.equal(validateIssueDraft({ ...oDraft, sSolutionVersion: '1.0.0.2' }).bValid, true);
  assert.ok(validateIssueDraft({ ...oDraft, sSolutionVersion: 'v1' }).oErrors.sSolutionVersion);
  assert.ok(validateIssueDraft({ ...oDraft, iType: 100000000, sSolutionVersion: '1.0' }).oErrors.sSolutionVersion);
  assert.equal(validateIssueDraft({ ...oDraft, iType: 100000000, sSolutionVersion: '' }).bValid, true);
});
