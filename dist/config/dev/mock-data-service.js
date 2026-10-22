// Local development double for dist/js/data-service.js. Same exports, in-memory data, simulated latency.
// Loaded only when dist/index.html is opened on localhost with ?mock. Never deployed (lives outside dist/).
// Test hook: window.piraMock.failNext('createIssue') makes the next call to that function reject.
import {
  ISSUE_STATUSES, PROJECT_TYPES, MEMBER_ROLES, HISTORY_EVENTS, PAGING, KEY_ALLOCATION_RETRIES, RECENTLY_UPDATED_DAYS,
  BOARD_TYPE, BOARD_TYPES, SPRINT_STATE, PRIORITIES, LIMITS, FILTER_VISIBILITY, VERSION_STATE, VERSION_STATES, ANALYTICS,
} from '../../dist/config/app-config.js';
import {
  ERROR_CODES, createDomainError, normaliseProjectKey, validateProjectDraft, formatIssueKey, validateIssueDraft,
  validateParent, validateCommentBody, assertTransition, isDoneStatus, rankBetween, normaliseLabels, matchesIssueCriteria,
  buildMyWorkCriteria, compareRank, diffDisplayValues, truncateText, getIssueStatus, getIssueType, getPriority,
  formatDateOnly, toDateOnly, addDays, isRankOrdered, isValidRank, validateTypeChange, getAllowedParentTypes, formatStoryPoints,
  validateSprintDraft, assertSprintTransition, isSprintLocked, isSprintOpen, computeSprintMetrics, describeScopeChange,
  planSprintCompletion, LINK_CHOICES, describeLink, validateIssueLink, getProjectPermissions,
  DEFAULT_WORKFLOW, getTransitionRequirements, assertTransitionFields, validateWorkflow, removedStatuses, normaliseRequirements,
  getProjectTemplate, buildTemplateWorkflow, getResolution, isValidResolution, isValidStoryPoints, isValidDateOnly,
  validateCustomFieldDraft, parseChoiceOptions, customFieldAppliesTo, normaliseCustomFieldValue, formatCustomFieldValue,
  sanitiseFilterCriteria, validateSavedFilterDraft, validateBulkChange, planBulkEdit, describeBulkChange, extractMentions,
  finaliseNotifications, planAssignmentNotifications, planStatusNotifications, planCommentNotifications, planBulkNotifications,
  enabledNotificationEvents, normaliseNotificationPreferences, sanitiseFileName, validateAttachment, toFriendlyMessage,
  assertFeature, isFeatureEnabled, formatDuration, isValidEstimate, validateWorkLog, validateVoidReason, remainingAfterLog, remainingForNewEstimate,
  sumWorkLogMinutes, validateVersionDraft, isVersionNameTaken, isVersionArchived, planVersionRelease, computeVersionProgress, sortVersions,
  buildAnalytics, issuesToCsv, planCsvImport, buildDependencyGraph, getStatusCategory,
  isStoryType, isEpicType, normaliseSolutionVersion, filterEnvironments, normaliseDataverseUrl, validateEpicSolutionDraft, describeEpicSolution,
  isLinkedSolution, getSolutionStage, buildStoryVersionCheck, isValidSolutionUniqueName, assertGuid,
} from '../../dist/js/domain.js';

const LATENCY_MS = 140;
const LEAD = MEMBER_ROLES[0].value, CONTRIBUTOR = MEMBER_ROLES[1].value, STAKEHOLDER = MEMBER_ROLES[2].value;
const oFailures = new Set();
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

async function simulate(sOperation, fnWork) {
  await new Promise((fnResolve) => { setTimeout(fnResolve, LATENCY_MS); });
  if (oFailures.has(sOperation)) {
    oFailures.delete(sOperation);
    throw new Error(sOperation.startsWith('list') || sOperation.startsWith('get')
      ? 'Failed to fetch' : 'Principal user is missing prvWritewd_issue privilege (0x80040220)');
  }
  return clone(await fnWork());
}

function page(aItems, sSkipToken, iPageSize) {
  const iStart = Number(sSkipToken) || 0;
  const aSlice = aItems.slice(iStart, iStart + iPageSize);
  return { aSlice, sNextToken: iStart + iPageSize < aItems.length ? String(iStart + iPageSize) : '', iCount: aItems.length };
}

// ── Seed data ──────────────────────────────────────────────────

const oDb = {
  users: [], directory: [], projects: [], members: [], sequences: new Map(), boards: [], boardIssues: [], sprints: [], issues: [],
  comments: [], history: [], labels: [], issueLabels: [], links: [],
  workflows: new Map(), customFields: [], customValues: [], savedFilters: [], notifications: [], preferences: new Map(), attachments: [],
  versions: [], workLogs: [], environments: [], solutions: new Map(), epicSolutions: [],
};
let sMeId = '';

const defaultColumns = (bWip, aStatuses = DEFAULT_WORKFLOW.aStatuses) => aStatuses.map((iStatus, iIndex) => ({ sId: uid(), sName: getIssueStatus(iStatus).label, iOrder: iIndex, iStatus, iWipLimit: bWip && getIssueStatus(iStatus).key === 'progress' ? 3 : 0 }));

function seed() {
  const aPeople = ['Alex Morgan', 'Priya Shah', 'Jordan Lee', 'Sam Ortiz', 'Riley Kim', 'Casey Nguyen', 'Taylor Brooks', 'Morgan Ellis'];
  oDb.users = aPeople.map((sName) => ({ sId: uid(), sName, sEmail: `${sName.toLowerCase().replace(' ', '.')}@contoso.com`, sObjectId: uid(), bProvisioned: true }));
  // Entra people who have no Dataverse user yet (shown, but can't be added until an admin provisions them).
  oDb.directory = ['Jamie Fox', 'Robin Patel'].map((sName) => ({ sId: '', sName, sEmail: `${sName.toLowerCase().replace(' ', '.')}@contoso.com`, sObjectId: uid(), bProvisioned: false }));
  sMeId = oDb.users[0].sId;
  const [oMe, oPriya, oJordan, oSam, oRiley] = oDb.users;
  const fnProject = (sName, sKey, iType, sLeadId, bArchived = false, sDescription = '') => {
    const oProject = { sId: uid(), sName, sKey, sDescription, iType, bArchived, sLeadId, sLeadName: oDb.users.find((oUser) => oUser.sId === sLeadId).sName, sCreatedOn: addDays(new Date(), -40).toISOString() };
    oDb.projects.push(oProject);
    oDb.sequences.set(oProject.sId, 1);
    oDb.boards.push({ sProjectId: oProject.sId, sId: uid(), sName: `${sKey} board`, iType: BOARD_TYPE.kanban, bDefault: true, bActive: true, aColumns: defaultColumns(true) });
    return oProject;
  };
  const oPira = fnProject('Pira Platform', 'PIRA', PROJECT_TYPES[1].value, oMe.sId, false, 'Jira-inspired work management on Dataverse. Phase 2: backlog, sprints, epics, story points and links.');
  const oWeb = fnProject('Website Revamp', 'WEB', PROJECT_TYPES[0].value, oPriya.sId, false, 'Refresh of the public marketing site.');
  const oOps = fnProject('Ops Toolkit', 'OPS', PROJECT_TYPES[2].value, oJordan.sId, false, 'Internal operations scripts and runbooks.');
  fnProject('Legacy Intranet', 'LEG', PROJECT_TYPES[2].value, oMe.sId, true, 'Archived intranet migration.');
  const oDesignBoard = { sProjectId: oPira.sId, sId: uid(), sName: 'Design board', iType: BOARD_TYPE.kanban, bDefault: false, bActive: true, aColumns: defaultColumns(false) };
  oDb.boards.push(oDesignBoard);
  const fnMember = (oProject, oUser, iRole) => oDb.members.push({ sId: uid(), sProjectId: oProject.sId, sProjectName: oProject.sName, sUserId: oUser.sId, sUserName: oUser.sName, iRole, bActive: true, sJoinedOn: oProject.sCreatedOn });
  [[oMe, LEAD], [oPriya, CONTRIBUTOR], [oJordan, CONTRIBUTOR], [oSam, CONTRIBUTOR], [oRiley, STAKEHOLDER]].forEach(([oUser, iRole]) => fnMember(oPira, oUser, iRole));
  [[oPriya, LEAD], [oMe, CONTRIBUTOR], [oSam, CONTRIBUTOR]].forEach(([oUser, iRole]) => fnMember(oWeb, oUser, iRole));
  [[oJordan, LEAD], [oMe, STAKEHOLDER]].forEach(([oUser, iRole]) => fnMember(oOps, oUser, iRole));
  fnMember(oDb.projects[3], oMe, LEAD);

  const oDefaultPira = oDb.boards.find((oBoard) => oBoard.sProjectId === oPira.sId && oBoard.bDefault);
  const fnSprint = (sName, iState, iStartOffset, sGoal) => {
    const oSprint = {
      sId: uid(), sName, sProjectId: oPira.sId, sBoardId: oDefaultPira.sId, sGoal, iState,
      sStartDate: iState === SPRINT_STATE.planned ? '' : toDateOnly(addDays(new Date(), iStartOffset)),
      sEndDate: iState === SPRINT_STATE.planned ? '' : toDateOnly(addDays(new Date(), iStartOffset + 13)),
      sStartedOn: iState === SPRINT_STATE.planned ? '' : addDays(new Date(), iStartOffset).toISOString(),
      sCompletedOn: iState === SPRINT_STATE.completed ? addDays(new Date(), iStartOffset + 13).toISOString() : '', sCorrectionNote: '',
      iCommittedIssues: 0, iCommittedPoints: 0, iCompletedIssues: 0, iCompletedPoints: 0, iIncompleteIssues: 0, iIncompletePoints: 0,
      sCreatedOn: addDays(new Date(), iStartOffset - 2).toISOString(),
    };
    oDb.sprints.push(oSprint);
    return oSprint;
  };
  const oSprint1 = fnSprint('PIRA Sprint 1', SPRINT_STATE.completed, -20, 'Ship the Phase 1 foundation.');
  const oSprint2 = fnSprint('PIRA Sprint 2', SPRINT_STATE.active, -6, 'Backlog, sprints and story points.');
  fnSprint('PIRA Sprint 3', SPRINT_STATE.planned, 8, '');

  const fnDate = (iDays) => toDateOnly(addDays(new Date(), iDays));
  // [project, summary, type, status, priority, assignee, reporter, labels, due, points, sprint]
  const aSeed = [
    [oPira, 'Allocate issue keys server-side with a sequence table', 2, 3, 3, oMe, oPriya, ['backend'], fnDate(7), 5, oSprint1],
    [oPira, 'Board drag-and-drop loses rank after refresh', 1, 1, 4, oPriya, oJordan, ['board'], fnDate(-2), 3, oSprint2],
    [oPira, 'Comment composer supports @mentions', 2, 1, 2, oJordan, oMe, ['ux'], '', 8, oSprint2],
    [oPira, 'My Work overdue tab shows resolved issues', 1, 2, 3, oMe, oRiley, ['my-work'], fnDate(-4), 2, oSprint2],
    [oPira, 'Project settings — member roles', 0, 0, 2, oMe, oMe, ['settings'], fnDate(16), null, oSprint2],
    [oPira, 'Issue history timeline', 0, 3, 1, oRiley, oSam, ['history'], '', 3, oSprint2],
    [oPira, 'Phase 2 — Agile delivery', 3, 1, 2, oMe, oMe, ['roadmap'], fnDate(45), null, null],
    [oPira, 'Keyboard shortcuts: C to create, / to search', 0, 0, 0, oPriya, oJordan, ['a11y'], '', 1, null],
    [oPira, 'Archive projects instead of deleting them', 2, 0, 2, null, oPriya, ['projects'], '', 5, null],
    [oPira, 'Search by key and summary with paging', 2, 3, 3, oJordan, oMe, ['search'], '', 3, oSprint1],
    [oPira, 'Empty and error states for the board', 0, 0, 1, oSam, oRiley, ['ux'], fnDate(3), null, null],
    [oPira, 'Status change writes a history event', 1, 0, 2, oRiley, oPriya, ['backend'], '', 2, null],
    [oWeb, 'Hero banner fails contrast check', 1, 0, 3, oMe, oPriya, ['a11y'], fnDate(-1), null, null],
    [oWeb, 'Footer links open in the same tab', 0, 0, 1, oSam, oMe, [], '', null, null],
    [oOps, 'Rotate integration connection owner', 0, 1, 2, oJordan, oJordan, [], fnDate(2), null, null],
  ];
  const oLastRank = new Map();
  aSeed.forEach(([oProject, sSummary, iTypeIndex, iStatusIndex, iPriorityIndex, oAssignee, oReporter, aLabels, sDue, iPoints, oSprint], iIndex) => {
    const iNumber = oDb.sequences.get(oProject.sId);
    oDb.sequences.set(oProject.sId, iNumber + 1);
    const iStatus = ISSUE_STATUSES[iStatusIndex].value;
    const sRank = rankBetween(oLastRank.get(oProject.sId) || '', '');
    oLastRank.set(oProject.sId, sRank);
    const sCreated = addDays(new Date(), -(20 - iIndex)).toISOString();
    const oIssue = {
      sId: uid(), sKey: formatIssueKey(oProject.sKey, iNumber), sSummary, sDescription: iIndex % 3 === 0 ? 'As a team member I want this to be reliable so that everyday tracking does not need a spreadsheet.\n\nAcceptance criteria:\n- Works with keyboard\n- Shows friendly errors' : '',
      iType: [100000000, 100000001, 100000002, 100000003][iTypeIndex], iStatus, iPriority: 100000000 + iPriorityIndex,
      sProjectId: oProject.sId, sProjectName: oProject.sName, sAssigneeId: oAssignee ? oAssignee.sId : '', sAssigneeName: oAssignee ? oAssignee.sName : '',
      sReporterId: oReporter.sId, sReporterName: oReporter.sName, sParentId: '', sParentKey: '', sDueDate: sDue, sRank, bArchived: false,
      sResolvedOn: isDoneStatus(iStatus) ? sCreated : '', sCreatedOn: sCreated, sModifiedOn: addDays(new Date(), -(iIndex % 6)).toISOString(), aLabels: [],
      iStoryPoints: iPoints, sSprintId: oSprint ? oSprint.sId : '', sSprintName: oSprint ? oSprint.sName : '',
      iResolution: null, iOriginalEstimate: null, iRemainingEstimate: null, iTimeSpent: 0, sFixVersionId: '', sFixVersionName: '', sStartedOn: '',
    };
    oDb.issues.push(oIssue);
    aLabels.forEach((sName) => linkLabel(oIssue, sName));
    oDb.history.push({ sId: uid(), sIssueId: oIssue.sId, iEvent: HISTORY_EVENTS.created, sField: '', sOldValue: '', sNewValue: sSummary, sById: oReporter.sId, sByName: oReporter.sName, sOn: sCreated });
  });
  const oEpic = oDb.issues.find((oIssue) => oIssue.iType === 100000003);
  oDb.issues.filter((oIssue) => oIssue.sProjectId === oPira.sId && oIssue !== oEpic).slice(1, 5).forEach((oIssue) => { oIssue.sParentId = oEpic.sId; oIssue.sParentKey = oEpic.sKey; });
  [oSprint1, oSprint2].forEach((oSprint) => {
    const oMetrics = computeSprintMetrics(oDb.issues.filter((oIssue) => oIssue.sSprintId === oSprint.sId));
    Object.assign(oSprint, { iCommittedIssues: Math.max(0, oMetrics.iIssues - 1), iCommittedPoints: Math.max(0, oMetrics.iPoints - 2) });
    if (oSprint.iState === SPRINT_STATE.completed) Object.assign(oSprint, { iCompletedIssues: oMetrics.iDone, iCompletedPoints: oMetrics.iDonePoints, iIncompleteIssues: 1, iIncompletePoints: 2 });
  });
  oDb.issues.filter((oIssue) => oIssue.sProjectId === oPira.sId && ['ux', 'a11y'].some((sName) => labelsFor(oIssue.sId).some((oLabel) => oLabel.sName === sName)))
    .forEach((oIssue) => oDb.boardIssues.push({ sId: uid(), sBoardId: oDesignBoard.sId, sIssueId: oIssue.sId }));
  const oBug = oDb.issues[1];
  oDb.links.push({ sId: uid(), sFromId: oBug.sId, sToId: oDb.issues[2].sId, iType: 100000000 });
  oDb.links.push({ sId: uid(), sFromId: oDb.issues[3].sId, sToId: oBug.sId, iType: 100000001 });
  oDb.comments.push({ sId: uid(), sIssueId: oBug.sId, sBody: 'Repro: drag twice, then refresh — order resets to created date.', bEdited: false, sEditedOn: '', sAuthorId: oPriya.sId, sAuthorName: oPriya.sName, sCreatedOn: addDays(new Date(), -1).toISOString() });
  oDb.comments.push({ sId: uid(), sIssueId: oBug.sId, sBody: 'I can pair on this tomorrow morning.', bEdited: false, sEditedOn: '', sAuthorId: sMeId, sAuthorName: oMe.sName, sCreatedOn: now() });
  seedPhase3(oPira, oWeb, oPriya, oJordan);
  seedPhase4(oPira, oPriya, oJordan, oSam);
  seedPhase5(oPira);
}

// Phase 3: Website Revamp uses the Bug tracking template; a few notifications from teammates; a shared filter.
function seedPhase3(oPira, oWeb, oPriya, oJordan) {
  const oTemplate = getProjectTemplate('bugs');
  oDb.workflows.set(oWeb.sId, buildTemplateWorkflow(oTemplate));
  oWeb.sTemplateKey = 'bugs';
  const oWebBoard = oDb.boards.find((oBoard) => oBoard.sProjectId === oWeb.sId && oBoard.bDefault);
  oWebBoard.aColumns = defaultColumns(false, oDb.workflows.get(oWeb.sId).aStatuses);
  oTemplate.aCustomFields.forEach((oField, iIndex) => oDb.customFields.push({ sId: uid(), sProjectId: oWeb.sId, sName: oField.sName, iType: oField.iType, sOptions: oField.sOptions, aOptions: parseChoiceOptions(oField.sOptions), aIssueTypes: [...oField.aIssueTypes], sDescription: oField.sDescription, iOrder: iIndex, bActive: true }));
  oDb.customFields.push({ sId: uid(), sProjectId: oPira.sId, sName: 'Customer impact', iType: 100000004, sOptions: 'None\nLow\nHigh', aOptions: ['None', 'Low', 'High'], aIssueTypes: [], sDescription: 'How much customers notice this.', iOrder: 0, bActive: true });
  const oSeverity = oDb.customFields.find((oField) => oField.sName === 'Severity');
  const oHero = oDb.issues.find((oIssue) => oIssue.sProjectId === oWeb.sId && oIssue.iType === 100000001);
  if (oHero) oDb.customValues.push({ sId: uid(), sIssueId: oHero.sId, sFieldId: oSeverity.sId, value: 'Major' });
  const aPira = oDb.issues.filter((oIssue) => oIssue.sProjectId === oPira.sId);
  [[oPriya, aPira[1], 100000001, 'mentioned you in a comment', 30], [oJordan, aPira[4], 100000000, 'assigned you', 90], [oPriya, aPira[3], 100000002, 'In Progress → In Review', 400]]
    .forEach(([oActor, oIssue, iEvent, sDetail, iMinutes]) => oDb.notifications.push({
      sId: uid(), sRecipientId: sMeId, sIssueId: oIssue.sId, sIssueKey: oIssue.sKey, sProjectId: oPira.sId, sProjectName: oPira.sName, iEvent, sDetail, iCount: 1,
      bRead: iMinutes > 300, sActorId: oActor.sId, sActorName: oActor.sName, sCreatedOn: new Date(Date.now() - iMinutes * 60000).toISOString(),
    }));
  oDb.savedFilters.push({ sId: uid(), sName: 'Open bugs', sProjectId: oPira.sId, oCriteria: { aTypes: [100000001], bOpenOnly: true }, iVisibility: FILTER_VISIBILITY[1].value, sOwnerId: oPriya.sId, sOwnerName: oPriya.sName, sModifiedOn: now() });
  oDb.savedFilters.push({ sId: uid(), sName: 'My open work', sProjectId: oPira.sId, oCriteria: { aAssigneeIds: ['me'], bOpenOnly: true }, iVisibility: FILTER_VISIBILITY[0].value, sOwnerId: sMeId, sOwnerName: me().sName, sModifiedOn: now() });
}

// Phase 4: versions, estimates and work logs, resolved history for the reports, and a chain of "blocks" links.
function seedPhase4(oPira, oPriya, oJordan, oSam) {
  const fnDate = (iDays) => toDateOnly(addDays(new Date(), iDays));
  const fnVersion = (sName, iState, iRelease, sDescription) => {
    const oVersion = {
      sId: uid(), sName, sProjectId: oPira.sId, sDescription, sStartDate: fnDate(iRelease - 30), sReleaseDate: fnDate(iRelease), iState,
      sReleasedOn: iState === VERSION_STATE.released ? addDays(new Date(), iRelease).toISOString() : '', sCreatedOn: addDays(new Date(), -60).toISOString(),
    };
    oDb.versions.push(oVersion);
    return oVersion;
  };
  const oV10 = fnVersion('1.0', VERSION_STATE.released, -20, 'Phase 1 foundation.');
  const oV11 = fnVersion('1.1', VERSION_STATE.unreleased, 10, 'Agile delivery.');
  const oV20 = fnVersion('2.0', VERSION_STATE.unreleased, 45, 'Advanced capabilities.');
  fnVersion('0.9 beta', VERSION_STATE.archived, -70, 'Early preview.');
  const aPira = oDb.issues.filter((oIssue) => oIssue.sProjectId === oPira.sId);
  const fnFix = (oIssue, oVersion) => Object.assign(oIssue, { sFixVersionId: oVersion.sId, sFixVersionName: oVersion.sName });
  aPira.filter((oIssue) => isDoneStatus(oIssue.iStatus)).forEach((oIssue) => fnFix(oIssue, oV10));
  aPira.filter((oIssue) => oIssue.sSprintId && !isDoneStatus(oIssue.iStatus)).forEach((oIssue) => fnFix(oIssue, oV11));
  aPira.filter((oIssue) => oIssue.iType === 100000003).forEach((oIssue) => fnFix(oIssue, oV20));
  aPira.filter((oIssue) => getStatusCategory(oIssue.iStatus) !== 'todo').forEach((oIssue) => { oIssue.sStartedOn = addDays(new Date(oIssue.sCreatedOn), 1).toISOString(); });
  [[1, 960, 360], [2, 1920, 1440], [3, 480, 240], [4, 240, null]].forEach(([iIndex, iOriginal, iRemaining]) => Object.assign(aPira[iIndex], { iOriginalEstimate: iOriginal, iRemainingEstimate: iRemaining }));
  const fnLog = (oIssue, oUser, iMinutes, iDaysAgo, sComment, sVoidReason = '') => oDb.workLogs.push({
    sId: uid(), sIssueId: oIssue.sId, iMinutes, sWorkDate: fnDate(-iDaysAgo), sComment, bVoided: Boolean(sVoidReason), sVoidReason, sVoidedOn: sVoidReason ? now() : '',
    sAuthorId: oUser.sId, sAuthorName: oUser.sName, sCreatedOn: addDays(new Date(), -iDaysAgo).toISOString(), sModifiedOn: addDays(new Date(), -iDaysAgo).toISOString(),
  });
  fnLog(aPira[1], oPriya, 360, 3, 'Reproduced and traced the rank reset.');
  fnLog(aPira[1], me(), 240, 1, 'Pairing on the fix.');
  fnLog(aPira[2], oJordan, 480, 2, 'Mention parser.');
  fnLog(aPira[2], oJordan, 120, 2, 'Duplicate entry.', 'Logged twice by mistake.');
  fnLog(aPira[3], me(), 300, 4, '');
  aPira.forEach((oIssue) => { oIssue.iTimeSpent = sumWorkLogMinutes(oDb.workLogs.filter((oLog) => oLog.sIssueId === oIssue.sId)); });
  // Resolved history across the last twelve weeks so throughput, lead/cycle time and overdue trend have data.
  const aPeople = [me(), oPriya, oJordan, oSam];
  for (let iIndex = 0; iIndex < 18; iIndex += 1) {
    const iNumber = oDb.sequences.get(oPira.sId);
    oDb.sequences.set(oPira.sId, iNumber + 1);
    const iResolvedAgo = 3 + iIndex * 4;
    const iLead = 2 + (iIndex * 7) % 15;
    const oCreated = addDays(new Date(), -(iResolvedAgo + iLead));
    const oUser = aPeople[iIndex % aPeople.length];
    oDb.issues.push({
      sId: uid(), sKey: formatIssueKey(oPira.sKey, iNumber), sSummary: `Historical work item ${iIndex + 1}`, sDescription: '', iType: [100000000, 100000001, 100000002][iIndex % 3],
      iStatus: 100000003, iPriority: 100000001 + (iIndex % 3), sProjectId: oPira.sId, sProjectName: oPira.sName, sAssigneeId: oUser.sId, sAssigneeName: oUser.sName,
      sReporterId: oPriya.sId, sReporterName: oPriya.sName, sParentId: '', sParentKey: '', sDueDate: toDateOnly(addDays(oCreated, iLead - 2 + (iIndex % 4))),
      sRank: rankBetween(oDb.issues.filter((oItem) => oItem.sProjectId === oPira.sId).map((oItem) => oItem.sRank).sort().pop() || '', ''), bArchived: false,
      sResolvedOn: addDays(new Date(), -iResolvedAgo).toISOString(), sCreatedOn: oCreated.toISOString(), sModifiedOn: addDays(new Date(), -iResolvedAgo).toISOString(), aLabels: [],
      iStoryPoints: [1, 2, 3, 5, 8][iIndex % 5], sSprintId: '', sSprintName: '', iResolution: 100000000,
      iOriginalEstimate: iIndex % 2 ? 480 * (1 + (iIndex % 3)) : null, iRemainingEstimate: 0, iTimeSpent: iIndex % 2 ? 480 * (1 + (iIndex % 3)) + (iIndex % 5 - 2) * 120 : 0,
      sFixVersionId: oV10.sId, sFixVersionName: oV10.sName, sStartedOn: iIndex % 6 ? addDays(oCreated, Math.floor(iLead / 3)).toISOString() : '',
    });
  }
  const fnBlocks = (iFrom, iTo) => oDb.links.push({ sId: uid(), sFromId: aPira[iFrom].sId, sToId: aPira[iTo].sId, iType: 100000000 });
  fnBlocks(8, 1);
  fnBlocks(2, 4);
  fnBlocks(10, 4);
  fnBlocks(11, 10);
}

// Phase 5: four Contoso environments with a PiraCore solution at different versions; the epic links Dev and Test and one of its
// stories expects 1.2.0.0, so Dev (1.3) is ahead, Test matches and Stage/Prod are unlinked.
function seedPhase5(oPira) {
  const fnEnvironment = (sName, sType, sHost) => {
    const oEnvironment = { sId: uid(), sName, sType, sUrl: `https://${sHost}.crm.dynamics.com`, sState: 'Enabled' };
    oDb.environments.push(oEnvironment);
    return oEnvironment;
  };
  const fnSolution = (sUniqueName, sName, sVersion, iDaysAgo, bManaged = false) => ({
    sId: uid(), sUniqueName, sName, sVersion, sModifiedOn: addDays(new Date(), -iDaysAgo).toISOString(), bManaged,
  });
  const aEnvironments = [['Contoso Dev', 'Sandbox', 'contoso-dev', '1.3.0.0', false], ['Contoso Test', 'Sandbox', 'contoso-test', '1.2.0.0', true],
    ['Contoso Stage', 'Sandbox', 'contoso-stage', '1.2.0.0', true], ['Contoso Prod', 'Production', 'contoso', '1.1.0.0', true]]
    .map(([sName, sType, sHost, sVersion, bManaged], iIndex) => {
      const oEnvironment = fnEnvironment(sName, sType, sHost);
      oDb.solutions.set(oEnvironment.sId, [
        fnSolution('PiraCore', 'Pira Core', sVersion, 1 + iIndex * 3, bManaged),
        fnSolution('PiraPlugins', 'Pira plug-ins', '1.0.0.0', 5 + iIndex, bManaged),
        fnSolution('ContosoCommon', 'Contoso common components', '3.4.1.7', 30, true),
        fnSolution('Default', 'Common Data Services Default Solution', '1.0', 200),
      ]);
      return oEnvironment;
    });
  oDb.solutions.set(fnEnvironment('Team Sandbox (Teams)', 'Teams', 'org1a2b3c').sId, [fnSolution('TeamTools', 'Team tools', '0.4', 12)]);
  const oEpic = oDb.issues.find((oIssue) => oIssue.sProjectId === oPira.sId && oIssue.iType === 100000003);
  [0, 1].forEach((iIndex) => {
    const oEnvironment = aEnvironments[iIndex];
    const oSolution = oDb.solutions.get(oEnvironment.sId)[0];
    oDb.epicSolutions.push({
      sId: uid(), sIssueId: oEpic.sId, sProjectId: oPira.sId, iStage: 100000000 + iIndex, sEnvironmentId: oEnvironment.sId, sEnvironmentName: oEnvironment.sName,
      sEnvironmentUrl: oEnvironment.sUrl, sSolutionId: oSolution.sId, sSolutionUniqueName: oSolution.sUniqueName, sSolutionName: oSolution.sName,
      sSolutionVersion: iIndex === 0 ? '1.2.0.0' : oSolution.sVersion, sSolutionModifiedOn: oSolution.sModifiedOn, sModifiedByName: me().sName, sModifiedOn: now(),
    });
  });
  const oStory = oDb.issues.find((oIssue) => oIssue.sParentId === oEpic.sId && oIssue.iType === 100000002);
  if (oStory) oStory.sSolutionVersion = '1.2.0.0';
}

function linkLabel(oIssue, sName) {
  let oLabel = oDb.labels.find((oItem) => oItem.sProjectId === oIssue.sProjectId && oItem.sName === sName);
  if (!oLabel) {
    oLabel = { sId: uid(), sProjectId: oIssue.sProjectId, sName };
    oDb.labels.push(oLabel);
  }
  if (!oDb.issueLabels.some((oLink) => oLink.sIssueId === oIssue.sId && oLink.sLabelId === oLabel.sId)) oDb.issueLabels.push({ sIssueId: oIssue.sId, sLabelId: oLabel.sId });
  return oLabel;
}

function labelsFor(sIssueId) {
  return oDb.issueLabels.filter((oLink) => oLink.sIssueId === sIssueId)
    .map((oLink) => oDb.labels.find((oLabel) => oLabel.sId === oLink.sLabelId))
    .map((oLabel) => ({ sId: oLabel.sId, sName: oLabel.sName })).sort((oA, oB) => oA.sName.localeCompare(oB.sName));
}

const boardIdsFor = (sIssueId) => oDb.boardIssues.filter((oRow) => oRow.sIssueId === sIssueId).map((oRow) => oRow.sBoardId);
const withLabels = (oIssue) => ({ ...oIssue, aLabels: labelsFor(oIssue.sId) });
const me = () => oDb.users.find((oUser) => oUser.sId === sMeId);
const findIssue = (sId) => {
  const oIssue = oDb.issues.find((oItem) => oItem.sId === sId);
  if (!oIssue) throw createDomainError(ERROR_CODES.issueNotFound);
  return oIssue;
};
const findProject = (sId) => {
  const oProject = oDb.projects.find((oItem) => oItem.sId === sId);
  if (!oProject) throw createDomainError(ERROR_CODES.projectNotFound);
  return oProject;
};
const findSprint = (sId) => {
  const oSprint = oDb.sprints.find((oItem) => oItem.sId === sId);
  if (!oSprint) throw createDomainError(ERROR_CODES.sprintNotFound);
  return oSprint;
};
const boardView = (oBoard) => ({ sId: oBoard.sId, sName: oBoard.sName, sProjectId: oBoard.sProjectId, iType: oBoard.iType, bDefault: oBoard.bDefault, bActive: oBoard.bActive });

function addHistory(oIssue, aEntries) {
  aEntries.forEach((oEntry) => oDb.history.push({ sId: uid(), sIssueId: oIssue.sId, iEvent: oEntry.iEvent, sField: oEntry.sField || '', sOldValue: truncateText(oEntry.sOldValue || ''), sNewValue: truncateText(oEntry.sNewValue || ''), sById: sMeId, sByName: me().sName, sOn: now() }));
  return true;
}

// ── API (mirrors data-service.js) ─────────────────────────────

export function initialise() {
  if (!oDb.users.length) seed();
  globalThis.piraMock = { failNext: (sOperation) => oFailures.add(sOperation), db: oDb };
}

export function invalidateCache() {}

export const getCurrentUser = () => simulate('getCurrentUser', () => me());

// Mirrors the Entra (Office 365 Users) search: provisioned people first match by name/email; unprovisioned people are flagged.
export const searchUsers = (sText) => simulate('searchUsers', () => {
  const sQuery = String(sText || '').trim().toLowerCase();
  if (sQuery.length < 2) return [];
  return [...oDb.users, ...oDb.directory].filter((oUser) => oUser.sName.toLowerCase().includes(sQuery) || oUser.sEmail.includes(sQuery)).slice(0, PAGING.userSearch);
});

export const listProjects = ({ sText = '', bIncludeArchived = false, sSkipToken = '' } = {}) => simulate('listProjects', () => {
  const sQuery = sText.trim().toLowerCase();
  const aItems = oDb.projects.filter((oProject) => (bIncludeArchived || !oProject.bArchived)
    && (!sQuery || oProject.sName.toLowerCase().includes(sQuery) || oProject.sKey.toLowerCase().includes(sQuery)))
    .sort((oA, oB) => oA.sName.localeCompare(oB.sName));
  const { aSlice, sNextToken } = page(aItems, sSkipToken, PAGING.projects);
  return { aProjects: aSlice, sNextToken };
});

export const getProject = (sId) => simulate('getProject', () => findProject(sId));

export const getProjectByKey = (sKey) => simulate('getProjectByKey', () => {
  const oProject = oDb.projects.find((oItem) => oItem.sKey === normaliseProjectKey(sKey));
  if (!oProject) throw createDomainError(ERROR_CODES.projectNotFound);
  return oProject;
});

export const isProjectKeyTaken = (sKey, sExceptId = '') => simulate('isProjectKeyTaken', () => oDb.projects.some((oProject) => oProject.sKey === normaliseProjectKey(sKey) && oProject.sId !== sExceptId));

export const createProject = (oDraft) => simulate('createProject', () => {
  const sKey = normaliseProjectKey(oDraft.sKey);
  const { bValid, oErrors } = validateProjectDraft({ ...oDraft, sKey });
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (oDb.projects.some((oProject) => oProject.sKey === sKey)) throw createDomainError(ERROR_CODES.projectKeyTaken, '', { sKey: 'That key is already in use.' });
  const oProject = { sId: uid(), sName: oDraft.sName.trim(), sKey, sDescription: (oDraft.sDescription || '').trim(), iType: Number(oDraft.iType) || PROJECT_TYPES[0].value, bArchived: false, sLeadId: sMeId, sLeadName: me().sName, sCreatedOn: now() };
  oDb.projects.push(oProject);
  oDb.sequences.set(oProject.sId, 1);
  oDb.members.push({ sId: uid(), sProjectId: oProject.sId, sProjectName: oProject.sName, sUserId: sMeId, sUserName: me().sName, iRole: LEAD, bActive: true, sJoinedOn: now() });
  oDb.boards.push({ sProjectId: oProject.sId, sId: uid(), sName: `${sKey} board`, iType: BOARD_TYPE.kanban, bDefault: true, bActive: true, aColumns: defaultColumns(false) });
  if (oDraft.sTemplateKey && getProjectTemplate(oDraft.sTemplateKey)) applyTemplateNow(oProject, oDraft.sTemplateKey);
  return oProject;
});

export const updateProject = (oProject, oChanges) => simulate('updateProject', () => {
  const oTarget = findProject(oProject.sId);
  const oNext = { ...oTarget, ...oChanges, sKey: oChanges.sKey !== undefined ? normaliseProjectKey(oChanges.sKey) : oTarget.sKey };
  const { bValid, oErrors } = validateProjectDraft(oNext);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (oNext.sKey !== oTarget.sKey) {
    if (oDb.issues.some((oIssue) => oIssue.sProjectId === oTarget.sId)) throw createDomainError(ERROR_CODES.projectKeyLocked, '', { sKey: 'The key is locked because issues exist.' });
    if (oDb.projects.some((oItem) => oItem.sKey === oNext.sKey && oItem.sId !== oTarget.sId)) throw createDomainError(ERROR_CODES.projectKeyTaken, '', { sKey: 'That key is already in use.' });
  }
  if (oChanges.sLeadId) oNext.sLeadName = oDb.users.find((oUser) => oUser.sId === oChanges.sLeadId).sName;
  Object.assign(oTarget, { sName: oNext.sName.trim(), sKey: oNext.sKey, sDescription: (oNext.sDescription || '').trim(), iType: Number(oNext.iType), sLeadId: oNext.sLeadId, sLeadName: oNext.sLeadName });
  return oTarget;
});

export const setProjectArchived = (oProject, bArchived) => simulate('setProjectArchived', () => Object.assign(findProject(oProject.sId), { bArchived }));

const workflowOf = (sProjectId) => oDb.workflows.get(sProjectId) || DEFAULT_WORKFLOW;

const countStatuses = (sProjectId, aStatuses = workflowOf(sProjectId).aStatuses) => Object.fromEntries(aStatuses.map((iStatus) => [iStatus,
  oDb.issues.filter((oIssue) => oIssue.sProjectId === sProjectId && !oIssue.bArchived && oIssue.iStatus === iStatus).length]));

export const getStatusCounts = (sProjectId, aStatuses = null) => simulate('getStatusCounts', () => countStatuses(sProjectId, aStatuses || undefined));

export const listMembers = (sProjectId) => simulate('listMembers', () => oDb.members.filter((oMember) => oMember.sProjectId === sProjectId && oMember.bActive));
export const getMyMembership = (sProjectId) => simulate('getMyMembership', () => oDb.members.find((oMember) => oMember.sProjectId === sProjectId && oMember.sUserId === sMeId && oMember.bActive) || null);
export const listMyMemberships = () => simulate('listMyMemberships', () => oDb.members.filter((oMember) => oMember.sUserId === sMeId && oMember.bActive));

function assertLeadRemains(sProjectId, oMember, iNewRole) {
  const aLeads = oDb.members.filter((oItem) => oItem.sProjectId === sProjectId && oItem.bActive && oItem.iRole === LEAD);
  if (oMember.iRole === LEAD && iNewRole !== LEAD && aLeads.length <= 1) throw createDomainError(ERROR_CODES.validation, 'A project needs at least one lead. Make someone else a lead first.');
}

export const addMember = (oProject, oUser, iRole) => simulate('addMember', () => {
  if (!oUser || !oUser.sId) throw createDomainError(ERROR_CODES.userNotProvisioned);
  const oExisting = oDb.members.find((oMember) => oMember.sProjectId === oProject.sId && oMember.sUserId === oUser.sId);
  if (oExisting) Object.assign(oExisting, { bActive: true, iRole: Number(iRole), sJoinedOn: now() });
  else oDb.members.push({ sId: uid(), sProjectId: oProject.sId, sProjectName: oProject.sName, sUserId: oUser.sId, sUserName: oUser.sName, iRole: Number(iRole), bActive: true, sJoinedOn: now() });
});

function assertNotSelf(oMember) {
  if (oMember.sUserId === sMeId) throw createDomainError(ERROR_CODES.permissionDenied, 'You can\'t change your own membership. Ask another project lead.');
}

export const updateMemberRole = (oProject, oMember, iRole) => simulate('updateMemberRole', () => {
  assertNotSelf(oMember);
  assertLeadRemains(oProject.sId, oMember, Number(iRole));
  Object.assign(oDb.members.find((oItem) => oItem.sId === oMember.sId), { iRole: Number(iRole) });
});

export const removeMember = (oProject, oMember) => simulate('removeMember', () => {
  assertNotSelf(oMember);
  assertLeadRemains(oProject.sId, oMember, -1);
  Object.assign(oDb.members.find((oItem) => oItem.sId === oMember.sId), { bActive: false });
});

// ── Boards ─────────────────────────────────────────────────────

const projectBoards = (sProjectId) => oDb.boards.filter((oBoard) => oBoard.sProjectId === sProjectId && (oBoard.bActive || oBoard.bDefault))
  .sort((oA, oB) => (oA.bDefault ? -1 : oB.bDefault ? 1 : oA.sName.localeCompare(oB.sName)));

export const listBoards = (oProject) => simulate('listBoards', () => projectBoards(oProject.sId).map(boardView));

// Same rule as the service: every workflow status has a column; columns for unused statuses stay but are hidden.
function syncColumns(oBoard, oWorkflow, bAlign = false) {
  const iMax = oBoard.aColumns.reduce((iValue, oColumn) => Math.max(iValue, oColumn.iOrder), -1);
  oWorkflow.aStatuses.filter((iStatus) => !oBoard.aColumns.some((oColumn) => oColumn.iStatus === iStatus))
    .forEach((iStatus, iIndex) => oBoard.aColumns.push({ sId: uid(), sName: getIssueStatus(iStatus).label, iOrder: iMax + 1 + iIndex, iStatus, iWipLimit: 0 }));
  if (bAlign) oBoard.aColumns.filter((oColumn) => oWorkflow.aStatuses.includes(oColumn.iStatus)).forEach((oColumn) => { oColumn.iOrder = oWorkflow.aStatuses.indexOf(oColumn.iStatus); });
}

export const getBoard = (oProject, sBoardId = '') => simulate('getBoard', () => {
  const oBoard = projectBoards(oProject.sId).find((oItem) => (sBoardId ? oItem.sId === sBoardId : oItem.bDefault));
  if (!oBoard) throw createDomainError(ERROR_CODES.boardNotFound);
  const oWorkflow = workflowOf(oProject.sId);
  syncColumns(oBoard, oWorkflow);
  return { ...boardView(oBoard), aColumns: oBoard.aColumns.filter((oColumn) => oWorkflow.aStatuses.includes(oColumn.iStatus)).sort((oA, oB) => oA.iOrder - oB.iOrder) };
});

function checkBoardDraft(oDraft) {
  const sName = String(oDraft.sName || '').trim();
  if (!sName || sName.length > LIMITS.boardNameMax) throw createDomainError(ERROR_CODES.validation, '', { sName: `Board names must be 1–${LIMITS.boardNameMax} characters.` });
  if (oDraft.iType !== undefined && !BOARD_TYPES.some((oType) => oType.value === Number(oDraft.iType))) throw createDomainError(ERROR_CODES.validation, '', { iType: 'Choose a board type.' });
  return sName;
}

export const createBoard = (oProject, oDraft) => simulate('createBoard', () => {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const oBoard = { sProjectId: oProject.sId, sId: uid(), sName: checkBoardDraft(oDraft), iType: Number(oDraft.iType) || BOARD_TYPE.kanban, bDefault: false, bActive: true, aColumns: defaultColumns(false, workflowOf(oProject.sId).aStatuses) };
  oDb.boards.push(oBoard);
  return { ...boardView(oBoard), aColumns: oBoard.aColumns };
});

export const updateBoard = (oProject, oBoard, oChanges) => simulate('updateBoard', () => {
  const oTarget = oDb.boards.find((oItem) => oItem.sId === oBoard.sId);
  const sName = checkBoardDraft({ sName: oChanges.sName !== undefined ? oChanges.sName : oTarget.sName, iType: oChanges.iType });
  Object.assign(oTarget, { sName }, oChanges.iType !== undefined ? { iType: Number(oChanges.iType) } : {});
});

export const archiveBoard = (oProject, oBoard) => simulate('archiveBoard', () => {
  if (oBoard.bDefault) throw createDomainError(ERROR_CODES.validation, 'The default board can\'t be archived.');
  if (oDb.sprints.some((oSprint) => oSprint.sBoardId === oBoard.sId && oSprint.iState === SPRINT_STATE.active)) throw createDomainError(ERROR_CODES.validation, 'Complete this board\'s active sprint before archiving it.');
  oDb.boards.find((oItem) => oItem.sId === oBoard.sId).bActive = false;
});

export const listIssueBoardIds = (sIssueId) => simulate('listIssueBoardIds', () => boardIdsFor(sIssueId));

function applyIssueBoards(oIssue, aBoardIds) {
  const aWanted = [...new Set(aBoardIds)];
  if (aWanted.some((sId) => !projectBoards(oIssue.sProjectId).some((oBoard) => oBoard.sId === sId && !oBoard.bDefault))) throw createDomainError(ERROR_CODES.boardNotFound);
  oDb.boardIssues = oDb.boardIssues.filter((oRow) => oRow.sIssueId !== oIssue.sId);
  aWanted.forEach((sBoardId) => oDb.boardIssues.push({ sId: uid(), sBoardId, sIssueId: oIssue.sId }));
  return aWanted;
}

export const setIssueBoards = (oIssue, aBoardIds) => simulate('setIssueBoards', () => applyIssueBoards(oIssue, aBoardIds));

export const updateBoardColumn = (oProject, oColumn, oChanges) => simulate('updateBoardColumn', () => {
  const oTarget = oDb.boards.flatMap((oItem) => oItem.aColumns).find((oItem) => oItem.sId === oColumn.sId);
  if (oChanges.sName !== undefined && !String(oChanges.sName).trim()) throw createDomainError(ERROR_CODES.validation, 'Column names must be 1–100 characters.');
  if (oChanges.iWipLimit !== undefined && (!Number.isInteger(Number(oChanges.iWipLimit)) || oChanges.iWipLimit < 0)) throw createDomainError(ERROR_CODES.validation, 'WIP limit must be 0–1000 (0 = no limit).');
  Object.assign(oTarget, oChanges.sName !== undefined ? { sName: String(oChanges.sName).trim() } : {}, oChanges.iWipLimit !== undefined ? { iWipLimit: Number(oChanges.iWipLimit) } : {}, oChanges.iOrder !== undefined ? { iOrder: Number(oChanges.iOrder) } : {});
});

export const listProjectLabels = (sProjectId) => simulate('listProjectLabels', () => oDb.labels.filter((oLabel) => oLabel.sProjectId === sProjectId).map(({ sId, sName }) => ({ sId, sName })).sort((oA, oB) => oA.sName.localeCompare(oB.sName)));

export const listHistory = (sIssueId, sSkipToken = '') => simulate('listHistory', () => {
  const aItems = oDb.history.filter((oEntry) => oEntry.sIssueId === sIssueId).sort((oA, oB) => oB.sOn.localeCompare(oA.sOn));
  const { aSlice, sNextToken } = page(aItems, sSkipToken, PAGING.history);
  return { aEntries: aSlice, sNextToken };
});

// ── Issues ─────────────────────────────────────────────────────

function sortIssues(aIssues, aOrderBy) {
  const sOrder = (aOrderBy && aOrderBy[0]) || 'wd_rank asc';
  const oFields = { 'wd_rank': null, modifiedon: 'sModifiedOn', 'wd_duedate': 'sDueDate', 'wd_priority': 'iPriority', createdon: 'sCreatedOn' };
  const [sField, sDirection] = sOrder.split(' ');
  if (sField === 'wd_rank') return aIssues.sort(compareRank);
  const sProperty = oFields[sField] || 'sModifiedOn';
  const iSign = sDirection === 'desc' ? -1 : 1;
  return aIssues.sort((oA, oB) => (oA[sProperty] > oB[sProperty] ? 1 : oA[sProperty] < oB[sProperty] ? -1 : 0) * iSign || oB.sModifiedOn.localeCompare(oA.sModifiedOn));
}

const customValuesFor = (sIssueId) => Object.fromEntries(oDb.customValues.filter((oRow) => oRow.sIssueId === sIssueId).map((oRow) => [oRow.sFieldId, oRow.value]));

function queryIssues(oCriteria) {
  if (oCriteria.oQuery) assertFeature('advancedQuery');
  const oContext = { sUserId: sMeId, oNow: new Date(), aCustomFields: oDb.customFields.filter((oField) => !oCriteria.sProjectId || oField.sProjectId === oCriteria.sProjectId) };
  return oDb.issues.filter((oIssue) => matchesIssueCriteria(oIssue, oCriteria, labelsFor(oIssue.sId).map((oLabel) => oLabel.sId), boardIdsFor(oIssue.sId),
    oCriteria.oQuery ? { ...oContext, oCustomValues: customValuesFor(oIssue.sId) } : {}));
}

export const listIssues = ({ oCriteria, aOrderBy, iPageSize = PAGING.issueList, sSkipToken = '' }) => simulate('listIssues', () => {
  const { aSlice, sNextToken, iCount } = page(sortIssues(queryIssues(oCriteria), aOrderBy), sSkipToken, iPageSize);
  return { aIssues: aSlice.map(withLabels), sNextToken, iCount };
});

export const getIssue = (sId) => simulate('getIssue', () => withLabels(findIssue(sId)));
export const getIssueByKey = (sKey) => simulate('getIssueByKey', () => {
  const oIssue = oDb.issues.find((oItem) => oItem.sKey === String(sKey).trim().toUpperCase());
  if (!oIssue) throw createDomainError(ERROR_CODES.issueNotFound);
  return withLabels(oIssue);
});

export const searchIssues = (sText, sProjectId = '') => listIssues({ oCriteria: { sText, sProjectId: sProjectId || undefined }, aOrderBy: ['modifiedon desc'], iPageSize: PAGING.searchSuggestions });

export const listMyWork = (sTab, sSkipToken = '') => {
  const { oCriteria, aOrderBy } = buildMyWorkCriteria(sTab, sMeId, new Date(), RECENTLY_UPDATED_DAYS);
  return listIssues({ oCriteria, aOrderBy, iPageSize: PAGING.myWork, sSkipToken });
};

export const listChildIssues = (sIssueId, sSkipToken = '') => listIssues({ oCriteria: { sParentId: sIssueId }, iPageSize: PAGING.children, sSkipToken });

export const searchParentCandidates = (oChild, sText) => simulate('searchParentCandidates', () => {
  const aTypes = getAllowedParentTypes(oChild.iType);
  if (!aTypes.length) return [];
  return sortIssues(queryIssues({ sProjectId: oChild.sProjectId, sText, aTypes }), ['modifiedon desc'])
    .filter((oIssue) => oIssue.sId !== oChild.sId).slice(0, PAGING.parentSearch).map(withLabels);
});

function ancestorsOf(sIssueId) {
  const aIds = [];
  let oCurrent = oDb.issues.find((oIssue) => oIssue.sId === sIssueId);
  while (oCurrent && oCurrent.sParentId && aIds.length < 20) {
    aIds.push(oCurrent.sParentId);
    oCurrent = oDb.issues.find((oIssue) => oIssue.sId === oCurrent.sParentId);
  }
  return aIds;
}

function checkParent(oChild, sParentId) {
  if (!sParentId) return null;
  const oParent = findIssue(sParentId);
  const sError = validateParent(oChild, oParent, ancestorsOf(oParent.sId));
  if (sError) throw createDomainError(sError);
  return oParent;
}

function openSprintFor(sSprintId, sProjectId) {
  const oSprint = findSprint(sSprintId);
  if (oSprint.sProjectId !== sProjectId) throw createDomainError(ERROR_CODES.sprintProjectMismatch);
  if (!isSprintOpen(oSprint.iState)) throw createDomainError(ERROR_CODES.sprintLocked);
  return oSprint;
}

// Same placement rule as the service: neighbours' current ranks, else "just after the issue above".
function placementRank(sProjectId, { sBeforeId = '', sAfterId = '' } = {}, sMovingId = '') {
  const aRanked = oDb.issues.filter((oIssue) => oIssue.sProjectId === sProjectId && isValidRank(oIssue.sRank) && oIssue.sId !== sMovingId).map((oIssue) => oIssue.sRank).sort();
  const fnRank = (sId) => { const oIssue = oDb.issues.find((oItem) => oItem.sId === sId); return oIssue && isValidRank(oIssue.sRank) ? oIssue.sRank : ''; };
  const sBefore = fnRank(sBeforeId);
  const sAfter = fnRank(sAfterId);
  if (isRankOrdered(sBefore, sAfter)) return rankBetween(sBefore, sAfter);
  if (sBefore) return rankBetween(sBefore, aRanked.find((sRank) => sRank > sBefore) || '');
  if (sAfter) return rankBetween([...aRanked].reverse().find((sRank) => sRank < sAfter) || '', sAfter);
  return rankBetween(aRanked.length ? aRanked[aRanked.length - 1] : '', '');
}

export const createIssue = (oProject, oDraft) => simulate('createIssue', () => {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const { bValid, oErrors } = validateIssueDraft({ ...oDraft, sProjectId: oProject.sId });
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  const oParent = checkParent({ sId: '', sProjectId: oProject.sId, iType: Number(oDraft.iType) }, oDraft.sParentId);
  const oSprint = oDraft.sSprintId ? openSprintFor(oDraft.sSprintId, oProject.sId) : null;
  const oVersion = oDraft.sFixVersionId ? usableVersion(oDraft.sFixVersionId, oProject.sId) : null;
  const oEstimates = checkEstimates(oDraft, {});
  let sKey = '', iNumber = 0;
  for (let iAttempt = 0; iAttempt < KEY_ALLOCATION_RETRIES * 3 && !sKey; iAttempt += 1) {
    iNumber = oDb.sequences.get(oProject.sId) || 1;
    oDb.sequences.set(oProject.sId, iNumber + 1);
    const sCandidate = formatIssueKey(oProject.sKey, iNumber);
    if (!oDb.issues.some((oIssue) => oIssue.sKey === sCandidate)) sKey = sCandidate;
  }
  if (!sKey) throw createDomainError(ERROR_CODES.issueKeyConflict);
  const oAssignee = oDb.users.find((oUser) => oUser.sId === oDraft.sAssigneeId);
  const oIssue = {
    sId: uid(), sKey, sSummary: oDraft.sSummary.trim(), sDescription: (oDraft.sDescription || '').trim(), iType: Number(oDraft.iType), iStatus: workflowOf(oProject.sId).iInitialStatus,
    iPriority: Number(oDraft.iPriority), sProjectId: oProject.sId, sProjectName: oProject.sName, sAssigneeId: oAssignee ? oAssignee.sId : '', sAssigneeName: oAssignee ? oAssignee.sName : '',
    sReporterId: sMeId, sReporterName: me().sName, sParentId: oParent ? oParent.sId : '', sParentKey: oParent ? oParent.sKey : '', sDueDate: oDraft.sDueDate || '',
    sRank: placementRank(oProject.sId), bArchived: false, sResolvedOn: '', sCreatedOn: now(), sModifiedOn: now(), aLabels: [],
    iStoryPoints: oDraft.iStoryPoints === undefined ? null : oDraft.iStoryPoints, sSprintId: oSprint ? oSprint.sId : '', sSprintName: oSprint ? oSprint.sName : '',
    iResolution: null, iOriginalEstimate: null, iRemainingEstimate: null, iTimeSpent: 0, ...oEstimates,
    sFixVersionId: oVersion ? oVersion.sId : '', sFixVersionName: oVersion ? oVersion.sName : '',
    sStartedOn: getStatusCategory(workflowOf(oProject.sId).iInitialStatus) === 'progress' ? now() : '',
  };
  oDb.issues.push(oIssue);
  normaliseLabels(oDraft.aLabels).forEach((sName) => linkLabel(oIssue, sName));
  if (oDraft.sBoardId) applyIssueBoards(oIssue, [oDraft.sBoardId]);
  addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.created, sNewValue: oIssue.sSummary }]);
  if (oIssue.sAssigneeId) notify(oIssue.sProjectId, oIssue, planAssignmentNotifications({ sAssigneeId: '' }, oIssue.sAssigneeId));
  return { oIssue: withLabels(oIssue), bHistorySaved: true };
});

function toDisplay(oIssue) {
  return {
    summary: oIssue.sSummary, description: truncateText(oIssue.sDescription, 120), type: getIssueType(oIssue.iType).label,
    priority: getPriority(oIssue.iPriority).label, assignee: oIssue.sAssigneeId ? oIssue.sAssigneeName || 'Assigned' : 'Unassigned',
    dueDate: formatDateOnly(oIssue.sDueDate) || 'None', parent: oIssue.sParentKey || 'None',
    labels: (oIssue.aLabels || []).map((oLabel) => oLabel.sName).join(', ') || 'None', points: formatStoryPoints(oIssue.iStoryPoints) || 'None',
    resolution: (getResolution(oIssue.iResolution) || {}).label || 'None',
    fixVersion: oIssue.sFixVersionId ? oIssue.sFixVersionName || 'Version' : 'None',
    originalEstimate: formatDuration(oIssue.iOriginalEstimate) || 'None', remainingEstimate: formatDuration(oIssue.iRemainingEstimate) || 'None',
    solutionVersion: oIssue.sSolutionVersion || 'None',
  };
}

// Same rules as estimatePayload in the service.
function checkEstimates(oChanges, oIssue) {
  const oValues = {};
  ['iOriginalEstimate', 'iRemainingEstimate'].forEach((sKey) => {
    if (oChanges[sKey] === undefined) return;
    assertFeature('timeTracking');
    if (oChanges[sKey] !== null && !isValidEstimate(oChanges[sKey])) throw createDomainError(ERROR_CODES.validation, '', { [sKey]: `Estimates must be from 0m to ${formatDuration(LIMITS.estimateMaxMinutes)}.` });
    oValues[sKey] = oChanges[sKey];
  });
  if (oChanges.iOriginalEstimate !== undefined && oChanges.iOriginalEstimate !== null && oChanges.iRemainingEstimate === undefined) {
    const iSeed = remainingForNewEstimate(oIssue, oChanges.iOriginalEstimate);
    if (iSeed !== undefined) oValues.iRemainingEstimate = iSeed;
  }
  return oValues;
}

const HISTORY_FIELDS = [{ sField: 'summary', sLabel: 'Summary' }, { sField: 'description', sLabel: 'Description' }, { sField: 'type', sLabel: 'Issue type' },
  { sField: 'priority', sLabel: 'Priority' }, { sField: 'assignee', sLabel: 'Assignee' }, { sField: 'dueDate', sLabel: 'Due date' }, { sField: 'parent', sLabel: 'Parent' },
  { sField: 'labels', sLabel: 'Labels' }, { sField: 'points', sLabel: 'Story points' }, { sField: 'resolution', sLabel: 'Resolution' },
  { sField: 'fixVersion', sLabel: 'Fix version' }, { sField: 'originalEstimate', sLabel: 'Original estimate' }, { sField: 'remainingEstimate', sLabel: 'Remaining estimate' },
  { sField: 'solutionVersion', sLabel: 'Solution version' }];

export const updateIssue = (oIssue, oChanges, { bNotify = true } = {}) => simulate('updateIssue', () => updateIssueNow(oIssue, oChanges, bNotify));

function updateIssueNow(oIssue, oChanges, bNotify) {
  const oTarget = findIssue(oIssue.sId);
  const oBefore = withLabels(oTarget);
  const oNext = { ...oBefore, ...oChanges };
  if (oChanges.aLabels) oNext.aLabels = normaliseLabels(oChanges.aLabels).map((sName) => ({ sName }));
  if (oChanges.sSolutionVersion !== undefined) oNext.sSolutionVersion = normaliseSolutionVersion(oChanges.sSolutionVersion);
  if (oNext.sSolutionVersion && !isStoryType(oNext.iType) && oChanges.sSolutionVersion === undefined) oNext.sSolutionVersion = '';
  const { bValid, oErrors } = validateIssueDraft({ ...oNext, aLabels: oNext.aLabels.map((oLabel) => oLabel.sName) });
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (oChanges.iResolution !== undefined && oChanges.iResolution !== null) {
    if (!isValidResolution(oChanges.iResolution)) throw createDomainError(ERROR_CODES.validation, '', { iResolution: 'Choose a valid resolution.' });
    if (!isDoneStatus(oTarget.iStatus)) throw createDomainError(ERROR_CODES.validation, '', { iResolution: 'Only done issues have a resolution.' });
  }
  const aCustomWrites = oChanges.oCustomValues ? prepareCustomValues(oTarget, oNext.iType, oChanges.oCustomValues) : [];
  const bParentChange = oChanges.sParentId !== undefined && oChanges.sParentId !== oTarget.sParentId;
  if (bParentChange) {
    const oParent = checkParent({ ...oTarget, iType: oNext.iType }, oChanges.sParentId);
    oNext.sParentKey = oParent ? oParent.sKey : '';
  }
  if (oChanges.iType !== undefined && Number(oChanges.iType) !== oTarget.iType) {
    const oParent = oNext.sParentId ? findIssue(oNext.sParentId) : null;
    const aChildTypes = oDb.issues.filter((oItem) => oItem.sParentId === oTarget.sId && !oItem.bArchived).map((oItem) => oItem.iType);
    const sError = validateTypeChange(Number(oChanges.iType), oParent, aChildTypes);
    if (sError) throw createDomainError(sError);
  }
  const bSprintChange = oChanges.sSprintId !== undefined && oChanges.sSprintId !== (oTarget.sSprintId || '');
  let oSprint = null;
  if (bSprintChange) {
    if (oTarget.sSprintId && isSprintLocked(findSprint(oTarget.sSprintId).iState)) throw createDomainError(ERROR_CODES.sprintLocked);
    oSprint = oChanges.sSprintId ? openSprintFor(oChanges.sSprintId, oTarget.sProjectId) : null;
    oNext.sSprintName = oSprint ? oSprint.sName : '';
  }
  if (oChanges.aBoardIds) applyIssueBoards(oTarget, oChanges.aBoardIds);
  Object.assign(oNext, checkEstimates(oChanges, oTarget));
  if (oChanges.sFixVersionId !== undefined && oChanges.sFixVersionId !== (oTarget.sFixVersionId || '')) {
    const oVersion = oChanges.sFixVersionId ? usableVersion(oChanges.sFixVersionId, oTarget.sProjectId) : null;
    oNext.sFixVersionName = oVersion ? oVersion.sName : '';
  }
  if (oChanges.sAssigneeId !== undefined) oNext.sAssigneeName = (oDb.users.find((oUser) => oUser.sId === oChanges.sAssigneeId) || {}).sName || '';
  const sOldAssigneeId = oTarget.sAssigneeId;
  ['sSummary', 'sDescription', 'iType', 'iPriority', 'sAssigneeId', 'sAssigneeName', 'sDueDate', 'sParentId', 'sParentKey', 'iStoryPoints', 'sSprintId', 'sSprintName', 'iResolution',
    'iOriginalEstimate', 'iRemainingEstimate', 'sFixVersionId', 'sFixVersionName', 'sSolutionVersion']
    .forEach((sField) => { if (oNext[sField] !== undefined) oTarget[sField] = oNext[sField]; });
  oTarget.sSummary = oTarget.sSummary.trim();
  if (oChanges.aLabels) {
    oDb.issueLabels = oDb.issueLabels.filter((oLink) => oLink.sIssueId !== oTarget.sId);
    normaliseLabels(oChanges.aLabels).forEach((sName) => linkLabel(oTarget, sName));
  }
  oTarget.sModifiedOn = now();
  const aChanges = diffDisplayValues(toDisplay(oBefore), toDisplay(withLabels(oTarget)), HISTORY_FIELDS).map((oChange) => ({ ...oChange, iEvent: HISTORY_EVENTS.fieldChanged }));
  if (bSprintChange) aChanges.push({ iEvent: HISTORY_EVENTS.sprintChanged, sField: 'sprint', sOldValue: oBefore.sSprintName || 'Backlog', sNewValue: oSprint ? oSprint.sName : 'Backlog' });
  aChanges.push(...writeCustomValues(oTarget, aCustomWrites));
  addHistory(oTarget, aChanges);
  if (bNotify && oChanges.sAssigneeId !== undefined) notify(oTarget.sProjectId, oTarget, planAssignmentNotifications({ sAssigneeId: sOldAssigneeId }, oChanges.sAssigneeId));
  return { oIssue: withLabels(oTarget), bHistorySaved: true };
}

export const transitionIssue = (oIssue, iToStatus, oPlacement = null, oFields = {}, { bNotify = true } = {}) => simulate('transitionIssue', () => transitionNow(oIssue, iToStatus, oPlacement, oFields, bNotify));

function transitionNow(oIssue, iToStatus, oPlacement, oFields, bNotify) {
  const oTarget = findIssue(oIssue.sId);
  const iCurrent = oTarget.iStatus;
  const iTarget = Number(iToStatus);
  const oExtra = oFields || {};
  if (iCurrent !== iTarget) {
    const oWorkflow = workflowOf(oTarget.sProjectId);
    assertTransition(iCurrent, iTarget, oWorkflow);
    assertTransitionFields(getTransitionRequirements(iCurrent, iTarget, oWorkflow), { ...oTarget, iResolution: oTarget.iResolution ?? null, ...oExtra });
    const oBefore = withLabels(oTarget);
    const sOldAssigneeId = oTarget.sAssigneeId;
    oTarget.iStatus = iTarget;
    if (!oTarget.sStartedOn && getStatusCategory(iTarget) === 'progress') oTarget.sStartedOn = now();
    if (isDoneStatus(iTarget) && !isDoneStatus(iCurrent)) oTarget.sResolvedOn = now();
    if (!isDoneStatus(iTarget)) Object.assign(oTarget, { sResolvedOn: '', iResolution: null });
    if (isDoneStatus(iTarget) && isValidResolution(oExtra.iResolution)) oTarget.iResolution = Number(oExtra.iResolution);
    if (oExtra.sAssigneeId) Object.assign(oTarget, { sAssigneeId: oExtra.sAssigneeId, sAssigneeName: (oDb.users.find((oUser) => oUser.sId === oExtra.sAssigneeId) || {}).sName || '' });
    if (oExtra.iStoryPoints !== undefined && isValidStoryPoints(oExtra.iStoryPoints)) oTarget.iStoryPoints = oExtra.iStoryPoints;
    if (oExtra.sDueDate && isValidDateOnly(oExtra.sDueDate)) oTarget.sDueDate = oExtra.sDueDate;
    addHistory(oTarget, [{ iEvent: HISTORY_EVENTS.transitioned, sField: 'status', sOldValue: getIssueStatus(iCurrent).label, sNewValue: getIssueStatus(iTarget).label },
      ...diffDisplayValues(toDisplay(oBefore), toDisplay(withLabels(oTarget)), HISTORY_FIELDS).map((oChange) => ({ ...oChange, iEvent: HISTORY_EVENTS.fieldChanged }))]);
    if (bNotify) {
      notify(oTarget.sProjectId, oTarget, [...planStatusNotifications(oTarget, iCurrent, iTarget), ...planAssignmentNotifications({ sAssigneeId: sOldAssigneeId }, oExtra.sAssigneeId || '')]);
    }
  }
  if (oPlacement) oTarget.sRank = placementRank(oTarget.sProjectId, oPlacement, oTarget.sId);
  oTarget.sModifiedOn = now();
  return { oIssue: withLabels(oTarget), bHistorySaved: true };
}

export const archiveIssue = (oIssue) => simulate('archiveIssue', () => {
  const oTarget = findIssue(oIssue.sId);
  oTarget.bArchived = true;
  oTarget.sModifiedOn = now();
  return { bHistorySaved: addHistory(oTarget, [{ iEvent: HISTORY_EVENTS.archived, sField: 'archived', sOldValue: 'No', sNewValue: 'Yes' }]) };
});

// ── Sprints ────────────────────────────────────────────────────

export const listSprints = (sProjectId) => simulate('listSprints', () => oDb.sprints.filter((oSprint) => oSprint.sProjectId === sProjectId).sort((oA, oB) => oA.sCreatedOn.localeCompare(oB.sCreatedOn)));
export const getSprint = (sSprintId) => simulate('getSprint', () => findSprint(sSprintId));

const sprintIssues = (sSprintId) => oDb.issues.filter((oIssue) => oIssue.sSprintId === sSprintId);

function assertNoOtherActive(oSprint) {
  if (oDb.sprints.some((oItem) => oItem.sBoardId === oSprint.sBoardId && oItem.iState === SPRINT_STATE.active && oItem.sId !== oSprint.sId)) throw createDomainError(ERROR_CODES.sprintActiveExists);
}

function moveSprintIssues(aIssues, oTarget, sFromName) {
  aIssues.forEach((oIssue) => {
    Object.assign(findIssue(oIssue.sId), { sSprintId: oTarget ? oTarget.sId : '', sSprintName: oTarget ? oTarget.sName : '', sModifiedOn: now() });
    addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.sprintChanged, sField: 'sprint', sOldValue: sFromName, sNewValue: oTarget ? oTarget.sName : 'Backlog' }]);
  });
}

export const createSprint = (oProject, oBoard, oDraft) => simulate('createSprint', () => {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const { bValid, oErrors } = validateSprintDraft(oDraft);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (!oBoard || oBoard.sProjectId !== oProject.sId) throw createDomainError(ERROR_CODES.boardNotFound);
  const oSprint = {
    sId: uid(), sName: oDraft.sName.trim(), sProjectId: oProject.sId, sBoardId: oBoard.sId, sGoal: String(oDraft.sGoal || '').trim(), iState: SPRINT_STATE.planned,
    sStartDate: oDraft.sStartDate || '', sEndDate: oDraft.sEndDate || '', sStartedOn: '', sCompletedOn: '', sCorrectionNote: '',
    iCommittedIssues: 0, iCommittedPoints: 0, iCompletedIssues: 0, iCompletedPoints: 0, iIncompleteIssues: 0, iIncompletePoints: 0, sCreatedOn: now(),
  };
  oDb.sprints.push(oSprint);
  return oSprint;
});

export const updateSprint = (oSprint, oChanges) => simulate('updateSprint', () => {
  const oTarget = findSprint(oSprint.sId);
  if (isSprintLocked(oTarget.iState)) throw createDomainError(ERROR_CODES.sprintLocked);
  const oNext = { ...oTarget, ...oChanges };
  const { bValid, oErrors } = validateSprintDraft(oNext, oTarget.iState === SPRINT_STATE.active);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  return Object.assign(oTarget, { sName: oNext.sName.trim(), sGoal: String(oNext.sGoal || '').trim(), sStartDate: oNext.sStartDate || '', sEndDate: oNext.sEndDate || '' });
});

export const startSprint = (oSprint, oChanges = {}) => simulate('startSprint', () => {
  const oTarget = findSprint(oSprint.sId);
  assertSprintTransition(oTarget.iState, SPRINT_STATE.active);
  const oNext = { ...oTarget, ...oChanges };
  const { bValid, oErrors } = validateSprintDraft(oNext, true);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  assertNoOtherActive(oTarget);
  const oMetrics = computeSprintMetrics(sprintIssues(oTarget.sId));
  return Object.assign(oTarget, {
    sName: oNext.sName.trim(), sGoal: String(oNext.sGoal || '').trim(), sStartDate: oNext.sStartDate, sEndDate: oNext.sEndDate,
    iState: SPRINT_STATE.active, sStartedOn: now(), iCommittedIssues: oMetrics.iIssues, iCommittedPoints: oMetrics.iPoints,
  });
});

export const completeSprint = (oSprint, sDestination = '') => simulate('completeSprint', () => {
  const oTarget = findSprint(oSprint.sId);
  assertSprintTransition(oTarget.iState, SPRINT_STATE.completed);
  const aIssues = sprintIssues(oTarget.sId);
  const { aMove, sTargetSprintId } = planSprintCompletion(aIssues, sDestination);
  const oDestination = aMove.length && sTargetSprintId ? openSprintFor(sTargetSprintId, oTarget.sProjectId) : null;
  if (oDestination && oDestination.sId === oTarget.sId) throw createDomainError(ERROR_CODES.validation, 'Choose a different sprint for the incomplete issues.');
  const oMetrics = computeSprintMetrics(aIssues);
  moveSprintIssues(aMove, oDestination, oTarget.sName);
  Object.assign(oTarget, {
    iState: SPRINT_STATE.completed, sCompletedOn: now(), iCompletedIssues: oMetrics.iDone, iCompletedPoints: oMetrics.iDonePoints,
    iIncompleteIssues: oMetrics.iOpen, iIncompletePoints: oMetrics.iOpenPoints,
  });
  return { oSprint: oTarget, iMoved: aMove.length, bHistorySaved: true };
});

export const cancelSprint = (oSprint) => simulate('cancelSprint', () => {
  const oTarget = findSprint(oSprint.sId);
  assertSprintTransition(oTarget.iState, SPRINT_STATE.cancelled);
  const aIssues = sprintIssues(oTarget.sId).filter((oIssue) => !oIssue.bArchived);
  moveSprintIssues(aIssues, null, oTarget.sName);
  oTarget.iState = SPRINT_STATE.cancelled;
  return { oSprint: oTarget, iMoved: aIssues.length, bHistorySaved: true };
});

export const reopenSprint = (oSprint, sNote) => simulate('reopenSprint', () => {
  const oTarget = findSprint(oSprint.sId);
  assertSprintTransition(oTarget.iState, SPRINT_STATE.active);
  const sReason = String(sNote || '').trim();
  if (!sReason) throw createDomainError(ERROR_CODES.validation, '', { sNote: 'Explain why the sprint is being reopened.' });
  const oMembership = oDb.members.find((oMember) => oMember.sProjectId === oTarget.sProjectId && oMember.sUserId === sMeId && oMember.bActive);
  if (!getProjectPermissions(oMembership).bCanManage) throw createDomainError(ERROR_CODES.permissionDenied, 'Only project leads can reopen a completed sprint.');
  assertNoOtherActive(oTarget);
  return Object.assign(oTarget, { iState: SPRINT_STATE.active, sCompletedOn: '', sCorrectionNote: truncateText(`${toDateOnly(new Date())}: ${sReason}`, LIMITS.correctionNoteMax) });
});

export const getSprintReport = (oSprint) => simulate('getSprintReport', () => {
  const oTarget = findSprint(oSprint.sId);
  const oMetrics = computeSprintMetrics(sprintIssues(oTarget.sId));
  return { oSprint: oTarget, oMetrics, oScope: describeScopeChange(oTarget, oMetrics) };
});

export const planIssue = (oIssue, { sSprintId, sBeforeId = '', sAfterId = '' } = {}) => simulate('planIssue', () => {
  const oTarget = findIssue(oIssue.sId);
  const bSprintChange = sSprintId !== undefined && sSprintId !== (oTarget.sSprintId || '');
  if (bSprintChange) {
    if (oTarget.sSprintId && isSprintLocked(findSprint(oTarget.sSprintId).iState)) throw createDomainError(ERROR_CODES.sprintLocked);
    const oSprint = sSprintId ? openSprintFor(sSprintId, oTarget.sProjectId) : null;
    addHistory(oTarget, [{ iEvent: HISTORY_EVENTS.sprintChanged, sField: 'sprint', sOldValue: oTarget.sSprintName || 'Backlog', sNewValue: oSprint ? oSprint.sName : 'Backlog' }]);
    Object.assign(oTarget, { sSprintId: oSprint ? oSprint.sId : '', sSprintName: oSprint ? oSprint.sName : '' });
  }
  if (sBeforeId || sAfterId || bSprintChange) oTarget.sRank = placementRank(oTarget.sProjectId, { sBeforeId, sAfterId }, oTarget.sId);
  oTarget.sModifiedOn = now();
  return { oIssue: withLabels(oTarget), bHistorySaved: true };
});

// ── Links ──────────────────────────────────────────────────────

const issueKey = (sId) => (oDb.issues.find((oIssue) => oIssue.sId === sId) || {}).sKey || '';

export const listIssueLinks = (oIssue) => simulate('listIssueLinks', () => oDb.links
  .filter((oLink) => oLink.sFromId === oIssue.sId || oLink.sToId === oIssue.sId)
  .map((oLink) => {
    const bInward = oLink.sToId === oIssue.sId;
    const sOtherId = bInward ? oLink.sFromId : oLink.sToId;
    const oOther = oDb.issues.find((oItem) => oItem.sId === sOtherId);
    return {
      ...oLink, sFromKey: issueKey(oLink.sFromId), sToKey: issueKey(oLink.sToId), bInward, sOtherId, sOtherKey: issueKey(sOtherId),
      sLabel: describeLink(oLink.iType, bInward), oOther: oOther ? withLabels(oOther) : null,
    };
  })
  .sort((oA, oB) => oA.sLabel.localeCompare(oB.sLabel) || oA.sOtherKey.localeCompare(oB.sOtherKey)));

export const createIssueLink = (oIssue, sChoiceKey, oOther) => simulate('createIssueLink', () => {
  const oChoice = LINK_CHOICES.find((oItem) => oItem.sKey === sChoiceKey);
  if (!oChoice || !oOther) throw createDomainError(ERROR_CODES.invalidLink);
  const sFromId = oChoice.bInward ? oOther.sId : oIssue.sId;
  const sToId = oChoice.bInward ? oIssue.sId : oOther.sId;
  const aExisting = oDb.links.filter((oLink) => [oLink.sFromId, oLink.sToId].sort().join() === [oIssue.sId, oOther.sId].sort().join());
  const sError = validateIssueLink({ sFromId, sToId, iType: oChoice.iType }, aExisting);
  if (sError) throw createDomainError(sError);
  oDb.links.push({ sId: uid(), sFromId, sToId, iType: oChoice.iType });
  return addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.linked, sField: 'link', sNewValue: `${oChoice.sLabel} ${oOther.sKey}` }]);
});

export const deleteIssueLink = (oIssue, oLink) => simulate('deleteIssueLink', () => {
  oDb.links = oDb.links.filter((oItem) => oItem.sId !== oLink.sId);
  return addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.linked, sField: 'link', sOldValue: `${oLink.sLabel} ${oLink.sOtherKey}`, sNewValue: '' }]);
});

// ── Dashboard ──────────────────────────────────────────────────

export const getDashboard = (oProject) => simulate('getDashboard', () => {
  const aOpen = queryIssues({ sProjectId: oProject.sId, bOpenOnly: true });
  const sToday = toDateOnly(new Date());
  const aSprintProgress = oDb.sprints.filter((oSprint) => oSprint.sProjectId === oProject.sId && oSprint.iState === SPRINT_STATE.active).map((oSprint) => {
    const oMetrics = computeSprintMetrics(sprintIssues(oSprint.sId));
    return { oSprint, oMetrics, oScope: describeScopeChange(oSprint, oMetrics) };
  });
  return {
    oStatusCounts: countStatuses(oProject.sId),
    oPriorityCounts: Object.fromEntries(PRIORITIES.map((oPriority) => [oPriority.value, aOpen.filter((oIssue) => oIssue.iPriority === oPriority.value).length])),
    iOverdue: aOpen.filter((oIssue) => oIssue.sDueDate && oIssue.sDueDate < sToday).length,
    iUnassigned: aOpen.filter((oIssue) => !oIssue.sAssigneeId).length,
    aSprintProgress,
  };
});

// ── Comments ───────────────────────────────────────────────────

export const listComments = (sIssueId, sSkipToken = '') => simulate('listComments', () => {
  const aItems = oDb.comments.filter((oComment) => oComment.sIssueId === sIssueId).sort((oA, oB) => oB.sCreatedOn.localeCompare(oA.sCreatedOn));
  const { aSlice, sNextToken, iCount } = page(aItems, sSkipToken, PAGING.comments);
  return { aComments: aSlice, sNextToken, iCount };
});

export const addComment = (oIssue, sBody) => simulate('addComment', () => {
  const sError = validateCommentBody(sBody);
  if (sError) throw createDomainError(ERROR_CODES.validation, sError);
  const oComment = { sId: uid(), sIssueId: oIssue.sId, sBody: sBody.trim(), bEdited: false, sEditedOn: '', sAuthorId: sMeId, sAuthorName: me().sName, sCreatedOn: now() };
  oDb.comments.push(oComment);
  findIssue(oIssue.sId).sModifiedOn = now();
  addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.commented, sField: 'comment', sNewValue: truncateText(oComment.sBody, 120) }]);
  const oTarget = findIssue(oIssue.sId);
  notify(oTarget.sProjectId, oTarget, planCommentNotifications(oTarget, extractMentions(oComment.sBody, activeMembers(oTarget.sProjectId))));
  return { oComment, bHistorySaved: true };
});

export const updateComment = (oComment, sBody) => simulate('updateComment', () => {
  if (oComment.sAuthorId !== sMeId) throw createDomainError(ERROR_CODES.permissionDenied, 'You can only edit your own comments.');
  const sError = validateCommentBody(sBody);
  if (sError) throw createDomainError(ERROR_CODES.validation, sError);
  return Object.assign(oDb.comments.find((oItem) => oItem.sId === oComment.sId), { sBody: sBody.trim(), bEdited: true, sEditedOn: now() });
});

// ── Phase 3 helpers ────────────────────────────────────────────

const activeMembers = (sProjectId) => oDb.members.filter((oMember) => oMember.sProjectId === sProjectId && oMember.bActive);
const myMembership = (sProjectId) => activeMembers(sProjectId).find((oMember) => oMember.sUserId === sMeId) || null;

function assertLead(sProjectId, sMessage) {
  if (!getProjectPermissions(myMembership(sProjectId)).bCanManage) throw createDomainError(ERROR_CODES.permissionDenied, sMessage);
}

function notify(sProjectId, oIssue, aPlans) {
  const oProject = findProject(sProjectId);
  finaliseNotifications(aPlans, sMeId, activeMembers(sProjectId).map((oMember) => oMember.sUserId)).forEach((oPlan) => oDb.notifications.push({
    sId: uid(), sRecipientId: oPlan.sRecipientId, sIssueId: oIssue ? oIssue.sId : '', sIssueKey: oIssue ? oIssue.sKey : '', sProjectId, sProjectName: oProject.sName,
    iEvent: oPlan.iEvent, sDetail: oPlan.sDetail, iCount: oPlan.iCount || 1, bRead: false, sActorId: sMeId, sActorName: me().sName, sCreatedOn: now(),
  }));
}

function saveWorkflowNow(oProject, oWorkflow, sTemplateKey) {
  const oTarget = findProject(oProject.sId);
  if (oTarget.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const oNext = {
    bCustom: true, aStatuses: oWorkflow.aStatuses.map(Number), iInitialStatus: Number(oWorkflow.iInitialStatus),
    aTransitions: oWorkflow.aTransitions.map((oItem) => ({ iFrom: Number(oItem.iFrom), iTo: Number(oItem.iTo), aRequired: normaliseRequirements(oItem.aRequired) })),
  };
  const { bValid, oErrors } = validateWorkflow(oNext);
  if (!bValid) throw createDomainError(ERROR_CODES.invalidWorkflow, Object.values(oErrors)[0], oErrors);
  assertLead(oTarget.sId, 'Only project leads can change the workflow.');
  const aRemoved = removedStatuses(workflowOf(oTarget.sId), oNext);
  const iInUse = oDb.issues.filter((oIssue) => oIssue.sProjectId === oTarget.sId && !oIssue.bArchived && aRemoved.includes(oIssue.iStatus)).length;
  if (iInUse) {
    const sStatuses = aRemoved.map((iStatus) => getIssueStatus(iStatus).label).join(', ');
    throw createDomainError(ERROR_CODES.statusInUse, `${iInUse} issue${iInUse === 1 ? ' still uses' : 's still use'} ${sStatuses}. Move them to another status before removing it.`, { aStatuses: sStatuses });
  }
  oDb.workflows.set(oTarget.sId, oNext);
  if (sTemplateKey !== undefined) oTarget.sTemplateKey = sTemplateKey;
  projectBoards(oTarget.sId).forEach((oBoard) => syncColumns(oBoard, oNext, true));
  return { oProject: oTarget, oWorkflow: oNext };
}

function createCustomFieldNow(oProject, oDraft) {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const { bValid, oErrors } = validateCustomFieldDraft(oDraft);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  assertLead(oProject.sId, 'Only project leads can add custom fields.');
  const aFields = oDb.customFields.filter((oField) => oField.sProjectId === oProject.sId);
  if (aFields.some((oField) => oField.sName.toLowerCase() === String(oDraft.sName).trim().toLowerCase())) throw createDomainError(ERROR_CODES.validation, '', { sName: 'Another field in this project already uses that name.' });
  if (aFields.filter((oField) => oField.bActive).length >= LIMITS.customFieldsPerProject) throw createDomainError(ERROR_CODES.validation, `A project can have up to ${LIMITS.customFieldsPerProject} active custom fields.`);
  const bChoice = Number(oDraft.iType) === 100000004;
  const oField = {
    sId: uid(), sProjectId: oProject.sId, sName: String(oDraft.sName).trim(), iType: Number(oDraft.iType), sOptions: bChoice ? parseChoiceOptions(oDraft.sOptions).join('\n') : '',
    aOptions: bChoice ? parseChoiceOptions(oDraft.sOptions) : [], aIssueTypes: [...new Set((oDraft.aIssueTypes || []).map(Number))], sDescription: String(oDraft.sDescription || '').trim(),
    iOrder: aFields.length, bActive: true,
  };
  oDb.customFields.push(oField);
  return oField;
}

function applyTemplateNow(oProject, sTemplateKey) {
  const oTemplate = getProjectTemplate(sTemplateKey);
  if (!oTemplate) throw createDomainError(ERROR_CODES.validation, 'Choose a template.');
  const oResult = saveWorkflowNow(oProject, buildTemplateWorkflow(oTemplate), oTemplate.key);
  const aMissing = oTemplate.aCustomFields.filter((oField) => !oDb.customFields.some((oItem) => oItem.sProjectId === oProject.sId && oItem.sName.toLowerCase() === oField.sName.toLowerCase()));
  aMissing.forEach((oField) => createCustomFieldNow(oResult.oProject, { ...oField, aIssueTypes: [...oField.aIssueTypes] }));
  return { ...oResult, iFieldsAdded: aMissing.length };
}

const customValueOf = (oIssueId, sFieldId) => {
  const oRow = oDb.customValues.find((oItem) => oItem.sIssueId === oIssueId && oItem.sFieldId === sFieldId);
  return oRow && oRow.value !== undefined ? oRow.value : null;
};

function prepareCustomValues(oIssue, iIssueType, oRawValues) {
  const oErrors = {};
  const aWrites = [];
  Object.entries(oRawValues).forEach(([sFieldId, rawValue]) => {
    const oField = oDb.customFields.find((oItem) => oItem.sId === sFieldId && oItem.sProjectId === oIssue.sProjectId);
    if (!oField || !oField.bActive) { oErrors[`custom:${sFieldId}`] = 'That custom field is no longer available.'; return; }
    const { value, sError } = normaliseCustomFieldValue(oField, rawValue);
    if (sError) { oErrors[`custom:${sFieldId}`] = sError; return; }
    if (value !== null && !customFieldAppliesTo(oField, iIssueType)) { oErrors[`custom:${sFieldId}`] = `${oField.sName} isn't used for ${getIssueType(iIssueType).label} issues.`; return; }
    const oldValue = customValueOf(oIssue.sId, sFieldId);
    if (String(oldValue ?? '') !== String(value ?? '')) aWrites.push({ oField, value, oldValue });
  });
  if (Object.keys(oErrors).length) throw createDomainError(ERROR_CODES.invalidCustomFieldValue, Object.values(oErrors)[0], oErrors);
  return aWrites;
}

function writeCustomValues(oIssue, aWrites) {
  return aWrites.map(({ oField, value, oldValue }) => {
    const oRow = oDb.customValues.find((oItem) => oItem.sIssueId === oIssue.sId && oItem.sFieldId === oField.sId);
    if (oRow) oRow.value = value;
    else oDb.customValues.push({ sId: uid(), sIssueId: oIssue.sId, sFieldId: oField.sId, value });
    return { iEvent: HISTORY_EVENTS.fieldChanged, sField: `cf:${oField.sName}`, sOldValue: formatCustomFieldValue(oField, oldValue) || 'None', sNewValue: formatCustomFieldValue(oField, value) || 'None' };
  });
}

// ── Phase 3: workflow ──────────────────────────────────────────

export const getWorkflow = (sProjectId) => simulate('getWorkflow', () => workflowOf(sProjectId));
export const saveWorkflow = (oProject, oWorkflow, sTemplateKey = undefined) => simulate('saveWorkflow', () => saveWorkflowNow(oProject, oWorkflow, sTemplateKey));
export const applyProjectTemplate = (oProject, sTemplateKey) => simulate('applyProjectTemplate', () => applyTemplateNow(oProject, sTemplateKey));

// ── Phase 3: notifications ─────────────────────────────────────

const preferencesOf = () => ({ ...normaliseNotificationPreferences(oDb.preferences.get(sMeId)), sId: oDb.preferences.has(sMeId) ? sMeId : '' });
const myNotifications = (bUnreadOnly) => {
  const aEvents = enabledNotificationEvents(oDb.preferences.get(sMeId));
  return oDb.notifications.filter((oItem) => oItem.sRecipientId === sMeId && aEvents.includes(oItem.iEvent) && (!bUnreadOnly || !oItem.bRead))
    .sort((oA, oB) => oB.sCreatedOn.localeCompare(oA.sCreatedOn));
};

export const getNotificationPreferences = () => simulate('getNotificationPreferences', () => preferencesOf());
export const saveNotificationPreferences = (oPreferences) => simulate('saveNotificationPreferences', () => {
  oDb.preferences.set(sMeId, normaliseNotificationPreferences(oPreferences));
  return preferencesOf();
});
export const listNotifications = ({ bUnreadOnly = false, sSkipToken = '' } = {}) => simulate('listNotifications', () => {
  const { aSlice, sNextToken } = page(myNotifications(bUnreadOnly), sSkipToken, PAGING.notifications);
  return { aNotifications: aSlice, sNextToken };
});
export const countUnreadNotifications = () => simulate('countUnreadNotifications', () => myNotifications(true).length);
export const markNotificationsRead = (aIds) => simulate('markNotificationsRead', () => {
  oDb.notifications.filter((oItem) => aIds.includes(oItem.sId) && oItem.sRecipientId === sMeId).forEach((oItem) => { oItem.bRead = true; });
});
export const markAllNotificationsRead = () => simulate('markAllNotificationsRead', () => {
  const aUnread = oDb.notifications.filter((oItem) => oItem.sRecipientId === sMeId && !oItem.bRead);
  aUnread.forEach((oItem) => { oItem.bRead = true; });
  return aUnread.length;
});

// ── Phase 3: saved filters ─────────────────────────────────────

const filterView = (oFilter) => ({ ...oFilter, oCriteria: sanitiseFilterCriteria(oFilter.oCriteria), bMine: oFilter.sOwnerId === sMeId });

export const listSavedFilters = (sProjectId) => simulate('listSavedFilters', () => oDb.savedFilters
  .filter((oFilter) => oFilter.sProjectId === sProjectId && (oFilter.sOwnerId === sMeId || oFilter.iVisibility === FILTER_VISIBILITY[1].value))
  .sort((oA, oB) => oA.sName.localeCompare(oB.sName)).map(filterView));

export const createSavedFilter = (oProject, oDraft) => simulate('createSavedFilter', () => {
  const { bValid, oErrors } = validateSavedFilterDraft(oDraft);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (!myMembership(oProject.sId)) throw createDomainError(ERROR_CODES.permissionDenied, 'Only project members can save filters in this project.');
  const oFilter = { sId: uid(), sName: oDraft.sName.trim(), sProjectId: oProject.sId, oCriteria: sanitiseFilterCriteria(oDraft.oCriteria), iVisibility: Number(oDraft.iVisibility), sOwnerId: sMeId, sOwnerName: me().sName, sModifiedOn: now() };
  oDb.savedFilters.push(oFilter);
  return filterView(oFilter);
});

function ownFilter(oFilter) {
  const oTarget = oDb.savedFilters.find((oItem) => oItem.sId === oFilter.sId);
  if (!oTarget) throw createDomainError(ERROR_CODES.validation, 'That filter no longer exists.');
  if (oTarget.sOwnerId !== sMeId) throw createDomainError(ERROR_CODES.permissionDenied, 'Only the person who saved a filter can change or delete it.');
  return oTarget;
}

export const updateSavedFilter = (oFilter, oChanges) => simulate('updateSavedFilter', () => {
  const oTarget = ownFilter(oFilter);
  const oNext = { ...oTarget, ...oChanges };
  const { bValid, oErrors } = validateSavedFilterDraft(oNext);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  Object.assign(oTarget, { sName: oNext.sName.trim(), iVisibility: Number(oNext.iVisibility), oCriteria: sanitiseFilterCriteria(oNext.oCriteria), sModifiedOn: now() });
  return filterView(oTarget);
});

export const deleteSavedFilter = (oFilter) => simulate('deleteSavedFilter', () => {
  const oTarget = ownFilter(oFilter);
  oDb.savedFilters = oDb.savedFilters.filter((oItem) => oItem !== oTarget);
});

// ── Phase 3: bulk edit ─────────────────────────────────────────

function bulkPlan(oProject, aIssueIds, oChange, oLookups) {
  const aIds = [...new Set(aIssueIds || [])];
  const oClean = validateBulkChange(oChange, aIds.length);
  if (oClean.sField === 'sprint' && oClean.value) openSprintFor(oClean.value, oProject.sId);
  const oSprintNames = Object.fromEntries(oDb.sprints.filter((oSprint) => oSprint.sProjectId === oProject.sId).map((oSprint) => [oSprint.sId, oSprint.sName]));
  const oContext = { oWorkflow: workflowOf(oProject.sId), oSprintNames, sAssigneeName: oLookups.sAssigneeName || '' };
  const aFound = aIds.map((sId) => oDb.issues.find((oIssue) => oIssue.sId === sId && oIssue.sProjectId === oProject.sId)).filter(Boolean).map(withLabels);
  const oPlan = planBulkEdit(aFound, oClean, oContext);
  const aMissing = aIds.filter((sId) => !aFound.some((oIssue) => oIssue.sId === sId))
    .map((sIssueId) => ({ sIssueId, sKey: '', sSummary: '', sFrom: '', sTo: '', sOutcome: 'blocked', sReason: 'Not found in this project, or you don\'t have access.' }));
  return { ...oPlan, aRows: [...oPlan.aRows, ...aMissing], iBlocked: oPlan.iBlocked + aMissing.length, oChange: oClean, oContext, sDescription: describeBulkChange(oClean, oContext) };
}

export const previewBulkEdit = (oProject, aIssueIds, oChange, oLookups = {}) => simulate('previewBulkEdit', () => {
  const { aRows, iChange, iSkip, iBlocked, oChange: oClean, sDescription } = bulkPlan(oProject, aIssueIds, oChange, oLookups);
  return { aRows, iChange, iSkip, iBlocked, oChange: oClean, sDescription };
});

export const applyBulkEdit = (oProject, aIssueIds, oChange, oLookups = {}) => simulate('applyBulkEdit', () => {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  if (!getProjectPermissions(myMembership(oProject.sId)).bCanEdit) throw createDomainError(ERROR_CODES.permissionDenied, 'Only leads and contributors can bulk edit issues.');
  const oPlan = bulkPlan(oProject, aIssueIds, oChange, oLookups);
  const aChanged = [];
  const aResults = oPlan.aRows.map((oRow) => {
    if (oRow.sOutcome !== 'change') return { ...oRow, sOutcome: oRow.sOutcome === 'skip' ? 'skipped' : 'failed' };
    try {
      if (oFailures.has(`bulk:${oRow.sKey}`)) {
        oFailures.delete(`bulk:${oRow.sKey}`);
        throw new Error('Principal user is missing prvWritewd_issue privilege (0x80040220)');
      }
      const oIssue = findIssue(oRow.sIssueId);
      const oClean = oPlan.oChange;
      if (oClean.sField === 'status') transitionNow(oIssue, oClean.value, null, oClean.iResolution ? { iResolution: oClean.iResolution } : {}, false);
      else if (oClean.sField === 'addLabel') updateIssueNow(oIssue, { aLabels: [...labelsFor(oIssue.sId).map((oLabel) => oLabel.sName), oClean.value] }, false);
      else updateIssueNow(oIssue, { assignee: { sAssigneeId: oClean.value }, priority: { iPriority: oClean.value }, sprint: { sSprintId: oClean.value }, dueDate: { sDueDate: oClean.value } }[oClean.sField], false);
      aChanged.push(findIssue(oRow.sIssueId));
      return { ...oRow, sOutcome: 'success' };
    } catch (oError) {
      return { ...oRow, sOutcome: 'failed', sReason: oError.details && typeof Object.values(oError.details)[0] === 'string' ? Object.values(oError.details)[0] : toFriendlyMessage(oError) };
    }
  });
  if (aChanged.length) notify(oProject.sId, null, planBulkNotifications(aChanged, oPlan.sDescription));
  return {
    aResults, sDescription: oPlan.sDescription,
    iSucceeded: aResults.filter((oRow) => oRow.sOutcome === 'success').length,
    iFailed: aResults.filter((oRow) => oRow.sOutcome === 'failed').length,
    iSkipped: aResults.filter((oRow) => oRow.sOutcome === 'skipped').length,
  };
});

// ── Phase 3: attachments ───────────────────────────────────────
// Bytes are kept as base64 in memory; downloads skip the JSON clone so Uint8Array survives.

export const listAttachments = (sIssueId) => simulate('listAttachments', () => oDb.attachments.filter((oItem) => oItem.sIssueId === sIssueId)
  .map(({ sBase64, ...oRest }) => oRest).sort((oA, oB) => oB.sCreatedOn.localeCompare(oA.sCreatedOn)));

export async function uploadAttachment(oIssue, oFile) {
  const aBytes = new Uint8Array(await oFile.arrayBuffer());
  return simulate('uploadAttachment', () => {
    if (findIssue(oIssue.sId).bArchived) throw createDomainError(ERROR_CODES.issueArchived);
    const sName = sanitiseFileName(oFile.name);
    const sError = validateAttachment({ sName, iSize: Number(oFile.size) }, oDb.attachments.filter((oItem) => oItem.sIssueId === oIssue.sId).length);
    if (sError) throw createDomainError(ERROR_CODES.attachmentRejected, sError);
    let sBinary = '';
    aBytes.forEach((iByte) => { sBinary += String.fromCharCode(iByte); });
    const oAttachment = { sId: uid(), sIssueId: oIssue.sId, sName, iSize: aBytes.byteLength, sContentType: oFile.type || 'application/octet-stream', sUploaderId: sMeId, sUploaderName: me().sName, sCreatedOn: now() };
    oDb.attachments.push({ ...oAttachment, sBase64: btoa(sBinary) });
    addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'attachments', sOldValue: '', sNewValue: `Added ${sName}` }]);
    return { oAttachment, bHistorySaved: true };
  });
}

export async function downloadAttachment(oAttachment) {
  await simulate('downloadAttachment', () => null);
  const oRow = oDb.attachments.find((oItem) => oItem.sId === oAttachment.sId);
  if (!oRow) throw createDomainError(ERROR_CODES.attachmentNotFound);
  return { aBytes: Uint8Array.from(atob(oRow.sBase64), (sChar) => sChar.charCodeAt(0)), sName: oRow.sName };
}

export const deleteAttachment = (oIssue, oAttachment) => simulate('deleteAttachment', () => {
  if (oAttachment.sUploaderId !== sMeId) throw createDomainError(ERROR_CODES.permissionDenied, 'Only the person who attached a file can delete it.');
  oDb.attachments = oDb.attachments.filter((oItem) => oItem.sId !== oAttachment.sId);
  return addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'attachments', sOldValue: oAttachment.sName, sNewValue: `Removed ${oAttachment.sName}` }]);
});

// ── Phase 3: custom fields ─────────────────────────────────────

const projectFields = (sProjectId) => oDb.customFields.filter((oField) => oField.sProjectId === sProjectId).sort((oA, oB) => oA.iOrder - oB.iOrder || oA.sName.localeCompare(oB.sName));

export const listCustomFields = (sProjectId, bIncludeInactive = false) => simulate('listCustomFields', () => projectFields(sProjectId).filter((oField) => bIncludeInactive || oField.bActive));
export const createCustomField = (oProject, oDraft) => simulate('createCustomField', () => createCustomFieldNow(oProject, oDraft));

export const updateCustomField = (oProject, oField, oChanges) => simulate('updateCustomField', () => {
  const oTarget = oDb.customFields.find((oItem) => oItem.sId === oField.sId);
  const oNext = { ...oTarget, ...oChanges, iType: oTarget.iType };
  const { bValid, oErrors } = validateCustomFieldDraft(oNext);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  assertLead(oProject.sId, 'Only project leads can change custom fields.');
  if (projectFields(oProject.sId).some((oItem) => oItem.sId !== oTarget.sId && oItem.sName.toLowerCase() === String(oNext.sName).trim().toLowerCase())) {
    throw createDomainError(ERROR_CODES.validation, '', { sName: 'Another field in this project already uses that name.' });
  }
  if (oChanges.bActive === true && !oTarget.bActive && projectFields(oProject.sId).filter((oItem) => oItem.bActive).length >= LIMITS.customFieldsPerProject) {
    throw createDomainError(ERROR_CODES.validation, `A project can have up to ${LIMITS.customFieldsPerProject} active custom fields.`);
  }
  const bChoice = oTarget.iType === 100000004;
  return Object.assign(oTarget, {
    sName: String(oNext.sName).trim(), sOptions: bChoice ? parseChoiceOptions(oNext.sOptions).join('\n') : '', aOptions: bChoice ? parseChoiceOptions(oNext.sOptions) : [],
    aIssueTypes: [...new Set((oNext.aIssueTypes || []).map(Number))], sDescription: String(oNext.sDescription || '').trim(),
    ...(oChanges.bActive !== undefined ? { bActive: Boolean(oChanges.bActive) } : {}), ...(oChanges.iOrder !== undefined ? { iOrder: Number(oChanges.iOrder) } : {}),
  });
});

export const getIssueCustomFields = (oIssue) => simulate('getIssueCustomFields', () => {
  const aFields = projectFields(oIssue.sProjectId);
  return { aFields, oValues: Object.fromEntries(aFields.map((oField) => [oField.sId, customValueOf(oIssue.sId, oField.sId)])) };
});

// ── Phase 4: versions ──────────────────────────────────────────

const findVersion = (sId) => {
  const oVersion = oDb.versions.find((oItem) => oItem.sId === sId);
  if (!oVersion) throw createDomainError(ERROR_CODES.versionNotFound);
  return oVersion;
};

function usableVersion(sVersionId, sProjectId) {
  assertFeature('releases');
  const oVersion = findVersion(sVersionId);
  if (oVersion.sProjectId !== sProjectId) throw createDomainError(ERROR_CODES.versionProjectMismatch);
  if (isVersionArchived(oVersion.iState)) throw createDomainError(ERROR_CODES.versionArchived);
  return oVersion;
}

function checkVersionDraft(oProject, oDraft, sExceptId = '') {
  if (findProject(oProject.sId).bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const { bValid, oErrors } = validateVersionDraft(oDraft);
  if (!bValid) throw createDomainError(ERROR_CODES.invalidVersion, Object.values(oErrors)[0], oErrors);
  assertLead(oProject.sId, 'Only project leads can manage versions.');
  if (isVersionNameTaken(oDb.versions.filter((oVersion) => oVersion.sProjectId === oProject.sId), oDraft.sName, sExceptId)) {
    throw createDomainError(ERROR_CODES.versionNameTaken, '', { sName: 'Another version in this project already uses that name.' });
  }
}

const versionFields = (oDraft) => ({
  sName: String(oDraft.sName).trim(), sDescription: String(oDraft.sDescription || '').trim(), sStartDate: oDraft.sStartDate || '', sReleaseDate: oDraft.sReleaseDate || '',
});

export const listVersions = (sProjectId) => simulate('listVersions', () => {
  assertFeature('releases');
  return sortVersions(oDb.versions.filter((oVersion) => oVersion.sProjectId === sProjectId));
});

export const createVersion = (oProject, oDraft) => simulate('createVersion', () => {
  assertFeature('releases');
  checkVersionDraft(oProject, oDraft);
  const oVersion = { sId: uid(), sProjectId: oProject.sId, ...versionFields(oDraft), iState: VERSION_STATE.unreleased, sReleasedOn: '', sCreatedOn: now() };
  oDb.versions.push(oVersion);
  return oVersion;
});

export const updateVersion = (oProject, oVersion, oChanges) => simulate('updateVersion', () => {
  assertFeature('releases');
  const oTarget = findVersion(oVersion.sId);
  const oNext = { ...oTarget, ...oChanges };
  checkVersionDraft(oProject, oNext, oTarget.sId);
  Object.assign(oTarget, versionFields(oNext));
  oDb.issues.filter((oIssue) => oIssue.sFixVersionId === oTarget.sId).forEach((oIssue) => { oIssue.sFixVersionName = oTarget.sName; });
  return oTarget;
});

export const getVersionProgress = (oProject) => simulate('getVersionProgress', () => {
  assertFeature('releases');
  const aIssues = oDb.issues.filter((oIssue) => oIssue.sProjectId === oProject.sId && oIssue.sFixVersionId && !oIssue.bArchived);
  const aIds = [...new Set(aIssues.map((oIssue) => oIssue.sFixVersionId))];
  return Object.fromEntries(aIds.map((sId) => [sId, computeVersionProgress(aIssues.filter((oIssue) => oIssue.sFixVersionId === sId))]));
});

export const releaseVersion = (oProject, oVersion, { sDestination = '', sReleaseDate = '' } = {}) => simulate('releaseVersion', () => {
  assertFeature('releases');
  if (findProject(oProject.sId).bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  assertLead(oProject.sId, 'Only project leads can release versions.');
  const oTarget = findVersion(oVersion.sId);
  if (oTarget.iState !== VERSION_STATE.unreleased) throw createDomainError(ERROR_CODES.validation, 'Only unreleased versions can be released.');
  if (sReleaseDate && !isValidDateOnly(sReleaseDate)) throw createDomainError(ERROR_CODES.validation, '', { sReleaseDate: 'Enter a valid date.' });
  const { aMove, sTargetVersionId } = planVersionRelease(oDb.issues.filter((oIssue) => oIssue.sFixVersionId === oTarget.sId), sDestination, oTarget.sId);
  const oDestination = aMove.length && sTargetVersionId ? usableVersion(sTargetVersionId, oProject.sId) : null;
  if (oDestination && oDestination.iState !== VERSION_STATE.unreleased) throw createDomainError(ERROR_CODES.validation, 'Move unfinished issues to an unreleased version.');
  aMove.forEach((oIssue) => {
    addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'fixVersion', sOldValue: oTarget.sName, sNewValue: oDestination ? oDestination.sName : 'None' }]);
    Object.assign(findIssue(oIssue.sId), { sFixVersionId: oDestination ? oDestination.sId : '', sFixVersionName: oDestination ? oDestination.sName : '', sModifiedOn: now() });
  });
  Object.assign(oTarget, { iState: VERSION_STATE.released, sReleasedOn: now(), sReleaseDate: sReleaseDate || oTarget.sReleaseDate || toDateOnly(new Date()) });
  return { oVersion: oTarget, iMoved: aMove.length, bHistorySaved: true };
});

export const setVersionState = (oProject, oVersion, iState) => simulate('setVersionState', () => {
  assertFeature('releases');
  if (!VERSION_STATES.some((oState) => oState.value === Number(iState))) throw createDomainError(ERROR_CODES.validation, 'Choose a version state.');
  if (findProject(oProject.sId).bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  assertLead(oProject.sId, 'Only project leads can change versions.');
  const oTarget = findVersion(oVersion.sId);
  if (Number(iState) === VERSION_STATE.released && !oTarget.sReleasedOn) Object.assign(oTarget, { sReleasedOn: now(), sReleaseDate: oTarget.sReleaseDate || toDateOnly(new Date()) });
  if (Number(iState) === VERSION_STATE.unreleased) oTarget.sReleasedOn = '';
  oTarget.iState = Number(iState);
  return oTarget;
});

// ── Phase 4: work logs ─────────────────────────────────────────

function assertCanLog(oIssue) {
  if (oIssue.bArchived) throw createDomainError(ERROR_CODES.issueArchived);
  const oProject = findProject(oIssue.sProjectId);
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  if (!getProjectPermissions(myMembership(oIssue.sProjectId), oProject.bArchived).bCanEdit) throw createDomainError(ERROR_CODES.permissionDenied, 'Only leads and contributors can log work.');
}

function checkWorkLog(oDraft) {
  const { bValid, oErrors } = validateWorkLog(oDraft, toDateOnly(new Date()));
  if (!bValid) throw createDomainError(ERROR_CODES.invalidWorkLog, Object.values(oErrors)[0], oErrors);
}

function refreshTimeSpent(oIssue, sOldValue, sNewValue) {
  oIssue.iTimeSpent = sumWorkLogMinutes(oDb.workLogs.filter((oLog) => oLog.sIssueId === oIssue.sId));
  oIssue.sModifiedOn = now();
  addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'worklog', sOldValue, sNewValue }]);
}

export const listWorkLogs = (sIssueId, sSkipToken = '') => simulate('listWorkLogs', () => {
  assertFeature('timeTracking');
  const aItems = oDb.workLogs.filter((oLog) => oLog.sIssueId === sIssueId).sort((oA, oB) => oB.sWorkDate.localeCompare(oA.sWorkDate) || oB.sCreatedOn.localeCompare(oA.sCreatedOn));
  const { aSlice, sNextToken, iCount } = page(aItems, sSkipToken, PAGING.workLogs);
  return { aWorkLogs: aSlice, sNextToken, iCount };
});

export const logWork = (oIssue, oDraft) => simulate('logWork', () => {
  assertFeature('timeTracking');
  checkWorkLog(oDraft);
  if (oDraft.iRemainingEstimate !== undefined && oDraft.iRemainingEstimate !== null && !isValidEstimate(oDraft.iRemainingEstimate)) {
    throw createDomainError(ERROR_CODES.validation, '', { iRemainingEstimate: 'Enter a valid remaining estimate.' });
  }
  const oTarget = findIssue(oIssue.sId);
  assertCanLog(oTarget);
  const iRemaining = oDraft.iRemainingEstimate !== undefined ? oDraft.iRemainingEstimate : remainingAfterLog(oTarget, oDraft.iMinutes);
  const oWorkLog = {
    sId: uid(), sIssueId: oTarget.sId, iMinutes: oDraft.iMinutes, sWorkDate: oDraft.sWorkDate, sComment: String(oDraft.sComment || '').trim(), bVoided: false,
    sVoidReason: '', sVoidedOn: '', sAuthorId: sMeId, sAuthorName: me().sName, sCreatedOn: now(), sModifiedOn: now(),
  };
  oDb.workLogs.push(oWorkLog);
  refreshTimeSpent(oTarget, '', `Logged ${formatDuration(oDraft.iMinutes)} on ${formatDateOnly(oDraft.sWorkDate)}`);
  if (iRemaining !== (oTarget.iRemainingEstimate ?? null)) updateIssueNow(oTarget, { iRemainingEstimate: iRemaining }, false);
  return { oWorkLog, oIssue: withLabels(oTarget), bHistorySaved: true, bRemainingSaved: true };
});

export const updateWorkLog = (oIssue, oWorkLog, oChanges) => simulate('updateWorkLog', () => {
  assertFeature('timeTracking');
  const oTarget = oDb.workLogs.find((oLog) => oLog.sId === oWorkLog.sId);
  if (!oTarget) throw createDomainError(ERROR_CODES.workLogNotFound);
  if (oTarget.bVoided) throw createDomainError(ERROR_CODES.workLogLocked);
  if (oTarget.sAuthorId !== sMeId) throw createDomainError(ERROR_CODES.permissionDenied, 'Only the person who logged the work can change it.');
  const oNext = { iMinutes: oTarget.iMinutes, sWorkDate: oTarget.sWorkDate, sComment: oTarget.sComment, ...oChanges };
  checkWorkLog(oNext);
  const oIssueRow = findIssue(oIssue.sId);
  assertCanLog(oIssueRow);
  const sOld = `${formatDuration(oTarget.iMinutes)} on ${formatDateOnly(oTarget.sWorkDate)}`;
  Object.assign(oTarget, { iMinutes: oNext.iMinutes, sWorkDate: oNext.sWorkDate, sComment: String(oNext.sComment || '').trim(), sModifiedOn: now() });
  refreshTimeSpent(oIssueRow, sOld, `${formatDuration(oTarget.iMinutes)} on ${formatDateOnly(oTarget.sWorkDate)}`);
  return { oWorkLog: oTarget, oIssue: withLabels(oIssueRow), bHistorySaved: true };
});

export const voidWorkLog = (oIssue, oWorkLog, sReason) => simulate('voidWorkLog', () => {
  assertFeature('timeTracking');
  const sError = validateVoidReason(sReason);
  if (sError) throw createDomainError(ERROR_CODES.validation, sError, { sReason: sError });
  const oTarget = oDb.workLogs.find((oLog) => oLog.sId === oWorkLog.sId);
  if (!oTarget) throw createDomainError(ERROR_CODES.workLogNotFound);
  if (oTarget.bVoided) throw createDomainError(ERROR_CODES.workLogLocked);
  const oIssueRow = findIssue(oIssue.sId);
  if (oTarget.sAuthorId !== sMeId && !getProjectPermissions(myMembership(oIssueRow.sProjectId)).bCanManage) {
    throw createDomainError(ERROR_CODES.permissionDenied, 'Only the person who logged the work, or a project lead, can void it.');
  }
  assertCanLog(oIssueRow);
  Object.assign(oTarget, { bVoided: true, sVoidReason: String(sReason).trim(), sVoidedOn: now(), sModifiedOn: now() });
  refreshTimeSpent(oIssueRow, `${formatDuration(oTarget.iMinutes)} on ${formatDateOnly(oTarget.sWorkDate)}`, truncateText(`Voided: ${oTarget.sVoidReason}`));
  return { oWorkLog: oTarget, oIssue: withLabels(oIssueRow), bHistorySaved: true };
});

// ── Phase 4: analytics, CSV, dependencies ──────────────────────

export const getAnalytics = (oProject, { iWeeks = ANALYTICS.iDefaultWeeks } = {}) => simulate('getAnalytics', () => {
  assertFeature('analytics');
  if (!ANALYTICS.aWindows.includes(Number(iWeeks))) throw createDomainError(ERROR_CODES.validation, 'Choose a reporting window.');
  const aIssues = oDb.issues.filter((oIssue) => oIssue.sProjectId === oProject.sId && !oIssue.bArchived);
  const oNow = new Date();
  return {
    ...buildAnalytics({
      aResolved: aIssues.filter((oIssue) => oIssue.sResolvedOn), aDueDated: aIssues.filter((oIssue) => oIssue.sDueDate),
      aOpen: aIssues.filter((oIssue) => !isDoneStatus(oIssue.iStatus)), aSprints: oDb.sprints.filter((oSprint) => oSprint.sProjectId === oProject.sId),
    }, oNow, Number(iWeeks)),
    bTruncated: false, sGeneratedOn: oNow.toISOString(),
  };
});

export const exportIssues = (oProject, oCriteria, aOrderBy = ['modifiedon desc']) => simulate('exportIssues', () => {
  assertFeature('csv');
  const aIssues = sortIssues(queryIssues({ ...oCriteria, sProjectId: oProject.sId }), aOrderBy);
  const aSlice = aIssues.slice(0, LIMITS.csvExportMax).map(withLabels);
  return { sCsv: issuesToCsv(aSlice), iCount: aSlice.length, bTruncated: aIssues.length > LIMITS.csvExportMax, sFileName: `${oProject.sKey}-issues-${toDateOnly(new Date())}.csv` };
});

function planImportNow(oProject, sCsv) {
  assertFeature('csv');
  if (findProject(oProject.sId).bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  if (String(sCsv || '').length > LIMITS.csvImportBytes) throw createDomainError(ERROR_CODES.validation, `Import files can be up to ${Math.round(LIMITS.csvImportBytes / 1024)} KB.`);
  if (!getProjectPermissions(myMembership(oProject.sId)).bCanEdit) throw createDomainError(ERROR_CODES.permissionDenied, 'Only leads and contributors can import issues.');
  const aMembers = activeMembers(oProject.sId).map((oMember) => ({ ...oMember, sEmail: (oDb.users.find((oUser) => oUser.sId === oMember.sUserId) || {}).sEmail || '' }));
  return planCsvImport(sCsv, { sProjectId: oProject.sId, aMembers, aVersions: isFeatureEnabled('releases') ? oDb.versions.filter((oVersion) => oVersion.sProjectId === oProject.sId) : [] });
}

export const previewCsvImport = (oProject, sCsv) => simulate('previewCsvImport', () => planImportNow(oProject, sCsv));

export const importCsvIssues = async (oProject, sCsv, { aOnlyLines = null, fnProgress = null } = {}) => {
  const oPlan = await simulate('importCsvIssues', () => planImportNow(oProject, sCsv));
  if (oPlan.sError) throw createDomainError(ERROR_CODES.validation, oPlan.sError);
  const aTargets = oPlan.aRows.filter((oRow) => oRow.sOutcome === 'create' && (!aOnlyLines || aOnlyLines.includes(oRow.iLine)));
  const aResults = [];
  for (const oRow of aTargets) {
    try {
      const { oIssue } = await createIssue(oProject, oRow.oDraft);
      aResults.push({ iLine: oRow.iLine, sSummary: oRow.sSummary, sOutcome: 'success', sKey: oIssue.sKey, sReason: '' });
    } catch (oError) {
      aResults.push({ iLine: oRow.iLine, sSummary: oRow.sSummary, sOutcome: 'failed', sKey: '', sReason: toFriendlyMessage(oError) });
    }
    if (fnProgress) fnProgress(aResults.length, aTargets.length);
  }
  return { aResults, iSucceeded: aResults.filter((oRow) => oRow.sOutcome === 'success').length, iFailed: aResults.filter((oRow) => oRow.sOutcome === 'failed').length, iSkipped: oPlan.iError };
};

export const getDependencyGraph = (oProject, { sScope = 'open', sScopeId = '', bIncludeRelated = false } = {}) => simulate('getDependencyGraph', () => {
  assertFeature('dependencies');
  const oCriteria = { sProjectId: oProject.sId, ...({ sprint: { sSprintId: sScopeId }, version: { sFixVersionId: sScopeId }, epic: { sParentId: sScopeId } }[sScope] || { bOpenOnly: true }) };
  const aAll = sortIssues(queryIssues(oCriteria), ['wd_rank asc']);
  const aIssues = aAll.slice(0, LIMITS.dependencyIssuesMax);
  const aIds = aIssues.map((oIssue) => oIssue.sId);
  const aLinks = oDb.links.filter((oLink) => (aIds.includes(oLink.sFromId) || aIds.includes(oLink.sToId)) && (bIncludeRelated || oLink.iType === 100000000));
  const aOutside = [...new Set(aLinks.flatMap((oLink) => [oLink.sFromId, oLink.sToId]).filter((sId) => !aIds.includes(sId)))];
  const aExternal = aOutside.slice(0, LIMITS.dependencyExternalMax).map((sId) => oDb.issues.find((oIssue) => oIssue.sId === sId)).filter((oIssue) => oIssue && !oIssue.bArchived).map((oIssue) => ({ ...oIssue, bExternal: true }));
  return { ...buildDependencyGraph([...aIssues, ...aExternal], aLinks, { bIncludeRelated }), bTruncated: aAll.length > LIMITS.dependencyIssuesMax, iScopeIssues: aIssues.length };
});

// ── Power Platform solutions (Phase 5) ─────────────────────────

const environmentByUrl = (oEnvironment) => {
  const sUrl = normaliseDataverseUrl(oEnvironment && oEnvironment.sUrl);
  const oFound = oDb.environments.find((oItem) => oItem.sUrl === sUrl);
  if (!sUrl || !oFound) throw createDomainError(ERROR_CODES.invalidEpicSolution, 'Choose an environment that has Dataverse.');
  return oFound;
};
const solutionsIn = (oEnvironment) => oDb.solutions.get(environmentByUrl(oEnvironment).sId) || [];
const epicLinks = (sIssueId) => oDb.epicSolutions.filter((oLink) => oLink.sIssueId === sIssueId).sort((oA, oB) => oA.iStage - oB.iStage);

export const listEnvironments = () => simulate('listEnvironments', () => {
  assertFeature('powerPlatform');
  return [...oDb.environments].sort((oA, oB) => oA.sName.localeCompare(oB.sName));
});

export const searchSolutions = (oEnvironment, sText = '') => simulate('searchSolutions', () => {
  assertFeature('powerPlatform');
  const sQuery = String(sText || '').trim().toLowerCase();
  return solutionsIn(oEnvironment).filter((oSolution) => !sQuery || oSolution.sName.toLowerCase().includes(sQuery) || oSolution.sUniqueName.toLowerCase().includes(sQuery))
    .sort((oA, oB) => oA.sName.localeCompare(oB.sName));
});

export const findSolution = (oEnvironment, { sSolutionId = '', sUniqueName = '' } = {}) => simulate('findSolution', () => {
  assertFeature('powerPlatform');
  if (sSolutionId) assertGuid(sSolutionId, 'solution');
  else if (!isValidSolutionUniqueName(sUniqueName)) throw createDomainError(ERROR_CODES.validation, 'Invalid solution name.');
  return solutionsIn(oEnvironment).find((oSolution) => (sSolutionId ? oSolution.sId === sSolutionId.toLowerCase() : oSolution.sUniqueName === sUniqueName)) || null;
});

export const listEpicSolutions = (sIssueId) => simulate('listEpicSolutions', () => {
  assertFeature('powerPlatform');
  return epicLinks(sIssueId);
});

function editableEpic(oEpic) {
  const oIssue = findIssue(oEpic.sId);
  if (!isEpicType(oIssue.iType)) throw createDomainError(ERROR_CODES.invalidEpicSolution, 'Only epics link solutions.');
  if (oIssue.bArchived) throw createDomainError(ERROR_CODES.issueArchived);
  if (findProject(oIssue.sProjectId).bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  if (!getProjectPermissions(myMembership(oIssue.sProjectId)).bCanEdit) throw createDomainError(ERROR_CODES.permissionDenied, 'Only leads and contributors can change an epic\'s solutions.');
  return oIssue;
}

export const linkEpicSolution = (oEpic, iStage, oEnvironment, oSolution) => simulate('linkEpicSolution', () => {
  assertFeature('powerPlatform');
  const { bValid, oErrors } = validateEpicSolutionDraft({ iStage: Number(iStage), oEnvironment, oSolution });
  if (!bValid) throw createDomainError(ERROR_CODES.invalidEpicSolution, Object.values(oErrors)[0], oErrors);
  const oIssue = editableEpic(oEpic);
  const oKnown = environmentByUrl(oEnvironment);
  if (oKnown.sId !== oEnvironment.sId) throw createDomainError(ERROR_CODES.invalidEpicSolution, 'Choose one of your Power Platform environments.');
  const oLive = solutionsIn(oKnown).find((oItem) => oItem.sId === oSolution.sId);
  if (!oLive) throw createDomainError(ERROR_CODES.solutionNotFound);
  const oStage = getSolutionStage(iStage);
  const oExisting = epicLinks(oIssue.sId).find((oLink) => oLink.iStage === oStage.value) || null;
  const oBefore = clone(oExisting);
  const oValues = {
    sEnvironmentId: oKnown.sId, sEnvironmentName: oKnown.sName, sEnvironmentUrl: oKnown.sUrl, sSolutionId: oLive.sId, sSolutionUniqueName: oLive.sUniqueName,
    sSolutionName: oLive.sName, sSolutionVersion: oLive.sVersion, sSolutionModifiedOn: oLive.sModifiedOn, sModifiedByName: me().sName, sModifiedOn: now(),
  };
  const oLink = oExisting ? Object.assign(oExisting, oValues) : { sId: uid(), sIssueId: oIssue.sId, sProjectId: oIssue.sProjectId, iStage: oStage.value, ...oValues };
  if (!oExisting) oDb.epicSolutions.push(oLink);
  addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: `solution:${oStage.key}`, sOldValue: describeEpicSolution(oBefore), sNewValue: describeEpicSolution(oLink) }]);
  return { oLink, aLinks: epicLinks(oIssue.sId), oSolution: oLive, bHistorySaved: true };
});

export const unlinkEpicSolution = (oEpic, iStage) => simulate('unlinkEpicSolution', () => {
  assertFeature('powerPlatform');
  const oStage = getSolutionStage(iStage);
  if (!oStage) throw createDomainError(ERROR_CODES.invalidEpicSolution, 'Choose a stage.');
  const oIssue = editableEpic(oEpic);
  const oExisting = epicLinks(oIssue.sId).find((oLink) => oLink.iStage === oStage.value);
  if (!isLinkedSolution(oExisting)) return { aLinks: epicLinks(oIssue.sId), bHistorySaved: true };
  const oBefore = clone(oExisting);
  Object.assign(oExisting, { sEnvironmentId: '', sEnvironmentName: '', sEnvironmentUrl: '', sSolutionId: '', sSolutionUniqueName: '', sSolutionName: '', sSolutionVersion: '', sSolutionModifiedOn: '', sModifiedOn: now() });
  addHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: `solution:${oStage.key}`, sOldValue: describeEpicSolution(oBefore), sNewValue: 'None' }]);
  return { aLinks: epicLinks(oIssue.sId), bHistorySaved: true };
});

export const getLinkedSolution = (oLink) => simulate('getLinkedSolution', () => {
  assertFeature('powerPlatform');
  if (!isLinkedSolution(oLink)) return null;
  return solutionsIn({ sUrl: oLink.sEnvironmentUrl }).find((oSolution) => oSolution.sId === oLink.sSolutionId) || null;
});

export const getStoryVersionCheck = (oStory, iStage) => simulate('getStoryVersionCheck', () => {
  assertFeature('powerPlatform');
  if (!isStoryType(oStory.iType)) throw createDomainError(ERROR_CODES.validation, 'Only stories check solution versions.');
  const oStage = getSolutionStage(iStage);
  if (!oStage) throw createDomainError(ERROR_CODES.validation, 'Choose a stage.');
  const oParent = oStory.sParentId ? findIssue(oStory.sParentId) : null;
  const oEpic = oParent && isEpicType(oParent.iType) ? withLabels(oParent) : null;
  const oLink = oEpic ? epicLinks(oEpic.sId).find((oItem) => oItem.iStage === oStage.value && isLinkedSolution(oItem)) || null : null;
  const oSolution = oLink ? solutionsIn({ sUrl: oLink.sEnvironmentUrl }).find((oItem) => oItem.sId === oLink.sSolutionId) || null : null;
  return { oEpic, oLink, oSolution, sError: '', oCheck: buildStoryVersionCheck({ sExpected: oStory.sSolutionVersion, bHasEpic: Boolean(oEpic), oLink, oSolution }) };
});
