// Sprint dialogs shared by the backlog, boards and sprint reports: create/edit/start, complete, cancel and reopen.
import { LIMITS, SPRINT_STATE } from '../../config/app-config.js';
import { validateSprintDraft, suggestSprintName, toFriendlyMessage, toDateOnly, addDays, getSprintState, isSprintOpen } from '../domain.js';
import { data, emit } from './context.js';
import { qs, qsa, escapeHtml, openModal, showToast, showFieldErrors, skeletonRows, confirmDialog } from './dom.js';

const DEFAULT_SPRINT_DAYS = 14;

function readSprintForm(eModal) {
  const fnValue = (sField) => qs(`[data-field="${sField}"]`, eModal).value;
  return { sName: fnValue('sName').trim(), sGoal: fnValue('sGoal'), sStartDate: fnValue('sStartDate'), sEndDate: fnValue('sEndDate') };
}

// sMode: 'create' | 'edit' | 'start'. Resolves with the saved sprint, or null when cancelled.
export function openSprintEditor({ oProject, oBoard, oSprint = null, aSprints = [], sMode = 'create' }) {
  const bStart = sMode === 'start';
  const sToday = toDateOnly(new Date());
  const oValues = oSprint
    ? { sName: oSprint.sName, sGoal: oSprint.sGoal, sStartDate: oSprint.sStartDate || (bStart ? sToday : ''), sEndDate: oSprint.sEndDate || (bStart ? toDateOnly(addDays(new Date(), DEFAULT_SPRINT_DAYS)) : '') }
    : { sName: suggestSprintName(oProject.sKey, aSprints), sGoal: '', sStartDate: '', sEndDate: '' };
  const sTitle = { create: 'Create sprint', edit: `Edit ${oSprint ? oSprint.sName : 'sprint'}`, start: `Start ${oSprint ? oSprint.sName : 'sprint'}` }[sMode];
  const sAction = { create: 'Create sprint', edit: 'Save', start: 'Start sprint' }[sMode];
  return new Promise((fnResolve) => {
    const fnSubmit = async (oModal, iActionIndex) => {
      const oDraft = readSprintForm(oModal.eModal);
      const { bValid, oErrors } = validateSprintDraft(oDraft, bStart || (oSprint && oSprint.iState === SPRINT_STATE.active));
      showFieldErrors(oModal.eModal, oErrors);
      if (!bValid) return;
      oModal.setBusy(true, iActionIndex);
      try {
        let oSaved;
        if (sMode === 'create') oSaved = await data().createSprint(oProject, oBoard, oDraft);
        else if (bStart) oSaved = await data().startSprint(oSprint, oDraft);
        else oSaved = await data().updateSprint(oSprint, oDraft);
        emit('sprint:changed', oSaved);
        showToast({ create: `${oSaved.sName} created`, edit: `${oSaved.sName} saved`, start: `${oSaved.sName} started` }[sMode]);
        oModal.close(oSaved);
      } catch (oError) {
        oModal.setBusy(false, iActionIndex);
        if (oError.details && typeof Object.values(oError.details)[0] === 'string') showFieldErrors(oModal.eModal, oError.details);
        showToast(toFriendlyMessage(oError), { sKind: 'error' });
      }
    };
    openModal({
      sTitle,
      fnOnClose: (result) => fnResolve(result || null),
      sBodyHtml: `
        ${bStart ? '<p class="hint">Starting snapshots the committed issues and points, so the summary can show scope change later. One sprint can be active per board.</p>' : ''}
        <label class="field">Sprint name <b class="req">*</b><input class="inp" data-field="sName" maxlength="${LIMITS.sprintNameMax}" value="${escapeHtml(oValues.sName)}" autocomplete="off"><span class="err" data-error-for="sName"></span></label>
        <div class="row2">
          <label class="field">Start date${bStart ? ' <b class="req">*</b>' : ''}<input class="inp" type="date" data-field="sStartDate" value="${escapeHtml(oValues.sStartDate)}"><span class="err" data-error-for="sStartDate"></span></label>
          <label class="field">End date${bStart ? ' <b class="req">*</b>' : ''}<input class="inp" type="date" data-field="sEndDate" value="${escapeHtml(oValues.sEndDate)}"><span class="err" data-error-for="sEndDate"></span></label>
        </div>
        <label class="field">Sprint goal<textarea class="txt" data-field="sGoal" rows="3" maxlength="${LIMITS.sprintGoalMax}" placeholder="What should this sprint achieve?">${escapeHtml(oValues.sGoal)}</textarea><span class="err" data-error-for="sGoal"></span></label>`,
      aActions: [
        { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
        { sLabel: sAction, sKind: 'primary', fnClick: fnSubmit },
      ],
    });
  });
}

// Never silently drops work: open issues need an explicit destination before the sprint can complete.
export function openCompleteSprint({ oSprint, aSprints, aBoards = [] }) {
  return new Promise((fnResolve) => {
    const aTargets = aSprints.filter((oItem) => oItem.sId !== oSprint.sId && isSprintOpen(oItem.iState));
    const boardName = (sBoardId) => (aBoards.find((oBoard) => oBoard.sId === sBoardId) || {}).sName || '';
    const oModal = openModal({
      sTitle: `Complete ${oSprint.sName}`,
      fnOnClose: (result) => fnResolve(result || null),
      sBodyHtml: `<div id="completeSummary">${skeletonRows(2, 'sk-line')}</div>`,
      aActions: [
        { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
        {
          sLabel: 'Complete sprint', sKind: 'primary',
          fnClick: async (oHandle, iActionIndex) => {
            const eChoice = qs('input[name="completeDestination"]:checked', oHandle.eModal);
            const bNeedsChoice = Boolean(qs('input[name="completeDestination"]', oHandle.eModal));
            let sDestination = '';
            if (bNeedsChoice) {
              if (!eChoice) { showFieldErrors(oHandle.eModal, { sDestination: 'Choose where the open issues should go.' }); return; }
              sDestination = eChoice.value === 'sprint' ? qs('#completeTarget', oHandle.eModal).value : 'backlog';
              if (!sDestination) { showFieldErrors(oHandle.eModal, { sDestination: 'Choose a sprint.' }); return; }
            }
            oHandle.setBusy(true, iActionIndex);
            try {
              const oResult = await data().completeSprint(oSprint, sDestination);
              emit('sprint:changed', oResult.oSprint);
              showToast(`${oSprint.sName} completed${oResult.iMoved ? ` · ${oResult.iMoved} open issue${oResult.iMoved === 1 ? '' : 's'} moved` : ''}`);
              if (!oResult.bHistorySaved) showToast('Completed, but some sprint history entries could not be recorded.', { sKind: 'error' });
              oHandle.close(oResult);
            } catch (oError) {
              oHandle.setBusy(false, iActionIndex);
              showToast(toFriendlyMessage(oError), { sKind: 'error' });
            }
          },
        },
      ],
    });
    data().getSprintReport(oSprint).then(({ oMetrics }) => {
      const eSummary = qs('#completeSummary', oModal.eModal);
      if (!eSummary) return;
      const sChoices = oMetrics.iOpen ? `
        <fieldset class="choice-group" aria-describedby="completeHelp"><legend>Move ${oMetrics.iOpen} open issue${oMetrics.iOpen === 1 ? '' : 's'} (${oMetrics.iOpenPoints} pts) to <b class="req">*</b></legend>
          <label class="check"><input type="radio" name="completeDestination" value="backlog"> Backlog</label>
          <label class="check"><input type="radio" name="completeDestination" value="sprint"${aTargets.length ? '' : ' disabled'}> Sprint
            <select class="sel" id="completeTarget" style="max-width:260px"${aTargets.length ? '' : ' disabled'}>${aTargets.length ? aTargets.map((oItem) => `<option value="${escapeHtml(oItem.sId)}">${escapeHtml(`${oItem.sName} · ${getSprintState(oItem.iState).label}${boardName(oItem.sBoardId) ? ` · ${boardName(oItem.sBoardId)}` : ''}`)}</option>`).join('') : '<option value="">No planned sprints</option>'}</select></label>
          <span class="err" data-error-for="sDestination"></span>
        </fieldset><p class="hint" id="completeHelp">Done issues stay in ${escapeHtml(oSprint.sName)}. Archived issues are never counted.</p>`
        : '<p class="hint">Every issue in this sprint is done.</p>';
      eSummary.innerHTML = `<div class="metric-row"><div class="metric"><b>${oMetrics.iDone}</b><small>Done (${oMetrics.iDonePoints} pts)</small></div><div class="metric"><b>${oMetrics.iOpen}</b><small>Open (${oMetrics.iOpenPoints} pts)</small></div></div>${sChoices}`;
      const eTarget = qs('#completeTarget', eSummary);
      if (eTarget) eTarget.addEventListener('change', () => { const eRadio = qs('input[value="sprint"]', eSummary); if (eRadio) eRadio.checked = true; });
      qsa('input[name="completeDestination"]', eSummary).forEach((eRadio) => eRadio.addEventListener('change', () => showFieldErrors(oModal.eModal, {})));
    }).catch((oError) => {
      const eSummary = qs('#completeSummary', oModal.eModal);
      if (eSummary) eSummary.innerHTML = `<p class="err">${escapeHtml(toFriendlyMessage(oError))}</p>`;
    });
  });
}

export async function confirmCancelSprint(oSprint) {
  const bConfirmed = await confirmDialog({
    sTitle: `Cancel ${oSprint.sName}?`,
    sMessage: 'The sprint is marked cancelled and every issue in it goes back to the backlog. This cannot be undone.',
    sConfirmLabel: 'Cancel sprint', sKind: 'danger',
  });
  if (!bConfirmed) return null;
  try {
    const oResult = await data().cancelSprint(oSprint);
    emit('sprint:changed', oResult.oSprint);
    showToast(`${oSprint.sName} cancelled${oResult.iMoved ? ` · ${oResult.iMoved} issue${oResult.iMoved === 1 ? '' : 's'} back in the backlog` : ''}`);
    return oResult;
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
    return null;
  }
}

// Lead correction path: reopen with a reason, fix dates or issues, then complete again.
export function openReopenSprint(oSprint) {
  return new Promise((fnResolve) => {
    openModal({
      sTitle: `Reopen ${oSprint.sName} for correction`,
      sSize: 'sm',
      fnOnClose: (result) => fnResolve(result || null),
      sBodyHtml: `<p class="hint">Only project leads can do this. The sprint becomes active again, so its board can't have another active sprint. Complete it again when the correction is done.</p>
        <label class="field">Reason <b class="req">*</b><input class="inp" data-field="sNote" maxlength="${LIMITS.correctionNoteMax - 12}" autocomplete="off"><span class="err" data-error-for="sNote"></span></label>`,
      aActions: [
        { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
        {
          sLabel: 'Reopen sprint', sKind: 'danger',
          fnClick: async (oHandle, iActionIndex) => {
            const sNote = qs('[data-field="sNote"]', oHandle.eModal).value.trim();
            if (!sNote) { showFieldErrors(oHandle.eModal, { sNote: 'Explain why the sprint is being reopened.' }); return; }
            oHandle.setBusy(true, iActionIndex);
            try {
              const oSaved = await data().reopenSprint(oSprint, sNote);
              emit('sprint:changed', oSaved);
              showToast(`${oSaved.sName} reopened`);
              oHandle.close(oSaved);
            } catch (oError) {
              oHandle.setBusy(false, iActionIndex);
              if (oError.details) showFieldErrors(oHandle.eModal, oError.details);
              showToast(toFriendlyMessage(oError), { sKind: 'error' });
            }
          },
        },
      ],
    });
  });
}

export function formatSprintDates(oSprint) {
  if (!oSprint.sStartDate && !oSprint.sEndDate) return 'No dates yet';
  const fnFormat = (sDate) => (sDate ? new Date(`${sDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?');
  return `${fnFormat(oSprint.sStartDate)} – ${fnFormat(oSprint.sEndDate)}`;
}

export function daysLeft(oSprint) {
  if (!oSprint.sEndDate) return '';
  const iDays = Math.round((new Date(`${oSprint.sEndDate}T00:00:00`) - new Date(`${toDateOnly(new Date())}T00:00:00`)) / 86400000);
  if (iDays < 0) return `${-iDays} day${iDays === -1 ? '' : 's'} over`;
  return iDays === 0 ? 'Ends today' : `${iDays} day${iDays === 1 ? '' : 's'} left`;
}
