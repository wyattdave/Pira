// Bulk edit: choose one field and value → preview every selected issue → apply → per-issue results with retry for failures.
// Each issue is saved and validated on its own, so a failure never blocks the rest.
import { BULK_FIELDS, PRIORITIES, RESOLUTIONS, LIMITS } from '../../config/app-config.js';
import { getIssueStatus, isDoneStatus, isSprintOpen, toFriendlyMessage } from '../domain.js';
import { data } from './context.js';
import { qs, escapeHtml, openModal, showToast } from './dom.js';

const OUTCOME_LABELS = Object.freeze({ change: 'Will change', skip: 'No change', blocked: 'Can\'t change', success: 'Updated', failed: 'Failed', skipped: 'Skipped' });

function valueControl(sField, oLookups, oChange) {
  const fnSelect = (aOptions, sSelected) => `<select class="sel" data-field="value">${aOptions.map(([sValue, sLabel]) => `<option value="${escapeHtml(sValue)}"${String(sValue) === String(sSelected) ? ' selected' : ''}>${escapeHtml(sLabel)}</option>`).join('')}</select>`;
  const value = oChange && oChange.sField === sField ? oChange.value : '';
  switch (sField) {
    case 'status': return fnSelect(oLookups.oWorkflow.aStatuses.map((iStatus) => [iStatus, getIssueStatus(iStatus).label]), value || oLookups.oWorkflow.aStatuses[0]);
    case 'assignee': return fnSelect([['', 'Unassigned'], ...oLookups.aMembers.map((oMember) => [oMember.sUserId, oMember.sUserName])], value);
    case 'priority': return fnSelect([...PRIORITIES].reverse().map((oPriority) => [oPriority.value, oPriority.label]), value || PRIORITIES[2].value);
    case 'sprint': return fnSelect([['', 'Backlog (no sprint)'], ...oLookups.aSprints.filter((oSprint) => isSprintOpen(oSprint.iState)).map((oSprint) => [oSprint.sId, oSprint.sName])], value);
    case 'dueDate': return `<input class="inp" type="date" data-field="value" value="${escapeHtml(value)}" style="max-width:200px"><span class="hint">Leave blank to clear the due date.</span>`;
    default: return `<input class="inp" data-field="value" list="bulkLabelOptions" maxlength="${LIMITS.labelMax}" value="${escapeHtml(value)}" placeholder="Label to add"><datalist id="bulkLabelOptions">${oLookups.aLabels.map((oLabel) => `<option value="${escapeHtml(oLabel.sName)}"></option>`).join('')}</datalist>`;
  }
}

function resultTable(aRows) {
  return `<div class="bulk-scroll"><table class="bulk-table"><thead><tr><th scope="col">Issue</th><th scope="col">Change</th><th scope="col">Outcome</th></tr></thead><tbody>${aRows.map((oRow) => `<tr>
    <td><span class="key">${escapeHtml(oRow.sKey || '—')}</span><br><small class="hint">${escapeHtml(oRow.sSummary)}</small></td>
    <td>${oRow.sFrom || oRow.sTo ? `${escapeHtml(oRow.sFrom)} → ${escapeHtml(oRow.sTo)}` : ''}</td>
    <td><span class="outcome ${escapeHtml(oRow.sOutcome)}">${escapeHtml(OUTCOME_LABELS[oRow.sOutcome] || oRow.sOutcome)}</span>${oRow.sReason ? `<br><small class="hint">${escapeHtml(oRow.sReason)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

// Step 1: field and value. Resolves to { oChange, sAssigneeName } or null.
function chooseChange(iCount, oLookups, oPrevious) {
  return new Promise((fnResolve) => {
    let sField = oPrevious ? oPrevious.sField : BULK_FIELDS[0].key;
    const oModal = openModal({
      sTitle: `Bulk edit ${iCount} issue${iCount === 1 ? '' : 's'}`,
      sBodyHtml: `<label class="field">Field<select class="sel" id="bulkField">${BULK_FIELDS.map((oField) => `<option value="${oField.key}"${oField.key === sField ? ' selected' : ''}>${escapeHtml(oField.label)}</option>`).join('')}</select></label>
        <label class="field">New value<span id="bulkValueHost" style="display:grid;gap:6px"></span><span class="err" data-error-for="value"></span></label>
        <label class="field" id="bulkResolutionField" hidden>Resolution (for done statuses)<select class="sel" data-field="iResolution"><option value="">Choose a resolution…</option>${RESOLUTIONS.map((oItem) => `<option value="${oItem.value}"${oPrevious && oPrevious.iResolution === oItem.value ? ' selected' : ''}>${escapeHtml(oItem.label)}</option>`).join('')}</select>
          <span class="hint">Used where the workflow requires a resolution.</span></label>
        <p class="hint">You'll see every issue and what will happen before anything is saved. Status changes follow the project workflow.</p>`,
      fnOnClose: (result) => fnResolve(result || null),
      aActions: [
        { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
        {
          sLabel: 'Preview', sKind: 'primary',
          fnClick: (oHandle) => {
            const eValue = qs('[data-field="value"]', oHandle.eModal);
            const sValue = eValue.value.trim();
            if (sField === 'addLabel' && !sValue) {
              qs('[data-error-for="value"]', oHandle.eModal).textContent = 'Enter a label.';
              return;
            }
            const sResolution = qs('[data-field="iResolution"]', oHandle.eModal).value;
            const oChange = { sField, value: ['status', 'priority'].includes(sField) ? Number(sValue) : sValue, iResolution: sField === 'status' && sResolution ? Number(sResolution) : null };
            const sAssigneeName = sField === 'assignee' ? (oLookups.aMembers.find((oMember) => oMember.sUserId === sValue) || {}).sUserName || '' : '';
            oHandle.close({ oChange, sAssigneeName });
          },
        },
      ],
    });
    const fnRenderValue = () => {
      qs('#bulkValueHost', oModal.eModal).innerHTML = valueControl(sField, oLookups, oPrevious);
      const eValue = qs('[data-field="value"]', oModal.eModal);
      const fnResolution = () => { qs('#bulkResolutionField', oModal.eModal).hidden = !(sField === 'status' && isDoneStatus(Number(eValue.value))); };
      eValue.addEventListener('change', fnResolution);
      fnResolution();
    };
    qs('#bulkField', oModal.eModal).addEventListener('change', (oEvent) => { sField = oEvent.target.value; fnRenderValue(); });
    fnRenderValue();
  });
}

// Step 2: preview. Resolves to 'apply', 'back' or null.
function confirmPreview(oPreview) {
  return new Promise((fnResolve) => {
    openModal({
      sTitle: `Preview: ${oPreview.sDescription}`,
      sSize: 'lg',
      sBodyHtml: `<p><b>${oPreview.iChange}</b> will change · <b>${oPreview.iSkip}</b> already set · <b>${oPreview.iBlocked}</b> can't change</p>${resultTable(oPreview.aRows)}
        <p class="hint">Issues are saved one by one. If some fail, the rest still save and you can retry just the failures.</p>`,
      fnOnClose: (result) => fnResolve(result || null),
      aActions: [
        { sLabel: 'Back', sKind: 'ghost', fnClick: (oHandle) => oHandle.close('back') },
        { sLabel: oPreview.iChange ? `Apply to ${oPreview.iChange} issue${oPreview.iChange === 1 ? '' : 's'}` : 'Nothing to apply', sKind: 'primary', fnClick: (oHandle) => { if (oPreview.iChange) oHandle.close('apply'); } },
      ],
    });
  });
}

// Step 3: results. Resolves to 'retry' or null.
function showResults(oResult) {
  return new Promise((fnResolve) => {
    openModal({
      sTitle: oResult.iFailed ? 'Bulk edit finished with failures' : 'Bulk edit finished',
      sSize: 'lg',
      sBodyHtml: `<p><b>${oResult.iSucceeded}</b> updated · <b>${oResult.iFailed}</b> failed · <b>${oResult.iSkipped}</b> skipped (already set)</p>${resultTable(oResult.aResults)}`,
      fnOnClose: (result) => fnResolve(result || null),
      aActions: [
        ...(oResult.iFailed ? [{ sLabel: `Retry ${oResult.iFailed} failed`, sKind: 'ghost', fnClick: (oHandle) => oHandle.close('retry') }] : []),
        { sLabel: 'Done', sKind: 'primary', fnClick: (oHandle) => oHandle.close(null) },
      ],
    });
  });
}

function busyModal(sTitle) {
  return openModal({ sTitle, sSize: 'sm', sBodyHtml: '<p class="hint" aria-live="polite">Working… please keep Pira open.</p>', aActions: [] });
}

// Resolves to true when at least one issue changed.
export async function openBulkEdit({ oProject, aIssueIds }) {
  let oLookups;
  try {
    const [oWorkflow, aMembers, aSprints, aLabels] = await Promise.all([
      data().getWorkflow(oProject.sId), data().listMembers(oProject.sId), data().listSprints(oProject.sId), data().listProjectLabels(oProject.sId),
    ]);
    oLookups = { oWorkflow, aMembers, aSprints, aLabels };
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
    return false;
  }
  let oChoice = null;
  let bChanged = false;
  for (;;) {
    oChoice = await chooseChange(aIssueIds.length, oLookups, oChoice && oChoice.oChange);
    if (!oChoice) return bChanged;
    let oPreview;
    const oWaitPreview = busyModal('Checking issues…');
    try {
      oPreview = await data().previewBulkEdit(oProject, aIssueIds, oChoice.oChange, { sAssigneeName: oChoice.sAssigneeName });
    } catch (oError) {
      oWaitPreview.close(null);
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
      continue;
    }
    oWaitPreview.close(null);
    const sDecision = await confirmPreview(oPreview);
    if (sDecision === 'back') continue;
    if (sDecision !== 'apply') return bChanged;
    // The first run sends every selected issue so the results also list the ones already set; retries send failures only.
    let aTargetIds = oPreview.aRows.map((oRow) => oRow.sIssueId);
    for (;;) {
      const iToChange = oPreview.aRows.filter((oRow) => oRow.sOutcome === 'change' && aTargetIds.includes(oRow.sIssueId)).length || aTargetIds.length;
      const oWaitApply = busyModal(`Updating ${iToChange} issue${iToChange === 1 ? '' : 's'}…`);
      let oResult;
      try {
        oResult = await data().applyBulkEdit(oProject, aTargetIds, oPreview.oChange, { sAssigneeName: oChoice.sAssigneeName });
      } catch (oError) {
        oWaitApply.close(null);
        showToast(toFriendlyMessage(oError), { sKind: 'error' });
        return bChanged;
      }
      oWaitApply.close(null);
      bChanged = bChanged || oResult.iSucceeded > 0;
      if (await showResults(oResult) !== 'retry') return bChanged;
      aTargetIds = oResult.aResults.filter((oRow) => oRow.sOutcome === 'failed').map((oRow) => oRow.sIssueId);
    }
  }
}
