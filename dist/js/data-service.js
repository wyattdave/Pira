// Dataverse data access for Pira. Every read is filtered, selected and paged server-side.
// UI-first phase: key allocation, history and access checks run here until the C# plug-in / Custom APIs replace them.
import { initDataSources, createItem, getItem, updateItem, deleteItem, unwrapResult } from '../codeapp.js';
import { getClient, getContext } from '../power-apps-data.js';
import {
  TABLES, PROJECT_TYPES, PROJECT_STATE, MEMBER_STATE, MEMBER_ROLES, BOARD_TYPE, BOARD_TYPES, HISTORY_EVENTS,
  WORKFLOW, PAGING, KEY_ALLOCATION_RETRIES, RECENTLY_UPDATED_DAYS, CACHE_TTL_MS, SERVER_LOGIC, SERVER_LOGIC_MODES,
  PRIORITIES, SPRINT_STATE, LIMITS, WRITE_BATCH_SIZE, TRANSITION_REQUIREMENTS, FILTER_VISIBILITY, NOTIFICATION_DELIVERY,
  VERSION_STATE, VERSION_STATES, ANALYTICS, POWER_PLATFORM,
} from '../config/app-config.js';
import {
  ERROR_CODES, createDomainError, isDuplicateKeyError, isGuid, assertGuid, escapeODataString,
  normaliseProjectKey, validateProjectDraft, formatIssueKey, validateIssueDraft, validateParent, validateCommentBody,
  assertTransition, isDoneStatus, rankBetween, normaliseLabels, buildIssueFilter, buildMyWorkCriteria,
  diffDisplayValues, truncateText, getIssueStatus, getIssueType, getPriority, formatDateOnly, toDateOnly,
  isValidRank, isRankOrdered, validateTypeChange, canHaveChildren, getAllowedParentTypes, formatStoryPoints,
  validateSprintDraft, assertSprintTransition, isSprintLocked, isSprintOpen, computeSprintMetrics, describeScopeChange,
  planSprintCompletion, LINK_CHOICES, describeLink, validateIssueLink, getProjectPermissions,
  DEFAULT_WORKFLOW, getTransitionRequirements, assertTransitionFields, workflowFromRecords, validateWorkflow, diffWorkflowTransitions,
  serialiseStatusList, removedStatuses, getProjectTemplate, buildTemplateWorkflow, normaliseRequirements, getResolution, isValidResolution,
  isValidStoryPoints, isValidDateOnly, validateCustomFieldDraft, parseChoiceOptions, customFieldAppliesTo, normaliseCustomFieldValue,
  formatCustomFieldValue, getCustomFieldType, parseFilterCriteria, serialiseFilterCriteria, validateSavedFilterDraft,
  validateBulkChange, planBulkEdit, describeBulkChange, extractMentions, finaliseNotifications, planAssignmentNotifications,
  planStatusNotifications, planCommentNotifications, planBulkNotifications, enabledNotificationEvents, normaliseNotificationPreferences,
  getNotificationEvent, sanitiseFileName, validateAttachment, isPermissionError, toFriendlyMessage,
  assertFeature, isFeatureEnabled, formatDuration, isValidEstimate, validateWorkLog, validateVoidReason, remainingAfterLog, remainingForNewEstimate,
  validateVersionDraft, isVersionNameTaken, isVersionArchived, planVersionRelease, computeVersionProgress, sortVersions,
  queryUsesFields, buildAnalytics, buildWeekBuckets, issuesToCsv, planCsvImport, buildDependencyGraph, getStatusCategory,
  isStoryType, isEpicType, normaliseSolutionVersion, mapEnvironment, buildSolutionSearchFilter, buildSolutionLookupFilter, mapSolution,
  normaliseDataverseUrl, validateEpicSolutionDraft, describeEpicSolution, isLinkedSolution, getSolutionStage, isValidSolutionStage,
  buildStoryVersionCheck,
} from './domain.js';

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const LEAD_ROLE = MEMBER_ROLES[0].value;

const USER_SELECT = ['systemuserid', 'fullname', 'internalemailaddress', 'azureactivedirectoryobjectid'];
const PROJECT_SELECT = ['wd_projectid', 'wd_name', 'wd_key', 'wd_description', 'wd_projecttype', 'wd_state', '_wd_lead_value', 'createdon',
  'wd_workflowstatuses', 'wd_initialstatus', 'wd_workflowtemplate'];
const MEMBER_SELECT = ['wd_projectmemberid', '_wd_project_value', '_wd_user_value', 'wd_projectrole', 'wd_membershipstate', 'wd_joinedon'];
const BOARD_SELECT = ['wd_boardid', 'wd_name', 'wd_boardtype', 'wd_isdefault', 'wd_active', '_wd_project_value'];
const COLUMN_SELECT = ['wd_boardcolumnid', 'wd_name', 'wd_order', 'wd_status', 'wd_wiplimit'];
const TIME_SELECT = ['wd_originalestimate', 'wd_remainingestimate', 'wd_timespent'];
const ISSUE_SELECT = ['wd_issueid', 'wd_issuekey', 'wd_summary', 'wd_issuetype', 'wd_status', 'wd_priority', '_wd_project_value',
  '_wd_assignee_value', '_wd_parentissue_value', '_createdby_value', 'wd_duedate', 'wd_rank', 'wd_archived', 'createdon', 'modifiedon',
  'wd_storypoints', '_wd_sprint_value', 'wd_resolution', ...TIME_SELECT, '_wd_fixversion_value', 'wd_resolvedon', 'wd_solutionversion'];
const ISSUE_DETAIL_SELECT = [...ISSUE_SELECT, 'wd_description', 'wd_startedon'];
const METRIC_SELECT = ['wd_issueid', 'wd_issuekey', 'wd_status', 'wd_storypoints', 'wd_archived', '_wd_project_value', '_wd_sprint_value', 'createdon', '_wd_fixversion_value'];
const SPRINT_SELECT = ['wd_sprintid', 'wd_name', '_wd_project_value', '_wd_board_value', 'wd_goal', 'wd_startdate', 'wd_enddate', 'wd_sprintstate',
  'wd_startedon', 'wd_completedon', 'wd_correctionnote', 'wd_committedissues', 'wd_committedpoints', 'wd_completedissues', 'wd_completedpoints',
  'wd_incompleteissues', 'wd_incompletepoints', 'createdon'];
const LINK_SELECT = ['wd_issuelinkid', '_wd_fromissue_value', '_wd_toissue_value', 'wd_linktype'];
const COMMENT_SELECT = ['wd_issuecommentid', 'wd_body', 'wd_isedited', 'wd_editedon', '_createdby_value', 'createdon'];
const HISTORY_SELECT = ['wd_issuehistoryid', 'wd_eventtype', 'wd_fieldname', 'wd_oldvalue', 'wd_newvalue', '_createdby_value', 'createdon'];
const TRANSITION_SELECT = ['wd_workflowtransitionid', 'wd_fromstatus', 'wd_tostatus', 'wd_active', ...TRANSITION_REQUIREMENTS.map((oItem) => oItem.column)];
const SAVED_FILTER_SELECT = ['wd_savedfilterid', 'wd_name', '_wd_project_value', 'wd_criteria', 'wd_visibility', '_createdby_value', 'modifiedon'];
const NOTIFICATION_SELECT = ['wd_notificationid', '_wd_issue_value', '_wd_project_value', 'wd_eventtype', 'wd_detail', 'wd_itemcount', 'wd_isread', '_createdby_value', 'createdon'];
const PREFERENCE_COLUMNS = Object.freeze({
  bAssigned: 'wd_notifyassigned', bMentioned: 'wd_notifymentioned', bStatus: 'wd_notifystatus', bComments: 'wd_notifycomments',
  bBulk: 'wd_notifybulk', bEmail: 'wd_sendemail', bTeams: 'wd_sendteams',
});
const ATTACHMENT_SELECT = ['wd_issueattachmentid', '_wd_issue_value', 'wd_name', 'wd_filesize', 'wd_contenttype', '_createdby_value', 'createdon'];
const ATTACHMENT_FILE_COLUMN = 'wd_file';
const CUSTOM_FIELD_SELECT = ['wd_customfieldid', '_wd_project_value', 'wd_name', 'wd_fieldtype', 'wd_options', 'wd_issuetypes', 'wd_fielddescription', 'wd_order', 'wd_active'];
const CUSTOM_VALUE_SELECT = ['wd_customfieldvalueid', '_wd_issue_value', '_wd_customfield_value', 'wd_textvalue', 'wd_numbervalue', 'wd_datevalue', 'wd_booleanvalue'];
const VERSION_SELECT = ['wd_versionid', 'wd_name', '_wd_project_value', 'wd_versiondescription', 'wd_startdate', 'wd_releasedate', 'wd_versionstate', 'wd_releasedon', 'createdon'];
const WORKLOG_SELECT = ['wd_worklogid', '_wd_issue_value', 'wd_minutes', 'wd_workdate', 'wd_workcomment', 'wd_voided', 'wd_voidreason', 'wd_voidedon', '_createdby_value', 'createdon', 'modifiedon'];
const ANALYTICS_SELECT = ['wd_issueid', 'wd_issuekey', 'wd_status', 'wd_storypoints', 'wd_archived', 'createdon', 'wd_resolvedon', 'wd_startedon', 'wd_duedate', ...TIME_SELECT];
const HISTORY_FIELDS = Object.freeze([
  { sField: 'summary', sLabel: 'Summary' }, { sField: 'description', sLabel: 'Description' },
  { sField: 'type', sLabel: 'Issue type' }, { sField: 'priority', sLabel: 'Priority' },
  { sField: 'assignee', sLabel: 'Assignee' }, { sField: 'dueDate', sLabel: 'Due date' },
  { sField: 'parent', sLabel: 'Parent' }, { sField: 'labels', sLabel: 'Labels' }, { sField: 'points', sLabel: 'Story points' },
  { sField: 'resolution', sLabel: 'Resolution' }, { sField: 'fixVersion', sLabel: 'Fix version' },
  { sField: 'originalEstimate', sLabel: 'Original estimate' }, { sField: 'remainingEstimate', sLabel: 'Remaining estimate' },
  { sField: 'solutionVersion', sLabel: 'Solution version' },
]);
const MAX_QUERY_ROWS = 5000;

let oClient = null;
let oCurrentUser = null;
// True when Dataverse low-code plug-ins own key allocation, workflow validation and issue history.
let bServerPlugins = SERVER_LOGIC === SERVER_LOGIC_MODES.lowcode;
const oCache = new Map();
const oMetadataCache = new Map();

// ── Infrastructure ─────────────────────────────────────────────

export function initialise({ sServerLogic = SERVER_LOGIC } = {}) {
  bServerPlugins = sServerLogic === SERVER_LOGIC_MODES.lowcode;
  const oSources = {};
  Object.values(TABLES).forEach((oTable) => {
    oSources[oTable.set] = { tableId: '', version: '', primaryKey: oTable.key, dataSourceType: 'Dataverse', apis: {} };
  });
  initDataSources(oSources);
  oClient = getClient(oSources);
}

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const formattedValue = (oRow, sField) => oRow[`${sField}${FORMATTED}`] || '';

function readCache(sKey) {
  const oEntry = oCache.get(sKey);
  if (!oEntry) return undefined;
  if (Date.now() - oEntry.iTime > CACHE_TTL_MS) {
    oCache.delete(sKey);
    return undefined;
  }
  return oEntry.value;
}

// Caches the promise so concurrent callers share one request; failures are evicted.
async function cached(sKey, fnLoad) {
  const existing = readCache(sKey);
  if (existing !== undefined) return existing;
  const oPromise = fnLoad();
  oCache.set(sKey, { value: oPromise, iTime: Date.now() });
  try {
    return await oPromise;
  } catch (oError) {
    oCache.delete(sKey);
    throw oError;
  }
}

export function invalidateCache(sPrefix = '') {
  [...oCache.keys()].filter((sKey) => sKey.startsWith(sPrefix)).forEach((sKey) => oCache.delete(sKey));
}

async function queryPage(oTable, oOptions) {
  const oResult = await oClient.retrieveMultipleRecordsAsync(oTable.set, {
    filter: oOptions.sFilter || undefined,
    select: oOptions.aSelect,
    orderBy: oOptions.aOrderBy,
    top: oOptions.iTop,
    maxPageSize: oOptions.iPageSize,
    skipToken: oOptions.sSkipToken || undefined,
    count: oOptions.bCount ? true : undefined,
  });
  if (!oResult || oResult.success === false) {
    throw new Error((oResult && oResult.error && oResult.error.message) || 'Dataverse query failed.');
  }
  return {
    aRows: Array.isArray(oResult.data) ? oResult.data : [],
    sNextToken: oResult.skipToken || '',
    iCount: typeof oResult.count === 'number' ? oResult.count : null,
  };
}

async function getManyToOneRelationships(oTable) {
  if (!oMetadataCache.has(oTable.set)) {
    const oPromise = (async () => {
      const oResponse = await oClient.executeAsync({ dataverseRequest: { action: 'getEntityMetadata', parameters: {
        tableName: oTable.set, options: { schema: { manyToOne: true } },
      } } });
      const oPayload = unwrapResult(oResponse);
      const oMetadata = (oPayload && oPayload.data) || oPayload;
      if (!oMetadata || !Array.isArray(oMetadata.ManyToOneRelationships)) throw new Error('Relationship metadata is not available.');
      return oMetadata.ManyToOneRelationships;
    })();
    oMetadataCache.set(oTable.set, oPromise);
    oPromise.catch(() => oMetadataCache.delete(oTable.set));
  }
  return oMetadataCache.get(oTable.set);
}

// Navigation property names are read from metadata rather than guessed, so lookups survive schema naming differences.
async function resolveNavigation(oTable, sAttribute, bCollection = false) {
  const aRelationships = await getManyToOneRelationships(oTable);
  const oRelationship = aRelationships.find((oItem) => oItem.ReferencingAttribute === sAttribute);
  const sName = oRelationship && oRelationship[bCollection ? 'ReferencedEntityNavigationPropertyName' : 'ReferencingEntityNavigationPropertyName'];
  if (!sName) throw createDomainError(ERROR_CODES.unknown, `Pira could not resolve the ${sAttribute} relationship. Check the Dataverse table setup.`);
  return sName;
}

async function bindLookup(oTable, sAttribute, oTarget, sId) {
  const sNavigation = await resolveNavigation(oTable, sAttribute);
  return { [`${sNavigation}@odata.bind`]: sId ? `/${oTarget.set}(${assertGuid(sId)})` : null };
}

// Follows skip tokens until every row is read (capped), for small bounded sets such as one sprint's issues.
async function queryAll(oTable, oOptions, iMaxRows = MAX_QUERY_ROWS) {
  const aRows = [];
  let sSkipToken = '';
  do {
    const oPage = await queryPage(oTable, { ...oOptions, sSkipToken });
    aRows.push(...oPage.aRows);
    sSkipToken = oPage.sNextToken;
  } while (sSkipToken && aRows.length < iMaxRows);
  return aRows;
}

async function runInBatches(aItems, fnWork) {
  for (let iIndex = 0; iIndex < aItems.length; iIndex += WRITE_BATCH_SIZE) {
    await Promise.all(aItems.slice(iIndex, iIndex + WRITE_BATCH_SIZE).map(fnWork));
  }
}

async function countRows(oTable, sFilter, sKey) {
  const { iCount, aRows } = await queryPage(oTable, { sFilter, aSelect: [sKey], iPageSize: 1, bCount: true });
  return typeof iCount === 'number' ? iCount : aRows.length;
}

// ── Mappers ────────────────────────────────────────────────────

const mapUser = (oRow) => ({
  sId: oRow.systemuserid, sName: oRow.fullname || oRow.internalemailaddress || 'Unknown user', sEmail: oRow.internalemailaddress || '',
  sObjectId: oRow.azureactivedirectoryobjectid || '', bProvisioned: true,
});

const mapProject = (oRow) => ({
  sId: oRow.wd_projectid,
  sName: oRow.wd_name || '',
  sKey: oRow.wd_key || '',
  sDescription: oRow.wd_description || '',
  iType: Number(oRow.wd_projecttype) || PROJECT_TYPES[0].value,
  bArchived: Number(oRow.wd_state) === PROJECT_STATE.archived,
  sLeadId: oRow._wd_lead_value || '',
  sLeadName: formattedValue(oRow, '_wd_lead_value'),
  sCreatedOn: oRow.createdon || '',
  sWorkflowStatuses: oRow.wd_workflowstatuses || '',
  iInitialStatus: Number(oRow.wd_initialstatus) || 0,
  sTemplateKey: oRow.wd_workflowtemplate || '',
});

const mapMember = (oRow) => ({
  sId: oRow.wd_projectmemberid,
  sProjectId: oRow._wd_project_value || '',
  sProjectName: formattedValue(oRow, '_wd_project_value'),
  sUserId: oRow._wd_user_value || '',
  sUserName: formattedValue(oRow, '_wd_user_value') || 'Unknown user',
  iRole: Number(oRow.wd_projectrole) || MEMBER_ROLES[1].value,
  bActive: Number(oRow.wd_membershipstate) !== MEMBER_STATE.removed,
  sJoinedOn: oRow.wd_joinedon || '',
});

const mapColumn = (oRow) => ({
  sId: oRow.wd_boardcolumnid,
  sName: oRow.wd_name || getIssueStatus(oRow.wd_status).label,
  iOrder: Number(oRow.wd_order) || 0,
  iStatus: Number(oRow.wd_status),
  iWipLimit: Number(oRow.wd_wiplimit) || 0,
});

const mapBoard = (oRow) => ({
  sId: oRow.wd_boardid,
  sName: oRow.wd_name || 'Board',
  sProjectId: oRow._wd_project_value || '',
  iType: Number(oRow.wd_boardtype) || BOARD_TYPE.kanban,
  bDefault: oRow.wd_isdefault === true,
  bActive: oRow.wd_active !== false,
});

const mapSprint = (oRow) => ({
  sId: oRow.wd_sprintid,
  sName: oRow.wd_name || '',
  sProjectId: oRow._wd_project_value || '',
  sBoardId: oRow._wd_board_value || '',
  sGoal: oRow.wd_goal || '',
  sStartDate: String(oRow.wd_startdate || '').slice(0, 10),
  sEndDate: String(oRow.wd_enddate || '').slice(0, 10),
  iState: Number(oRow.wd_sprintstate) || SPRINT_STATE.planned,
  sStartedOn: oRow.wd_startedon || '',
  sCompletedOn: oRow.wd_completedon || '',
  sCorrectionNote: oRow.wd_correctionnote || '',
  iCommittedIssues: Number(oRow.wd_committedissues) || 0,
  iCommittedPoints: Number(oRow.wd_committedpoints) || 0,
  iCompletedIssues: Number(oRow.wd_completedissues) || 0,
  iCompletedPoints: Number(oRow.wd_completedpoints) || 0,
  iIncompleteIssues: Number(oRow.wd_incompleteissues) || 0,
  iIncompletePoints: Number(oRow.wd_incompletepoints) || 0,
  sCreatedOn: oRow.createdon || '',
});

const mapLink = (oRow) => ({
  sId: oRow.wd_issuelinkid,
  iType: Number(oRow.wd_linktype),
  sFromId: oRow._wd_fromissue_value || '',
  sFromKey: formattedValue(oRow, '_wd_fromissue_value'),
  sToId: oRow._wd_toissue_value || '',
  sToKey: formattedValue(oRow, '_wd_toissue_value'),
});

const readStoryPoints = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

const mapIssue = (oRow) => ({
  sId: oRow.wd_issueid,
  sKey: oRow.wd_issuekey || '',
  sSummary: oRow.wd_summary || '',
  sDescription: oRow.wd_description || '',
  iType: Number(oRow.wd_issuetype) || getIssueType().value,
  iStatus: Number(oRow.wd_status) || WORKFLOW.initialStatus,
  iPriority: Number(oRow.wd_priority) || getPriority().value,
  sProjectId: oRow._wd_project_value || '',
  sProjectName: formattedValue(oRow, '_wd_project_value'),
  sAssigneeId: oRow._wd_assignee_value || '',
  sAssigneeName: formattedValue(oRow, '_wd_assignee_value'),
  sReporterId: oRow._createdby_value || '',
  sReporterName: formattedValue(oRow, '_createdby_value'),
  sParentId: oRow._wd_parentissue_value || '',
  sParentKey: formattedValue(oRow, '_wd_parentissue_value'),
  sDueDate: String(oRow.wd_duedate || '').slice(0, 10),
  sRank: oRow.wd_rank || '',
  bArchived: oRow.wd_archived === true,
  sResolvedOn: oRow.wd_resolvedon || '',
  sCreatedOn: oRow.createdon || '',
  sModifiedOn: oRow.modifiedon || '',
  iStoryPoints: readStoryPoints(oRow.wd_storypoints),
  sSprintId: oRow._wd_sprint_value || '',
  sSprintName: formattedValue(oRow, '_wd_sprint_value'),
  iResolution: oRow.wd_resolution === null || oRow.wd_resolution === undefined ? null : Number(oRow.wd_resolution),
  iOriginalEstimate: readStoryPoints(oRow.wd_originalestimate),
  iRemainingEstimate: readStoryPoints(oRow.wd_remainingestimate),
  iTimeSpent: Number(oRow.wd_timespent) || 0,
  sFixVersionId: oRow._wd_fixversion_value || '',
  sFixVersionName: formattedValue(oRow, '_wd_fixversion_value'),
  sStartedOn: oRow.wd_startedon || '',
  sSolutionVersion: oRow.wd_solutionversion || '',
  aLabels: [],
});

const mapComment = (oRow) => ({
  sId: oRow.wd_issuecommentid,
  sBody: oRow.wd_body || '',
  bEdited: oRow.wd_isedited === true,
  sEditedOn: oRow.wd_editedon || '',
  sAuthorId: oRow._createdby_value || '',
  sAuthorName: formattedValue(oRow, '_createdby_value') || 'Unknown user',
  sCreatedOn: oRow.createdon || '',
});

const mapHistory = (oRow) => ({
  sId: oRow.wd_issuehistoryid,
  iEvent: Number(oRow.wd_eventtype),
  sField: oRow.wd_fieldname || '',
  sOldValue: oRow.wd_oldvalue || '',
  sNewValue: oRow.wd_newvalue || '',
  sById: oRow._createdby_value || '',
  sByName: formattedValue(oRow, '_createdby_value') || 'Unknown user',
  sOn: oRow.createdon || '',
});

const mapTransitionRow = (oRow) => ({
  sId: oRow.wd_workflowtransitionid,
  iFrom: Number(oRow.wd_fromstatus),
  iTo: Number(oRow.wd_tostatus),
  bActive: oRow.wd_active !== false,
  aRequired: TRANSITION_REQUIREMENTS.filter((oItem) => oRow[oItem.column] === true).map((oItem) => oItem.key),
});

const mapSavedFilter = (oRow, sUserId) => ({
  sId: oRow.wd_savedfilterid,
  sName: oRow.wd_name || 'Filter',
  sProjectId: oRow._wd_project_value || '',
  oCriteria: parseFilterCriteria(oRow.wd_criteria),
  iVisibility: Number(oRow.wd_visibility) || FILTER_VISIBILITY[0].value,
  sOwnerId: oRow._createdby_value || '',
  sOwnerName: formattedValue(oRow, '_createdby_value') || 'Unknown user',
  bMine: oRow._createdby_value === sUserId,
  sModifiedOn: oRow.modifiedon || '',
});

const mapNotification = (oRow) => ({
  sId: oRow.wd_notificationid,
  sIssueId: oRow._wd_issue_value || '',
  sIssueKey: formattedValue(oRow, '_wd_issue_value'),
  sProjectId: oRow._wd_project_value || '',
  sProjectName: formattedValue(oRow, '_wd_project_value'),
  iEvent: Number(oRow.wd_eventtype),
  sDetail: oRow.wd_detail || '',
  iCount: Number(oRow.wd_itemcount) || 1,
  bRead: oRow.wd_isread === true,
  sActorId: oRow._createdby_value || '',
  sActorName: formattedValue(oRow, '_createdby_value') || 'Someone',
  sCreatedOn: oRow.createdon || '',
});

const mapAttachment = (oRow) => ({
  sId: oRow.wd_issueattachmentid,
  sIssueId: oRow._wd_issue_value || '',
  sName: oRow.wd_name || 'attachment',
  iSize: Number(oRow.wd_filesize) || 0,
  sContentType: oRow.wd_contenttype || '',
  sUploaderId: oRow._createdby_value || '',
  sUploaderName: formattedValue(oRow, '_createdby_value') || 'Unknown user',
  sCreatedOn: oRow.createdon || '',
});

const mapCustomField = (oRow) => ({
  sId: oRow.wd_customfieldid,
  sProjectId: oRow._wd_project_value || '',
  sName: oRow.wd_name || '',
  iType: Number(oRow.wd_fieldtype),
  sOptions: oRow.wd_options || '',
  aOptions: parseChoiceOptions(oRow.wd_options),
  aIssueTypes: String(oRow.wd_issuetypes || '').split(',').map(Number).filter((iType) => getIssueType(iType).value === iType && iType > 0),
  sDescription: oRow.wd_fielddescription || '',
  iOrder: Number(oRow.wd_order) || 0,
  bActive: oRow.wd_active !== false,
});

// ── Users ──────────────────────────────────────────────────────

// Prefers the host-supplied Dataverse systemUserId; falls back to looking up the Entra object ID.
export async function getCurrentUser() {
  if (oCurrentUser) return oCurrentUser;
  const oContext = await getContext();
  const oHostUser = (oContext && oContext.user) || {};
  const sSystemUserId = oHostUser.systemUserId || '';
  const sObjectId = oHostUser.objectId || '';
  let aRows = [];
  if (isGuid(sSystemUserId)) {
    ({ aRows } = await queryPage(TABLES.users, { sFilter: `systemuserid eq ${assertGuid(sSystemUserId)}`, aSelect: USER_SELECT, iTop: 1 }));
  }
  if (!aRows.length && isGuid(sObjectId)) {
    ({ aRows } = await queryPage(TABLES.users, { sFilter: `azureactivedirectoryobjectid eq ${assertGuid(sObjectId)}`, aSelect: USER_SELECT, iTop: 1 }));
  }
  if (!isGuid(sSystemUserId) && !isGuid(sObjectId)) throw createDomainError(ERROR_CODES.unknown, 'Pira could not identify the signed-in user. Refresh and try again.');
  if (!aRows.length) throw createDomainError(ERROR_CODES.permissionDenied, 'Your account is not set up in this Dataverse environment. Ask an administrator to add you.');
  oCurrentUser = mapUser(aRows[0]);
  return oCurrentUser;
}

async function searchDataverseUsers(sQuery) {
  const sEscaped = escapeODataString(sQuery);
  const sTextFilter = sEscaped ? ` and (contains(fullname,'${sEscaped}') or contains(internalemailaddress,'${sEscaped}'))` : '';
  const { aRows } = await queryPage(TABLES.users, {
    sFilter: `isdisabled eq false and accessmode ne 3 and accessmode ne 4 and azureactivedirectoryobjectid ne null${sTextFilter}`,
    aSelect: USER_SELECT, aOrderBy: ['fullname asc'], iTop: PAGING.userSearch,
  });
  return aRows.map(mapUser);
}

let oPeopleConnector = null;
function loadPeopleConnector() {
  if (!oPeopleConnector) {
    oPeopleConnector = import('../connectors/office365users.js');
    oPeopleConnector.catch(() => { oPeopleConnector = null; });
  }
  return oPeopleConnector;
}

const mapEntraPerson = (oRow) => ({
  sObjectId: String(oRow.id || oRow.Id || '').toLowerCase(),
  sName: oRow.displayName || oRow.DisplayName || oRow.mail || oRow.Mail || 'Unknown person',
  sEmail: oRow.mail || oRow.Mail || oRow.userPrincipalName || oRow.UserPrincipalName || '',
  bEnabled: oRow.accountEnabled !== false && oRow.AccountEnabled !== false,
});

async function searchEntraPeople(sQuery) {
  const { searchForUsers } = await loadPeopleConnector();
  const oResponse = await searchForUsers({ searchTerm: sQuery, top: PAGING.userSearch, isSearchTermRequired: true });
  const aValues = Array.isArray(oResponse) ? oResponse : (oResponse && Array.isArray(oResponse.value) ? oResponse.value : null);
  if (!aValues) throw new Error('Office 365 Users returned an unexpected response.');
  return aValues.map(mapEntraPerson).filter((oPerson) => isGuid(oPerson.sObjectId) && oPerson.bEnabled);
}

// Entra people only become usable once Dataverse has a matching systemuser; one batched query resolves them all.
async function matchPeopleToUsers(aPeople) {
  if (!aPeople.length) return [];
  const { aRows } = await queryPage(TABLES.users, {
    sFilter: `isdisabled eq false and (${aPeople.map((oPerson) => `azureactivedirectoryobjectid eq ${assertGuid(oPerson.sObjectId)}`).join(' or ')})`,
    aSelect: USER_SELECT, iTop: aPeople.length,
  });
  const oByObjectId = new Map(aRows.map((oRow) => [String(oRow.azureactivedirectoryobjectid || '').toLowerCase(), oRow]));
  return aPeople.map((oPerson) => {
    const oRow = oByObjectId.get(oPerson.sObjectId);
    return oRow
      ? { ...mapUser(oRow), sName: oRow.fullname || oPerson.sName, sEmail: oPerson.sEmail || oRow.internalemailaddress || '' }
      : { sId: '', sName: oPerson.sName, sEmail: oPerson.sEmail, sObjectId: oPerson.sObjectId, bProvisioned: false };
  });
}

// People search: Entra ID through the Office 365 Users connector, falling back to Dataverse users if the connector is unavailable.
export async function searchUsers(sText) {
  const sQuery = String(sText || '').trim();
  if (sQuery.length < 2) return [];
  let aPeople;
  try {
    aPeople = await searchEntraPeople(sQuery);
  } catch (oError) {
    console.warn('Pira: Office 365 Users search failed; using Dataverse users instead', oError);
    return searchDataverseUsers(sQuery);
  }
  return matchPeopleToUsers(aPeople);
}

// ── Projects ───────────────────────────────────────────────────

export async function listProjects({ sText = '', bIncludeArchived = false, sSkipToken = '' } = {}) {
  const aClauses = [];
  if (!bIncludeArchived) aClauses.push(`wd_state eq ${PROJECT_STATE.active}`);
  const sQuery = escapeODataString(String(sText).trim());
  if (sQuery) aClauses.push(`(contains(wd_name,'${sQuery}') or contains(wd_key,'${sQuery}'))`);
  const { aRows, sNextToken } = await queryPage(TABLES.projects, {
    sFilter: aClauses.join(' and '), aSelect: PROJECT_SELECT, aOrderBy: ['wd_name asc'], iPageSize: PAGING.projects, sSkipToken,
  });
  return { aProjects: aRows.map(mapProject), sNextToken };
}

export async function getProject(sProjectId) {
  return cached(`project:id:${sProjectId}`, async () => {
    const oRow = await getItem(TABLES.projects.set, TABLES.projects.key, assertGuid(sProjectId, 'project'), PROJECT_SELECT);
    if (!oRow) throw createDomainError(ERROR_CODES.projectNotFound);
    return mapProject(oRow);
  });
}

export async function getProjectByKey(sKey) {
  const sProjectKey = normaliseProjectKey(sKey);
  return cached(`project:key:${sProjectKey}`, async () => {
    const { aRows } = await queryPage(TABLES.projects, {
      sFilter: `wd_key eq '${escapeODataString(sProjectKey)}'`, aSelect: PROJECT_SELECT, iTop: 1,
    });
    if (!aRows.length) throw createDomainError(ERROR_CODES.projectNotFound);
    return mapProject(aRows[0]);
  });
}

export async function isProjectKeyTaken(sKey, sExceptProjectId = '') {
  const sExcept = sExceptProjectId ? ` and wd_projectid ne ${assertGuid(sExceptProjectId)}` : '';
  const { aRows } = await queryPage(TABLES.projects, {
    sFilter: `wd_key eq '${escapeODataString(normaliseProjectKey(sKey))}'${sExcept}`, aSelect: ['wd_projectid'], iTop: 1,
  });
  return aRows.length > 0;
}

async function projectHasIssues(sProjectId) {
  const { aRows } = await queryPage(TABLES.issues, {
    sFilter: `_wd_project_value eq ${assertGuid(sProjectId)}`, aSelect: ['wd_issueid'], iTop: 1,
  });
  return aRows.length > 0;
}

export async function createProject(oDraft) {
  const oUser = await getCurrentUser();
  const sKey = normaliseProjectKey(oDraft.sKey);
  const { bValid, oErrors } = validateProjectDraft({ ...oDraft, sKey });
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (await isProjectKeyTaken(sKey)) throw createDomainError(ERROR_CODES.projectKeyTaken, '', { sKey: 'That key is already in use.' });
  const sProjectId = newId();
  await createItem(TABLES.projects.set, TABLES.projects.key, {
    wd_projectid: sProjectId,
    wd_name: String(oDraft.sName).trim(),
    wd_key: sKey,
    wd_description: String(oDraft.sDescription || '').trim(),
    wd_projecttype: Number(oDraft.iType) || PROJECT_TYPES[0].value,
    wd_state: PROJECT_STATE.active,
    ...(await bindLookup(TABLES.projects, 'wd_lead', TABLES.users, oUser.sId)),
  });
  const oProject = { sId: sProjectId, sKey, sName: String(oDraft.sName).trim() };
  // Not transactional: each follow-up is idempotent and is re-ensured lazily if a step fails.
  await Promise.all([
    addMember(oProject, oUser, LEAD_ROLE),
    ensureSequence(oProject),
    getBoard(oProject),
  ]);
  invalidateCache('projects');
  if (oDraft.sTemplateKey) {
    try {
      await applyProjectTemplate(await getProject(sProjectId), oDraft.sTemplateKey);
    } catch (oError) {
      console.warn('Pira: the project template could not be applied', oError);
    }
  }
  return getProject(sProjectId);
}

export async function updateProject(oProject, oChanges) {
  const oPayload = {};
  const sName = oChanges.sName !== undefined ? String(oChanges.sName).trim() : oProject.sName;
  const sKey = oChanges.sKey !== undefined ? normaliseProjectKey(oChanges.sKey) : oProject.sKey;
  const sDescription = oChanges.sDescription !== undefined ? String(oChanges.sDescription).trim() : oProject.sDescription;
  const { bValid, oErrors } = validateProjectDraft({ sName, sKey, sDescription });
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (sKey !== oProject.sKey) {
    if (await projectHasIssues(oProject.sId)) throw createDomainError(ERROR_CODES.projectKeyLocked, '', { sKey: 'The key is locked because issues exist.' });
    if (await isProjectKeyTaken(sKey, oProject.sId)) throw createDomainError(ERROR_CODES.projectKeyTaken, '', { sKey: 'That key is already in use.' });
    oPayload.wd_key = sKey;
  }
  if (sName !== oProject.sName) oPayload.wd_name = sName;
  if (sDescription !== oProject.sDescription) oPayload.wd_description = sDescription;
  if (oChanges.iType !== undefined && Number(oChanges.iType) !== oProject.iType) oPayload.wd_projecttype = Number(oChanges.iType);
  if (oChanges.sLeadId !== undefined && oChanges.sLeadId !== oProject.sLeadId) {
    Object.assign(oPayload, await bindLookup(TABLES.projects, 'wd_lead', TABLES.users, oChanges.sLeadId));
  }
  if (Object.keys(oPayload).length) await updateItem(TABLES.projects.set, TABLES.projects.key, oProject.sId, oPayload);
  invalidateCache('project');
  return getProject(oProject.sId);
}

export async function setProjectArchived(oProject, bArchived) {
  await updateItem(TABLES.projects.set, TABLES.projects.key, oProject.sId, { wd_state: bArchived ? PROJECT_STATE.archived : PROJECT_STATE.active });
  invalidateCache('project');
  return getProject(oProject.sId);
}

// Counts every status in the project's workflow (or the statuses passed in).
export async function getStatusCounts(sProjectId, aStatuses = null) {
  const aValues = aStatuses || (await getWorkflow(sProjectId)).aStatuses;
  const aCounts = await Promise.all(aValues.map(async (iStatus) => {
    const { iCount } = await queryPage(TABLES.issues, {
      sFilter: buildIssueFilter({ sProjectId, aStatuses: [iStatus] }), aSelect: ['wd_issueid'], iPageSize: 1, bCount: true,
    });
    return [iStatus, iCount || 0];
  }));
  return Object.fromEntries(aCounts);
}

// ── Membership ─────────────────────────────────────────────────

export async function listMembers(sProjectId) {
  return cached(`members:${sProjectId}`, async () => {
    const { aRows } = await queryPage(TABLES.projectMembers, {
      sFilter: `_wd_project_value eq ${assertGuid(sProjectId)} and wd_membershipstate eq ${MEMBER_STATE.active}`,
      aSelect: MEMBER_SELECT, aOrderBy: ['wd_joinedon asc'], iPageSize: PAGING.members,
    });
    return aRows.map(mapMember);
  });
}

export async function getMyMembership(sProjectId) {
  const [oUser, aMembers] = await Promise.all([getCurrentUser(), listMembers(sProjectId)]);
  return aMembers.find((oMember) => oMember.sUserId === oUser.sId) || null;
}

export async function listMyMemberships() {
  return cached('members:mine', async () => {
    const oUser = await getCurrentUser();
    const { aRows } = await queryPage(TABLES.projectMembers, {
      sFilter: `_wd_user_value eq ${assertGuid(oUser.sId)} and wd_membershipstate eq ${MEMBER_STATE.active}`,
      aSelect: MEMBER_SELECT, iPageSize: PAGING.members,
    });
    return aRows.map(mapMember);
  });
}

function assertLeadRemains(aMembers, oMember, iNewRole) {
  const aLeads = aMembers.filter((oItem) => oItem.iRole === LEAD_ROLE && oItem.bActive);
  if (oMember.iRole === LEAD_ROLE && iNewRole !== LEAD_ROLE && aLeads.length <= 1) {
    throw createDomainError(ERROR_CODES.validation, 'A project needs at least one lead. Make someone else a lead first.');
  }
}

export async function addMember(oProject, oUser, iRole) {
  if (!oUser || !isGuid(oUser.sId || '')) throw createDomainError(ERROR_CODES.userNotProvisioned);
  const { aRows } = await queryPage(TABLES.projectMembers, {
    sFilter: `_wd_project_value eq ${assertGuid(oProject.sId)} and _wd_user_value eq ${assertGuid(oUser.sId)}`,
    aSelect: MEMBER_SELECT, iTop: 1,
  });
  const oFields = { wd_projectrole: Number(iRole), wd_membershipstate: MEMBER_STATE.active, wd_joinedon: nowIso(), wd_removedon: null };
  if (aRows.length) {
    await updateItem(TABLES.projectMembers.set, TABLES.projectMembers.key, aRows[0].wd_projectmemberid, oFields);
  } else {
    await createItem(TABLES.projectMembers.set, TABLES.projectMembers.key, {
      wd_projectmemberid: newId(),
      wd_name: truncateText(`${oProject.sKey} · ${oUser.sName}`, 200),
      ...oFields,
      ...(await bindLookup(TABLES.projectMembers, 'wd_project', TABLES.projects, oProject.sId)),
      ...(await bindLookup(TABLES.projectMembers, 'wd_user', TABLES.users, oUser.sId)),
    });
  }
  invalidateCache('members');
}

// Mirrors the "Member · After update" plug-in: nobody edits their own membership, so a lead always remains.
async function assertNotSelf(oMember) {
  const oUser = await getCurrentUser();
  if (oMember.sUserId === oUser.sId) throw createDomainError(ERROR_CODES.permissionDenied, 'You can\'t change your own membership. Ask another project lead.');
}

export async function updateMemberRole(oProject, oMember, iRole) {
  await assertNotSelf(oMember);
  assertLeadRemains(await listMembers(oProject.sId), oMember, Number(iRole));
  await updateItem(TABLES.projectMembers.set, TABLES.projectMembers.key, oMember.sId, { wd_projectrole: Number(iRole) });
  invalidateCache('members');
}

export async function removeMember(oProject, oMember) {
  await assertNotSelf(oMember);
  assertLeadRemains(await listMembers(oProject.sId), oMember, -1);
  await updateItem(TABLES.projectMembers.set, TABLES.projectMembers.key, oMember.sId, {
    wd_membershipstate: MEMBER_STATE.removed, wd_removedon: nowIso(),
  });
  invalidateCache('members');
}

// ── Board ──────────────────────────────────────────────────────

async function listColumns(sBoardId) {
  const { aRows } = await queryPage(TABLES.boardColumns, {
    sFilter: `_wd_board_value eq ${assertGuid(sBoardId)}`, aSelect: COLUMN_SELECT, aOrderBy: ['wd_order asc'], iPageSize: 50,
  });
  return aRows.map(mapColumn);
}

async function createDefaultColumns(sBoardId, oWorkflow = DEFAULT_WORKFLOW) {
  const oBoardBinding = await bindLookup(TABLES.boardColumns, 'wd_board', TABLES.boards, sBoardId);
  await Promise.all(oWorkflow.aStatuses.map((iStatus, iIndex) => createItem(TABLES.boardColumns.set, TABLES.boardColumns.key, {
    wd_boardcolumnid: newId(), wd_name: getIssueStatus(iStatus).label, wd_order: iIndex, wd_status: iStatus, wd_wiplimit: 0, ...oBoardBinding,
  })));
  return listColumns(sBoardId);
}

// Every workflow status gets a column; columns for statuses the workflow no longer uses are kept but hidden.
// bAlign also puts the columns in workflow order (used when the workflow is saved).
async function syncWorkflowColumns(sBoardId, aColumns, oWorkflow, bAlign = false) {
  const aMissing = oWorkflow.aStatuses.filter((iStatus) => !aColumns.some((oColumn) => oColumn.iStatus === iStatus));
  const iMaxOrder = aColumns.reduce((iMax, oColumn) => Math.max(iMax, oColumn.iOrder), -1);
  const oBoardBinding = aMissing.length ? await bindLookup(TABLES.boardColumns, 'wd_board', TABLES.boards, sBoardId) : {};
  const fnOrder = (iStatus, iFallback) => (bAlign ? oWorkflow.aStatuses.indexOf(iStatus) : iFallback);
  await runInBatches(aMissing, (iStatus) => createItem(TABLES.boardColumns.set, TABLES.boardColumns.key, {
    wd_boardcolumnid: newId(), wd_name: getIssueStatus(iStatus).label, wd_order: fnOrder(iStatus, iMaxOrder + 1 + aMissing.indexOf(iStatus)), wd_status: iStatus, wd_wiplimit: 0, ...oBoardBinding,
  }));
  if (bAlign) {
    const aReorder = aColumns.filter((oColumn) => oWorkflow.aStatuses.includes(oColumn.iStatus) && oColumn.iOrder !== oWorkflow.aStatuses.indexOf(oColumn.iStatus));
    await runInBatches(aReorder, (oColumn) => updateItem(TABLES.boardColumns.set, TABLES.boardColumns.key, oColumn.sId, { wd_order: oWorkflow.aStatuses.indexOf(oColumn.iStatus) }));
  }
  return aMissing.length || bAlign ? listColumns(sBoardId) : aColumns;
}

export async function getBoard(oProject, sBoardId = '') {
  const aBoards = await listBoards(oProject);
  const oBoard = sBoardId ? aBoards.find((oItem) => oItem.sId === sBoardId) : aBoards.find((oItem) => oItem.bDefault);
  if (!oBoard) throw createDomainError(ERROR_CODES.boardNotFound);
  return cached(`board:${oProject.sId}:${oBoard.sId}`, async () => {
    const [aExisting, oWorkflow] = await Promise.all([listColumns(oBoard.sId), getWorkflow(oProject.sId)]);
    const aColumns = aExisting.length ? await syncWorkflowColumns(oBoard.sId, aExisting, oWorkflow) : await createDefaultColumns(oBoard.sId, oWorkflow);
    return { ...oBoard, aColumns: aColumns.filter((oColumn) => oWorkflow.aStatuses.includes(oColumn.iStatus)) };
  });
}

async function ensureDefaultBoard(oProject) {
  const { aRows } = await queryPage(TABLES.boards, {
    sFilter: `_wd_project_value eq ${assertGuid(oProject.sId)} and wd_isdefault eq true`, aSelect: BOARD_SELECT, iTop: 1,
  });
  if (aRows.length) return mapBoard(aRows[0]);
  const sBoardId = newId();
  const sName = `${oProject.sKey} board`;
  await createItem(TABLES.boards.set, TABLES.boards.key, {
    wd_boardid: sBoardId, wd_name: sName, wd_boardtype: BOARD_TYPE.kanban, wd_isdefault: true, wd_active: true,
    ...(await bindLookup(TABLES.boards, 'wd_project', TABLES.projects, oProject.sId)),
  });
  return { sId: sBoardId, sName, sProjectId: oProject.sId, iType: BOARD_TYPE.kanban, bDefault: true, bActive: true };
}

// The default board always comes first and shows every project issue; extra boards show only issues added to them.
export async function listBoards(oProject) {
  return cached(`boards:${oProject.sId}`, async () => {
    const [oDefault, { aRows }] = await Promise.all([
      ensureDefaultBoard(oProject),
      queryPage(TABLES.boards, {
        sFilter: `_wd_project_value eq ${assertGuid(oProject.sId)} and (wd_isdefault eq false or wd_isdefault eq null) and (wd_active eq true or wd_active eq null)`,
        aSelect: BOARD_SELECT, aOrderBy: ['wd_name asc'], iPageSize: PAGING.boards,
      }),
    ]);
    return [oDefault, ...aRows.map(mapBoard)];
  });
}

function validateBoardDraft(oDraft) {
  const sName = String(oDraft.sName || '').trim();
  if (!sName || sName.length > LIMITS.boardNameMax) throw createDomainError(ERROR_CODES.validation, '', { sName: `Board names must be 1–${LIMITS.boardNameMax} characters.` });
  if (oDraft.iType !== undefined && !BOARD_TYPES.some((oType) => oType.value === Number(oDraft.iType))) throw createDomainError(ERROR_CODES.validation, '', { iType: 'Choose a board type.' });
  return sName;
}

export async function createBoard(oProject, oDraft) {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const sName = validateBoardDraft(oDraft);
  const sBoardId = newId();
  await createItem(TABLES.boards.set, TABLES.boards.key, {
    wd_boardid: sBoardId, wd_name: sName, wd_boardtype: Number(oDraft.iType) || BOARD_TYPE.kanban, wd_isdefault: false, wd_active: true,
    ...(await bindLookup(TABLES.boards, 'wd_project', TABLES.projects, oProject.sId)),
  });
  await createDefaultColumns(sBoardId, await getWorkflow(oProject.sId));
  invalidateCache(`boards:${oProject.sId}`);
  return getBoard(oProject, sBoardId);
}

export async function updateBoard(oProject, oBoard, oChanges) {
  const sName = validateBoardDraft({ sName: oChanges.sName !== undefined ? oChanges.sName : oBoard.sName, iType: oChanges.iType });
  const oPayload = {};
  if (sName !== oBoard.sName) oPayload.wd_name = sName;
  if (oChanges.iType !== undefined && Number(oChanges.iType) !== oBoard.iType) oPayload.wd_boardtype = Number(oChanges.iType);
  if (Object.keys(oPayload).length) await updateItem(TABLES.boards.set, TABLES.boards.key, oBoard.sId, oPayload);
  invalidateCache(`boards:${oProject.sId}`);
  invalidateCache(`board:${oProject.sId}`);
}

// Archiving keeps the board's issue links so it can be restored; the default board and boards with an active sprint stay.
export async function archiveBoard(oProject, oBoard) {
  if (oBoard.bDefault) throw createDomainError(ERROR_CODES.validation, 'The default board can\'t be archived.');
  const iActive = await countRows(TABLES.sprints, `_wd_board_value eq ${assertGuid(oBoard.sId)} and wd_sprintstate eq ${SPRINT_STATE.active}`, 'wd_sprintid');
  if (iActive) throw createDomainError(ERROR_CODES.validation, 'Complete this board\'s active sprint before archiving it.');
  await updateItem(TABLES.boards.set, TABLES.boards.key, oBoard.sId, { wd_active: false });
  invalidateCache(`boards:${oProject.sId}`);
  invalidateCache(`board:${oProject.sId}`);
}

export async function listIssueBoardIds(sIssueId) {
  const { aRows } = await queryPage(TABLES.boardIssues, {
    sFilter: `_wd_issue_value eq ${assertGuid(sIssueId, 'issue')}`, aSelect: ['wd_boardissueid', '_wd_board_value'], iPageSize: PAGING.boards,
  });
  return aRows.map((oRow) => oRow._wd_board_value);
}

// Adds/removes Board Issue rows so the issue sits on exactly aBoardIds (extra boards of its own project only).
export async function setIssueBoards(oIssue, aBoardIds) {
  const oProject = await getProject(oIssue.sProjectId);
  const aBoards = await listBoards(oProject);
  const aWanted = [...new Set(aBoardIds)];
  if (aWanted.some((sId) => !aBoards.some((oBoard) => oBoard.sId === sId && !oBoard.bDefault))) throw createDomainError(ERROR_CODES.boardNotFound);
  const { aRows } = await queryPage(TABLES.boardIssues, {
    sFilter: `_wd_issue_value eq ${assertGuid(oIssue.sId, 'issue')}`, aSelect: ['wd_boardissueid', '_wd_board_value'], iPageSize: PAGING.boards,
  });
  const aToAdd = aWanted.filter((sId) => !aRows.some((oRow) => oRow._wd_board_value === sId));
  const aToRemove = aRows.filter((oRow) => !aWanted.includes(oRow._wd_board_value));
  const oIssueBinding = aToAdd.length ? await bindLookup(TABLES.boardIssues, 'wd_issue', TABLES.issues, oIssue.sId) : {};
  await Promise.all([
    ...aToAdd.map(async (sBoardId) => createItem(TABLES.boardIssues.set, TABLES.boardIssues.key, {
      wd_boardissueid: newId(), wd_name: truncateText(`${oIssue.sKey} · ${aBoards.find((oBoard) => oBoard.sId === sBoardId).sName}`, 100), ...oIssueBinding,
      ...(await bindLookup(TABLES.boardIssues, 'wd_board', TABLES.boards, sBoardId)),
    })),
    ...aToRemove.map((oRow) => deleteItem(TABLES.boardIssues.set, TABLES.boardIssues.key, oRow.wd_boardissueid)),
  ]);
  return aWanted;
}

export async function updateBoardColumn(oProject, oColumn, oChanges) {
  const oPayload = {};
  if (oChanges.sName !== undefined) {
    const sName = String(oChanges.sName).trim();
    if (!sName || sName.length > 100) throw createDomainError(ERROR_CODES.validation, 'Column names must be 1–100 characters.');
    oPayload.wd_name = sName;
  }
  if (oChanges.iWipLimit !== undefined) {
    const iLimit = Number(oChanges.iWipLimit);
    if (!Number.isInteger(iLimit) || iLimit < 0 || iLimit > 1000) throw createDomainError(ERROR_CODES.validation, 'WIP limit must be 0–1000 (0 = no limit).');
    oPayload.wd_wiplimit = iLimit;
  }
  if (oChanges.iOrder !== undefined) oPayload.wd_order = Number(oChanges.iOrder);
  if (Object.keys(oPayload).length) await updateItem(TABLES.boardColumns.set, TABLES.boardColumns.key, oColumn.sId, oPayload);
  invalidateCache(`board:${oProject.sId}`);
}

// ── Workflow (Phase 3) ─────────────────────────────────────────
// Statuses, initial status and transitions per project. Plug-in 3 re-validates every status change server-side.

async function listTransitionRows(sProjectId) {
  const aRows = await queryAll(TABLES.workflowTransitions, {
    sFilter: `_wd_project_value eq ${assertGuid(sProjectId, 'project')}`, aSelect: TRANSITION_SELECT, iPageSize: PAGING.workflowTransitions,
  });
  return aRows.map(mapTransitionRow);
}

export async function getWorkflow(sProjectId) {
  return cached(`workflow:${sProjectId}`, async () => {
    const oProject = await getProject(sProjectId);
    if (!oProject.sWorkflowStatuses) return DEFAULT_WORKFLOW;
    return workflowFromRecords(oProject.sWorkflowStatuses, oProject.iInitialStatus, await listTransitionRows(sProjectId));
  });
}

const requirementColumns = (aRequired) => Object.fromEntries(TRANSITION_REQUIREMENTS.map((oItem) => [oItem.column, aRequired.includes(oItem.key)]));

async function assertLead(sProjectId, sMessage) {
  if (!getProjectPermissions(await getMyMembership(sProjectId)).bCanManage) throw createDomainError(ERROR_CODES.permissionDenied, sMessage);
}

// Not one transaction: transitions are written first and the project's status list last, so the plug-in only switches
// to the new rules once they exist. Saving again finishes a partly failed save.
export async function saveWorkflow(oProject, oWorkflow, sTemplateKey = undefined) {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const oNext = {
    bCustom: true,
    aStatuses: (oWorkflow.aStatuses || []).map(Number),
    iInitialStatus: Number(oWorkflow.iInitialStatus),
    aTransitions: (oWorkflow.aTransitions || []).map((oItem) => ({ iFrom: Number(oItem.iFrom), iTo: Number(oItem.iTo), aRequired: normaliseRequirements(oItem.aRequired) })),
  };
  const { bValid, oErrors } = validateWorkflow(oNext);
  if (!bValid) throw createDomainError(ERROR_CODES.invalidWorkflow, Object.values(oErrors)[0], oErrors);
  await assertLead(oProject.sId, 'Only project leads can change the workflow.');
  invalidateCache(`workflow:${oProject.sId}`);
  invalidateCache('project:');
  const oCurrent = await getWorkflow(oProject.sId);
  const aRemoved = removedStatuses(oCurrent, oNext);
  if (aRemoved.length) {
    const iInUse = await countRows(TABLES.issues, `_wd_project_value eq ${assertGuid(oProject.sId)} and (wd_archived eq false or wd_archived eq null) and (${aRemoved.map((iStatus) => `wd_status eq ${iStatus}`).join(' or ')})`, 'wd_issueid');
    if (iInUse) {
      const sStatuses = aRemoved.map((iStatus) => getIssueStatus(iStatus).label).join(', ');
      throw createDomainError(ERROR_CODES.statusInUse, `${iInUse} issue${iInUse === 1 ? ' still uses' : 's still use'} ${sStatuses}. Move them to another status before removing it.`, { aStatuses: sStatuses });
    }
  }
  const { aCreate, aUpdate, aDeactivate } = diffWorkflowTransitions(await listTransitionRows(oProject.sId), oNext.aTransitions);
  const oProjectBinding = aCreate.length ? await bindLookup(TABLES.workflowTransitions, 'wd_project', TABLES.projects, oProject.sId) : {};
  await runInBatches(aCreate, (oItem) => createItem(TABLES.workflowTransitions.set, TABLES.workflowTransitions.key, {
    wd_workflowtransitionid: newId(),
    wd_name: truncateText(`${oProject.sKey} ${getIssueStatus(oItem.iFrom).label} → ${getIssueStatus(oItem.iTo).label}`, 100),
    wd_fromstatus: oItem.iFrom, wd_tostatus: oItem.iTo, wd_active: true, ...requirementColumns(oItem.aRequired), ...oProjectBinding,
  }));
  await runInBatches(aUpdate, (oRow) => updateItem(TABLES.workflowTransitions.set, TABLES.workflowTransitions.key, oRow.sId, { wd_active: true, ...requirementColumns(oRow.aRequired) }));
  await runInBatches(aDeactivate, (oRow) => updateItem(TABLES.workflowTransitions.set, TABLES.workflowTransitions.key, oRow.sId, { wd_active: false }));
  await updateItem(TABLES.projects.set, TABLES.projects.key, oProject.sId, {
    wd_workflowstatuses: serialiseStatusList(oNext.aStatuses), wd_initialstatus: oNext.iInitialStatus,
    ...(sTemplateKey !== undefined ? { wd_workflowtemplate: sTemplateKey } : {}),
  });
  invalidateCache('project');
  invalidateCache(`workflow:${oProject.sId}`);
  const oSavedWorkflow = await getWorkflow(oProject.sId);
  // Columns follow the workflow order on every board; hidden columns keep their WIP limits in case a status returns.
  const aBoards = await listBoards(oProject);
  await Promise.all(aBoards.map(async (oBoard) => syncWorkflowColumns(oBoard.sId, await listColumns(oBoard.sId), oSavedWorkflow, true)));
  invalidateCache(`board:${oProject.sId}`);
  return { oProject: await getProject(oProject.sId), oWorkflow: oSavedWorkflow };
}

// Applies a built-in template: its workflow plus any of its custom fields the project doesn't have yet.
export async function applyProjectTemplate(oProject, sTemplateKey) {
  const oTemplate = getProjectTemplate(sTemplateKey);
  if (!oTemplate) throw createDomainError(ERROR_CODES.validation, 'Choose a template.');
  const oResult = await saveWorkflow(oProject, buildTemplateWorkflow(oTemplate), oTemplate.key);
  const aExisting = await listCustomFields(oProject.sId, true);
  const aMissing = oTemplate.aCustomFields.filter((oField) => !aExisting.some((oItem) => oItem.sName.toLowerCase() === oField.sName.toLowerCase()));
  for (const oField of aMissing) await createCustomField(oResult.oProject, { ...oField, aIssueTypes: [...oField.aIssueTypes] });
  return { ...oResult, iFieldsAdded: aMissing.length };
}

// ── Labels ─────────────────────────────────────────────────────

export async function listProjectLabels(sProjectId) {
  return cached(`labels:${sProjectId}`, async () => {
    const { aRows } = await queryPage(TABLES.labels, {
      sFilter: `_wd_project_value eq ${assertGuid(sProjectId)}`, aSelect: ['wd_labelid', 'wd_name'], aOrderBy: ['wd_name asc'], iPageSize: PAGING.labels,
    });
    return aRows.map((oRow) => ({ sId: oRow.wd_labelid, sName: oRow.wd_name || '' }));
  });
}

async function attachLabels(aIssues) {
  if (!aIssues.length) return aIssues;
  const oByIssue = new Map(aIssues.map((oIssue) => [oIssue.sId, oIssue]));
  const aIds = [...oByIssue.keys()];
  const aChunks = [];
  for (let iIndex = 0; iIndex < aIds.length; iIndex += 20) aChunks.push(aIds.slice(iIndex, iIndex + 20));
  const aResults = await Promise.all(aChunks.map((aChunk) => queryPage(TABLES.issueLabels, {
    sFilter: `(${aChunk.map((sId) => `_wd_issue_value eq ${assertGuid(sId)}`).join(' or ')})`,
    aSelect: ['wd_issuelabelid', '_wd_issue_value', '_wd_label_value'], iPageSize: 500,
  })));
  aResults.flatMap((oResult) => oResult.aRows).forEach((oRow) => {
    const oIssue = oByIssue.get(oRow._wd_issue_value);
    if (oIssue) oIssue.aLabels.push({ sId: oRow._wd_label_value, sName: formattedValue(oRow, '_wd_label_value') });
  });
  aIssues.forEach((oIssue) => oIssue.aLabels.sort((oA, oB) => oA.sName.localeCompare(oB.sName)));
  return aIssues;
}

async function setIssueLabels(oIssue, aNames) {
  const aWanted = normaliseLabels(aNames);
  const aProjectLabels = [...(await listProjectLabels(oIssue.sProjectId))];
  const aMissing = aWanted.filter((sName) => !aProjectLabels.some((oLabel) => oLabel.sName === sName));
  if (aMissing.length) {
    const oProjectBinding = await bindLookup(TABLES.labels, 'wd_project', TABLES.projects, oIssue.sProjectId);
    const aCreated = await Promise.all(aMissing.map(async (sName) => {
      const sId = newId();
      await createItem(TABLES.labels.set, TABLES.labels.key, { wd_labelid: sId, wd_name: sName, ...oProjectBinding });
      return { sId, sName };
    }));
    aProjectLabels.push(...aCreated);
    invalidateCache(`labels:${oIssue.sProjectId}`);
  }
  const { aRows } = await queryPage(TABLES.issueLabels, {
    sFilter: `_wd_issue_value eq ${assertGuid(oIssue.sId)}`, aSelect: ['wd_issuelabelid', '_wd_label_value'], iPageSize: 100,
  });
  const aWantedLabels = aWanted.map((sName) => aProjectLabels.find((oLabel) => oLabel.sName === sName));
  const aToAdd = aWantedLabels.filter((oLabel) => !aRows.some((oRow) => oRow._wd_label_value === oLabel.sId));
  const aToRemove = aRows.filter((oRow) => !aWantedLabels.some((oLabel) => oLabel.sId === oRow._wd_label_value));
  const oIssueBinding = aToAdd.length ? await bindLookup(TABLES.issueLabels, 'wd_issue', TABLES.issues, oIssue.sId) : {};
  await Promise.all([
    ...aToAdd.map(async (oLabel) => createItem(TABLES.issueLabels.set, TABLES.issueLabels.key, {
      wd_issuelabelid: newId(), wd_name: truncateText(`${oIssue.sKey} · ${oLabel.sName}`, 100), ...oIssueBinding,
      ...(await bindLookup(TABLES.issueLabels, 'wd_label', TABLES.labels, oLabel.sId)),
    })),
    ...aToRemove.map((oRow) => deleteItem(TABLES.issueLabels.set, TABLES.issueLabels.key, oRow.wd_issuelabelid)),
  ]);
  return aWantedLabels.sort((oA, oB) => oA.sName.localeCompare(oB.sName));
}

// ── History ────────────────────────────────────────────────────

async function writeHistory(oIssue, aEntries, sOperation) {
  if (!aEntries.length) return true;
  const sCorrelationId = newId();
  try {
    const oIssueBinding = await bindLookup(TABLES.history, 'wd_issue', TABLES.issues, oIssue.sId);
    await Promise.all(aEntries.map((oEntry) => createItem(TABLES.history.set, TABLES.history.key, {
      wd_issuehistoryid: newId(),
      wd_name: truncateText(`${oIssue.sKey} ${oEntry.sField || sOperation}`, 100),
      wd_eventtype: oEntry.iEvent,
      wd_fieldname: oEntry.sField || '',
      wd_oldvalue: truncateText(oEntry.sOldValue || ''),
      wd_newvalue: truncateText(oEntry.sNewValue || ''),
      wd_correlationid: sCorrelationId,
      wd_operationname: sOperation,
      ...oIssueBinding,
    })));
    return true;
  } catch (oError) {
    console.warn('Pira: history could not be recorded', oError);
    return false;
  }
}

export async function listHistory(sIssueId, sSkipToken = '') {
  const { aRows, sNextToken } = await queryPage(TABLES.history, {
    sFilter: `_wd_issue_value eq ${assertGuid(sIssueId)}`, aSelect: HISTORY_SELECT, aOrderBy: ['createdon desc'],
    iPageSize: PAGING.history, sSkipToken,
  });
  return { aEntries: aRows.map(mapHistory), sNextToken };
}

// ── Issues ─────────────────────────────────────────────────────

// Navigation names and context the OData builder needs for this criteria (labels, boards, custom-field and "me" rules).
async function criteriaContext(oCriteria) {
  const { bLabels, bCustomFields } = queryUsesFields(oCriteria.oQuery);
  if (oCriteria.oQuery) assertFeature('advancedQuery');
  if (bCustomFields && !oCriteria.sProjectId) throw createDomainError(ERROR_CODES.invalidQuery, 'Custom field conditions only work inside a project.');
  const [sLabelCollection, sBoardCollection, sCustomValueCollection, aCustomFields, oUser] = await Promise.all([
    oCriteria.sLabelId || bLabels ? resolveNavigation(TABLES.issueLabels, 'wd_issue', true) : '',
    oCriteria.sBoardId ? resolveNavigation(TABLES.boardIssues, 'wd_issue', true) : '',
    bCustomFields ? resolveNavigation(TABLES.customFieldValues, 'wd_issue', true) : '',
    bCustomFields ? listCustomFields(oCriteria.sProjectId, true) : [],
    oCriteria.oQuery ? getCurrentUser() : null,
  ]);
  return { sLabelCollection, sBoardCollection, sCustomValueCollection, aCustomFields, sUserId: oUser ? oUser.sId : '', oNow: new Date() };
}

export async function listIssues({ oCriteria, aOrderBy = ['wd_rank asc', 'createdon asc'], iPageSize = PAGING.issueList, sSkipToken = '', bCount = false, bWithLabels = false }) {
  const { aRows, sNextToken, iCount } = await queryPage(TABLES.issues, {
    sFilter: buildIssueFilter(oCriteria, await criteriaContext(oCriteria)), aSelect: ISSUE_SELECT, aOrderBy, iPageSize, sSkipToken, bCount,
  });
  const aIssues = aRows.map(mapIssue);
  if (bWithLabels) await attachLabels(aIssues);
  return { aIssues, sNextToken, iCount };
}

export async function getIssue(sIssueId) {
  const oRow = await getItem(TABLES.issues.set, TABLES.issues.key, assertGuid(sIssueId, 'issue'), ISSUE_DETAIL_SELECT);
  if (!oRow) throw createDomainError(ERROR_CODES.issueNotFound);
  const [oIssue] = await attachLabels([mapIssue(oRow)]);
  return oIssue;
}

export async function getIssueByKey(sKey) {
  const { aRows } = await queryPage(TABLES.issues, {
    sFilter: `wd_issuekey eq '${escapeODataString(String(sKey).trim().toUpperCase())}'`, aSelect: ISSUE_DETAIL_SELECT, iTop: 1,
  });
  if (!aRows.length) throw createDomainError(ERROR_CODES.issueNotFound);
  const [oIssue] = await attachLabels([mapIssue(aRows[0])]);
  return oIssue;
}

export async function searchIssues(sText, sProjectId = '') {
  return listIssues({
    oCriteria: { sText, sProjectId: sProjectId || undefined }, aOrderBy: ['modifiedon desc'], iPageSize: PAGING.searchSuggestions,
  });
}

export async function listMyWork(sTab, sSkipToken = '') {
  const oUser = await getCurrentUser();
  const { oCriteria, aOrderBy } = buildMyWorkCriteria(sTab, oUser.sId, new Date(), RECENTLY_UPDATED_DAYS);
  return listIssues({ oCriteria, aOrderBy, iPageSize: PAGING.myWork, sSkipToken, bCount: !sSkipToken });
}

async function ensureSequence(oProject) {
  const { aRows } = await queryPage(TABLES.projectSequences, {
    sFilter: `_wd_project_value eq ${assertGuid(oProject.sId)}`, aSelect: ['wd_projectsequenceid', 'wd_nextnumber'], iTop: 1,
  });
  if (aRows.length) return { sId: aRows[0].wd_projectsequenceid, iNextNumber: Math.max(1, Number(aRows[0].wd_nextnumber) || 1) };
  const sId = newId();
  await createItem(TABLES.projectSequences.set, TABLES.projectSequences.key, {
    wd_projectsequenceid: sId, wd_name: oProject.sKey, wd_nextnumber: 1,
    ...(await bindLookup(TABLES.projectSequences, 'wd_project', TABLES.projects, oProject.sId)),
  });
  return { sId, iNextNumber: 1 };
}

async function issueKeyExists(sKey) {
  const { aRows } = await queryPage(TABLES.issues, { sFilter: `wd_issuekey eq '${escapeODataString(sKey)}'`, aSelect: ['wd_issueid'], iTop: 1 });
  return aRows.length > 0;
}

// Client-side allocation (SERVER_LOGIC = 'client' only): read-increment the sequence row, skip numbers already used.
// The issue-key alternate key is the final uniqueness guard. In 'lowcode' mode the "Issue · Before create" plug-in does this.
async function allocateIssueKey(oProject) {
  for (let iAttempt = 0; iAttempt < KEY_ALLOCATION_RETRIES * 3; iAttempt += 1) {
    const oSequence = await ensureSequence(oProject);
    const iNumber = oSequence.iNextNumber;
    await updateItem(TABLES.projectSequences.set, TABLES.projectSequences.key, oSequence.sId, { wd_nextnumber: iNumber + 1 });
    const sKey = formatIssueKey(oProject.sKey, iNumber);
    if (!(await issueKeyExists(sKey))) return { sKey, iNumber };
  }
  throw createDomainError(ERROR_CODES.issueKeyConflict);
}

// ── Ranking (one global rank per project, like Jira: backlog, sprints and every board share the same order) ──

async function nextRankForProject(sProjectId) {
  const { aRows } = await queryPage(TABLES.issues, {
    sFilter: `_wd_project_value eq ${assertGuid(sProjectId)} and wd_rank ne null`,
    aSelect: ['wd_rank'], aOrderBy: ['wd_rank desc'], iTop: 1,
  });
  return rankBetween(aRows.length ? aRows[0].wd_rank : '', '');
}

async function readRank(sIssueId) {
  if (!sIssueId) return '';
  const oRow = await getItem(TABLES.issues.set, TABLES.issues.key, assertGuid(sIssueId, 'issue'), ['wd_rank']);
  return (oRow && isValidRank(oRow.wd_rank || '')) ? oRow.wd_rank : '';
}

async function adjacentRank(sProjectId, sRank, bAfter) {
  const { aRows } = await queryPage(TABLES.issues, {
    sFilter: `_wd_project_value eq ${assertGuid(sProjectId)} and wd_rank ${bAfter ? 'gt' : 'lt'} '${escapeODataString(sRank)}'`,
    aSelect: ['wd_rank'], aOrderBy: [`wd_rank ${bAfter ? 'asc' : 'desc'}`], iTop: 1,
  });
  return aRows.length && isValidRank(aRows[0].wd_rank || '') ? aRows[0].wd_rank : '';
}

// Ranks from the neighbours' current server values, so a stale list (someone else reordered) can't produce
// out-of-order ranks. If the neighbours have moved apart, "just after the issue above" wins.
async function computePlacementRank(sProjectId, oPlacement = {}) {
  const [sBefore, sAfter] = await Promise.all([readRank(oPlacement.sBeforeId), readRank(oPlacement.sAfterId)]);
  if (isRankOrdered(sBefore, sAfter)) return rankBetween(sBefore, sAfter);
  if (sBefore) return rankBetween(sBefore, await adjacentRank(sProjectId, sBefore, true));
  if (sAfter) return rankBetween(await adjacentRank(sProjectId, sAfter, false), sAfter);
  return nextRankForProject(sProjectId);
}

async function getAncestorIds(sIssueId) {
  const aIds = [];
  let sCurrent = sIssueId;
  for (let iDepth = 0; sCurrent && iDepth < 20; iDepth += 1) {
    const oRow = await getItem(TABLES.issues.set, TABLES.issues.key, sCurrent, ['_wd_parentissue_value']);
    sCurrent = (oRow && oRow._wd_parentissue_value) || '';
    if (sCurrent) aIds.push(sCurrent);
  }
  return aIds;
}

async function loadValidParent(oChild, sParentId) {
  if (!sParentId) return null;
  const oParent = await getIssue(sParentId);
  const aAncestors = oChild.sId ? await getAncestorIds(oParent.sId) : [];
  const sError = validateParent(oChild, oParent, aAncestors);
  if (sError) throw createDomainError(sError);
  return oParent;
}

async function listChildTypes(sIssueId) {
  const { aRows } = await queryPage(TABLES.issues, {
    sFilter: `_wd_parentissue_value eq ${assertGuid(sIssueId)} and (wd_archived eq false or wd_archived eq null)`,
    aSelect: ['wd_issuetype'], iPageSize: PAGING.children,
  });
  return aRows.map((oRow) => Number(oRow.wd_issuetype));
}

export async function listChildIssues(sIssueId, sSkipToken = '') {
  return listIssues({ oCriteria: { sParentId: sIssueId }, iPageSize: PAGING.children, sSkipToken, bCount: !sSkipToken });
}

// Lookup for the parent picker: same project, only types allowed above the child, newest activity first.
export async function searchParentCandidates(oChild, sText) {
  const aTypes = getAllowedParentTypes(oChild.iType);
  if (!aTypes.length) return [];
  const { aIssues } = await listIssues({
    oCriteria: { sProjectId: oChild.sProjectId, sText, aTypes }, aOrderBy: ['modifiedon desc'], iPageSize: PAGING.parentSearch,
  });
  return aIssues.filter((oIssue) => oIssue.sId !== oChild.sId);
}

// ── Sprints ────────────────────────────────────────────────────

export async function listSprints(sProjectId) {
  return cached(`sprints:${sProjectId}`, async () => {
    const aRows = await queryAll(TABLES.sprints, {
      sFilter: `_wd_project_value eq ${assertGuid(sProjectId)}`, aSelect: SPRINT_SELECT, aOrderBy: ['createdon asc'], iPageSize: PAGING.sprints,
    });
    return aRows.map(mapSprint);
  });
}

async function loadSprint(sSprintId) {
  const oRow = await getItem(TABLES.sprints.set, TABLES.sprints.key, assertGuid(sSprintId, 'sprint'), SPRINT_SELECT);
  if (!oRow) throw createDomainError(ERROR_CODES.sprintNotFound);
  return mapSprint(oRow);
}

export const getSprint = (sSprintId) => loadSprint(sSprintId);

// Sprints that can receive issues: same project, Planned or Active.
async function loadOpenSprint(sSprintId, sProjectId) {
  const oSprint = await loadSprint(sSprintId);
  if (oSprint.sProjectId !== sProjectId) throw createDomainError(ERROR_CODES.sprintProjectMismatch);
  if (!isSprintOpen(oSprint.iState)) throw createDomainError(ERROR_CODES.sprintLocked);
  return oSprint;
}

async function assertNoOtherActiveSprint(oSprint) {
  if (!oSprint.sBoardId) return;
  const { aRows } = await queryPage(TABLES.sprints, {
    sFilter: `_wd_board_value eq ${assertGuid(oSprint.sBoardId)} and wd_sprintstate eq ${SPRINT_STATE.active} and wd_sprintid ne ${assertGuid(oSprint.sId)}`,
    aSelect: ['wd_sprintid'], iTop: 1,
  });
  if (aRows.length) throw createDomainError(ERROR_CODES.sprintActiveExists);
}

async function listSprintIssueRows(sSprintId) {
  const aRows = await queryAll(TABLES.issues, {
    sFilter: `_wd_sprint_value eq ${assertGuid(sSprintId)}`, aSelect: METRIC_SELECT, iPageSize: PAGING.sprintMetrics,
  });
  return aRows.map(mapIssue);
}

function sprintPayload(oDraft) {
  return {
    wd_name: String(oDraft.sName).trim(),
    wd_goal: String(oDraft.sGoal || '').trim(),
    wd_startdate: oDraft.sStartDate || null,
    wd_enddate: oDraft.sEndDate || null,
  };
}

export async function createSprint(oProject, oBoard, oDraft) {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const { bValid, oErrors } = validateSprintDraft(oDraft);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (!oBoard || oBoard.sProjectId !== oProject.sId) throw createDomainError(ERROR_CODES.boardNotFound);
  const sSprintId = newId();
  await createItem(TABLES.sprints.set, TABLES.sprints.key, {
    wd_sprintid: sSprintId, ...sprintPayload(oDraft), wd_sprintstate: SPRINT_STATE.planned,
    ...(await bindLookup(TABLES.sprints, 'wd_project', TABLES.projects, oProject.sId)),
    ...(await bindLookup(TABLES.sprints, 'wd_board', TABLES.boards, oBoard.sId)),
  });
  invalidateCache(`sprints:${oProject.sId}`);
  return loadSprint(sSprintId);
}

export async function updateSprint(oSprint, oChanges) {
  const oFresh = await loadSprint(oSprint.sId);
  if (isSprintLocked(oFresh.iState)) throw createDomainError(ERROR_CODES.sprintLocked);
  const oNext = { ...oFresh, ...oChanges };
  const { bValid, oErrors } = validateSprintDraft(oNext, oFresh.iState === SPRINT_STATE.active);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  await updateItem(TABLES.sprints.set, TABLES.sprints.key, oFresh.sId, sprintPayload(oNext));
  invalidateCache(`sprints:${oFresh.sProjectId}`);
  return loadSprint(oFresh.sId);
}

// Start snapshots the committed scope so the summary can report scope change later.
export async function startSprint(oSprint, oChanges = {}) {
  const oFresh = await loadSprint(oSprint.sId);
  assertSprintTransition(oFresh.iState, SPRINT_STATE.active);
  const oNext = { ...oFresh, ...oChanges };
  const { bValid, oErrors } = validateSprintDraft(oNext, true);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  await assertNoOtherActiveSprint(oFresh);
  const oMetrics = computeSprintMetrics(await listSprintIssueRows(oFresh.sId));
  await updateItem(TABLES.sprints.set, TABLES.sprints.key, oFresh.sId, {
    ...sprintPayload(oNext), wd_sprintstate: SPRINT_STATE.active, wd_startedon: nowIso(),
    wd_committedissues: oMetrics.iIssues, wd_committedpoints: oMetrics.iPoints,
  });
  invalidateCache(`sprints:${oFresh.sProjectId}`);
  return loadSprint(oFresh.sId);
}

async function moveIssuesToSprint(aIssues, oTarget, sFromName, sOperation) {
  let iHistoryFailures = 0;
  const oBinding = await bindLookup(TABLES.issues, 'wd_sprint', TABLES.sprints, oTarget ? oTarget.sId : '');
  await runInBatches(aIssues, async (oIssue) => {
    await updateItem(TABLES.issues.set, TABLES.issues.key, oIssue.sId, oBinding);
    if (!bServerPlugins) {
      const bSaved = await writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.sprintChanged, sField: 'sprint', sOldValue: sFromName, sNewValue: oTarget ? oTarget.sName : 'Backlog' }], sOperation);
      if (!bSaved) iHistoryFailures += 1;
    }
  });
  return iHistoryFailures === 0;
}

// Not one transaction: open issues move first (idempotent), then the sprint is closed. A retry after a failure finishes the job.
export async function completeSprint(oSprint, sDestination = '') {
  const oFresh = await loadSprint(oSprint.sId);
  assertSprintTransition(oFresh.iState, SPRINT_STATE.completed);
  const aIssues = await listSprintIssueRows(oFresh.sId);
  const { aMove, sTargetSprintId } = planSprintCompletion(aIssues, sDestination);
  let oTarget = null;
  if (aMove.length && sTargetSprintId) {
    oTarget = await loadOpenSprint(sTargetSprintId, oFresh.sProjectId);
    if (oTarget.sId === oFresh.sId) throw createDomainError(ERROR_CODES.validation, 'Choose a different sprint for the incomplete issues.');
  }
  const bHistorySaved = aMove.length ? await moveIssuesToSprint(aMove, oTarget, oFresh.sName, 'CompleteSprint') : true;
  const oMetrics = computeSprintMetrics(aIssues);
  await updateItem(TABLES.sprints.set, TABLES.sprints.key, oFresh.sId, {
    wd_sprintstate: SPRINT_STATE.completed, wd_completedon: nowIso(),
    wd_completedissues: oMetrics.iDone, wd_completedpoints: oMetrics.iDonePoints,
    wd_incompleteissues: oMetrics.iOpen, wd_incompletepoints: oMetrics.iOpenPoints,
  });
  invalidateCache(`sprints:${oFresh.sProjectId}`);
  return { oSprint: await loadSprint(oFresh.sId), iMoved: aMove.length, bHistorySaved };
}

// Only planned sprints can be cancelled; their open (non-archived) issues return to the backlog first.
export async function cancelSprint(oSprint) {
  const oFresh = await loadSprint(oSprint.sId);
  assertSprintTransition(oFresh.iState, SPRINT_STATE.cancelled);
  const aIssues = (await listSprintIssueRows(oFresh.sId)).filter((oIssue) => !oIssue.bArchived);
  const bHistorySaved = aIssues.length ? await moveIssuesToSprint(aIssues, null, oFresh.sName, 'CancelSprint') : true;
  await updateItem(TABLES.sprints.set, TABLES.sprints.key, oFresh.sId, { wd_sprintstate: SPRINT_STATE.cancelled });
  invalidateCache(`sprints:${oFresh.sProjectId}`);
  return { oSprint: await loadSprint(oFresh.sId), iMoved: aIssues.length, bHistorySaved };
}

// Lead-only correction path: a completed sprint becomes active again with a recorded reason, then is completed normally.
export async function reopenSprint(oSprint, sNote) {
  const oFresh = await loadSprint(oSprint.sId);
  assertSprintTransition(oFresh.iState, SPRINT_STATE.active);
  const sReason = String(sNote || '').trim();
  if (!sReason) throw createDomainError(ERROR_CODES.validation, '', { sNote: 'Explain why the sprint is being reopened.' });
  if (!getProjectPermissions(await getMyMembership(oFresh.sProjectId)).bCanManage) throw createDomainError(ERROR_CODES.permissionDenied, 'Only project leads can reopen a completed sprint.');
  await assertNoOtherActiveSprint(oFresh);
  await updateItem(TABLES.sprints.set, TABLES.sprints.key, oFresh.sId, {
    wd_sprintstate: SPRINT_STATE.active, wd_completedon: null,
    wd_correctionnote: truncateText(`${toDateOnly(new Date())}: ${sReason}`, LIMITS.correctionNoteMax),
  });
  invalidateCache(`sprints:${oFresh.sProjectId}`);
  return loadSprint(oFresh.sId);
}

// Simple metrics only (not a burndown). Completed sprints report their snapshot; open ones are live.
export async function getSprintReport(oSprint) {
  const oFresh = await loadSprint(oSprint.sId);
  const aIssues = await listSprintIssueRows(oFresh.sId);
  const oMetrics = computeSprintMetrics(aIssues);
  return { oSprint: oFresh, oMetrics, oScope: describeScopeChange(oFresh, oMetrics) };
}

// Moves an issue in the backlog/sprint plan: optional sprint change ('' = backlog) plus a fresh rank between neighbours.
export async function planIssue(oIssue, { sSprintId, sBeforeId = '', sAfterId = '' } = {}) {
  const oPayload = {};
  let oTarget = null;
  const bSprintChange = sSprintId !== undefined && sSprintId !== (oIssue.sSprintId || '');
  if (bSprintChange) {
    if (oIssue.sSprintId && isSprintLocked((await loadSprint(oIssue.sSprintId)).iState)) throw createDomainError(ERROR_CODES.sprintLocked);
    oTarget = sSprintId ? await loadOpenSprint(sSprintId, oIssue.sProjectId) : null;
    Object.assign(oPayload, await bindLookup(TABLES.issues, 'wd_sprint', TABLES.sprints, sSprintId || ''));
  }
  if (sBeforeId || sAfterId || bSprintChange) oPayload.wd_rank = await computePlacementRank(oIssue.sProjectId, { sBeforeId, sAfterId });
  if (!Object.keys(oPayload).length) return { oIssue, bHistorySaved: true };
  await updateItem(TABLES.issues.set, TABLES.issues.key, oIssue.sId, oPayload);
  const bHistorySaved = bSprintChange && !bServerPlugins
    ? await writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.sprintChanged, sField: 'sprint', sOldValue: oIssue.sSprintName || 'Backlog', sNewValue: oTarget ? oTarget.sName : 'Backlog' }], 'PlanIssue')
    : true;
  return {
    oIssue: { ...oIssue, sRank: oPayload.wd_rank || oIssue.sRank, ...(bSprintChange ? { sSprintId: sSprintId || '', sSprintName: oTarget ? oTarget.sName : '' } : {}), sModifiedOn: nowIso() },
    bHistorySaved,
  };
}

// ── Issue links ────────────────────────────────────────────────

async function listLinksBetween(sIssueId, sOtherId) {
  const sA = assertGuid(sIssueId, 'issue');
  const sB = assertGuid(sOtherId, 'issue');
  const { aRows } = await queryPage(TABLES.issueLinks, {
    sFilter: `(_wd_fromissue_value eq ${sA} and _wd_toissue_value eq ${sB}) or (_wd_fromissue_value eq ${sB} and _wd_toissue_value eq ${sA})`,
    aSelect: LINK_SELECT, iPageSize: PAGING.links,
  });
  return aRows.map(mapLink);
}

async function loadIssueSummaries(aIds) {
  const oById = new Map();
  const aUnique = [...new Set(aIds)];
  const aChunks = [];
  for (let iIndex = 0; iIndex < aUnique.length; iIndex += 20) aChunks.push(aUnique.slice(iIndex, iIndex + 20));
  const aResults = await Promise.all(aChunks.map((aChunk) => queryPage(TABLES.issues, {
    sFilter: aChunk.map((sId) => `wd_issueid eq ${assertGuid(sId)}`).join(' or '), aSelect: ISSUE_SELECT, iPageSize: 20,
  })));
  aResults.flatMap((oResult) => oResult.aRows).forEach((oRow) => oById.set(oRow.wd_issueid, mapIssue(oRow)));
  return oById;
}

// Both directions, shown from oIssue's point of view (bInward = stored the other way round).
export async function listIssueLinks(oIssue) {
  const sId = assertGuid(oIssue.sId, 'issue');
  const [oOutward, oInward] = await Promise.all([
    queryPage(TABLES.issueLinks, { sFilter: `_wd_fromissue_value eq ${sId}`, aSelect: LINK_SELECT, iPageSize: PAGING.links }),
    queryPage(TABLES.issueLinks, { sFilter: `_wd_toissue_value eq ${sId}`, aSelect: LINK_SELECT, iPageSize: PAGING.links }),
  ]);
  const aLinks = [
    ...oOutward.aRows.map(mapLink).map((oLink) => ({ ...oLink, bInward: false, sOtherId: oLink.sToId, sOtherKey: oLink.sToKey })),
    ...oInward.aRows.map(mapLink).map((oLink) => ({ ...oLink, bInward: true, sOtherId: oLink.sFromId, sOtherKey: oLink.sFromKey })),
  ];
  const oOthers = aLinks.length ? await loadIssueSummaries(aLinks.map((oLink) => oLink.sOtherId)) : new Map();
  return aLinks
    .map((oLink) => ({ ...oLink, sLabel: describeLink(oLink.iType, oLink.bInward), oOther: oOthers.get(oLink.sOtherId) || null }))
    .sort((oA, oB) => oA.sLabel.localeCompare(oB.sLabel) || oA.sOtherKey.localeCompare(oB.sOtherKey));
}

// Links live in their own table, so (like labels) the client records link history in both modes.
export async function createIssueLink(oIssue, sChoiceKey, oOther) {
  const oChoice = LINK_CHOICES.find((oItem) => oItem.sKey === sChoiceKey);
  if (!oChoice || !oOther) throw createDomainError(ERROR_CODES.invalidLink);
  const oFrom = oChoice.bInward ? oOther : oIssue;
  const oTo = oChoice.bInward ? oIssue : oOther;
  const sError = validateIssueLink({ sFromId: oFrom.sId, sToId: oTo.sId, iType: oChoice.iType }, oIssue.sId === oOther.sId ? [] : await listLinksBetween(oIssue.sId, oOther.sId));
  if (sError) throw createDomainError(sError);
  await createItem(TABLES.issueLinks.set, TABLES.issueLinks.key, {
    wd_issuelinkid: newId(), wd_name: truncateText(`${oFrom.sKey} ${describeLink(oChoice.iType, false)} ${oTo.sKey}`, 100), wd_linktype: oChoice.iType,
    ...(await bindLookup(TABLES.issueLinks, 'wd_fromissue', TABLES.issues, oFrom.sId)),
    ...(await bindLookup(TABLES.issueLinks, 'wd_toissue', TABLES.issues, oTo.sId)),
  });
  return writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.linked, sField: 'link', sNewValue: `${oChoice.sLabel} ${oOther.sKey}` }], 'LinkIssue');
}

export async function deleteIssueLink(oIssue, oLink) {
  await deleteItem(TABLES.issueLinks.set, TABLES.issueLinks.key, assertGuid(oLink.sId, 'link'));
  return writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.linked, sField: 'link', sOldValue: `${oLink.sLabel} ${oLink.sOtherKey}`, sNewValue: '' }], 'UnlinkIssue');
}

// ── Dashboard ──────────────────────────────────────────────────

// Counts come from Dataverse $count, so they only include rows the signed-in user is allowed to read.
export async function getDashboard(oProject) {
  const sOpen = buildIssueFilter({ sProjectId: oProject.sId, bOpenOnly: true });
  const [oStatusCounts, aPriorityCounts, iOverdue, iUnassigned, aSprints] = await Promise.all([
    getStatusCounts(oProject.sId),
    Promise.all(PRIORITIES.map(async (oPriority) => [oPriority.value, await countRows(TABLES.issues, `${sOpen} and wd_priority eq ${oPriority.value}`, 'wd_issueid')])),
    countRows(TABLES.issues, buildIssueFilter({ sProjectId: oProject.sId, bOpenOnly: true, sDueBefore: toDateOnly(new Date()) }), 'wd_issueid'),
    countRows(TABLES.issues, buildIssueFilter({ sProjectId: oProject.sId, bOpenOnly: true, aAssigneeIds: ['none'] }), 'wd_issueid'),
    listSprints(oProject.sId),
  ]);
  const aActive = aSprints.filter((oSprint) => oSprint.iState === SPRINT_STATE.active);
  const aSprintProgress = await Promise.all(aActive.map((oSprint) => getSprintReport(oSprint)));
  return { oStatusCounts, oPriorityCounts: Object.fromEntries(aPriorityCounts), iOverdue, iUnassigned, aSprintProgress };
}

// ── Issues (create / update) ───────────────────────────────────

// oDraft may also carry iStoryPoints, sSprintId and sBoardId (an extra board to put the new issue on).
export async function createIssue(oProject, oDraft) {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const { bValid, oErrors } = validateIssueDraft({ ...oDraft, sProjectId: oProject.sId });
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  await Promise.all([
    loadValidParent({ sId: '', sProjectId: oProject.sId, iType: Number(oDraft.iType) }, oDraft.sParentId),
    oDraft.sSprintId ? loadOpenSprint(oDraft.sSprintId, oProject.sId) : Promise.resolve(null),
    oDraft.sFixVersionId ? loadUsableVersion(oDraft.sFixVersionId, oProject.sId) : Promise.resolve(null),
  ]);
  const oEstimates = estimatePayload(oDraft, {});
  const oWorkflow = await getWorkflow(oProject.sId);
  const oBase = {
    wd_summary: String(oDraft.sSummary).trim(),
    wd_description: String(oDraft.sDescription || '').trim(),
    wd_issuetype: Number(oDraft.iType),
    wd_status: oWorkflow.iInitialStatus,
    wd_priority: Number(oDraft.iPriority),
    wd_duedate: oDraft.sDueDate || null,
    wd_storypoints: oDraft.iStoryPoints === undefined ? null : oDraft.iStoryPoints,
    wd_rank: await nextRankForProject(oProject.sId),
    wd_archived: false,
    ...oEstimates,
    ...(!bServerPlugins && getStatusCategory(oWorkflow.iInitialStatus) === 'progress' ? { wd_startedon: nowIso() } : {}),
    ...(await bindLookup(TABLES.issues, 'wd_project', TABLES.projects, oProject.sId)),
    ...(oDraft.sAssigneeId ? await bindLookup(TABLES.issues, 'wd_assignee', TABLES.users, oDraft.sAssigneeId) : {}),
    ...(oDraft.sParentId ? await bindLookup(TABLES.issues, 'wd_parentissue', TABLES.issues, oDraft.sParentId) : {}),
    ...(oDraft.sSprintId ? await bindLookup(TABLES.issues, 'wd_sprint', TABLES.sprints, oDraft.sSprintId) : {}),
    ...(oDraft.sFixVersionId ? await bindLookup(TABLES.issues, 'wd_fixversion', TABLES.versions, oDraft.sFixVersionId) : {}),
  };
  let oCreated = null;
  for (let iAttempt = 1; iAttempt <= KEY_ALLOCATION_RETRIES && !oCreated; iAttempt += 1) {
    const sIssueId = newId();
    try {
      if (bServerPlugins) {
        // The pre-operation plug-in sets the key, sequence, initial status and checks membership.
        await createItem(TABLES.issues.set, TABLES.issues.key, { ...oBase, wd_issueid: sIssueId });
        oCreated = { sId: sIssueId, sKey: '', sProjectId: oProject.sId };
      } else {
        const { sKey, iNumber } = await allocateIssueKey(oProject);
        await createItem(TABLES.issues.set, TABLES.issues.key, { ...oBase, wd_issueid: sIssueId, wd_issuekey: sKey, wd_issuesequence: iNumber });
        oCreated = { sId: sIssueId, sKey, sProjectId: oProject.sId };
      }
    } catch (oError) {
      if (!isDuplicateKeyError(oError) || iAttempt === KEY_ALLOCATION_RETRIES) throw oError;
    }
  }
  if (bServerPlugins) {
    const oSaved = await getIssue(oCreated.sId);
    if (!oSaved.sKey) {
      // Plug-in missing: hide the unnumbered row rather than leave it on boards.
      await updateItem(TABLES.issues.set, TABLES.issues.key, oCreated.sId, { wd_archived: true }).catch(() => {});
      throw createDomainError(ERROR_CODES.serverLogicMissing);
    }
    oCreated.sKey = oSaved.sKey;
  }
  const aLabels = normaliseLabels(oDraft.aLabels);
  const [bHistorySaved] = await Promise.all([
    bServerPlugins ? Promise.resolve(true) : writeHistory(oCreated, [{ iEvent: HISTORY_EVENTS.created, sField: '', sNewValue: oBase.wd_summary }], 'CreateIssue'),
    aLabels.length ? setIssueLabels(oCreated, aLabels) : Promise.resolve([]),
    oDraft.sBoardId ? setIssueBoards(oCreated, [oDraft.sBoardId]) : Promise.resolve([]),
  ]);
  const oIssue = await getIssue(oCreated.sId);
  if (oIssue.sAssigneeId) await sendNotifications(oProject.sId, oIssue, planAssignmentNotifications({ sAssigneeId: '' }, oIssue.sAssigneeId));
  return { oIssue, bHistorySaved };
}

function toDisplay(oIssue) {
  return {
    summary: oIssue.sSummary,
    description: truncateText(oIssue.sDescription, 120),
    type: getIssueType(oIssue.iType).label,
    priority: getPriority(oIssue.iPriority).label,
    assignee: oIssue.sAssigneeId ? oIssue.sAssigneeName || 'Assigned' : 'Unassigned',
    dueDate: formatDateOnly(oIssue.sDueDate) || 'None',
    parent: oIssue.sParentKey || 'None',
    labels: (oIssue.aLabels || []).map((oLabel) => oLabel.sName || oLabel).join(', ') || 'None',
    points: formatStoryPoints(oIssue.iStoryPoints) || 'None',
    resolution: (getResolution(oIssue.iResolution) || {}).label || 'None',
    fixVersion: oIssue.sFixVersionId ? oIssue.sFixVersionName || 'Version' : 'None',
    originalEstimate: formatDuration(oIssue.iOriginalEstimate) || 'None',
    remainingEstimate: formatDuration(oIssue.iRemainingEstimate) || 'None',
    solutionVersion: oIssue.sSolutionVersion || 'None',
  };
}

async function loadParentType(sParentId) {
  if (!sParentId) return null;
  const oRow = await getItem(TABLES.issues.set, TABLES.issues.key, assertGuid(sParentId, 'parent'), ['wd_issuetype']);
  return oRow ? { iType: Number(oRow.wd_issuetype) } : null;
}

// iOriginalEstimate / iRemainingEstimate: whole minutes, null clears. A first original estimate also seeds remaining.
function estimatePayload(oChanges, oIssue) {
  const oPayload = {};
  ['iOriginalEstimate', 'iRemainingEstimate'].forEach((sKey) => {
    if (oChanges[sKey] === undefined) return;
    assertFeature('timeTracking');
    if (oChanges[sKey] !== null && !isValidEstimate(oChanges[sKey])) {
      throw createDomainError(ERROR_CODES.validation, '', { [sKey]: `Estimates must be from 0m to ${formatDuration(LIMITS.estimateMaxMinutes)}.` });
    }
    oPayload[sKey === 'iOriginalEstimate' ? 'wd_originalestimate' : 'wd_remainingestimate'] = oChanges[sKey];
  });
  if (oChanges.iOriginalEstimate !== undefined && oChanges.iOriginalEstimate !== null && oChanges.iRemainingEstimate === undefined) {
    const iSeed = remainingForNewEstimate(oIssue, oChanges.iOriginalEstimate);
    if (iSeed !== undefined) oPayload.wd_remainingestimate = iSeed;
  }
  return oPayload;
}

// oChanges may include: sSummary, sDescription, iType, iPriority, sAssigneeId/sAssigneeName, sDueDate, sParentId/sParentKey,
// aLabels, iStoryPoints (null = not estimated), sSprintId ('' = backlog), aBoardIds (extra boards), iResolution (done statuses only),
// sSolutionVersion (stories only; cleared automatically when a story becomes another type) and oCustomValues ({ fieldId: raw value }).
// One Save = one call. oOptions.bNotify = false is used by bulk edit.
export async function updateIssue(oIssue, oChanges, { bNotify = true } = {}) {
  const oNext = { ...oIssue, ...oChanges };
  if (oChanges.aLabels) oNext.aLabels = normaliseLabels(oChanges.aLabels).map((sName) => ({ sName }));
  if (oChanges.sSolutionVersion !== undefined) {
    assertFeature('powerPlatform');
    oNext.sSolutionVersion = normaliseSolutionVersion(oChanges.sSolutionVersion);
  }
  const bClearSolutionVersion = Boolean(oNext.sSolutionVersion) && !isStoryType(oNext.iType) && oChanges.sSolutionVersion === undefined;
  if (bClearSolutionVersion) oNext.sSolutionVersion = '';
  const { bValid, oErrors } = validateIssueDraft({ ...oNext, aLabels: oNext.aLabels.map((oLabel) => oLabel.sName) });
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (oChanges.iResolution !== undefined && oChanges.iResolution !== null) {
    if (!isValidResolution(oChanges.iResolution)) throw createDomainError(ERROR_CODES.validation, '', { iResolution: 'Choose a valid resolution.' });
    if (!isDoneStatus(oIssue.iStatus)) throw createDomainError(ERROR_CODES.validation, '', { iResolution: 'Only done issues have a resolution.' });
  }
  const oCustom = oChanges.oCustomValues ? await prepareCustomValues(oIssue, oNext.iType, oChanges.oCustomValues) : null;
  const bTypeChange = oChanges.iType !== undefined && Number(oChanges.iType) !== oIssue.iType;
  const bParentChange = oChanges.sParentId !== undefined && oChanges.sParentId !== oIssue.sParentId;
  const bSprintChange = oChanges.sSprintId !== undefined && oChanges.sSprintId !== (oIssue.sSprintId || '');
  const bVersionChange = oChanges.sFixVersionId !== undefined && oChanges.sFixVersionId !== (oIssue.sFixVersionId || '');
  const oPayload = estimatePayload(oChanges, oIssue);
  if (oPayload.wd_remainingestimate !== undefined) oNext.iRemainingEstimate = oPayload.wd_remainingestimate;
  if (oChanges.sSummary !== undefined) oPayload.wd_summary = String(oChanges.sSummary).trim();
  if (oChanges.sDescription !== undefined) oPayload.wd_description = String(oChanges.sDescription).trim();
  if (oChanges.iType !== undefined) oPayload.wd_issuetype = Number(oChanges.iType);
  if (oChanges.iPriority !== undefined) oPayload.wd_priority = Number(oChanges.iPriority);
  if (oChanges.sDueDate !== undefined) oPayload.wd_duedate = oChanges.sDueDate || null;
  if (oChanges.iStoryPoints !== undefined) oPayload.wd_storypoints = oChanges.iStoryPoints;
  if (oChanges.iResolution !== undefined) oPayload.wd_resolution = oChanges.iResolution;
  if (oChanges.sSolutionVersion !== undefined || bClearSolutionVersion) oPayload.wd_solutionversion = oNext.sSolutionVersion || null;
  if (oChanges.sAssigneeId !== undefined) Object.assign(oPayload, await bindLookup(TABLES.issues, 'wd_assignee', TABLES.users, oChanges.sAssigneeId || ''));
  if (bParentChange) {
    const oParent = await loadValidParent({ ...oIssue, iType: oNext.iType }, oChanges.sParentId);
    oNext.sParentKey = oParent ? oParent.sKey : '';
    Object.assign(oPayload, await bindLookup(TABLES.issues, 'wd_parentissue', TABLES.issues, oChanges.sParentId || ''));
  }
  if (bTypeChange) {
    const [oParent, aChildTypes] = await Promise.all([
      bParentChange ? Promise.resolve(null) : loadParentType(oIssue.sParentId),
      canHaveChildren(oIssue.iType) ? listChildTypes(oIssue.sId) : Promise.resolve([]),
    ]);
    const sError = validateTypeChange(oNext.iType, oParent, aChildTypes);
    if (sError) throw createDomainError(sError);
  }
  let oSprint = null;
  if (bSprintChange) {
    if (oIssue.sSprintId && isSprintLocked((await loadSprint(oIssue.sSprintId)).iState)) throw createDomainError(ERROR_CODES.sprintLocked);
    oSprint = oChanges.sSprintId ? await loadOpenSprint(oChanges.sSprintId, oIssue.sProjectId) : null;
    Object.assign(oPayload, await bindLookup(TABLES.issues, 'wd_sprint', TABLES.sprints, oChanges.sSprintId || ''));
  }
  if (bVersionChange) {
    const oVersion = oChanges.sFixVersionId ? await loadUsableVersion(oChanges.sFixVersionId, oIssue.sProjectId) : null;
    oNext.sFixVersionName = oVersion ? oVersion.sName : '';
    Object.assign(oPayload, await bindLookup(TABLES.issues, 'wd_fixversion', TABLES.versions, oChanges.sFixVersionId || ''));
  }
  if (Object.keys(oPayload).length) await updateItem(TABLES.issues.set, TABLES.issues.key, oIssue.sId, oPayload);
  await Promise.all([
    oChanges.aLabels ? setIssueLabels(oIssue, oChanges.aLabels).then((aLabels) => { oNext.aLabels = aLabels; }) : Promise.resolve(),
    oChanges.aBoardIds ? setIssueBoards(oIssue, oChanges.aBoardIds) : Promise.resolve(),
    oCustom ? writeCustomValues(oIssue, oCustom) : Promise.resolve(),
  ]);
  // Labels and custom values live in their own tables, so the issue plug-in can't see them; the client records that history.
  const aChanges = diffDisplayValues(toDisplay(oIssue), toDisplay(oNext), HISTORY_FIELDS)
    .filter((oChange) => !bServerPlugins || oChange.sField === 'labels')
    .map((oChange) => ({ ...oChange, iEvent: HISTORY_EVENTS.fieldChanged }));
  if (oCustom) aChanges.push(...oCustom.aHistory);
  if (bSprintChange && !bServerPlugins) {
    aChanges.push({ iEvent: HISTORY_EVENTS.sprintChanged, sField: 'sprint', sOldValue: oIssue.sSprintName || 'Backlog', sNewValue: oSprint ? oSprint.sName : 'Backlog' });
  }
  const bHistorySaved = await writeHistory(oIssue, aChanges, 'UpdateIssue');
  if (bNotify && oChanges.sAssigneeId !== undefined) await sendNotifications(oIssue.sProjectId, oIssue, planAssignmentNotifications(oIssue, oChanges.sAssigneeId));
  return { oIssue: await getIssue(oIssue.sId), bHistorySaved };
}

const TRANSITION_FIELD_KEYS = Object.freeze(['iResolution', 'sAssigneeId', 'sAssigneeName', 'iStoryPoints', 'sDueDate']);

// Re-reads the server status first so a stale UI cannot skip workflow validation.
// oPlacement { sBeforeId, sAfterId } re-ranks the card between its new neighbours using their current server ranks.
// oFields carries values the transition requires (iResolution, sAssigneeId, iStoryPoints, sDueDate); they save in the same update.
export async function transitionIssue(oIssue, iToStatus, oPlacement = null, oFields = {}, { bNotify = true } = {}) {
  const oFresh = await getItem(TABLES.issues.set, TABLES.issues.key, oIssue.sId,
    ['wd_status', 'wd_archived', 'wd_resolution', '_wd_assignee_value', 'wd_storypoints', 'wd_duedate', '_createdby_value', 'wd_startedon']);
  if (!oFresh) throw createDomainError(ERROR_CODES.issueNotFound);
  const iCurrent = Number(oFresh.wd_status);
  const iTarget = Number(iToStatus);
  const oExtra = Object.fromEntries(Object.entries(oFields || {}).filter(([sKey, value]) => TRANSITION_FIELD_KEYS.includes(sKey) && value !== undefined));
  const oCurrentValues = {
    iResolution: oFresh.wd_resolution === null || oFresh.wd_resolution === undefined ? null : Number(oFresh.wd_resolution),
    sAssigneeId: oFresh._wd_assignee_value || '', iStoryPoints: oFresh.wd_storypoints ?? null, sDueDate: String(oFresh.wd_duedate || '').slice(0, 10),
  };
  const oPayload = {};
  const aFieldChanges = [];
  if (iCurrent !== iTarget) {
    // Early check for a friendly message; the "Issue · Before update" plug-in re-validates and stamps Resolved On.
    const oWorkflow = await getWorkflow(oIssue.sProjectId);
    assertTransition(iCurrent, iTarget, oWorkflow);
    assertTransitionFields(getTransitionRequirements(iCurrent, iTarget, oWorkflow), { ...oCurrentValues, ...oExtra });
    oPayload.wd_status = iTarget;
    // Cycle time starts the first time an issue enters an in-progress status (plug-in 36 does this in 'lowcode' mode).
    if (!bServerPlugins && !oFresh.wd_startedon && getStatusCategory(iTarget) === 'progress') oPayload.wd_startedon = nowIso();
    if (!bServerPlugins && isDoneStatus(iTarget) && !isDoneStatus(iCurrent)) oPayload.wd_resolvedon = nowIso();
    else if (!bServerPlugins && isDoneStatus(iCurrent) && !isDoneStatus(iTarget)) oPayload.wd_resolvedon = null;
    if (isValidResolution(oExtra.iResolution) && isDoneStatus(iTarget)) oPayload.wd_resolution = Number(oExtra.iResolution);
    else if (!bServerPlugins && !isDoneStatus(iTarget) && oCurrentValues.iResolution !== null) oPayload.wd_resolution = null;
    if (oExtra.sAssigneeId && oExtra.sAssigneeId !== oCurrentValues.sAssigneeId) {
      Object.assign(oPayload, await bindLookup(TABLES.issues, 'wd_assignee', TABLES.users, oExtra.sAssigneeId));
      aFieldChanges.push({ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'assignee', sOldValue: oIssue.sAssigneeName || 'Unassigned', sNewValue: oExtra.sAssigneeName || 'Assigned' });
    }
    if (oExtra.iStoryPoints !== undefined && oExtra.iStoryPoints !== oCurrentValues.iStoryPoints) {
      if (!isValidStoryPoints(oExtra.iStoryPoints)) throw createDomainError(ERROR_CODES.validation, '', { iStoryPoints: `Story points must be a whole number from 0 to ${LIMITS.storyPointsMax}.` });
      oPayload.wd_storypoints = oExtra.iStoryPoints;
      aFieldChanges.push({ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'points', sOldValue: formatStoryPoints(oCurrentValues.iStoryPoints) || 'None', sNewValue: formatStoryPoints(oExtra.iStoryPoints) });
    }
    if (oExtra.sDueDate && oExtra.sDueDate !== oCurrentValues.sDueDate) {
      if (!isValidDateOnly(oExtra.sDueDate)) throw createDomainError(ERROR_CODES.validation, '', { sDueDate: 'Enter a valid date.' });
      oPayload.wd_duedate = oExtra.sDueDate;
      aFieldChanges.push({ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'dueDate', sOldValue: formatDateOnly(oCurrentValues.sDueDate) || 'None', sNewValue: formatDateOnly(oExtra.sDueDate) });
    }
    if (oPayload.wd_resolution !== undefined) {
      aFieldChanges.push({ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'resolution', sOldValue: (getResolution(oCurrentValues.iResolution) || {}).label || 'None', sNewValue: (getResolution(oPayload.wd_resolution) || {}).label || 'None' });
    }
  }
  if (oPlacement) oPayload.wd_rank = await computePlacementRank(oIssue.sProjectId, oPlacement);
  const sRank = oPayload.wd_rank || '';
  if (!Object.keys(oPayload).length) return { oIssue, bHistorySaved: true };
  await updateItem(TABLES.issues.set, TABLES.issues.key, oIssue.sId, oPayload);
  const bHistorySaved = iCurrent === iTarget || bServerPlugins ? true : await writeHistory(oIssue, [{
    iEvent: HISTORY_EVENTS.transitioned, sField: 'status', sOldValue: getIssueStatus(iCurrent).label, sNewValue: getIssueStatus(iTarget).label,
  }, ...aFieldChanges], 'TransitionIssue');
  const bAssigned = Boolean(oPayload[Object.keys(oPayload).find((sKey) => sKey.endsWith('@odata.bind'))]);
  const oSaved = {
    ...oIssue, iStatus: iTarget, sRank: sRank || oIssue.sRank, sModifiedOn: nowIso(),
    iResolution: oPayload.wd_resolution !== undefined ? oPayload.wd_resolution : (isDoneStatus(iTarget) ? oCurrentValues.iResolution : null),
    ...(oPayload.wd_storypoints !== undefined ? { iStoryPoints: oPayload.wd_storypoints } : {}),
    ...(oPayload.wd_duedate !== undefined ? { sDueDate: oPayload.wd_duedate } : {}),
    ...(bAssigned ? { sAssigneeId: oExtra.sAssigneeId, sAssigneeName: oExtra.sAssigneeName || '' } : {}),
  };
  if (bNotify && iCurrent !== iTarget) {
    const oWatched = { sAssigneeId: oSaved.sAssigneeId || oCurrentValues.sAssigneeId, sReporterId: oFresh._createdby_value || oIssue.sReporterId || '' };
    await sendNotifications(oIssue.sProjectId, oIssue, [
      ...planStatusNotifications(oWatched, iCurrent, iTarget),
      ...(bAssigned ? planAssignmentNotifications({ sAssigneeId: oCurrentValues.sAssigneeId }, oExtra.sAssigneeId) : []),
    ]);
  }
  return { oIssue: oSaved, bHistorySaved };
}

export async function archiveIssue(oIssue) {
  await updateItem(TABLES.issues.set, TABLES.issues.key, oIssue.sId, { wd_archived: true });
  const bHistorySaved = bServerPlugins ? true : await writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.archived, sField: 'archived', sOldValue: 'No', sNewValue: 'Yes' }], 'ArchiveIssue');
  return { bHistorySaved };
}

// ── Comments ───────────────────────────────────────────────────

export async function listComments(sIssueId, sSkipToken = '') {
  const { aRows, sNextToken, iCount } = await queryPage(TABLES.comments, {
    sFilter: `_wd_issue_value eq ${assertGuid(sIssueId)}`, aSelect: COMMENT_SELECT, aOrderBy: ['createdon desc'],
    iPageSize: PAGING.comments, sSkipToken, bCount: !sSkipToken,
  });
  return { aComments: aRows.map(mapComment), sNextToken, iCount };
}

export async function addComment(oIssue, sBody) {
  const sError = validateCommentBody(sBody);
  if (sError) throw createDomainError(ERROR_CODES.validation, sError);
  const oUser = await getCurrentUser();
  const sId = newId();
  const sText = String(sBody).trim();
  await createItem(TABLES.comments.set, TABLES.comments.key, {
    wd_issuecommentid: sId, wd_name: truncateText(`${oIssue.sKey} comment`, 100), wd_body: sText, wd_isedited: false,
    ...(await bindLookup(TABLES.comments, 'wd_issue', TABLES.issues, oIssue.sId)),
  });
  const bHistorySaved = bServerPlugins ? true : await writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.commented, sField: 'comment', sNewValue: truncateText(sText, 120) }], 'AddComment');
  // "@Full Name" mentions of project members; the comment text itself is never copied into notifications.
  const aMembers = await listMembers(oIssue.sProjectId).catch(() => []);
  await sendNotifications(oIssue.sProjectId, oIssue, planCommentNotifications(oIssue, extractMentions(sText, aMembers)));
  return { oComment: { sId, sBody: sText, bEdited: false, sEditedOn: '', sAuthorId: oUser.sId, sAuthorName: oUser.sName, sCreatedOn: nowIso() }, bHistorySaved };
}

export async function updateComment(oComment, sBody) {
  const oUser = await getCurrentUser();
  if (oComment.sAuthorId !== oUser.sId) throw createDomainError(ERROR_CODES.permissionDenied, 'You can only edit your own comments.');
  const sError = validateCommentBody(sBody);
  if (sError) throw createDomainError(ERROR_CODES.validation, sError);
  const sEditedOn = nowIso();
  await updateItem(TABLES.comments.set, TABLES.comments.key, oComment.sId, { wd_body: String(sBody).trim(), wd_isedited: true, wd_editedon: sEditedOn });
  return { ...oComment, sBody: String(sBody).trim(), bEdited: true, sEditedOn };
}

// ── Notifications (Phase 3) ────────────────────────────────────
// Best effort: a failure here never undoes the save that triggered it. Rows double as an outbox for the optional
// Power Automate delivery flow (docs/notification-flow.md). They hold no issue summaries.

async function sendNotifications(sProjectId, oIssue, aPlans) {
  if (!aPlans.length) return true;
  try {
    const [oUser, aMembers] = await Promise.all([getCurrentUser(), listMembers(sProjectId)]);
    const aFinal = finaliseNotifications(aPlans, oUser.sId, aMembers.map((oMember) => oMember.sUserId));
    if (!aFinal.length) return true;
    const [oProjectBinding, oIssueBinding] = await Promise.all([
      bindLookup(TABLES.notifications, 'wd_project', TABLES.projects, sProjectId),
      oIssue ? bindLookup(TABLES.notifications, 'wd_issue', TABLES.issues, oIssue.sId) : Promise.resolve({}),
    ]);
    await runInBatches(aFinal, async (oPlan) => createItem(TABLES.notifications.set, TABLES.notifications.key, {
      wd_notificationid: newId(),
      wd_name: truncateText(`${oIssue ? oIssue.sKey : 'Bulk edit'} · ${(getNotificationEvent(oPlan.iEvent) || {}).key || 'update'}`, 100),
      wd_eventtype: oPlan.iEvent, wd_detail: oPlan.sDetail, wd_itemcount: oPlan.iCount || 1, wd_isread: false,
      wd_deliverystate: NOTIFICATION_DELIVERY.pending, ...oProjectBinding, ...oIssueBinding,
      ...(await bindLookup(TABLES.notifications, 'wd_recipient', TABLES.users, oPlan.sRecipientId)),
    }));
    return true;
  } catch (oError) {
    console.warn('Pira: notifications could not be created', oError);
    return false;
  }
}

export async function getNotificationPreferences() {
  return cached('prefs:mine', async () => {
    const oUser = await getCurrentUser();
    const { aRows } = await queryPage(TABLES.notificationPreferences, {
      sFilter: `_wd_user_value eq ${assertGuid(oUser.sId)}`, aSelect: ['wd_notificationpreferenceid', ...Object.values(PREFERENCE_COLUMNS)], iTop: 1,
    });
    const oRow = aRows[0] || null;
    const oRaw = oRow ? Object.fromEntries(Object.entries(PREFERENCE_COLUMNS).map(([sKey, sColumn]) => [sKey, oRow[sColumn]])) : {};
    return { ...normaliseNotificationPreferences(oRaw), sId: oRow ? oRow.wd_notificationpreferenceid : '' };
  });
}

export async function saveNotificationPreferences(oPreferences) {
  const [oUser, oCurrent] = await Promise.all([getCurrentUser(), getNotificationPreferences()]);
  const oClean = normaliseNotificationPreferences(oPreferences);
  const oPayload = Object.fromEntries(Object.entries(PREFERENCE_COLUMNS).map(([sKey, sColumn]) => [sColumn, oClean[sKey]]));
  if (oCurrent.sId) {
    await updateItem(TABLES.notificationPreferences.set, TABLES.notificationPreferences.key, oCurrent.sId, oPayload);
  } else {
    await createItem(TABLES.notificationPreferences.set, TABLES.notificationPreferences.key, {
      wd_notificationpreferenceid: newId(), wd_name: truncateText(`${oUser.sName} notifications`, 200), ...oPayload,
      ...(await bindLookup(TABLES.notificationPreferences, 'wd_user', TABLES.users, oUser.sId)),
    });
  }
  invalidateCache('prefs:mine');
  return getNotificationPreferences();
}

// Preferences are applied when reading, so switching an event back on also brings back what arrived meanwhile.
async function notificationFilter(bUnreadOnly) {
  const [oUser, oPreferences] = await Promise.all([getCurrentUser(), getNotificationPreferences()]);
  const aEvents = enabledNotificationEvents(oPreferences);
  if (!aEvents.length) return '';
  return [
    `_wd_recipient_value eq ${assertGuid(oUser.sId)}`,
    `(${aEvents.map((iEvent) => `wd_eventtype eq ${iEvent}`).join(' or ')})`,
    ...(bUnreadOnly ? ['(wd_isread eq false or wd_isread eq null)'] : []),
  ].join(' and ');
}

export async function listNotifications({ bUnreadOnly = false, sSkipToken = '' } = {}) {
  const sFilter = await notificationFilter(bUnreadOnly);
  if (!sFilter) return { aNotifications: [], sNextToken: '' };
  const { aRows, sNextToken } = await queryPage(TABLES.notifications, {
    sFilter, aSelect: NOTIFICATION_SELECT, aOrderBy: ['createdon desc'], iPageSize: PAGING.notifications, sSkipToken,
  });
  return { aNotifications: aRows.map(mapNotification), sNextToken };
}

export async function countUnreadNotifications() {
  const sFilter = await notificationFilter(true);
  return sFilter ? countRows(TABLES.notifications, sFilter, 'wd_notificationid') : 0;
}

export async function markNotificationsRead(aIds) {
  const sReadOn = nowIso();
  const aUnique = [...new Set(aIds)].map((sId) => assertGuid(sId, 'notification'));
  await runInBatches(aUnique, (sId) => updateItem(TABLES.notifications.set, TABLES.notifications.key, sId, { wd_isread: true, wd_readon: sReadOn }));
}

export async function markAllNotificationsRead() {
  const oUser = await getCurrentUser();
  const aRows = await queryAll(TABLES.notifications, {
    sFilter: `_wd_recipient_value eq ${assertGuid(oUser.sId)} and (wd_isread eq false or wd_isread eq null)`, aSelect: ['wd_notificationid'], iPageSize: 200,
  }, 500);
  await markNotificationsRead(aRows.map((oRow) => oRow.wd_notificationid));
  return aRows.length;
}

// ── Saved filters (Phase 3) ────────────────────────────────────
// A filter is criteria only. Running a shared filter queries as the viewer, so it can't reveal rows they can't read.

export async function listSavedFilters(sProjectId) {
  return cached(`filters:${sProjectId}`, async () => {
    const oUser = await getCurrentUser();
    const { aRows } = await queryPage(TABLES.savedFilters, {
      sFilter: `_wd_project_value eq ${assertGuid(sProjectId, 'project')} and (_createdby_value eq ${assertGuid(oUser.sId)} or wd_visibility eq ${FILTER_VISIBILITY[1].value})`,
      aSelect: SAVED_FILTER_SELECT, aOrderBy: ['wd_name asc'], iPageSize: PAGING.savedFilters,
    });
    return aRows.map((oRow) => mapSavedFilter(oRow, oUser.sId));
  });
}

const savedFilterPayload = (oDraft) => ({
  wd_name: String(oDraft.sName).trim(), wd_criteria: serialiseFilterCriteria(oDraft.oCriteria), wd_visibility: Number(oDraft.iVisibility),
});

export async function createSavedFilter(oProject, oDraft) {
  const { bValid, oErrors } = validateSavedFilterDraft(oDraft);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  if (!getProjectPermissions(await getMyMembership(oProject.sId)).bCanView) throw createDomainError(ERROR_CODES.permissionDenied, 'Only project members can save filters in this project.');
  const sId = newId();
  await createItem(TABLES.savedFilters.set, TABLES.savedFilters.key, {
    wd_savedfilterid: sId, ...savedFilterPayload(oDraft), ...(await bindLookup(TABLES.savedFilters, 'wd_project', TABLES.projects, oProject.sId)),
  });
  invalidateCache(`filters:${oProject.sId}`);
  return (await listSavedFilters(oProject.sId)).find((oFilter) => oFilter.sId === sId) || null;
}

async function assertFilterOwner(oFilter) {
  const oUser = await getCurrentUser();
  if (oFilter.sOwnerId !== oUser.sId) throw createDomainError(ERROR_CODES.permissionDenied, 'Only the person who saved a filter can change or delete it.');
}

export async function updateSavedFilter(oFilter, oChanges) {
  await assertFilterOwner(oFilter);
  const oNext = { sName: oFilter.sName, iVisibility: oFilter.iVisibility, oCriteria: oFilter.oCriteria, ...oChanges };
  const { bValid, oErrors } = validateSavedFilterDraft(oNext);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  await updateItem(TABLES.savedFilters.set, TABLES.savedFilters.key, assertGuid(oFilter.sId, 'filter'), savedFilterPayload(oNext));
  invalidateCache(`filters:${oFilter.sProjectId}`);
  return (await listSavedFilters(oFilter.sProjectId)).find((oItem) => oItem.sId === oFilter.sId) || null;
}

export async function deleteSavedFilter(oFilter) {
  await assertFilterOwner(oFilter);
  await deleteItem(TABLES.savedFilters.set, TABLES.savedFilters.key, assertGuid(oFilter.sId, 'filter'));
  invalidateCache(`filters:${oFilter.sProjectId}`);
}

// ── Bulk edit (Phase 3) ────────────────────────────────────────
// Each issue is saved and validated on its own (and by the plug-ins), so one failure never blocks the rest.
// Deliberately not all-or-nothing: results report every issue, and only failed ones are retried.

async function buildBulkPlan(oProject, aIssueIds, oChange, oLookups) {
  const aIds = [...new Set((aIssueIds || []).map((sId) => assertGuid(sId, 'issue')))];
  const oClean = validateBulkChange(oChange, aIds.length);
  const [oById, aSprints, oWorkflow] = await Promise.all([
    loadIssueSummaries(aIds),
    oClean.sField === 'sprint' ? listSprints(oProject.sId) : Promise.resolve([]),
    oClean.sField === 'status' ? getWorkflow(oProject.sId) : Promise.resolve(DEFAULT_WORKFLOW),
  ]);
  if (oClean.sField === 'sprint' && oClean.value) {
    const oSprint = aSprints.find((oItem) => oItem.sId === oClean.value);
    if (!oSprint) throw createDomainError(ERROR_CODES.sprintNotFound);
    if (!isSprintOpen(oSprint.iState)) throw createDomainError(ERROR_CODES.sprintLocked);
  }
  await attachLabels([...oById.values()]);
  const oContext = { oWorkflow, oSprintNames: Object.fromEntries(aSprints.map((oSprint) => [oSprint.sId, oSprint.sName])), sAssigneeName: oLookups.sAssigneeName || '' };
  const aFound = aIds.map((sId) => oById.get(sId)).filter((oIssue) => oIssue && oIssue.sProjectId === oProject.sId);
  const oPlan = planBulkEdit(aFound, oClean, oContext);
  const aMissing = aIds.filter((sId) => !aFound.some((oIssue) => oIssue.sId === sId))
    .map((sIssueId) => ({ sIssueId, sKey: '', sSummary: '', sFrom: '', sTo: '', sOutcome: 'blocked', sReason: 'Not found in this project, or you don\'t have access.' }));
  return { ...oPlan, aRows: [...oPlan.aRows, ...aMissing], iBlocked: oPlan.iBlocked + aMissing.length, oChange: oClean, oContext, oById, sDescription: describeBulkChange(oClean, oContext) };
}

export async function previewBulkEdit(oProject, aIssueIds, oChange, oLookups = {}) {
  const { aRows, iChange, iSkip, iBlocked, oChange: oClean, sDescription } = await buildBulkPlan(oProject, aIssueIds, oChange, oLookups);
  return { aRows, iChange, iSkip, iBlocked, oChange: oClean, sDescription };
}

function applyBulkChange(oIssue, oChange, oContext) {
  const oOptions = { bNotify: false };
  switch (oChange.sField) {
    case 'status': return transitionIssue(oIssue, oChange.value, null, oChange.iResolution ? { iResolution: oChange.iResolution } : {}, oOptions);
    case 'assignee': return updateIssue(oIssue, { sAssigneeId: oChange.value, sAssigneeName: oContext.sAssigneeName }, oOptions);
    case 'priority': return updateIssue(oIssue, { iPriority: oChange.value }, oOptions);
    case 'sprint': return updateIssue(oIssue, { sSprintId: oChange.value }, oOptions);
    case 'dueDate': return updateIssue(oIssue, { sDueDate: oChange.value }, oOptions);
    default: return updateIssue(oIssue, { aLabels: [...oIssue.aLabels.map((oLabel) => oLabel.sName), oChange.value] }, oOptions);
  }
}

const bulkErrorMessage = (oError) => (oError && oError.details && typeof Object.values(oError.details)[0] === 'string' ? Object.values(oError.details)[0] : toFriendlyMessage(oError));

export async function applyBulkEdit(oProject, aIssueIds, oChange, oLookups = {}) {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  if (!getProjectPermissions(await getMyMembership(oProject.sId)).bCanEdit) throw createDomainError(ERROR_CODES.permissionDenied, 'Only leads and contributors can bulk edit issues.');
  const oPlan = await buildBulkPlan(oProject, aIssueIds, oChange, oLookups);
  const oResults = new Map();
  const aChanged = [];
  await runInBatches(oPlan.aRows.filter((oRow) => oRow.sOutcome === 'change'), async (oRow) => {
    try {
      const { oIssue } = await applyBulkChange(oPlan.oById.get(oRow.sIssueId), oPlan.oChange, oPlan.oContext);
      aChanged.push(oIssue);
      oResults.set(oRow.sIssueId, { ...oRow, sOutcome: 'success' });
    } catch (oError) {
      oResults.set(oRow.sIssueId, { ...oRow, sOutcome: 'failed', sReason: bulkErrorMessage(oError) });
    }
  });
  const aResults = oPlan.aRows.map((oRow) => oResults.get(oRow.sIssueId) || { ...oRow, sOutcome: oRow.sOutcome === 'skip' ? 'skipped' : 'failed' });
  if (aChanged.length) await sendNotifications(oProject.sId, null, planBulkNotifications(aChanged, oPlan.sDescription));
  return {
    aResults, sDescription: oPlan.sDescription,
    iSucceeded: aResults.filter((oRow) => oRow.sOutcome === 'success').length,
    iFailed: aResults.filter((oRow) => oRow.sOutcome === 'failed').length,
    iSkipped: aResults.filter((oRow) => oRow.sOutcome === 'skipped').length,
  };
}

// ── Attachments (Phase 3) ──────────────────────────────────────
// Files live in a Dataverse file column, so every download goes through the signed-in user's Dataverse access.
// Pira never creates public or anonymous links.

export async function listAttachments(sIssueId) {
  const { aRows } = await queryPage(TABLES.attachments, {
    sFilter: `_wd_issue_value eq ${assertGuid(sIssueId, 'issue')}`, aSelect: ATTACHMENT_SELECT, aOrderBy: ['createdon desc'], iPageSize: PAGING.attachments,
  });
  return aRows.map(mapAttachment);
}

// oFile is a browser File (name, size, type, arrayBuffer()). The metadata row is removed again if the upload fails.
export async function uploadAttachment(oIssue, oFile) {
  if (oIssue.bArchived) throw createDomainError(ERROR_CODES.issueArchived);
  const sName = sanitiseFileName(oFile && oFile.name);
  const iExisting = await countRows(TABLES.attachments, `_wd_issue_value eq ${assertGuid(oIssue.sId, 'issue')}`, 'wd_issueattachmentid');
  const sError = validateAttachment({ sName, iSize: oFile ? Number(oFile.size) : 0 }, iExisting);
  if (sError) throw createDomainError(ERROR_CODES.attachmentRejected, sError);
  const aBytes = new Uint8Array(await oFile.arrayBuffer());
  const sId = newId();
  const sContentType = truncateText(String(oFile.type || 'application/octet-stream'), 100);
  await createItem(TABLES.attachments.set, TABLES.attachments.key, {
    wd_issueattachmentid: sId, wd_name: sName, wd_filesize: aBytes.byteLength, wd_contenttype: sContentType,
    ...(await bindLookup(TABLES.attachments, 'wd_issue', TABLES.issues, oIssue.sId)),
  });
  try {
    const oResult = await oClient.uploadFileToRecord(TABLES.attachments.set, sId, ATTACHMENT_FILE_COLUMN, sName, aBytes);
    if (!oResult || oResult.success === false) throw new Error((oResult && oResult.error && oResult.error.message) || 'Upload failed.');
  } catch (oError) {
    await deleteItem(TABLES.attachments.set, TABLES.attachments.key, sId).catch(() => {});
    throw oError;
  }
  const oUser = await getCurrentUser();
  const bHistorySaved = await writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'attachments', sOldValue: '', sNewValue: `Added ${sName}` }], 'AddAttachment');
  return {
    oAttachment: { sId, sIssueId: oIssue.sId, sName, iSize: aBytes.byteLength, sContentType, sUploaderId: oUser.sId, sUploaderName: oUser.sName, sCreatedOn: nowIso() },
    bHistorySaved,
  };
}

function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string') return Uint8Array.from(atob(data), (sChar) => sChar.charCodeAt(0));
  throw new Error('The file came back in an unexpected format.');
}

// Returns bytes only; the UI saves them through a short-lived local object URL.
export async function downloadAttachment(oAttachment) {
  let oResult;
  try {
    oResult = await oClient.downloadFileFromRecord(TABLES.attachments.set, assertGuid(oAttachment.sId, 'attachment'), ATTACHMENT_FILE_COLUMN);
  } catch (oError) {
    oResult = { success: false, error: oError };
  }
  if (!oResult || oResult.success === false || !oResult.data) {
    const oError = (oResult && oResult.error) || null;
    if (isPermissionError(oError)) throw createDomainError(ERROR_CODES.permissionDenied);
    throw createDomainError(ERROR_CODES.attachmentNotFound);
  }
  return { aBytes: toBytes(oResult.data), sName: sanitiseFileName(oAttachment.sName) };
}

// Uploaders delete their own files (the security role grants Delete at User level only).
export async function deleteAttachment(oIssue, oAttachment) {
  const oUser = await getCurrentUser();
  if (oAttachment.sUploaderId !== oUser.sId) throw createDomainError(ERROR_CODES.permissionDenied, 'Only the person who attached a file can delete it.');
  await deleteItem(TABLES.attachments.set, TABLES.attachments.key, assertGuid(oAttachment.sId, 'attachment'));
  return writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'attachments', sOldValue: oAttachment.sName, sNewValue: `Removed ${oAttachment.sName}` }], 'DeleteAttachment');
}

// ── Custom fields (Phase 3) ────────────────────────────────────
// Text, number, date, yes/no and single choice only. A field's type never changes after creation.

export async function listCustomFields(sProjectId, bIncludeInactive = false) {
  const aFields = await cached(`customfields:${sProjectId}`, async () => {
    const aRows = await queryAll(TABLES.customFields, {
      sFilter: `_wd_project_value eq ${assertGuid(sProjectId, 'project')}`, aSelect: CUSTOM_FIELD_SELECT, iPageSize: PAGING.customFields,
    });
    return aRows.map(mapCustomField).sort((oA, oB) => oA.iOrder - oB.iOrder || oA.sName.localeCompare(oB.sName));
  });
  return bIncludeInactive ? aFields : aFields.filter((oField) => oField.bActive);
}

const customFieldPayload = (oDraft) => ({
  wd_name: String(oDraft.sName).trim(),
  wd_options: (getCustomFieldType(oDraft.iType) || {}).key === 'choice' ? parseChoiceOptions(oDraft.sOptions).join('\n') : '',
  wd_issuetypes: [...new Set((oDraft.aIssueTypes || []).map(Number))].join(','),
  wd_fielddescription: String(oDraft.sDescription || '').trim(),
});

function assertUniqueFieldName(aFields, sName, sExceptId = '') {
  if (aFields.some((oField) => oField.sId !== sExceptId && oField.sName.toLowerCase() === String(sName).trim().toLowerCase())) {
    throw createDomainError(ERROR_CODES.validation, '', { sName: 'Another field in this project already uses that name.' });
  }
}

function assertFieldCapacity(aFields) {
  if (aFields.filter((oField) => oField.bActive).length >= LIMITS.customFieldsPerProject) {
    throw createDomainError(ERROR_CODES.validation, `A project can have up to ${LIMITS.customFieldsPerProject} active custom fields.`);
  }
}

export async function createCustomField(oProject, oDraft) {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const { bValid, oErrors } = validateCustomFieldDraft(oDraft);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  await assertLead(oProject.sId, 'Only project leads can add custom fields.');
  const aFields = await listCustomFields(oProject.sId, true);
  assertUniqueFieldName(aFields, oDraft.sName);
  assertFieldCapacity(aFields);
  const sId = newId();
  await createItem(TABLES.customFields.set, TABLES.customFields.key, {
    wd_customfieldid: sId, ...customFieldPayload(oDraft), wd_fieldtype: Number(oDraft.iType), wd_order: aFields.length, wd_active: true,
    ...(await bindLookup(TABLES.customFields, 'wd_project', TABLES.projects, oProject.sId)),
  });
  invalidateCache(`customfields:${oProject.sId}`);
  return (await listCustomFields(oProject.sId, true)).find((oField) => oField.sId === sId) || null;
}

// oChanges: sName, sOptions, aIssueTypes, sDescription, iOrder, bActive. iType is ignored (values may already exist).
export async function updateCustomField(oProject, oField, oChanges) {
  const oNext = { ...oField, ...oChanges, iType: oField.iType };
  const { bValid, oErrors } = validateCustomFieldDraft(oNext);
  if (!bValid) throw createDomainError(ERROR_CODES.validation, '', oErrors);
  await assertLead(oProject.sId, 'Only project leads can change custom fields.');
  const aFields = await listCustomFields(oProject.sId, true);
  assertUniqueFieldName(aFields, oNext.sName, oField.sId);
  if (oChanges.bActive === true && !oField.bActive) assertFieldCapacity(aFields);
  await updateItem(TABLES.customFields.set, TABLES.customFields.key, assertGuid(oField.sId, 'custom field'), {
    ...customFieldPayload(oNext),
    ...(oChanges.bActive !== undefined ? { wd_active: Boolean(oChanges.bActive) } : {}),
    ...(oChanges.iOrder !== undefined ? { wd_order: Number(oChanges.iOrder) } : {}),
  });
  invalidateCache(`customfields:${oProject.sId}`);
  return (await listCustomFields(oProject.sId, true)).find((oItem) => oItem.sId === oField.sId) || null;
}

function customValueOf(oField, oRow) {
  if (!oRow) return null;
  switch ((getCustomFieldType(oField.iType) || {}).key) {
    case 'number': return oRow.wd_numbervalue === null || oRow.wd_numbervalue === undefined ? null : Number(oRow.wd_numbervalue);
    case 'date': return oRow.wd_datevalue ? String(oRow.wd_datevalue).slice(0, 10) : null;
    case 'boolean': return typeof oRow.wd_booleanvalue === 'boolean' ? oRow.wd_booleanvalue : null;
    default: return oRow.wd_textvalue || null;
  }
}

// Only the column for the field's type is filled; the value plug-in rejects anything else.
function customValueColumns(oField, value) {
  const sKey = (getCustomFieldType(oField.iType) || {}).key;
  return {
    wd_textvalue: sKey === 'text' || sKey === 'choice' ? value : null,
    wd_numbervalue: sKey === 'number' ? value : null,
    wd_datevalue: sKey === 'date' ? value : null,
    wd_booleanvalue: sKey === 'boolean' ? value : null,
  };
}

async function listCustomValueRows(sIssueId) {
  const { aRows } = await queryPage(TABLES.customFieldValues, {
    sFilter: `_wd_issue_value eq ${assertGuid(sIssueId, 'issue')}`, aSelect: CUSTOM_VALUE_SELECT, iPageSize: PAGING.customFields,
  });
  return aRows;
}

// aFields includes inactive fields (so stored values keep their names); the panel shows active ones for the issue type.
export async function getIssueCustomFields(oIssue) {
  const [aFields, aRows] = await Promise.all([listCustomFields(oIssue.sProjectId, true), listCustomValueRows(oIssue.sId)]);
  const oValues = Object.fromEntries(aFields.map((oField) => [oField.sId, customValueOf(oField, aRows.find((oRow) => oRow._wd_customfield_value === oField.sId))]));
  return { aFields, oValues };
}

async function prepareCustomValues(oIssue, iIssueType, oRawValues) {
  const [aFields, aRows] = await Promise.all([listCustomFields(oIssue.sProjectId, true), listCustomValueRows(oIssue.sId)]);
  const oErrors = {};
  const aWrites = [];
  Object.entries(oRawValues).forEach(([sFieldId, rawValue]) => {
    const sErrorKey = `custom:${sFieldId}`;
    const oField = aFields.find((oItem) => oItem.sId === sFieldId);
    if (!oField || !oField.bActive) { oErrors[sErrorKey] = 'That custom field is no longer available.'; return; }
    const { value, sError } = normaliseCustomFieldValue(oField, rawValue);
    if (sError) { oErrors[sErrorKey] = sError; return; }
    if (value !== null && !customFieldAppliesTo(oField, iIssueType)) { oErrors[sErrorKey] = `${oField.sName} isn't used for ${getIssueType(iIssueType).label} issues.`; return; }
    const oRow = aRows.find((oItem) => oItem._wd_customfield_value === sFieldId) || null;
    const oldValue = customValueOf(oField, oRow);
    if (String(oldValue ?? '') !== String(value ?? '')) aWrites.push({ oField, oRow, value, oldValue });
  });
  if (Object.keys(oErrors).length) throw createDomainError(ERROR_CODES.invalidCustomFieldValue, Object.values(oErrors)[0], oErrors);
  const aHistory = aWrites.map(({ oField, value, oldValue }) => ({
    iEvent: HISTORY_EVENTS.fieldChanged, sField: truncateText(`cf:${oField.sName}`, 100),
    sOldValue: formatCustomFieldValue(oField, oldValue) || 'None', sNewValue: formatCustomFieldValue(oField, value) || 'None',
  }));
  return { aWrites, aHistory };
}

async function writeCustomValues(oIssue, { aWrites }) {
  const oIssueBinding = aWrites.some((oWrite) => !oWrite.oRow) ? await bindLookup(TABLES.customFieldValues, 'wd_issue', TABLES.issues, oIssue.sId) : {};
  await runInBatches(aWrites, async ({ oField, oRow, value }) => (oRow
    ? updateItem(TABLES.customFieldValues.set, TABLES.customFieldValues.key, oRow.wd_customfieldvalueid, customValueColumns(oField, value))
    : createItem(TABLES.customFieldValues.set, TABLES.customFieldValues.key, {
      wd_customfieldvalueid: newId(), wd_name: truncateText(`${oIssue.sKey} · ${oField.sName}`, 100), ...customValueColumns(oField, value), ...oIssueBinding,
      ...(await bindLookup(TABLES.customFieldValues, 'wd_customfield', TABLES.customFields, oField.sId)),
    })));
}

// ── Versions / releases (Phase 4) ──────────────────────────────
// Leads manage versions (plug-ins 32–33 enforce it). An issue has at most one fix version from its own project.

const mapVersion = (oRow) => ({
  sId: oRow.wd_versionid,
  sName: oRow.wd_name || '',
  sProjectId: oRow._wd_project_value || '',
  sDescription: oRow.wd_versiondescription || '',
  sStartDate: String(oRow.wd_startdate || '').slice(0, 10),
  sReleaseDate: String(oRow.wd_releasedate || '').slice(0, 10),
  iState: Number(oRow.wd_versionstate) || VERSION_STATE.unreleased,
  sReleasedOn: oRow.wd_releasedon || '',
  sCreatedOn: oRow.createdon || '',
});

export async function listVersions(sProjectId) {
  assertFeature('releases');
  return cached(`versions:${sProjectId}`, async () => {
    const aRows = await queryAll(TABLES.versions, {
      sFilter: `_wd_project_value eq ${assertGuid(sProjectId, 'project')}`, aSelect: VERSION_SELECT, iPageSize: PAGING.versions,
    });
    return sortVersions(aRows.map(mapVersion));
  });
}

async function loadVersion(sVersionId) {
  const oRow = await getItem(TABLES.versions.set, TABLES.versions.key, assertGuid(sVersionId, 'version'), VERSION_SELECT);
  if (!oRow) throw createDomainError(ERROR_CODES.versionNotFound);
  return mapVersion(oRow);
}

// Versions an issue can be given: same project and not archived.
async function loadUsableVersion(sVersionId, sProjectId) {
  assertFeature('releases');
  const oVersion = await loadVersion(sVersionId);
  if (oVersion.sProjectId !== sProjectId) throw createDomainError(ERROR_CODES.versionProjectMismatch);
  if (isVersionArchived(oVersion.iState)) throw createDomainError(ERROR_CODES.versionArchived);
  return oVersion;
}

const versionPayload = (oDraft) => ({
  wd_name: String(oDraft.sName).trim(), wd_versiondescription: String(oDraft.sDescription || '').trim(),
  wd_startdate: oDraft.sStartDate || null, wd_releasedate: oDraft.sReleaseDate || null,
});

async function assertVersionDraft(oProject, oDraft, sExceptId = '') {
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  const { bValid, oErrors } = validateVersionDraft(oDraft);
  if (!bValid) throw createDomainError(ERROR_CODES.invalidVersion, Object.values(oErrors)[0], oErrors);
  await assertLead(oProject.sId, 'Only project leads can manage versions.');
  invalidateCache(`versions:${oProject.sId}`);
  if (isVersionNameTaken(await listVersions(oProject.sId), oDraft.sName, sExceptId)) {
    throw createDomainError(ERROR_CODES.versionNameTaken, '', { sName: 'Another version in this project already uses that name.' });
  }
}

export async function createVersion(oProject, oDraft) {
  assertFeature('releases');
  await assertVersionDraft(oProject, oDraft);
  const sId = newId();
  await createItem(TABLES.versions.set, TABLES.versions.key, {
    wd_versionid: sId, ...versionPayload(oDraft), wd_versionstate: VERSION_STATE.unreleased,
    ...(await bindLookup(TABLES.versions, 'wd_project', TABLES.projects, oProject.sId)),
  });
  invalidateCache(`versions:${oProject.sId}`);
  return loadVersion(sId);
}

export async function updateVersion(oProject, oVersion, oChanges) {
  assertFeature('releases');
  const oNext = { ...oVersion, ...oChanges };
  await assertVersionDraft(oProject, oNext, oVersion.sId);
  await updateItem(TABLES.versions.set, TABLES.versions.key, assertGuid(oVersion.sId, 'version'), versionPayload(oNext));
  invalidateCache(`versions:${oProject.sId}`);
  return loadVersion(oVersion.sId);
}

// Progress for every version from one query (issues with a fix version, archived issues left out).
export async function getVersionProgress(oProject) {
  assertFeature('releases');
  const aRows = await queryAll(TABLES.issues, {
    sFilter: `_wd_project_value eq ${assertGuid(oProject.sId)} and _wd_fixversion_value ne null and (wd_archived eq false or wd_archived eq null)`,
    aSelect: METRIC_SELECT, iPageSize: PAGING.sprintMetrics,
  });
  const oByVersion = new Map();
  aRows.map(mapIssue).forEach((oIssue) => oByVersion.set(oIssue.sFixVersionId, [...(oByVersion.get(oIssue.sFixVersionId) || []), oIssue]));
  return Object.fromEntries([...oByVersion.entries()].map(([sId, aIssues]) => [sId, computeVersionProgress(aIssues)]));
}

async function listVersionIssueRows(sVersionId) {
  const aRows = await queryAll(TABLES.issues, { sFilter: `_wd_fixversion_value eq ${assertGuid(sVersionId)}`, aSelect: METRIC_SELECT, iPageSize: PAGING.sprintMetrics });
  return aRows.map(mapIssue);
}

async function moveIssuesToVersion(aIssues, oTarget, sFromName) {
  let iHistoryFailures = 0;
  const oBinding = await bindLookup(TABLES.issues, 'wd_fixversion', TABLES.versions, oTarget ? oTarget.sId : '');
  await runInBatches(aIssues, async (oIssue) => {
    await updateItem(TABLES.issues.set, TABLES.issues.key, oIssue.sId, oBinding);
    if (!bServerPlugins) {
      const bSaved = await writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'fixVersion', sOldValue: sFromName, sNewValue: oTarget ? oTarget.sName : 'None' }], 'ReleaseVersion');
      if (!bSaved) iHistoryFailures += 1;
    }
  });
  return iHistoryFailures === 0;
}

// Not one transaction: unfinished issues move first, then the version is marked released. Releasing again finishes the job.
// sDestination: 'keep' (leave them), 'none' (clear their fix version) or an unreleased version id.
export async function releaseVersion(oProject, oVersion, { sDestination = '', sReleaseDate = '' } = {}) {
  assertFeature('releases');
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  await assertLead(oProject.sId, 'Only project leads can release versions.');
  const oFresh = await loadVersion(oVersion.sId);
  if (oFresh.iState !== VERSION_STATE.unreleased) throw createDomainError(ERROR_CODES.validation, 'Only unreleased versions can be released.');
  if (sReleaseDate && !isValidDateOnly(sReleaseDate)) throw createDomainError(ERROR_CODES.validation, '', { sReleaseDate: 'Enter a valid date.' });
  const { aMove, sTargetVersionId } = planVersionRelease(await listVersionIssueRows(oFresh.sId), sDestination, oFresh.sId);
  let oTarget = null;
  if (aMove.length && sTargetVersionId) {
    oTarget = await loadUsableVersion(sTargetVersionId, oProject.sId);
    if (oTarget.iState !== VERSION_STATE.unreleased) throw createDomainError(ERROR_CODES.validation, 'Move unfinished issues to an unreleased version.');
  }
  const bHistorySaved = aMove.length ? await moveIssuesToVersion(aMove, oTarget, oFresh.sName) : true;
  await updateItem(TABLES.versions.set, TABLES.versions.key, oFresh.sId, {
    wd_versionstate: VERSION_STATE.released, wd_releasedon: nowIso(), wd_releasedate: sReleaseDate || oFresh.sReleaseDate || toDateOnly(new Date()),
  });
  invalidateCache(`versions:${oProject.sId}`);
  return { oVersion: await loadVersion(oFresh.sId), iMoved: aMove.length, bHistorySaved };
}

// Unrelease, archive or restore. Archived versions keep their issues but can't receive new ones.
export async function setVersionState(oProject, oVersion, iState) {
  assertFeature('releases');
  if (!VERSION_STATES.some((oState) => oState.value === Number(iState))) throw createDomainError(ERROR_CODES.validation, 'Choose a version state.');
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  await assertLead(oProject.sId, 'Only project leads can change versions.');
  const oFresh = await loadVersion(oVersion.sId);
  if (oFresh.iState === Number(iState)) return oFresh;
  await updateItem(TABLES.versions.set, TABLES.versions.key, oFresh.sId, {
    wd_versionstate: Number(iState),
    ...(Number(iState) === VERSION_STATE.released && !oFresh.sReleasedOn ? { wd_releasedon: nowIso(), wd_releasedate: oFresh.sReleaseDate || toDateOnly(new Date()) } : {}),
    ...(Number(iState) === VERSION_STATE.unreleased ? { wd_releasedon: null } : {}),
  });
  invalidateCache(`versions:${oProject.sId}`);
  return loadVersion(oFresh.sId);
}

// ── Work logs (Phase 4) ────────────────────────────────────────
// Work logs are never deleted: the author edits or voids them (leads may void), always with history.
// In 'lowcode' mode plug-ins 34–35 validate, recalculate Time Spent and write history in the same transaction.

const mapWorkLog = (oRow) => ({
  sId: oRow.wd_worklogid,
  sIssueId: oRow._wd_issue_value || '',
  iMinutes: Number(oRow.wd_minutes) || 0,
  sWorkDate: String(oRow.wd_workdate || '').slice(0, 10),
  sComment: oRow.wd_workcomment || '',
  bVoided: oRow.wd_voided === true,
  sVoidReason: oRow.wd_voidreason || '',
  sVoidedOn: oRow.wd_voidedon || '',
  sAuthorId: oRow._createdby_value || '',
  sAuthorName: formattedValue(oRow, '_createdby_value') || 'Unknown user',
  sCreatedOn: oRow.createdon || '',
  sModifiedOn: oRow.modifiedon || '',
});

export async function listWorkLogs(sIssueId, sSkipToken = '') {
  assertFeature('timeTracking');
  const { aRows, sNextToken, iCount } = await queryPage(TABLES.workLogs, {
    sFilter: `_wd_issue_value eq ${assertGuid(sIssueId, 'issue')}`, aSelect: WORKLOG_SELECT, aOrderBy: ['wd_workdate desc', 'createdon desc'],
    iPageSize: PAGING.workLogs, sSkipToken, bCount: !sSkipToken,
  });
  return { aWorkLogs: aRows.map(mapWorkLog), sNextToken, iCount };
}

async function assertCanLogWork(oIssue) {
  if (oIssue.bArchived) throw createDomainError(ERROR_CODES.issueArchived);
  const oProject = await getProject(oIssue.sProjectId);
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  if (!getProjectPermissions(await getMyMembership(oIssue.sProjectId), oProject.bArchived).bCanEdit) {
    throw createDomainError(ERROR_CODES.permissionDenied, 'Only leads and contributors can log work.');
  }
}

function assertWorkLogFields(oDraft) {
  const { bValid, oErrors } = validateWorkLog(oDraft, toDateOnly(new Date()));
  if (!bValid) throw createDomainError(ERROR_CODES.invalidWorkLog, Object.values(oErrors)[0], oErrors);
}

// Client mode only: the plug-ins own this in 'lowcode' mode.
async function recalculateTimeSpent(sIssueId) {
  const aRows = await queryAll(TABLES.workLogs, {
    sFilter: `_wd_issue_value eq ${assertGuid(sIssueId)} and (wd_voided eq false or wd_voided eq null)`, aSelect: ['wd_worklogid', 'wd_minutes'], iPageSize: 500,
  });
  const iTotal = aRows.reduce((iSum, oRow) => iSum + (Number(oRow.wd_minutes) || 0), 0);
  await updateItem(TABLES.issues.set, TABLES.issues.key, sIssueId, { wd_timespent: iTotal });
  return iTotal;
}

async function afterWorkLogChange(oIssue, oHistory, sOperation) {
  if (bServerPlugins) return true;
  await recalculateTimeSpent(oIssue.sId);
  return writeHistory(oIssue, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: 'worklog', ...oHistory }], sOperation);
}

// oDraft: { iMinutes, sWorkDate, sComment, iRemainingEstimate? }. Remaining defaults to Jira's "adjust automatically".
// Two writes: the log, then (if it changed) the remaining estimate. A failed second write is reported, not rolled back.
export async function logWork(oIssue, oDraft) {
  assertFeature('timeTracking');
  assertWorkLogFields(oDraft);
  if (oDraft.iRemainingEstimate !== undefined && oDraft.iRemainingEstimate !== null && !isValidEstimate(oDraft.iRemainingEstimate)) {
    throw createDomainError(ERROR_CODES.validation, '', { iRemainingEstimate: 'Enter a valid remaining estimate.' });
  }
  const oFresh = await getIssue(oIssue.sId);
  await assertCanLogWork(oFresh);
  const sId = newId();
  const sComment = String(oDraft.sComment || '').trim();
  await createItem(TABLES.workLogs.set, TABLES.workLogs.key, {
    wd_worklogid: sId, wd_name: truncateText(`${oFresh.sKey} · ${formatDuration(oDraft.iMinutes)}`, 100),
    wd_minutes: oDraft.iMinutes, wd_workdate: oDraft.sWorkDate, wd_workcomment: sComment, wd_voided: false,
    ...(await bindLookup(TABLES.workLogs, 'wd_issue', TABLES.issues, oFresh.sId)),
    ...(await bindLookup(TABLES.workLogs, 'wd_project', TABLES.projects, oFresh.sProjectId)),
  });
  const bHistorySaved = await afterWorkLogChange(oFresh, { sOldValue: '', sNewValue: `Logged ${formatDuration(oDraft.iMinutes)} on ${formatDateOnly(oDraft.sWorkDate)}` }, 'LogWork');
  const iRemaining = oDraft.iRemainingEstimate !== undefined ? oDraft.iRemainingEstimate : remainingAfterLog(oFresh, oDraft.iMinutes);
  let bRemainingSaved = true;
  if (iRemaining !== (oFresh.iRemainingEstimate ?? null)) {
    try {
      await updateIssue(await getIssue(oFresh.sId), { iRemainingEstimate: iRemaining }, { bNotify: false });
    } catch (oError) {
      console.warn('Pira: the remaining estimate could not be updated', oError);
      bRemainingSaved = false;
    }
  }
  const oUser = await getCurrentUser();
  return {
    oWorkLog: { sId, sIssueId: oFresh.sId, iMinutes: oDraft.iMinutes, sWorkDate: oDraft.sWorkDate, sComment, bVoided: false, sVoidReason: '', sVoidedOn: '', sAuthorId: oUser.sId, sAuthorName: oUser.sName, sCreatedOn: nowIso(), sModifiedOn: nowIso() },
    oIssue: await getIssue(oFresh.sId), bHistorySaved, bRemainingSaved,
  };
}

async function loadWorkLog(sWorkLogId) {
  const oRow = await getItem(TABLES.workLogs.set, TABLES.workLogs.key, assertGuid(sWorkLogId, 'work log'), WORKLOG_SELECT);
  if (!oRow) throw createDomainError(ERROR_CODES.workLogNotFound);
  return mapWorkLog(oRow);
}

export async function updateWorkLog(oIssue, oWorkLog, oChanges) {
  assertFeature('timeTracking');
  const [oUser, oFresh] = await Promise.all([getCurrentUser(), loadWorkLog(oWorkLog.sId)]);
  if (oFresh.bVoided) throw createDomainError(ERROR_CODES.workLogLocked);
  if (oFresh.sAuthorId !== oUser.sId) throw createDomainError(ERROR_CODES.permissionDenied, 'Only the person who logged the work can change it.');
  const oNext = { iMinutes: oFresh.iMinutes, sWorkDate: oFresh.sWorkDate, sComment: oFresh.sComment, ...oChanges };
  assertWorkLogFields(oNext);
  await assertCanLogWork(oIssue);
  await updateItem(TABLES.workLogs.set, TABLES.workLogs.key, oFresh.sId, {
    wd_minutes: oNext.iMinutes, wd_workdate: oNext.sWorkDate, wd_workcomment: String(oNext.sComment || '').trim(),
    wd_name: truncateText(`${oIssue.sKey} · ${formatDuration(oNext.iMinutes)}`, 100),
  });
  const bHistorySaved = await afterWorkLogChange(oIssue, { sOldValue: `${formatDuration(oFresh.iMinutes)} on ${formatDateOnly(oFresh.sWorkDate)}`, sNewValue: `${formatDuration(oNext.iMinutes)} on ${formatDateOnly(oNext.sWorkDate)}` }, 'EditWorkLog');
  return { oWorkLog: await loadWorkLog(oFresh.sId), oIssue: await getIssue(oIssue.sId), bHistorySaved };
}

// Authors void their own logs; project leads may void anyone's. Voided logs stay visible and no longer count.
export async function voidWorkLog(oIssue, oWorkLog, sReason) {
  assertFeature('timeTracking');
  const sError = validateVoidReason(sReason);
  if (sError) throw createDomainError(ERROR_CODES.validation, sError, { sReason: sError });
  const [oUser, oFresh, oMembership] = await Promise.all([getCurrentUser(), loadWorkLog(oWorkLog.sId), getMyMembership(oIssue.sProjectId)]);
  if (oFresh.bVoided) throw createDomainError(ERROR_CODES.workLogLocked);
  if (oFresh.sAuthorId !== oUser.sId && !getProjectPermissions(oMembership).bCanManage) {
    throw createDomainError(ERROR_CODES.permissionDenied, 'Only the person who logged the work, or a project lead, can void it.');
  }
  await assertCanLogWork(oIssue);
  const sText = String(sReason).trim();
  await updateItem(TABLES.workLogs.set, TABLES.workLogs.key, oFresh.sId, { wd_voided: true, wd_voidreason: sText, wd_voidedon: nowIso() });
  const bHistorySaved = await afterWorkLogChange(oIssue, { sOldValue: `${formatDuration(oFresh.iMinutes)} on ${formatDateOnly(oFresh.sWorkDate)}`, sNewValue: truncateText(`Voided: ${sText}`) }, 'VoidWorkLog');
  return { oWorkLog: await loadWorkLog(oFresh.sId), oIssue: await getIssue(oIssue.sId), bHistorySaved };
}

// ── Analytics (Phase 4) ────────────────────────────────────────
// Read-only and run as the signed-in user, so figures only include issues they can read. Archived issues are left out.

export async function getAnalytics(oProject, { iWeeks = ANALYTICS.iDefaultWeeks } = {}) {
  assertFeature('analytics');
  if (!ANALYTICS.aWindows.includes(Number(iWeeks))) throw createDomainError(ERROR_CODES.validation, 'Choose a reporting window.');
  const oNow = new Date();
  const sStart = buildWeekBuckets(oNow, Number(iWeeks))[0].sStartIso;
  const sProject = `_wd_project_value eq ${assertGuid(oProject.sId)} and (wd_archived eq false or wd_archived eq null)`;
  const fnQuery = (sFilter) => queryAll(TABLES.issues, { sFilter, aSelect: ANALYTICS_SELECT, iPageSize: 500 }, ANALYTICS.iMaxRows);
  const [aResolved, aDueDated, aOpen, aSprints] = await Promise.all([
    fnQuery(`${sProject} and wd_resolvedon ge ${sStart}`),
    fnQuery(`${sProject} and wd_duedate ne null and wd_duedate lt ${toDateOnly(oNow)} and (wd_resolvedon eq null or wd_resolvedon ge ${sStart})`),
    fnQuery(buildIssueFilter({ sProjectId: oProject.sId, bOpenOnly: true })),
    listSprints(oProject.sId),
  ]);
  const fnMap = (aRows) => aRows.map(mapIssue);
  return {
    ...buildAnalytics({ aResolved: fnMap(aResolved), aDueDated: fnMap(aDueDated), aOpen: fnMap(aOpen), aSprints }, oNow, Number(iWeeks)),
    bTruncated: [aResolved, aDueDated, aOpen].some((aRows) => aRows.length >= ANALYTICS.iMaxRows),
    sGeneratedOn: oNow.toISOString(),
  };
}

// ── CSV import / export (Phase 4) ──────────────────────────────

async function attachLabelsInSteps(aIssues) {
  for (let iIndex = 0; iIndex < aIssues.length; iIndex += 100) await attachLabels(aIssues.slice(iIndex, iIndex + 100));
  return aIssues;
}

// Exports exactly what the criteria return for the signed-in user (same filter as the Issues list), capped.
export async function exportIssues(oProject, oCriteria, aOrderBy = ['modifiedon desc']) {
  assertFeature('csv');
  const oScoped = { ...oCriteria, sProjectId: oProject.sId };
  const aRows = await queryAll(TABLES.issues, {
    sFilter: buildIssueFilter(oScoped, await criteriaContext(oScoped)), aSelect: ISSUE_SELECT, aOrderBy, iPageSize: PAGING.exportPage,
  }, LIMITS.csvExportMax + 1);
  const bTruncated = aRows.length > LIMITS.csvExportMax;
  const aIssues = await attachLabelsInSteps(aRows.slice(0, LIMITS.csvExportMax).map(mapIssue));
  return { sCsv: issuesToCsv(aIssues), iCount: aIssues.length, bTruncated, sFileName: `${oProject.sKey}-issues-${toDateOnly(new Date())}.csv` };
}

// Members with their email addresses, so CSV assignees can be matched by email or exact name.
async function listMemberContacts(sProjectId) {
  const aMembers = await listMembers(sProjectId);
  const aIds = [...new Set(aMembers.map((oMember) => oMember.sUserId).filter(isGuid))];
  const aChunks = [];
  for (let iIndex = 0; iIndex < aIds.length; iIndex += 20) aChunks.push(aIds.slice(iIndex, iIndex + 20));
  const aResults = await Promise.all(aChunks.map((aChunk) => queryPage(TABLES.users, {
    sFilter: aChunk.map((sId) => `systemuserid eq ${assertGuid(sId)}`).join(' or '), aSelect: ['systemuserid', 'internalemailaddress'], iPageSize: 20,
  })));
  const oEmails = new Map(aResults.flatMap((oResult) => oResult.aRows).map((oRow) => [oRow.systemuserid, oRow.internalemailaddress || '']));
  return aMembers.map((oMember) => ({ ...oMember, sEmail: oEmails.get(oMember.sUserId) || '' }));
}

async function planImport(oProject, sCsv) {
  assertFeature('csv');
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  if (String(sCsv || '').length > LIMITS.csvImportBytes) throw createDomainError(ERROR_CODES.validation, `Import files can be up to ${Math.round(LIMITS.csvImportBytes / 1024)} KB.`);
  if (!getProjectPermissions(await getMyMembership(oProject.sId), oProject.bArchived).bCanEdit) throw createDomainError(ERROR_CODES.permissionDenied, 'Only leads and contributors can import issues.');
  const [aMembers, aVersions] = await Promise.all([listMemberContacts(oProject.sId), isFeatureEnabled('releases') ? listVersions(oProject.sId) : Promise.resolve([])]);
  return planCsvImport(sCsv, { sProjectId: oProject.sId, aMembers, aVersions });
}

// Dry run: nothing is written.
export async function previewCsvImport(oProject, sCsv) {
  return planImport(oProject, sCsv);
}

// Re-plans from the file (never trusts an edited preview), then creates rows one at a time in file order.
// aOnlyLines limits the run to those line numbers (used to retry failures). fnProgress(iDone, iTotal) is optional.
export async function importCsvIssues(oProject, sCsv, { aOnlyLines = null, fnProgress = null } = {}) {
  const oPlan = await planImport(oProject, sCsv);
  if (oPlan.sError) throw createDomainError(ERROR_CODES.validation, oPlan.sError);
  const aTargets = oPlan.aRows.filter((oRow) => oRow.sOutcome === 'create' && (!aOnlyLines || aOnlyLines.includes(oRow.iLine)));
  const aResults = [];
  for (const oRow of aTargets) {
    try {
      const { oIssue } = await createIssue(oProject, oRow.oDraft);
      aResults.push({ iLine: oRow.iLine, sSummary: oRow.sSummary, sOutcome: 'success', sKey: oIssue.sKey, sReason: '' });
    } catch (oError) {
      aResults.push({ iLine: oRow.iLine, sSummary: oRow.sSummary, sOutcome: 'failed', sKey: '', sReason: oError.details && typeof Object.values(oError.details)[0] === 'string' ? Object.values(oError.details)[0] : toFriendlyMessage(oError) });
    }
    if (fnProgress) fnProgress(aResults.length, aTargets.length);
  }
  return {
    aResults, iSucceeded: aResults.filter((oRow) => oRow.sOutcome === 'success').length, iFailed: aResults.filter((oRow) => oRow.sOutcome === 'failed').length,
    iSkipped: oPlan.iError,
  };
}

// ── Dependencies (Phase 4) ─────────────────────────────────────
// sScope: 'open' (open issues), 'sprint', 'version' or 'epic' (its children) with sScopeId. Links to issues outside the scope
// are shown as external nodes, capped.

function dependencyCriteria(oProject, sScope, sScopeId) {
  switch (sScope) {
    case 'sprint': return { sProjectId: oProject.sId, sSprintId: assertGuid(sScopeId, 'sprint') };
    case 'version': return { sProjectId: oProject.sId, sFixVersionId: assertGuid(sScopeId, 'version') };
    case 'epic': return { sProjectId: oProject.sId, sParentId: assertGuid(sScopeId, 'epic') };
    default: return { sProjectId: oProject.sId, bOpenOnly: true };
  }
}

async function listLinksTouching(aIds) {
  const aChunks = [];
  for (let iIndex = 0; iIndex < aIds.length; iIndex += 20) aChunks.push(aIds.slice(iIndex, iIndex + 20));
  const aRows = [];
  for (let iIndex = 0; iIndex < aChunks.length; iIndex += WRITE_BATCH_SIZE) {
    const aResults = await Promise.all(aChunks.slice(iIndex, iIndex + WRITE_BATCH_SIZE).map((aChunk) => queryAll(TABLES.issueLinks, {
      sFilter: aChunk.flatMap((sId) => [`_wd_fromissue_value eq ${assertGuid(sId)}`, `_wd_toissue_value eq ${assertGuid(sId)}`]).join(' or '),
      aSelect: LINK_SELECT, iPageSize: 500,
    }, 2000)));
    aRows.push(...aResults.flat());
  }
  const oSeen = new Set();
  return aRows.map(mapLink).filter((oLink) => (oSeen.has(oLink.sId) ? false : oSeen.add(oLink.sId)));
}

export async function getDependencyGraph(oProject, { sScope = 'open', sScopeId = '', bIncludeRelated = false } = {}) {
  assertFeature('dependencies');
  const oCriteria = dependencyCriteria(oProject, sScope, sScopeId);
  const aRows = await queryAll(TABLES.issues, {
    sFilter: buildIssueFilter(oCriteria), aSelect: ISSUE_SELECT, aOrderBy: ['wd_rank asc'], iPageSize: 200,
  }, LIMITS.dependencyIssuesMax + 1);
  const bTruncated = aRows.length > LIMITS.dependencyIssuesMax;
  const aIssues = aRows.slice(0, LIMITS.dependencyIssuesMax).map(mapIssue);
  const aIds = aIssues.map((oIssue) => oIssue.sId);
  const aLinks = aIds.length ? (await listLinksTouching(aIds)).filter((oLink) => bIncludeRelated || oLink.iType === LINK_CHOICES[0].iType) : [];
  const aOutside = [...new Set(aLinks.flatMap((oLink) => [oLink.sFromId, oLink.sToId]).filter((sId) => !aIds.includes(sId)))];
  const oExternal = aOutside.length ? await loadIssueSummaries(aOutside.slice(0, LIMITS.dependencyExternalMax)) : new Map();
  const aExternal = [...oExternal.values()].filter((oIssue) => !oIssue.bArchived).map((oIssue) => ({ ...oIssue, bExternal: true }));
  const oGraph = buildDependencyGraph([...aIssues, ...aExternal], aLinks, { bIncludeRelated });
  return { ...oGraph, bTruncated: bTruncated || aOutside.length > LIMITS.dependencyExternalMax, iScopeIssues: aIssues.length };
}

// ── Power Platform solutions (Phase 5) ─────────────────────────
// Environments come from Power Platform for Admins V2 and solutions from the Dataverse connector, both as the signed-in user,
// so people only see what they can already open. One Epic Solution row per epic and stage; unlinking empties the row (never
// deleted) so plug-ins 37–38 check every change.

const EPIC_SOLUTION_SELECT = ['wd_epicsolutionid', '_wd_issue_value', '_wd_project_value', 'wd_stage', 'wd_environmentid', 'wd_environmentname',
  'wd_environmenturl', 'wd_solutionid', 'wd_solutionuniquename', 'wd_solutionname', 'wd_solutionversion', 'wd_solutionmodifiedon', '_modifiedby_value', 'modifiedon'];
const SOLUTION_COLUMNS = 'solutionid,uniquename,friendlyname,version,modifiedon,ismanaged';
const EPIC_SOLUTION_CLEARED = Object.freeze({
  wd_environmentid: null, wd_environmentname: null, wd_environmenturl: null, wd_solutionid: null, wd_solutionuniquename: null,
  wd_solutionname: null, wd_solutionversion: null, wd_solutionmodifiedon: null,
});

const oConnectorLoads = new Map();
function loadConnector(sKey, fnImport) {
  if (!oConnectorLoads.has(sKey)) {
    const oPromise = fnImport();
    oConnectorLoads.set(sKey, oPromise);
    oPromise.catch(() => oConnectorLoads.delete(sKey));
  }
  return oConnectorLoads.get(sKey);
}
const loadAdminConnector = () => loadConnector('powerplatformadminv2', () => import('../connectors/powerplatformadminv2.js'));
const loadDataverseConnector = () => loadConnector('commondataserviceforapps', () => import('../connectors/commondataserviceforapps.js'));

// Connector failures carry raw service text: people get a friendly message, the details go to the console.
function connectorError(oError, sAction) {
  if (oError && oError.code) return oError;
  console.warn(`Pira: ${sAction} failed`, oError);
  return isPermissionError(oError)
    ? createDomainError(ERROR_CODES.permissionDenied, 'You don\'t have access to that in Power Platform. Ask the environment admin for access.')
    : createDomainError(ERROR_CODES.powerPlatformUnavailable);
}

function connectorRows(oResponse) {
  const aRows = Array.isArray(oResponse) ? oResponse : (oResponse && Array.isArray(oResponse.value) ? oResponse.value : null);
  if (!aRows) throw new Error('The connector returned an unexpected response.');
  return aRows;
}

function requireOrganization(oEnvironment) {
  const sOrganization = normaliseDataverseUrl(oEnvironment && oEnvironment.sUrl);
  if (!sOrganization) throw createDomainError(ERROR_CODES.invalidEpicSolution, 'Choose an environment that has Dataverse.');
  return sOrganization;
}

// Every environment with Dataverse that the signed-in user can see, by name. Stops early if the API ignores $top/$skip.
export async function listEnvironments({ bRefresh = false } = {}) {
  assertFeature('powerPlatform');
  if (bRefresh) invalidateCache('pp:environments');
  return cached('pp:environments', async () => {
    try {
      const { ListEnvironmentsForUser } = await loadAdminConnector();
      const oById = new Map();
      const iPageSize = POWER_PLATFORM.iEnvironmentPageSize;
      for (let iPage = 0; iPage < POWER_PLATFORM.iEnvironmentPagesMax; iPage += 1) {
        const aRows = connectorRows(await ListEnvironmentsForUser(POWER_PLATFORM.sEnvironmentApiVersion, undefined, undefined, iPageSize, iPage * iPageSize, undefined));
        const iBefore = oById.size;
        aRows.map(mapEnvironment).filter(Boolean).forEach((oEnvironment) => oById.set(oEnvironment.sId, oEnvironment));
        if (aRows.length !== iPageSize || oById.size === iBefore) break;
      }
      return [...oById.values()].sort((oA, oB) => oA.sName.localeCompare(oB.sName));
    } catch (oError) {
      throw connectorError(oError, 'Listing environments');
    }
  });
}

async function querySolutions(oEnvironment, sFilter, iTop) {
  const sOrganization = requireOrganization(oEnvironment);
  try {
    const { ListRecordsWithOrganization } = await loadDataverseConnector();
    const oResponse = await ListRecordsWithOrganization(sOrganization, 'solutions', undefined, undefined, undefined, undefined,
      SOLUTION_COLUMNS, sFilter, 'friendlyname asc', undefined, undefined, iTop, undefined, undefined);
    return connectorRows(oResponse).map(mapSolution).filter(Boolean);
  } catch (oError) {
    throw connectorError(oError, 'Reading solutions');
  }
}

// Visible solutions whose display or unique name contains sText (filtered server-side, first page by name).
export async function searchSolutions(oEnvironment, sText = '') {
  assertFeature('powerPlatform');
  const sFilter = buildSolutionSearchFilter(sText);
  return cached(`pp:solutions:${requireOrganization(oEnvironment)}:${sFilter}`, () => querySolutions(oEnvironment, sFilter, POWER_PLATFORM.iSolutionSearchTop));
}

// One solution by id or unique name (SchemaName); null when it doesn't exist in that environment.
export async function findSolution(oEnvironment, { sSolutionId = '', sUniqueName = '' } = {}, { bRefresh = false } = {}) {
  assertFeature('powerPlatform');
  const sKey = `pp:solution:${requireOrganization(oEnvironment)}:${buildSolutionLookupFilter({ sSolutionId, sUniqueName })}`;
  if (bRefresh) invalidateCache(sKey);
  const aSolutions = await cached(sKey, () => querySolutions(oEnvironment, buildSolutionLookupFilter({ sSolutionId, sUniqueName }), 1));
  return aSolutions[0] || null;
}

const mapEpicSolution = (oRow) => ({
  sId: oRow.wd_epicsolutionid,
  sIssueId: oRow._wd_issue_value || '',
  sProjectId: oRow._wd_project_value || '',
  iStage: Number(oRow.wd_stage),
  sEnvironmentId: oRow.wd_environmentid || '',
  sEnvironmentName: oRow.wd_environmentname || '',
  sEnvironmentUrl: normaliseDataverseUrl(oRow.wd_environmenturl),
  sSolutionId: String(oRow.wd_solutionid || '').toLowerCase(),
  sSolutionUniqueName: oRow.wd_solutionuniquename || '',
  sSolutionName: oRow.wd_solutionname || '',
  sSolutionVersion: oRow.wd_solutionversion || '',
  sSolutionModifiedOn: oRow.wd_solutionmodifiedon || '',
  sModifiedByName: formattedValue(oRow, '_modifiedby_value'),
  sModifiedOn: oRow.modifiedon || '',
});

// Newest row per stage (the Issue + Stage alternate key normally makes it the only one), in promotion order.
export async function listEpicSolutions(sIssueId, { bRefresh = false } = {}) {
  assertFeature('powerPlatform');
  const sKey = `epicSolutions:${assertGuid(sIssueId, 'issue')}`;
  if (bRefresh) invalidateCache(sKey);
  return cached(sKey, async () => {
    const { aRows } = await queryPage(TABLES.epicSolutions, {
      sFilter: `_wd_issue_value eq ${assertGuid(sIssueId, 'issue')}`, aSelect: EPIC_SOLUTION_SELECT, aOrderBy: ['modifiedon desc'], iPageSize: PAGING.epicSolutions,
    });
    const oByStage = new Map();
    aRows.map(mapEpicSolution).forEach((oLink) => {
      if (isValidSolutionStage(oLink.iStage) && !oByStage.has(oLink.iStage)) oByStage.set(oLink.iStage, oLink);
    });
    return [...oByStage.values()].sort((oA, oB) => oA.iStage - oB.iStage);
  });
}

async function loadEditableEpic(oEpic) {
  const oFresh = await getIssue(oEpic.sId);
  if (!isEpicType(oFresh.iType)) throw createDomainError(ERROR_CODES.invalidEpicSolution, 'Only epics link solutions.');
  if (oFresh.bArchived) throw createDomainError(ERROR_CODES.issueArchived);
  const oProject = await getProject(oFresh.sProjectId);
  if (oProject.bArchived) throw createDomainError(ERROR_CODES.projectArchived);
  if (!getProjectPermissions(await getMyMembership(oFresh.sProjectId), oProject.bArchived).bCanEdit) {
    throw createDomainError(ERROR_CODES.permissionDenied, 'Only leads and contributors can change an epic\'s solutions.');
  }
  return oFresh;
}

async function writeSolutionHistory(oEpic, oStage, oBefore, oAfter, sOperation) {
  if (bServerPlugins) return true;
  return writeHistory(oEpic, [{ iEvent: HISTORY_EVENTS.fieldChanged, sField: `solution:${oStage.key}`, sOldValue: describeEpicSolution(oBefore), sNewValue: describeEpicSolution(oAfter) }], sOperation);
}

// Links (or replaces) one stage's solution. The environment must be one the user can list and the solution is re-read from it,
// so the row stores what really exists there rather than what the browser sent.
export async function linkEpicSolution(oEpic, iStage, oEnvironment, oSolution) {
  assertFeature('powerPlatform');
  const { bValid, oErrors } = validateEpicSolutionDraft({ iStage: Number(iStage), oEnvironment, oSolution });
  if (!bValid) throw createDomainError(ERROR_CODES.invalidEpicSolution, Object.values(oErrors)[0], oErrors);
  const oFresh = await loadEditableEpic(oEpic);
  const oKnown = (await listEnvironments()).find((oItem) => oItem.sId === oEnvironment.sId && oItem.sUrl === normaliseDataverseUrl(oEnvironment.sUrl));
  if (!oKnown) throw createDomainError(ERROR_CODES.invalidEpicSolution, 'Choose one of your Power Platform environments.');
  const oLive = await findSolution(oKnown, { sSolutionId: oSolution.sId }, { bRefresh: true });
  if (!oLive) throw createDomainError(ERROR_CODES.solutionNotFound);
  const oStage = getSolutionStage(iStage);
  const oExisting = (await listEpicSolutions(oFresh.sId, { bRefresh: true })).find((oLink) => oLink.iStage === oStage.value) || null;
  const oColumns = {
    wd_name: truncateText(`${oFresh.sKey} · ${oStage.label}`, 100),
    wd_environmentid: oKnown.sId, wd_environmentname: oKnown.sName, wd_environmenturl: oKnown.sUrl,
    wd_solutionid: oLive.sId, wd_solutionuniquename: oLive.sUniqueName, wd_solutionname: oLive.sName,
    wd_solutionversion: truncateText(oLive.sVersion, LIMITS.solutionVersionMax) || null, wd_solutionmodifiedon: oLive.sModifiedOn || null,
  };
  if (oExisting) {
    await updateItem(TABLES.epicSolutions.set, TABLES.epicSolutions.key, assertGuid(oExisting.sId, 'epic solution'), oColumns);
  } else {
    await createItem(TABLES.epicSolutions.set, TABLES.epicSolutions.key, {
      wd_epicsolutionid: newId(), ...oColumns, wd_stage: oStage.value,
      ...(await bindLookup(TABLES.epicSolutions, 'wd_issue', TABLES.issues, oFresh.sId)),
      ...(await bindLookup(TABLES.epicSolutions, 'wd_project', TABLES.projects, oFresh.sProjectId)),
    });
  }
  const aLinks = await listEpicSolutions(oFresh.sId, { bRefresh: true });
  const oLink = aLinks.find((oItem) => oItem.iStage === oStage.value) || null;
  const bHistorySaved = await writeSolutionHistory(oFresh, oStage, oExisting, oLink, 'LinkSolution');
  return { oLink, aLinks, oSolution: oLive, bHistorySaved };
}

export async function unlinkEpicSolution(oEpic, iStage) {
  assertFeature('powerPlatform');
  const oStage = getSolutionStage(iStage);
  if (!oStage) throw createDomainError(ERROR_CODES.invalidEpicSolution, 'Choose a stage.');
  const oFresh = await loadEditableEpic(oEpic);
  const oExisting = (await listEpicSolutions(oFresh.sId, { bRefresh: true })).find((oLink) => oLink.iStage === oStage.value) || null;
  if (!isLinkedSolution(oExisting)) return { aLinks: await listEpicSolutions(oFresh.sId), bHistorySaved: true };
  await updateItem(TABLES.epicSolutions.set, TABLES.epicSolutions.key, assertGuid(oExisting.sId, 'epic solution'), { ...EPIC_SOLUTION_CLEARED });
  const aLinks = await listEpicSolutions(oFresh.sId, { bRefresh: true });
  const bHistorySaved = await writeSolutionHistory(oFresh, oStage, oExisting, null, 'UnlinkSolution');
  return { aLinks, bHistorySaved };
}

// The linked solution as it is now in its environment (version, modified on); null when it has been deleted there.
export async function getLinkedSolution(oLink, { bRefresh = false } = {}) {
  assertFeature('powerPlatform');
  if (!isLinkedSolution(oLink)) return null;
  return findSolution({ sId: oLink.sEnvironmentId, sUrl: oLink.sEnvironmentUrl }, { sSolutionId: oLink.sSolutionId }, { bRefresh });
}

// A story's solution version against its parent epic's solution in one stage, read live from the environment.
export async function getStoryVersionCheck(oStory, iStage, { bRefresh = false } = {}) {
  assertFeature('powerPlatform');
  if (!isStoryType(oStory.iType)) throw createDomainError(ERROR_CODES.validation, 'Only stories check solution versions.');
  const oStage = getSolutionStage(iStage);
  if (!oStage) throw createDomainError(ERROR_CODES.validation, 'Choose a stage.');
  const oParent = oStory.sParentId ? await getIssue(oStory.sParentId) : null;
  const oEpic = oParent && isEpicType(oParent.iType) ? oParent : null;
  const oLink = oEpic ? (await listEpicSolutions(oEpic.sId, { bRefresh })).find((oItem) => oItem.iStage === oStage.value) || null : null;
  let oSolution = null;
  let sError = '';
  if (isLinkedSolution(oLink)) {
    try {
      oSolution = await getLinkedSolution(oLink, { bRefresh });
    } catch (oError) {
      sError = toFriendlyMessage(oError);
    }
  }
  return {
    oEpic, oLink: isLinkedSolution(oLink) ? oLink : null, oSolution, sError,
    oCheck: buildStoryVersionCheck({ sExpected: oStory.sSolutionVersion, bHasEpic: Boolean(oEpic), oLink, oSolution, bFailed: Boolean(sError) }),
  };
}
