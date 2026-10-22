// Backlog and sprint planning for one board (#/projects/KEY/backlog/<boardId>). Sections: the board's active and planned
// sprints, then the backlog (open issues with no sprint). Order is the shared project rank, persisted in Dataverse.
// Drag-and-drop has keyboard alternatives: the row menu (Shift+F10) and Alt+Arrow keys.
import { ISSUE_TYPES, PAGING, SEARCH_DELAY_MS, SPRINT_STATE } from '../../config/app-config.js';
import { toFriendlyMessage, getSprintState, isSprintOpen, computeSprintMetrics, isDoneStatus } from '../domain.js';
import { oApp, data, on, setIssueInRoute, projectHash, navigate } from './context.js';
import {
  qs, qsa, escapeHtml, typeIcon, priorityIcon, avatar, statusPill, ICONS, openMenu, showToast, debounce, skeletonRows, renderError,
} from './dom.js';
import { openCreateIssue } from './create-issue.js';
import { getOpenIssueKey } from './issue-panel.js';
import { openSprintEditor, openCompleteSprint, confirmCancelSprint, formatSprintDates, daysLeft } from './sprint-dialogs.js';

const EPIC_TYPE = ISSUE_TYPES.find((oType) => oType.key === 'epic').value;
const BACKLOG = 'backlog';
const oSearchByBoard = new Map();

export function renderBacklog(eMain, oRoute) {
  const oProject = oApp.oProject;
  const sBoardId = (oRoute && oRoute.sTab) || '';
  const sSearchKey = `${oProject.sId}:${sBoardId || 'default'}`;
  const oState = { oBoard: null, aBoards: [], aAllSprints: [], aSprints: [], oSections: new Map(), iEpoch: 0, sDragId: '', sText: oSearchByBoard.get(sSearchKey) || '' };
  eMain.innerHTML = `<div class="page-pad">
    <div class="crumbs"><a href="#/projects">Projects</a> / <a href="${escapeHtml(projectHash(oProject.sKey, 'overview'))}">${escapeHtml(oProject.sName)}</a></div>
    <div class="head"><h1>Backlog</h1>
      <label class="sr" for="backlogBoard">Board</label><select class="fsel" id="backlogBoard"><option>Loading…</option></select>
      <div class="spacer"></div>
      ${oApp.oPermissions.bCanEdit ? '<button class="btn btn-ghost" type="button" id="backlogCreateSprint">Create sprint</button><button class="btn btn-primary" type="button" id="backlogCreate">+ Create issue</button>' : ''}</div>
    <div class="toolbar"><label class="search"><span aria-hidden="true">${ICONS.search}</span><span class="sr">Search the backlog</span><input id="backlogSearch" type="search" placeholder="Search key or summary" value="${escapeHtml(oState.sText)}" autocomplete="off"></label>
      <span class="hint">Drag rows, or use the ⋯ menu / Alt+↑↓ to reorder and plan. Points are simple sums, not a burndown.</span></div>
    <div id="backlogSections">${skeletonRows(6, 'sk-row')}</div></div>`;
  const eSearch = qs('#backlogSearch', eMain);
  eSearch.addEventListener('input', debounce(() => { oState.sText = eSearch.value.trim(); oSearchByBoard.set(sSearchKey, oState.sText); reloadSections(oState); }, SEARCH_DELAY_MS));
  const eCreate = qs('#backlogCreate', eMain);
  if (eCreate) eCreate.addEventListener('click', () => openCreateIssue(oProject.sId, { sBoardId: oState.oBoard && !oState.oBoard.bDefault ? oState.oBoard.sId : '' }));
  const eCreateSprint = qs('#backlogCreateSprint', eMain);
  if (eCreateSprint) eCreateSprint.addEventListener('click', () => openSprintEditor({ oProject, oBoard: oState.oBoard, aSprints: oState.aAllSprints }));
  qs('#backlogBoard', eMain).addEventListener('change', (oEvent) => {
    const oBoard = oState.aBoards.find((oItem) => oItem.sId === oEvent.target.value);
    navigate(projectHash(oProject.sKey, 'backlog', oBoard && !oBoard.bDefault ? oBoard.sId : ''));
  });
  const fnReloadAll = () => { data().invalidateCache(`sprints:${oProject.sId}`); loadBacklog(oState, sBoardId); };
  const aUnsubscribe = [
    on('sprint:changed', fnReloadAll),
    on('issue:created', (oIssue) => { if (oIssue.sProjectId === oProject.sId) reloadSections(oState); }),
    on('issue:changed', (oIssue) => { if (oIssue && oIssue.sProjectId === oProject.sId) reloadSections(oState); }),
    on('issue:archived', (oIssue) => { if (oIssue.sProjectId === oProject.sId) reloadSections(oState); }),
    on('panel:opened', syncSelection),
    on('panel:closed', syncSelection),
  ];
  loadBacklog(oState, sBoardId);
  return () => { oState.iEpoch += 1; aUnsubscribe.forEach((fnUnsubscribe) => fnUnsubscribe()); };
}

async function loadBacklog(oState, sBoardId) {
  const iEpoch = ++oState.iEpoch;
  const eSections = qs('#backlogSections');
  const oProject = oApp.oProject;
  try {
    const [aBoards, oBoard, aAllSprints] = await Promise.all([data().listBoards(oProject), data().getBoard(oProject, sBoardId), data().listSprints(oProject.sId)]);
    if (iEpoch !== oState.iEpoch) return;
    const aSprints = aAllSprints.filter((oSprint) => oSprint.sBoardId === oBoard.sId && isSprintOpen(oSprint.iState))
      .sort((oA, oB) => (oA.iState === SPRINT_STATE.active ? -1 : oB.iState === SPRINT_STATE.active ? 1 : oA.sCreatedOn.localeCompare(oB.sCreatedOn)));
    Object.assign(oState, { aBoards, oBoard, aAllSprints, aSprints });
    qs('#backlogBoard').innerHTML = aBoards.map((oItem) => `<option value="${escapeHtml(oItem.sId)}"${oItem.sId === oBoard.sId ? ' selected' : ''}>${escapeHtml(oItem.sName)}${oItem.bDefault ? ' (all issues)' : ''}</option>`).join('');
    document.title = `Backlog · ${oBoard.sName} - Pira`;
    oState.oSections = new Map([...aSprints.map((oSprint) => [oSprint.sId, oSprint]), [BACKLOG, null]]
      .map(([sId, oSprint]) => [sId, { sId, oSprint, aIssues: [], sNextToken: '', iCount: 0, bLoading: true, sError: '' }]));
    eSections.innerHTML = [...oState.oSections.keys()].map((sId) => `<section class="bl-section" data-section="${escapeHtml(sId)}"></section>`).join('')
      + (aSprints.length ? '' : `<p class="hint bl-tip">No planned or active sprints on this board yet.${oApp.oPermissions.bCanEdit ? ' Use <b>Create sprint</b> to plan one.' : ''}</p>`);
    await Promise.all([...oState.oSections.keys()].map((sId) => loadSection(oState, sId, false)));
  } catch (oError) {
    if (iEpoch === oState.iEpoch) renderError(eSections, toFriendlyMessage(oError), () => loadBacklog(oState, sBoardId));
  }
}

function criteriaFor(oState, oSection) {
  if (oSection.sId === BACKLOG) {
    return {
      sProjectId: oApp.oProject.sId, sSprintId: 'none', bOpenOnly: true, aExcludeTypes: [EPIC_TYPE], sText: oState.sText,
      sBoardId: oState.oBoard.bDefault ? '' : oState.oBoard.sId,
    };
  }
  return { sProjectId: oApp.oProject.sId, sSprintId: oSection.sId, sText: oState.sText };
}

async function loadSection(oState, sSectionId, bMore) {
  const oSection = oState.oSections.get(sSectionId);
  if (!oSection) return;
  const iEpoch = oState.iEpoch;
  Object.assign(oSection, { bLoading: true, sError: '' });
  if (!bMore) Object.assign(oSection, { aIssues: [], sNextToken: '' });
  renderSection(oState, sSectionId);
  try {
    const { aIssues, sNextToken, iCount } = await data().listIssues({
      oCriteria: criteriaFor(oState, oSection), aOrderBy: ['wd_rank asc', 'createdon asc'],
      iPageSize: sSectionId === BACKLOG ? PAGING.backlog : PAGING.sprintIssues, sSkipToken: bMore ? oSection.sNextToken : '', bCount: !bMore,
    });
    if (iEpoch !== oState.iEpoch) return;
    oSection.aIssues = bMore ? [...oSection.aIssues, ...aIssues] : aIssues;
    oSection.sNextToken = sNextToken;
    if (!bMore) oSection.iCount = typeof iCount === 'number' ? iCount : aIssues.length;
  } catch (oError) {
    if (iEpoch !== oState.iEpoch) return;
    oSection.sError = toFriendlyMessage(oError);
  }
  oSection.bLoading = false;
  renderSection(oState, sSectionId);
}

function reloadSections(oState) {
  [...oState.oSections.keys()].forEach((sId) => loadSection(oState, sId, false));
}

// ── Rendering ──────────────────────────────────────────────────

function rowHtml(oIssue, bCanEdit) {
  const bEstimated = oIssue.iStoryPoints !== null && oIssue.iStoryPoints !== undefined;
  return `<div class="bl-row${isDoneStatus(oIssue.iStatus) ? ' done' : ''}" tabindex="0" role="listitem" data-issue="${escapeHtml(oIssue.sId)}" ${bCanEdit ? 'draggable="true"' : ''} aria-current="${getOpenIssueKey() === oIssue.sKey}" aria-label="${escapeHtml(`${oIssue.sKey}: ${oIssue.sSummary}`)}">
    ${bCanEdit ? '<span class="grip" aria-hidden="true">⋮⋮</span>' : ''}${typeIcon(oIssue.iType)}<span class="key">${escapeHtml(oIssue.sKey)}</span>
    <span class="bl-summary">${escapeHtml(oIssue.sSummary)}</span>
    ${oIssue.sParentKey ? `<span class="pill" title="Parent">${escapeHtml(oIssue.sParentKey)}</span>` : ''}
    ${statusPill(oIssue.iStatus)}${priorityIcon(oIssue.iPriority)}
    <span class="points${bEstimated ? '' : ' none'}" title="${bEstimated ? 'Story points' : 'Not estimated'}">${bEstimated ? oIssue.iStoryPoints : '–'}</span>
    ${avatar(oIssue.sAssigneeId, oIssue.sAssigneeName)}
    ${bCanEdit ? `<button class="icon-btn" type="button" data-row-menu aria-haspopup="menu" aria-expanded="false" aria-label="Plan ${escapeHtml(oIssue.sKey)}">${ICONS.more}</button>` : ''}</div>`;
}

function sectionHeadHtml(oState, oSection) {
  const bCanEdit = oApp.oPermissions.bCanEdit;
  const oMetrics = computeSprintMetrics(oSection.aIssues);
  const sMore = oSection.iCount > oSection.aIssues.length ? '+' : '';
  const sTotals = `${oSection.iCount} issue${oSection.iCount === 1 ? '' : 's'} · ${oMetrics.iPoints}${sMore} pts${oMetrics.iUnestimated ? ` · <span class="unestimated">${oMetrics.iUnestimated}${sMore} not estimated</span>` : ''}`;
  if (oSection.sId === BACKLOG) {
    return `<div class="bl-head"><h2>Backlog</h2><span class="hint">${sTotals} · open issues not in a sprint${oState.oBoard.bDefault ? '' : ' on this board'}</span><span class="spacer"></span>
      ${bCanEdit ? '<button class="btn btn-quiet" type="button" data-section-create>+ Create issue</button>' : ''}</div>`;
  }
  const oSprint = oSection.oSprint;
  const bActive = oSprint.iState === SPRINT_STATE.active;
  const bOtherActive = oState.aSprints.some((oItem) => oItem.iState === SPRINT_STATE.active && oItem.sId !== oSprint.sId);
  const iPercent = oMetrics.iIssues ? Math.round((oMetrics.iDone / oMetrics.iIssues) * 100) : 0;
  return `<div class="bl-head"><h2>${escapeHtml(oSprint.sName)}</h2><span class="pill${bActive ? ' accent' : ''}">${escapeHtml(getSprintState(oSprint.iState).label)}</span>
    <span class="hint">${escapeHtml(formatSprintDates(oSprint))}${bActive ? ` · ${escapeHtml(daysLeft(oSprint))}` : ''} · ${sTotals}</span>
    ${bActive && oMetrics.iIssues ? `<span class="progress-line compact"><span class="bar" aria-hidden="true"><i style="width:${iPercent}%"></i></span><span class="hint">${oMetrics.iDone}/${oMetrics.iIssues} done</span></span>` : ''}
    <span class="spacer"></span>
    <a class="btn btn-quiet" href="${escapeHtml(projectHash(oApp.oProject.sKey, 'sprints', oSprint.sId))}">Report</a>
    ${bCanEdit && !bActive ? `<button class="btn btn-ghost" type="button" data-sprint-start${bOtherActive ? ' disabled title="Complete the active sprint first"' : ''}>Start sprint</button>` : ''}
    ${bCanEdit && bActive ? '<button class="btn btn-ghost" type="button" data-sprint-complete>Complete sprint</button>' : ''}
    ${bCanEdit ? `<button class="icon-btn" type="button" data-sprint-menu aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${escapeHtml(oSprint.sName)}">${ICONS.more}</button>` : ''}</div>
    ${oSprint.sGoal ? `<p class="bl-goal">${escapeHtml(oSprint.sGoal)}</p>` : ''}`;
}

function renderSection(oState, sSectionId) {
  const oSection = oState.oSections.get(sSectionId);
  const eSection = qs(`[data-section="${CSS.escape(sSectionId)}"]`);
  if (!oSection || !eSection) return;
  const bCanEdit = oApp.oPermissions.bCanEdit;
  let sRows = '';
  if (oSection.sError) sRows = `<div class="col-empty">${escapeHtml(oSection.sError)}<br><button class="btn btn-quiet" type="button" data-retry>Try again</button></div>`;
  else if (!oSection.aIssues.length && !oSection.bLoading) sRows = `<div class="col-empty">${sSectionId === BACKLOG ? 'The backlog is empty.' : 'Drag issues here, or use an issue\'s ⋯ menu, to plan this sprint.'}</div>`;
  else sRows = oSection.aIssues.map((oIssue) => rowHtml(oIssue, bCanEdit)).join('');
  eSection.classList.toggle('is-sprint', sSectionId !== BACKLOG);
  eSection.innerHTML = `${sectionHeadHtml(oState, oSection)}
    <div class="bl-rows" role="list" data-drop="${escapeHtml(sSectionId)}">${sRows}${oSection.bLoading ? skeletonRows(oSection.aIssues.length ? 1 : 3, 'sk-row') : ''}</div>
    ${oSection.sNextToken && !oSection.bLoading ? '<div class="load-more"><button class="btn btn-quiet" type="button" data-more>Load more</button></div>' : ''}`;
  wireSection(oState, eSection, oSection);
}

function wireSection(oState, eSection, oSection) {
  const oProject = oApp.oProject;
  const eRetry = qs('[data-retry]', eSection);
  if (eRetry) eRetry.addEventListener('click', () => loadSection(oState, oSection.sId, false));
  const eMore = qs('[data-more]', eSection);
  if (eMore) eMore.addEventListener('click', () => loadSection(oState, oSection.sId, true));
  const eCreate = qs('[data-section-create]', eSection);
  if (eCreate) eCreate.addEventListener('click', () => openCreateIssue(oProject.sId, { sBoardId: oState.oBoard.bDefault ? '' : oState.oBoard.sId }));
  const oSprint = oSection.oSprint;
  const eStart = qs('[data-sprint-start]', eSection);
  if (eStart) eStart.addEventListener('click', () => openSprintEditor({ oProject, oBoard: oState.oBoard, oSprint, aSprints: oState.aAllSprints, sMode: 'start' }));
  const eComplete = qs('[data-sprint-complete]', eSection);
  if (eComplete) eComplete.addEventListener('click', () => openCompleteSprint({ oSprint, aSprints: oState.aAllSprints, aBoards: oState.aBoards }));
  const eSprintMenu = qs('[data-sprint-menu]', eSection);
  if (eSprintMenu) {
    eSprintMenu.addEventListener('click', () => openMenu(eSprintMenu, [
      { sHtml: 'Edit sprint', fnSelect: () => openSprintEditor({ oProject, oBoard: oState.oBoard, oSprint, aSprints: oState.aAllSprints, sMode: 'edit' }) },
      ...(oSprint.iState === SPRINT_STATE.planned ? [{ bSeparator: true }, { sHtml: 'Cancel sprint', fnSelect: () => confirmCancelSprint(oSprint) }] : []),
    ], { sLabel: `${oSprint.sName} actions` }));
  }

  qsa('.bl-row', eSection).forEach((eRow) => {
    const oIssue = oSection.aIssues.find((oItem) => oItem.sId === eRow.dataset.issue);
    eRow.addEventListener('click', (oEvent) => { if (!oEvent.target.closest('[data-row-menu]')) setIssueInRoute(oIssue.sKey); });
    eRow.addEventListener('keydown', (oEvent) => {
      if (oEvent.target !== eRow) return;
      const iIndex = oSection.aIssues.indexOf(oIssue);
      if (oEvent.key === 'Enter') { oEvent.preventDefault(); setIssueInRoute(oIssue.sKey); }
      if ((oEvent.key === 'F10' && oEvent.shiftKey) || oEvent.key === 'ContextMenu') { oEvent.preventDefault(); openRowMenu(oState, qs('[data-row-menu]', eRow) || eRow, oSection, oIssue); }
      if (oEvent.altKey && oEvent.key === 'ArrowUp' && iIndex > 0) { oEvent.preventDefault(); planMove(oState, oIssue.sId, oSection.sId, iIndex - 1); }
      if (oEvent.altKey && oEvent.key === 'ArrowDown' && iIndex < oSection.aIssues.length - 1) { oEvent.preventDefault(); planMove(oState, oIssue.sId, oSection.sId, iIndex + 1); }
    });
    const eMenu = qs('[data-row-menu]', eRow);
    if (eMenu) eMenu.addEventListener('click', (oEvent) => { oEvent.stopPropagation(); openRowMenu(oState, eMenu, oSection, oIssue); });
    eRow.addEventListener('dragstart', (oEvent) => {
      oState.sDragId = oIssue.sId;
      oEvent.dataTransfer.effectAllowed = 'move';
      oEvent.dataTransfer.setData('text/plain', oIssue.sKey);
      eRow.classList.add('dragging');
    });
    eRow.addEventListener('dragend', () => { eRow.classList.remove('dragging'); oState.sDragId = ''; clearMarkers(); });
  });

  if (!oApp.oPermissions.bCanEdit) return;
  const eRows = qs('.bl-rows', eSection);
  eSection.addEventListener('dragover', (oEvent) => {
    if (!oState.sDragId) return;
    oEvent.preventDefault();
    eSection.classList.add('drop');
    placeMarker(eRows, oEvent.clientY);
  });
  eSection.addEventListener('dragleave', (oEvent) => { if (!eSection.contains(oEvent.relatedTarget)) { eSection.classList.remove('drop'); clearMarkers(); } });
  eSection.addEventListener('drop', (oEvent) => {
    oEvent.preventDefault();
    const iIndex = dropIndex(eRows, oEvent.clientY);
    eSection.classList.remove('drop');
    clearMarkers();
    const sIssueId = oState.sDragId;
    oState.sDragId = '';
    if (sIssueId) planMove(oState, sIssueId, oSection.sId, iIndex);
  });
}

function dropIndex(eRows, iClientY) {
  const aRows = qsa('.bl-row:not(.dragging)', eRows);
  const iIndex = aRows.findIndex((eRow) => { const oRect = eRow.getBoundingClientRect(); return iClientY < oRect.top + oRect.height / 2; });
  return iIndex === -1 ? aRows.length : iIndex;
}

function placeMarker(eRows, iClientY) {
  clearMarkers();
  const aRows = qsa('.bl-row:not(.dragging)', eRows);
  const iIndex = dropIndex(eRows, iClientY);
  const eMarker = document.createElement('div');
  eMarker.className = 'drop-marker';
  if (aRows[iIndex]) eRows.insertBefore(eMarker, aRows[iIndex]);
  else eRows.appendChild(eMarker);
}

function clearMarkers() {
  qsa('.drop-marker').forEach((eMarker) => eMarker.remove());
  qsa('.bl-section.drop').forEach((eSection) => eSection.classList.remove('drop'));
}

function openRowMenu(oState, eAnchor, oSection, oIssue) {
  const aIssues = oSection.aIssues;
  const iIndex = aIssues.findIndex((oItem) => oItem.sId === oIssue.sId);
  const aTargets = [...oState.oSections.values()].filter((oItem) => oItem.sId !== oSection.sId);
  openMenu(eAnchor, [
    { sHtml: 'Open issue', fnSelect: () => setIssueInRoute(oIssue.sKey) },
    { bSeparator: true },
    { sHeading: 'Plan' },
    ...aTargets.map((oTarget) => ({
      sHtml: `${ICONS.arrowRight} Move to ${escapeHtml(oTarget.oSprint ? oTarget.oSprint.sName : 'Backlog')}`,
      fnSelect: () => planMove(oState, oIssue.sId, oTarget.sId, 0),
    })),
    { bSeparator: true },
    { sHtml: 'Move to top', bDisabled: iIndex === 0, fnSelect: () => planMove(oState, oIssue.sId, oSection.sId, 0) },
    { sHtml: 'Move up', bDisabled: iIndex === 0, fnSelect: () => planMove(oState, oIssue.sId, oSection.sId, iIndex - 1) },
    { sHtml: 'Move down', bDisabled: iIndex === aIssues.length - 1, fnSelect: () => planMove(oState, oIssue.sId, oSection.sId, iIndex + 1) },
    { sHtml: 'Move to bottom', bDisabled: iIndex === aIssues.length - 1, fnSelect: () => planMove(oState, oIssue.sId, oSection.sId, aIssues.length - 1) },
  ], { sLabel: `Plan ${oIssue.sKey}` });
}

function findRow(oState, sIssueId) {
  for (const oSection of oState.oSections.values()) {
    const oIssue = oSection.aIssues.find((oItem) => oItem.sId === sIssueId);
    if (oIssue) return { oSection, oIssue };
  }
  return null;
}

// Optimistic: redraw first, then ask the server to place the issue between its new neighbours; reload on failure.
async function planMove(oState, sIssueId, sTargetId, iIndex) {
  const oFound = findRow(oState, sIssueId);
  const oTarget = oState.oSections.get(sTargetId);
  if (!oFound || !oTarget) return;
  const { oSection: oSource, oIssue } = oFound;
  const bSame = oSource === oTarget;
  if (bSame && oSource.aIssues.indexOf(oIssue) === iIndex) return;
  const aTarget = oTarget.aIssues.filter((oItem) => oItem.sId !== sIssueId);
  const iInsert = Math.max(0, Math.min(iIndex, aTarget.length));
  const oPlacement = {
    sSprintId: bSame ? undefined : (sTargetId === BACKLOG ? '' : sTargetId),
    sBeforeId: iInsert > 0 ? aTarget[iInsert - 1].sId : '',
    sAfterId: iInsert < aTarget.length ? aTarget[iInsert].sId : '',
  };
  oSource.aIssues = oSource.aIssues.filter((oItem) => oItem.sId !== sIssueId);
  aTarget.splice(iInsert, 0, oIssue);
  oTarget.aIssues = aTarget;
  if (!bSame) { oSource.iCount = Math.max(0, oSource.iCount - 1); oTarget.iCount += 1; }
  renderSection(oState, oSource.sId);
  if (!bSame) renderSection(oState, oTarget.sId);
  const eRow = qs(`.bl-row[data-issue="${CSS.escape(sIssueId)}"]`);
  if (eRow) { eRow.classList.add('saving'); eRow.focus(); }
  try {
    const { oIssue: oSaved, bHistorySaved } = await data().planIssue(oIssue, oPlacement);
    Object.assign(oIssue, oSaved);
    renderSection(oState, oTarget.sId);
    const eSaved = qs(`.bl-row[data-issue="${CSS.escape(sIssueId)}"]`);
    if (eSaved) eSaved.focus();
    if (!bSame) showToast(`${oIssue.sKey} moved to ${oTarget.oSprint ? oTarget.oSprint.sName : 'the backlog'}`);
    if (!bHistorySaved) showToast('Moved, but the history entry could not be recorded.', { sKind: 'error' });
  } catch (oError) {
    showToast(`${oIssue.sKey} was not moved. ${toFriendlyMessage(oError)}`, { sKind: 'error' });
    loadSection(oState, oSource.sId, false);
    if (!bSame) loadSection(oState, oTarget.sId, false);
  }
}

function syncSelection() {
  const sKey = getOpenIssueKey();
  qsa('.bl-row').forEach((eRow) => eRow.setAttribute('aria-current', String((eRow.getAttribute('aria-label') || '').startsWith(`${sKey}:`) && Boolean(sKey))));
}
