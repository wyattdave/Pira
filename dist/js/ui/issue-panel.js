// Issue detail panel: staged editing with an explicit Save / Discard bar, workflow transitions, custom fields, child issues,
// links, attachments, comments and history. Fetches details only when opened.
import { ISSUE_TYPES, PRIORITIES, HISTORY_EVENTS, LIMITS, RESOLUTIONS } from '../../config/app-config.js';
import {
  getIssueStatus, getIssueType, getPriority, getAllowedTransitions, getProjectPermissions, formatRelativeTime, formatDateOnly,
  isOverdue, toDateOnly, normaliseLabel, normaliseLabels, toFriendlyMessage, parseStoryPoints, formatStoryPoints,
  canHaveChildren, getAllowedParentTypes, getSprintState, isSprintLocked, isSprintOpen, computeSprintMetrics, LINK_CHOICES,
  DEFAULT_WORKFLOW, isDoneStatus, getResolution, customFieldAppliesTo, normaliseCustomFieldValue, formatCustomFieldValue,
  getCustomFieldType, formatFileSize,
  isFeatureEnabled, formatDuration, parseDuration, summariseIssueTime, remainingAfterLog, validateWorkLog, validateVoidReason, isVersionArchived, getVersionState,
  isStoryType, isEpicType, normaliseSolutionVersion, validateSolutionVersion, getSolutionStageByKey,
} from '../domain.js';
import { oApp, data, on, emit, findMembership, setIssueInRoute, projectHash } from './context.js';
import {
  qs, qsa, escapeHtml, typeIcon, priorityIcon, avatar, statusPill, ICONS, openMenu, showToast, confirmDialog,
  copyText, setBusy, skeletonRows, stateHtml, openModal, showFieldErrors,
} from './dom.js';
import { comboboxHtml, issueOptionHtml, wireCombobox, searchPeople, personOption } from './pickers.js';
import { openCreateIssue } from './create-issue.js';
import { collectTransitionFields } from './transition-dialog.js';
import { wireMentions } from './mentions.js';
import { resetSolutionPanels, loadEpicSolutions, renderEpicSolutions, loadStoryCheck, renderStoryCheck } from './solutions.js';

const HISTORY_LABELS = Object.freeze({
  summary: 'Summary', description: 'Description', type: 'Issue type', priority: 'Priority', assignee: 'Assignee',
  dueDate: 'Due date', parent: 'Parent', labels: 'Labels', status: 'Status', archived: 'Archived', points: 'Story points', sprint: 'Sprint',
  resolution: 'Resolution', attachments: 'Attachments', fixVersion: 'Fix version', originalEstimate: 'Original estimate', remainingEstimate: 'Remaining estimate',
  solutionVersion: 'Solution version',
});
// Extra payload keys that ride along with a real change and shouldn't be counted separately.
const COMPANION_KEYS = Object.freeze(['sAssigneeName', 'sParentKey']);

const oPanel = {
  sKey: '', oIssue: null, oProject: null, oPermissions: getProjectPermissions(null), aMembers: [], aProjectLabels: [], iEpoch: 0,
  aBoards: [], aSprints: [], aBoardIds: [], oDraft: null, oFieldErrors: {}, bSaving: false,
  oWorkflow: DEFAULT_WORKFLOW, aCustomFields: [], oCustomValues: {},
  aChildren: [], iChildCount: 0, sChildrenToken: '', bChildrenLoading: false, sChildrenError: '',
  aLinks: [], bLinksLoading: false, sLinksError: '', bLinkFormOpen: false,
  aAttachments: [], bAttachmentsLoading: false, sAttachmentsError: '', sUploading: '',
  aVersions: [], aWorkLogs: [], sWorkLogsToken: '', iWorkLogCount: 0, bWorkLogsLoading: false, sWorkLogsError: '',
  sTab: 'comments', aComments: [], sCommentsToken: '', iCommentCount: 0, aHistory: [], sHistoryToken: '', bActivityLoading: false,
  sCommentDraft: '', eReturnFocus: null,
};

const ePanel = () => qs('#issuePanel');
const canEdit = () => Boolean(oPanel.oIssue) && oPanel.oPermissions.bCanEdit && !oPanel.oIssue.bArchived;

export const isPanelOpen = () => ePanel().classList.contains('open');
export const getOpenIssueKey = () => (isPanelOpen() ? oPanel.sKey : '');

export function closeIssuePanel(bRestoreFocus = true) {
  oPanel.iEpoch += 1;
  resetSolutionPanels();
  Object.assign(oPanel, { sKey: '', oIssue: null, oDraft: null, oFieldErrors: {}, bSaving: false });
  ePanel().classList.remove('open');
  ePanel().setAttribute('aria-hidden', 'true');
  emit('panel:closed');
  if (bRestoreFocus && oPanel.eReturnFocus && document.contains(oPanel.eReturnFocus)) oPanel.eReturnFocus.focus();
}

function requestClose() {
  setIssueInRoute('');
}

export async function openIssuePanel(sKey) {
  const sIssueKey = String(sKey).toUpperCase();
  if (oPanel.sKey === sIssueKey && isPanelOpen()) return;
  if (!isPanelOpen()) oPanel.eReturnFocus = document.activeElement;
  oPanel.iEpoch += 1;
  const iEpoch = oPanel.iEpoch;
  resetSolutionPanels();
  Object.assign(oPanel, {
    sKey: sIssueKey, oIssue: null, oDraft: null, oFieldErrors: {}, bSaving: false, sTab: 'comments', aComments: [], sCommentsToken: '',
    aHistory: [], sHistoryToken: '', sCommentDraft: '', aChildren: [], iChildCount: 0, sChildrenToken: '', aLinks: [], bLinkFormOpen: false,
    aAttachments: [], sAttachmentsError: '', sUploading: '', aCustomFields: [], oCustomValues: {}, oWorkflow: DEFAULT_WORKFLOW,
    aVersions: [], aWorkLogs: [], sWorkLogsToken: '', iWorkLogCount: 0, sWorkLogsError: '',
  });
  ePanel().classList.add('open');
  ePanel().setAttribute('aria-hidden', 'false');
  ePanel().innerHTML = `<div class="d-top"><span class="key-strong">${escapeHtml(sIssueKey)}</span><span class="spacer"></span><button class="icon-btn" type="button" data-close aria-label="Close issue">${ICONS.close}</button></div><div class="d-body" aria-busy="true">${skeletonRows(1, 'sk-line')}${skeletonRows(1, 'sk-card')}${skeletonRows(6, 'sk-line')}</div>`;
  qs('[data-close]', ePanel()).addEventListener('click', requestClose);
  emit('panel:opened', sIssueKey);
  try {
    const oIssue = await data().getIssueByKey(sIssueKey);
    const oProject = await data().getProject(oIssue.sProjectId);
    const [aMembers, aProjectLabels, aBoards, aSprints, aBoardIds, oWorkflow, oCustom, aVersions] = await Promise.all([
      data().listMembers(oIssue.sProjectId), data().listProjectLabels(oIssue.sProjectId), data().listBoards(oProject),
      data().listSprints(oIssue.sProjectId), data().listIssueBoardIds(oIssue.sId), data().getWorkflow(oIssue.sProjectId),
      data().getIssueCustomFields(oIssue), isFeatureEnabled('releases') ? data().listVersions(oIssue.sProjectId) : Promise.resolve([]),
    ]);
    if (iEpoch !== oPanel.iEpoch) return;
    Object.assign(oPanel, {
      oIssue, aMembers, aProjectLabels, oProject, aBoards, aSprints, aBoardIds, oWorkflow, aCustomFields: oCustom.aFields, oCustomValues: oCustom.oValues, aVersions,
      oPermissions: getProjectPermissions(findMembership(oIssue.sProjectId), oProject.bArchived),
    });
    oPanel.oDraft = canEdit() ? draftFromIssue(oIssue, aBoardIds) : null;
    renderPanel();
    qs('[data-close]', ePanel()).focus();
    loadActivity(false);
    loadChildren(false);
    loadLinks();
    loadAttachments();
    loadWorkLogs(false);
    loadSolutionSections();
  } catch (oError) {
    if (iEpoch !== oPanel.iEpoch) return;
    qs('.d-body', ePanel()).innerHTML = stateHtml({ sTitle: 'Issue unavailable', sMessage: toFriendlyMessage(oError), sIcon: '!' });
    qs('.d-body', ePanel()).removeAttribute('aria-busy');
  }
}

// ── Draft (staged edits) ───────────────────────────────────────

// Custom values are edited as text: '' = none, booleans as 'true'/'false'.
const customInputValue = (value) => (value === null || value === undefined ? '' : String(value));
const visibleCustomFields = (iType) => oPanel.aCustomFields.filter((oField) => oField.bActive && customFieldAppliesTo(oField, iType));

function draftFromIssue(oIssue, aBoardIds) {
  return {
    sSummary: oIssue.sSummary, sDescription: oIssue.sDescription, iType: oIssue.iType, iPriority: oIssue.iPriority,
    sAssigneeId: oIssue.sAssigneeId, sAssigneeName: oIssue.sAssigneeName, sDueDate: oIssue.sDueDate, sPoints: formatStoryPoints(oIssue.iStoryPoints),
    sParentId: oIssue.sParentId, sParentKey: oIssue.sParentKey, aLabels: oIssue.aLabels.map((oLabel) => oLabel.sName),
    sSprintId: oIssue.sSprintId || '', aBoardIds: [...aBoardIds], iResolution: oIssue.iResolution ?? null,
    sFixVersionId: oIssue.sFixVersionId || '', sOriginalEstimate: formatDuration(oIssue.iOriginalEstimate), sRemainingEstimate: formatDuration(oIssue.iRemainingEstimate),
    sSolutionVersion: oIssue.sSolutionVersion || '',
    oCustom: Object.fromEntries(oPanel.aCustomFields.map((oField) => [oField.sId, customInputValue(oPanel.oCustomValues[oField.sId])])),
  };
}

const sameSet = (aA, aB) => [...aA].sort().join('|') === [...aB].sort().join('|');

function collectCustomChanges(oDraft, oChanges, oErrors) {
  const oValues = {};
  visibleCustomFields(oDraft.iType).forEach((oField) => {
    const sDraft = oDraft.oCustom[oField.sId] ?? '';
    if (sDraft === customInputValue(oPanel.oCustomValues[oField.sId])) return;
    const { sError } = normaliseCustomFieldValue(oField, sDraft);
    if (sError) oErrors[`custom:${oField.sId}`] = sError;
    else oValues[oField.sId] = sDraft;
  });
  if (Object.keys(oValues).length) oChanges.oCustomValues = oValues;
}

function collectChanges() {
  const oIssue = oPanel.oIssue;
  const oDraft = oPanel.oDraft;
  const oChanges = {};
  const oErrors = {};
  if (!oIssue || !oDraft) return { oChanges, oErrors };
  const sSummary = oDraft.sSummary.trim();
  if (!sSummary) oErrors.sSummary = 'Summary is required.';
  else if (sSummary !== oIssue.sSummary) oChanges.sSummary = sSummary;
  if (oDraft.sDescription.trim() !== oIssue.sDescription.trim()) oChanges.sDescription = oDraft.sDescription;
  if (oDraft.iType !== oIssue.iType) oChanges.iType = oDraft.iType;
  if (oDraft.iPriority !== oIssue.iPriority) oChanges.iPriority = oDraft.iPriority;
  if (oDraft.sAssigneeId !== oIssue.sAssigneeId) Object.assign(oChanges, { sAssigneeId: oDraft.sAssigneeId, sAssigneeName: oDraft.sAssigneeName });
  if (oDraft.sDueDate !== oIssue.sDueDate) oChanges.sDueDate = oDraft.sDueDate;
  const { iPoints, sError } = parseStoryPoints(oDraft.sPoints);
  if (sError) oErrors.iStoryPoints = sError;
  else if (iPoints !== (oIssue.iStoryPoints ?? null)) oChanges.iStoryPoints = iPoints;
  if (oDraft.sParentId !== oIssue.sParentId) Object.assign(oChanges, { sParentId: oDraft.sParentId, sParentKey: oDraft.sParentKey });
  const aLabels = normaliseLabels(oDraft.aLabels);
  if (!sameSet(aLabels, oIssue.aLabels.map((oLabel) => oLabel.sName))) oChanges.aLabels = aLabels;
  if (oDraft.sSprintId !== (oIssue.sSprintId || '')) oChanges.sSprintId = oDraft.sSprintId;
  if (!sameSet(oDraft.aBoardIds, oPanel.aBoardIds)) oChanges.aBoardIds = [...oDraft.aBoardIds];
  if (isDoneStatus(oIssue.iStatus) && oDraft.iResolution !== (oIssue.iResolution ?? null)) oChanges.iResolution = oDraft.iResolution;
  if (oDraft.sFixVersionId !== (oIssue.sFixVersionId || '')) oChanges.sFixVersionId = oDraft.sFixVersionId;
  if (isFeatureEnabled('timeTracking')) {
    [['sOriginalEstimate', 'iOriginalEstimate'], ['sRemainingEstimate', 'iRemainingEstimate']].forEach(([sDraftKey, sField]) => {
      const { iMinutes, sError: sEstimateError } = parseDuration(oDraft[sDraftKey]);
      if (sEstimateError) oErrors[sField] = sEstimateError;
      else if (iMinutes !== (oIssue[sField] ?? null)) oChanges[sField] = iMinutes;
    });
  }
  // Only stories carry a solution version; the service clears it when a story becomes another type.
  if (isFeatureEnabled('powerPlatform') && isStoryType(oDraft.iType)) {
    const sVersion = normaliseSolutionVersion(oDraft.sSolutionVersion);
    const sVersionError = validateSolutionVersion(sVersion);
    if (sVersionError) oErrors.sSolutionVersion = sVersionError;
    else if (sVersion !== (oIssue.sSolutionVersion || '')) oChanges.sSolutionVersion = sVersion;
  }
  collectCustomChanges(oDraft, oChanges, oErrors);
  return { oChanges, oErrors };
}

const countChanges = (oChanges) => Object.keys(oChanges).filter((sKey) => !COMPANION_KEYS.includes(sKey)).length;

export function hasUnsavedChanges() {
  return isPanelOpen() && Boolean(oPanel.oDraft) && countChanges(collectChanges().oChanges) > 0;
}

export function discardPanelChanges() {
  if (!oPanel.oIssue || !oPanel.oDraft) return;
  oPanel.oDraft = draftFromIssue(oPanel.oIssue, oPanel.aBoardIds);
  oPanel.oFieldErrors = {};
  renderPanel();
}

function updateSaveBar() {
  const eBar = qs('#panelSaveBar', ePanel());
  if (!eBar) return;
  const { oChanges, oErrors } = collectChanges();
  const iCount = countChanges(oChanges);
  const bErrors = Object.keys(oErrors).length > 0;
  eBar.hidden = !iCount && !bErrors && !oPanel.bSaving;
  qs('#panelSaveCount', eBar).textContent = bErrors ? Object.values(oErrors)[0] : `${iCount} unsaved change${iCount === 1 ? '' : 's'}`;
  const eSave = qs('#panelSave', eBar);
  setBusy(eSave, oPanel.bSaving);
  eSave.disabled = oPanel.bSaving || !iCount || bErrors;
  qs('#panelDiscard', eBar).disabled = oPanel.bSaving;
}

// ── Rendering ──────────────────────────────────────────────────

function selectOptions(aOptions, iSelected) {
  return aOptions.map((oOption) => `<option value="${oOption.value}"${oOption.value === iSelected ? ' selected' : ''}>${escapeHtml(oOption.label)}</option>`).join('');
}

const errorSlot = (sField) => `<span class="err" data-error-for="${sField}">${escapeHtml(oPanel.oFieldErrors[sField] || '')}</span>`;

function assigneeControl(oIssue, oDraft, bEdit) {
  if (!bEdit) return `${avatar(oIssue.sAssigneeId, oIssue.sAssigneeName)} ${escapeHtml(oIssue.sAssigneeId ? oIssue.sAssigneeName : 'Unassigned')}`;
  const sName = oDraft.sAssigneeId ? oDraft.sAssigneeName || 'Assigned' : 'Unassigned';
  const bMember = !oDraft.sAssigneeId || oPanel.aMembers.some((oMember) => oMember.sUserId === oDraft.sAssigneeId);
  return `${avatar(oDraft.sAssigneeId, sName)} <span>${escapeHtml(sName)}${bMember ? '' : ' <span class="hint">(not a project member)</span>'}</span>
    ${oDraft.sAssigneeId ? '<button class="btn btn-quiet" type="button" id="panelUnassign">Unassign</button>' : ''}
    ${oDraft.sAssigneeId === oApp.oUser.sId ? '' : '<button class="btn btn-quiet" type="button" id="panelAssignMe">Assign to me</button>'}
    ${comboboxHtml({ sId: 'panelAssignee', sLabel: 'Change assignee', sPlaceholder: 'Search people by name or email', sExtraClass: 'field-combo' })}`;
}

function labelControl(oIssue, oDraft, bEdit) {
  if (!bEdit) return oIssue.aLabels.length ? oIssue.aLabels.map((oLabel) => `<span class="lbl">${escapeHtml(oLabel.sName)}</span>`).join(' ') : '<span class="hint">None</span>';
  return `<div class="label-editor">${oDraft.aLabels.map((sName) => `<span class="lbl">${escapeHtml(sName)}<button type="button" data-remove-label="${escapeHtml(sName)}" aria-label="Remove label ${escapeHtml(sName)}">×</button></span>`).join('')}
    <label class="sr" for="panelLabelInput">Add label</label>
    <input class="inp" id="panelLabelInput" list="panelLabelOptions" placeholder="Add label" maxlength="${LIMITS.labelMax}" autocomplete="off">
    <datalist id="panelLabelOptions">${oPanel.aProjectLabels.filter((oLabel) => !oDraft.aLabels.includes(oLabel.sName)).map((oLabel) => `<option value="${escapeHtml(oLabel.sName)}"></option>`).join('')}</datalist></div>`;
}

function parentControl(oIssue, oDraft, bEdit) {
  const sParentId = bEdit ? oDraft.sParentId : oIssue.sParentId;
  const sParentKey = bEdit ? oDraft.sParentKey : oIssue.sParentKey;
  const sLink = sParentId ? `<a class="key-strong" href="#" data-open-issue="${escapeHtml(sParentKey)}">${escapeHtml(sParentKey || 'Parent')}</a>` : '';
  if (!bEdit) return sLink || '<span class="hint">None</span>';
  if (sParentId) return `${sLink}<button class="btn btn-quiet" type="button" id="panelRemoveParent">Remove</button>`;
  const aAllowed = getAllowedParentTypes(oDraft.iType);
  if (!aAllowed.length) return '<span class="hint">Epics are top level, so they have no parent.</span>';
  const sTypes = aAllowed.map((iType) => getIssueType(iType).label).join(' or ');
  return comboboxHtml({ sId: 'panelParentInput', sLabel: 'Parent issue', sPlaceholder: `Find ${sTypes.toLowerCase()} by key or summary`, sExtraClass: 'field-combo' });
}

function sprintControl(oIssue, oDraft, bEdit) {
  const oCurrent = oPanel.aSprints.find((oSprint) => oSprint.sId === oIssue.sSprintId);
  const sCurrent = oIssue.sSprintId ? `${oCurrent ? oCurrent.sName : oIssue.sSprintName} · ${oCurrent ? getSprintState(oCurrent.iState).label : ''}` : 'Backlog';
  if (!bEdit) return escapeHtml(sCurrent);
  if (oCurrent && isSprintLocked(oCurrent.iState)) return `${escapeHtml(sCurrent)} <span class="hint">Locked: completed and cancelled sprints keep their issues.</span>`;
  const aOpen = oPanel.aSprints.filter((oSprint) => isSprintOpen(oSprint.iState));
  const bManyBoards = new Set(aOpen.map((oSprint) => oSprint.sBoardId)).size > 1;
  const sBoard = (oSprint) => (bManyBoards ? ` · ${(oPanel.aBoards.find((oBoard) => oBoard.sId === oSprint.sBoardId) || {}).sName || 'Board'}` : '');
  return `<label class="sr" for="panelSprint">Sprint</label><select class="sel" id="panelSprint"><option value="">Backlog (no sprint)</option>${aOpen.map((oSprint) => `<option value="${escapeHtml(oSprint.sId)}"${oSprint.sId === oDraft.sSprintId ? ' selected' : ''}>${escapeHtml(`${oSprint.sName} · ${getSprintState(oSprint.iState).label}${sBoard(oSprint)}`)}</option>`).join('')}</select>`;
}

function boardsControl(oDraft, bEdit) {
  const oDefault = oPanel.aBoards.find((oBoard) => oBoard.bDefault);
  const aExtra = oPanel.aBoards.filter((oBoard) => !oBoard.bDefault);
  const aOnIds = bEdit ? oDraft.aBoardIds : oPanel.aBoardIds;
  const sDefault = `<span class="hint">Always on ${escapeHtml(oDefault ? oDefault.sName : 'the project board')}</span>`;
  const sChips = aExtra.filter((oBoard) => aOnIds.includes(oBoard.sId)).map((oBoard) => `<span class="lbl board-chip">${escapeHtml(oBoard.sName)}${bEdit ? `<button type="button" data-remove-board="${escapeHtml(oBoard.sId)}" aria-label="Remove from ${escapeHtml(oBoard.sName)}">×</button>` : ''}</span>`).join('');
  const aAvailable = aExtra.filter((oBoard) => !aOnIds.includes(oBoard.sId));
  const sAdd = bEdit && aAvailable.length ? `<label class="sr" for="panelAddBoard">Add to board</label><select class="sel" id="panelAddBoard" style="max-width:190px"><option value="">Add to board…</option>${aAvailable.map((oBoard) => `<option value="${escapeHtml(oBoard.sId)}">${escapeHtml(oBoard.sName)}</option>`).join('')}</select>` : '';
  return `${sChips}${sAdd}${sDefault}`;
}

function resolutionControl(oIssue, oDraft, bEdit) {
  if (!bEdit) return escapeHtml((getResolution(oIssue.iResolution) || {}).label || 'None');
  return `<label class="sr" for="panelResolution">Resolution</label><select class="sel" id="panelResolution"><option value="">None</option>${RESOLUTIONS.map((oItem) => `<option value="${oItem.value}"${oItem.value === oDraft.iResolution ? ' selected' : ''}>${escapeHtml(oItem.label)}</option>`).join('')}</select>`;
}

function customFieldControl(oField, oDraft, bEdit) {
  const value = oPanel.oCustomValues[oField.sId];
  if (!bEdit) return escapeHtml(formatCustomFieldValue(oField, value) || 'None');
  const sId = `panelCustom-${oField.sId}`;
  const sValue = oDraft.oCustom[oField.sId] ?? '';
  const sLabel = `<label class="sr" for="${sId}">${escapeHtml(oField.sName)}</label>`;
  const sAttributes = `id="${sId}" data-custom="${escapeHtml(oField.sId)}"`;
  const fnOptions = (aOptions) => aOptions.map(([sOptionValue, sText]) => `<option value="${escapeHtml(sOptionValue)}"${sOptionValue === sValue ? ' selected' : ''}>${escapeHtml(sText)}</option>`).join('');
  switch ((getCustomFieldType(oField.iType) || {}).key) {
    case 'boolean': return `${sLabel}<select class="sel" ${sAttributes}>${fnOptions([['', 'None'], ['true', 'Yes'], ['false', 'No']])}</select>`;
    case 'choice': return `${sLabel}<select class="sel" ${sAttributes}>${fnOptions([['', 'None'], ...oField.aOptions.map((sOption) => [sOption, sOption]), ...(sValue && !oField.aOptions.includes(sValue) ? [[sValue, `${sValue} (retired)`]] : [])])}</select>`;
    case 'date': return `${sLabel}<input class="inp" type="date" ${sAttributes} value="${escapeHtml(sValue)}" style="max-width:180px">`;
    case 'number': return `${sLabel}<input class="inp" inputmode="decimal" ${sAttributes} value="${escapeHtml(sValue)}" placeholder="None" style="max-width:160px">`;
    default: return `${sLabel}<input class="inp" ${sAttributes} maxlength="${LIMITS.customFieldTextMax}" value="${escapeHtml(sValue)}" placeholder="None">`;
  }
}

function customFieldsHtml(oDraft, bEdit, iType) {
  return visibleCustomFields(iType).map((oField) => `<dt title="${escapeHtml(oField.sDescription)}">${escapeHtml(oField.sName)}</dt><dd>${customFieldControl(oField, oDraft, bEdit)}${oField.sDescription ? `<span class="hint">${escapeHtml(oField.sDescription)}</span>` : ''}${errorSlot(`custom:${oField.sId}`)}</dd>`).join('');
}

// Archived versions are offered only when the issue already uses one (so it can be read, not chosen).
function fixVersionControl(oIssue, oDraft, bEdit) {
  if (!bEdit) return oIssue.sFixVersionId ? `${ICONS.release} ${escapeHtml(oIssue.sFixVersionName || 'Version')}` : '<span class="hint">None</span>';
  const aOptions = oPanel.aVersions.filter((oVersion) => !isVersionArchived(oVersion.iState) || oVersion.sId === oIssue.sFixVersionId);
  return `<label class="sr" for="panelFixVersion">Fix version</label><select class="sel" id="panelFixVersion"><option value="">None</option>${aOptions.map((oVersion) => `<option value="${escapeHtml(oVersion.sId)}"${oVersion.sId === oDraft.sFixVersionId ? ' selected' : ''}${isVersionArchived(oVersion.iState) ? ' disabled' : ''}>${escapeHtml(`${oVersion.sName} · ${getVersionState(oVersion.iState).label}`)}</option>`).join('')}</select>`;
}

function estimateControl(sId, sDraftKey, sField, oIssue, oDraft, bEdit) {
  if (!bEdit) return escapeHtml(formatDuration(oIssue[sField]) || 'None');
  return `<label class="sr" for="${sId}">${sField === 'iOriginalEstimate' ? 'Original estimate' : 'Remaining estimate'}</label><input class="inp" id="${sId}" value="${escapeHtml(oDraft[sDraftKey])}" placeholder="e.g. 1d 4h" autocomplete="off" style="max-width:140px">${errorSlot(sField)}`;
}

function solutionVersionControl(oIssue, oDraft, bEdit) {
  if (!bEdit) return oIssue.sSolutionVersion ? `<span class="sol-version">${escapeHtml(oIssue.sSolutionVersion)}</span>` : '<span class="hint">None</span>';
  return `<label class="sr" for="panelSolutionVersion">Solution version</label><input class="inp" id="panelSolutionVersion" value="${escapeHtml(oDraft.sSolutionVersion)}" maxlength="${LIMITS.solutionVersionMax}" placeholder="e.g. 1.0.0.2" autocomplete="off" inputmode="decimal" style="max-width:150px"><span class="hint">The epic solution version this story ships in.</span>${errorSlot('sSolutionVersion')}`;
}

function detailsHtml(oIssue, oDraft, bEdit) {
  const sToday = toDateOnly(new Date());
  const bOverdue = isOverdue(oIssue.sDueDate, oIssue.iStatus, sToday);
  const iType = bEdit ? oDraft.iType : oIssue.iType;
  const iPriority = bEdit ? oDraft.iPriority : oIssue.iPriority;
  return `<dl class="fields">
    <dt>Assignee</dt><dd>${assigneeControl(oIssue, oDraft, bEdit)}</dd>
    <dt>Reporter</dt><dd>${avatar(oIssue.sReporterId, oIssue.sReporterName)} ${escapeHtml(oIssue.sReporterName || 'Unknown')}</dd>
    <dt>Priority</dt><dd>${priorityIcon(iPriority)} ${bEdit ? `<label class="sr" for="panelPriority">Priority</label><select class="sel" id="panelPriority">${selectOptions(PRIORITIES, iPriority)}</select>` : escapeHtml(getPriority(iPriority).label)}</dd>
    <dt>Issue type</dt><dd>${typeIcon(iType)} ${bEdit ? `<label class="sr" for="panelType">Issue type</label><select class="sel" id="panelType">${selectOptions(ISSUE_TYPES, iType)}</select>` : escapeHtml(getIssueType(iType).label)}</dd>
    <dt>Story points</dt><dd>${bEdit ? `<label class="sr" for="panelPoints">Story points</label><input class="inp" id="panelPoints" type="number" min="0" max="${LIMITS.storyPointsMax}" step="1" inputmode="numeric" placeholder="None" value="${escapeHtml(oDraft.sPoints)}" style="max-width:110px">${errorSlot('iStoryPoints')}` : escapeHtml(formatStoryPoints(oIssue.iStoryPoints) || 'None')}</dd>
    <dt>Sprint</dt><dd>${sprintControl(oIssue, oDraft, bEdit)}</dd>
    ${isFeatureEnabled('releases') ? `<dt>Fix version</dt><dd>${fixVersionControl(oIssue, oDraft, bEdit)}${errorSlot('sFixVersionId')}</dd>` : ''}
    ${isFeatureEnabled('powerPlatform') && isStoryType(iType) ? `<dt>Solution version</dt><dd>${solutionVersionControl(oIssue, oDraft, bEdit)}</dd>` : ''}
    ${isFeatureEnabled('timeTracking') ? `<dt>Original estimate</dt><dd>${estimateControl('panelOriginal', 'sOriginalEstimate', 'iOriginalEstimate', oIssue, oDraft, bEdit)}</dd>
    <dt>Remaining</dt><dd>${estimateControl('panelRemaining', 'sRemainingEstimate', 'iRemainingEstimate', oIssue, oDraft, bEdit)}</dd>` : ''}
    <dt>Labels</dt><dd>${labelControl(oIssue, oDraft, bEdit)}</dd>
    <dt>Due date</dt><dd>${bEdit ? `<label class="sr" for="panelDue">Due date</label><input class="inp" type="date" id="panelDue" value="${escapeHtml(oDraft.sDueDate)}" style="max-width:180px">` : escapeHtml(formatDateOnly(oIssue.sDueDate) || 'None')}${bOverdue ? '<span class="overdue">Overdue</span>' : ''}${errorSlot('sDueDate')}</dd>
    <dt>Parent</dt><dd>${parentControl(oIssue, oDraft, bEdit)}${errorSlot('sParentId')}</dd>
    <dt>Boards</dt><dd>${boardsControl(oDraft, bEdit)}</dd>
    ${isDoneStatus(oIssue.iStatus) ? `<dt>Resolution</dt><dd>${resolutionControl(oIssue, oDraft, bEdit)}${errorSlot('iResolution')}</dd>` : ''}
    ${customFieldsHtml(oDraft, bEdit, iType)}
  </dl>`;
}

function renderPanel(sFocusId = '') {
  const oIssue = oPanel.oIssue;
  if (!oIssue) return;
  const oDraft = oPanel.oDraft;
  const bEdit = canEdit() && Boolean(oDraft);
  const eOldBody = qs('.d-body', ePanel());
  const iScroll = eOldBody ? eOldBody.scrollTop : 0;
  const sReadOnlyNote = !oPanel.oPermissions.bCanView
    ? '<div class="notice">You are not a member of this project, so this issue is read-only.</div>'
    : (!bEdit ? `<div class="notice">${oIssue.bArchived ? 'This issue is archived.' : oPanel.oProject.bArchived ? 'This project is archived.' : 'Stakeholders have read-only access.'} Editing is disabled.</div>` : '');
  const sTitle = bEdit
    ? `<label class="sr" for="panelSummary">Summary</label><input class="inp d-title-input inline" id="panelSummary" maxlength="${LIMITS.summaryMax}" value="${escapeHtml(oDraft.sSummary)}">${errorSlot('sSummary')}`
    : `<h2 class="d-title">${escapeHtml(oIssue.sSummary)}</h2>`;
  const sDescription = bEdit
    ? `<label class="sr" for="panelDescription">Description</label><textarea class="txt desc-input" id="panelDescription" rows="5" maxlength="${LIMITS.descriptionMax}" placeholder="Add a description…">${escapeHtml(oDraft.sDescription)}</textarea>${errorSlot('sDescription')}`
    : `<div class="desc${oIssue.sDescription ? '' : ' empty-desc'}">${escapeHtml(oIssue.sDescription || 'No description.')}</div>`;
  ePanel().innerHTML = `
    <div class="d-top">
      ${typeIcon(oIssue.iType)}
      <a class="key-strong" href="${escapeHtml(projectHash(oPanel.oProject.sKey, 'board'))}?issue=${encodeURIComponent(oIssue.sKey)}">${escapeHtml(oIssue.sKey)}</a>
      <button class="copy-btn" type="button" id="panelCopy" aria-label="Copy issue key ${escapeHtml(oIssue.sKey)}">${ICONS.copy} Copy</button>
      <span class="spacer"></span>
      <a class="hint" href="${escapeHtml(projectHash(oPanel.oProject.sKey, 'board'))}" style="text-decoration:none">${escapeHtml(oPanel.oProject.sName)}</a>
      <button class="icon-btn" type="button" id="panelMore" aria-haspopup="menu" aria-expanded="false" aria-label="More actions">${ICONS.more}</button>
      <button class="icon-btn" type="button" data-close aria-label="Close issue">${ICONS.close}</button>
    </div>
    <div class="d-body">
      ${sReadOnlyNote}
      <div class="d-title-wrap">${sTitle}</div>
      <div class="d-actions">
        ${canEdit() ? `<button class="status lg s-${getIssueStatus(oIssue.iStatus).key}" type="button" id="panelStatus" aria-haspopup="menu" aria-expanded="false" aria-label="Status: ${escapeHtml(getIssueStatus(oIssue.iStatus).label)}. Change status">${escapeHtml(getIssueStatus(oIssue.iStatus).label)} ${ICONS.chevron}</button>` : statusPill(oIssue.iStatus, 'lg')}
        ${bEdit ? '<span class="hint">Status changes save straight away. Other edits wait for Save.</span>' : ''}
      </div>
      <div class="sec-t">Description</div>
      ${sDescription}
      <div class="sec-t">Details</div>
      ${detailsHtml(oIssue, oDraft, bEdit)}
      <div class="meta-foot">Created <span title="${escapeHtml(new Date(oIssue.sCreatedOn).toLocaleString())}">${escapeHtml(formatRelativeTime(oIssue.sCreatedOn))}</span> · Updated <span title="${escapeHtml(new Date(oIssue.sModifiedOn).toLocaleString())}">${escapeHtml(formatRelativeTime(oIssue.sModifiedOn))}</span>${oIssue.sResolvedOn ? ` · Resolved ${escapeHtml(formatRelativeTime(oIssue.sResolvedOn))}` : ''}</div>
      ${canHaveChildren(oIssue.iType) ? '<div class="sec-t">Child issues</div><div id="panelChildren"></div>' : ''}
      ${isFeatureEnabled('powerPlatform') && isEpicType(oIssue.iType) ? '<div class="sec-t">Solutions</div><div id="panelSolutions"></div>' : ''}
      ${isFeatureEnabled('powerPlatform') && isStoryType(oIssue.iType) ? '<div class="sec-t">Solution version check</div><div id="panelVersionCheck"></div>' : ''}
      ${isFeatureEnabled('timeTracking') ? '<div class="sec-t">Time tracking</div><div id="panelTime"></div>' : ''}
      <div class="sec-t">Linked issues</div><div id="panelLinks"></div>
      <div class="sec-t">Attachments</div><div id="panelAttachments" class="attach-zone"></div>
      <div class="sec-t">Activity</div>
      <div class="mini-tabs" role="tablist" aria-label="Activity">
        <button type="button" role="tab" data-tab="comments" aria-selected="${oPanel.sTab === 'comments'}">Comments</button>
        <button type="button" role="tab" data-tab="history" aria-selected="${oPanel.sTab === 'history'}">History</button>
      </div>
      <div id="panelActivity" role="tabpanel"></div>
    </div>
    ${bEdit ? `<div class="d-save" id="panelSaveBar" role="region" aria-label="Unsaved changes" hidden>
      <span class="d-save-msg" id="panelSaveCount" aria-live="polite"></span><span class="spacer"></span>
      <span class="hint">Ctrl+S</span>
      <button class="btn btn-ghost" type="button" id="panelDiscard">Discard</button>
      <button class="btn btn-primary" type="button" id="panelSave">Save</button></div>` : ''}`;
  wirePanel(bEdit);
  renderActivity();
  renderChildren();
  renderLinks();
  renderAttachments();
  renderTime();
  renderEpicSolutions();
  renderStoryCheck();
  updateSaveBar();
  const eBody = qs('.d-body', ePanel());
  if (eBody) eBody.scrollTop = iScroll;
  const eFocus = sFocusId ? qs(`#${sFocusId}`, ePanel()) : null;
  if (eFocus) eFocus.focus();
}

// ── Saving ─────────────────────────────────────────────────────

function afterIssueResult(oResult, sSuccess = '') {
  oPanel.oIssue = oResult.oIssue;
  emit('issue:changed', { ...oResult.oIssue, aBoardIds: [...oPanel.aBoardIds] });
  if (!oResult.bHistorySaved) showToast('Saved, but the change history could not be recorded.', { sKind: 'error' });
  else if (sSuccess) showToast(sSuccess);
}

async function savePanel() {
  if (oPanel.bSaving || !oPanel.oDraft) return;
  const { oChanges, oErrors } = collectChanges();
  if (Object.keys(oErrors).length) {
    oPanel.oFieldErrors = oErrors;
    const oFocus = { iStoryPoints: 'panelPoints', iOriginalEstimate: 'panelOriginal', iRemainingEstimate: 'panelRemaining', sSolutionVersion: 'panelSolutionVersion' };
    renderPanel(oFocus[Object.keys(oErrors)[0]] || 'panelSummary');
    return;
  }
  if (!countChanges(oChanges)) return;
  const iEpoch = oPanel.iEpoch;
  const bTypeChanged = oChanges.iType !== undefined;
  oPanel.bSaving = true;
  updateSaveBar();
  try {
    const oResult = await data().updateIssue(oPanel.oIssue, oChanges);
    const oCustom = oChanges.oCustomValues ? await data().getIssueCustomFields(oResult.oIssue) : null;
    if (iEpoch !== oPanel.iEpoch) return;
    if (oChanges.aBoardIds) oPanel.aBoardIds = [...oChanges.aBoardIds];
    if (oCustom) Object.assign(oPanel, { aCustomFields: oCustom.aFields, oCustomValues: oCustom.oValues });
    afterIssueResult(oResult, `${oResult.oIssue.sKey} saved`);
    oPanel.oDraft = draftFromIssue(oResult.oIssue, oPanel.aBoardIds);
    oPanel.oFieldErrors = {};
    oPanel.bSaving = false;
    renderPanel();
    if (bTypeChanged) loadChildren(false);
    if (bTypeChanged || oChanges.sParentId !== undefined || oChanges.sSolutionVersion !== undefined) loadSolutionSections();
    if (oPanel.sTab === 'history') loadActivity(false);
  } catch (oError) {
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.bSaving = false;
    oPanel.oFieldErrors = oError.details && typeof Object.values(oError.details)[0] === 'string' ? oError.details : {};
    showToast(oError.details && typeof Object.values(oError.details)[0] === 'string' ? Object.values(oError.details)[0] : toFriendlyMessage(oError), { sKind: 'error' });
    renderPanel();
  }
}

async function changeStatus(iToStatus) {
  const iEpoch = oPanel.iEpoch;
  const eButton = qs('#panelStatus', ePanel());
  setBusy(eButton, true);
  try {
    const oFields = await collectTransitionFields(oPanel.oIssue, iToStatus);
    if (!oFields || iEpoch !== oPanel.iEpoch) {
      if (iEpoch === oPanel.iEpoch) renderPanel('panelStatus');
      return;
    }
    const oResult = await data().transitionIssue(oPanel.oIssue, iToStatus, null, oFields);
    if (iEpoch !== oPanel.iEpoch) return;
    afterIssueResult(oResult, `${oPanel.oIssue.sKey} moved to ${getIssueStatus(iToStatus).label}`);
    // Values the transition collected are saved already, so the draft takes them too.
    if (oPanel.oDraft) {
      oPanel.oDraft.iResolution = oResult.oIssue.iResolution ?? null;
      if (oFields.sAssigneeId) Object.assign(oPanel.oDraft, { sAssigneeId: oFields.sAssigneeId, sAssigneeName: oFields.sAssigneeName });
      if (oFields.iStoryPoints !== undefined) oPanel.oDraft.sPoints = formatStoryPoints(oFields.iStoryPoints);
      if (oFields.sDueDate) oPanel.oDraft.sDueDate = oFields.sDueDate;
    }
    renderPanel('panelStatus');
    if (oPanel.sTab === 'history') loadActivity(false);
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
    if (iEpoch === oPanel.iEpoch) renderPanel('panelStatus');
  }
}

// Text fields update the draft in place (no re-render, so typing and focus are never interrupted).
function bindDraftInput(eRoot, sSelector, sField) {
  const eInput = qs(sSelector, eRoot);
  if (!eInput) return;
  eInput.addEventListener('input', () => {
    oPanel.oDraft[sField] = eInput.value;
    const oErrorKeys = { sPoints: 'iStoryPoints', sOriginalEstimate: 'iOriginalEstimate', sRemainingEstimate: 'iRemainingEstimate' };
    if (oPanel.oFieldErrors[oErrorKeys[sField] || sField]) {
      oPanel.oFieldErrors = {};
      qsa('[data-error-for]', ePanel()).forEach((eSlot) => { eSlot.textContent = ''; });
    }
    updateSaveBar();
  });
}

// Selects and chips change what other controls show, so they re-render with focus restored.
function bindDraftSelect(eRoot, sSelector, fnApply) {
  const eSelect = qs(sSelector, eRoot);
  if (!eSelect) return;
  eSelect.addEventListener('change', () => {
    fnApply(eSelect.value);
    renderPanel(eSelect.id);
  });
}

function addDraftLabel(eInput) {
  const sLabel = normaliseLabel(eInput.value);
  eInput.value = '';
  if (!sLabel || oPanel.oDraft.aLabels.includes(sLabel)) return;
  if (oPanel.oDraft.aLabels.length >= LIMITS.labelsPerIssue) {
    showToast(`Use at most ${LIMITS.labelsPerIssue} labels.`, { sKind: 'error' });
    return;
  }
  oPanel.oDraft.aLabels = normaliseLabels([...oPanel.oDraft.aLabels, sLabel]);
  renderPanel('panelLabelInput');
}

function wireEditing(eRoot) {
  const oDraft = oPanel.oDraft;
  bindDraftInput(eRoot, '#panelSummary', 'sSummary');
  bindDraftInput(eRoot, '#panelDescription', 'sDescription');
  bindDraftInput(eRoot, '#panelPoints', 'sPoints');
  bindDraftInput(eRoot, '#panelDue', 'sDueDate');
  bindDraftInput(eRoot, '#panelOriginal', 'sOriginalEstimate');
  bindDraftInput(eRoot, '#panelRemaining', 'sRemainingEstimate');
  bindDraftInput(eRoot, '#panelSolutionVersion', 'sSolutionVersion');
  bindDraftSelect(eRoot, '#panelFixVersion', (sValue) => { oDraft.sFixVersionId = sValue; });
  bindDraftSelect(eRoot, '#panelPriority', (sValue) => { oDraft.iPriority = Number(sValue); });
  bindDraftSelect(eRoot, '#panelType', (sValue) => { oDraft.iType = Number(sValue); });
  bindDraftSelect(eRoot, '#panelSprint', (sValue) => { oDraft.sSprintId = sValue; });
  bindDraftSelect(eRoot, '#panelAddBoard', (sValue) => { if (sValue) oDraft.aBoardIds = [...new Set([...oDraft.aBoardIds, sValue])]; });
  bindDraftSelect(eRoot, '#panelResolution', (sValue) => { oDraft.iResolution = sValue ? Number(sValue) : null; });
  qsa('[data-custom]', eRoot).forEach((eInput) => eInput.addEventListener(eInput.tagName === 'SELECT' ? 'change' : 'input', () => {
    oDraft.oCustom[eInput.dataset.custom] = eInput.value;
    const eSlot = qs(`[data-error-for="custom:${CSS.escape(eInput.dataset.custom)}"]`, ePanel());
    if (eSlot) eSlot.textContent = '';
    updateSaveBar();
  }));
  const eAssignMe = qs('#panelAssignMe', eRoot);
  if (eAssignMe) eAssignMe.addEventListener('click', () => { Object.assign(oDraft, { sAssigneeId: oApp.oUser.sId, sAssigneeName: oApp.oUser.sName }); renderPanel('panelUnassign'); });
  const eUnassign = qs('#panelUnassign', eRoot);
  if (eUnassign) eUnassign.addEventListener('click', () => { Object.assign(oDraft, { sAssigneeId: '', sAssigneeName: '' }); renderPanel('panelAssignMe'); });
  wireCombobox(qs('#panelAssignee', eRoot), {
    fnSearch: (sText) => searchPeople(oPanel.aMembers, sText),
    fnOption: personOption,
    fnSelect: (oPerson) => { Object.assign(oDraft, { sAssigneeId: oPerson.sId, sAssigneeName: oPerson.sName }); renderPanel('panelUnassign'); },
    iMinChars: 0,
    sEmpty: 'No matching people.',
  });
  qsa('[data-remove-label]', eRoot).forEach((eButton) => eButton.addEventListener('click', () => {
    oDraft.aLabels = oDraft.aLabels.filter((sName) => sName !== eButton.dataset.removeLabel);
    renderPanel('panelLabelInput');
  }));
  const eLabelInput = qs('#panelLabelInput', eRoot);
  eLabelInput.addEventListener('keydown', (oEvent) => {
    if (oEvent.key !== 'Enter' && oEvent.key !== ',') return;
    oEvent.preventDefault();
    addDraftLabel(eLabelInput);
  });
  eLabelInput.addEventListener('change', () => { if (eLabelInput.value.trim()) addDraftLabel(eLabelInput); });
  qsa('[data-remove-board]', eRoot).forEach((eButton) => eButton.addEventListener('click', () => {
    oDraft.aBoardIds = oDraft.aBoardIds.filter((sId) => sId !== eButton.dataset.removeBoard);
    renderPanel('panelAddBoard');
  }));
  const eRemoveParent = qs('#panelRemoveParent', eRoot);
  if (eRemoveParent) eRemoveParent.addEventListener('click', () => { Object.assign(oDraft, { sParentId: '', sParentKey: '' }); renderPanel('panelParentInput'); });
  const eParentInput = qs('#panelParentInput', eRoot);
  if (eParentInput) {
    wireCombobox(eParentInput, {
      fnSearch: (sText) => data().searchParentCandidates({ sId: oPanel.oIssue.sId, sProjectId: oPanel.oIssue.sProjectId, iType: oDraft.iType }, sText),
      fnOption: (oItem) => ({ sHtml: issueOptionHtml(oItem) }),
      fnSelect: (oItem) => { Object.assign(oDraft, { sParentId: oItem.sId, sParentKey: oItem.sKey }); renderPanel('panelRemoveParent'); },
      sEmpty: 'No matching issues of an allowed type in this project.',
    });
  }
  qs('#panelSave', eRoot).addEventListener('click', savePanel);
  qs('#panelDiscard', eRoot).addEventListener('click', discardPanelChanges);
}

function wirePanel(bEdit) {
  const eRoot = ePanel();
  qsa('[data-close]', eRoot).forEach((eButton) => eButton.addEventListener('click', requestClose));
  qs('#panelCopy', eRoot).addEventListener('click', async () => {
    showToast(await copyText(oPanel.oIssue.sKey) ? `Copied ${oPanel.oIssue.sKey}` : 'Copy is not available here.', { iDuration: 1800 });
  });
  qs('#panelMore', eRoot).addEventListener('click', (oEvent) => openMenu(oEvent.currentTarget, [
    { sHtml: `${ICONS.copy} Copy link`, fnSelect: async () => showToast(await copyText(`${window.location.href.split('#')[0]}#/browse/${oPanel.oIssue.sKey}`) ? 'Link copied' : 'Copy is not available here.') },
    ...(canEdit() ? [{ bSeparator: true }, { sHtml: 'Archive issue', fnSelect: archiveCurrent }] : []),
  ], { sLabel: 'Issue actions' }));
  qsa('[data-open-issue]', eRoot).forEach((eLink) => eLink.addEventListener('click', (oEvent) => { oEvent.preventDefault(); setIssueInRoute(eLink.dataset.openIssue); }));
  qsa('[data-tab]', eRoot).forEach((eTab) => eTab.addEventListener('click', () => {
    oPanel.sTab = eTab.dataset.tab;
    qsa('[data-tab]', eRoot).forEach((eItem) => eItem.setAttribute('aria-selected', String(eItem === eTab)));
    loadActivity(false);
  }));
  const eStatus = qs('#panelStatus', eRoot);
  if (eStatus) {
    eStatus.addEventListener('click', (oEvent) => openMenu(oEvent.currentTarget,
      getAllowedTransitions(oPanel.oIssue.iStatus, oPanel.oWorkflow).map((iStatus) => ({ sHtml: `${ICONS.arrowRight} ${statusPill(iStatus)}`, fnSelect: () => changeStatus(iStatus) })),
      { sLabel: 'Transition issue' }));
  }
  if (bEdit) wireEditing(eRoot);
}

async function archiveCurrent() {
  const oIssue = oPanel.oIssue;
  const bConfirmed = await confirmDialog({ sTitle: `Archive ${oIssue.sKey}?`, sMessage: 'Archived issues are hidden from boards, lists and search. Their history and comments are kept. Unsaved edits are discarded.', sConfirmLabel: 'Archive', sKind: 'danger' });
  if (!bConfirmed) return;
  try {
    const { bHistorySaved } = await data().archiveIssue(oIssue);
    emit('issue:archived', oIssue);
    showToast(`${oIssue.sKey} archived`);
    if (!bHistorySaved) showToast('Archived, but the history entry could not be recorded.', { sKind: 'error' });
    oPanel.oDraft = null;
    requestClose();
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
  }
}

// ── Power Platform solutions (Phase 5) ─────────────────────────

const solutionContext = (sHostId) => () => ({
  eHost: qs(`#${sHostId}`, ePanel()), oIssue: oPanel.oIssue, bCanEdit: canEdit(),
  fnHistoryChanged: () => { if (oPanel.sTab === 'history') loadActivity(false); },
});

function loadSolutionSections() {
  if (!oPanel.oIssue || !isFeatureEnabled('powerPlatform')) return;
  resetSolutionPanels();
  if (isEpicType(oPanel.oIssue.iType)) loadEpicSolutions(solutionContext('panelSolutions'));
  else if (isStoryType(oPanel.oIssue.iType)) loadStoryCheck(solutionContext('panelVersionCheck'));
}

// ── Child issues (epic / story progress) ───────────────────────

async function loadChildren(bMore) {
  if (!oPanel.oIssue || !canHaveChildren(oPanel.oIssue.iType)) return;
  const iEpoch = oPanel.iEpoch;
  if (!bMore) Object.assign(oPanel, { aChildren: [], sChildrenToken: '' });
  Object.assign(oPanel, { bChildrenLoading: true, sChildrenError: '' });
  renderChildren();
  try {
    const { aIssues, sNextToken, iCount } = await data().listChildIssues(oPanel.oIssue.sId, bMore ? oPanel.sChildrenToken : '');
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.aChildren = bMore ? [...oPanel.aChildren, ...aIssues] : aIssues;
    oPanel.sChildrenToken = sNextToken;
    if (!bMore) oPanel.iChildCount = typeof iCount === 'number' ? iCount : aIssues.length;
  } catch (oError) {
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.sChildrenError = toFriendlyMessage(oError);
  }
  oPanel.bChildrenLoading = false;
  renderChildren();
}

function renderChildren() {
  const eHost = qs('#panelChildren', ePanel());
  if (!eHost) return;
  if (oPanel.sChildrenError) {
    eHost.innerHTML = `<p class="hint">${escapeHtml(oPanel.sChildrenError)} <button class="btn btn-quiet" type="button" id="childrenRetry">Try again</button></p>`;
    qs('#childrenRetry', eHost).addEventListener('click', () => loadChildren(false));
    return;
  }
  const aChildren = oPanel.aChildren;
  const oMetrics = computeSprintMetrics(aChildren);
  const iPercent = oMetrics.iIssues ? Math.round((oMetrics.iDone / oMetrics.iIssues) * 100) : 0;
  const sSummary = aChildren.length
    ? `<div class="progress-line"><span class="bar" aria-hidden="true"><i style="width:${iPercent}%"></i></span><span class="hint">${oMetrics.iDone} of ${oMetrics.iIssues}${oPanel.iChildCount > aChildren.length ? ` loaded (${oPanel.iChildCount} total)` : ''} done · ${oMetrics.iDonePoints}/${oMetrics.iPoints} points</span></div>`
    : '';
  const sRows = aChildren.map((oChild) => `<button type="button" class="mini-row" data-key="${escapeHtml(oChild.sKey)}">${typeIcon(oChild.iType)}<span class="key">${escapeHtml(oChild.sKey)}</span><span class="mini-summary">${escapeHtml(oChild.sSummary)}</span>${oChild.iStoryPoints !== null ? `<span class="points" title="Story points">${oChild.iStoryPoints}</span>` : ''}${statusPill(oChild.iStatus)}</button>`).join('');
  const sEmpty = !aChildren.length && !oPanel.bChildrenLoading ? '<p class="hint">No child issues yet.</p>' : '';
  const sMore = oPanel.sChildrenToken && !oPanel.bChildrenLoading ? '<button class="btn btn-quiet" type="button" id="childrenMore">Load more</button>' : '';
  const sAdd = canEdit() ? '<button class="btn btn-quiet" type="button" id="childAdd">+ Add child issue</button>' : '';
  eHost.innerHTML = `${sSummary}<div class="mini-rows">${sRows}</div>${oPanel.bChildrenLoading ? skeletonRows(2, 'sk-line') : ''}${sEmpty}<div class="mini-actions">${sMore}${sAdd}</div>`;
  qsa('[data-key]', eHost).forEach((eRow) => eRow.addEventListener('click', () => setIssueInRoute(eRow.dataset.key)));
  const eMore = qs('#childrenMore', eHost);
  if (eMore) eMore.addEventListener('click', () => loadChildren(true));
  const eAdd = qs('#childAdd', eHost);
  if (eAdd) eAdd.addEventListener('click', () => openCreateIssue(oPanel.oIssue.sProjectId, { oParent: oPanel.oIssue }));
}

// ── Links ──────────────────────────────────────────────────────

async function loadLinks() {
  if (!oPanel.oIssue) return;
  const iEpoch = oPanel.iEpoch;
  Object.assign(oPanel, { bLinksLoading: true, sLinksError: '' });
  renderLinks();
  try {
    const aLinks = await data().listIssueLinks(oPanel.oIssue);
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.aLinks = aLinks;
  } catch (oError) {
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.sLinksError = toFriendlyMessage(oError);
  }
  oPanel.bLinksLoading = false;
  renderLinks();
}

function renderLinks() {
  const eHost = qs('#panelLinks', ePanel());
  if (!eHost) return;
  const bEdit = canEdit();
  if (oPanel.sLinksError) {
    eHost.innerHTML = `<p class="hint">${escapeHtml(oPanel.sLinksError)} <button class="btn btn-quiet" type="button" id="linksRetry">Try again</button></p>`;
    qs('#linksRetry', eHost).addEventListener('click', loadLinks);
    return;
  }
  const sRows = oPanel.aLinks.map((oLink) => {
    const oOther = oLink.oOther;
    return `<div class="link-row"><span class="link-label">${escapeHtml(oLink.sLabel)}</span>
      ${oOther ? typeIcon(oOther.iType) : ''}<a class="key-strong" href="#" data-open-issue="${escapeHtml(oLink.sOtherKey)}">${escapeHtml(oLink.sOtherKey || 'Issue')}</a>
      <span class="mini-summary">${escapeHtml(oOther ? oOther.sSummary : 'Not available')}</span>${oOther ? statusPill(oOther.iStatus) : ''}
      ${bEdit ? `<button class="icon-btn" type="button" data-unlink="${escapeHtml(oLink.sId)}" aria-label="Remove link to ${escapeHtml(oLink.sOtherKey)}">${ICONS.close}</button>` : ''}</div>`;
  }).join('');
  const sEmpty = !oPanel.aLinks.length && !oPanel.bLinksLoading ? '<p class="hint">No linked issues.</p>' : '';
  const sForm = bEdit && oPanel.bLinkFormOpen
    ? `<div class="link-form"><label class="sr" for="panelLinkType">Link type</label><select class="sel" id="panelLinkType">${LINK_CHOICES.map((oChoice) => `<option value="${escapeHtml(oChoice.sKey)}">${escapeHtml(oChoice.sLabel)}</option>`).join('')}</select>
      ${comboboxHtml({ sId: 'panelLinkInput', sLabel: 'Issue to link', sPlaceholder: 'Search issues by key or summary' })}
      <button class="btn btn-ghost" type="button" id="panelLinkCancel">Cancel</button></div>`
    : (bEdit ? '<button class="btn btn-quiet" type="button" id="panelLinkOpen">+ Link issue</button>' : '');
  eHost.innerHTML = `<div class="mini-rows">${sRows}</div>${oPanel.bLinksLoading ? skeletonRows(1, 'sk-line') : ''}${sEmpty}${sForm}`;
  qsa('[data-open-issue]', eHost).forEach((eLink) => eLink.addEventListener('click', (oEvent) => { oEvent.preventDefault(); setIssueInRoute(eLink.dataset.openIssue); }));
  qsa('[data-unlink]', eHost).forEach((eButton) => eButton.addEventListener('click', () => removeLink(eButton)));
  const eOpen = qs('#panelLinkOpen', eHost);
  if (eOpen) eOpen.addEventListener('click', () => { oPanel.bLinkFormOpen = true; renderLinks(); qs('#panelLinkInput', ePanel()).focus(); });
  const eCancel = qs('#panelLinkCancel', eHost);
  if (eCancel) eCancel.addEventListener('click', () => { oPanel.bLinkFormOpen = false; renderLinks(); });
  const eInput = qs('#panelLinkInput', eHost);
  if (eInput) {
    wireCombobox(eInput, {
      fnSearch: async (sText) => (await data().searchIssues(sText)).aIssues,
      fnOption: (oItem) => ({ sHtml: issueOptionHtml(oItem), bDisabled: oItem.sId === oPanel.oIssue.sId }),
      fnSelect: (oItem) => addLink(qs('#panelLinkType', ePanel()).value, oItem, eInput),
      sEmpty: 'No matching issues.',
    });
  }
}

async function addLink(sChoiceKey, oOther, eInput) {
  const iEpoch = oPanel.iEpoch;
  setBusy(eInput, true);
  try {
    const bHistorySaved = await data().createIssueLink(oPanel.oIssue, sChoiceKey, oOther);
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.bLinkFormOpen = false;
    showToast(`Linked ${oPanel.oIssue.sKey} and ${oOther.sKey}`);
    if (!bHistorySaved) showToast('Linked, but the history entry could not be recorded.', { sKind: 'error' });
    await loadLinks();
    if (oPanel.sTab === 'history') loadActivity(false);
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
    setBusy(eInput, false);
  }
}

async function removeLink(eButton) {
  const oLink = oPanel.aLinks.find((oItem) => oItem.sId === eButton.dataset.unlink);
  if (!oLink) return;
  setBusy(eButton, true);
  try {
    const bHistorySaved = await data().deleteIssueLink(oPanel.oIssue, oLink);
    showToast(`Link to ${oLink.sOtherKey} removed`);
    if (!bHistorySaved) showToast('Removed, but the history entry could not be recorded.', { sKind: 'error' });
    await loadLinks();
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
    setBusy(eButton, false);
  }
}

on('issue:created', (oIssue) => { if (oPanel.oIssue && oIssue && oIssue.sParentId === oPanel.oIssue.sId) loadChildren(false); });

// ── Attachments ────────────────────────────────────────────────
// Files download through Dataverse as the signed-in user and are saved from a short-lived local object URL.

async function loadAttachments() {
  if (!oPanel.oIssue) return;
  const iEpoch = oPanel.iEpoch;
  Object.assign(oPanel, { bAttachmentsLoading: true, sAttachmentsError: '' });
  renderAttachments();
  try {
    const aAttachments = await data().listAttachments(oPanel.oIssue.sId);
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.aAttachments = aAttachments;
  } catch (oError) {
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.sAttachmentsError = toFriendlyMessage(oError);
  }
  oPanel.bAttachmentsLoading = false;
  renderAttachments();
}

function renderAttachments() {
  const eHost = qs('#panelAttachments', ePanel());
  if (!eHost) return;
  const bEdit = canEdit();
  if (oPanel.sAttachmentsError) {
    eHost.innerHTML = `<p class="hint">${escapeHtml(oPanel.sAttachmentsError)} <button class="btn btn-quiet" type="button" id="attachRetry">Try again</button></p>`;
    qs('#attachRetry', eHost).addEventListener('click', loadAttachments);
    return;
  }
  const sRows = oPanel.aAttachments.map((oAttachment) => `<div class="attach-row">${ICONS.attach}
    <button class="link-btn mini-summary" type="button" data-download="${escapeHtml(oAttachment.sId)}" title="Download ${escapeHtml(oAttachment.sName)}">${escapeHtml(oAttachment.sName)}</button>
    <span class="hint">${escapeHtml(formatFileSize(oAttachment.iSize))} · ${escapeHtml(oAttachment.sUploaderName)} · ${escapeHtml(formatRelativeTime(oAttachment.sCreatedOn))}</span>
    ${bEdit && oAttachment.sUploaderId === oApp.oUser.sId ? `<button class="icon-btn" type="button" data-delete-attachment="${escapeHtml(oAttachment.sId)}" aria-label="Delete ${escapeHtml(oAttachment.sName)}">${ICONS.close}</button>` : ''}</div>`).join('');
  const sEmpty = !oPanel.aAttachments.length && !oPanel.bAttachmentsLoading ? `<p class="hint">No attachments.${bEdit ? ' Drop files here or use Attach file.' : ''}</p>` : '';
  const sUpload = bEdit ? `<div class="mini-actions"><input type="file" id="panelFileInput" multiple hidden><button class="btn btn-quiet" type="button" id="panelAttach"${oPanel.sUploading ? ' disabled aria-busy="true"' : ''}>${oPanel.sUploading ? `Uploading ${escapeHtml(oPanel.sUploading)}…` : '+ Attach file'}</button><span class="hint">Up to ${escapeHtml(formatFileSize(LIMITS.attachmentMaxBytes))} each</span></div>` : '';
  eHost.innerHTML = `<div class="mini-rows">${sRows}</div>${oPanel.bAttachmentsLoading ? skeletonRows(1, 'sk-line') : ''}${sEmpty}${sUpload}`;
  qsa('[data-download]', eHost).forEach((eButton) => eButton.addEventListener('click', () => downloadFile(eButton)));
  qsa('[data-delete-attachment]', eHost).forEach((eButton) => eButton.addEventListener('click', () => removeAttachment(eButton)));
  const eInput = qs('#panelFileInput', eHost);
  if (!eInput) return;
  qs('#panelAttach', eHost).addEventListener('click', () => eInput.click());
  eInput.addEventListener('change', () => uploadFiles([...eInput.files]));
  if (eHost.dataset.dropWired) return;
  eHost.dataset.dropWired = 'true';
  eHost.addEventListener('dragover', (oEvent) => { if (canEdit() && [...oEvent.dataTransfer.types].includes('Files')) { oEvent.preventDefault(); eHost.classList.add('drop'); } });
  eHost.addEventListener('dragleave', (oEvent) => { if (!eHost.contains(oEvent.relatedTarget)) eHost.classList.remove('drop'); });
  eHost.addEventListener('drop', (oEvent) => {
    eHost.classList.remove('drop');
    if (!canEdit() || !oEvent.dataTransfer.files.length) return;
    oEvent.preventDefault();
    uploadFiles([...oEvent.dataTransfer.files]);
  });
}

async function uploadFiles(aFiles) {
  if (oPanel.sUploading || !aFiles.length) return;
  const iEpoch = oPanel.iEpoch;
  let iUploaded = 0;
  for (const oFile of aFiles) {
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.sUploading = oFile.name;
    renderAttachments();
    try {
      const { oAttachment, bHistorySaved } = await data().uploadAttachment(oPanel.oIssue, oFile);
      if (iEpoch !== oPanel.iEpoch) return;
      oPanel.aAttachments = [oAttachment, ...oPanel.aAttachments];
      iUploaded += 1;
      if (!bHistorySaved) showToast('Attached, but the history entry could not be recorded.', { sKind: 'error' });
    } catch (oError) {
      showToast(`${oFile.name}: ${toFriendlyMessage(oError)}`, { sKind: 'error' });
    }
  }
  oPanel.sUploading = '';
  renderAttachments();
  if (iUploaded) showToast(`${iUploaded} file${iUploaded === 1 ? '' : 's'} attached to ${oPanel.oIssue.sKey}`);
  if (oPanel.sTab === 'history') loadActivity(false);
}

async function downloadFile(eButton) {
  const oAttachment = oPanel.aAttachments.find((oItem) => oItem.sId === eButton.dataset.download);
  if (!oAttachment) return;
  setBusy(eButton, true);
  try {
    const { aBytes, sName } = await data().downloadAttachment(oAttachment);
    // Always a download (never rendered in the app's origin), whatever the file claims to be.
    const sUrl = URL.createObjectURL(new Blob([aBytes], { type: 'application/octet-stream' }));
    const eLink = document.createElement('a');
    eLink.href = sUrl;
    eLink.download = sName;
    document.body.appendChild(eLink);
    eLink.click();
    eLink.remove();
    setTimeout(() => URL.revokeObjectURL(sUrl), 30000);
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
  } finally {
    setBusy(eButton, false);
  }
}

async function removeAttachment(eButton) {
  const oAttachment = oPanel.aAttachments.find((oItem) => oItem.sId === eButton.dataset.deleteAttachment);
  if (!oAttachment) return;
  const bConfirmed = await confirmDialog({ sTitle: `Delete ${oAttachment.sName}?`, sMessage: 'The file is removed from this issue for everyone. The history keeps a note that it was removed.', sConfirmLabel: 'Delete file', sKind: 'danger' });
  if (!bConfirmed) return;
  setBusy(eButton, true);
  try {
    const bHistorySaved = await data().deleteAttachment(oPanel.oIssue, oAttachment);
    oPanel.aAttachments = oPanel.aAttachments.filter((oItem) => oItem.sId !== oAttachment.sId);
    renderAttachments();
    showToast(`${oAttachment.sName} deleted`);
    if (!bHistorySaved) showToast('Deleted, but the history entry could not be recorded.', { sKind: 'error' });
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
    setBusy(eButton, false);
  }
}

// ── Time tracking (Phase 4) ────────────────────────────────────
// Estimates are edited with the other fields (Save); work logs save straight away and are edited or voided, never deleted.

async function loadWorkLogs(bMore) {
  if (!oPanel.oIssue || !isFeatureEnabled('timeTracking')) return;
  const iEpoch = oPanel.iEpoch;
  if (!bMore) Object.assign(oPanel, { aWorkLogs: [], sWorkLogsToken: '' });
  Object.assign(oPanel, { bWorkLogsLoading: true, sWorkLogsError: '' });
  renderTime();
  try {
    const { aWorkLogs, sNextToken, iCount } = await data().listWorkLogs(oPanel.oIssue.sId, bMore ? oPanel.sWorkLogsToken : '');
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.aWorkLogs = bMore ? [...oPanel.aWorkLogs, ...aWorkLogs] : aWorkLogs;
    oPanel.sWorkLogsToken = sNextToken;
    if (!bMore) oPanel.iWorkLogCount = typeof iCount === 'number' ? iCount : aWorkLogs.length;
  } catch (oError) {
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.sWorkLogsError = toFriendlyMessage(oError);
  }
  oPanel.bWorkLogsLoading = false;
  renderTime();
}

function timeSummaryHtml(oIssue) {
  const oTime = summariseIssueTime(oIssue);
  const sOriginal = oTime.iOriginal === null ? 'Not estimated' : `${formatDuration(oTime.iOriginal)} estimated`;
  return `<div class="time-bar" role="img" aria-label="${escapeHtml(`${formatDuration(oTime.iSpent)} logged, ${oTime.iRemaining === null ? 'no remaining estimate' : `${formatDuration(oTime.iRemaining)} remaining`}`)}">
      <i class="spent" style="width:${oTime.iSpentPercent}%"></i><i class="left" style="width:${oTime.iRemainingPercent}%"></i></div>
    <div class="time-legend"><span><b>${escapeHtml(formatDuration(oTime.iSpent))}</b> logged</span><span><b>${escapeHtml(oTime.iRemaining === null ? '—' : formatDuration(oTime.iRemaining))}</b> remaining</span><span class="hint">${escapeHtml(sOriginal)}${oTime.bOverEstimate ? ' · over the original estimate' : ''}</span></div>`;
}

function workLogHtml(oLog) {
  const bMine = oLog.sAuthorId === oApp.oUser.sId;
  const bCanVoid = canEdit() && !oLog.bVoided && (bMine || oPanel.oPermissions.bCanManage);
  return `<div class="worklog-row${oLog.bVoided ? ' voided' : ''}" data-worklog="${escapeHtml(oLog.sId)}">${avatar(oLog.sAuthorId, oLog.sAuthorName, 'xs')}
    <span class="mini-summary"><b>${escapeHtml(formatDuration(oLog.iMinutes))}</b> · ${escapeHtml(formatDateOnly(oLog.sWorkDate))} · ${escapeHtml(oLog.sAuthorName)}${oLog.sComment ? `<small>${escapeHtml(oLog.sComment)}</small>` : ''}${oLog.bVoided ? `<small>Voided: ${escapeHtml(oLog.sVoidReason)}</small>` : ''}</span>
    ${canEdit() && bMine && !oLog.bVoided ? `<button class="btn btn-quiet" type="button" data-edit-worklog="${escapeHtml(oLog.sId)}">Edit</button>` : ''}
    ${bCanVoid ? `<button class="btn btn-quiet" type="button" data-void-worklog="${escapeHtml(oLog.sId)}">Void</button>` : ''}</div>`;
}

function renderTime() {
  const eHost = qs('#panelTime', ePanel());
  if (!eHost || !oPanel.oIssue) return;
  const sLogs = oPanel.sWorkLogsError
    ? `<p class="hint">${escapeHtml(oPanel.sWorkLogsError)} <button class="btn btn-quiet" type="button" id="worklogRetry">Try again</button></p>`
    : `<div class="mini-rows">${oPanel.aWorkLogs.map(workLogHtml).join('')}</div>${oPanel.bWorkLogsLoading ? skeletonRows(1, 'sk-line') : ''}${!oPanel.aWorkLogs.length && !oPanel.bWorkLogsLoading ? '<p class="hint">No work logged yet.</p>' : ''}`;
  const sMore = oPanel.sWorkLogsToken && !oPanel.bWorkLogsLoading ? '<button class="btn btn-quiet" type="button" id="worklogMore">Load more</button>' : '';
  const sLog = canEdit() ? `<button class="btn btn-quiet" type="button" id="worklogAdd">${ICONS.clock} Log work</button>` : '';
  eHost.innerHTML = `${timeSummaryHtml(oPanel.oIssue)}${sLogs}<div class="mini-actions">${sMore}${sLog}</div>`;
  const eRetry = qs('#worklogRetry', eHost);
  if (eRetry) eRetry.addEventListener('click', () => loadWorkLogs(false));
  const eMore = qs('#worklogMore', eHost);
  if (eMore) eMore.addEventListener('click', () => loadWorkLogs(true));
  const eAdd = qs('#worklogAdd', eHost);
  if (eAdd) eAdd.addEventListener('click', () => openWorkLogDialog(null));
  qsa('[data-edit-worklog]', eHost).forEach((eButton) => eButton.addEventListener('click', () => openWorkLogDialog(oPanel.aWorkLogs.find((oLog) => oLog.sId === eButton.dataset.editWorklog))));
  qsa('[data-void-worklog]', eHost).forEach((eButton) => eButton.addEventListener('click', () => openVoidDialog(oPanel.aWorkLogs.find((oLog) => oLog.sId === eButton.dataset.voidWorklog))));
}

// Saved estimates follow the server unless the person has unsaved estimate edits in the draft.
function applyTimeResult(oIssue) {
  const oDraft = oPanel.oDraft;
  const bOriginalClean = oDraft && oDraft.sOriginalEstimate === formatDuration(oPanel.oIssue.iOriginalEstimate);
  const bRemainingClean = oDraft && oDraft.sRemainingEstimate === formatDuration(oPanel.oIssue.iRemainingEstimate);
  oPanel.oIssue = oIssue;
  if (bOriginalClean) oDraft.sOriginalEstimate = formatDuration(oIssue.iOriginalEstimate);
  if (bRemainingClean) oDraft.sRemainingEstimate = formatDuration(oIssue.iRemainingEstimate);
  emit('issue:changed', { ...oIssue, aBoardIds: [...oPanel.aBoardIds] });
}

// oLog null = log new work (with the remaining estimate after it); otherwise edit that log.
function openWorkLogDialog(oLog) {
  const oIssue = oPanel.oIssue;
  const bNew = !oLog;
  const sToday = toDateOnly(new Date());
  const fnRemaining = (sDuration) => {
    const { iMinutes } = parseDuration(sDuration);
    const iRemaining = remainingAfterLog(oIssue, iMinutes || 0);
    return iRemaining === null ? '' : formatDuration(iRemaining);
  };
  const oModal = openModal({
    sTitle: bNew ? `Log work on ${oIssue.sKey}` : 'Edit work log',
    sSize: 'sm',
    sBodyHtml: `<div class="row2"><label class="field">Time spent <b class="req">*</b><input class="inp" data-field="iMinutes" value="${escapeHtml(bNew ? '' : formatDuration(oLog.iMinutes))}" placeholder="e.g. 2h 30m" autocomplete="off"><span class="err" data-error-for="iMinutes"></span></label>
      <label class="field">Date <b class="req">*</b><input class="inp" type="date" data-field="sWorkDate" value="${escapeHtml(bNew ? sToday : oLog.sWorkDate)}" max="${escapeHtml(sToday)}"><span class="err" data-error-for="sWorkDate"></span></label></div>
      ${bNew ? `<label class="field">Remaining estimate<input class="inp" data-field="iRemainingEstimate" value="${escapeHtml(fnRemaining(''))}" placeholder="None" autocomplete="off"><span class="hint">Reduced automatically by the time spent. Change it if you know better.</span><span class="err" data-error-for="iRemainingEstimate"></span></label>` : ''}
      <label class="field">What did you work on?<textarea class="txt" data-field="sComment" rows="3" maxlength="${LIMITS.workLogCommentMax}">${escapeHtml(bNew ? '' : oLog.sComment)}</textarea><span class="err" data-error-for="sComment"></span></label>
      <p class="hint">1d = 8h and 1w = 5d. Up to 24h per entry. Logged time adds up to the issue's time spent; estimates stay separate.</p>`,
    aActions: [
      { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
      { sLabel: bNew ? 'Log work' : 'Save', sKind: 'primary', fnClick: (oHandle, iIndex) => submitWorkLog(oHandle, iIndex, oLog) },
    ],
  });
  const eDuration = qs('[data-field="iMinutes"]', oModal.eModal);
  const eRemaining = qs('[data-field="iRemainingEstimate"]', oModal.eModal);
  if (eDuration && eRemaining) {
    let bRemainingEdited = false;
    eRemaining.addEventListener('input', () => { bRemainingEdited = true; });
    eDuration.addEventListener('input', () => { if (!bRemainingEdited) eRemaining.value = fnRemaining(eDuration.value); });
  }
}

async function submitWorkLog(oHandle, iIndex, oLog) {
  const fnValue = (sField) => { const eInput = qs(`[data-field="${sField}"]`, oHandle.eModal); return eInput ? eInput.value : ''; };
  const oErrors = {};
  const { iMinutes, sError } = parseDuration(fnValue('iMinutes'));
  if (sError || iMinutes === null) oErrors.iMinutes = sError || 'Enter the time spent, e.g. 2h 30m.';
  const oDraft = { iMinutes, sWorkDate: fnValue('sWorkDate'), sComment: fnValue('sComment').trim() };
  if (!oErrors.iMinutes) Object.assign(oErrors, validateWorkLog(oDraft, toDateOnly(new Date())).oErrors);
  if (!oLog) {
    const { iMinutes: iRemaining, sError: sRemainingError } = parseDuration(fnValue('iRemainingEstimate'));
    if (sRemainingError) oErrors.iRemainingEstimate = sRemainingError;
    else oDraft.iRemainingEstimate = iRemaining;
  }
  showFieldErrors(oHandle.eModal, oErrors);
  if (Object.keys(oErrors).length) return;
  const iEpoch = oPanel.iEpoch;
  oHandle.setBusy(true, iIndex);
  try {
    const oResult = oLog ? await data().updateWorkLog(oPanel.oIssue, oLog, oDraft) : await data().logWork(oPanel.oIssue, oDraft);
    oHandle.close(true);
    if (iEpoch !== oPanel.iEpoch) return;
    applyTimeResult(oResult.oIssue);
    showToast(oLog ? 'Work log updated' : `${formatDuration(oDraft.iMinutes)} logged on ${oPanel.oIssue.sKey}`);
    if (!oResult.bHistorySaved) showToast('Saved, but the history entry could not be recorded.', { sKind: 'error' });
    if (oResult.bRemainingSaved === false) showToast('Work logged, but the remaining estimate couldn\'t be updated. Change it in the issue details.', { sKind: 'error' });
    renderPanel();
    loadWorkLogs(false);
    if (oPanel.sTab === 'history') loadActivity(false);
  } catch (oError) {
    oHandle.setBusy(false, iIndex);
    if (oError.details) showFieldErrors(oHandle.eModal, oError.details);
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
  }
}

function openVoidDialog(oLog) {
  if (!oLog) return;
  openModal({
    sTitle: 'Void work log',
    sSize: 'sm',
    sBodyHtml: `<p>${escapeHtml(`${formatDuration(oLog.iMinutes)} on ${formatDateOnly(oLog.sWorkDate)} by ${oLog.sAuthorName}`)} will stop counting towards time spent. It stays visible, marked as voided, and the history records why.</p>
      <label class="field">Reason <b class="req">*</b><input class="inp" data-field="sReason" maxlength="${LIMITS.voidReasonMax}" placeholder="e.g. Logged twice by mistake" autocomplete="off"><span class="err" data-error-for="sReason"></span></label>`,
    aActions: [
      { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
      {
        sLabel: 'Void work log', sKind: 'danger',
        fnClick: async (oHandle, iIndex) => {
          const sReason = qs('[data-field="sReason"]', oHandle.eModal).value;
          const sError = validateVoidReason(sReason);
          showFieldErrors(oHandle.eModal, sError ? { sReason: sError } : {});
          if (sError) return;
          const iEpoch = oPanel.iEpoch;
          oHandle.setBusy(true, iIndex);
          try {
            const oResult = await data().voidWorkLog(oPanel.oIssue, oLog, sReason);
            oHandle.close(true);
            if (iEpoch !== oPanel.iEpoch) return;
            applyTimeResult(oResult.oIssue);
            showToast('Work log voided');
            renderPanel();
            loadWorkLogs(false);
            if (oPanel.sTab === 'history') loadActivity(false);
          } catch (oError) {
            oHandle.setBusy(false, iIndex);
            showToast(toFriendlyMessage(oError), { sKind: 'error' });
          }
        },
      },
    ],
  });
}

document.addEventListener('keydown', (oEvent) => {
  if (!(oEvent.ctrlKey || oEvent.metaKey) || oEvent.key.toLowerCase() !== 's' || !isPanelOpen() || !oPanel.oDraft) return;
  if (qs('#modalHost').children.length) return;
  oEvent.preventDefault();
  savePanel();
});

// ── Activity (comments + history) ──────────────────────────────

async function loadActivity(bMore) {
  const iEpoch = oPanel.iEpoch;
  const sTab = oPanel.sTab;
  if (!bMore) {
    if (sTab === 'comments') Object.assign(oPanel, { aComments: [], sCommentsToken: '' });
    else Object.assign(oPanel, { aHistory: [], sHistoryToken: '' });
  }
  oPanel.bActivityLoading = true;
  renderActivity();
  try {
    if (sTab === 'comments') {
      const { aComments, sNextToken, iCount } = await data().listComments(oPanel.oIssue.sId, bMore ? oPanel.sCommentsToken : '');
      if (iEpoch !== oPanel.iEpoch || sTab !== oPanel.sTab) return;
      oPanel.aComments = bMore ? [...oPanel.aComments, ...aComments] : aComments;
      oPanel.sCommentsToken = sNextToken;
      if (!bMore && typeof iCount === 'number') oPanel.iCommentCount = iCount;
    } else {
      const { aEntries, sNextToken } = await data().listHistory(oPanel.oIssue.sId, bMore ? oPanel.sHistoryToken : '');
      if (iEpoch !== oPanel.iEpoch || sTab !== oPanel.sTab) return;
      oPanel.aHistory = bMore ? [...oPanel.aHistory, ...aEntries] : aEntries;
      oPanel.sHistoryToken = sNextToken;
    }
    oPanel.bActivityLoading = false;
    renderActivity();
  } catch (oError) {
    if (iEpoch !== oPanel.iEpoch) return;
    oPanel.bActivityLoading = false;
    const eActivity = qs('#activityList', ePanel()) || qs('#panelActivity', ePanel());
    if (eActivity) eActivity.innerHTML = stateHtml({ sTitle: 'Activity unavailable', sMessage: toFriendlyMessage(oError), sIcon: '!', sActionLabel: 'Try again', sActionId: 'activityRetry' });
    const eRetry = qs('#activityRetry', ePanel());
    if (eRetry) eRetry.addEventListener('click', () => loadActivity(false));
  }
}

function commentHtml(oComment) {
  const bMine = oComment.sAuthorId === oApp.oUser.sId && oPanel.oPermissions.bCanView;
  return `<div class="act" data-comment="${escapeHtml(oComment.sId)}">${avatar(oComment.sAuthorId, oComment.sAuthorName, '')}
    <div class="act-body"><span class="who">${escapeHtml(oComment.sAuthorName)}</span> <small title="${escapeHtml(new Date(oComment.sCreatedOn).toLocaleString())}">${escapeHtml(formatRelativeTime(oComment.sCreatedOn))}${oComment.bEdited ? ' · edited' : ''}</small>
    <div class="act-text">${escapeHtml(oComment.sBody)}</div>
    ${bMine ? `<button class="btn btn-quiet" type="button" data-edit-comment="${escapeHtml(oComment.sId)}" style="padding-left:0">Edit</button>` : ''}</div></div>`;
}

function historyText(oEntry) {
  const sWho = `<b>${escapeHtml(oEntry.sByName)}</b>`;
  const sChange = `<span class="chip">${escapeHtml(oEntry.sOldValue || 'None')}</span> → <span class="chip">${escapeHtml(oEntry.sNewValue || 'None')}</span>`;
  switch (oEntry.iEvent) {
    case HISTORY_EVENTS.created: return `${sWho} created the issue`;
    case HISTORY_EVENTS.transitioned: return `${sWho} changed the Status ${sChange}`;
    case HISTORY_EVENTS.commented: return `${sWho} added a comment`;
    case HISTORY_EVENTS.archived: return `${sWho} archived the issue`;
    case HISTORY_EVENTS.sprintChanged: return `${sWho} changed the Sprint ${sChange}`;
    case HISTORY_EVENTS.linked: return oEntry.sNewValue
      ? `${sWho} added a link <span class="chip">${escapeHtml(oEntry.sNewValue)}</span>`
      : `${sWho} removed a link <span class="chip">${escapeHtml(oEntry.sOldValue)}</span>`;
    default:
      if (oEntry.sField === 'attachments') return `${sWho} ${escapeHtml(oEntry.sNewValue.startsWith('Removed') ? 'removed an attachment' : 'added an attachment')} <span class="chip">${escapeHtml(oEntry.sNewValue.replace(/^(Added|Removed) /, ''))}</span>`;
      if (oEntry.sField === 'worklog') {
        if (!oEntry.sOldValue) return `${sWho} logged work <span class="chip">${escapeHtml(oEntry.sNewValue.replace(/^Logged /, ''))}</span>`;
        if (oEntry.sNewValue.startsWith('Voided')) return `${sWho} voided a work log <span class="chip">${escapeHtml(oEntry.sOldValue)}</span> <span class="hint">${escapeHtml(oEntry.sNewValue.replace(/^Voided: /, ''))}</span>`;
        return `${sWho} edited a work log ${sChange}`;
      }
      if (oEntry.sField.startsWith('solution:')) {
        const oStage = getSolutionStageByKey(oEntry.sField.slice(9));
        return `${sWho} changed the ${escapeHtml(oStage ? oStage.label : '')} solution ${sChange}`;
      }
      return `${sWho} changed ${escapeHtml(HISTORY_LABELS[oEntry.sField] || oEntry.sField.replace(/^cf:/, '') || 'a field')} ${sChange}`;
  }
}

function renderActivity() {
  const eActivity = qs('#panelActivity', ePanel());
  if (!eActivity || !oPanel.oIssue) return;
  const bEdit = canEdit();
  const bComments = oPanel.sTab === 'comments';
  // The composer is built once per tab so in-progress text survives list reloads.
  if (eActivity.dataset.tab !== oPanel.sTab || !qs('#activityList', eActivity)) {
    eActivity.dataset.tab = oPanel.sTab;
    const sComposer = bComments && bEdit ? `<div class="composer">${avatar(oApp.oUser.sId, oApp.oUser.sName, '')}
      <div class="composer-body"><label class="sr" for="commentInput">Add a comment</label>
      <textarea class="txt" id="commentInput" rows="2" maxlength="${LIMITS.commentMax}" placeholder="Add a comment… Type @ to mention someone  (press M to comment)">${escapeHtml(oPanel.sCommentDraft || '')}</textarea>
      <div class="composer-actions"${oPanel.sCommentDraft ? '' : ' hidden'} id="commentActions"><button class="btn btn-primary" type="button" id="commentSave">Save</button><button class="btn btn-ghost" type="button" id="commentCancel">Cancel</button><span class="hint">Ctrl+Enter to save</span></div></div></div>` : '';
    eActivity.innerHTML = `${sComposer}<div id="activityList" aria-live="polite"></div>`;
    wireComposer();
  }
  renderActivityList();
}

function renderActivityList() {
  const eList = qs('#activityList', ePanel());
  if (!eList) return;
  const bComments = oPanel.sTab === 'comments';
  const aItems = bComments ? oPanel.aComments : oPanel.aHistory;
  const sToken = bComments ? oPanel.sCommentsToken : oPanel.sHistoryToken;
  let sList = '';
  if (aItems.length) {
    sList = bComments ? aItems.map(commentHtml).join('') : aItems.map((oEntry) => `<div class="act">${avatar(oEntry.sById, oEntry.sByName, '')}<div class="act-body hist">${historyText(oEntry)}<br><small title="${escapeHtml(new Date(oEntry.sOn).toLocaleString())}">${escapeHtml(formatRelativeTime(oEntry.sOn))}</small></div></div>`).join('');
  } else if (!oPanel.bActivityLoading) {
    sList = `<p class="hint" style="padding:12px 0">${bComments ? 'No comments yet.' : 'No history yet.'}</p>`;
  }
  const sMore = sToken && !oPanel.bActivityLoading ? '<div class="load-more"><button class="btn btn-ghost" type="button" id="activityMore">Load more</button></div>' : '';
  eList.innerHTML = `${sList}${oPanel.bActivityLoading ? skeletonRows(3, 'sk-row') : ''}${sMore}`;
  const eMore = qs('#activityMore', eList);
  if (eMore) eMore.addEventListener('click', () => loadActivity(true));
  qsa('[data-edit-comment]', eList).forEach((eButton) => eButton.addEventListener('click', () => startCommentEdit(eButton.dataset.editComment)));
}

function wireComposer() {
  const eActivity = qs('#panelActivity', ePanel());
  const eInput = qs('#commentInput', eActivity);
  if (!eInput) return;
  wireMentions(eInput, () => oPanel.aMembers);
  const eActions = qs('#commentActions', eActivity);
  const fnReset = () => { eInput.value = ''; oPanel.sCommentDraft = ''; eActions.hidden = true; };
  eInput.addEventListener('focus', () => { eActions.hidden = false; });
  eInput.addEventListener('input', () => { oPanel.sCommentDraft = eInput.value; });
  eInput.addEventListener('keydown', (oEvent) => {
    if (oEvent.key === 'Enter' && (oEvent.ctrlKey || oEvent.metaKey)) { oEvent.preventDefault(); qs('#commentSave', eActivity).click(); }
    if (oEvent.key === 'Escape') { oEvent.stopPropagation(); fnReset(); eInput.blur(); }
  });
  qs('#commentCancel', eActivity).addEventListener('click', fnReset);
  qs('#commentSave', eActivity).addEventListener('click', async (oEvent) => {
    const eButton = oEvent.currentTarget;
    if (!eInput.value.trim()) { eInput.focus(); return; }
    const iEpoch = oPanel.iEpoch;
    setBusy(eButton, true);
    eInput.disabled = true;
    try {
      const { oComment, bHistorySaved } = await data().addComment(oPanel.oIssue, eInput.value);
      if (iEpoch !== oPanel.iEpoch) return;
      oPanel.aComments = [oComment, ...oPanel.aComments];
      oPanel.oIssue = { ...oPanel.oIssue, sModifiedOn: new Date().toISOString() };
      emit('issue:changed', oPanel.oIssue);
      if (!bHistorySaved) showToast('Comment saved, but its history entry could not be recorded.', { sKind: 'error' });
      fnReset();
      renderActivityList();
    } catch (oError) {
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
    } finally {
      setBusy(eButton, false);
      eInput.disabled = false;
    }
  });
}

function startCommentEdit(sCommentId) {
  const oComment = oPanel.aComments.find((oItem) => oItem.sId === sCommentId);
  const eRow = qs(`[data-comment="${CSS.escape(sCommentId)}"] .act-body`, ePanel());
  if (!oComment || !eRow) return;
  eRow.innerHTML = `<label class="sr" for="commentEditInput">Edit comment</label><textarea class="txt" id="commentEditInput" rows="3" maxlength="${LIMITS.commentMax}">${escapeHtml(oComment.sBody)}</textarea>
    <div class="composer-actions" style="margin-top:8px"><button class="btn btn-primary" type="button" id="commentEditSave">Save</button><button class="btn btn-ghost" type="button" id="commentEditCancel">Cancel</button></div>`;
  const eInput = qs('#commentEditInput', eRow);
  eInput.focus();
  qs('#commentEditCancel', eRow).addEventListener('click', renderActivity);
  qs('#commentEditSave', eRow).addEventListener('click', async (oEvent) => {
    setBusy(oEvent.currentTarget, true);
    try {
      const oUpdated = await data().updateComment(oComment, eInput.value);
      oPanel.aComments = oPanel.aComments.map((oItem) => (oItem.sId === oUpdated.sId ? oUpdated : oItem));
      renderActivity();
    } catch (oError) {
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
      setBusy(oEvent.currentTarget, false);
    }
  });
}

export function focusCommentComposer() {
  if (!isPanelOpen() || !oPanel.oIssue) return false;
  if (oPanel.sTab !== 'comments') {
    oPanel.sTab = 'comments';
    renderPanel();
    loadActivity(false);
  }
  const eInput = qs('#commentInput', ePanel());
  if (eInput) eInput.focus();
  return Boolean(eInput);
}

// Board moves update status/rank elsewhere; staged edits in the draft are kept.
export function refreshPanelIssue(oIssue) {
  if (oPanel.oIssue && oIssue && oIssue.sId === oPanel.oIssue.sId && isPanelOpen()) {
    oPanel.oIssue = { ...oPanel.oIssue, ...oIssue };
    renderPanel();
  }
}
