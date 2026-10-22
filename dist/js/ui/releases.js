// Releases (Phase 4): project versions with progress, release / unrelease / archive (leads), and a release calendar.
import { LIMITS, VERSION_STATE } from '../../config/app-config.js';
import {
  getVersionState, isVersionArchived, isVersionReleased, isVersionOverdue, validateVersionDraft, buildReleaseCalendar, formatDateOnly, toDateOnly, toFriendlyMessage,
} from '../domain.js';
import { oApp, data, on, navigate, projectHash } from './context.js';
import { qs, qsa, escapeHtml, ICONS, skeletonRows, stateHtml, renderError, openModal, showToast, showFieldErrors, openMenu, confirmDialog } from './dom.js';
import { presetIssueListQuery } from './lists.js';

const RELEASE_TABS = Object.freeze([{ sId: 'list', sLabel: 'Versions' }, { sId: 'calendar', sLabel: 'Release calendar' }]);
const oViewState = { bShowArchived: false, oMonth: null };

const statePill = (oVersion) => {
  const oState = getVersionState(oVersion.iState);
  return `<span class="pill${oState.value === VERSION_STATE.released ? ' accent' : ''}">${escapeHtml(oState.label)}</span>`;
};

function versionDialog(oProject, oVersion, fnDone) {
  const bNew = !oVersion;
  const oValues = oVersion || { sName: '', sDescription: '', sStartDate: '', sReleaseDate: '' };
  openModal({
    sTitle: bNew ? 'Create version' : `Edit ${oVersion.sName}`,
    sSize: 'sm',
    sBodyHtml: `<label class="field">Name <b class="req">*</b><input class="inp" data-field="sName" maxlength="${LIMITS.versionNameMax}" value="${escapeHtml(oValues.sName)}" placeholder="e.g. 2.1" autocomplete="off"><span class="err" data-error-for="sName"></span></label>
      <div class="row2"><label class="field">Start date<input class="inp" type="date" data-field="sStartDate" value="${escapeHtml(oValues.sStartDate)}"><span class="err" data-error-for="sStartDate"></span></label>
      <label class="field">Release date<input class="inp" type="date" data-field="sReleaseDate" value="${escapeHtml(oValues.sReleaseDate)}"><span class="err" data-error-for="sReleaseDate"></span></label></div>
      <label class="field">Description<textarea class="txt" data-field="sDescription" rows="3" maxlength="${LIMITS.versionDescriptionMax}">${escapeHtml(oValues.sDescription)}</textarea><span class="err" data-error-for="sDescription"></span></label>`,
    aActions: [
      { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
      {
        sLabel: bNew ? 'Create version' : 'Save', sKind: 'primary',
        fnClick: async (oHandle, iIndex) => {
          const fnValue = (sField) => qs(`[data-field="${sField}"]`, oHandle.eModal).value;
          const oDraft = { sName: fnValue('sName').trim(), sDescription: fnValue('sDescription'), sStartDate: fnValue('sStartDate'), sReleaseDate: fnValue('sReleaseDate') };
          const { bValid, oErrors } = validateVersionDraft(oDraft);
          showFieldErrors(oHandle.eModal, oErrors);
          if (!bValid) return;
          oHandle.setBusy(true, iIndex);
          try {
            if (bNew) await data().createVersion(oProject, oDraft); else await data().updateVersion(oProject, oVersion, oDraft);
            oHandle.close(true);
            showToast(bNew ? `Version ${oDraft.sName} created` : `${oDraft.sName} saved`);
            fnDone();
          } catch (oError) {
            oHandle.setBusy(false, iIndex);
            if (oError.details) showFieldErrors(oHandle.eModal, oError.details);
            showToast(toFriendlyMessage(oError), { sKind: 'error' });
          }
        },
      },
    ],
  });
}

// Unfinished issues need an explicit choice before releasing: another unreleased version, no version, or leave them.
function releaseDialog(oProject, oVersion, oProgress, aVersions, fnDone) {
  const iOpen = oProgress ? oProgress.iOpen : 0;
  const aTargets = aVersions.filter((oItem) => oItem.sId !== oVersion.sId && oItem.iState === VERSION_STATE.unreleased);
  const sChoices = iOpen ? `<fieldset class="choice-group"><legend>${iOpen} unfinished issue${iOpen === 1 ? '' : 's'}</legend>
      ${aTargets.length ? `<label class="check"><input type="radio" name="releaseDestination" value="move" checked> Move to <select class="sel" data-field="sTarget" style="max-width:180px">${aTargets.map((oItem) => `<option value="${escapeHtml(oItem.sId)}">${escapeHtml(oItem.sName)}</option>`).join('')}</select></label>` : ''}
      <label class="check"><input type="radio" name="releaseDestination" value="none"${aTargets.length ? '' : ' checked'}> Remove their fix version</label>
      <label class="check"><input type="radio" name="releaseDestination" value="keep"> Leave them in ${escapeHtml(oVersion.sName)}</label></fieldset>` : '<p class="hint">Every issue in this version is done.</p>';
  openModal({
    sTitle: `Release ${oVersion.sName}`,
    sSize: 'sm',
    sBodyHtml: `${sChoices}<label class="field">Release date<input class="inp" type="date" data-field="sReleaseDate" value="${escapeHtml(oVersion.sReleaseDate || toDateOnly(new Date()))}"><span class="err" data-error-for="sReleaseDate"></span></label>`,
    aActions: [
      { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
      {
        sLabel: 'Release', sKind: 'primary',
        fnClick: async (oHandle, iIndex) => {
          const eChoice = qs('[name="releaseDestination"]:checked', oHandle.eModal);
          const sChoice = eChoice ? eChoice.value : '';
          const sDestination = !iOpen ? '' : sChoice === 'move' ? qs('[data-field="sTarget"]', oHandle.eModal).value : sChoice;
          oHandle.setBusy(true, iIndex);
          try {
            const { iMoved, bHistorySaved } = await data().releaseVersion(oProject, oVersion, { sDestination, sReleaseDate: qs('[data-field="sReleaseDate"]', oHandle.eModal).value });
            oHandle.close(true);
            showToast(`${oVersion.sName} released${iMoved ? ` · ${iMoved} issue${iMoved === 1 ? '' : 's'} moved` : ''}`);
            if (!bHistorySaved) showToast('Released, but some history entries could not be recorded.', { sKind: 'error' });
            fnDone();
          } catch (oError) {
            oHandle.setBusy(false, iIndex);
            if (oError.details) showFieldErrors(oHandle.eModal, oError.details);
            showToast(toFriendlyMessage(oError), { sKind: 'error' });
          }
        },
      },
    ],
  });
}

function progressHtml(oProgress) {
  if (!oProgress || !oProgress.iIssues) return '<span class="hint">No issues</span>';
  return `<span class="progress-line compact"><span class="bar" aria-hidden="true"><i style="width:${oProgress.iPercent}%"></i></span><span class="hint">${oProgress.iDone}/${oProgress.iIssues} done · ${oProgress.iDonePoints}/${oProgress.iPoints} pts</span></span>`;
}

export function renderReleases(eMain, oRoute) {
  const oProject = oApp.oProject;
  const bManage = oApp.oPermissions.bCanManage && !oProject.bArchived;
  const oTab = RELEASE_TABS.find((oItem) => oItem.sId === oRoute.sTab) || RELEASE_TABS[0];
  const oState = { aVersions: [], oProgress: {}, iEpoch: 0 };
  if (!oViewState.oMonth) oViewState.oMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  eMain.innerHTML = `<div class="page-pad">
    <div class="crumbs"><a href="#/projects">Projects</a> / <a href="${escapeHtml(projectHash(oProject.sKey, 'overview'))}">${escapeHtml(oProject.sName)}</a></div>
    <div class="head"><h1>Releases</h1><div class="spacer"></div>${bManage ? '<button class="btn btn-primary" type="button" id="releasesCreate">+ Create version</button>' : ''}</div>
    <nav class="tabs" role="tablist" aria-label="Releases">${RELEASE_TABS.map((oItem) => `<a role="tab" href="${escapeHtml(projectHash(oProject.sKey, 'releases', oItem.sId))}" aria-selected="${oItem.sId === oTab.sId}">${escapeHtml(oItem.sLabel)}</a>`).join('')}</nav>
    <div id="releasesBody" role="tabpanel">${skeletonRows(4, 'sk-row')}</div></div>`;
  const eCreate = qs('#releasesCreate', eMain);
  if (eCreate) eCreate.addEventListener('click', () => versionDialog(oProject, null, load));

  function versionMenu(eAnchor, oVersion) {
    const bArchived = isVersionArchived(oVersion.iState);
    openMenu(eAnchor, [
      { sHtml: 'Edit…', fnSelect: () => versionDialog(oProject, oVersion, load) },
      ...(isVersionReleased(oVersion.iState) ? [{ sHtml: 'Unrelease', fnSelect: () => changeState(oVersion, VERSION_STATE.unreleased, 'unreleased') }] : []),
      ...(bArchived ? [{ sHtml: 'Restore (unreleased)', fnSelect: () => changeState(oVersion, VERSION_STATE.unreleased, 'restored') }]
        : [{ bSeparator: true }, { sHtml: 'Archive', fnSelect: () => changeState(oVersion, VERSION_STATE.archived, 'archived') }]),
    ], { sLabel: `${oVersion.sName} actions` });
  }

  async function changeState(oVersion, iState, sDone) {
    if (iState === VERSION_STATE.archived) {
      const bConfirmed = await confirmDialog({ sTitle: `Archive ${oVersion.sName}?`, sMessage: 'Its issues keep the version, but no more issues can be added to it. You can restore it later.', sConfirmLabel: 'Archive', sKind: 'danger' });
      if (!bConfirmed) return;
    }
    try {
      await data().setVersionState(oProject, oVersion, iState);
      showToast(`${oVersion.sName} ${sDone}`);
      load();
    } catch (oError) {
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
    }
  }

  function renderList(eBody) {
    const sToday = toDateOnly(new Date());
    const aShown = oState.aVersions.filter((oVersion) => oViewState.bShowArchived || !isVersionArchived(oVersion.iState));
    const iArchived = oState.aVersions.length - oState.aVersions.filter((oVersion) => !isVersionArchived(oVersion.iState)).length;
    const sToolbar = `<div class="toolbar"><label class="check"><input type="checkbox" id="releasesArchived"${oViewState.bShowArchived ? ' checked' : ''}> Show archived (${iArchived})</label></div>`;
    if (!aShown.length) {
      eBody.innerHTML = sToolbar + stateHtml({ sTitle: 'No versions yet', sMessage: bManage ? 'Create a version, then set it as the fix version on issues.' : 'Project leads create versions.', sIcon: '◇' });
    } else {
      eBody.innerHTML = `${sToolbar}<table class="grid"><thead><tr><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Progress</th><th scope="col">Start</th><th scope="col">Release</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
        <tbody>${aShown.map((oVersion) => `<tr data-version="${escapeHtml(oVersion.sId)}">
          <td><div class="version-cell">${ICONS.release}<span><button class="link-btn" type="button" data-version-issues="${escapeHtml(oVersion.sId)}">${escapeHtml(oVersion.sName)}</button>${oVersion.sDescription ? `<small>${escapeHtml(oVersion.sDescription)}</small>` : ''}</span></div></td>
          <td>${statePill(oVersion)}</td>
          <td>${progressHtml(oState.oProgress[oVersion.sId])}</td>
          <td>${escapeHtml(formatDateOnly(oVersion.sStartDate) || '—')}</td>
          <td><span class="${isVersionOverdue(oVersion, sToday) ? 'overdue' : ''}">${escapeHtml(formatDateOnly(oVersion.sReleaseDate) || '—')}</span></td>
          <td class="row-actions">${bManage && oVersion.iState === VERSION_STATE.unreleased ? `<button class="btn btn-ghost" type="button" data-release="${escapeHtml(oVersion.sId)}">Release</button>` : ''}
            ${bManage ? `<button class="icon-btn" type="button" data-version-menu="${escapeHtml(oVersion.sId)}" aria-haspopup="menu" aria-expanded="false" aria-label="${escapeHtml(oVersion.sName)} actions">${ICONS.more}</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
    }
    qs('#releasesArchived', eBody).addEventListener('change', (oEvent) => { oViewState.bShowArchived = oEvent.target.checked; renderList(eBody); });
    const fnVersion = (sId) => oState.aVersions.find((oVersion) => oVersion.sId === sId);
    qsa('[data-release]', eBody).forEach((eButton) => eButton.addEventListener('click', () => releaseDialog(oProject, fnVersion(eButton.dataset.release), oState.oProgress[eButton.dataset.release], oState.aVersions, load)));
    qsa('[data-version-menu]', eBody).forEach((eButton) => eButton.addEventListener('click', () => versionMenu(eButton, fnVersion(eButton.dataset.versionMenu))));
    qsa('[data-version-issues]', eBody).forEach((eButton) => eButton.addEventListener('click', () => {
      presetIssueListQuery(oProject.sId, { sJoin: 'and', aItems: [{ sField: 'fixVersion', sOp: 'in', aValues: [eButton.dataset.versionIssues] }] });
      navigate(projectHash(oProject.sKey, 'issues'));
    }));
  }

  function renderCalendar(eBody) {
    const oMonth = oViewState.oMonth;
    const aWeeks = buildReleaseCalendar(oState.aVersions, oMonth.getFullYear(), oMonth.getMonth());
    const sToday = toDateOnly(new Date());
    const sTitle = oMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    eBody.innerHTML = `<div class="toolbar"><button class="btn btn-ghost" type="button" id="calendarPrev" aria-label="Previous month">‹</button><h2 class="cal-title" aria-live="polite">${escapeHtml(sTitle)}</h2>
        <button class="btn btn-ghost" type="button" id="calendarNext" aria-label="Next month">›</button><button class="btn btn-quiet" type="button" id="calendarToday">Today</button>
        <span class="spacer"></span><span class="hint">Unreleased versions show on their release date; released ones on the day they shipped.</span></div>
      <table class="release-cal"><thead><tr>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((sDay) => `<th scope="col">${sDay}</th>`).join('')}</tr></thead>
      <tbody>${aWeeks.map((aDays) => `<tr>${aDays.map((oDay) => `<td class="${oDay.bInMonth ? '' : 'out'}${oDay.sDate === sToday ? ' today' : ''}"><span class="cal-day">${oDay.iDay}</span>
        ${oDay.aVersions.map((oVersion) => `<button type="button" class="cal-version s-${escapeHtml(getVersionState(oVersion.iState).key)}${isVersionOverdue(oVersion, sToday) ? ' late' : ''}" data-version-issues="${escapeHtml(oVersion.sId)}" title="${escapeHtml(`${oVersion.sName} · ${getVersionState(oVersion.iState).label}`)}">${ICONS.release}<span>${escapeHtml(oVersion.sName)}</span></button>`).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const fnShift = (iMonths) => { oViewState.oMonth = new Date(oMonth.getFullYear(), oMonth.getMonth() + iMonths, 1); renderCalendar(eBody); };
    qs('#calendarPrev', eBody).addEventListener('click', () => fnShift(-1));
    qs('#calendarNext', eBody).addEventListener('click', () => fnShift(1));
    qs('#calendarToday', eBody).addEventListener('click', () => { oViewState.oMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderCalendar(eBody); });
    qsa('[data-version-issues]', eBody).forEach((eButton) => eButton.addEventListener('click', () => {
      presetIssueListQuery(oProject.sId, { sJoin: 'and', aItems: [{ sField: 'fixVersion', sOp: 'in', aValues: [eButton.dataset.versionIssues] }] });
      navigate(projectHash(oProject.sKey, 'issues'));
    }));
  }

  async function load() {
    const iEpoch = ++oState.iEpoch;
    const eBody = qs('#releasesBody', eMain);
    try {
      data().invalidateCache(`versions:${oProject.sId}`);
      const [aVersions, oProgress] = await Promise.all([data().listVersions(oProject.sId), data().getVersionProgress(oProject)]);
      if (iEpoch !== oState.iEpoch) return;
      Object.assign(oState, { aVersions, oProgress });
      if (oTab.sId === 'calendar') renderCalendar(eBody); else renderList(eBody);
    } catch (oError) {
      if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), load);
    }
  }
  load();
  const aUnsubscribe = [on('issue:changed', load), on('issue:created', load), on('issues:bulkchanged', load)];
  return () => { oState.iEpoch += 1; aUnsubscribe.forEach((fnUnsubscribe) => fnUnsubscribe()); };
}
