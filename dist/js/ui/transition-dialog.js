// Asks for the fields a workflow transition requires (resolution, assignee, story points, due date) before the move is saved.
// The service and plug-in 3 re-check them; this only collects the values up front.
import { RESOLUTIONS, LIMITS, TRANSITION_REQUIREMENTS } from '../../config/app-config.js';
import { getIssueStatus, getTransitionRequirements, validateTransitionFields, parseStoryPoints, REQUIREMENT_FIELDS } from '../domain.js';
import { data } from './context.js';
import { qs, escapeHtml, openModal, showFieldErrors, statusPill } from './dom.js';

const errorSlot = (sField) => `<span class="err" data-error-for="${sField}"></span>`;

function fieldHtml(sKey, aMembers, oCurrent) {
  switch (sKey) {
    case 'resolution':
      return `<label class="field">Resolution <b class="req">*</b><select class="sel" data-field="iResolution"><option value="">Choose a resolution…</option>${RESOLUTIONS.map((oItem) => `<option value="${oItem.value}"${oItem.value === oCurrent.iResolution ? ' selected' : ''}>${escapeHtml(oItem.label)}</option>`).join('')}</select>${errorSlot('iResolution')}</label>`;
    case 'assignee':
      return `<label class="field">Assignee <b class="req">*</b><select class="sel" data-field="sAssigneeId"><option value="">Choose a person…</option>${aMembers.map((oMember) => `<option value="${escapeHtml(oMember.sUserId)}">${escapeHtml(oMember.sUserName)}</option>`).join('')}</select>${errorSlot('sAssigneeId')}</label>`;
    case 'storyPoints':
      return `<label class="field">Story points <b class="req">*</b><input class="inp" data-field="iStoryPoints" type="number" min="0" max="${LIMITS.storyPointsMax}" step="1" inputmode="numeric" style="max-width:140px">${errorSlot('iStoryPoints')}</label>`;
    default:
      return `<label class="field">Due date <b class="req">*</b><input class="inp" data-field="sDueDate" type="date" style="max-width:200px">${errorSlot('sDueDate')}</label>`;
  }
}

function readFields(eModal, aAsk, aMembers) {
  const fnValue = (sField) => { const eInput = qs(`[data-field="${sField}"]`, eModal); return eInput ? eInput.value : ''; };
  const oValues = {};
  const oErrors = {};
  if (aAsk.includes('resolution')) oValues.iResolution = fnValue('iResolution') ? Number(fnValue('iResolution')) : null;
  if (aAsk.includes('assignee')) {
    oValues.sAssigneeId = fnValue('sAssigneeId');
    oValues.sAssigneeName = (aMembers.find((oMember) => oMember.sUserId === oValues.sAssigneeId) || {}).sUserName || '';
  }
  if (aAsk.includes('storyPoints')) {
    const { iPoints, sError } = parseStoryPoints(fnValue('iStoryPoints'));
    if (sError) oErrors.iStoryPoints = sError;
    oValues.iStoryPoints = iPoints;
  }
  if (aAsk.includes('dueDate')) oValues.sDueDate = fnValue('sDueDate');
  return { oValues, oErrors: { ...validateTransitionFields(aAsk, oValues), ...oErrors } };
}

function openTransitionDialog({ oIssue, iToStatus, aAsk, aMembers, oCurrent }) {
  const sNeeded = TRANSITION_REQUIREMENTS.filter((oItem) => aAsk.includes(oItem.key)).map((oItem) => oItem.label.toLowerCase()).join(', ');
  return new Promise((fnResolve) => {
    openModal({
      sTitle: `Move ${oIssue.sKey} to ${getIssueStatus(iToStatus).label}`,
      sSize: 'sm',
      sBodyHtml: `<p class="hint">${statusPill(oIssue.iStatus)} → ${statusPill(iToStatus)} needs ${escapeHtml(sNeeded)}.</p>${aAsk.map((sKey) => fieldHtml(sKey, aMembers, oCurrent)).join('')}`,
      fnOnClose: (result) => fnResolve(result || null),
      aActions: [
        { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oModal) => oModal.close(null) },
        {
          sLabel: `Move to ${getIssueStatus(iToStatus).label}`, sKind: 'primary',
          fnClick: (oModal) => {
            const { oValues, oErrors } = readFields(oModal.eModal, aAsk, aMembers);
            showFieldErrors(oModal.eModal, oErrors);
            if (!Object.keys(oErrors).length) oModal.close(oValues);
          },
        },
      ],
    });
  });
}

// Resolves to {} when nothing is missing, the collected values, or null when the person cancels.
export async function collectTransitionFields(oIssue, iToStatus) {
  const oWorkflow = await data().getWorkflow(oIssue.sProjectId);
  const aRequired = getTransitionRequirements(oIssue.iStatus, iToStatus, oWorkflow);
  if (!aRequired.length) return {};
  const oCurrent = { iResolution: oIssue.iResolution ?? null, sAssigneeId: oIssue.sAssigneeId || '', iStoryPoints: oIssue.iStoryPoints ?? null, sDueDate: oIssue.sDueDate || '' };
  const oMissing = validateTransitionFields(aRequired, oCurrent);
  const aAsk = aRequired.filter((sKey) => oMissing[REQUIREMENT_FIELDS[sKey]]);
  if (!aAsk.length) return {};
  const aMembers = aAsk.includes('assignee') ? await data().listMembers(oIssue.sProjectId) : [];
  return openTransitionDialog({ oIssue, iToStatus, aAsk, aMembers, oCurrent });
}
