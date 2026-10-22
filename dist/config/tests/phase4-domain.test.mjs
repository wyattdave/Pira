// Phase 4 domain tests: time tracking, versions, the advanced query allowlist and OData translation, analytics against a known
// dataset, CSV export/import planning and the dependency graph. Run: node --test agent/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration, parseDuration, validateWorkLog, validateVoidReason, remainingAfterLog, remainingForNewEstimate, sumWorkLogMinutes, summariseIssueTime,
  validateVersionDraft, isVersionNameTaken, planVersionRelease, sortVersions, buildReleaseCalendar, isVersionOverdue, computeVersionProgress,
  sanitiseQuery, validateQuery, buildQueryFilter, matchesQuery, resolveQueryUser, describeQuery, queryUsesFields, getQueryField, queryOperatorsFor,
  buildIssueFilter, sanitiseFilterCriteria, resolveFilterCriteria, matchesIssueCriteria,
  percentile, summariseDurations, computeLeadTimes, computeCycleTimes, computeThroughput, computeOverdueTrend, summariseSprintOutcomes,
  summariseTimeTracking, buildAnalytics, buildWeekBuckets, csvCell, buildCsv, parseCsv, issuesToCsv, planCsvImport, mapCsvHeaders,
  buildDependencyGraph, ERROR_CODES,
} from '../../dist/js/domain.js';
import { LIMITS } from '../../dist/config/app-config.js';

const TODO = 100000000, PROGRESS = 100000001, DONE = 100000003, CLOSED = 100000007;
const TASK = 100000000, BUG = 100000001;
const UNRELEASED = 100000000, RELEASED = 100000001, ARCHIVED = 100000002;
const BLOCKS = 100000000, RELATES = 100000001;
const id = (iNumber) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(iNumber).padStart(12, '0')}`;
const ME = id(1), PRIYA = id(2);
const PROJECT = id(500);

// ── Time tracking ──────────────────────────────────────────────

test('durations: Jira-style text round-trips with 1d = 8h and 1w = 5d', () => {
  assert.deepEqual(parseDuration('1w 2d 3h 30m'), { iMinutes: 2400 + 960 + 180 + 30, sError: '' });
  assert.equal(parseDuration('2h30m').iMinutes, 150);
  assert.equal(parseDuration('1.5h').iMinutes, 90);
  assert.equal(parseDuration('0m').iMinutes, 0);
  assert.deepEqual(parseDuration('  '), { iMinutes: null, sError: '' });
  assert.equal(formatDuration(2400 + 960 + 180 + 30), '1w 2d 3h 30m');
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(null), '');
  assert.equal(formatDuration(480), '1d');
});

test('durations: bare numbers, repeated units, junk and oversized values are refused', () => {
  ['2', '2 hours', '1h 1h', 'h', '-1h', '1h; drop'].forEach((sValue) => assert.ok(parseDuration(sValue).sError, sValue));
  assert.match(parseDuration('9999w').sError, /under/);
  assert.equal(parseDuration('25h', LIMITS.workLogMaxMinutes).iMinutes, null);
});

test('work logs: 1 minute to 24 hours, a real date not in the future and within a year, bounded comment', () => {
  const sToday = '2026-10-21';
  assert.equal(validateWorkLog({ iMinutes: 90, sWorkDate: sToday, sComment: '' }, sToday).bValid, true);
  assert.equal(validateWorkLog({ iMinutes: 90, sWorkDate: '2026-10-22', sComment: '' }, sToday).bValid, true, 'one day of slack for time zones');
  assert.ok(validateWorkLog({ iMinutes: 0, sWorkDate: sToday }, sToday).oErrors.iMinutes);
  assert.ok(validateWorkLog({ iMinutes: 1441, sWorkDate: sToday }, sToday).oErrors.iMinutes);
  assert.ok(validateWorkLog({ iMinutes: 1.5, sWorkDate: sToday }, sToday).oErrors.iMinutes);
  assert.ok(validateWorkLog({ iMinutes: 60, sWorkDate: '2026-10-25' }, sToday).oErrors.sWorkDate);
  assert.ok(validateWorkLog({ iMinutes: 60, sWorkDate: '2025-10-01' }, sToday).oErrors.sWorkDate);
  assert.ok(validateWorkLog({ iMinutes: 60, sWorkDate: '2026-02-30' }, sToday).oErrors.sWorkDate);
  assert.ok(validateWorkLog({ iMinutes: 60, sWorkDate: sToday, sComment: 'x'.repeat(LIMITS.workLogCommentMax + 1) }, sToday).oErrors.sComment);
  assert.ok(validateVoidReason('  '));
  assert.equal(validateVoidReason('Logged twice'), '');
});

test('estimates: remaining adjusts automatically, never below zero, and only logs count as time spent', () => {
  assert.equal(remainingAfterLog({ iRemainingEstimate: 300, iOriginalEstimate: 480, iTimeSpent: 0 }, 120), 180);
  assert.equal(remainingAfterLog({ iRemainingEstimate: 60, iOriginalEstimate: 480, iTimeSpent: 0 }, 120), 0);
  assert.equal(remainingAfterLog({ iRemainingEstimate: null, iOriginalEstimate: 480, iTimeSpent: 120 }, 60), 300, 'starts from original minus spent');
  assert.equal(remainingAfterLog({ iRemainingEstimate: null, iOriginalEstimate: null, iTimeSpent: 0 }, 60), null);
  assert.equal(remainingForNewEstimate({ iRemainingEstimate: null, iTimeSpent: 0 }, 480), 480);
  assert.equal(remainingForNewEstimate({ iRemainingEstimate: 60, iTimeSpent: 0 }, 480), undefined);
  assert.equal(remainingForNewEstimate({ iRemainingEstimate: null, iTimeSpent: 30 }, 480), undefined);
  assert.equal(sumWorkLogMinutes([{ iMinutes: 60 }, { iMinutes: 30, bVoided: true }, { iMinutes: 15 }]), 75);
  const oTime = summariseIssueTime({ iOriginalEstimate: 480, iTimeSpent: 360, iRemainingEstimate: 240 });
  assert.equal(oTime.bOverEstimate, true);
  assert.equal(oTime.iSpentPercent + oTime.iRemainingPercent, 100);
});

// ── Versions ───────────────────────────────────────────────────

test('versions: name and dates are validated, names are unique per project ignoring case', () => {
  assert.equal(validateVersionDraft({ sName: '2.0', sStartDate: '2026-10-01', sReleaseDate: '2026-11-01' }).bValid, true);
  assert.ok(validateVersionDraft({ sName: ' ' }).oErrors.sName);
  assert.ok(validateVersionDraft({ sName: 'x'.repeat(LIMITS.versionNameMax + 1) }).oErrors.sName);
  assert.ok(validateVersionDraft({ sName: 'v', sStartDate: '2026-11-02', sReleaseDate: '2026-11-01' }).oErrors.sReleaseDate);
  assert.ok(validateVersionDraft({ sName: 'v', sReleaseDate: '2026-13-01' }).oErrors.sReleaseDate);
  const aVersions = [{ sId: id(1), sName: 'Release 1' }];
  assert.equal(isVersionNameTaken(aVersions, ' release 1 '), true);
  assert.equal(isVersionNameTaken(aVersions, 'Release 1', id(1)), false, 'renaming to its own name is fine');
});

test('versions: releasing needs an explicit choice for unfinished issues and never targets itself', () => {
  const aIssues = [{ sId: id(1), iStatus: DONE }, { sId: id(2), iStatus: TODO }, { sId: id(3), iStatus: TODO, bArchived: true }];
  assert.throws(() => planVersionRelease(aIssues, '', id(9)), (oError) => oError.code === ERROR_CODES.versionDestinationRequired);
  assert.throws(() => planVersionRelease(aIssues, id(9), id(9)), (oError) => oError.code === ERROR_CODES.validation);
  assert.throws(() => planVersionRelease(aIssues, 'later', id(9)), (oError) => oError.code === ERROR_CODES.validation);
  assert.deepEqual(planVersionRelease(aIssues, 'keep', id(9)).aMove, []);
  const oNone = planVersionRelease(aIssues, 'none', id(9));
  assert.deepEqual(oNone.aMove.map((oIssue) => oIssue.sId), [id(2)], 'archived issues are never moved');
  assert.equal(oNone.sTargetVersionId, '');
  assert.equal(planVersionRelease(aIssues, id(8), id(9)).sTargetVersionId, id(8));
  assert.deepEqual(planVersionRelease([{ iStatus: DONE }], '', id(9)).aMove, [], 'all done: no choice needed');
  assert.equal(computeVersionProgress([{ iStatus: DONE, iStoryPoints: 3 }, { iStatus: CLOSED, iStoryPoints: 1 }, { iStatus: TODO }, { iStatus: TODO }]).iPercent, 50);
});

test('versions: unreleased by release date first, then released newest first, archived last; calendar places them by date', () => {
  const aSorted = sortVersions([
    { sId: 'a', sName: 'Archived', iState: ARCHIVED, sReleaseDate: '2026-01-01' },
    { sId: 'r1', sName: 'Old', iState: RELEASED, sReleaseDate: '2026-08-01' },
    { sId: 'u2', sName: 'Later', iState: UNRELEASED, sReleaseDate: '2026-12-01' },
    { sId: 'u0', sName: 'Undated', iState: UNRELEASED, sReleaseDate: '' },
    { sId: 'r2', sName: 'New', iState: RELEASED, sReleaseDate: '2026-09-01' },
    { sId: 'u1', sName: 'Soon', iState: UNRELEASED, sReleaseDate: '2026-11-01' },
  ]);
  assert.deepEqual(aSorted.map((oVersion) => oVersion.sId), ['u1', 'u2', 'u0', 'r2', 'r1', 'a']);
  const aWeeks = buildReleaseCalendar([{ sId: 'x', sName: 'X', iState: UNRELEASED, sReleaseDate: '2026-10-21' }, { sId: 'y', sName: 'Y', iState: ARCHIVED, sReleaseDate: '2026-10-21' }], 2026, 9);
  assert.ok(aWeeks.length >= 4 && aWeeks.every((aDays) => aDays.length === 7));
  assert.equal(aWeeks[0][0].sDate, '2026-09-28', 'weeks start on Monday');
  const oDay = aWeeks.flat().find((oItem) => oItem.sDate === '2026-10-21');
  assert.deepEqual(oDay.aVersions.map((oVersion) => oVersion.sId), ['x'], 'archived versions are hidden');
  assert.equal(isVersionOverdue({ iState: UNRELEASED, sReleaseDate: '2026-10-20' }, '2026-10-21'), true);
  assert.equal(isVersionOverdue({ iState: RELEASED, sReleaseDate: '2026-10-20' }, '2026-10-21'), false);
});

// ── Advanced query ─────────────────────────────────────────────

const rule = (sField, sOp, aValues = []) => ({ sField, sOp, aValues });
const query = (aItems, sJoin = 'and') => ({ sJoin, aItems });
const NOW = new Date(2026, 9, 21, 12);
const CUSTOM_FIELDS = [
  { sId: id(700), sName: 'Severity', iType: 100000004, aOptions: ['Major', 'Minor'], bActive: true },
  { sId: id(701), sName: 'Cost', iType: 100000001, bActive: true },
  { sId: id(702), sName: 'Customer', iType: 100000003, bActive: true },
];
const CONTEXT = { sUserId: ME, oNow: NOW, aCustomFields: CUSTOM_FIELDS, sLabelCollection: 'wd_issue_issuelabel', sCustomValueCollection: 'wd_issue_customfieldvalue' };

test('query: only allowlisted fields, operators and values survive sanitising', () => {
  const oClean = sanitiseQuery(query([
    rule('status', 'in', [TODO, 999, 'x']),
    rule('wd_status eq 1 or true', 'in', [TODO]),
    rule('summary', 'in', ['x']),
    rule('cf:not-a-guid', 'isEmpty'),
    rule('assignee', 'in', ['me', 'robert\'); drop', PRIYA.toUpperCase()]),
    rule('dueDate', 'lastDays', [0]),
    query([query([rule('status', 'in', [DONE])])]),
    { sField: 'type', sOp: 'in', aValues: [TASK], sExtra: 'ignored' },
  ], 'xor'));
  assert.equal(oClean.sJoin, 'and');
  assert.deepEqual(oClean.aItems, [
    rule('status', 'in', [TODO]),
    rule('assignee', 'in', ['me', PRIYA]),
    rule('type', 'in', [TASK]),
  ], 'unknown fields, invalid operators, bad values, empty rules and doubly nested groups are dropped');
  assert.equal(sanitiseQuery({ aItems: [] }), null);
  assert.equal(sanitiseQuery('{"aItems":[]}'), null);
  const oMany = sanitiseQuery(query(Array.from({ length: LIMITS.queryRulesMax + 5 }, () => rule('status', 'in', [TODO]))));
  assert.equal(oMany.aItems.length, LIMITS.queryRulesMax);
});

test('query: rules translate to exact OData, with escaping, unquoted GUIDs and explicit null handling', () => {
  const fnOne = (oRule) => buildQueryFilter(query([oRule]), CONTEXT);
  assert.equal(fnOne(rule('status', 'in', [TODO, PROGRESS])), `(wd_status eq ${TODO} or wd_status eq ${PROGRESS})`);
  assert.equal(fnOne(rule('statusCategory', 'in', ['done'])), `(wd_status eq ${DONE} or wd_status eq ${CLOSED})`);
  assert.equal(fnOne(rule('type', 'notIn', [BUG])), `wd_issuetype ne ${BUG}`);
  assert.equal(fnOne(rule('assignee', 'notIn', ['me'])), `(_wd_assignee_value eq null or _wd_assignee_value ne ${ME})`, '"none of" includes unassigned');
  assert.equal(fnOne(rule('fixVersion', 'isEmpty')), '_wd_fixversion_value eq null');
  assert.equal(fnOne(rule('storyPoints', 'ne', [3])), '(wd_storypoints ne null and wd_storypoints ne 3)', 'comparisons never match empty values');
  assert.equal(fnOne(rule('timeSpent', 'ge', [240])), 'wd_timespent ge 240');
  assert.equal(fnOne(rule('summary', 'contains', ["x') or (wd_archived eq true"])), "contains(wd_summary,'x'') or (wd_archived eq true')");
  assert.equal(fnOne(rule('summary', 'notContains', ['bug'])), "not contains(wd_summary,'bug')");
  assert.equal(fnOne(rule('label', 'hasNone', [id(42)])), `not wd_issue_issuelabel/any(o:o/_wd_label_value eq ${id(42)})`);
  assert.equal(fnOne(rule('dueDate', 'lastDays', [7])), '(wd_duedate ge 2026-10-14 and wd_duedate le 2026-10-21)');
  assert.equal(fnOne(rule('dueDate', 'before', ['2026-11-01'])), 'wd_duedate lt 2026-11-01');
  assert.equal(fnOne(rule('created', 'on', ['2026-10-01'])), `(createdon ge ${new Date(2026, 9, 1).toISOString()} and createdon lt ${new Date(2026, 9, 2).toISOString()})`);
  assert.equal(fnOne(rule(`cf:${id(700)}`, 'notIn', ["Maj'or"])), `not wd_issue_customfieldvalue/any(o:o/_wd_customfield_value eq ${id(700)} and o/wd_textvalue eq 'Maj''or')`);
  assert.equal(fnOne(rule(`cf:${id(701)}`, 'gt', [2.5])), `wd_issue_customfieldvalue/any(o:o/_wd_customfield_value eq ${id(701)} and o/wd_numbervalue gt 2.5)`);
  assert.equal(fnOne(rule(`cf:${id(702)}`, 'isEmpty')), `not wd_issue_customfieldvalue/any(o:o/_wd_customfield_value eq ${id(702)} and o/wd_booleanvalue ne null)`);
  const sGroup = buildQueryFilter(query([rule('priority', 'in', [100000004]), query([rule('assignee', 'isEmpty'), rule('dueDate', 'isNotEmpty')], 'and')], 'or'), CONTEXT);
  assert.equal(sGroup, '(wd_priority eq 100000004 or (_wd_assignee_value eq null and wd_duedate ne null))');
});

test('query: unknown or retired-away custom fields, "me" without a user and missing navigations are refused', () => {
  assert.throws(() => buildQueryFilter(query([rule(`cf:${id(799)}`, 'isEmpty')]), CONTEXT), (oError) => oError.code === ERROR_CODES.invalidQuery);
  assert.throws(() => buildQueryFilter(query([rule('assignee', 'in', ['me'])]), { ...CONTEXT, sUserId: '' }), (oError) => oError.code === ERROR_CODES.invalidQuery);
  assert.throws(() => buildQueryFilter(query([rule('label', 'hasAny', [id(1)])]), { ...CONTEXT, sLabelCollection: '' }), (oError) => oError.code === ERROR_CODES.invalidQuery);
  assert.throws(() => buildQueryFilter(query([rule(`cf:${id(701)}`, 'gt', ['abc'])]), CONTEXT), (oError) => oError.code === ERROR_CODES.invalidQuery);
  assert.throws(() => buildQueryFilter({ aItems: [] }, CONTEXT), (oError) => oError.code === ERROR_CODES.invalidQuery);
});

test('query: validateQuery reports each problem by path instead of dropping it', () => {
  const { bValid, aErrors } = validateQuery(query([rule('status', 'in', []), query([rule('dueDate', 'lastDays', [0]), rule('nope', 'in', [1])]), query([])]), CUSTOM_FIELDS);
  assert.equal(bValid, false);
  assert.deepEqual(aErrors.map((oError) => oError.sPath), ['0', '1.0', '1.1', '2']);
  assert.equal(validateQuery(query([]), CUSTOM_FIELDS).aErrors[0].sPath, '');
  const oValid = validateQuery(query([rule(`cf:${id(700).toUpperCase()}`, 'in', ['Major'])]), CUSTOM_FIELDS);
  assert.equal(oValid.bValid, true);
  assert.equal(oValid.oQuery.aItems[0].sField, `cf:${id(700)}`);
  assert.deepEqual(queryOperatorsFor(getQueryField(`cf:${id(702)}`, CUSTOM_FIELDS)), ['isTrue', 'isFalse', 'isEmpty']);
});

test('query: the in-memory matcher agrees with the OData semantics on a small dataset', () => {
  const aIssues = [
    { sId: id(1), sKey: 'P-1', sSummary: 'Login bug', iStatus: TODO, iType: BUG, iPriority: 100000004, sAssigneeId: ME, iStoryPoints: 3, sDueDate: '2026-10-15', sCreatedOn: '2026-10-01T10:00:00Z', iTimeSpent: 300 },
    { sId: id(2), sKey: 'P-2', sSummary: 'Report', iStatus: DONE, iType: TASK, iPriority: 100000002, sAssigneeId: '', iStoryPoints: null, sDueDate: '', sCreatedOn: '2026-10-10T10:00:00Z', iTimeSpent: 0 },
    { sId: id(3), sKey: 'P-3', sSummary: 'Export', iStatus: PROGRESS, iType: TASK, iPriority: 100000001, sAssigneeId: PRIYA, iStoryPoints: 5, sDueDate: '2026-10-25', sCreatedOn: '2026-10-20T10:00:00Z', iTimeSpent: 60 },
  ];
  const oLabels = { [id(1)]: [id(42)], [id(2)]: [], [id(3)]: [id(43)] };
  const oCustom = { [id(1)]: { [id(700)]: 'Major' }, [id(2)]: {}, [id(3)]: { [id(700)]: 'Minor', [id(702)]: true } };
  const fnRun = (oQuery) => aIssues.filter((oIssue) => matchesQuery(oIssue, oQuery, { ...CONTEXT, aLabelIds: oLabels[oIssue.sId], oCustomValues: oCustom[oIssue.sId] })).map((oIssue) => oIssue.sKey);
  assert.deepEqual(fnRun(query([rule('assignee', 'notIn', ['me'])])), ['P-2', 'P-3']);
  assert.deepEqual(fnRun(query([rule('storyPoints', 'ne', [3])])), ['P-3']);
  assert.deepEqual(fnRun(query([rule('statusCategory', 'notIn', ['done']), rule('label', 'hasNone', [id(42)])])), ['P-3']);
  assert.deepEqual(fnRun(query([rule('dueDate', 'lastDays', [7]), rule('dueDate', 'nextDays', [7])], 'or')), ['P-1', 'P-3']);
  assert.deepEqual(fnRun(query([rule(`cf:${id(700)}`, 'notIn', ['Major'])])), ['P-2', 'P-3']);
  assert.deepEqual(fnRun(query([rule(`cf:${id(702)}`, 'isTrue')])), ['P-3']);
  assert.deepEqual(fnRun(query([rule('summary', 'contains', ['REP'])])), ['P-2']);
  assert.deepEqual(fnRun(query([rule('created', 'after', ['2026-10-10'])])), ['P-3']);
  assert.deepEqual(fnRun(query([rule('timeSpent', 'ge', [60]), query([rule('type', 'in', [BUG]), rule('priority', 'in', [100000001])], 'or')])), ['P-1', 'P-3']);
});

test('query: saved filter criteria keep a sanitised query, "me" resolves per viewer and the project is still forced', () => {
  const oCriteria = sanitiseFilterCriteria({ oQuery: query([rule('assignee', 'in', ['me']), rule('bogus', 'in', [1])]), sFixVersionId: 'none' });
  assert.deepEqual(oCriteria, { sFixVersionId: 'none', oQuery: query([rule('assignee', 'in', ['me'])]) });
  const oResolved = resolveFilterCriteria(oCriteria, PRIYA, PROJECT);
  assert.deepEqual(oResolved.oQuery.aItems[0].aValues, [PRIYA]);
  assert.equal(oResolved.sProjectId, PROJECT);
  assert.equal(buildIssueFilter(oResolved, CONTEXT), `(wd_archived eq false or wd_archived eq null) and _wd_project_value eq ${PROJECT} and _wd_fixversion_value eq null and (_wd_assignee_value eq ${PRIYA})`);
  assert.deepEqual(resolveQueryUser(query([rule('reporter', 'in', ['me'])]), ME).aItems[0].aValues, [ME]);
  assert.deepEqual(queryUsesFields(query([rule('label', 'hasAny', [id(1)]), query([rule(`cf:${id(700)}`, 'isEmpty')])])), { bLabels: true, bCustomFields: true });
  assert.equal(matchesIssueCriteria({ sId: id(1), sSummary: '', sKey: '', iStatus: TODO, sFixVersionId: '' }, { sFixVersionId: 'none' }), true);
  assert.match(describeQuery(query([rule('status', 'in', [TODO]), rule('assignee', 'isEmpty')], 'or')), /^Status is any of To Do or Assignee is empty$/);
});

// ── Analytics ──────────────────────────────────────────────────
// Times are midday UTC mid-week so local Monday week boundaries don't move issues between buckets in any time zone.

const resolved = (sKey, sCreated, sResolved, oExtra = {}) => ({ sId: sKey, sKey, iStatus: DONE, sCreatedOn: sCreated, sResolvedOn: sResolved, ...oExtra });
const DATASET = [
  resolved('I1', '2026-09-28T12:00:00Z', '2026-09-30T12:00:00Z', { sStartedOn: '2026-09-29T12:00:00Z', iStoryPoints: 3, iOriginalEstimate: 480, iTimeSpent: 600 }),
  resolved('I2', '2026-10-01T12:00:00Z', '2026-10-08T12:00:00Z', { sStartedOn: '2026-10-04T12:00:00Z', iStoryPoints: 5, iOriginalEstimate: 960, iTimeSpent: 720 }),
  resolved('I3', '2026-10-04T12:00:00Z', '2026-10-08T12:00:00Z', { iStoryPoints: null }),
  resolved('I4', '2026-10-05T12:00:00Z', '2026-10-15T12:00:00Z', { sStartedOn: '2026-10-13T12:00:00Z', iStoryPoints: 2 }),
  resolved('I5', '2026-10-20T12:00:00Z', '2026-10-21T09:00:00Z', { sStartedOn: '2026-10-20T12:00:00Z', iStoryPoints: 1 }),
  resolved('ARCHIVED', '2026-10-01T12:00:00Z', '2026-10-02T12:00:00Z', { bArchived: true }),
  { ...resolved('REOPENED', '2026-10-01T12:00:00Z', '2026-10-02T12:00:00Z'), iStatus: TODO },
  resolved('OLD', '2026-08-01T12:00:00Z', '2026-08-05T12:00:00Z'),
];

test('analytics: percentiles use nearest rank; lead and cycle time follow the documented definitions', () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4], 0.85), 4);
  assert.equal(percentile([], 0.5), null);
  assert.deepEqual(summariseDurations([]), { iCount: 0, fMedian: null, fP85: null, fAverage: null });
  const aWindow = DATASET.filter((oIssue) => oIssue.sKey !== 'OLD');
  assert.deepEqual(computeLeadTimes(aWindow), { iCount: 5, fMedian: 4, fP85: 10, fAverage: 4.8 }, 'archived and reopened issues are excluded');
  assert.deepEqual(computeCycleTimes(aWindow), { iCount: 4, fMedian: 1, fP85: 4, fAverage: 2, iNotStarted: 1 });
});

test('analytics: throughput, overdue trend, sprint outcomes and estimate accuracy against the test dataset', () => {
  const aBuckets = buildWeekBuckets(NOW, 4);
  assert.deepEqual(aBuckets.map((oBucket) => oBucket.sStart), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
  assert.equal(aBuckets[3].bCurrent, true);
  const aThroughput = computeThroughput(DATASET, NOW, 4);
  assert.deepEqual(aThroughput.map((oBucket) => [oBucket.iIssues, oBucket.iPoints]), [[1, 3], [2, 5], [1, 2], [1, 1]]);
  const aDue = [
    { sKey: 'D1', iStatus: TODO, sDueDate: '2026-10-01', sCreatedOn: '2026-09-20T12:00:00Z', sResolvedOn: '' },
    { sKey: 'D2', iStatus: DONE, sDueDate: '2026-10-07', sCreatedOn: '2026-10-01T12:00:00Z', sResolvedOn: '2026-10-14T12:00:00Z' },
    { sKey: 'D3', iStatus: TODO, sDueDate: '2026-10-20', sCreatedOn: '2026-10-10T12:00:00Z', sResolvedOn: '' },
    { sKey: 'D4', iStatus: TODO, sDueDate: '2026-10-01', sCreatedOn: '2026-09-20T12:00:00Z', sResolvedOn: '', bArchived: true },
  ];
  assert.deepEqual(computeOverdueTrend(aDue, NOW, 4).map((oBucket) => oBucket.iOverdue), [1, 2, 1, 2]);
  const aOutcomes = summariseSprintOutcomes([
    { sId: 's1', sName: 'S1', iState: 100000002, sCompletedOn: '2026-09-15T00:00:00Z', iCommittedPoints: 10, iCompletedPoints: 8 },
    { sId: 's2', sName: 'S2', iState: 100000002, sCompletedOn: '2026-09-29T00:00:00Z', iCommittedPoints: 0, iCompletedPoints: 4 },
    { sId: 's3', sName: 'S3', iState: 100000001, sCompletedOn: '' },
  ], 6);
  assert.deepEqual(aOutcomes.map((oSprint) => [oSprint.sName, oSprint.fSayDo]), [['S1', 80], ['S2', null]], 'oldest first; no committed points = no ratio');
  const oTime = summariseTimeTracking([{ iOriginalEstimate: 120, iRemainingEstimate: 60, iTimeSpent: 30 }, { iOriginalEstimate: null, iRemainingEstimate: null }], DATASET.slice(0, 2));
  assert.deepEqual(oTime, { iOpenOriginal: 120, iOpenRemaining: 60, iOpenSpent: 30, iOpenUnestimated: 1, iResolvedSpent: 1320, iEstimatedIssues: 2, fAccuracy: 91.7 });
  const oReport = buildAnalytics({ aResolved: DATASET, aDueDated: aDue, aSprints: [], aOpen: [] }, NOW, 4);
  assert.equal(oReport.oLeadTime.iCount, 5, 'issues resolved before the window are ignored even if passed in');
});

// ── CSV ────────────────────────────────────────────────────────

test('csv: cells that a spreadsheet could execute are neutralised and quoting follows RFC 4180', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('a, b'), '"a, b"');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell(null), '');
  assert.equal(buildCsv(['A', 'B'], [[1, 'x']]), 'A,B\r\n1,x');
  const sExport = issuesToCsv([{ sKey: 'P-1', sSummary: '=cmd', iType: BUG, iStatus: DONE, iPriority: 100000003, iResolution: 100000000, sAssigneeId: ME, sAssigneeName: 'Me', aLabels: [{ sName: 'a' }, { sName: 'b' }], iOriginalEstimate: 480, iTimeSpent: 90, sCreatedOn: '2026-10-01T00:00:00Z' }]);
  assert.match(sExport.split('\r\n')[1], /^P-1,'=cmd,Bug,Done,High,Done,Me,,,,a; b,,1d,,1h 30m,,,2026-10-01T00:00:00.000Z,,$/);
});

test('csv: the parser handles quotes, embedded newlines, CRLF, a BOM and blank lines, and reports unclosed quotes', () => {
  const { aRows } = parseCsv('\uFEFFSummary,Labels\r\n"Has ""quotes"", and comma","a;b"\n\n"multi\nline",x\r\n');
  assert.deepEqual(aRows, [['Summary', 'Labels'], ['Has "quotes", and comma', 'a;b'], ['multi\nline', 'x']]);
  assert.ok(parseCsv('Summary\n"never closed').sError);
  const oMap = mapCsvHeaders(['SUMMARY', 'Issue Type', 'Colour', 'Title']);
  assert.deepEqual(oMap.aIgnored, ['Colour']);
  assert.deepEqual(oMap.aDuplicates, ['Title']);
});

test('csv import: a dry run maps columns, validates every row and never trusts unknown people, versions or statuses', () => {
  const oContext = {
    sProjectId: PROJECT,
    aMembers: [{ sUserId: ME, sUserName: 'Alex Morgan', sEmail: 'alex@contoso.com' }, { sUserId: PRIYA, sUserName: 'Sam Lee', sEmail: 'sam1@contoso.com' }, { sUserId: id(3), sUserName: 'Sam Lee', sEmail: 'sam2@contoso.com' }],
    aVersions: [{ sId: id(800), sName: '2.0', iState: UNRELEASED }, { sId: id(801), sName: 'Old', iState: ARCHIVED }],
  };
  const sCsv = [
    'Summary,Type,Priority,Assignee,Labels,Story points,Due date,Original estimate,Fix version,Status',
    'Good one,bug,HIGH,ALEX@contoso.com,Front End; api,3,2026-12-01,1d 4h,2.0,Done',
    ',Task,,,,,,,,',
    'Ambiguous,Task,,Sam Lee,,,,,,',
    'Bad values,Story,Urgent,Nobody,,7.5,01/12/2026,3,Old,',
    'Good one,,,,,,,,,',
  ].join('\n');
  const oPlan = planCsvImport(sCsv, oContext);
  assert.equal(oPlan.sError, '');
  assert.deepEqual(oPlan.aIgnored, ['Status']);
  assert.deepEqual(oPlan.aRows.map((oRow) => oRow.sOutcome), ['create', 'error', 'error', 'error', 'create']);
  const oGood = oPlan.aRows[0].oDraft;
  assert.deepEqual({ iType: oGood.iType, iPriority: oGood.iPriority, sAssigneeId: oGood.sAssigneeId, aLabels: oGood.aLabels, iStoryPoints: oGood.iStoryPoints, sDueDate: oGood.sDueDate, iOriginalEstimate: oGood.iOriginalEstimate, sFixVersionId: oGood.sFixVersionId },
    { iType: BUG, iPriority: 100000003, sAssigneeId: ME, aLabels: ['front-end', 'api'], iStoryPoints: 3, sDueDate: '2026-12-01', iOriginalEstimate: 720, sFixVersionId: id(800) });
  assert.equal(oGood.iStatus, undefined, 'status is never imported');
  assert.match(oPlan.aRows[2].aErrors.join(' '), /More than one member/);
  assert.equal(oPlan.aRows[3].aErrors.length, 6, 'priority, assignee, points, date, estimate and archived version');
  assert.match(oPlan.aRows[4].aWarnings.join(' '), /line 2/);
  assert.equal(planCsvImport('Title\n', oContext).sError, 'The file has a header row but no issues.');
  assert.match(planCsvImport('Type\nBug', oContext).sError, /summary/);
  assert.match(planCsvImport(`Summary\n${Array.from({ length: LIMITS.csvImportMax + 1 }, (unused, iIndex) => `Row ${iIndex}`).join('\n')}`, oContext).sError, /up to/);
});

// ── Dependencies ───────────────────────────────────────────────

test('dependencies: blockers sit left of what they block, loops are flagged, isolated issues are counted not drawn', () => {
  const issue = (sKey, iStatus = TODO) => ({ sId: sKey, sKey: `P-${sKey}`, sSummary: sKey, iStatus, iType: TASK });
  const aIssues = ['A', 'B', 'C', 'D', 'E', 'X', 'Y', 'Z', 'LONE'].map((sKey) => issue(sKey));
  const link = (sFrom, sTo, iType = BLOCKS) => ({ sId: `${sFrom}${sTo}${iType}`, sFromId: sFrom, sToId: sTo, iType });
  const aLinks = [link('A', 'B'), link('B', 'C'), link('D', 'C'), link('E', 'A', RELATES), link('X', 'Y'), link('Y', 'Z'), link('Z', 'X'), link('A', 'B'), link('A', 'OUTSIDE')];
  const oGraph = buildDependencyGraph(aIssues, aLinks);
  const oNode = (sId) => oGraph.aNodes.find((oItem) => oItem.sId === sId);
  assert.deepEqual(['A', 'D', 'B', 'C'].map((sId) => oNode(sId).iLevel), [0, 0, 1, 2]);
  assert.deepEqual(['X', 'Y', 'Z'].map((sId) => oNode(sId).bCycle), [true, true, true]);
  assert.equal(oNode('X').iLevel, 3, 'loops go after every layer');
  assert.equal(oGraph.aEdges.filter((oEdge) => oEdge.bCycle).length, 3);
  assert.equal(oNode('E'), undefined, '"relates to" links are hidden unless asked for');
  assert.equal(oGraph.iIsolated, 2, 'E and LONE');
  assert.equal(oGraph.aEdges.length, 6, 'duplicates and links leaving the issue set are dropped');
  assert.equal(oNode('B').bBlocked, true);
  assert.equal(oNode('A').bBlocked, false);
  const oDoneBlocker = buildDependencyGraph([issue('A', DONE), issue('B')], [link('A', 'B')]);
  assert.equal(oDoneBlocker.aNodes.find((oItem) => oItem.sId === 'B').bBlocked, false, 'a done blocker no longer blocks');
  const oRelated = buildDependencyGraph(aIssues, aLinks, { bIncludeRelated: true });
  assert.equal(oRelated.aNodes.some((oItem) => oItem.sId === 'E'), true);
  assert.equal(oRelated.aNodes.find((oItem) => oItem.sId === 'E').iLevel, 0, 'related links never change layers');
});
