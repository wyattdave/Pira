// Project settings → Workflow: statuses from the catalogue, initial status, transition matrix and required fields per transition.
// The service validates and saves; plug-in 3 enforces the saved workflow on every status change.
import { ISSUE_STATUSES, TRANSITION_REQUIREMENTS, PROJECT_TEMPLATES } from '../../config/app-config.js';
import { getIssueStatus, isDoneStatus, validateWorkflow, normaliseRequirements, toFriendlyMessage, getProjectTemplate } from '../domain.js';
import { oApp, data, emit } from './context.js';
import { qs, qsa, escapeHtml, statusPill, skeletonRows, renderError, showToast, confirmDialog, setBusy } from './dom.js';

const pairKey = (iFrom, iTo) => `${iFrom}>${iTo}`;

function toDraft(oWorkflow) {
  return {
    aStatuses: [...oWorkflow.aStatuses],
    iInitialStatus: oWorkflow.iInitialStatus,
    oTransitions: new Map(oWorkflow.aTransitions.map((oItem) => [pairKey(oItem.iFrom, oItem.iTo), normaliseRequirements(oItem.aRequired)])),
  };
}

const fromDraft = (oDraft) => ({
  aStatuses: [...oDraft.aStatuses],
  iInitialStatus: oDraft.iInitialStatus,
  aTransitions: [...oDraft.oTransitions.entries()].map(([sKey, aRequired]) => {
    const [iFrom, iTo] = sKey.split('>').map(Number);
    return { iFrom, iTo, aRequired };
  }).filter((oItem) => oDraft.aStatuses.includes(oItem.iFrom) && oDraft.aStatuses.includes(oItem.iTo)),
});

const draftSignature = (oDraft) => JSON.stringify({ ...fromDraft(oDraft), aTransitions: fromDraft(oDraft).aTransitions.map((oItem) => `${pairKey(oItem.iFrom, oItem.iTo)}:${oItem.aRequired.join(',')}`).sort() });

export async function renderWorkflowTab(eBody, oState) {
  const oProject = oApp.oProject;
  const iEpoch = ++oState.iEpoch;
  eBody.innerHTML = skeletonRows(6, 'sk-row');
  let oWorkflow;
  let oCounts;
  try {
    data().invalidateCache(`workflow:${oProject.sId}`);
    [oWorkflow, oCounts] = await Promise.all([
      data().getWorkflow(oProject.sId),
      data().getStatusCounts(oProject.sId, ISSUE_STATUSES.map((oStatus) => oStatus.value)),
    ]);
  } catch (oError) {
    if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), () => renderWorkflowTab(eBody, oState));
    return;
  }
  if (iEpoch !== oState.iEpoch) return;
  const oDraft = toDraft(oWorkflow);
  const sSaved = draftSignature(oDraft);
  const oUi = { bSaving: false, sTemplateKey: oProject.sTemplateKey || PROJECT_TEMPLATES[0].key };

  const fnDraw = (sFocusSelector = '') => {
    const oCheck = validateWorkflow(fromDraft(oDraft));
    const bDirty = draftSignature(oDraft) !== sSaved;
    const aOrdered = [...oDraft.aStatuses, ...ISSUE_STATUSES.map((oStatus) => oStatus.value).filter((iStatus) => !oDraft.aStatuses.includes(iStatus))];
    const aUsed = oDraft.aStatuses;
    const aAllowed = fromDraft(oDraft).aTransitions.sort((oA, oB) => aUsed.indexOf(oA.iFrom) - aUsed.indexOf(oB.iFrom) || aUsed.indexOf(oA.iTo) - aUsed.indexOf(oB.iTo));
    const oTemplate = getProjectTemplate(oUi.sTemplateKey);
    eBody.innerHTML = `
      <p class="hint" style="margin-bottom:12px">${oWorkflow.bCustom ? `This project has its own workflow${oProject.sTemplateKey && getProjectTemplate(oProject.sTemplateKey) ? ` (started from ${escapeHtml(getProjectTemplate(oProject.sTemplateKey).label)})` : ''}.` : 'This project uses the default workflow: To Do, In Progress, In Review and Done, and any move is allowed.'} Status changes are checked by the server against this workflow, so they apply everywhere.</p>
      <div class="sec-t" style="margin-top:0">Start from a template</div>
      <div class="wf-actions" style="margin-top:0;margin-bottom:6px"><label class="sr" for="wfTemplate">Template</label>
        <select class="sel" id="wfTemplate" style="max-width:220px">${PROJECT_TEMPLATES.map((oItem) => `<option value="${escapeHtml(oItem.key)}"${oItem.key === oUi.sTemplateKey ? ' selected' : ''}>${escapeHtml(oItem.label)}</option>`).join('')}</select>
        <button class="btn btn-ghost" type="button" id="wfApplyTemplate">Apply template</button></div>
      <p class="hint">${escapeHtml(oTemplate ? oTemplate.sDescription : '')}${oTemplate && oTemplate.aCustomFields.length ? ` Adds custom fields: ${escapeHtml(oTemplate.aCustomFields.map((oField) => oField.sName).join(', '))}.` : ''}</p>
      <div class="wf-grid" style="margin-top:18px">
        <section><div class="sec-t" style="margin-top:0">Statuses</div>
          <div class="settings-list">${aOrdered.map((iStatus) => {
            const bUsed = aUsed.includes(iStatus);
            const iIndex = aUsed.indexOf(iStatus);
            const iCount = oCounts[iStatus] || 0;
            return `<div class="wf-status${bUsed ? '' : ' unused'}" data-status="${iStatus}">
              <input type="checkbox" data-use aria-label="Use ${escapeHtml(getIssueStatus(iStatus).label)}"${bUsed ? ' checked' : ''}${bUsed && iCount ? ' title="Issues still use this status"' : ''}>
              <span>${statusPill(iStatus)} <span class="hint">${escapeHtml(getIssueStatus(iStatus).category === 'done' ? 'Done category' : getIssueStatus(iStatus).category === 'todo' ? 'To do category' : 'In progress category')}${iCount ? ` · ${iCount} issue${iCount === 1 ? '' : 's'}` : ''}</span></span>
              ${bUsed ? `<button class="btn btn-quiet" type="button" data-up${iIndex === 0 ? ' disabled' : ''} aria-label="Move ${escapeHtml(getIssueStatus(iStatus).label)} up">↑</button><button class="btn btn-quiet" type="button" data-down${iIndex === aUsed.length - 1 ? ' disabled' : ''} aria-label="Move ${escapeHtml(getIssueStatus(iStatus).label)} down">↓</button>` : '<span></span><span></span>'}</div>`;
          }).join('')}</div>
          <p class="hint" style="margin-top:6px">Order sets the board columns. A status can only be removed once no issues use it.</p>
          <label class="field" style="margin-top:12px;max-width:280px">Initial status (new issues)<select class="sel" id="wfInitial">${aUsed.filter((iStatus) => !isDoneStatus(iStatus)).map((iStatus) => `<option value="${iStatus}"${iStatus === oDraft.iInitialStatus ? ' selected' : ''}>${escapeHtml(getIssueStatus(iStatus).label)}</option>`).join('')}</select></label>
          <span class="err">${escapeHtml(oCheck.oErrors.aStatuses || oCheck.oErrors.iInitialStatus || '')}</span>
        </section>
        <section><div class="sec-t" style="margin-top:0">Transitions <span class="hint" style="text-transform:none;letter-spacing:0">(row = from, column = to)</span></div>
          <div style="overflow:auto"><table class="wf-matrix"><thead><tr><th scope="col"><span class="sr">From</span></th>${aUsed.map((iTo) => `<th scope="col">${escapeHtml(getIssueStatus(iTo).label)}</th>`).join('')}</tr></thead>
            <tbody>${aUsed.map((iFrom) => `<tr><th scope="row">${escapeHtml(getIssueStatus(iFrom).label)}</th>${aUsed.map((iTo) => (iFrom === iTo
              ? '<td class="self" aria-hidden="true">—</td>'
              : `<td><input type="checkbox" data-pair="${pairKey(iFrom, iTo)}" aria-label="Allow ${escapeHtml(getIssueStatus(iFrom).label)} to ${escapeHtml(getIssueStatus(iTo).label)}"${oDraft.oTransitions.has(pairKey(iFrom, iTo)) ? ' checked' : ''}></td>`)).join('')}</tr>`).join('')}</tbody></table></div>
          <div class="wf-actions" style="margin-top:8px"><button class="btn btn-quiet" type="button" id="wfAllowAll">Allow every move</button><button class="btn btn-quiet" type="button" id="wfAllowNone">Clear all</button></div>
          <span class="err">${escapeHtml(oCheck.oErrors.aTransitions || '')}</span>
        </section>
      </div>
      <details class="definitions" open style="max-width:1100px"><summary>Required fields per transition</summary>
        <p class="hint" style="margin:8px 0">People are asked for these when they make the move; the server rejects the move without them. Resolution can only be required when moving to a done status.</p>
        <div class="settings-list">${aAllowed.map((oItem) => `<div class="wf-req" data-req-pair="${pairKey(oItem.iFrom, oItem.iTo)}"><span>${statusPill(oItem.iFrom)} → ${statusPill(oItem.iTo)}</span>
          ${TRANSITION_REQUIREMENTS.map((oReq) => `<label class="check"><input type="checkbox" data-req="${oReq.key}"${oItem.aRequired.includes(oReq.key) ? ' checked' : ''}${oReq.key === 'resolution' && !isDoneStatus(oItem.iTo) ? ' disabled' : ''}> ${escapeHtml(oReq.label)}</label>`).join('')}</div>`).join('') || '<p class="hint" style="padding:12px">No transitions allowed yet.</p>'}</div>
      </details>
      ${oCheck.aWarnings.map((sWarning) => `<p class="wf-warn">${escapeHtml(sWarning)}</p>`).join('')}
      <div class="wf-actions"><button class="btn btn-primary" type="button" id="wfSave"${!bDirty || !oCheck.bValid || oUi.bSaving ? ' disabled' : ''}>Save workflow</button>
        <button class="btn btn-ghost" type="button" id="wfDiscard"${bDirty && !oUi.bSaving ? '' : ' disabled'}>Discard changes</button>
        <span class="hint">${bDirty ? 'Unsaved changes' : 'No changes'}</span></div>`;
    fnWire();
    const eFocus = sFocusSelector ? qs(sFocusSelector, eBody) : null;
    if (eFocus) eFocus.focus();
  };

  const fnToggleStatus = (iStatus, bUse) => {
    if (bUse) {
      // A new status starts fully connected (Jira's simplified workflow); untick moves to restrict it.
      oDraft.aStatuses.forEach((iOther) => {
        oDraft.oTransitions.set(pairKey(iOther, iStatus), []);
        oDraft.oTransitions.set(pairKey(iStatus, iOther), []);
      });
      oDraft.aStatuses.push(iStatus);
    } else {
      oDraft.aStatuses = oDraft.aStatuses.filter((iItem) => iItem !== iStatus);
      [...oDraft.oTransitions.keys()].filter((sKey) => sKey.split('>').map(Number).includes(iStatus)).forEach((sKey) => oDraft.oTransitions.delete(sKey));
      if (oDraft.iInitialStatus === iStatus) oDraft.iInitialStatus = oDraft.aStatuses.find((iItem) => !isDoneStatus(iItem)) || 0;
    }
  };

  const fnWire = () => {
    qsa('[data-status]', eBody).forEach((eRow) => {
      const iStatus = Number(eRow.dataset.status);
      const sFocus = `[data-status="${iStatus}"] [data-use]`;
      qs('[data-use]', eRow).addEventListener('change', (oEvent) => { fnToggleStatus(iStatus, oEvent.target.checked); fnDraw(sFocus); });
      const fnMove = (iOffset) => {
        const iIndex = oDraft.aStatuses.indexOf(iStatus);
        const aNext = [...oDraft.aStatuses];
        [aNext[iIndex], aNext[iIndex + iOffset]] = [aNext[iIndex + iOffset], aNext[iIndex]];
        oDraft.aStatuses = aNext;
        fnDraw(`[data-status="${iStatus}"] [data-${iOffset < 0 ? 'up' : 'down'}]`);
      };
      const eUp = qs('[data-up]', eRow);
      if (eUp) eUp.addEventListener('click', () => fnMove(-1));
      const eDown = qs('[data-down]', eRow);
      if (eDown) eDown.addEventListener('click', () => fnMove(1));
    });
    qs('#wfInitial', eBody).addEventListener('change', (oEvent) => { oDraft.iInitialStatus = Number(oEvent.target.value); fnDraw('#wfInitial'); });
    qsa('[data-pair]', eBody).forEach((eInput) => eInput.addEventListener('change', () => {
      if (eInput.checked) oDraft.oTransitions.set(eInput.dataset.pair, []);
      else oDraft.oTransitions.delete(eInput.dataset.pair);
      fnDraw(`[data-pair="${eInput.dataset.pair}"]`);
    }));
    qs('#wfAllowAll', eBody).addEventListener('click', () => {
      oDraft.aStatuses.forEach((iFrom) => oDraft.aStatuses.filter((iTo) => iTo !== iFrom).forEach((iTo) => {
        if (!oDraft.oTransitions.has(pairKey(iFrom, iTo))) oDraft.oTransitions.set(pairKey(iFrom, iTo), []);
      }));
      fnDraw('#wfAllowAll');
    });
    qs('#wfAllowNone', eBody).addEventListener('click', () => { oDraft.oTransitions.clear(); fnDraw('#wfAllowNone'); });
    qsa('[data-req-pair]', eBody).forEach((eRow) => qsa('[data-req]', eRow).forEach((eInput) => eInput.addEventListener('change', () => {
      const aRequired = oDraft.oTransitions.get(eRow.dataset.reqPair) || [];
      oDraft.oTransitions.set(eRow.dataset.reqPair, normaliseRequirements(eInput.checked ? [...aRequired, eInput.dataset.req] : aRequired.filter((sKey) => sKey !== eInput.dataset.req)));
      fnDraw(`[data-req-pair="${eRow.dataset.reqPair}"] [data-req="${eInput.dataset.req}"]`);
    })));
    qs('#wfTemplate', eBody).addEventListener('change', (oEvent) => { oUi.sTemplateKey = oEvent.target.value; fnDraw('#wfTemplate'); });
    qs('#wfApplyTemplate', eBody).addEventListener('click', applyTemplate);
    qs('#wfDiscard', eBody).addEventListener('click', () => renderWorkflowTab(eBody, oState));
    qs('#wfSave', eBody).addEventListener('click', saveDraft);
  };

  const fnAfterSave = (oProjectSaved) => {
    oApp.oProject = oProjectSaved;
    emit('project:changed', oProjectSaved);
    emit('workflow:changed', oProjectSaved.sId);
  };

  async function saveDraft(oEvent) {
    const eButton = oEvent.currentTarget;
    oUi.bSaving = true;
    setBusy(eButton, true);
    try {
      const { oProject: oSaved } = await data().saveWorkflow(oApp.oProject, fromDraft(oDraft));
      fnAfterSave(oSaved);
      showToast('Workflow saved');
      renderWorkflowTab(eBody, oState);
    } catch (oError) {
      oUi.bSaving = false;
      setBusy(eButton, false);
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
    }
  }

  async function applyTemplate(oEvent) {
    const eButton = oEvent.currentTarget;
    const oTemplate = getProjectTemplate(oUi.sTemplateKey);
    if (!oTemplate) return;
    const bConfirmed = await confirmDialog({
      sTitle: `Apply ${oTemplate.label}?`,
      sMessage: `This replaces the statuses, initial status, transitions and required fields with the ${oTemplate.label} template, and adds any of its custom fields this project doesn't have. Issues in statuses the template doesn't use must be moved first. Unsaved workflow edits are discarded.`,
      sConfirmLabel: 'Apply template',
    });
    if (!bConfirmed) return;
    setBusy(eButton, true);
    try {
      const { oProject: oSaved, iFieldsAdded } = await data().applyProjectTemplate(oApp.oProject, oTemplate.key);
      fnAfterSave(oSaved);
      showToast(`${oTemplate.label} template applied${iFieldsAdded ? ` · ${iFieldsAdded} custom field${iFieldsAdded === 1 ? '' : 's'} added` : ''}`);
      renderWorkflowTab(eBody, oState);
    } catch (oError) {
      setBusy(eButton, false);
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
    }
  }

  fnDraw();
}
