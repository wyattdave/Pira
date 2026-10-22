// "Your work" (My Work) and the project Issues list. Both page server-side and open issues in the side panel.
// The Issues list also has saved filters (criteria only; results always run as the viewer) and selection for bulk edit.
import { ISSUE_TYPES, PAGING, SEARCH_DELAY_MS, PRIORITIES, FILTER_VISIBILITY, LIMITS } from '../../config/app-config.js';
import {
  isOverdue, toDateOnly, formatDateOnly, getProjectPermissions, toFriendlyMessage, getIssueStatus, resolveFilterCriteria,
  sanitiseFilterCriteria, validateSavedFilterDraft, isFilterShared, isFeatureEnabled, describeQuery, sanitiseQuery, getErrorMessage, ERROR_CODES,
} from '../domain.js';
import { oApp, data, on, emit, setIssueInRoute, buildHash, projectHash } from './context.js';
import {
  qs, qsa, escapeHtml, typeIcon, priorityIcon, avatar, statusPill, projectAvatar, skeletonRows, stateHtml, renderError, debounce, ICONS,
  openMenu, openModal, showToast, showFieldErrors, confirmDialog, setBusy,
} from './dom.js';
import { openCreateIssue } from './create-issue.js';
import { getOpenIssueKey } from './issue-panel.js';
import { openBulkEdit } from './bulk-edit.js';
import { mountQueryBuilder, emptyQuery, cloneQuery } from './query-builder.js';
import { exportIssuesCsv, openCsvImport } from './csv.js';

const MY_WORK_TABS = Object.freeze([
  { sId: 'assigned', sLabel: 'Assigned to me', sEmpty: 'Nothing assigned to you right now.' },
  { sId: 'reported', sLabel: 'Reported by me', sEmpty: 'You have not reported any issues yet.' },
  { sId: 'overdue', sLabel: 'Overdue', sEmpty: 'Nothing overdue — nice work.' },
  { sId: 'recent', sLabel: 'Recently updated', sEmpty: 'No issues you are involved in changed recently.' },
]);

export function issueRowHtml(oIssue, bShowProject = true, oSelection = null) {
  const sToday = toDateOnly(new Date());
  const bOverdue = isOverdue(oIssue.sDueDate, oIssue.iStatus, sToday);
  const sDue = oIssue.sDueDate ? `<span class="${bOverdue ? 'overdue' : ''}" title="Due ${escapeHtml(formatDateOnly(oIssue.sDueDate))}">${escapeHtml(formatDateOnly(oIssue.sDueDate).replace(/ \d{4}$/, ''))}</span>` : '';
  const sRow = `<button type="button" class="issue-row" data-key="${escapeHtml(oIssue.sKey)}" aria-current="${getOpenIssueKey() === oIssue.sKey}">
    ${typeIcon(oIssue.iType)}
    <span class="s"><b>${escapeHtml(oIssue.sSummary)}</b><small>${escapeHtml(oIssue.sKey)}${bShowProject && oIssue.sProjectName ? ` · ${escapeHtml(oIssue.sProjectName)}` : ''}</small></span>
    ${statusPill(oIssue.iStatus)}
    <span class="prio">${priorityIcon(oIssue.iPriority)}</span>
    <span class="due">${sDue}</span>
    ${avatar(oIssue.sAssigneeId, oIssue.sAssigneeName)}
  </button>`;
  if (!oSelection) return sRow;
  const bChecked = oSelection.has(oIssue.sId);
  return `<div class="issue-row-wrap${bChecked ? ' is-checked' : ''}"><label class="row-check"><input type="checkbox" data-select="${escapeHtml(oIssue.sId)}"${bChecked ? ' checked' : ''} aria-label="Select ${escapeHtml(oIssue.sKey)}"></label>${sRow}</div>`;
}

function wireRows(eRoot) {
  qsa('.issue-row', eRoot).forEach((eRow) => eRow.addEventListener('click', () => setIssueInRoute(eRow.dataset.key)));
}

function syncRowSelection() {
  const sKey = getOpenIssueKey();
  qsa('.issue-row').forEach((eRow) => eRow.setAttribute('aria-current', String(eRow.dataset.key === sKey)));
}

// ── Your work ──────────────────────────────────────────────────

function recentProjectsHtml() {
  const aMemberships = [...oApp.aMyMemberships].sort((oA, oB) => oA.sProjectName.localeCompare(oB.sProjectName));
  if (!aMemberships.length) {
    return stateHtml({ sTitle: 'No projects yet', sMessage: 'Create a project or ask a project lead to add you.', sIcon: '◇', sActionLabel: 'Browse projects', sActionId: 'yourWorkProjects' });
  }
  return `<div class="cards-grid">${aMemberships.slice(0, 8).map((oMember) => {
    const oPermissions = getProjectPermissions(oMember);
    return `<div class="tile" data-project-id="${escapeHtml(oMember.sProjectId)}"><div class="project-tile">${projectAvatar('…')}<div style="min-width:0"><h3>${escapeHtml(oMember.sProjectName)}</h3><small>${escapeHtml(oPermissions.sRole ? oPermissions.sRole[0].toUpperCase() + oPermissions.sRole.slice(1) : '')}</small></div></div>
      <div class="tile-links"><a href="#" data-project-link="board">Board</a><a href="#" data-project-link="issues">Issues</a><a href="#" data-project-link="overview">Overview</a></div></div>`;
  }).join('')}</div>`;
}

async function hydrateProjectTiles(eRoot) {
  const aTiles = qsa('[data-project-id]', eRoot);
  await Promise.all(aTiles.map(async (eTile) => {
    try {
      const oProject = await data().getProject(eTile.dataset.projectId);
      qs('.proj-av', eTile).textContent = oProject.sKey.slice(0, 4);
      if (oProject.bArchived) qs('small', eTile).textContent += ' · Archived';
      qsa('[data-project-link]', eTile).forEach((eLink) => { eLink.href = projectHash(oProject.sKey, eLink.dataset.projectLink); });
    } catch (oError) {
      eTile.remove();
    }
  }));
}

export function renderYourWork(eMain, oRoute) {
  const oTab = MY_WORK_TABS.find((oItem) => oItem.sId === oRoute.sTab) || MY_WORK_TABS[0];
  const oState = { aIssues: [], sNextToken: '', iCount: null, iEpoch: 0 };
  eMain.innerHTML = `<div class="page-pad">
    <div class="head"><h1>Your work</h1><div class="spacer"></div><button class="btn btn-primary" type="button" id="yourWorkCreate">+ Create issue</button></div>
    <section class="page-section" aria-labelledby="recentProjectsTitle"><div class="sec-t" id="recentProjectsTitle">Your projects</div><div id="yourWorkProjectsHost">${recentProjectsHtml()}</div></section>
    <nav class="tabs" role="tablist" aria-label="Your work">${MY_WORK_TABS.map((oItem) => `<a role="tab" href="${escapeHtml(buildHash({ sView: 'your-work', sTab: oItem.sId }))}" aria-selected="${oItem.sId === oTab.sId}">${escapeHtml(oItem.sLabel)}${oItem.sId === oTab.sId ? '<span class="count" id="yourWorkCount">…</span>' : ''}</a>`).join('')}</nav>
    <div id="yourWorkList" role="tabpanel"></div></div>`;
  qs('#yourWorkCreate', eMain).addEventListener('click', () => openCreateIssue());
  const eBrowse = qs('#yourWorkProjects', eMain);
  if (eBrowse) eBrowse.addEventListener('click', () => { window.location.hash = '#/projects'; });
  hydrateProjectTiles(eMain);

  async function load(bMore) {
    const iEpoch = ++oState.iEpoch;
    const eList = qs('#yourWorkList', eMain);
    if (!bMore) eList.innerHTML = `<div class="issue-rows">${skeletonRows(5, 'sk-row')}</div>`;
    try {
      const { aIssues, sNextToken, iCount } = await data().listMyWork(oTab.sId, bMore ? oState.sNextToken : '');
      if (iEpoch !== oState.iEpoch) return;
      oState.aIssues = bMore ? [...oState.aIssues, ...aIssues] : aIssues;
      oState.sNextToken = sNextToken;
      if (!bMore) oState.iCount = iCount;
      const eCount = qs('#yourWorkCount', eMain);
      if (eCount) eCount.textContent = typeof oState.iCount === 'number' ? String(oState.iCount) : String(oState.aIssues.length);
      eList.innerHTML = oState.aIssues.length
        ? `<div class="issue-rows">${oState.aIssues.map((oIssue) => issueRowHtml(oIssue)).join('')}</div>${oState.sNextToken ? '<div class="load-more"><button class="btn btn-ghost" type="button" id="yourWorkMore">Load more</button></div>' : ''}`
        : stateHtml({ sTitle: oTab.sEmpty, sIcon: '✓' });
      wireRows(eList);
      const eMore = qs('#yourWorkMore', eList);
      if (eMore) eMore.addEventListener('click', () => load(true));
    } catch (oError) {
      if (iEpoch === oState.iEpoch) renderError(eList, toFriendlyMessage(oError), () => load(false));
    }
  }
  load(false);
  const fnReload = () => load(false);
  const aUnsubscribe = [on('issue:created', fnReload), on('issue:changed', fnReload), on('issue:moved', fnReload), on('issue:archived', fnReload),
    on('panel:opened', syncRowSelection), on('panel:closed', syncRowSelection)];
  return () => { oState.iEpoch += 1; aUnsubscribe.forEach((fnUnsubscribe) => fnUnsubscribe()); };
}

// ── Project issues list ────────────────────────────────────────

const oListFilters = new Map();
const defaultListFilters = () => ({
  sText: '', iStatus: 0, iType: 0, iPriority: 0, sLabelId: '', bMine: false, bOpenOnly: false, sSavedFilterId: '', bAdvanced: false, oQuery: null, oQueryDraft: null,
});

// Toolbar (or applied advanced query) → saveable criteria. 'me' keeps "Assigned to me" personal to whoever runs a shared filter.
const controlCriteria = (oFilters) => (oFilters.bAdvanced
  ? sanitiseFilterCriteria({ oQuery: oFilters.oQuery })
  : sanitiseFilterCriteria({
    sText: oFilters.sText, aStatuses: oFilters.iStatus ? [oFilters.iStatus] : [], aTypes: oFilters.iType ? [oFilters.iType] : [],
    aPriorities: oFilters.iPriority ? [oFilters.iPriority] : [], sLabelId: oFilters.sLabelId, aAssigneeIds: oFilters.bMine ? ['me'] : [], bOpenOnly: oFilters.bOpenOnly,
  }));

function criteriaToControls(oFilters, oCriteria) {
  Object.assign(oFilters, {
    sText: oCriteria.sText || '', iStatus: (oCriteria.aStatuses || [])[0] || 0, iType: (oCriteria.aTypes || [])[0] || 0,
    iPriority: (oCriteria.aPriorities || [])[0] || 0, sLabelId: oCriteria.sLabelId || '', bMine: (oCriteria.aAssigneeIds || []).includes('me'), bOpenOnly: Boolean(oCriteria.bOpenOnly),
    bAdvanced: Boolean(oCriteria.oQuery), oQuery: oCriteria.oQuery ? cloneQuery(oCriteria.oQuery) : null, oQueryDraft: oCriteria.oQuery ? cloneQuery(oCriteria.oQuery) : null,
  });
}

// Other views (e.g. Releases) open the Issues list with an advanced query already applied.
export function presetIssueListQuery(sProjectId, oQuery) {
  const oClean = sanitiseQuery(oQuery);
  oListFilters.set(sProjectId, { ...defaultListFilters(), bAdvanced: Boolean(oClean), oQuery: oClean, oQueryDraft: oClean ? cloneQuery(oClean) : null });
}

const hasControlFilters = (oFilters) => Object.keys(controlCriteria(oFilters)).length > 0;
const visibilityLabel = (iVisibility) => (FILTER_VISIBILITY.find((oItem) => oItem.value === Number(iVisibility)) || FILTER_VISIBILITY[0]).label;

export function renderIssueList(eMain) {
  const oProject = oApp.oProject;
  const bCanEdit = oApp.oPermissions.bCanEdit;
  const oFilters = oListFilters.get(oProject.sId) || defaultListFilters();
  oListFilters.set(oProject.sId, oFilters);
  const oState = { aIssues: [], sNextToken: '', iCount: null, iEpoch: 0, aStatuses: [], aLabels: [], aSaved: [], oSelected: new Set(), oLookups: null };
  const bAdvancedEnabled = isFeatureEnabled('advancedQuery');
  const bCsvEnabled = isFeatureEnabled('csv');
  if (!bAdvancedEnabled && oFilters.bAdvanced) Object.assign(oFilters, defaultListFilters());
  eMain.innerHTML = `<div class="page-pad">
    <div class="crumbs"><a href="#/projects">Projects</a> / <a href="${escapeHtml(projectHash(oProject.sKey, 'overview'))}">${escapeHtml(oProject.sName)}</a></div>
    <div class="head"><h1>Issues</h1><span class="pill" id="issueListCount">…</span><span id="issueListSaved"></span><div class="spacer"></div>
      ${bAdvancedEnabled ? '<button class="btn btn-ghost" type="button" id="issueListMode" aria-pressed="false">Advanced</button>' : ''}
      <button class="btn btn-ghost" type="button" id="issueListFilters" aria-haspopup="menu" aria-expanded="false">${ICONS.filter} Saved filters ${ICONS.chevron}</button>
      ${bCsvEnabled ? `<button class="btn btn-ghost" type="button" id="issueListCsv" aria-haspopup="menu" aria-expanded="false">CSV ${ICONS.chevron}</button>` : ''}
      ${bCanEdit ? '<button class="btn btn-primary" type="button" id="issueListCreate">+ Create issue</button>' : ''}</div>
    <div class="toolbar" role="toolbar" aria-label="Issue filters" id="issueListToolbar"></div>
    <div id="issueListSelection"></div>
    <div id="issueListBody"></div></div>`;
  const eCreate = qs('#issueListCreate', eMain);
  if (eCreate) eCreate.addEventListener('click', () => openCreateIssue(oProject.sId));

  const activeSaved = () => oState.aSaved.find((oFilter) => oFilter.sId === oFilters.sSavedFilterId) || null;
  // A saved filter runs with its full criteria; once a control changes, the toolbar takes over.
  const sourceCriteria = () => (activeSaved() ? activeSaved().oCriteria : controlCriteria(oFilters));

  function renderSavedPill() {
    const oSaved = activeSaved();
    const eHost = qs('#issueListSaved', eMain);
    eHost.innerHTML = oSaved ? `<span class="pill accent filter-pill" title="${escapeHtml(oSaved.oCriteria.oQuery ? describeQuery(oSaved.oCriteria.oQuery, describeLookups()) : '')}">${ICONS.filter} ${escapeHtml(oSaved.sName)}${oSaved.bMine ? '' : ` · ${escapeHtml(oSaved.sOwnerName)}`}<button class="btn btn-quiet" type="button" id="issueListSavedClear" aria-label="Stop using ${escapeHtml(oSaved.sName)}" style="height:20px;padding:0 4px">×</button></span>` : '';
    const eClear = qs('#issueListSavedClear', eHost);
    if (eClear) eClear.addEventListener('click', () => { Object.assign(oFilters, defaultListFilters()); renderToolbar(); renderSavedPill(); load(false); });
  }

  function onControlChange() {
    oFilters.sSavedFilterId = '';
    renderSavedPill();
    load(false);
  }

  function renderToolbar() {
    const eBar = qs('#issueListToolbar', eMain);
    const eMode = qs('#issueListMode', eMain);
    if (eMode) {
      eMode.setAttribute('aria-pressed', String(oFilters.bAdvanced));
      eMode.textContent = oFilters.bAdvanced ? 'Basic' : 'Advanced';
    }
    if (oFilters.bAdvanced) {
      if (!oState.oLookups) { eBar.innerHTML = skeletonRows(2, 'sk-line'); return; }
      if (!oFilters.oQueryDraft) oFilters.oQueryDraft = emptyQuery();
      const oQueryState = { get oDraft() { return oFilters.oQueryDraft; }, set oDraft(oValue) { oFilters.oQueryDraft = oValue; } };
      mountQueryBuilder(eBar, oQueryState, queryLookups(), (oQuery) => { oFilters.oQuery = oQuery; onControlChange(); });
      return;
    }
    const fnSelect = (sId, sLabel, sAll, aOptions, value) => `<label class="sr" for="${sId}">${escapeHtml(sLabel)}</label><select class="fsel${value ? ' active' : ''}" id="${sId}"><option value="">${escapeHtml(sAll)}</option>${aOptions.map(([sValue, sText]) => `<option value="${escapeHtml(sValue)}"${String(sValue) === String(value) ? ' selected' : ''}>${escapeHtml(sText)}</option>`).join('')}</select>`;
    eBar.innerHTML = `
      <label class="search"><span aria-hidden="true">${ICONS.search}</span><span class="sr">Search by key or summary</span><input id="issueListSearch" type="search" placeholder="Search key or summary" value="${escapeHtml(oFilters.sText)}" autocomplete="off"></label>
      ${fnSelect('issueListStatus', 'Status', 'All statuses', oState.aStatuses.map((iStatus) => [iStatus, getIssueStatus(iStatus).label]), oFilters.iStatus || '')}
      ${fnSelect('issueListType', 'Type', 'All types', ISSUE_TYPES.map((oType) => [oType.value, oType.label]), oFilters.iType || '')}
      ${fnSelect('issueListPriority', 'Priority', 'All priorities', [...PRIORITIES].reverse().map((oPriority) => [oPriority.value, oPriority.label]), oFilters.iPriority || '')}
      ${oState.aLabels.length ? fnSelect('issueListLabel', 'Label', 'All labels', oState.aLabels.map((oLabel) => [oLabel.sId, oLabel.sName]), oFilters.sLabelId) : ''}
      <label class="check"><input type="checkbox" id="issueListMine"${oFilters.bMine ? ' checked' : ''}> Assigned to me</label>
      <label class="check"><input type="checkbox" id="issueListOpen"${oFilters.bOpenOnly ? ' checked' : ''}> Open only</label>`;
    const eSearch = qs('#issueListSearch', eBar);
    eSearch.addEventListener('input', debounce(() => { oFilters.sText = eSearch.value.trim(); onControlChange(); }, SEARCH_DELAY_MS));
    [['#issueListStatus', 'iStatus'], ['#issueListType', 'iType'], ['#issueListPriority', 'iPriority']].forEach(([sSelector, sKey]) => {
      qs(sSelector, eBar).addEventListener('change', (oEvent) => { oFilters[sKey] = Number(oEvent.target.value) || 0; oEvent.target.classList.toggle('active', Boolean(oFilters[sKey])); onControlChange(); });
    });
    const eLabel = qs('#issueListLabel', eBar);
    if (eLabel) eLabel.addEventListener('change', (oEvent) => { oFilters.sLabelId = oEvent.target.value; oEvent.target.classList.toggle('active', Boolean(oFilters.sLabelId)); onControlChange(); });
    qs('#issueListMine', eBar).addEventListener('change', (oEvent) => { oFilters.bMine = oEvent.target.checked; onControlChange(); });
    qs('#issueListOpen', eBar).addEventListener('change', (oEvent) => { oFilters.bOpenOnly = oEvent.target.checked; onControlChange(); });
  }

  function renderSelectionBar() {
    const eHost = qs('#issueListSelection', eMain);
    if (!bCanEdit || !oState.aIssues.length) { eHost.innerHTML = ''; return; }
    const iSelected = oState.oSelected.size;
    const bAll = oState.aIssues.length > 0 && oState.aIssues.every((oIssue) => oState.oSelected.has(oIssue.sId));
    const bTooMany = iSelected > LIMITS.bulkEditMax;
    eHost.innerHTML = `<div class="select-bar"${iSelected ? '' : ' style="background:transparent;border-color:var(--line)"'}>
      <label class="check"><input type="checkbox" id="issueListSelectAll"${bAll ? ' checked' : ''}> Select all ${oState.aIssues.length} loaded</label>
      <span aria-live="polite"><b>${iSelected}</b> selected${bTooMany ? ` · bulk edit handles up to ${LIMITS.bulkEditMax}` : ''}</span><span class="spacer"></span>
      <button class="btn btn-primary" type="button" id="issueListBulk"${!iSelected || bTooMany || oProject.bArchived ? ' disabled' : ''}>Bulk edit</button>
      <button class="btn btn-quiet" type="button" id="issueListClearSelection"${iSelected ? '' : ' disabled'}>Clear selection</button></div>`;
    qs('#issueListSelectAll', eHost).addEventListener('change', (oEvent) => {
      oState.aIssues.forEach((oIssue) => (oEvent.target.checked ? oState.oSelected.add(oIssue.sId) : oState.oSelected.delete(oIssue.sId)));
      syncChecks();
    });
    qs('#issueListClearSelection', eHost).addEventListener('click', () => { oState.oSelected.clear(); syncChecks(); });
    qs('#issueListBulk', eHost).addEventListener('click', async () => {
      const bChanged = await openBulkEdit({ oProject, aIssueIds: [...oState.oSelected] });
      if (!bChanged) return;
      oState.oSelected.clear();
      emit('issues:bulkchanged', oProject.sId);
      load(false);
    });
  }

  function syncChecks() {
    qsa('[data-select]', eMain).forEach((eInput) => {
      eInput.checked = oState.oSelected.has(eInput.dataset.select);
      eInput.closest('.issue-row-wrap').classList.toggle('is-checked', eInput.checked);
    });
    renderSelectionBar();
  }

  async function load(bMore) {
    const iEpoch = ++oState.iEpoch;
    const eBody = qs('#issueListBody', eMain);
    if (!bMore) eBody.innerHTML = `<div class="issue-rows">${skeletonRows(6, 'sk-row')}</div>`;
    try {
      const { aIssues, sNextToken, iCount } = await data().listIssues({
        oCriteria: resolveFilterCriteria(sourceCriteria(), oApp.oUser.sId, oProject.sId),
        aOrderBy: ['modifiedon desc'], iPageSize: PAGING.issueList, sSkipToken: bMore ? oState.sNextToken : '', bCount: !bMore,
      });
      if (iEpoch !== oState.iEpoch) return;
      oState.aIssues = bMore ? [...oState.aIssues, ...aIssues] : aIssues;
      oState.sNextToken = sNextToken;
      if (!bMore) {
        oState.iCount = iCount;
        // Only issues you can see stay selected, so a bulk edit never touches rows hidden by a new filter.
        oState.oSelected = new Set([...oState.oSelected].filter((sId) => oState.aIssues.some((oIssue) => oIssue.sId === sId)));
      }
      qs('#issueListCount', eMain).textContent = `${typeof oState.iCount === 'number' ? oState.iCount : oState.aIssues.length} issues`;
      eBody.innerHTML = oState.aIssues.length
        ? `<div class="issue-rows">${oState.aIssues.map((oIssue) => issueRowHtml(oIssue, false, bCanEdit ? oState.oSelected : null)).join('')}</div><div class="load-more">${oState.sNextToken ? '<button class="btn btn-ghost" type="button" id="issueListMore">Load more</button>' : `<span class="hint">Showing ${oState.aIssues.length} issue${oState.aIssues.length === 1 ? '' : 's'}</span>`}</div>`
        : stateHtml({ sTitle: 'No issues found', sMessage: 'Try a different search or clear the filters.', sIcon: '◇' });
      wireRows(eBody);
      qsa('[data-select]', eBody).forEach((eInput) => eInput.addEventListener('change', () => {
        if (eInput.checked) oState.oSelected.add(eInput.dataset.select);
        else oState.oSelected.delete(eInput.dataset.select);
        syncChecks();
      }));
      renderSelectionBar();
      const eMore = qs('#issueListMore', eBody);
      if (eMore) eMore.addEventListener('click', () => load(true));
    } catch (oError) {
      if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), () => load(false));
    }
  }

  async function refreshSaved(sSelectId = undefined) {
    data().invalidateCache(`filters:${oProject.sId}`);
    oState.aSaved = await data().listSavedFilters(oProject.sId);
    if (sSelectId !== undefined) oFilters.sSavedFilterId = sSelectId;
    if (!activeSaved()) oFilters.sSavedFilterId = '';
    renderSavedPill();
  }

  async function applySaved(oSaved) {
    oFilters.sSavedFilterId = oSaved.sId;
    criteriaToControls(oFilters, oSaved.oCriteria);
    if (oFilters.bAdvanced && !bAdvancedEnabled) {
      showToast(getErrorMessage(ERROR_CODES.featureDisabled), { sKind: 'error' });
      Object.assign(oFilters, defaultListFilters());
    }
    renderToolbar();
    renderSavedPill();
    load(false);
    if (oFilters.bAdvanced) { await loadQueryLookups(); renderToolbar(); }
  }

  function openSaveFilter() {
    const oCriteria = sourceCriteria();
    openModal({
      sTitle: 'Save filter',
      sSize: 'sm',
      sBodyHtml: `<label class="field">Name <b class="req">*</b><input class="inp" data-field="sName" maxlength="${LIMITS.savedFilterNameMax}" autocomplete="off" placeholder="e.g. Open bugs"><span class="err" data-error-for="sName"></span></label>
        <fieldset class="choice-group"><legend>Who can use it</legend>${FILTER_VISIBILITY.map((oItem, iIndex) => `<label class="check"><input type="radio" name="filterVisibility" value="${oItem.value}"${iIndex === 0 ? ' checked' : ''}> ${escapeHtml(oItem.label)}</label>`).join('')}</fieldset>
        <p class="hint">Only the filter criteria are shared. Everyone who runs it sees just the issues they're allowed to see, and "Assigned to me" means them.</p>
        <span class="err" data-error-for="oCriteria"></span>`,
      aActions: [
        { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
        {
          sLabel: 'Save filter', sKind: 'primary',
          fnClick: async (oHandle, iIndex) => {
            const oDraft = { sName: qs('[data-field="sName"]', oHandle.eModal).value.trim(), iVisibility: Number(qs('[name="filterVisibility"]:checked', oHandle.eModal).value), oCriteria };
            const { bValid, oErrors } = validateSavedFilterDraft(oDraft);
            showFieldErrors(oHandle.eModal, oErrors);
            if (!bValid) return;
            oHandle.setBusy(true, iIndex);
            try {
              const oSaved = await data().createSavedFilter(oProject, oDraft);
              await refreshSaved(oSaved ? oSaved.sId : '');
              oHandle.close(oSaved);
              showToast(`Filter "${oDraft.sName}" saved`);
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

  function openManageFilters() {
    const oModal = openModal({ sTitle: 'Your saved filters', sBodyHtml: '', aActions: [{ sLabel: 'Done', sKind: 'primary', fnClick: (oHandle) => oHandle.close(null) }] });
    const fnRender = () => {
      const aMine = oState.aSaved.filter((oFilter) => oFilter.bMine);
      oModal.eBody.innerHTML = aMine.length ? `<p class="hint">Only you can change or delete your filters. Shared filters are visible to project members.</p>
        <div class="settings-list">${aMine.map((oFilter) => `<div class="settings-row" data-filter="${escapeHtml(oFilter.sId)}" style="grid-template-columns:minmax(0,1fr) 150px auto">
          <label class="field"><span class="sr">Filter name</span><input class="inp" data-name maxlength="${LIMITS.savedFilterNameMax}" value="${escapeHtml(oFilter.sName)}"></label>
          <label class="field"><span class="sr">Visibility</span><select class="sel" data-visibility>${FILTER_VISIBILITY.map((oItem) => `<option value="${oItem.value}"${oItem.value === oFilter.iVisibility ? ' selected' : ''}>${escapeHtml(oItem.label)}</option>`).join('')}</select></label>
          <span style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn btn-ghost" type="button" data-save>Save</button><button class="btn btn-quiet" type="button" data-replace title="Replace its criteria with the filters you have now">Use current filters</button><button class="btn btn-quiet" type="button" data-delete>Delete</button></span></div>`).join('')}</div>`
        : '<p class="hint">You have no saved filters in this project.</p>';
      qsa('[data-filter]', oModal.eBody).forEach((eRow) => {
        const oFilter = aMine.find((oItem) => oItem.sId === eRow.dataset.filter);
        const fnRun = async (eButton, fnWork, sDone) => {
          setBusy(eButton, true);
          try {
            await fnWork();
            await refreshSaved();
            showToast(sDone);
            fnRender();
          } catch (oError) {
            setBusy(eButton, false);
            showToast(toFriendlyMessage(oError), { sKind: 'error' });
          }
        };
        qs('[data-save]', eRow).addEventListener('click', (oEvent) => fnRun(oEvent.currentTarget, () => data().updateSavedFilter(oFilter, { sName: qs('[data-name]', eRow).value.trim(), iVisibility: Number(qs('[data-visibility]', eRow).value) }), 'Filter saved'));
        qs('[data-replace]', eRow).addEventListener('click', (oEvent) => fnRun(oEvent.currentTarget, () => data().updateSavedFilter(oFilter, { oCriteria: controlCriteria(oFilters) }), 'Filter updated with the current filters'));
        qs('[data-delete]', eRow).addEventListener('click', async (oEvent) => {
          const eButton = oEvent.currentTarget;
          const bConfirmed = await confirmDialog({ sTitle: `Delete "${oFilter.sName}"?`, sMessage: isFilterShared(oFilter.iVisibility) ? 'Project members who use it will lose it too.' : 'This only removes the saved filter.', sConfirmLabel: 'Delete filter', sKind: 'danger' });
          if (bConfirmed) fnRun(eButton, () => data().deleteSavedFilter(oFilter), 'Filter deleted');
        });
      });
    };
    fnRender();
  }

  function openSavedMenu(eAnchor) {
    const aMine = oState.aSaved.filter((oFilter) => oFilter.bMine);
    const aShared = oState.aSaved.filter((oFilter) => !oFilter.bMine);
    const fnItem = (oFilter, sNote) => ({ sHtml: `${oFilter.sId === oFilters.sSavedFilterId ? '✓ ' : ''}${escapeHtml(oFilter.sName)} <span class="hint">· ${escapeHtml(sNote)}</span>`, fnSelect: () => applySaved(oFilter) });
    openMenu(eAnchor, [
      ...(aMine.length ? [{ sHeading: 'Your filters' }, ...aMine.map((oFilter) => fnItem(oFilter, visibilityLabel(oFilter.iVisibility)))] : []),
      ...(aShared.length ? [{ sHeading: 'Shared in this project' }, ...aShared.map((oFilter) => fnItem(oFilter, oFilter.sOwnerName))] : []),
      ...(!oState.aSaved.length ? [{ sHeading: 'No saved filters yet' }] : []),
      { bSeparator: true },
      { sHtml: 'Save current filters…', fnSelect: openSaveFilter },
      ...(aMine.length ? [{ sHtml: 'Manage your filters…', fnSelect: openManageFilters }] : []),
      ...(hasControlFilters(oFilters) || oFilters.sSavedFilterId ? [{ sHtml: 'Clear filters', fnSelect: () => { Object.assign(oFilters, defaultListFilters()); renderToolbar(); renderSavedPill(); load(false); } }] : []),
    ], { sLabel: 'Saved filters' });
  }

  qs('#issueListFilters', eMain).addEventListener('click', (oEvent) => openSavedMenu(oEvent.currentTarget));

  function queryLookups() {
    return { aStatuses: oState.aStatuses, aLabels: oState.aLabels, ...(oState.oLookups || {}) };
  }

  function describeLookups() {
    const oLookups = queryLookups();
    const fnMap = (aItems, sKey, fnName) => Object.fromEntries((aItems || []).map((oItem) => [String(oItem[sKey]).toLowerCase(), fnName(oItem)]));
    return {
      aCustomFields: oLookups.aCustomFields || [], oUsers: fnMap(oLookups.aMembers, 'sUserId', (oItem) => oItem.sUserName),
      oLabels: fnMap(oLookups.aLabels, 'sId', (oItem) => oItem.sName), oSprints: fnMap(oLookups.aSprints, 'sId', (oItem) => oItem.sName),
      oVersions: fnMap(oLookups.aVersions, 'sId', (oItem) => oItem.sName),
    };
  }

  async function loadQueryLookups() {
    if (oState.oLookups || !bAdvancedEnabled) return;
    const [aMembers, aSprints, aVersions, aCustomFields] = await Promise.allSettled([
      data().listMembers(oProject.sId), data().listSprints(oProject.sId),
      isFeatureEnabled('releases') ? data().listVersions(oProject.sId) : Promise.resolve([]), data().listCustomFields(oProject.sId, true),
    ]);
    const fnValue = (oResult) => (oResult.status === 'fulfilled' ? oResult.value : []);
    oState.oLookups = { aMembers: fnValue(aMembers), aSprints: fnValue(aSprints), aVersions: fnValue(aVersions), aCustomFields: fnValue(aCustomFields) };
    renderSavedPill();
  }

  const eMode = qs('#issueListMode', eMain);
  if (eMode) {
    eMode.addEventListener('click', async () => {
      // Switching modes starts from that mode's own criteria; applied advanced queries are kept to switch back to.
      oFilters.bAdvanced = !oFilters.bAdvanced;
      oFilters.sSavedFilterId = '';
      if (oFilters.bAdvanced && !oFilters.oQueryDraft) oFilters.oQueryDraft = emptyQuery();
      renderToolbar();
      renderSavedPill();
      if (oFilters.bAdvanced) { await loadQueryLookups(); renderToolbar(); }
      load(false);
    });
  }

  const eCsv = qs('#issueListCsv', eMain);
  if (eCsv) {
    eCsv.addEventListener('click', () => openMenu(eCsv, [
      { sHtml: `${ICONS.download} Export these issues`, fnSelect: () => exportIssuesCsv(oProject, resolveFilterCriteria(sourceCriteria(), oApp.oUser.sId, oProject.sId), eCsv) },
      ...(bCanEdit && !oProject.bArchived ? [{ sHtml: `${ICONS.upload} Import from CSV…`, fnSelect: () => openCsvImport(oProject, (bCreated) => { if (bCreated) load(false); }) }] : []),
    ], { sLabel: 'CSV' }));
  }

  async function init() {
    const [oWorkflow, aLabels, aSaved] = await Promise.allSettled([
      data().getWorkflow(oProject.sId), data().listProjectLabels(oProject.sId), data().listSavedFilters(oProject.sId),
    ]);
    oState.aStatuses = oWorkflow.status === 'fulfilled' ? oWorkflow.value.aStatuses : [];
    oState.aLabels = aLabels.status === 'fulfilled' ? aLabels.value : [];
    oState.aSaved = aSaved.status === 'fulfilled' ? aSaved.value : [];
    if (!activeSaved()) oFilters.sSavedFilterId = '';
    if (oFilters.bAdvanced) await loadQueryLookups();
    renderToolbar();
    renderSavedPill();
    load(false);
  }
  renderToolbar();
  init();
  const fnReload = () => load(false);
  const aUnsubscribe = [on('issue:created', fnReload), on('issue:changed', fnReload), on('issue:moved', fnReload), on('issue:archived', fnReload),
    on('panel:opened', syncRowSelection), on('panel:closed', syncRowSelection)];
  return () => { oState.iEpoch += 1; aUnsubscribe.forEach((fnUnsubscribe) => fnUnsubscribe()); };
}
