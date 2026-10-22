// Create-issue modal. Available from the top bar, boards, the backlog, child-issue lists and the "c" shortcut.
// oOptions: { oParent (pre-selected parent issue), sBoardId (extra board to add the issue to), sSprintId }.
import { ISSUE_TYPES, PRIORITIES, LIMITS } from '../../config/app-config.js';
import {
  validateIssueDraft, normaliseLabels, toFriendlyMessage, getProjectPermissions, parseStoryPoints, getAllowedParentTypes,
  getIssueLevel, getIssueType, getSprintState, isSprintOpen,
} from '../domain.js';
import { oApp, data, emit, setIssueInRoute } from './context.js';
import { escapeHtml, openModal, showToast, showFieldErrors, qs, typeIcon, avatar } from './dom.js';
import { comboboxHtml, issueOptionHtml, wireCombobox, searchPeople, personOption } from './pickers.js';

function eligibleProjects() {
  return oApp.aMyMemberships
    .filter((oMember) => getProjectPermissions(oMember).bCanEdit)
    .sort((oA, oB) => oA.sProjectName.localeCompare(oB.sProjectName));
}

function optionList(aOptions, iSelected) {
  return aOptions.map((oOption) => `<option value="${oOption.value}"${oOption.value === iSelected ? ' selected' : ''}>${escapeHtml(oOption.label)}</option>`).join('');
}

// The most common child type one level below the parent (Epic → Story, Story → Task).
function childTypeFor(oParent) {
  const oNext = ISSUE_TYPES.find((oType) => oType.level === getIssueLevel(oParent.iType) + 1);
  return oNext ? oNext.value : ISSUE_TYPES[0].value;
}

async function loadProjectChoices(eModal, sProjectId, sSprintId, oState) {
  const eSprint = qs('[data-field="sSprintId"]', eModal);
  const eLabels = qs('#createLabelOptions', eModal);
  eSprint.disabled = true;
  try {
    const [aMembers, aLabels, aSprints] = await Promise.all([data().listMembers(sProjectId), data().listProjectLabels(sProjectId), data().listSprints(sProjectId)]);
    oState.aMembers = aMembers;
    eSprint.innerHTML = `<option value="">Backlog (no sprint)</option>${aSprints.filter((oSprint) => isSprintOpen(oSprint.iState)).map((oSprint) => `<option value="${escapeHtml(oSprint.sId)}"${oSprint.sId === sSprintId ? ' selected' : ''}>${escapeHtml(`${oSprint.sName} · ${getSprintState(oSprint.iState).label}`)}</option>`).join('')}`;
    eLabels.innerHTML = aLabels.map((oLabel) => `<option value="${escapeHtml(oLabel.sName)}"></option>`).join('');
  } catch (oError) {
    oState.aMembers = [];
    eSprint.innerHTML = '<option value="">Backlog (no sprint)</option>';
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
  } finally {
    eSprint.disabled = false;
  }
}

function renderAssigneeField(oModal, oState) {
  const eHost = qs('#createAssigneeHost', oModal.eModal);
  const oAssignee = oState.oAssignee;
  const bMember = !oAssignee || oState.aMembers.some((oMember) => oMember.sUserId === oAssignee.sId);
  eHost.innerHTML = `<div class="picked">${oAssignee
    ? `${avatar(oAssignee.sId, oAssignee.sName, 'xs')}<span class="mini-summary">${escapeHtml(oAssignee.sName)}${bMember ? '' : ' <span class="hint">(not a project member)</span>'}</span><button class="btn btn-quiet" type="button" id="createUnassign">Remove</button>`
    : `${avatar('', '', 'xs')}<span class="hint">Unassigned</span>${oApp.oUser ? '<button class="btn btn-quiet" type="button" id="createAssignMe">Assign to me</button>' : ''}`}</div>
    ${comboboxHtml({ sId: 'createAssigneeInput', sLabel: 'Assignee', sPlaceholder: 'Search people by name or email' })}`;
  const fnSet = (oPerson) => { oState.oAssignee = oPerson; renderAssigneeField(oModal, oState); };
  const eUnassign = qs('#createUnassign', eHost);
  if (eUnassign) eUnassign.addEventListener('click', () => fnSet(null));
  const eAssignMe = qs('#createAssignMe', eHost);
  if (eAssignMe) eAssignMe.addEventListener('click', () => fnSet({ sId: oApp.oUser.sId, sName: oApp.oUser.sName }));
  wireCombobox(qs('#createAssigneeInput', eHost), {
    fnSearch: (sText) => searchPeople(oState.aMembers, sText),
    fnOption: personOption,
    fnSelect: fnSet,
    iMinChars: 0,
    sEmpty: 'No matching people.',
  });
}

function renderParentField(oModal, oState) {
  const eHost = qs('#createParentHost', oModal.eModal);
  const iType = Number(qs('[data-field="iType"]', oModal.eModal).value);
  const aAllowed = getAllowedParentTypes(iType);
  if (oState.oParent && !aAllowed.includes(oState.oParent.iType)) oState.oParent = null;
  if (oState.oParent) {
    eHost.innerHTML = `<div class="picked">${typeIcon(oState.oParent.iType)}<span class="key">${escapeHtml(oState.oParent.sKey)}</span><span class="mini-summary">${escapeHtml(oState.oParent.sSummary || '')}</span><button class="btn btn-quiet" type="button" id="createParentClear">Remove</button></div>`;
    qs('#createParentClear', eHost).addEventListener('click', () => { oState.oParent = null; renderParentField(oModal, oState); qs('#createParentInput', oModal.eModal).focus(); });
    return;
  }
  if (!aAllowed.length) {
    eHost.innerHTML = '<span class="hint">Epics are top level, so they have no parent.</span>';
    return;
  }
  const sTypes = aAllowed.map((iAllowed) => getIssueType(iAllowed).label.toLowerCase()).join(' or ');
  eHost.innerHTML = comboboxHtml({ sId: 'createParentInput', sLabel: 'Parent issue', sPlaceholder: `Find ${sTypes} by key or summary` });
  wireCombobox(qs('#createParentInput', eHost), {
    fnSearch: (sText) => data().searchParentCandidates({ sId: '', sProjectId: qs('[data-field="sProjectId"]', oModal.eModal).value, iType }, sText),
    fnOption: (oItem) => ({ sHtml: issueOptionHtml(oItem) }),
    fnSelect: (oItem) => { oState.oParent = oItem; renderParentField(oModal, oState); },
    sEmpty: 'No matching issues of an allowed type in this project.',
  });
}

function readDraft(eModal, oState) {
  const fnValue = (sField) => qs(`[data-field="${sField}"]`, eModal).value;
  const { iPoints, sError } = parseStoryPoints(fnValue('iStoryPoints'));
  return {
    oDraft: {
      sProjectId: fnValue('sProjectId'),
      iType: Number(fnValue('iType')),
      sSummary: fnValue('sSummary').trim(),
      sDescription: fnValue('sDescription'),
      sAssigneeId: oState.oAssignee ? oState.oAssignee.sId : '',
      iPriority: Number(fnValue('iPriority')),
      sDueDate: fnValue('sDueDate'),
      aLabels: normaliseLabels(fnValue('aLabels').split(',')),
      iStoryPoints: iPoints,
      sSprintId: fnValue('sSprintId'),
      sParentId: oState.oParent ? oState.oParent.sId : '',
      sBoardId: oState.sBoardProjectId === fnValue('sProjectId') ? oState.sBoardId : '',
    },
    sPointsError: sError,
  };
}

async function submit(oModal, iActionIndex, oState) {
  const eModal = oModal.eModal;
  const { oDraft, sPointsError } = readDraft(eModal, oState);
  const { bValid, oErrors } = validateIssueDraft(oDraft);
  if (sPointsError) oErrors.iStoryPoints = sPointsError;
  if (!bValid || sPointsError) {
    showFieldErrors(eModal, oErrors);
    return;
  }
  showFieldErrors(eModal, {});
  oModal.setBusy(true, iActionIndex);
  try {
    const oProject = await data().getProject(oDraft.sProjectId);
    const { oIssue, bHistorySaved } = await data().createIssue(oProject, oDraft);
    emit('issue:created', oIssue);
    showToast(`${oIssue.sKey} created`, { sActionLabel: 'View', fnAction: () => setIssueInRoute(oIssue.sKey) });
    if (!bHistorySaved) showToast('The issue was created, but its history entry could not be recorded.', { sKind: 'error' });
    if (qs('#createAnother', eModal).checked) {
      oModal.setBusy(false, iActionIndex);
      ['sSummary', 'sDescription', 'aLabels', 'iStoryPoints'].forEach((sField) => { qs(`[data-field="${sField}"]`, eModal).value = ''; });
      qs('[data-field="sSummary"]', eModal).focus();
    } else {
      oModal.close(oIssue);
    }
  } catch (oError) {
    oModal.setBusy(false, iActionIndex);
    if (oError.details) showFieldErrors(eModal, oError.details);
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
  }
}

export function openCreateIssue(sPreferredProjectId = '', oOptions = {}) {
  const aProjects = eligibleProjects();
  if (!aProjects.length) {
    showToast('You need to be a lead or contributor on a project to create issues.', { sKind: 'error' });
    return;
  }
  const sProjectId = aProjects.some((oMember) => oMember.sProjectId === sPreferredProjectId)
    ? sPreferredProjectId
    : (oApp.oProject && aProjects.some((oMember) => oMember.sProjectId === oApp.oProject.sId) ? oApp.oProject.sId : aProjects[0].sProjectId);
  const oState = {
    oParent: oOptions.oParent && oOptions.oParent.sProjectId === sProjectId ? oOptions.oParent : null,
    sBoardId: oOptions.sBoardId || '', sBoardProjectId: oOptions.sBoardId ? sProjectId : '', oAssignee: null, aMembers: [],
  };
  const iInitialType = oState.oParent ? childTypeFor(oState.oParent) : ISSUE_TYPES[0].value;
  const oModal = openModal({
    sTitle: oState.oParent ? `Create child of ${oState.oParent.sKey}` : 'Create issue',
    sFooterStartHtml: '<label class="check"><input type="checkbox" id="createAnother"> Create another</label>',
    sBodyHtml: `
      <div class="row2">
        <label class="field">Project <b class="req">*</b>
          <select class="sel" data-field="sProjectId">${aProjects.map((oMember) => `<option value="${escapeHtml(oMember.sProjectId)}"${oMember.sProjectId === sProjectId ? ' selected' : ''}>${escapeHtml(oMember.sProjectName)}</option>`).join('')}</select>
          <span class="err" data-error-for="sProjectId"></span></label>
        <label class="field">Issue type <b class="req">*</b>
          <select class="sel" data-field="iType">${optionList(ISSUE_TYPES, iInitialType)}</select>
          <span class="err" data-error-for="iType"></span></label>
      </div>
      <label class="field">Summary <b class="req">*</b>
        <input class="inp" data-field="sSummary" maxlength="${LIMITS.summaryMax}" autocomplete="off">
        <span class="err" data-error-for="sSummary"></span></label>
      <label class="field">Description
        <textarea class="txt" data-field="sDescription" rows="4" maxlength="${LIMITS.descriptionMax}" placeholder="Add a description…"></textarea>
        <span class="err" data-error-for="sDescription"></span></label>
      <div class="row2">
        <div class="field">Assignee<div id="createAssigneeHost"></div>
          <span class="err" data-error-for="sAssigneeId"></span></div>
        <label class="field">Priority<select class="sel" data-field="iPriority">${optionList(PRIORITIES, PRIORITIES[2].value)}</select>
          <span class="err" data-error-for="iPriority"></span></label>
      </div>
      <div class="row2">
        <label class="field">Sprint<select class="sel" data-field="sSprintId"><option value="">Backlog (no sprint)</option></select>
          <span class="err" data-error-for="sSprintId"></span></label>
        <label class="field">Story points<input class="inp" data-field="iStoryPoints" type="number" min="0" max="${LIMITS.storyPointsMax}" step="1" inputmode="numeric" placeholder="Not estimated">
          <span class="err" data-error-for="iStoryPoints"></span></label>
      </div>
      <div class="row2">
        <label class="field">Labels<input class="inp" data-field="aLabels" list="createLabelOptions" placeholder="e.g. backend, ux" autocomplete="off">
          <datalist id="createLabelOptions"></datalist><span class="hint">Separate labels with commas.</span>
          <span class="err" data-error-for="aLabels"></span></label>
        <label class="field">Due date<input class="inp" type="date" data-field="sDueDate">
          <span class="err" data-error-for="sDueDate"></span></label>
      </div>
      <div class="field">Parent issue<div id="createParentHost"></div><span class="err" data-error-for="sParentId"></span></div>`,
    aActions: [
      { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
      { sLabel: 'Create', sKind: 'primary', fnClick: (oHandle, iIndex) => submit(oHandle, iIndex, oState) },
    ],
  });
  const eProject = qs('[data-field="sProjectId"]', oModal.eModal);
  eProject.addEventListener('change', () => {
    oState.oParent = null;
    renderParentField(oModal, oState);
    loadProjectChoices(oModal.eModal, eProject.value, '', oState).then(() => { if (oState.oAssignee) renderAssigneeField(oModal, oState); });
  });
  qs('[data-field="iType"]', oModal.eModal).addEventListener('change', () => renderParentField(oModal, oState));
  qs('[data-field="sSummary"]', oModal.eModal).addEventListener('keydown', (oEvent) => {
    if (oEvent.key === 'Enter') {
      oEvent.preventDefault();
      submit(oModal, 1, oState);
    }
  });
  renderParentField(oModal, oState);
  renderAssigneeField(oModal, oState);
  loadProjectChoices(oModal.eModal, sProjectId, oOptions.sSprintId || '', oState).then(() => { if (oState.oAssignee) renderAssigneeField(oModal, oState); });
  setTimeout(() => qs('[data-field="sSummary"]', oModal.eModal).focus(), 30);
}
