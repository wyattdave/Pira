// Pure domain rules for Pira. No DOM or SDK access so every function is unit-testable in Node.
import {
  ISSUE_TYPES, ISSUE_STATUSES, PRIORITIES, MEMBER_ROLES, WORKFLOW, LIMITS, SPRINT_STATES, SPRINT_STATE, SPRINT_TRANSITIONS, LINK_TYPES,
  RESOLUTIONS, TRANSITION_REQUIREMENTS, PROJECT_TEMPLATES, CUSTOM_FIELD_TYPES, FILTER_VISIBILITY, NOTIFICATION_EVENTS,
  DEFAULT_NOTIFICATION_PREFERENCES, BULK_FIELDS, BLOCKED_ATTACHMENT_EXTENSIONS,
  FEATURES, VERSION_STATES, VERSION_STATE, TIME_TRACKING, QUERY_FIELDS, QUERY_KIND_OPERATORS, CSV_IMPORT_COLUMNS, STATUS_CATEGORIES,
  SOLUTION_STAGES, POWER_PLATFORM,
} from '../config/app-config.js';

export const ERROR_CODES = Object.freeze({
  projectNotFound: 'PROJECT_NOT_FOUND',
  projectAccessDenied: 'PROJECT_ACCESS_DENIED',
  projectKeyTaken: 'PROJECT_KEY_TAKEN',
  projectKeyLocked: 'PROJECT_KEY_LOCKED',
  projectArchived: 'PROJECT_ARCHIVED',
  issueNotFound: 'ISSUE_NOT_FOUND',
  issueKeyConflict: 'ISSUE_KEY_CONFLICT',
  invalidTransition: 'INVALID_TRANSITION',
  requiredFieldMissing: 'REQUIRED_FIELD_MISSING',
  invalidParent: 'INVALID_PARENT_RELATIONSHIP',
  invalidParentType: 'INVALID_PARENT_TYPE',
  invalidTypeChange: 'INVALID_TYPE_CHANGE',
  issueImmutable: 'ISSUE_IMMUTABLE',
  issueArchived: 'ISSUE_ARCHIVED',
  lastLeadRequired: 'LAST_LEAD_REQUIRED',
  serverLogicMissing: 'SERVER_LOGIC_MISSING',
  boardNotFound: 'BOARD_NOT_FOUND',
  sprintNotFound: 'SPRINT_NOT_FOUND',
  sprintActiveExists: 'SPRINT_ACTIVE_EXISTS',
  invalidSprintTransition: 'INVALID_SPRINT_TRANSITION',
  sprintLocked: 'SPRINT_LOCKED',
  sprintDestinationRequired: 'SPRINT_DESTINATION_REQUIRED',
  sprintProjectMismatch: 'SPRINT_PROJECT_MISMATCH',
  invalidLink: 'INVALID_LINK',
  duplicateLink: 'DUPLICATE_LINK',
  userNotProvisioned: 'USER_NOT_PROVISIONED',
  invalidWorkflow: 'INVALID_WORKFLOW',
  statusInUse: 'STATUS_IN_USE',
  invalidCustomFieldValue: 'INVALID_CUSTOM_FIELD_VALUE',
  attachmentRejected: 'ATTACHMENT_REJECTED',
  attachmentNotFound: 'ATTACHMENT_NOT_FOUND',
  invalidWorkLog: 'INVALID_WORK_LOG',
  workLogLocked: 'WORK_LOG_LOCKED',
  workLogNotFound: 'WORK_LOG_NOT_FOUND',
  invalidVersion: 'INVALID_VERSION',
  versionNotFound: 'VERSION_NOT_FOUND',
  versionNameTaken: 'VERSION_NAME_TAKEN',
  versionArchived: 'VERSION_ARCHIVED',
  versionProjectMismatch: 'VERSION_PROJECT_MISMATCH',
  versionDestinationRequired: 'VERSION_DESTINATION_REQUIRED',
  invalidQuery: 'INVALID_QUERY',
  invalidEpicSolution: 'INVALID_EPIC_SOLUTION',
  invalidSolutionVersion: 'INVALID_SOLUTION_VERSION',
  solutionNotFound: 'SOLUTION_NOT_FOUND',
  powerPlatformUnavailable: 'POWER_PLATFORM_UNAVAILABLE',
  featureDisabled: 'FEATURE_DISABLED',
  validation: 'VALIDATION_FAILED',
  permissionDenied: 'PERMISSION_DENIED',
  network: 'NETWORK_ERROR',
  unknown: 'UNKNOWN_ERROR',
});

const ERROR_MESSAGES = Object.freeze({
  PROJECT_NOT_FOUND: 'That project could not be found. It may have been archived or you may not have access.',
  PROJECT_ACCESS_DENIED: 'You do not have access to this project. Ask a project lead to add you.',
  PROJECT_KEY_TAKEN: 'That project key is already used by another project.',
  PROJECT_KEY_LOCKED: 'The project key cannot change once issues exist.',
  PROJECT_ARCHIVED: 'This project is archived. Restore it before making changes.',
  ISSUE_NOT_FOUND: 'That issue could not be found. It may have been archived or you may not have access.',
  ISSUE_KEY_CONFLICT: 'Another issue was created at the same moment. Please try again.',
  INVALID_TRANSITION: 'That status change is not allowed by the project workflow.',
  REQUIRED_FIELD_MISSING: 'Fill in the required fields and try again.',
  INVALID_PARENT_RELATIONSHIP: 'That parent issue is not valid. It must be in the same project and cannot create a loop.',
  INVALID_PARENT_TYPE: 'That parent isn\'t allowed. Epics hold Stories, Tasks and Bugs; Stories hold Tasks and Bugs.',
  INVALID_TYPE_CHANGE: 'That issue type doesn\'t fit its parent or children. Epics hold Stories, Tasks and Bugs; Stories hold Tasks and Bugs.',
  ISSUE_IMMUTABLE: 'An issue\'s key and project cannot be changed.',
  ISSUE_ARCHIVED: 'This issue is archived and read-only.',
  LAST_LEAD_REQUIRED: 'A project needs at least one lead. Make someone else a lead first.',
  SERVER_LOGIC_MISSING: 'Pira\'s Dataverse plug-ins are not installed, so the issue could not be numbered. Ask your Pira administrator to finish setup.',
  BOARD_NOT_FOUND: 'That board could not be found. It may have been archived.',
  SPRINT_NOT_FOUND: 'That sprint could not be found. It may have been cancelled.',
  SPRINT_ACTIVE_EXISTS: 'This board already has an active sprint. Complete it before starting another.',
  INVALID_SPRINT_TRANSITION: 'That sprint change isn\'t allowed.',
  SPRINT_LOCKED: 'That sprint is completed or cancelled, so its dates and issues are locked.',
  SPRINT_DESTINATION_REQUIRED: 'Choose where the incomplete issues should go before completing the sprint.',
  SPRINT_PROJECT_MISMATCH: 'Only issues from the sprint\'s own project can be added to it.',
  INVALID_LINK: 'That link isn\'t valid. An issue can\'t link to itself, and two issues can\'t block or duplicate each other both ways.',
  DUPLICATE_LINK: 'Those issues are already linked that way.',
  USER_NOT_PROVISIONED: 'That person isn\'t set up in this Dataverse environment yet. Ask an administrator to add them, then try again.',
  INVALID_WORKFLOW: 'That workflow isn\'t valid. Check the statuses, initial status and transitions.',
  STATUS_IN_USE: 'Some issues still use a status you removed. Move them to another status first.',
  INVALID_CUSTOM_FIELD_VALUE: 'A custom field value doesn\'t match its type. Check the field and try again.',
  ATTACHMENT_REJECTED: 'That file can\'t be attached.',
  ATTACHMENT_NOT_FOUND: 'That attachment could not be found. It may have been deleted, or you may not have access.',
  INVALID_WORK_LOG: 'That work log isn\'t valid. Log between 1 minute and 24 hours, on a date within the last year.',
  WORK_LOG_LOCKED: 'Voided work logs can\'t be changed.',
  WORK_LOG_NOT_FOUND: 'That work log could not be found.',
  INVALID_VERSION: 'That version isn\'t valid. Check its name and dates.',
  VERSION_NOT_FOUND: 'That version could not be found.',
  VERSION_NAME_TAKEN: 'Another version in this project already uses that name.',
  VERSION_ARCHIVED: 'That version is archived, so issues can\'t be added to it.',
  VERSION_PROJECT_MISMATCH: 'Only versions from the issue\'s own project can be used.',
  VERSION_DESTINATION_REQUIRED: 'Choose what happens to the unfinished issues before releasing.',
  INVALID_QUERY: 'That query isn\'t valid. Check each condition.',
  INVALID_EPIC_SOLUTION: 'That solution link isn\'t valid. Only epics link solutions, one per stage, from a Dataverse environment.',
  INVALID_SOLUTION_VERSION: 'Enter a solution version like 1.0.0.2 (up to four numbers separated by dots). Only stories have one.',
  SOLUTION_NOT_FOUND: 'That solution could not be found in the environment. It may have been deleted, or you may not have access.',
  POWER_PLATFORM_UNAVAILABLE: 'Pira could not reach Power Platform. Check the Power Platform for Admins V2 and Dataverse connections, then try again.',
  FEATURE_DISABLED: 'That feature is switched off in this Pira installation.',
  VALIDATION_FAILED: 'Some fields need attention.',
  PERMISSION_DENIED: 'You do not have permission to do that. Ask your Pira administrator for access.',
  NETWORK_ERROR: 'Pira could not reach the server. Check your connection and try again.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
});

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]*$/;
const ISSUE_KEY_PATTERN = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RANK_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

// ── Errors ─────────────────────────────────────────────────────

export function createDomainError(sCode, sMessage = '', oDetails = null) {
  const oError = new Error(sMessage || ERROR_MESSAGES[sCode] || ERROR_MESSAGES.UNKNOWN_ERROR);
  oError.code = sCode;
  if (oDetails) oError.details = oDetails;
  return oError;
}

export function getErrorMessage(sCode) {
  return ERROR_MESSAGES[sCode] || ERROR_MESSAGES.UNKNOWN_ERROR;
}

function errorText(oError) {
  return String((oError && (oError.message || oError)) || '').toLowerCase();
}

export function isDuplicateKeyError(oError) {
  const sText = errorText(oError);
  return sText.includes('0x80040237') || sText.includes('0x80060892') || sText.includes('duplicate')
    || sText.includes('matching key values already exists');
}

export function isPermissionError(oError) {
  const sText = errorText(oError);
  return sText.includes('0x80040220') || sText.includes('missing prv') || sText.includes('privilege')
    || sText.includes('access is denied') || sText.includes('forbidden') || sText.includes('status 403');
}

export function isNetworkError(oError) {
  const sText = errorText(oError);
  return sText.includes('failed to fetch') || sText.includes('network') || sText.includes('timed out') || sText.includes('timeout');
}

// Server plug-ins prefix their messages with a stable code, e.g. "[PROJECT_ACCESS_DENIED] Only leads can …".
const SERVER_CODE_PATTERN = /\[([A-Z][A-Z_]{2,40})\]\s*([^\r\n[]{0,300})/;

export function parseServerError(oError) {
  const aMatch = SERVER_CODE_PATTERN.exec(String((oError && (oError.message || oError)) || ''));
  if (!aMatch || !ERROR_MESSAGES[aMatch[1]]) return null;
  return { sCode: aMatch[1], sMessage: aMatch[2].trim() || ERROR_MESSAGES[aMatch[1]] };
}

// Maps any thrown value to a safe, user-facing message. Never surfaces stack traces or raw payloads.
export function toFriendlyMessage(oError) {
  if (oError && oError.code && ERROR_MESSAGES[oError.code]) return oError.message || ERROR_MESSAGES[oError.code];
  const oServer = parseServerError(oError);
  if (oServer) return oServer.sMessage;
  if (isPermissionError(oError)) return ERROR_MESSAGES.PERMISSION_DENIED;
  if (isDuplicateKeyError(oError)) return ERROR_MESSAGES.ISSUE_KEY_CONFLICT;
  if (isNetworkError(oError)) return ERROR_MESSAGES.NETWORK_ERROR;
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}

// ── Option lookups ─────────────────────────────────────────────

function findOption(aOptions, iValue) {
  return aOptions.find((oOption) => oOption.value === Number(iValue)) || null;
}

export const getIssueType = (iValue) => findOption(ISSUE_TYPES, iValue) || ISSUE_TYPES[0];
export const getIssueStatus = (iValue) => findOption(ISSUE_STATUSES, iValue) || ISSUE_STATUSES[0];
export const getPriority = (iValue) => findOption(PRIORITIES, iValue) || PRIORITIES[2];
export const getMemberRole = (iValue) => findOption(MEMBER_ROLES, iValue);
export const isValidIssueType = (iValue) => Boolean(findOption(ISSUE_TYPES, iValue));
export const isValidStatus = (iValue) => Boolean(findOption(ISSUE_STATUSES, iValue));
export const isValidPriority = (iValue) => Boolean(findOption(PRIORITIES, iValue));
export const getStatusCategory = (iValue) => getIssueStatus(iValue).category;
export const isDoneStatus = (iValue) => isValidStatus(iValue) && getStatusCategory(iValue) === 'done';
export const DONE_STATUSES = Object.freeze(ISSUE_STATUSES.filter((oStatus) => oStatus.category === 'done').map((oStatus) => oStatus.value));
export const getResolution = (iValue) => findOption(RESOLUTIONS, iValue);
export const isValidResolution = (iValue) => Boolean(findOption(RESOLUTIONS, iValue));
export const isHighPriority = (iValue) => getPriority(iValue).value >= 100000003;
export const getSprintState = (iValue) => findOption(SPRINT_STATES, iValue) || SPRINT_STATES[0];
export const getLinkType = (iValue) => findOption(LINK_TYPES, iValue);

// ── Identifiers ────────────────────────────────────────────────

export const isGuid = (sValue) => typeof sValue === 'string' && GUID_PATTERN.test(sValue.trim());

export function assertGuid(sValue, sLabel = 'record') {
  if (!isGuid(sValue)) throw createDomainError(ERROR_CODES.validation, `Invalid ${sLabel} identifier.`);
  return sValue.trim().toLowerCase();
}

export function escapeODataString(sValue) {
  return String(sValue == null ? '' : sValue).replace(/'/g, "''");
}

// ── Projects ───────────────────────────────────────────────────

export function normaliseProjectKey(sKey) {
  return String(sKey || '').trim().toUpperCase();
}

export function validateProjectKey(sKey) {
  const sNormalised = normaliseProjectKey(sKey);
  if (!sNormalised) return 'Project key is required.';
  if (sNormalised.length < LIMITS.projectKeyMin || sNormalised.length > LIMITS.projectKeyMax) {
    return `Project key must be ${LIMITS.projectKeyMin}–${LIMITS.projectKeyMax} characters.`;
  }
  if (!PROJECT_KEY_PATTERN.test(sNormalised)) return 'Use letters and numbers only, starting with a letter.';
  return '';
}

export function suggestProjectKey(sName) {
  const aWords = String(sName || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!aWords.length) return '';
  const sFirstLetterWord = aWords.find((sWord) => /^[A-Z]/.test(sWord)) || '';
  let sKey = aWords.length > 1
    ? aWords.map((sWord) => sWord[0]).join('').replace(/^[0-9]+/, '')
    : sFirstLetterWord.slice(0, 4);
  if (sKey.length < LIMITS.projectKeyMin) sKey = aWords.join('').replace(/^[0-9]+/, '').slice(0, 4);
  return sKey.slice(0, LIMITS.projectKeyMax);
}

export function validateProjectDraft(oDraft) {
  const oErrors = {};
  const sName = String(oDraft.sName || '').trim();
  if (!sName) oErrors.sName = 'Project name is required.';
  else if (sName.length > LIMITS.projectNameMax) oErrors.sName = `Keep the name under ${LIMITS.projectNameMax} characters.`;
  const sKeyError = validateProjectKey(oDraft.sKey);
  if (sKeyError) oErrors.sKey = sKeyError;
  if (String(oDraft.sDescription || '').length > LIMITS.projectDescriptionMax) {
    oErrors.sDescription = `Keep the description under ${LIMITS.projectDescriptionMax} characters.`;
  }
  return { bValid: Object.keys(oErrors).length === 0, oErrors };
}

// Lead: everything. Contributor: create/edit issues. Stakeholder: read only.
export function getProjectPermissions(oMembership, bProjectArchived = false) {
  const sRole = oMembership && oMembership.bActive ? (getMemberRole(oMembership.iRole) || {}).key || '' : '';
  return {
    bCanView: Boolean(sRole),
    bCanEdit: !bProjectArchived && (sRole === 'lead' || sRole === 'contributor'),
    bCanManage: sRole === 'lead',
    sRole,
  };
}

// ── Issues ─────────────────────────────────────────────────────

export function formatIssueKey(sProjectKey, iSequence) {
  const sKey = normaliseProjectKey(sProjectKey);
  if (validateProjectKey(sKey)) throw createDomainError(ERROR_CODES.validation, 'Invalid project key.');
  if (!Number.isSafeInteger(iSequence) || iSequence < 1) throw createDomainError(ERROR_CODES.validation, 'Invalid issue sequence.');
  return `${sKey}-${iSequence}`;
}

export function parseIssueKey(sText) {
  const aMatch = ISSUE_KEY_PATTERN.exec(String(sText || '').trim());
  if (!aMatch) return null;
  return { sProjectKey: aMatch[1].toUpperCase(), iSequence: Number(aMatch[2]) };
}

export function normaliseLabel(sLabel) {
  return String(sLabel || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_.-]/g, '').slice(0, LIMITS.labelMax);
}

export function normaliseLabels(aLabels) {
  return [...new Set((aLabels || []).map(normaliseLabel).filter(Boolean))];
}

export function isValidDateOnly(sValue) {
  if (!DATE_ONLY_PATTERN.test(String(sValue || ''))) return false;
  const oDate = new Date(`${sValue}T00:00:00Z`);
  return !Number.isNaN(oDate.getTime()) && oDate.toISOString().slice(0, 10) === sValue;
}

export function validateIssueDraft(oDraft) {
  const oErrors = {};
  const sSummary = String(oDraft.sSummary || '').trim();
  if (!sSummary) oErrors.sSummary = 'Summary is required.';
  else if (sSummary.length > LIMITS.summaryMax) oErrors.sSummary = `Keep the summary under ${LIMITS.summaryMax} characters.`;
  if (!isGuid(oDraft.sProjectId || '')) oErrors.sProjectId = 'Choose a project.';
  if (!isValidIssueType(oDraft.iType)) oErrors.iType = 'Choose an issue type.';
  if (!isValidPriority(oDraft.iPriority)) oErrors.iPriority = 'Choose a priority.';
  if (String(oDraft.sDescription || '').length > LIMITS.descriptionMax) {
    oErrors.sDescription = `Keep the description under ${LIMITS.descriptionMax} characters.`;
  }
  if (oDraft.sDueDate && !isValidDateOnly(oDraft.sDueDate)) oErrors.sDueDate = 'Enter a valid date.';
  if (oDraft.sAssigneeId && !isGuid(oDraft.sAssigneeId)) oErrors.sAssigneeId = 'Choose a valid assignee.';
  if (oDraft.sParentId && !isGuid(oDraft.sParentId)) oErrors.sParentId = 'Choose a valid parent issue.';
  if (oDraft.sSprintId && !isGuid(oDraft.sSprintId)) oErrors.sSprintId = 'Choose a valid sprint.';
  if (oDraft.iStoryPoints !== undefined && oDraft.iStoryPoints !== null && !isValidStoryPoints(oDraft.iStoryPoints)) {
    oErrors.iStoryPoints = `Story points must be a whole number from 0 to ${LIMITS.storyPointsMax}.`;
  }
  if (normaliseLabels(oDraft.aLabels).length > LIMITS.labelsPerIssue) oErrors.aLabels = `Use at most ${LIMITS.labelsPerIssue} labels.`;
  const sVersionError = validateSolutionVersion(oDraft.sSolutionVersion);
  if (sVersionError) oErrors.sSolutionVersion = sVersionError;
  else if (normaliseSolutionVersion(oDraft.sSolutionVersion) && !isStoryType(oDraft.iType)) oErrors.sSolutionVersion = 'Only stories have a solution version.';
  return { bValid: Object.keys(oErrors).length === 0, oErrors };
}

export function validateCommentBody(sBody) {
  const sText = String(sBody || '').trim();
  if (!sText) return 'Write a comment first.';
  if (sText.length > LIMITS.commentMax) return `Keep comments under ${LIMITS.commentMax} characters.`;
  return '';
}

// Parent must be another issue in the same project, must not be a descendant of the child and must sit higher in the
// type hierarchy (Epic → Story → Task/Bug). Strict levels make new cycles impossible; ancestors guard legacy links.
export function validateParent(oChild, oParent, aParentAncestorIds = []) {
  if (!oParent) return '';
  if (oChild.sId && oChild.sId === oParent.sId) return ERROR_CODES.invalidParent;
  if (oChild.sProjectId !== oParent.sProjectId) return ERROR_CODES.invalidParent;
  if (oChild.sId && aParentAncestorIds.includes(oChild.sId)) return ERROR_CODES.invalidParent;
  if (oChild.iType && oParent.iType && getIssueLevel(oParent.iType) >= getIssueLevel(oChild.iType)) return ERROR_CODES.invalidParentType;
  return '';
}

export const getIssueLevel = (iType) => getIssueType(iType).level;
export const canHaveChildren = (iType) => ISSUE_TYPES.some((oType) => oType.level > getIssueLevel(iType));
export const getAllowedParentTypes = (iChildType) => ISSUE_TYPES.filter((oType) => oType.level < getIssueLevel(iChildType)).map((oType) => oType.value);

// A type change must keep the issue below its parent and above every child.
export function validateTypeChange(iNewType, oParent, aChildTypes = []) {
  const iLevel = getIssueLevel(iNewType);
  if (oParent && oParent.iType && getIssueLevel(oParent.iType) >= iLevel) return ERROR_CODES.invalidTypeChange;
  if (aChildTypes.some((iType) => getIssueLevel(iType) <= iLevel)) return ERROR_CODES.invalidTypeChange;
  return '';
}

// ── Story points ─────────────────────────────────────────────────
// Whole numbers only (decision: no decimals in Phase 2); null means "not estimated".

export const isValidStoryPoints = (iPoints) => Number.isInteger(iPoints) && iPoints >= 0 && iPoints <= LIMITS.storyPointsMax;

export function parseStoryPoints(value) {
  const sText = String(value == null ? '' : value).trim();
  if (!sText) return { iPoints: null, sError: '' };
  const iPoints = /^\d{1,7}$/.test(sText) ? Number(sText) : NaN;
  if (!isValidStoryPoints(iPoints)) return { iPoints: null, sError: `Story points must be a whole number from 0 to ${LIMITS.storyPointsMax}.` };
  return { iPoints, sError: '' };
}

export const formatStoryPoints = (iPoints) => (iPoints === null || iPoints === undefined ? '' : String(iPoints));

// ── Workflow ───────────────────────────────────────────────────
// A workflow is { bCustom, aStatuses (ordered), iInitialStatus, aTransitions: [{ iFrom, iTo, aRequired }] }.
// Projects without a saved workflow use the default (WORKFLOW in app-config); plug-in 3 enforces the same rules.

export const DEFAULT_WORKFLOW = Object.freeze({
  bCustom: false,
  aStatuses: Object.freeze([...WORKFLOW.statuses]),
  iInitialStatus: WORKFLOW.initialStatus,
  aTransitions: Object.freeze(WORKFLOW.statuses.flatMap((iFrom) => (WORKFLOW.transitions[iFrom] || []).map((iTo) => Object.freeze({ iFrom, iTo, aRequired: Object.freeze([]) })))),
});

const REQUIREMENT_KEYS = TRANSITION_REQUIREMENTS.map((oItem) => oItem.key);
// Maps each requirement to the issue field the transition dialog collects.
export const REQUIREMENT_FIELDS = Object.freeze({ resolution: 'iResolution', assignee: 'sAssigneeId', storyPoints: 'iStoryPoints', dueDate: 'sDueDate' });

export const normaliseRequirements = (aKeys) => REQUIREMENT_KEYS.filter((sKey) => (aKeys || []).includes(sKey));

export function serialiseStatusList(aStatuses) {
  return [...new Set((aStatuses || []).map(Number))].filter(isValidStatus).join(',');
}

export function parseStatusList(sText) {
  return [...new Set(String(sText || '').split(',').map((sPart) => Number(sPart.trim())).filter(isValidStatus))];
}

export const workflowStatusOptions = (oWorkflow = DEFAULT_WORKFLOW) => oWorkflow.aStatuses.map((iStatus) => getIssueStatus(iStatus));

export function getAllowedTransitions(iFromStatus, oWorkflow = DEFAULT_WORKFLOW) {
  const iFrom = Number(iFromStatus);
  return oWorkflow.aTransitions
    .filter((oTransition) => oTransition.iFrom === iFrom && oTransition.iTo !== iFrom && oWorkflow.aStatuses.includes(oTransition.iTo))
    .map((oTransition) => oTransition.iTo)
    .sort((iA, iB) => oWorkflow.aStatuses.indexOf(iA) - oWorkflow.aStatuses.indexOf(iB));
}

export function canTransition(iFromStatus, iToStatus, oWorkflow = DEFAULT_WORKFLOW) {
  if (!isValidStatus(iFromStatus) || !isValidStatus(iToStatus)) return false;
  if (Number(iFromStatus) === Number(iToStatus)) return false;
  return getAllowedTransitions(iFromStatus, oWorkflow).includes(Number(iToStatus));
}

export function assertTransition(iFromStatus, iToStatus, oWorkflow = DEFAULT_WORKFLOW) {
  if (!canTransition(iFromStatus, iToStatus, oWorkflow)) {
    throw createDomainError(ERROR_CODES.invalidTransition, '', { iFromStatus, iToStatus });
  }
}

export function getTransitionRequirements(iFromStatus, iToStatus, oWorkflow = DEFAULT_WORKFLOW) {
  const oTransition = oWorkflow.aTransitions.find((oItem) => oItem.iFrom === Number(iFromStatus) && oItem.iTo === Number(iToStatus));
  return oTransition ? normaliseRequirements(oTransition.aRequired) : [];
}

// oValues: { iResolution, sAssigneeId, iStoryPoints, sDueDate } as they will be after the transition.
export function validateTransitionFields(aRequired, oValues) {
  const oErrors = {};
  if (aRequired.includes('resolution') && !isValidResolution(oValues.iResolution)) oErrors.iResolution = 'Choose a resolution.';
  if (aRequired.includes('assignee') && !isGuid(oValues.sAssigneeId || '')) oErrors.sAssigneeId = 'Assign someone first.';
  if (aRequired.includes('storyPoints') && !isValidStoryPoints(oValues.iStoryPoints)) oErrors.iStoryPoints = 'Estimate story points first.';
  if (aRequired.includes('dueDate') && !isValidDateOnly(oValues.sDueDate || '')) oErrors.sDueDate = 'Set a due date first.';
  return oErrors;
}

export function assertTransitionFields(aRequired, oValues) {
  const oErrors = validateTransitionFields(aRequired, oValues);
  if (Object.keys(oErrors).length) {
    const aLabels = TRANSITION_REQUIREMENTS.filter((oItem) => oErrors[REQUIREMENT_FIELDS[oItem.key]]).map((oItem) => oItem.label.toLowerCase());
    throw createDomainError(ERROR_CODES.requiredFieldMissing, `This status change needs: ${aLabels.join(', ')}.`, oErrors);
  }
}

export const getProjectTemplate = (sKey) => PROJECT_TEMPLATES.find((oTemplate) => oTemplate.key === sKey) || null;

export function buildTemplateWorkflow(oTemplate) {
  const aStatuses = [...oTemplate.aStatuses];
  const oRequiredInto = oTemplate.oRequiredInto || {};
  const aTransitions = oTemplate.aTransitions === 'all'
    ? aStatuses.flatMap((iFrom) => aStatuses.filter((iTo) => iTo !== iFrom).map((iTo) => ({ iFrom, iTo, aRequired: normaliseRequirements(oRequiredInto[iTo]) })))
    : oTemplate.aTransitions.map(([iFrom, iTo, aRequired]) => ({ iFrom, iTo, aRequired: normaliseRequirements(aRequired) }));
  return { bCustom: true, aStatuses, iInitialStatus: oTemplate.iInitialStatus, aTransitions };
}

function reachableStatuses(oWorkflow) {
  const oSeen = new Set([oWorkflow.iInitialStatus]);
  const aQueue = [oWorkflow.iInitialStatus];
  while (aQueue.length) {
    const iCurrent = aQueue.shift();
    oWorkflow.aTransitions.filter((oItem) => oItem.iFrom === iCurrent && !oSeen.has(oItem.iTo)).forEach((oItem) => { oSeen.add(oItem.iTo); aQueue.push(oItem.iTo); });
  }
  return oSeen;
}

// Errors block saving; warnings (unreachable statuses, dead ends) are shown but allowed.
export function validateWorkflow(oWorkflow) {
  const oErrors = {};
  const aWarnings = [];
  const aStatuses = (oWorkflow.aStatuses || []).map(Number);
  if (new Set(aStatuses).size !== aStatuses.length || aStatuses.some((iStatus) => !isValidStatus(iStatus))) oErrors.aStatuses = 'Each status can be used once, from the catalogue.';
  else if (aStatuses.length < 2) oErrors.aStatuses = 'Use at least two statuses.';
  else if (!aStatuses.some(isDoneStatus)) oErrors.aStatuses = 'Include at least one done status (Done or Closed).';
  else if (aStatuses.every(isDoneStatus)) oErrors.aStatuses = 'Include at least one open status.';
  if (!aStatuses.includes(Number(oWorkflow.iInitialStatus))) oErrors.iInitialStatus = 'Choose an initial status from the list.';
  else if (isDoneStatus(oWorkflow.iInitialStatus)) oErrors.iInitialStatus = 'New issues can\'t start in a done status.';
  const aTransitions = oWorkflow.aTransitions || [];
  const aPairs = aTransitions.map((oItem) => `${oItem.iFrom}>${oItem.iTo}`);
  if (!aTransitions.length) oErrors.aTransitions = 'Allow at least one transition.';
  else if (new Set(aPairs).size !== aPairs.length) oErrors.aTransitions = 'Each transition can be listed once.';
  else if (aTransitions.some((oItem) => oItem.iFrom === oItem.iTo || !aStatuses.includes(oItem.iFrom) || !aStatuses.includes(oItem.iTo))) oErrors.aTransitions = 'Transitions must connect two different statuses from the list.';
  else if (aTransitions.some((oItem) => (oItem.aRequired || []).some((sKey) => !REQUIREMENT_KEYS.includes(sKey)))) oErrors.aTransitions = 'Only resolution, assignee, story points and due date can be required.';
  else if (aTransitions.some((oItem) => (oItem.aRequired || []).includes('resolution') && !isDoneStatus(oItem.iTo))) oErrors.aTransitions = 'A resolution can only be required when moving to a done status.';
  if (!Object.keys(oErrors).length) {
    const oReachable = reachableStatuses({ ...oWorkflow, aStatuses });
    aStatuses.filter((iStatus) => !oReachable.has(iStatus)).forEach((iStatus) => aWarnings.push(`${getIssueStatus(iStatus).label} can't be reached from ${getIssueStatus(oWorkflow.iInitialStatus).label}.`));
    aStatuses.filter((iStatus) => !isDoneStatus(iStatus) && !aTransitions.some((oItem) => oItem.iFrom === iStatus))
      .forEach((iStatus) => aWarnings.push(`Issues in ${getIssueStatus(iStatus).label} can't move anywhere.`));
  }
  return { bValid: Object.keys(oErrors).length === 0, oErrors, aWarnings };
}

// aExisting: stored rows { sId, iFrom, iTo, aRequired, bActive }. Rows are deactivated, never deleted.
export function diffWorkflowTransitions(aExisting, aWanted) {
  const sameSet = (aA, aB) => normaliseRequirements(aA).join('|') === normaliseRequirements(aB).join('|');
  const findRow = (oItem) => aExisting.find((oRow) => oRow.iFrom === oItem.iFrom && oRow.iTo === oItem.iTo);
  const aCreate = aWanted.filter((oItem) => !findRow(oItem));
  const aUpdate = aWanted.map((oItem) => ({ oItem, oRow: findRow(oItem) }))
    .filter(({ oRow, oItem }) => oRow && (!oRow.bActive || !sameSet(oRow.aRequired, oItem.aRequired)))
    .map(({ oRow, oItem }) => ({ ...oRow, aRequired: normaliseRequirements(oItem.aRequired), bActive: true }));
  const aDeactivate = aExisting.filter((oRow) => oRow.bActive && !aWanted.some((oItem) => oItem.iFrom === oRow.iFrom && oItem.iTo === oRow.iTo));
  return { aCreate, aUpdate, aDeactivate };
}

// sStatusList blank = the project still uses the default workflow.
export function workflowFromRecords(sStatusList, iInitialStatus, aRows) {
  const aStatuses = parseStatusList(sStatusList);
  if (!aStatuses.length) return DEFAULT_WORKFLOW;
  return {
    bCustom: true,
    aStatuses,
    iInitialStatus: aStatuses.includes(Number(iInitialStatus)) ? Number(iInitialStatus) : aStatuses[0],
    aTransitions: aRows.filter((oRow) => oRow.bActive && aStatuses.includes(oRow.iFrom) && aStatuses.includes(oRow.iTo))
      .map((oRow) => ({ iFrom: oRow.iFrom, iTo: oRow.iTo, aRequired: normaliseRequirements(oRow.aRequired) })),
  };
}

export const removedStatuses = (oBefore, oAfter) => oBefore.aStatuses.filter((iStatus) => !oAfter.aStatuses.includes(iStatus));

// ── Ranking (base-36 fractional index; never ends in "0" so a midpoint always exists) ──

function rankMidpoint(sLow, sHigh) {
  if (sHigh !== null) {
    let iShared = 0;
    while ((sLow[iShared] || '0') === sHigh[iShared]) iShared += 1;
    if (iShared > 0) return sHigh.slice(0, iShared) + rankMidpoint(sLow.slice(iShared), sHigh.slice(iShared));
  }
  const iLow = sLow ? RANK_DIGITS.indexOf(sLow[0]) : 0;
  const iHigh = sHigh !== null ? RANK_DIGITS.indexOf(sHigh[0]) : RANK_DIGITS.length;
  if (iHigh - iLow > 1) return RANK_DIGITS[Math.round((iLow + iHigh) / 2)];
  if (sHigh && sHigh.length > 1) return sHigh.slice(0, 1);
  return RANK_DIGITS[iLow] + rankMidpoint(sLow.slice(1), null);
}

export function isValidRank(sRank) {
  return typeof sRank === 'string' && /^[0-9a-z]+$/.test(sRank) && !sRank.endsWith('0');
}

export function rankBetween(sBefore = '', sAfter = '') {
  const sLow = isValidRank(sBefore) ? sBefore : '';
  const sHigh = isValidRank(sAfter) ? sAfter : null;
  if (sHigh !== null && sLow >= sHigh) throw createDomainError(ERROR_CODES.validation, 'Rank bounds are out of order.');
  return rankMidpoint(sLow, sHigh);
}

export function compareRank(oA, oB) {
  const sA = oA.sRank || '';
  const sB = oB.sRank || '';
  if (sA && sB && sA !== sB) return sA < sB ? -1 : 1;
  if (sA && !sB) return -1;
  if (!sA && sB) return 1;
  // Concurrent moves can produce equal ranks; created date then id keeps the order stable for everyone.
  return String(oA.sCreatedOn || '').localeCompare(String(oB.sCreatedOn || '')) || String(oA.sId || '').localeCompare(String(oB.sId || ''));
}

export const isRankOrdered = (sLow, sHigh) => isValidRank(sLow) && isValidRank(sHigh) && sLow < sHigh;

// ── Sprints ─────────────────────────────────────────────────────────

export const isSprintLocked = (iState) => Number(iState) === SPRINT_STATE.completed || Number(iState) === SPRINT_STATE.cancelled;
export const isSprintOpen = (iState) => Number(iState) === SPRINT_STATE.planned || Number(iState) === SPRINT_STATE.active;

// Starting a sprint needs both dates; planned sprints may leave them blank.
export function validateSprintDraft(oDraft, bRequireDates = false) {
  const oErrors = {};
  const sName = String(oDraft.sName || '').trim();
  if (!sName) oErrors.sName = 'Sprint name is required.';
  else if (sName.length > LIMITS.sprintNameMax) oErrors.sName = `Keep the name under ${LIMITS.sprintNameMax} characters.`;
  if (String(oDraft.sGoal || '').length > LIMITS.sprintGoalMax) oErrors.sGoal = `Keep the goal under ${LIMITS.sprintGoalMax} characters.`;
  ['sStartDate', 'sEndDate'].forEach((sField) => {
    if (oDraft[sField] && !isValidDateOnly(oDraft[sField])) oErrors[sField] = 'Enter a valid date.';
    else if (!oDraft[sField] && bRequireDates) oErrors[sField] = 'Required to start the sprint.';
  });
  if (!oErrors.sStartDate && !oErrors.sEndDate && oDraft.sStartDate && oDraft.sEndDate && oDraft.sEndDate < oDraft.sStartDate) {
    oErrors.sEndDate = 'The end date can\'t be before the start date.';
  }
  return { bValid: Object.keys(oErrors).length === 0, oErrors };
}

export function canSprintTransition(iFromState, iToState) {
  return (SPRINT_TRANSITIONS[Number(iFromState)] || []).includes(Number(iToState));
}

export function assertSprintTransition(iFromState, iToState) {
  if (!canSprintTransition(iFromState, iToState)) throw createDomainError(ERROR_CODES.invalidSprintTransition, '', { iFromState, iToState });
}

export function findOtherActiveSprint(aSprints, sBoardId, sExceptSprintId = '') {
  return aSprints.find((oSprint) => oSprint.iState === SPRINT_STATE.active && oSprint.sBoardId === sBoardId && oSprint.sId !== sExceptSprintId) || null;
}

export function suggestSprintName(sProjectKey, aSprints) {
  const oPattern = new RegExp(`^${normaliseProjectKey(sProjectKey)} Sprint (\\d+)$`, 'i');
  const iHighest = aSprints.reduce((iMax, oSprint) => {
    const aMatch = oPattern.exec(String(oSprint.sName || '').trim());
    return aMatch ? Math.max(iMax, Number(aMatch[1])) : iMax;
  }, 0);
  return `${normaliseProjectKey(sProjectKey)} Sprint ${Math.max(iHighest, aSprints.length) + 1}`;
}

// Simple metrics (not a burndown). Archived issues never count, so deleted work is never reported as completed.
export function computeSprintMetrics(aIssues) {
  return aIssues.filter((oIssue) => !oIssue.bArchived).reduce((oTotals, oIssue) => {
    const bDone = isDoneStatus(oIssue.iStatus);
    const iPoints = isValidStoryPoints(oIssue.iStoryPoints) ? oIssue.iStoryPoints : 0;
    oTotals.iIssues += 1;
    oTotals.iPoints += iPoints;
    if (bDone) { oTotals.iDone += 1; oTotals.iDonePoints += iPoints; } else { oTotals.iOpen += 1; oTotals.iOpenPoints += iPoints; }
    if (!isValidStoryPoints(oIssue.iStoryPoints)) oTotals.iUnestimated += 1;
    return oTotals;
  }, { iIssues: 0, iDone: 0, iOpen: 0, iPoints: 0, iDonePoints: 0, iOpenPoints: 0, iUnestimated: 0 });
}

// Net change since the sprint started, against the committed snapshot taken at start.
export function describeScopeChange(oSprint, oMetrics) {
  if (!oSprint.sStartedOn) return null;
  return { iIssueDelta: oMetrics.iIssues - (oSprint.iCommittedIssues || 0), iPointDelta: oMetrics.iPoints - (oSprint.iCommittedPoints || 0) };
}

// Completing a sprint never silently drops work: open issues need an explicit destination ('backlog' or a sprint id).
export function planSprintCompletion(aIssues, sDestination) {
  const aMove = aIssues.filter((oIssue) => !oIssue.bArchived && !isDoneStatus(oIssue.iStatus));
  if (aMove.length && !sDestination) throw createDomainError(ERROR_CODES.sprintDestinationRequired);
  if (sDestination && sDestination !== 'backlog' && !isGuid(sDestination)) throw createDomainError(ERROR_CODES.validation, 'Choose a valid destination sprint.');
  return { aMove, sTargetSprintId: sDestination === 'backlog' ? '' : (sDestination || '') };
}

// ── Issue links ────────────────────────────────────────────────────
// Each choice is shown from the current issue's point of view; inward choices are stored with From/To swapped.

export const LINK_CHOICES = Object.freeze(LINK_TYPES.flatMap((oType) => (oType.bSymmetric
  ? [{ sKey: oType.key, iType: oType.value, bInward: false, sLabel: oType.sOutward }]
  : [{ sKey: oType.key, iType: oType.value, bInward: false, sLabel: oType.sOutward }, { sKey: `${oType.key}-inward`, iType: oType.value, bInward: true, sLabel: oType.sInward }])));

export function describeLink(iType, bInward) {
  const oType = getLinkType(iType);
  if (!oType) return 'links to';
  return bInward ? oType.sInward : oType.sOutward;
}

// aExisting: links already stored between the same two issues, in either direction.
export function validateIssueLink(oLink, aExisting = []) {
  const oType = getLinkType(oLink.iType);
  if (!oType || !oLink.sFromId || !oLink.sToId || oLink.sFromId === oLink.sToId) return ERROR_CODES.invalidLink;
  if (aExisting.some((oItem) => oItem.iType === oType.value && oItem.sFromId === oLink.sFromId && oItem.sToId === oLink.sToId)) return ERROR_CODES.duplicateLink;
  const bReverse = aExisting.some((oItem) => oItem.iType === oType.value && oItem.sFromId === oLink.sToId && oItem.sToId === oLink.sFromId);
  if (bReverse) return oType.bSymmetric ? ERROR_CODES.duplicateLink : ERROR_CODES.invalidLink;
  return '';
}

// ── History ────────────────────────────────────────────────────

export function truncateText(sValue, iMax = LIMITS.historyValueMax) {
  const sText = String(sValue == null ? '' : sValue);
  return sText.length > iMax ? `${sText.slice(0, iMax - 1)}…` : sText;
}

// aFields: [{ sField, sLabel }]. Display maps hold human-readable values for each field.
export function diffDisplayValues(oBeforeDisplay, oAfterDisplay, aFields) {
  return aFields
    .filter((oField) => String(oBeforeDisplay[oField.sField] ?? '') !== String(oAfterDisplay[oField.sField] ?? ''))
    .map((oField) => ({
      sField: oField.sField,
      sLabel: oField.sLabel,
      sOldValue: truncateText(oBeforeDisplay[oField.sField] ?? ''),
      sNewValue: truncateText(oAfterDisplay[oField.sField] ?? ''),
    }));
}

// ── Dates & display ────────────────────────────────────────────

export function toDateOnly(oDate) {
  const sYear = String(oDate.getFullYear());
  const sMonth = String(oDate.getMonth() + 1).padStart(2, '0');
  const sDay = String(oDate.getDate()).padStart(2, '0');
  return `${sYear}-${sMonth}-${sDay}`;
}

export function addDays(oDate, iDays) {
  const oCopy = new Date(oDate.getTime());
  oCopy.setDate(oCopy.getDate() + iDays);
  return oCopy;
}

export function isOverdue(sDueDate, iStatus, sTodayDateOnly) {
  return Boolean(sDueDate) && !isDoneStatus(iStatus) && String(sDueDate).slice(0, 10) < sTodayDateOnly;
}

export function formatRelativeTime(sIso, oNow = new Date()) {
  const oDate = new Date(sIso);
  if (!sIso || Number.isNaN(oDate.getTime())) return '';
  const iSeconds = Math.round((oNow.getTime() - oDate.getTime()) / 1000);
  if (iSeconds < 45) return 'just now';
  const iMinutes = Math.round(iSeconds / 60);
  if (iMinutes < 60) return `${iMinutes} minute${iMinutes === 1 ? '' : 's'} ago`;
  const iHours = Math.round(iMinutes / 60);
  if (iHours < 24) return `${iHours} hour${iHours === 1 ? '' : 's'} ago`;
  const iDays = Math.round(iHours / 24);
  if (iDays < 7) return `${iDays} day${iDays === 1 ? '' : 's'} ago`;
  const bSameYear = oDate.getFullYear() === oNow.getFullYear();
  return oDate.toLocaleDateString('en-GB', bSameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateOnly(sDateOnly) {
  const sValue = String(sDateOnly || '').slice(0, 10);
  if (!isValidDateOnly(sValue)) return '';
  const [sYear, sMonth, sDay] = sValue.split('-');
  return new Date(Number(sYear), Number(sMonth) - 1, Number(sDay)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getInitials(sName) {
  const aParts = String(sName || '').trim().split(/\s+/).filter(Boolean);
  if (!aParts.length) return '?';
  const sInitials = aParts.length === 1 ? aParts[0].slice(0, 2) : aParts[0][0] + aParts[aParts.length - 1][0];
  return sInitials.toUpperCase();
}

// ── Issue query criteria ───────────────────────────────────────
// Criteria are data, not code: the Dataverse service turns them into OData and the mock evaluates them in memory.
// { sProjectId, aStatuses, aAssigneeIds ('none' = unassigned), aTypes, aPriorities, sLabelId, sText,
//   sReporterId, sInvolvedUserId, bOpenOnly, sDueBefore, sModifiedSince, bIncludeArchived,
//   sSprintId ('none' = backlog), aSprintIds, sParentId, aExcludeTypes, sBoardId (extra boards only) }

export function buildMyWorkCriteria(sTab, sUserId, oNow, iRecentDays) {
  const sToday = toDateOnly(oNow);
  switch (sTab) {
    case 'reported':
      return { oCriteria: { sReporterId: sUserId }, aOrderBy: ['modifiedon desc'] };
    case 'overdue':
      return { oCriteria: { aAssigneeIds: [sUserId], bOpenOnly: true, sDueBefore: sToday }, aOrderBy: ['wd_duedate asc'] };
    case 'recent':
      return { oCriteria: { sInvolvedUserId: sUserId, sModifiedSince: addDays(oNow, -iRecentDays).toISOString() }, aOrderBy: ['modifiedon desc'] };
    case 'assigned':
    default:
      return { oCriteria: { aAssigneeIds: [sUserId], bOpenOnly: true }, aOrderBy: ['wd_priority desc', 'modifiedon desc'] };
  }
}

function buildOrClause(sField, aValues, fnFormat) {
  if (!aValues || !aValues.length) return '';
  const aParts = aValues.map((value) => `${sField} eq ${fnFormat(value)}`);
  return aParts.length === 1 ? aParts[0] : `(${aParts.join(' or ')})`;
}

// oNames maps logical concepts to OData navigation names, e.g. { sLabelCollection: 'wd_issue_issuelabel' }.
export function buildIssueFilter(oCriteria, oNames = {}) {
  const aClauses = [];
  if (!oCriteria.bIncludeArchived) aClauses.push('(wd_archived eq false or wd_archived eq null)');
  if (oCriteria.sProjectId) aClauses.push(`_wd_project_value eq ${assertGuid(oCriteria.sProjectId, 'project')}`);
  if (oCriteria.aStatuses && oCriteria.aStatuses.length) {
    aClauses.push(buildOrClause('wd_status', oCriteria.aStatuses.filter(isValidStatus), Number));
  }
  if (oCriteria.bOpenOnly) DONE_STATUSES.forEach((iStatus) => aClauses.push(`wd_status ne ${iStatus}`));
  if (oCriteria.aTypes && oCriteria.aTypes.length) aClauses.push(buildOrClause('wd_issuetype', oCriteria.aTypes.filter(isValidIssueType), Number));
  if (oCriteria.aPriorities && oCriteria.aPriorities.length) aClauses.push(buildOrClause('wd_priority', oCriteria.aPriorities.filter(isValidPriority), Number));
  if (oCriteria.aAssigneeIds && oCriteria.aAssigneeIds.length) {
    aClauses.push(buildOrClause('_wd_assignee_value', oCriteria.aAssigneeIds, (sId) => (sId === 'none' ? 'null' : assertGuid(sId, 'assignee'))));
  }
  if (oCriteria.sReporterId) aClauses.push(`_createdby_value eq ${assertGuid(oCriteria.sReporterId, 'reporter')}`);
  if (oCriteria.sInvolvedUserId) {
    const sUser = assertGuid(oCriteria.sInvolvedUserId, 'user');
    aClauses.push(`(_wd_assignee_value eq ${sUser} or _createdby_value eq ${sUser})`);
  }
  if (oCriteria.sDueBefore) {
    if (!isValidDateOnly(oCriteria.sDueBefore)) throw createDomainError(ERROR_CODES.validation, 'Invalid date filter.');
    aClauses.push(`wd_duedate lt ${oCriteria.sDueBefore}`);
  }
  if (oCriteria.sModifiedSince) {
    const oSince = new Date(oCriteria.sModifiedSince);
    if (Number.isNaN(oSince.getTime())) throw createDomainError(ERROR_CODES.validation, 'Invalid date filter.');
    aClauses.push(`modifiedon ge ${oSince.toISOString()}`);
  }
  if (oCriteria.sLabelId) {
    if (!oNames.sLabelCollection) throw createDomainError(ERROR_CODES.validation, 'Label filter is unavailable.');
    // Lambda paths use '/'; 'o._x' is parsed as a type cast and Dataverse rejects it.
    aClauses.push(`${oNames.sLabelCollection}/any(o:o/_wd_label_value eq ${assertGuid(oCriteria.sLabelId, 'label')})`);
  }
  if (oCriteria.sBoardId) {
    if (!oNames.sBoardCollection) throw createDomainError(ERROR_CODES.validation, 'Board filter is unavailable.');
    aClauses.push(`${oNames.sBoardCollection}/any(o:o/_wd_board_value eq ${assertGuid(oCriteria.sBoardId, 'board')})`);
  }
  if (oCriteria.sSprintId) {
    aClauses.push(oCriteria.sSprintId === 'none' ? '_wd_sprint_value eq null' : `_wd_sprint_value eq ${assertGuid(oCriteria.sSprintId, 'sprint')}`);
  }
  if (oCriteria.aSprintIds && oCriteria.aSprintIds.length) aClauses.push(buildOrClause('_wd_sprint_value', oCriteria.aSprintIds, (sId) => assertGuid(sId, 'sprint')));
  if (oCriteria.sParentId) aClauses.push(`_wd_parentissue_value eq ${assertGuid(oCriteria.sParentId, 'parent')}`);
  if (oCriteria.sFixVersionId) {
    aClauses.push(oCriteria.sFixVersionId === 'none' ? '_wd_fixversion_value eq null' : `_wd_fixversion_value eq ${assertGuid(oCriteria.sFixVersionId, 'version')}`);
  }
  if (oCriteria.aExcludeTypes && oCriteria.aExcludeTypes.length) {
    oCriteria.aExcludeTypes.filter(isValidIssueType).forEach((iType) => aClauses.push(`wd_issuetype ne ${Number(iType)}`));
  }
  const sText = String(oCriteria.sText || '').trim();
  if (sText) {
    const sEscaped = escapeODataString(sText);
    const oKey = parseIssueKey(sText);
    aClauses.push(oKey
      ? `(wd_issuekey eq '${escapeODataString(`${oKey.sProjectKey}-${oKey.iSequence}`)}' or contains(wd_summary,'${sEscaped}'))`
      : `(contains(wd_summary,'${sEscaped}') or contains(wd_issuekey,'${sEscaped}'))`);
  }
  if (oCriteria.oQuery) aClauses.push(`(${buildQueryFilter(oCriteria.oQuery, oNames)})`);
  return aClauses.filter(Boolean).join(' and ');
}

// In-memory equivalent of buildIssueFilter, used by the local mock and tests.
// oQueryContext (advanced queries only): { sUserId, oNow, aCustomFields, oCustomValues: { fieldId: value } }.
export function matchesIssueCriteria(oIssue, oCriteria, aIssueLabelIds = [], aIssueBoardIds = [], oQueryContext = {}) {
  if (!oCriteria.bIncludeArchived && oIssue.bArchived) return false;
  if (oCriteria.sProjectId && oIssue.sProjectId !== oCriteria.sProjectId) return false;
  if (oCriteria.aStatuses && oCriteria.aStatuses.length && !oCriteria.aStatuses.includes(oIssue.iStatus)) return false;
  if (oCriteria.bOpenOnly && isDoneStatus(oIssue.iStatus)) return false;
  if (oCriteria.aTypes && oCriteria.aTypes.length && !oCriteria.aTypes.includes(oIssue.iType)) return false;
  if (oCriteria.aPriorities && oCriteria.aPriorities.length && !oCriteria.aPriorities.includes(oIssue.iPriority)) return false;
  if (oCriteria.aAssigneeIds && oCriteria.aAssigneeIds.length && !oCriteria.aAssigneeIds.includes(oIssue.sAssigneeId || 'none')) return false;
  if (oCriteria.sReporterId && oIssue.sReporterId !== oCriteria.sReporterId) return false;
  if (oCriteria.sInvolvedUserId && oIssue.sAssigneeId !== oCriteria.sInvolvedUserId && oIssue.sReporterId !== oCriteria.sInvolvedUserId) return false;
  if (oCriteria.sDueBefore && !(oIssue.sDueDate && oIssue.sDueDate < oCriteria.sDueBefore)) return false;
  if (oCriteria.sModifiedSince && !(oIssue.sModifiedOn >= new Date(oCriteria.sModifiedSince).toISOString())) return false;
  if (oCriteria.sLabelId && !aIssueLabelIds.includes(oCriteria.sLabelId)) return false;
  if (oCriteria.sBoardId && !aIssueBoardIds.includes(oCriteria.sBoardId)) return false;
  if (oCriteria.sSprintId && (oIssue.sSprintId || 'none') !== oCriteria.sSprintId) return false;
  if (oCriteria.aSprintIds && oCriteria.aSprintIds.length && !oCriteria.aSprintIds.includes(oIssue.sSprintId)) return false;
  if (oCriteria.sParentId && oIssue.sParentId !== oCriteria.sParentId) return false;
  if (oCriteria.sFixVersionId && (oIssue.sFixVersionId || 'none') !== oCriteria.sFixVersionId) return false;
  if (oCriteria.aExcludeTypes && oCriteria.aExcludeTypes.includes(oIssue.iType)) return false;
  const sText = String(oCriteria.sText || '').trim().toLowerCase();
  if (sText && !oIssue.sSummary.toLowerCase().includes(sText) && !oIssue.sKey.toLowerCase().includes(sText)) return false;
  if (oCriteria.oQuery && !matchesQuery(oIssue, oCriteria.oQuery, { ...oQueryContext, aLabelIds: aIssueLabelIds })) return false;
  return true;
}

// ── Custom fields ──────────────────────────────────────────────
// Definitions are configuration only: values are typed, validated here and again by the value plug-in.

export const getCustomFieldType = (iValue) => findOption(CUSTOM_FIELD_TYPES, iValue);
const customTypeKey = (oField) => (getCustomFieldType(oField.iType) || {}).key || '';

export function parseChoiceOptions(sText) {
  return [...new Set(String(sText || '').split(/\r?\n/).map((sLine) => sLine.trim()).filter(Boolean))];
}

export function validateCustomFieldDraft(oDraft) {
  const oErrors = {};
  const sName = String(oDraft.sName || '').trim();
  if (!sName) oErrors.sName = 'Field name is required.';
  else if (sName.length > LIMITS.customFieldNameMax) oErrors.sName = `Keep the name under ${LIMITS.customFieldNameMax} characters.`;
  if (!getCustomFieldType(oDraft.iType)) oErrors.iType = 'Choose a field type.';
  if (Number(oDraft.iType) === CUSTOM_FIELD_TYPES[4].value) {
    const aOptions = parseChoiceOptions(oDraft.sOptions);
    if (!aOptions.length) oErrors.sOptions = 'Add at least one option, one per line.';
    else if (aOptions.length > LIMITS.customFieldOptionsMax) oErrors.sOptions = `Use at most ${LIMITS.customFieldOptionsMax} options.`;
    else if (aOptions.some((sOption) => sOption.length > LIMITS.customFieldOptionMax)) oErrors.sOptions = `Keep each option under ${LIMITS.customFieldOptionMax} characters.`;
  }
  if ((oDraft.aIssueTypes || []).some((iType) => !isValidIssueType(iType))) oErrors.aIssueTypes = 'Choose valid issue types.';
  if (String(oDraft.sDescription || '').length > LIMITS.customFieldDescriptionMax) oErrors.sDescription = `Keep the help text under ${LIMITS.customFieldDescriptionMax} characters.`;
  return { bValid: Object.keys(oErrors).length === 0, oErrors };
}

export const customFieldAppliesTo = (oField, iIssueType) => !oField.aIssueTypes || !oField.aIssueTypes.length || oField.aIssueTypes.includes(Number(iIssueType));

// Converts form input into the stored type. Blank always means "no value".
export function normaliseCustomFieldValue(oField, rawValue) {
  if (rawValue === null || rawValue === undefined || (typeof rawValue === 'string' && !rawValue.trim())) return { value: null, sError: '' };
  const sText = String(rawValue).trim();
  switch (customTypeKey(oField)) {
    case 'text':
      return sText.length > LIMITS.customFieldTextMax ? { value: null, sError: `Keep ${oField.sName} under ${LIMITS.customFieldTextMax} characters.` } : { value: sText, sError: '' };
    case 'number': {
      const iNumber = /^-?\d{1,13}(\.\d{1,4})?$/.test(sText) ? Number(sText) : NaN;
      return Number.isFinite(iNumber) && Math.abs(iNumber) <= LIMITS.customFieldNumberMax ? { value: iNumber, sError: '' } : { value: null, sError: `${oField.sName} must be a number (up to 4 decimal places).` };
    }
    case 'date':
      return isValidDateOnly(sText) ? { value: sText, sError: '' } : { value: null, sError: `${oField.sName} must be a valid date.` };
    case 'boolean':
      if (rawValue === true || /^(true|yes)$/i.test(sText)) return { value: true, sError: '' };
      if (rawValue === false || /^(false|no)$/i.test(sText)) return { value: false, sError: '' };
      return { value: null, sError: `${oField.sName} must be Yes or No.` };
    case 'choice':
      return parseChoiceOptions(oField.sOptions).includes(sText) ? { value: sText, sError: '' } : { value: null, sError: `Choose one of the ${oField.sName} options.` };
    default:
      return { value: null, sError: 'Unknown field type.' };
  }
}

export function formatCustomFieldValue(oField, value) {
  if (value === null || value === undefined || value === '') return '';
  switch (customTypeKey(oField)) {
    case 'boolean': return value === true ? 'Yes' : 'No';
    case 'date': return formatDateOnly(value);
    default: return String(value);
  }
}

// ── Saved filters ──────────────────────────────────────────────
// Only these criteria can be saved. 'me' in assignees resolves to whoever runs the filter.

const FILTER_ID_LISTS = Object.freeze({ aStatuses: isValidStatus, aTypes: isValidIssueType, aPriorities: isValidPriority });

export function sanitiseFilterCriteria(oRaw) {
  const oInput = oRaw && typeof oRaw === 'object' && !Array.isArray(oRaw) ? oRaw : {};
  const oClean = {};
  const sText = String(oInput.sText || '').trim().slice(0, LIMITS.summaryMax);
  if (sText) oClean.sText = sText;
  Object.entries(FILTER_ID_LISTS).forEach(([sKey, fnValid]) => {
    const aValues = Array.isArray(oInput[sKey]) ? [...new Set(oInput[sKey].map(Number).filter(fnValid))] : [];
    if (aValues.length) oClean[sKey] = aValues;
  });
  const aAssignees = Array.isArray(oInput.aAssigneeIds) ? [...new Set(oInput.aAssigneeIds.map((sId) => String(sId).toLowerCase()).filter((sId) => sId === 'me' || sId === 'none' || isGuid(sId)))] : [];
  if (aAssignees.length) oClean.aAssigneeIds = aAssignees;
  if (isGuid(String(oInput.sLabelId || ''))) oClean.sLabelId = String(oInput.sLabelId).toLowerCase();
  if (oInput.sSprintId === 'none' || isGuid(String(oInput.sSprintId || ''))) oClean.sSprintId = String(oInput.sSprintId).toLowerCase();
  if (oInput.sFixVersionId === 'none' || isGuid(String(oInput.sFixVersionId || ''))) oClean.sFixVersionId = String(oInput.sFixVersionId).toLowerCase();
  if (oInput.bOpenOnly === true) oClean.bOpenOnly = true;
  const oQuery = sanitiseQuery(oInput.oQuery);
  if (oQuery) oClean.oQuery = oQuery;
  return oClean;
}

export const serialiseFilterCriteria = (oCriteria) => JSON.stringify(sanitiseFilterCriteria(oCriteria));

export function parseFilterCriteria(sJson) {
  try {
    return sanitiseFilterCriteria(JSON.parse(String(sJson || '{}')));
  } catch (oError) {
    return {};
  }
}

// The project is always forced, so a shared filter can never widen the query beyond the project it was saved in.
export function resolveFilterCriteria(oCriteria, sUserId, sProjectId) {
  const oClean = sanitiseFilterCriteria(oCriteria);
  if (oClean.aAssigneeIds) oClean.aAssigneeIds = oClean.aAssigneeIds.map((sId) => (sId === 'me' ? sUserId : sId));
  if (oClean.oQuery) oClean.oQuery = resolveQueryUser(oClean.oQuery, sUserId);
  return { ...oClean, sProjectId };
}

export function validateSavedFilterDraft(oDraft) {
  const oErrors = {};
  const sName = String(oDraft.sName || '').trim();
  if (!sName) oErrors.sName = 'Give the filter a name.';
  else if (sName.length > LIMITS.savedFilterNameMax) oErrors.sName = `Keep the name under ${LIMITS.savedFilterNameMax} characters.`;
  if (!findOption(FILTER_VISIBILITY, oDraft.iVisibility)) oErrors.iVisibility = 'Choose who can use this filter.';
  if (serialiseFilterCriteria(oDraft.oCriteria).length > LIMITS.savedFilterCriteriaMax) oErrors.oCriteria = 'This filter is too long to save.';
  return { bValid: Object.keys(oErrors).length === 0, oErrors };
}

export const isFilterShared = (iVisibility) => Number(iVisibility) === FILTER_VISIBILITY[1].value;

// ── Bulk edit ──────────────────────────────────────────────────
// oChange: { sField, value, iResolution? }. Only allowlisted fields; each issue is still validated by the server.

export function validateBulkChange(oChange, iIssueCount) {
  const sField = oChange && oChange.sField;
  if (!BULK_FIELDS.some((oField) => oField.key === sField)) throw createDomainError(ERROR_CODES.validation, 'Choose a field to change.');
  if (!iIssueCount) throw createDomainError(ERROR_CODES.validation, 'Select at least one issue.');
  if (iIssueCount > LIMITS.bulkEditMax) throw createDomainError(ERROR_CODES.validation, `Bulk edit handles up to ${LIMITS.bulkEditMax} issues at a time.`);
  const value = oChange.value;
  const fnFail = (sMessage) => { throw createDomainError(ERROR_CODES.validation, sMessage, { value: sMessage }); };
  switch (sField) {
    case 'status':
      if (!isValidStatus(value)) fnFail('Choose a status.');
      if (oChange.iResolution !== undefined && oChange.iResolution !== null && !isValidResolution(oChange.iResolution)) fnFail('Choose a valid resolution.');
      return { sField, value: Number(value), iResolution: isValidResolution(oChange.iResolution) ? Number(oChange.iResolution) : null };
    case 'assignee':
    case 'sprint':
      if (value && !isGuid(value)) fnFail(sField === 'assignee' ? 'Choose a valid person.' : 'Choose a valid sprint.');
      return { sField, value: value ? String(value).toLowerCase() : '' };
    case 'priority':
      if (!isValidPriority(value)) fnFail('Choose a priority.');
      return { sField, value: Number(value) };
    case 'dueDate':
      if (value && !isValidDateOnly(value)) fnFail('Enter a valid date.');
      return { sField, value: value || '' };
    default: {
      const sLabel = normaliseLabel(value);
      if (!sLabel) fnFail('Enter a label.');
      return { sField, value: sLabel };
    }
  }
}

function bulkDisplay(sField, oIssue, oLookups) {
  switch (sField) {
    case 'status': return getIssueStatus(oIssue.iStatus).label;
    case 'assignee': return oIssue.sAssigneeId ? oIssue.sAssigneeName || 'Assigned' : 'Unassigned';
    case 'priority': return getPriority(oIssue.iPriority).label;
    case 'sprint': return oIssue.sSprintId ? oIssue.sSprintName || (oLookups.oSprintNames || {})[oIssue.sSprintId] || 'Sprint' : 'Backlog';
    case 'dueDate': return formatDateOnly(oIssue.sDueDate) || 'None';
    default: return (oIssue.aLabels || []).map((oLabel) => oLabel.sName || oLabel).join(', ') || 'None';
  }
}

function bulkTargetDisplay(oChange, oLookups) {
  switch (oChange.sField) {
    case 'status': return getIssueStatus(oChange.value).label;
    case 'assignee': return oChange.value ? oLookups.sAssigneeName || 'Assigned' : 'Unassigned';
    case 'priority': return getPriority(oChange.value).label;
    case 'sprint': return oChange.value ? (oLookups.oSprintNames || {})[oChange.value] || 'Sprint' : 'Backlog';
    case 'dueDate': return formatDateOnly(oChange.value) || 'None';
    default: return `+ ${oChange.value}`;
  }
}

function bulkIsSame(oChange, oIssue) {
  switch (oChange.sField) {
    case 'status': return oIssue.iStatus === oChange.value;
    case 'assignee': return (oIssue.sAssigneeId || '') === oChange.value;
    case 'priority': return oIssue.iPriority === oChange.value;
    case 'sprint': return (oIssue.sSprintId || '') === oChange.value;
    case 'dueDate': return (oIssue.sDueDate || '') === oChange.value;
    default: return (oIssue.aLabels || []).some((oLabel) => (oLabel.sName || oLabel) === oChange.value);
  }
}

// Preview rows: sOutcome 'change' | 'skip' (already that value) | 'blocked' (would fail validation; not attempted).
export function planBulkEdit(aIssues, oChange, oLookups = {}) {
  const oWorkflow = oLookups.oWorkflow || DEFAULT_WORKFLOW;
  const sTo = bulkTargetDisplay(oChange, oLookups);
  const aRows = aIssues.map((oIssue) => {
    const oRow = { sIssueId: oIssue.sId, sKey: oIssue.sKey, sSummary: oIssue.sSummary, sFrom: bulkDisplay(oChange.sField, oIssue, oLookups), sTo, sOutcome: 'change', sReason: '' };
    if (oIssue.bArchived) return { ...oRow, sOutcome: 'blocked', sReason: getErrorMessage(ERROR_CODES.issueArchived) };
    if (bulkIsSame(oChange, oIssue)) return { ...oRow, sOutcome: 'skip', sReason: 'Already set' };
    if (oChange.sField === 'addLabel' && normaliseLabels([...(oIssue.aLabels || []).map((oLabel) => oLabel.sName || oLabel), oChange.value]).length > LIMITS.labelsPerIssue) {
      return { ...oRow, sOutcome: 'blocked', sReason: `Already has ${LIMITS.labelsPerIssue} labels.` };
    }
    if (oChange.sField === 'status') {
      if (!canTransition(oIssue.iStatus, oChange.value, oWorkflow)) return { ...oRow, sOutcome: 'blocked', sReason: `The workflow doesn't allow ${oRow.sFrom} → ${sTo}.` };
      const oErrors = validateTransitionFields(getTransitionRequirements(oIssue.iStatus, oChange.value, oWorkflow), { ...oIssue, iResolution: oChange.iResolution });
      if (Object.keys(oErrors).length) return { ...oRow, sOutcome: 'blocked', sReason: Object.values(oErrors).join(' ') };
    }
    return oRow;
  });
  return {
    aRows,
    iChange: aRows.filter((oRow) => oRow.sOutcome === 'change').length,
    iSkip: aRows.filter((oRow) => oRow.sOutcome === 'skip').length,
    iBlocked: aRows.filter((oRow) => oRow.sOutcome === 'blocked').length,
  };
}

export function describeBulkChange(oChange, oLookups = {}) {
  const oField = BULK_FIELDS.find((oItem) => oItem.key === oChange.sField);
  return oChange.sField === 'addLabel' ? `Label + ${oChange.value}` : `${oField ? oField.label : 'Field'} → ${bulkTargetDisplay(oChange, oLookups)}`;
}

// ── Notifications ──────────────────────────────────────────────
// Rows never carry issue summaries: only the issue lookup, event and a short safe detail. Recipients must be project members.

export const getNotificationEvent = (iValue) => findOption(NOTIFICATION_EVENTS, iValue);
const NOTIFY = Object.freeze(Object.fromEntries(NOTIFICATION_EVENTS.map((oEvent) => [oEvent.key, oEvent.value])));
const NOTIFICATION_RANK = Object.freeze([NOTIFY.mentioned, NOTIFY.assigned, NOTIFY.status, NOTIFY.comment, NOTIFY.bulk]);

export function normaliseNotificationPreferences(oRaw) {
  const oInput = oRaw || {};
  return Object.fromEntries(Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([sKey, bDefault]) => [sKey, typeof oInput[sKey] === 'boolean' ? oInput[sKey] : bDefault]));
}

export function enabledNotificationEvents(oPreferences) {
  const oPrefs = normaliseNotificationPreferences(oPreferences);
  return NOTIFICATION_EVENTS.filter((oEvent) => oPrefs[oEvent.sPreference]).map((oEvent) => oEvent.value);
}

const escapeRegExp = (sText) => String(sText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "@Full Name" mentions of current project members. Longest names are matched first and removed from the text,
// so "@Sam Ortiz" never also counts as a mention of a member called "Sam".
export function extractMentions(sBody, aMembers) {
  let sText = String(sBody || '');
  const aIds = [];
  [...aMembers].filter((oMember) => oMember.sUserName).sort((oA, oB) => oB.sUserName.length - oA.sUserName.length).forEach((oMember) => {
    let bFound = false;
    sText = sText.replace(new RegExp(`(^|[^\\w@])@${escapeRegExp(oMember.sUserName)}(?![\\w])`, 'gi'), (sMatch, sBefore) => {
      bFound = true;
      return `${sBefore} `;
    });
    if (bFound) aIds.push(oMember.sUserId);
  });
  return [...new Set(aIds)];
}

// One notification per recipient per action, keeping the most specific event; the actor and non-members are dropped.
export function finaliseNotifications(aPlans, sActorId, aMemberIds) {
  const oByRecipient = new Map();
  aPlans.filter((oPlan) => isGuid(oPlan.sRecipientId || '') && oPlan.sRecipientId !== sActorId && aMemberIds.includes(oPlan.sRecipientId)).forEach((oPlan) => {
    const oCurrent = oByRecipient.get(oPlan.sRecipientId);
    if (!oCurrent || NOTIFICATION_RANK.indexOf(oPlan.iEvent) < NOTIFICATION_RANK.indexOf(oCurrent.iEvent)) {
      oByRecipient.set(oPlan.sRecipientId, { ...oPlan, sDetail: truncateText(oPlan.sDetail || '', LIMITS.notificationDetailMax) });
    }
  });
  return [...oByRecipient.values()];
}

const watchers = (oIssue) => [oIssue.sAssigneeId, oIssue.sReporterId].filter(Boolean);

export const planAssignmentNotifications = (oIssue, sNewAssigneeId) => (sNewAssigneeId && sNewAssigneeId !== oIssue.sAssigneeId
  ? [{ sRecipientId: sNewAssigneeId, iEvent: NOTIFY.assigned, sDetail: 'assigned you' }] : []);

export const planStatusNotifications = (oIssue, iFromStatus, iToStatus) => watchers(oIssue)
  .map((sRecipientId) => ({ sRecipientId, iEvent: NOTIFY.status, sDetail: `${getIssueStatus(iFromStatus).label} → ${getIssueStatus(iToStatus).label}` }));

export const planCommentNotifications = (oIssue, aMentionIds) => [
  ...aMentionIds.map((sRecipientId) => ({ sRecipientId, iEvent: NOTIFY.mentioned, sDetail: 'mentioned you in a comment' })),
  ...watchers(oIssue).map((sRecipientId) => ({ sRecipientId, iEvent: NOTIFY.comment, sDetail: 'commented' })),
];

// Bulk edits send one summary per person (no per-issue storm), without issue details.
export function planBulkNotifications(aChangedIssues, sDescription) {
  const oCounts = new Map();
  aChangedIssues.forEach((oIssue) => new Set(watchers(oIssue)).forEach((sId) => oCounts.set(sId, (oCounts.get(sId) || 0) + 1)));
  return [...oCounts.entries()].map(([sRecipientId, iCount]) => ({
    sRecipientId, iEvent: NOTIFY.bulk, iCount, sDetail: `${iCount === 1 ? 'One of your issues' : `${iCount} of your issues`} changed: ${sDescription}`,
  }));
}

// ── Attachments ────────────────────────────────────────────────

export function sanitiseFileName(sName) {
  const sBase = String(sName || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  if (!sBase || /^\.+$/.test(sBase)) return 'attachment';
  if (sBase.length <= LIMITS.attachmentNameMax) return sBase;
  const iDot = sBase.lastIndexOf('.');
  const sExtension = iDot > 0 && sBase.length - iDot <= 12 ? sBase.slice(iDot) : '';
  return sBase.slice(0, LIMITS.attachmentNameMax - sExtension.length) + sExtension;
}

export function getFileExtension(sName) {
  const aMatch = /\.([A-Za-z0-9]{1,10})$/.exec(String(sName || ''));
  return aMatch ? aMatch[1].toLowerCase() : '';
}

export function validateAttachment(oFile, iExistingCount = 0) {
  const sName = sanitiseFileName(oFile && oFile.sName);
  if (!oFile || !Number.isFinite(oFile.iSize) || oFile.iSize <= 0) return 'That file is empty.';
  if (oFile.iSize > LIMITS.attachmentMaxBytes) return `Files can be up to ${formatFileSize(LIMITS.attachmentMaxBytes)}.`;
  if (BLOCKED_ATTACHMENT_EXTENSIONS.includes(getFileExtension(sName))) return `.${getFileExtension(sName)} files can't be attached for security reasons.`;
  if (iExistingCount >= LIMITS.attachmentsPerIssue) return `An issue can have up to ${LIMITS.attachmentsPerIssue} attachments.`;
  return '';
}

export function formatFileSize(iBytes) {
  const iValue = Number(iBytes) || 0;
  if (iValue < 1024) return `${iValue} B`;
  if (iValue < 1024 * 1024) return `${Math.round(iValue / 102.4) / 10} KB`;
  return `${Math.round(iValue / 104857.6) / 10} MB`;
}

// ── Feature flags (Phase 4) ────────────────────────────────────

export const isFeatureEnabled = (sKey) => FEATURES[sKey] === true;

export function assertFeature(sKey) {
  if (!isFeatureEnabled(sKey)) throw createDomainError(ERROR_CODES.featureDisabled);
}

// ── Time tracking (Phase 4) ────────────────────────────────────
// Whole minutes. Estimates are plans; work logs are what actually happened, and only logs add up to time spent.

const MINUTES_PER_DAY = TIME_TRACKING.iHoursPerDay * TIME_TRACKING.iMinutesPerHour;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * TIME_TRACKING.iDaysPerWeek;
const DURATION_UNITS = Object.freeze([['w', MINUTES_PER_WEEK], ['d', MINUTES_PER_DAY], ['h', TIME_TRACKING.iMinutesPerHour], ['m', 1]]);
const DURATION_FORMAT = /^(?:\d{1,6}(?:\.\d{1,2})?[wdhm])+$/;
const DURATION_HINT = 'Use a duration like 2h 30m, 1d or 1w (1d = 8h, 1w = 5d).';

export function formatDuration(iMinutes) {
  if (iMinutes === null || iMinutes === undefined || iMinutes === '' || !Number.isFinite(Number(iMinutes))) return '';
  let iRest = Math.max(0, Math.round(Number(iMinutes)));
  if (!iRest) return '0m';
  const aParts = [];
  DURATION_UNITS.forEach(([sUnit, iSize]) => {
    const iCount = Math.floor(iRest / iSize);
    if (iCount) {
      aParts.push(`${iCount}${sUnit}`);
      iRest -= iCount * iSize;
    }
  });
  return aParts.join(' ');
}

// Blank means "no value". Bare numbers are refused because "2" could mean minutes, hours or days.
export function parseDuration(value, iMax = LIMITS.estimateMaxMinutes) {
  const sText = String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, '');
  if (!sText) return { iMinutes: null, sError: '' };
  if (!DURATION_FORMAT.test(sText)) return { iMinutes: null, sError: DURATION_HINT };
  const aParts = [...sText.matchAll(/(\d{1,6}(?:\.\d{1,2})?)([wdhm])/g)];
  if (new Set(aParts.map((aPart) => aPart[2])).size !== aParts.length) return { iMinutes: null, sError: 'Use each unit once, e.g. 1d 4h.' };
  const iMinutes = Math.round(aParts.reduce((iSum, aPart) => iSum + Number(aPart[1]) * DURATION_UNITS.find(([sUnit]) => sUnit === aPart[2])[1], 0));
  if (iMinutes > iMax) return { iMinutes: null, sError: `Keep it under ${formatDuration(iMax)}.` };
  return { iMinutes, sError: '' };
}

export const isValidEstimate = (iMinutes) => Number.isInteger(iMinutes) && iMinutes >= 0 && iMinutes <= LIMITS.estimateMaxMinutes;

// oDraft: { iMinutes, sWorkDate, sComment }. sToday is the user's local date, so "today" never depends on UTC.
export function validateWorkLog(oDraft, sToday) {
  const oErrors = {};
  const iMinutes = oDraft.iMinutes;
  if (!Number.isInteger(iMinutes) || iMinutes < 1 || iMinutes > LIMITS.workLogMaxMinutes) {
    oErrors.iMinutes = 'Log between 1m and 24h per entry. Split longer work into several logs.';
  }
  const sDate = String(oDraft.sWorkDate || '');
  if (!isValidDateOnly(sDate)) oErrors.sWorkDate = 'Enter the date the work was done.';
  else if (sDate > toDateOnly(addDays(new Date(`${sToday}T12:00:00`), 1))) oErrors.sWorkDate = 'The work date can\'t be in the future.';
  else if (sDate < toDateOnly(addDays(new Date(`${sToday}T12:00:00`), -LIMITS.workLogMaxAgeDays))) oErrors.sWorkDate = 'Work older than a year can\'t be logged.';
  if (String(oDraft.sComment || '').length > LIMITS.workLogCommentMax) oErrors.sComment = `Keep the comment under ${LIMITS.workLogCommentMax} characters.`;
  return { bValid: Object.keys(oErrors).length === 0, oErrors };
}

export function validateVoidReason(sReason) {
  const sText = String(sReason || '').trim();
  if (!sText) return 'Say why this work log is being voided.';
  if (sText.length > LIMITS.voidReasonMax) return `Keep the reason under ${LIMITS.voidReasonMax} characters.`;
  return '';
}

// Jira's "adjust automatically": remaining falls by the logged time and never goes below zero.
// With no remaining estimate, it starts from the original estimate minus time already spent.
export function remainingAfterLog(oIssue, iLoggedMinutes) {
  const iSpent = Number(oIssue.iTimeSpent) || 0;
  const iBase = oIssue.iRemainingEstimate ?? (oIssue.iOriginalEstimate === null || oIssue.iOriginalEstimate === undefined ? null : Math.max(0, oIssue.iOriginalEstimate - iSpent));
  return iBase === null ? null : Math.max(0, iBase - iLoggedMinutes);
}

// A new original estimate also becomes the remaining estimate while no work is logged and no remaining is set.
export function remainingForNewEstimate(oIssue, iOriginalEstimate) {
  if ((oIssue.iRemainingEstimate ?? null) !== null || (Number(oIssue.iTimeSpent) || 0) > 0) return undefined;
  return iOriginalEstimate;
}

export const sumWorkLogMinutes = (aLogs) => aLogs.filter((oLog) => !oLog.bVoided).reduce((iSum, oLog) => iSum + (Number(oLog.iMinutes) || 0), 0);

export function summariseIssueTime(oIssue) {
  const iOriginal = oIssue.iOriginalEstimate ?? null;
  const iSpent = Number(oIssue.iTimeSpent) || 0;
  const iRemaining = oIssue.iRemainingEstimate ?? null;
  const iScale = Math.max(iOriginal || 0, iSpent + (iRemaining || 0), 1);
  return {
    iOriginal, iSpent, iRemaining,
    iSpentPercent: Math.round((iSpent / iScale) * 100),
    iRemainingPercent: Math.round(((iRemaining || 0) / iScale) * 100),
    bOverEstimate: iOriginal !== null && iSpent + (iRemaining || 0) > iOriginal,
  };
}

export const describeWorkLog = (oLog) => `${formatDuration(oLog.iMinutes)} on ${formatDateOnly(oLog.sWorkDate)}`;

// ── Versions / releases (Phase 4) ──────────────────────────────

export const getVersionState = (iValue) => findOption(VERSION_STATES, iValue) || VERSION_STATES[0];
export const isVersionArchived = (iState) => Number(iState) === VERSION_STATE.archived;
export const isVersionReleased = (iState) => Number(iState) === VERSION_STATE.released;

export function validateVersionDraft(oDraft) {
  const oErrors = {};
  const sName = String(oDraft.sName || '').trim();
  if (!sName) oErrors.sName = 'Version name is required.';
  else if (sName.length > LIMITS.versionNameMax) oErrors.sName = `Keep the name under ${LIMITS.versionNameMax} characters.`;
  if (String(oDraft.sDescription || '').length > LIMITS.versionDescriptionMax) oErrors.sDescription = `Keep the description under ${LIMITS.versionDescriptionMax} characters.`;
  ['sStartDate', 'sReleaseDate'].forEach((sField) => {
    if (oDraft[sField] && !isValidDateOnly(oDraft[sField])) oErrors[sField] = 'Enter a valid date.';
  });
  if (!oErrors.sStartDate && !oErrors.sReleaseDate && oDraft.sStartDate && oDraft.sReleaseDate && oDraft.sReleaseDate < oDraft.sStartDate) {
    oErrors.sReleaseDate = 'The release date can\'t be before the start date.';
  }
  return { bValid: Object.keys(oErrors).length === 0, oErrors };
}

export const isVersionNameTaken = (aVersions, sName, sExceptId = '') => aVersions.some((oVersion) => oVersion.sId !== sExceptId && oVersion.sName.trim().toLowerCase() === String(sName || '').trim().toLowerCase());

// Releasing never silently drops work: open issues need 'keep', 'none' (clear the fix version) or another version id.
export function planVersionRelease(aIssues, sDestination, sVersionId) {
  const aOpen = aIssues.filter((oIssue) => !oIssue.bArchived && !isDoneStatus(oIssue.iStatus));
  if (aOpen.length && !sDestination) throw createDomainError(ERROR_CODES.versionDestinationRequired);
  if (sDestination && !['keep', 'none'].includes(sDestination) && !isGuid(sDestination)) throw createDomainError(ERROR_CODES.validation, 'Choose a valid destination version.');
  if (sDestination && sDestination === sVersionId) throw createDomainError(ERROR_CODES.validation, 'Choose a different version for the unfinished issues.');
  const bMove = aOpen.length > 0 && sDestination !== 'keep';
  return { aOpen, aMove: bMove ? aOpen : [], sTargetVersionId: bMove && sDestination !== 'none' ? sDestination : '' };
}

export function computeVersionProgress(aIssues) {
  const oMetrics = computeSprintMetrics(aIssues);
  return { ...oMetrics, iPercent: oMetrics.iIssues ? Math.round((oMetrics.iDone / oMetrics.iIssues) * 100) : 0 };
}

// Unreleased first (soonest release date, undated last), then released (newest first), then archived.
export function sortVersions(aVersions) {
  const fnRank = (oVersion) => (isVersionArchived(oVersion.iState) ? 2 : isVersionReleased(oVersion.iState) ? 1 : 0);
  return [...aVersions].sort((oA, oB) => {
    const iRank = fnRank(oA) - fnRank(oB);
    if (iRank) return iRank;
    if (fnRank(oA) === 1) return String(oB.sReleaseDate || oB.sReleasedOn).localeCompare(String(oA.sReleaseDate || oA.sReleasedOn));
    if (oA.sReleaseDate && oB.sReleaseDate && oA.sReleaseDate !== oB.sReleaseDate) return oA.sReleaseDate < oB.sReleaseDate ? -1 : 1;
    if (oA.sReleaseDate !== oB.sReleaseDate) return oA.sReleaseDate ? -1 : 1;
    return oA.sName.localeCompare(oB.sName);
  });
}

export function isVersionOverdue(oVersion, sToday) {
  return Number(oVersion.iState) === VERSION_STATE.unreleased && Boolean(oVersion.sReleaseDate) && oVersion.sReleaseDate < sToday;
}

// Month grid (Monday first) for the release calendar. Released versions without a release date use the day they were released.
export function buildReleaseCalendar(aVersions, iYear, iMonthIndex) {
  const oFirst = new Date(iYear, iMonthIndex, 1);
  const oStart = addDays(oFirst, -((oFirst.getDay() + 6) % 7));
  const oByDate = new Map();
  aVersions.filter((oVersion) => !isVersionArchived(oVersion.iState)).forEach((oVersion) => {
    const sDate = oVersion.sReleaseDate || (isVersionReleased(oVersion.iState) ? String(oVersion.sReleasedOn || '').slice(0, 10) : '');
    if (!isValidDateOnly(sDate)) return;
    oByDate.set(sDate, [...(oByDate.get(sDate) || []), oVersion]);
  });
  const aWeeks = [];
  for (let iWeek = 0; iWeek < 6; iWeek += 1) {
    const aDays = Array.from({ length: 7 }, (unused, iDay) => {
      const oDate = addDays(oStart, iWeek * 7 + iDay);
      const sDate = toDateOnly(oDate);
      return { sDate, iDay: oDate.getDate(), bInMonth: oDate.getMonth() === iMonthIndex, aVersions: oByDate.get(sDate) || [] };
    });
    if (iWeek < 4 || aDays.some((oDay) => oDay.bInMonth)) aWeeks.push(aDays);
  }
  return aWeeks;
}

// ── Advanced query (Phase 4) ───────────────────────────────────
// A query is data: { sJoin: 'and'|'or', aItems: [rule | group] }, one level of nested groups. Rules are
// { sField, sOp, aValues }. Only QUERY_FIELDS (or cf:<custom field id>) and their kind's operators are accepted, values are
// type-checked, strings are escaped, and the result is plain OData run by Dataverse as the signed-in user.

const QUERY_FIELD_MAP = new Map(QUERY_FIELDS.map((oField) => [oField.key, oField]));
const CUSTOM_QUERY_FIELD = /^cf:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const CUSTOM_QUERY_KINDS = Object.freeze({ text: 'cfText', number: 'cfNumber', date: 'cfDate', boolean: 'cfBoolean', choice: 'cfChoice' });
const CUSTOM_OPERATORS = [...new Set(Object.values(CUSTOM_QUERY_KINDS).flatMap((sKind) => QUERY_KIND_OPERATORS[sKind]))];
const VALUELESS_OPERATORS = Object.freeze(['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse']);
const MULTI_VALUE_OPERATORS = Object.freeze(['in', 'notIn', 'hasAny', 'hasNone']);
const DAY_COUNT_OPERATORS = Object.freeze(['lastDays', 'nextDays']);
const CATEGORY_KEYS = STATUS_CATEGORIES.map((oCategory) => oCategory.key);
const CUSTOM_VALUE_COLUMNS = Object.freeze({ cfText: 'wd_textvalue', cfChoice: 'wd_textvalue', cfNumber: 'wd_numbervalue', cfDate: 'wd_datevalue', cfBoolean: 'wd_booleanvalue' });

export function getQueryField(sKey, aCustomFields = []) {
  const oField = QUERY_FIELD_MAP.get(sKey);
  if (oField) return oField;
  const aMatch = CUSTOM_QUERY_FIELD.exec(String(sKey || ''));
  if (!aMatch) return null;
  const oCustom = aCustomFields.find((oItem) => String(oItem.sId).toLowerCase() === aMatch[1].toLowerCase());
  const sKind = oCustom ? CUSTOM_QUERY_KINDS[(getCustomFieldType(oCustom.iType) || {}).key] : '';
  return sKind ? { key: `cf:${aMatch[1].toLowerCase()}`, label: oCustom.sName, kind: sKind, oCustomField: oCustom } : null;
}

export const queryOperatorsFor = (oField) => (oField ? [...(QUERY_KIND_OPERATORS[oField.kind] || [])] : []);
export const queryOperatorTakesValues = (sOp) => !VALUELESS_OPERATORS.includes(sOp);
export const queryOperatorTakesMany = (sOp) => MULTI_VALUE_OPERATORS.includes(sOp);
export const queryOperatorTakesDays = (sOp) => DAY_COUNT_OPERATORS.includes(sOp);

function normaliseQueryValue(sKind, sOp, value) {
  if (DAY_COUNT_OPERATORS.includes(sOp)) {
    const iDays = Number(value);
    return Number.isInteger(iDays) && iDays >= 1 && iDays <= LIMITS.queryDaysMax ? iDays : null;
  }
  switch (sKind) {
    case 'status': return isValidStatus(value) ? Number(value) : null;
    case 'type': return isValidIssueType(value) ? Number(value) : null;
    case 'priority': return isValidPriority(value) ? Number(value) : null;
    case 'resolution': return isValidResolution(value) ? Number(value) : null;
    case 'category': return CATEGORY_KEYS.includes(value) ? value : null;
    case 'user': {
      const sId = String(value || '').toLowerCase();
      return sId === 'me' || isGuid(sId) ? sId : null;
    }
    case 'label': case 'sprint': case 'version': return isGuid(String(value || '')) ? String(value).toLowerCase() : null;
    case 'text': case 'cfText': case 'cfChoice': {
      const sText = typeof value === 'string' ? value.trim() : '';
      return sText && sText.length <= (sKind === 'cfChoice' ? LIMITS.customFieldOptionMax : LIMITS.summaryMax) ? sText : null;
    }
    case 'dateOnly': case 'dateTime': case 'cfDate': return isValidDateOnly(String(value || '')) ? String(value) : null;
    case 'number': case 'cfNumber': {
      const iNumber = typeof value === 'number' ? value : (String(value).trim() ? Number(value) : NaN);
      return Number.isFinite(iNumber) && Math.abs(iNumber) <= LIMITS.customFieldNumberMax ? iNumber : null;
    }
    case 'duration': {
      const iMinutes = Number(value);
      return Number.isInteger(iMinutes) && iMinutes >= 0 && iMinutes <= LIMITS.estimateMaxMinutes * 100 ? iMinutes : null;
    }
    default: return null;
  }
}

// Unknown kinds (custom fields whose definition isn't loaded) keep primitive values; buildQueryFilter re-checks them.
function sanitiseQueryRule(oRaw) {
  if (!oRaw || typeof oRaw !== 'object' || Array.isArray(oRaw)) return null;
  const sField = String(oRaw.sField || '');
  const oField = QUERY_FIELD_MAP.get(sField);
  const bCustom = !oField && CUSTOM_QUERY_FIELD.test(sField);
  if (!oField && !bCustom) return null;
  const sOp = String(oRaw.sOp || '');
  if (!(oField ? QUERY_KIND_OPERATORS[oField.kind] : CUSTOM_OPERATORS).includes(sOp)) return null;
  if (!queryOperatorTakesValues(sOp)) return { sField: bCustom ? sField.toLowerCase() : sField, sOp, aValues: [] };
  const aRaw = (Array.isArray(oRaw.aValues) ? oRaw.aValues : []).slice(0, LIMITS.queryValuesMax);
  const aValues = oField
    ? aRaw.map((value) => normaliseQueryValue(oField.kind, sOp, value)).filter((value) => value !== null)
    : aRaw.filter((value) => (typeof value === 'string' && value.length <= LIMITS.summaryMax) || (typeof value === 'number' && Number.isFinite(value)));
  const aUnique = [...new Set(aValues)];
  if (!aUnique.length) return null;
  return { sField: bCustom ? sField.toLowerCase() : sField, sOp, aValues: queryOperatorTakesMany(sOp) ? aUnique : aUnique.slice(0, 1) };
}

export function sanitiseQuery(oRaw, iDepth = 0) {
  if (!oRaw || typeof oRaw !== 'object' || Array.isArray(oRaw) || !Array.isArray(oRaw.aItems)) return null;
  let iRules = 0;
  const aItems = oRaw.aItems.map((oItem) => {
    if (oItem && Array.isArray(oItem.aItems)) return iDepth === 0 ? sanitiseQuery(oItem, 1) : null;
    return sanitiseQueryRule(oItem);
  }).filter(Boolean).filter((oItem) => {
    iRules += oItem.aItems ? oItem.aItems.length : 1;
    return iRules <= LIMITS.queryRulesMax;
  });
  return aItems.length ? { sJoin: oRaw.sJoin === 'or' ? 'or' : 'and', aItems } : null;
}

export const countQueryRules = (oQuery) => (oQuery ? oQuery.aItems.reduce((iSum, oItem) => iSum + (oItem.aItems ? oItem.aItems.length : 1), 0) : 0);

// Checks a query being edited and reports problems per rule path ('2' or '1.0') instead of dropping them.
export function validateQuery(oDraft, aCustomFields = []) {
  const aErrors = [];
  let iRules = 0;
  const fnRule = (oRule, sPath) => {
    iRules += 1;
    const oField = getQueryField(oRule.sField, aCustomFields);
    if (!oField) { aErrors.push({ sPath, sMessage: 'Choose a field.' }); return; }
    if (!queryOperatorsFor(oField).includes(oRule.sOp)) { aErrors.push({ sPath, sMessage: 'Choose a condition.' }); return; }
    if (!queryOperatorTakesValues(oRule.sOp)) return;
    const aValues = (oRule.aValues || []).map((value) => normaliseQueryValue(oField.kind, oRule.sOp, value));
    if (!aValues.length || aValues.some((value) => value === null)) {
      aErrors.push({ sPath, sMessage: queryOperatorTakesDays(oRule.sOp) ? `Enter a number of days from 1 to ${LIMITS.queryDaysMax}.` : `Enter a valid value for ${oField.label}.` });
    } else if (aValues.length > LIMITS.queryValuesMax) aErrors.push({ sPath, sMessage: `Use at most ${LIMITS.queryValuesMax} values.` });
  };
  const aItems = (oDraft && Array.isArray(oDraft.aItems)) ? oDraft.aItems : [];
  if (!aItems.length) aErrors.push({ sPath: '', sMessage: 'Add at least one condition.' });
  aItems.forEach((oItem, iIndex) => {
    if (oItem && Array.isArray(oItem.aItems)) {
      if (!oItem.aItems.length) aErrors.push({ sPath: String(iIndex), sMessage: 'Add a condition to this group or remove it.' });
      oItem.aItems.forEach((oRule, iRule) => (Array.isArray(oRule.aItems) ? aErrors.push({ sPath: `${iIndex}.${iRule}`, sMessage: 'Groups can\'t be nested more than once.' }) : fnRule(oRule, `${iIndex}.${iRule}`)));
    } else fnRule(oItem || {}, String(iIndex));
  });
  if (iRules > LIMITS.queryRulesMax) aErrors.push({ sPath: '', sMessage: `Use at most ${LIMITS.queryRulesMax} conditions.` });
  return { bValid: aErrors.length === 0, aErrors, oQuery: aErrors.length ? null : sanitiseQuery(oDraft) };
}

export function resolveQueryUser(oQuery, sUserId) {
  const fnItem = (oItem) => (oItem.aItems
    ? { ...oItem, aItems: oItem.aItems.map(fnItem) }
    : { ...oItem, aValues: (QUERY_FIELD_MAP.get(oItem.sField) || {}).kind === 'user' ? oItem.aValues.map((sId) => (sId === 'me' ? sUserId : sId)) : oItem.aValues });
  return { ...oQuery, aItems: oQuery.aItems.map(fnItem) };
}

export function queryUsesFields(oQuery) {
  const aRules = oQuery ? oQuery.aItems.flatMap((oItem) => oItem.aItems || [oItem]) : [];
  return { bLabels: aRules.some((oRule) => oRule.sField === 'label'), bCustomFields: aRules.some((oRule) => CUSTOM_QUERY_FIELD.test(oRule.sField)) };
}

const localDayStartIso = (sDate, iOffset = 0) => {
  const [sYear, sMonth, sDay] = sDate.split('-').map(Number);
  return new Date(sYear, sMonth - 1, sDay + iOffset).toISOString();
};
const odataLiteral = (value, bText = false) => (bText ? `'${escapeODataString(value)}'` : String(value));
const joinClauses = (aClauses, sJoin) => (aClauses.length === 1 ? aClauses[0] : `(${aClauses.join(` ${sJoin} `)})`);

function failQuery(sMessage) {
  throw createDomainError(ERROR_CODES.invalidQuery, sMessage);
}

function checkedRule(oRule, oContext) {
  const oField = getQueryField(oRule.sField, oContext.aCustomFields || []);
  if (!oField) failQuery('A field in this query is no longer available.');
  if (!queryOperatorsFor(oField).includes(oRule.sOp)) failQuery(`That condition can't be used with ${oField.label}.`);
  const aValues = (oRule.aValues || []).map((value) => {
    if (oField.kind === 'user' && value === 'me') {
      if (!isGuid(oContext.sUserId || '')) failQuery('"Me" needs a signed-in user.');
      return oContext.sUserId.toLowerCase();
    }
    const normalised = normaliseQueryValue(oField.kind, oRule.sOp, value);
    if (normalised === null) failQuery(`A value for ${oField.label} isn't valid.`);
    return normalised;
  });
  if (queryOperatorTakesValues(oRule.sOp) && !aValues.length) failQuery(`Enter a value for ${oField.label}.`);
  return { oField, sOp: oRule.sOp, aValues };
}

// Comparisons never match empty values; "is none of" does (so "assignee is none of Sam" includes unassigned issues).
function comparisonClause(sColumn, sOp, value) {
  const sLiteral = odataLiteral(value);
  return sOp === 'ne' ? `(${sColumn} ne null and ${sColumn} ne ${sLiteral})` : `${sColumn} ${sOp} ${sLiteral}`;
}

function listClause(sColumn, sOp, aValues, bNullable) {
  if (sOp === 'in') return joinClauses(aValues.map((value) => `${sColumn} eq ${odataLiteral(value)}`), 'or');
  const sNone = joinClauses(aValues.map((value) => `${sColumn} ne ${odataLiteral(value)}`), 'and');
  return bNullable ? `(${sColumn} eq null or ${sNone})` : sNone;
}

function dateClause(sColumn, sKind, sOp, value, oNow) {
  const sToday = toDateOnly(oNow);
  if (sKind === 'dateOnly' || sKind === 'cfDate') {
    if (sOp === 'before') return `${sColumn} lt ${value}`;
    if (sOp === 'after') return `${sColumn} gt ${value}`;
    if (sOp === 'on') return `${sColumn} eq ${value}`;
    if (sOp === 'lastDays') return `(${sColumn} ge ${toDateOnly(addDays(oNow, -value))} and ${sColumn} le ${sToday})`;
    return `(${sColumn} ge ${sToday} and ${sColumn} le ${toDateOnly(addDays(oNow, value))})`;
  }
  if (sOp === 'before') return `${sColumn} lt ${localDayStartIso(value)}`;
  if (sOp === 'after') return `${sColumn} ge ${localDayStartIso(value, 1)}`;
  if (sOp === 'on') return `(${sColumn} ge ${localDayStartIso(value)} and ${sColumn} lt ${localDayStartIso(value, 1)})`;
  return `${sColumn} ge ${localDayStartIso(sToday, -value)}`;
}

function customRuleClause(oField, sOp, aValues, oContext) {
  if (!oContext.sCustomValueCollection) failQuery('Custom field conditions are unavailable.');
  const sColumn = `o/${CUSTOM_VALUE_COLUMNS[oField.kind]}`;
  const sScope = `o/_wd_customfield_value eq ${assertGuid(oField.oCustomField.sId, 'custom field')}`;
  const fnAny = (sCondition) => `${oContext.sCustomValueCollection}/any(o:${sScope} and ${sCondition})`;
  switch (sOp) {
    case 'isEmpty': return `not ${fnAny(`${sColumn} ne null`)}`;
    case 'isNotEmpty': return fnAny(`${sColumn} ne null`);
    case 'isTrue': return fnAny(`${sColumn} eq true`);
    case 'isFalse': return fnAny(`${sColumn} eq false`);
    case 'contains': return fnAny(`contains(${sColumn},${odataLiteral(aValues[0], true)})`);
    case 'notContains': return `not ${fnAny(`contains(${sColumn},${odataLiteral(aValues[0], true)})`)}`;
    case 'in': return fnAny(joinClauses(aValues.map((value) => `${sColumn} eq ${odataLiteral(value, true)}`), 'or'));
    case 'notIn': return `not ${fnAny(joinClauses(aValues.map((value) => `${sColumn} eq ${odataLiteral(value, true)}`), 'or'))}`;
    case 'before': case 'after': case 'on': return fnAny(dateClause(sColumn, 'cfDate', sOp, aValues[0], oContext.oNow || new Date()));
    default: return fnAny(`${sColumn} ${sOp} ${odataLiteral(aValues[0])}`);
  }
}

function ruleClause(oRule, oContext) {
  const { oField, sOp, aValues } = checkedRule(oRule, oContext);
  const sColumn = oField.column;
  if (oField.oCustomField) return customRuleClause(oField, sOp, aValues, oContext);
  if (sOp === 'isEmpty') return `${sColumn} eq null`;
  if (sOp === 'isNotEmpty') return `${sColumn} ne null`;
  switch (oField.kind) {
    case 'category': {
      const aStatuses = ISSUE_STATUSES.filter((oStatus) => aValues.includes(oStatus.category)).map((oStatus) => oStatus.value);
      return listClause(sColumn, sOp, aStatuses, false);
    }
    case 'status': case 'type': case 'priority': return listClause(sColumn, sOp, aValues, false);
    case 'resolution': case 'user': case 'sprint': case 'version': return listClause(sColumn, sOp, aValues, true);
    case 'label': {
      if (!oContext.sLabelCollection) failQuery('Label conditions are unavailable.');
      const sAny = `${oContext.sLabelCollection}/any(o:${joinClauses(aValues.map((sId) => `o/_wd_label_value eq ${sId}`), 'or')})`;
      return sOp === 'hasNone' ? `not ${sAny}` : sAny;
    }
    case 'text': {
      const sContains = `contains(${sColumn},${odataLiteral(aValues[0], true)})`;
      return sOp === 'notContains' ? `not ${sContains}` : sContains;
    }
    case 'dateOnly': case 'dateTime': return dateClause(sColumn, oField.kind, sOp, aValues[0], oContext.oNow || new Date());
    default: return comparisonClause(sColumn, sOp, aValues[0]);
  }
}

// oContext: { sUserId, oNow, aCustomFields, sLabelCollection, sCustomValueCollection }.
export function buildQueryFilter(oQuery, oContext = {}) {
  const oClean = sanitiseQuery(oQuery);
  if (!oClean) failQuery('Add at least one condition.');
  const fnGroup = (oGroup) => joinClauses(oGroup.aItems.map((oItem) => (oItem.aItems ? fnGroup(oItem) : ruleClause(oItem, oContext))), oGroup.sJoin);
  return fnGroup(oClean);
}

function matchesRule(oIssue, oRule, oContext) {
  const { oField, sOp, aValues } = checkedRule(oRule, oContext);
  const oNow = oContext.oNow || new Date();
  if (oField.oCustomField) {
    const value = (oContext.oCustomValues || {})[oField.oCustomField.sId];
    const bEmpty = value === null || value === undefined || value === '';
    switch (sOp) {
      case 'isEmpty': return bEmpty;
      case 'isNotEmpty': return !bEmpty;
      case 'isTrue': return value === true;
      case 'isFalse': return value === false;
      case 'contains': return !bEmpty && String(value).toLowerCase().includes(String(aValues[0]).toLowerCase());
      case 'notContains': return bEmpty || !String(value).toLowerCase().includes(String(aValues[0]).toLowerCase());
      case 'in': return !bEmpty && aValues.includes(value);
      case 'notIn': return bEmpty || !aValues.includes(value);
      default: return !bEmpty && compareValues(oField.kind === 'cfDate' ? 'dateOnly' : 'number', sOp, value, aValues[0], oNow);
    }
  }
  const value = issueQueryValue(oIssue, oField.key);
  const bEmpty = value === null || value === undefined || value === '';
  if (sOp === 'isEmpty') return bEmpty;
  if (sOp === 'isNotEmpty') return !bEmpty;
  switch (oField.kind) {
    case 'category': return (sOp === 'in') === aValues.includes(getStatusCategory(value));
    case 'status': case 'type': case 'priority': return (sOp === 'in') === aValues.includes(value);
    case 'resolution': case 'user': case 'sprint': case 'version': return sOp === 'in' ? !bEmpty && aValues.includes(value) : bEmpty || !aValues.includes(value);
    case 'label': return (sOp === 'hasAny') === (oContext.aLabelIds || []).some((sId) => aValues.includes(sId));
    case 'text': return (sOp === 'contains') === String(value || '').toLowerCase().includes(String(aValues[0]).toLowerCase());
    default: return !bEmpty && compareValues(oField.kind, sOp, value, aValues[0], oNow);
  }
}

function issueQueryValue(oIssue, sKey) {
  const oValues = {
    status: oIssue.iStatus, statusCategory: oIssue.iStatus, type: oIssue.iType, priority: oIssue.iPriority, resolution: oIssue.iResolution ?? null,
    assignee: oIssue.sAssigneeId || null, reporter: oIssue.sReporterId || null, sprint: oIssue.sSprintId || null, fixVersion: oIssue.sFixVersionId || null,
    summary: oIssue.sSummary, dueDate: oIssue.sDueDate || null, created: oIssue.sCreatedOn || null, updated: oIssue.sModifiedOn || null,
    resolved: oIssue.sResolvedOn || null, storyPoints: oIssue.iStoryPoints ?? null, originalEstimate: oIssue.iOriginalEstimate ?? null,
    remainingEstimate: oIssue.iRemainingEstimate ?? null, timeSpent: oIssue.iTimeSpent ?? null,
  };
  const value = oValues[sKey];
  return typeof value === 'string' && isGuid(value) ? value.toLowerCase() : value;
}

function compareValues(sKind, sOp, value, target, oNow) {
  if (sKind === 'dateOnly' || sKind === 'dateTime') {
    const sValue = sKind === 'dateTime' ? new Date(value).toISOString() : String(value).slice(0, 10);
    const sToday = toDateOnly(oNow);
    const fnBound = (sDate, iOffset = 0) => (sKind === 'dateTime' ? localDayStartIso(sDate, iOffset) : toDateOnly(addDays(new Date(`${sDate}T12:00:00`), iOffset)));
    if (sOp === 'before') return sValue < fnBound(target);
    if (sOp === 'after') return sKind === 'dateTime' ? sValue >= fnBound(target, 1) : sValue > target;
    if (sOp === 'on') return sKind === 'dateTime' ? sValue >= fnBound(target) && sValue < fnBound(target, 1) : sValue === target;
    if (sOp === 'lastDays') return sKind === 'dateTime' ? sValue >= fnBound(sToday, -target) : sValue >= fnBound(sToday, -target) && sValue <= sToday;
    return sValue >= sToday && sValue <= fnBound(sToday, target);
  }
  const iValue = Number(value);
  switch (sOp) {
    case 'eq': return iValue === target;
    case 'ne': return iValue !== target;
    case 'gt': return iValue > target;
    case 'ge': return iValue >= target;
    case 'lt': return iValue < target;
    default: return iValue <= target;
  }
}

// In-memory twin of buildQueryFilter (mock and tests). oContext adds aLabelIds and oCustomValues for this issue.
export function matchesQuery(oIssue, oQuery, oContext = {}) {
  const oClean = sanitiseQuery(oQuery);
  if (!oClean) return true;
  const fnGroup = (oGroup) => (oGroup.sJoin === 'or'
    ? oGroup.aItems.some((oItem) => (oItem.aItems ? fnGroup(oItem) : matchesRule(oIssue, oItem, oContext)))
    : oGroup.aItems.every((oItem) => (oItem.aItems ? fnGroup(oItem) : matchesRule(oIssue, oItem, oContext))));
  return fnGroup(oClean);
}

// Plain-language summary for pills and saved-filter menus, e.g. "Status is any of To Do, In Progress and Assignee is empty".
export function describeQuery(oQuery, oLookups = {}) {
  const oClean = sanitiseQuery(oQuery);
  if (!oClean) return '';
  const fnValue = (oField, value) => {
    switch (oField.kind) {
      case 'status': return getIssueStatus(value).label;
      case 'category': return (STATUS_CATEGORIES.find((oItem) => oItem.key === value) || {}).label || value;
      case 'type': return getIssueType(value).label;
      case 'priority': return getPriority(value).label;
      case 'resolution': return (getResolution(value) || {}).label || value;
      case 'user': return value === 'me' ? 'me' : ((oLookups.oUsers || {})[value] || 'someone');
      case 'label': return (oLookups.oLabels || {})[value] || 'a label';
      case 'sprint': return (oLookups.oSprints || {})[value] || 'a sprint';
      case 'version': return (oLookups.oVersions || {})[value] || 'a version';
      case 'duration': return formatDuration(value);
      case 'dateOnly': case 'dateTime': case 'cfDate': return typeof value === 'number' ? `${value}` : formatDateOnly(value);
      default: return String(value);
    }
  };
  const fnRule = (oRule) => {
    const oField = getQueryField(oRule.sField, oLookups.aCustomFields || []) || { label: 'Custom field', kind: 'text' };
    const sValues = oRule.aValues.map((value) => fnValue(oField, value)).join(', ');
    return `${oField.label} ${QUERY_OPERATORS_LABELS[oRule.sOp] || oRule.sOp}${sValues ? ` ${sValues}` : ''}`;
  };
  const fnGroup = (oGroup, bNested) => {
    const sText = oGroup.aItems.map((oItem) => (oItem.aItems ? fnGroup(oItem, true) : fnRule(oItem))).join(` ${oGroup.sJoin} `);
    return bNested && oGroup.aItems.length > 1 ? `(${sText})` : sText;
  };
  return fnGroup(oClean, false);
}

const QUERY_OPERATORS_LABELS = Object.freeze({
  in: 'is any of', notIn: 'is none of', isEmpty: 'is empty', isNotEmpty: 'is not empty', hasAny: 'has any of', hasNone: 'has none of',
  contains: 'contains', notContains: 'does not contain', eq: '=', ne: '≠', gt: '>', ge: '≥', lt: '<', le: '≤',
  before: 'is before', after: 'is after', on: 'is on', lastDays: 'in the last (days)', nextDays: 'in the next (days)', isTrue: 'is yes', isFalse: 'is no',
});

// ── Analytics (Phase 4) ────────────────────────────────────────
// Every figure is computed from rows the signed-in user can read. Definitions: docs/phase-4-design.md#analytics.

const DAY_MS = 24 * 60 * 60 * 1000;
const roundTenth = (fValue) => Math.round(fValue * 10) / 10;

// Nearest-rank percentile of an ascending array.
export function percentile(aSorted, fFraction) {
  if (!aSorted.length) return null;
  const iIndex = Math.min(aSorted.length - 1, Math.max(0, Math.ceil(fFraction * aSorted.length) - 1));
  return aSorted[iIndex];
}

export function summariseDurations(aDays) {
  const aSorted = aDays.filter((fDay) => Number.isFinite(fDay) && fDay >= 0).sort((fA, fB) => fA - fB);
  if (!aSorted.length) return { iCount: 0, fMedian: null, fP85: null, fAverage: null };
  return {
    iCount: aSorted.length,
    fMedian: roundTenth(percentile(aSorted, 0.5)),
    fP85: roundTenth(percentile(aSorted, 0.85)),
    fAverage: roundTenth(aSorted.reduce((fSum, fDay) => fSum + fDay, 0) / aSorted.length),
  };
}

const daysBetween = (sFrom, sTo) => (new Date(sTo).getTime() - new Date(sFrom).getTime()) / DAY_MS;
const isResolvedIssue = (oIssue) => !oIssue.bArchived && isDoneStatus(oIssue.iStatus) && Boolean(oIssue.sResolvedOn);

// Lead time: created → resolved. Cycle time: first moved to an in-progress status → resolved (issues never started are left out).
export function computeLeadTimes(aIssues) {
  return summariseDurations(aIssues.filter((oIssue) => isResolvedIssue(oIssue) && oIssue.sCreatedOn).map((oIssue) => daysBetween(oIssue.sCreatedOn, oIssue.sResolvedOn)));
}

export function computeCycleTimes(aIssues) {
  const aResolved = aIssues.filter(isResolvedIssue);
  const aStarted = aResolved.filter((oIssue) => oIssue.sStartedOn && oIssue.sStartedOn <= oIssue.sResolvedOn);
  return { ...summariseDurations(aStarted.map((oIssue) => daysBetween(oIssue.sStartedOn, oIssue.sResolvedOn))), iNotStarted: aResolved.length - aStarted.length };
}

// Weeks start on Monday (local time). The last bucket is the current, partial week.
export function buildWeekBuckets(oNow, iWeeks) {
  const oToday = new Date(oNow.getFullYear(), oNow.getMonth(), oNow.getDate());
  const oThisWeek = addDays(oToday, -((oToday.getDay() + 6) % 7));
  return Array.from({ length: iWeeks }, (unused, iIndex) => {
    const oStart = addDays(oThisWeek, (iIndex - iWeeks + 1) * 7);
    const oEnd = addDays(oStart, 7);
    return { sStart: toDateOnly(oStart), sStartIso: oStart.toISOString(), sEndIso: oEnd.toISOString(), bCurrent: iIndex === iWeeks - 1 };
  });
}

export function computeThroughput(aIssues, oNow, iWeeks) {
  const aBuckets = buildWeekBuckets(oNow, iWeeks).map((oBucket) => ({ ...oBucket, iIssues: 0, iPoints: 0 }));
  aIssues.filter(isResolvedIssue).forEach((oIssue) => {
    const sResolved = new Date(oIssue.sResolvedOn).toISOString();
    const oBucket = aBuckets.find((oItem) => sResolved >= oItem.sStartIso && sResolved < oItem.sEndIso);
    if (!oBucket) return;
    oBucket.iIssues += 1;
    oBucket.iPoints += isValidStoryPoints(oIssue.iStoryPoints) ? oIssue.iStoryPoints : 0;
  });
  return aBuckets;
}

// Open issues past their due date at the end of each week (now, for the current week). Uses today's due dates and
// resolution stamps, so a due date that was moved or an issue that was reopened is counted as it is now.
export function computeOverdueTrend(aIssues, oNow, iWeeks) {
  const sNowIso = oNow.toISOString();
  return buildWeekBuckets(oNow, iWeeks).map((oBucket) => {
    const sSnapshotIso = oBucket.sEndIso < sNowIso ? oBucket.sEndIso : sNowIso;
    const sSnapshotDay = toDateOnly(new Date(new Date(sSnapshotIso).getTime() - 1));
    const iOverdue = aIssues.filter((oIssue) => !oIssue.bArchived && oIssue.sDueDate && oIssue.sDueDate < sSnapshotDay
      && (!oIssue.sCreatedOn || new Date(oIssue.sCreatedOn).toISOString() < sSnapshotIso)
      && (!oIssue.sResolvedOn || new Date(oIssue.sResolvedOn).toISOString() >= sSnapshotIso)).length;
    return { ...oBucket, sSnapshotDay, iOverdue };
  });
}

// Completed sprints, oldest first. Say/do = completed points ÷ committed points (from the start snapshot).
export function summariseSprintOutcomes(aSprints, iMax) {
  return aSprints.filter((oSprint) => Number(oSprint.iState) === SPRINT_STATE.completed && oSprint.sCompletedOn)
    .sort((oA, oB) => String(oB.sCompletedOn).localeCompare(String(oA.sCompletedOn)))
    .slice(0, iMax).reverse()
    .map((oSprint) => ({
      sId: oSprint.sId, sName: oSprint.sName, sCompletedOn: oSprint.sCompletedOn,
      iCommittedIssues: oSprint.iCommittedIssues, iCommittedPoints: oSprint.iCommittedPoints,
      iCompletedIssues: oSprint.iCompletedIssues, iCompletedPoints: oSprint.iCompletedPoints,
      iIncompleteIssues: oSprint.iIncompleteIssues, iIncompletePoints: oSprint.iIncompletePoints,
      fSayDo: oSprint.iCommittedPoints ? roundTenth((oSprint.iCompletedPoints / oSprint.iCommittedPoints) * 100) : null,
    }));
}

// Estimate accuracy only uses resolved issues that had an original estimate: time spent ÷ original estimate.
export function summariseTimeTracking(aOpen, aResolved) {
  const fnSum = (aItems, sField) => aItems.reduce((iSum, oIssue) => iSum + (Number(oIssue[sField]) || 0), 0);
  const aEstimated = aResolved.filter((oIssue) => isResolvedIssue(oIssue) && Number(oIssue.iOriginalEstimate) > 0);
  const iEstimated = fnSum(aEstimated, 'iOriginalEstimate');
  return {
    iOpenOriginal: fnSum(aOpen, 'iOriginalEstimate'), iOpenRemaining: fnSum(aOpen, 'iRemainingEstimate'), iOpenSpent: fnSum(aOpen, 'iTimeSpent'),
    iOpenUnestimated: aOpen.filter((oIssue) => (oIssue.iOriginalEstimate ?? null) === null && (oIssue.iRemainingEstimate ?? null) === null).length,
    iResolvedSpent: fnSum(aResolved.filter(isResolvedIssue), 'iTimeSpent'), iEstimatedIssues: aEstimated.length,
    fAccuracy: iEstimated ? roundTenth((fnSum(aEstimated, 'iTimeSpent') / iEstimated) * 100) : null,
  };
}

export function buildAnalytics({ aResolved = [], aDueDated = [], aSprints = [], aOpen = [] }, oNow, iWeeks) {
  const sStartIso = buildWeekBuckets(oNow, iWeeks)[0].sStartIso;
  const aInWindow = aResolved.filter((oIssue) => oIssue.sResolvedOn && new Date(oIssue.sResolvedOn).toISOString() >= sStartIso);
  return {
    iWeeks,
    oLeadTime: computeLeadTimes(aInWindow),
    oCycleTime: computeCycleTimes(aInWindow),
    aThroughput: computeThroughput(aInWindow, oNow, iWeeks),
    aOverdue: computeOverdueTrend(aDueDated, oNow, iWeeks),
    aSprintOutcomes: summariseSprintOutcomes(aSprints, iWeeks >= 12 ? 8 : 6),
    oTime: summariseTimeTracking(aOpen, aInWindow),
  };
}

// ── CSV import / export (Phase 4) ──────────────────────────────

// Cells that a spreadsheet could run as a formula are prefixed with an apostrophe.
const CSV_FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  let sText = value === null || value === undefined ? '' : String(value);
  if (CSV_FORMULA_START.test(sText)) sText = `'${sText}`;
  return /[",\r\n]/.test(sText) ? `"${sText.replace(/"/g, '""')}"` : sText;
}

export const buildCsv = (aHeaders, aRows) => [aHeaders, ...aRows].map((aRow) => aRow.map(csvCell).join(',')).join('\r\n');

const isoOrBlank = (sIso) => (sIso ? new Date(sIso).toISOString() : '');

export const ISSUE_EXPORT_COLUMNS = Object.freeze([
  ['Key', (oIssue) => oIssue.sKey], ['Summary', (oIssue) => oIssue.sSummary], ['Type', (oIssue) => getIssueType(oIssue.iType).label],
  ['Status', (oIssue) => getIssueStatus(oIssue.iStatus).label], ['Priority', (oIssue) => getPriority(oIssue.iPriority).label],
  ['Resolution', (oIssue) => (getResolution(oIssue.iResolution) || {}).label || ''], ['Assignee', (oIssue) => (oIssue.sAssigneeId ? oIssue.sAssigneeName : '')],
  ['Reporter', (oIssue) => oIssue.sReporterName || ''], ['Sprint', (oIssue) => oIssue.sSprintName || ''], ['Fix version', (oIssue) => oIssue.sFixVersionName || ''],
  ['Labels', (oIssue) => (oIssue.aLabels || []).map((oLabel) => oLabel.sName || oLabel).join('; ')], ['Story points', (oIssue) => formatStoryPoints(oIssue.iStoryPoints)],
  ['Original estimate', (oIssue) => formatDuration(oIssue.iOriginalEstimate)], ['Remaining estimate', (oIssue) => formatDuration(oIssue.iRemainingEstimate)],
  ['Time spent', (oIssue) => formatDuration(oIssue.iTimeSpent)], ['Due date', (oIssue) => oIssue.sDueDate || ''], ['Parent', (oIssue) => oIssue.sParentKey || ''],
  ['Created', (oIssue) => isoOrBlank(oIssue.sCreatedOn)], ['Updated', (oIssue) => isoOrBlank(oIssue.sModifiedOn)], ['Resolved', (oIssue) => isoOrBlank(oIssue.sResolvedOn)],
].map(([sHeader, fnValue]) => Object.freeze({ sHeader, fnValue })));

export const issuesToCsv = (aIssues) => buildCsv(ISSUE_EXPORT_COLUMNS.map((oColumn) => oColumn.sHeader), aIssues.map((oIssue) => ISSUE_EXPORT_COLUMNS.map((oColumn) => oColumn.fnValue(oIssue))));

// RFC 4180 with CRLF/LF line ends and an optional UTF-8 BOM. Blank lines are skipped.
export function parseCsv(sInput) {
  const sText = String(sInput || '').replace(/^\uFEFF/, '');
  const aRows = [];
  let aRow = [];
  let sCell = '';
  let bQuoted = false;
  let bWasQuoted = false;
  const fnEndCell = () => { aRow.push(bWasQuoted ? sCell : sCell.trim()); sCell = ''; bWasQuoted = false; };
  const fnEndRow = () => {
    fnEndCell();
    if (aRow.some((sValue) => sValue !== '')) aRows.push(aRow);
    aRow = [];
  };
  for (let iIndex = 0; iIndex < sText.length; iIndex += 1) {
    const sChar = sText[iIndex];
    if (bQuoted) {
      if (sChar === '"' && sText[iIndex + 1] === '"') { sCell += '"'; iIndex += 1; } else if (sChar === '"') bQuoted = false;
      else sCell += sChar;
    } else if (sChar === '"' && !sCell.trim()) { bQuoted = true; bWasQuoted = true; sCell = ''; }
    else if (sChar === ',') fnEndCell();
    else if (sChar === '\n' || sChar === '\r') {
      if (sChar === '\r' && sText[iIndex + 1] === '\n') iIndex += 1;
      fnEndRow();
    } else sCell += sChar;
  }
  if (bQuoted) return { aRows: [], sError: 'The file has a quote that is never closed.' };
  if (sCell || aRow.length) fnEndRow();
  return { aRows, sError: '' };
}

export function mapCsvHeaders(aHeaderRow) {
  const oIndexes = {};
  const aIgnored = [];
  const aDuplicates = [];
  aHeaderRow.forEach((sHeader, iIndex) => {
    const sName = String(sHeader || '').trim().toLowerCase();
    const oColumn = CSV_IMPORT_COLUMNS.find((oItem) => oItem.aHeaders.includes(sName));
    if (!oColumn) { if (sName) aIgnored.push(String(sHeader).trim()); return; }
    if (oIndexes[oColumn.key] !== undefined) aDuplicates.push(String(sHeader).trim());
    else oIndexes[oColumn.key] = iIndex;
  });
  const aMissing = CSV_IMPORT_COLUMNS.filter((oColumn) => oColumn.bRequired && oIndexes[oColumn.key] === undefined).map((oColumn) => oColumn.aHeaders[0]);
  return { oIndexes, aIgnored, aDuplicates, aMissing };
}

const findByLabel = (aOptions, sText) => aOptions.find((oOption) => oOption.label.toLowerCase() === String(sText).trim().toLowerCase()) || null;

// oContext: { sProjectId, aMembers: [{ sUserId, sUserName, sEmail }], aVersions }. Nothing is written here: this is the dry run.
export function planCsvImport(sCsv, oContext) {
  const { aRows, sError } = parseCsv(sCsv);
  if (sError) return { sError, aRows: [], iCreate: 0, iError: 0, aIgnored: [] };
  if (!aRows.length) return { sError: 'The file is empty.', aRows: [], iCreate: 0, iError: 0, aIgnored: [] };
  const { oIndexes, aIgnored, aDuplicates, aMissing } = mapCsvHeaders(aRows[0]);
  if (aMissing.length) return { sError: `Add a ${aMissing.join(', ')} column.`, aRows: [], iCreate: 0, iError: 0, aIgnored };
  if (aDuplicates.length) return { sError: `These columns appear twice: ${aDuplicates.join(', ')}.`, aRows: [], iCreate: 0, iError: 0, aIgnored };
  const aData = aRows.slice(1);
  if (!aData.length) return { sError: 'The file has a header row but no issues.', aRows: [], iCreate: 0, iError: 0, aIgnored };
  if (aData.length > LIMITS.csvImportMax) return { sError: `Import up to ${LIMITS.csvImportMax} issues at a time (this file has ${aData.length}).`, aRows: [], iCreate: 0, iError: 0, aIgnored };
  const aVersions = (oContext.aVersions || []).filter((oVersion) => !isVersionArchived(oVersion.iState));
  const oSeen = new Map();
  const aPlanned = aData.map((aCells, iIndex) => {
    const fnCell = (sKey) => (oIndexes[sKey] === undefined ? '' : String(aCells[oIndexes[sKey]] ?? '').trim());
    const aErrors = [];
    const aWarnings = [];
    const oDraft = { sProjectId: oContext.sProjectId, sSummary: fnCell('sSummary'), sDescription: fnCell('sDescription'), iType: ISSUE_TYPES[0].value, iPriority: PRIORITIES[2].value, aLabels: [] };
    if (fnCell('iType')) {
      const oType = findByLabel(ISSUE_TYPES, fnCell('iType'));
      if (oType) oDraft.iType = oType.value; else aErrors.push(`Type "${fnCell('iType')}" isn't one of ${ISSUE_TYPES.map((oItem) => oItem.label).join(', ')}.`);
    }
    if (fnCell('iPriority')) {
      const oPriority = findByLabel(PRIORITIES, fnCell('iPriority'));
      if (oPriority) oDraft.iPriority = oPriority.value; else aErrors.push(`Priority "${fnCell('iPriority')}" isn't one of ${PRIORITIES.map((oItem) => oItem.label).join(', ')}.`);
    }
    const sAssignee = fnCell('sAssignee').toLowerCase();
    if (sAssignee) {
      const aMatches = (oContext.aMembers || []).filter((oMember) => String(oMember.sEmail || '').toLowerCase() === sAssignee || String(oMember.sUserName || '').toLowerCase() === sAssignee);
      if (aMatches.length === 1) Object.assign(oDraft, { sAssigneeId: aMatches[0].sUserId, sAssigneeName: aMatches[0].sUserName });
      else aErrors.push(aMatches.length ? `More than one member is called "${fnCell('sAssignee')}". Use their email address.` : `Assignee "${fnCell('sAssignee')}" isn't a member of this project.`);
    }
    if (fnCell('aLabels')) oDraft.aLabels = normaliseLabels(fnCell('aLabels').split(/[;,]/));
    if (fnCell('iStoryPoints')) {
      const { iPoints, sError: sPointsError } = parseStoryPoints(fnCell('iStoryPoints'));
      if (sPointsError) aErrors.push(sPointsError); else oDraft.iStoryPoints = iPoints;
    }
    if (fnCell('sDueDate')) {
      if (isValidDateOnly(fnCell('sDueDate'))) oDraft.sDueDate = fnCell('sDueDate'); else aErrors.push(`Due date "${fnCell('sDueDate')}" must be written as YYYY-MM-DD.`);
    }
    if (fnCell('iOriginalEstimate')) {
      const { iMinutes, sError: sEstimateError } = parseDuration(fnCell('iOriginalEstimate'));
      if (sEstimateError) aErrors.push(`Original estimate: ${sEstimateError}`); else oDraft.iOriginalEstimate = iMinutes;
    }
    if (fnCell('sFixVersion')) {
      const oVersion = aVersions.find((oItem) => oItem.sName.toLowerCase() === fnCell('sFixVersion').toLowerCase());
      if (oVersion) Object.assign(oDraft, { sFixVersionId: oVersion.sId, sFixVersionName: oVersion.sName }); else aErrors.push(`Fix version "${fnCell('sFixVersion')}" doesn't exist in this project (or is archived).`);
    }
    const { oErrors } = validateIssueDraft(oDraft);
    Object.values(oErrors).forEach((sMessage) => aErrors.push(sMessage));
    const sSummaryKey = oDraft.sSummary.toLowerCase();
    if (sSummaryKey && oSeen.has(sSummaryKey)) aWarnings.push(`Same summary as line ${oSeen.get(sSummaryKey)}.`);
    else if (sSummaryKey) oSeen.set(sSummaryKey, iIndex + 2);
    return { iLine: iIndex + 2, sSummary: oDraft.sSummary, oDraft, aErrors: [...new Set(aErrors)], aWarnings, sOutcome: aErrors.length ? 'error' : 'create' };
  });
  return {
    sError: '', aRows: aPlanned, aIgnored,
    iCreate: aPlanned.filter((oRow) => oRow.sOutcome === 'create').length, iError: aPlanned.filter((oRow) => oRow.sOutcome === 'error').length,
  };
}

// ── Dependencies (Phase 4) ─────────────────────────────────────
// "Blocks" links form the layers: an issue sits one column right of everything that blocks it. Cycles (A blocks B blocks
// C blocks A) can't be layered, so their issues go in a final column and are flagged.

const BLOCKS_LINK = LINK_TYPES[0].value;

export function buildDependencyGraph(aIssues, aLinks, { bIncludeRelated = false, bIncludeIsolated = false } = {}) {
  const oById = new Map(aIssues.map((oIssue) => [oIssue.sId, oIssue]));
  const oSeenEdges = new Set();
  const aEdges = aLinks.filter((oLink) => oById.has(oLink.sFromId) && oById.has(oLink.sToId) && oLink.sFromId !== oLink.sToId && (oLink.iType === BLOCKS_LINK || bIncludeRelated))
    .filter((oLink) => {
      const sKey = `${oLink.iType}|${oLink.sFromId}|${oLink.sToId}`;
      if (oSeenEdges.has(sKey)) return false;
      oSeenEdges.add(sKey);
      return true;
    }).map((oLink) => ({ sId: oLink.sId, sFromId: oLink.sFromId, sToId: oLink.sToId, iType: oLink.iType, bBlocks: oLink.iType === BLOCKS_LINK, bCycle: false }));
  const aConnected = new Set(aEdges.flatMap((oEdge) => [oEdge.sFromId, oEdge.sToId]));
  const aNodeIssues = aIssues.filter((oIssue) => bIncludeIsolated || aConnected.has(oIssue.sId));
  const aBlocks = aEdges.filter((oEdge) => oEdge.bBlocks);
  const oIncoming = new Map(aNodeIssues.map((oIssue) => [oIssue.sId, aBlocks.filter((oEdge) => oEdge.sToId === oIssue.sId).map((oEdge) => oEdge.sFromId)]));
  const oLevels = new Map();
  const aQueue = aNodeIssues.filter((oIssue) => !oIncoming.get(oIssue.sId).length).map((oIssue) => oIssue.sId);
  const oRemaining = new Map(aNodeIssues.map((oIssue) => [oIssue.sId, oIncoming.get(oIssue.sId).length]));
  aQueue.forEach((sId) => oLevels.set(sId, 0));
  while (aQueue.length) {
    const sId = aQueue.shift();
    aBlocks.filter((oEdge) => oEdge.sFromId === sId).forEach((oEdge) => {
      oLevels.set(oEdge.sToId, Math.max(oLevels.get(oEdge.sToId) || 0, oLevels.get(sId) + 1));
      oRemaining.set(oEdge.sToId, oRemaining.get(oEdge.sToId) - 1);
      if (oRemaining.get(oEdge.sToId) === 0) aQueue.push(oEdge.sToId);
    });
  }
  const aCycleIds = aNodeIssues.filter((oIssue) => oRemaining.get(oIssue.sId) > 0).map((oIssue) => oIssue.sId);
  const iCycleLevel = aCycleIds.length ? Math.max(-1, ...oLevels.values()) + 1 : -1;
  aCycleIds.forEach((sId) => oLevels.set(sId, iCycleLevel));
  aEdges.forEach((oEdge) => { oEdge.bCycle = oEdge.bBlocks && aCycleIds.includes(oEdge.sFromId) && aCycleIds.includes(oEdge.sToId); });
  const iLevels = aNodeIssues.length ? Math.max(...aNodeIssues.map((oIssue) => oLevels.get(oIssue.sId))) + 1 : 0;
  const oRows = new Map();
  const fnKeyNumber = (oIssue) => (parseIssueKey(oIssue.sKey) || { iSequence: 0 }).iSequence;
  for (let iLevel = 0; iLevel < iLevels; iLevel += 1) {
    // Order each column by the average row of its blockers (fewer crossing lines), then by key.
    const aColumn = aNodeIssues.filter((oIssue) => oLevels.get(oIssue.sId) === iLevel).map((oIssue) => {
      const aRows = oIncoming.get(oIssue.sId).filter((sId) => oRows.has(sId)).map((sId) => oRows.get(sId));
      return { oIssue, fWeight: aRows.length ? aRows.reduce((iSum, iRow) => iSum + iRow, 0) / aRows.length : Number.POSITIVE_INFINITY };
    }).sort((oA, oB) => (oA.fWeight - oB.fWeight) || (fnKeyNumber(oA.oIssue) - fnKeyNumber(oB.oIssue)) || oA.oIssue.sKey.localeCompare(oB.oIssue.sKey));
    aColumn.forEach((oItem, iRow) => oRows.set(oItem.oIssue.sId, iRow));
  }
  const aNodes = aNodeIssues.map((oIssue) => ({
    sId: oIssue.sId, sKey: oIssue.sKey, sSummary: oIssue.sSummary, iStatus: oIssue.iStatus, iType: oIssue.iType, bExternal: Boolean(oIssue.bExternal),
    iLevel: oLevels.get(oIssue.sId), iRow: oRows.get(oIssue.sId), bCycle: aCycleIds.includes(oIssue.sId),
    bBlocked: !isDoneStatus(oIssue.iStatus) && oIncoming.get(oIssue.sId).some((sId) => !isDoneStatus(oById.get(sId).iStatus)),
  }));
  return {
    aNodes, aEdges, iLevels, iRows: aNodes.reduce((iMax, oNode) => Math.max(iMax, oNode.iRow + 1), 0),
    iIsolated: aIssues.length - aNodeIssues.length, aCycleIds,
  };
}

// ── Power Platform solutions (Phase 5) ─────────────────────────
// Epics link one Dataverse solution per stage; stories record the solution version they need and check it against a stage.

const SOLUTION_VERSION_PATTERN = /^\d{1,9}(?:\.\d{1,9}){0,3}$/;
const ENVIRONMENT_ID_PATTERN = /^[A-Za-z0-9-]{1,100}$/;
const SOLUTION_UNIQUE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;

export const getSolutionStage = (iValue) => findOption(SOLUTION_STAGES, iValue);
export const isValidSolutionStage = (iValue) => Boolean(getSolutionStage(iValue));
export const getSolutionStageByKey = (sKey) => SOLUTION_STAGES.find((oStage) => oStage.key === sKey) || null;
export const isStoryType = (iType) => getIssueType(iType).key === 'story';
export const isEpicType = (iType) => getIssueType(iType).key === 'epic';
export const isValidEnvironmentId = (sValue) => ENVIRONMENT_ID_PATTERN.test(String(sValue || ''));
export const isValidSolutionUniqueName = (sValue) => SOLUTION_UNIQUE_NAME_PATTERN.test(String(sValue || ''));
export const normaliseSolutionVersion = (sValue) => String(sValue ?? '').trim();
export const isLinkedSolution = (oLink) => Boolean(oLink && oLink.sSolutionId && oLink.sEnvironmentId);

// Blank is allowed (no version expected). Dataverse versions are major.minor[.build[.revision]].
export function validateSolutionVersion(sValue) {
  const sVersion = normaliseSolutionVersion(sValue);
  if (!sVersion) return '';
  if (sVersion.length > LIMITS.solutionVersionMax || !SOLUTION_VERSION_PATTERN.test(sVersion)) return 'Use numbers separated by dots, e.g. 1.0.0.2.';
  return '';
}

// Numeric per segment; missing segments count as 0, so 1.2 equals 1.2.0.0. null when either value isn't a version.
export function compareSolutionVersions(sLeft, sRight) {
  const sA = normaliseSolutionVersion(sLeft);
  const sB = normaliseSolutionVersion(sRight);
  if (!SOLUTION_VERSION_PATTERN.test(sA) || !SOLUTION_VERSION_PATTERN.test(sB)) return null;
  const aA = sA.split('.').map(Number);
  const aB = sB.split('.').map(Number);
  const iDiff = [0, 1, 2, 3].map((iIndex) => (aA[iIndex] || 0) - (aB[iIndex] || 0)).find((iValue) => iValue !== 0) || 0;
  return Math.sign(iDiff);
}

// sState: 'noExpected' (story has no version), 'noActual' (nothing comparable in the stage), 'match', 'older' or 'newer' (stage vs story).
export function getVersionCheck(sExpected, sActual) {
  const sWant = normaliseSolutionVersion(sExpected);
  const sHave = normaliseSolutionVersion(sActual);
  if (!sWant) return { sState: 'noExpected', sLabel: 'No solution version on this story' };
  if (!sHave) return { sState: 'noActual', sLabel: 'No solution version in this stage' };
  const iCompare = compareSolutionVersions(sHave, sWant);
  if (iCompare === null) return { sState: 'noActual', sLabel: 'Versions can\'t be compared' };
  if (iCompare === 0) return { sState: 'match', sLabel: 'Matches' };
  return iCompare < 0 ? { sState: 'older', sLabel: 'Doesn\'t match: stage is behind' } : { sState: 'newer', sLabel: 'Doesn\'t match: stage is ahead' };
}

// The Dataverse organisation origin used as the connector's "organization" header and shown to people. '' when it isn't a safe
// https Dataverse host, so a tampered row can never send requests or links elsewhere.
export function normaliseDataverseUrl(sUrl) {
  let oUrl;
  try {
    oUrl = new URL(String(sUrl || '').trim());
  } catch (oError) {
    return '';
  }
  const sHost = oUrl.hostname.toLowerCase();
  if (oUrl.protocol !== 'https:' || oUrl.username || oUrl.password || oUrl.port || oUrl.search || oUrl.hash) return '';
  if (oUrl.pathname !== '/' && oUrl.pathname !== '') return '';
  if (!POWER_PLATFORM.aDataverseHostSuffixes.some((sSuffix) => sHost.endsWith(sSuffix) && sHost.length > sSuffix.length)) return '';
  return `https://${sHost}`;
}

// One ListEnvironmentsForUser row. Environments without a usable Dataverse URL can't hold solutions, so they map to null.
export function mapEnvironment(oRow) {
  if (!oRow || typeof oRow !== 'object') return null;
  const sId = String(oRow.id || '').trim();
  const sUrl = normaliseDataverseUrl(oRow.url);
  if (!isValidEnvironmentId(sId) || !sUrl) return null;
  return {
    sId, sUrl, sName: truncateText(String(oRow.displayName || sId).trim(), LIMITS.environmentNameMax),
    sType: String(oRow.type || ''), sState: String(oRow.state || ''),
  };
}

export function filterEnvironments(aEnvironments, sText, iLimit = POWER_PLATFORM.iEnvironmentSuggestions) {
  const sQuery = String(sText || '').trim().toLowerCase();
  return (aEnvironments || []).filter((oEnvironment) => !sQuery || oEnvironment.sName.toLowerCase().includes(sQuery)
    || oEnvironment.sUrl.includes(sQuery) || oEnvironment.sType.toLowerCase().includes(sQuery)).slice(0, iLimit);
}

export function buildSolutionSearchFilter(sText) {
  const sQuery = escapeODataString(String(sText || '').trim().slice(0, LIMITS.solutionSearchMax));
  return `isvisible eq true${sQuery ? ` and (contains(friendlyname,'${sQuery}') or contains(uniquename,'${sQuery}'))` : ''}`;
}

export function buildSolutionLookupFilter({ sSolutionId = '', sUniqueName = '' } = {}) {
  if (sSolutionId) return `solutionid eq ${assertGuid(sSolutionId, 'solution')}`;
  if (!isValidSolutionUniqueName(sUniqueName)) throw createDomainError(ERROR_CODES.validation, 'Invalid solution name.');
  return `uniquename eq '${escapeODataString(sUniqueName)}'`;
}

export function mapSolution(oRow) {
  if (!oRow || !isGuid(String(oRow.solutionid || '')) || !isValidSolutionUniqueName(oRow.uniquename)) return null;
  return {
    sId: oRow.solutionid.toLowerCase(), sUniqueName: oRow.uniquename, sName: truncateText(String(oRow.friendlyname || oRow.uniquename), LIMITS.solutionNameMax),
    sVersion: String(oRow.version || ''), sModifiedOn: String(oRow.modifiedon || ''), bManaged: oRow.ismanaged === true,
  };
}

// Opens the solution in Power Apps (make.powerapps.com) for that environment; '' when either id isn't safe.
export function buildSolutionUrl(sEnvironmentId, sSolutionId) {
  if (!isValidEnvironmentId(sEnvironmentId) || !isGuid(sSolutionId || '')) return '';
  return `${POWER_PLATFORM.sMakerUrl}/environments/${encodeURIComponent(sEnvironmentId)}/solutions/${sSolutionId.trim().toLowerCase()}`;
}

// The linked stage nearest to iStage, earlier stages first: Test suggests Dev's solution, Prod suggests Stage's.
export function pickAutoSelectSource(aLinks, iStage) {
  const iIndex = SOLUTION_STAGES.findIndex((oStage) => oStage.value === Number(iStage));
  if (iIndex < 0) return null;
  const oByStage = new Map((aLinks || []).filter(isLinkedSolution).map((oLink) => [oLink.iStage, oLink]));
  return [...SOLUTION_STAGES.slice(0, iIndex).reverse(), ...SOLUTION_STAGES.slice(iIndex + 1)]
    .map((oStage) => oByStage.get(oStage.value)).find(Boolean) || null;
}

// SchemaName (unique name) to look for when a stage's environment is chosen.
export function pickAutoSelectUniqueName(aLinks, iStage) {
  const oSource = pickAutoSelectSource(aLinks, iStage);
  return oSource ? oSource.sSolutionUniqueName : '';
}

export function validateEpicSolutionDraft({ iStage, oEnvironment, oSolution } = {}) {
  const oErrors = {};
  if (!isValidSolutionStage(iStage)) oErrors.iStage = 'Choose a stage.';
  if (!oEnvironment || !isValidEnvironmentId(oEnvironment.sId) || !normaliseDataverseUrl(oEnvironment.sUrl)) oErrors.sEnvironmentId = 'Choose an environment that has Dataverse.';
  if (!oSolution || !isGuid(oSolution.sId || '') || !isValidSolutionUniqueName(oSolution.sUniqueName)) oErrors.sSolutionId = 'Choose a solution.';
  return { bValid: Object.keys(oErrors).length === 0, oErrors };
}

// One entry per stage in promotion order; stages without a linked solution come back with bLinked false.
export function epicSolutionsByStage(aLinks) {
  return SOLUTION_STAGES.map((oStage) => {
    const oLink = (aLinks || []).find((oItem) => oItem.iStage === oStage.value) || null;
    return { oStage, oLink, bLinked: isLinkedSolution(oLink) };
  });
}

export function describeEpicSolution(oLink) {
  if (!isLinkedSolution(oLink)) return 'None';
  return truncateText(`${oLink.sSolutionName || oLink.sSolutionUniqueName}${oLink.sSolutionVersion ? ` ${oLink.sSolutionVersion}` : ''} in ${oLink.sEnvironmentName || 'environment'}`);
}

// A story's version against its epic's solution in one stage. oSolution is the live row (null = deleted); bFailed = couldn't read it.
export function buildStoryVersionCheck({ sExpected = '', bHasEpic = false, oLink = null, oSolution = null, bFailed = false } = {}) {
  if (!bHasEpic) return { sState: 'noEpic', sLabel: 'Put this story under an epic to check its solution version' };
  if (!isLinkedSolution(oLink)) return { sState: 'noSolution', sLabel: 'The epic has no solution linked for this stage' };
  if (bFailed) return { sState: 'unavailable', sLabel: 'The solution couldn\'t be read from the environment' };
  if (!oSolution) return { sState: 'missing', sLabel: 'The linked solution no longer exists in this environment' };
  return getVersionCheck(sExpected, oSolution.sVersion);
}
