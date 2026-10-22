// Kanban / scrum board: server-side filtered, paged per column; drag-and-drop with a keyboard-accessible menu alternative.
// The route's tab segment selects the board (#/projects/KEY/board/<boardId>); blank = the project's default board.
import { ISSUE_TYPES, PRIORITIES, PAGING, SEARCH_DELAY_MS, BOARD_TYPE, SPRINT_STATE } from '../../config/app-config.js';
import { canTransition, getAllowedTransitions, getIssueStatus, rankBetween, isDoneStatus, toFriendlyMessage, compareRank, DEFAULT_WORKFLOW } from '../domain.js';
import { oApp, data, on, emit, setIssueInRoute, projectHash, navigate } from './context.js';
import {
  qs, qsa, escapeHtml, typeIcon, priorityIcon, avatar, labelChip, statusPill, ICONS, openMenu, showToast, debounce,
  skeletonRows, stateHtml, renderError,
} from './dom.js';
import { openCreateIssue } from './create-issue.js';
import { getOpenIssueKey } from './issue-panel.js';
import { openBoardEditor } from './board-dialogs.js';
import { openCompleteSprint, formatSprintDates, daysLeft } from './sprint-dialogs.js';
import { collectTransitionFields } from './transition-dialog.js';
import { copyShareLink } from './deep-link.js';

const EPIC_TYPE = ISSUE_TYPES.find((oType) => oType.key === 'epic').value;
const oFiltersByBoard = new Map();

function defaultFilters() {
  return { sText: '', aAssigneeIds: [], iType: 0, iPriority: 0, sLabelId: '', sEpicId: '' };
}

const hasFilters = (oFilters) => Boolean(oFilters.sText || oFilters.aAssigneeIds.length || oFilters.iType || oFilters.iPriority || oFilters.sLabelId || oFilters.sEpicId);

export function renderBoard(eMain, oRoute) {
  const oProject = oApp.oProject;
  const oPermissions = oApp.oPermissions;
  const sBoardId = (oRoute && oRoute.sTab) || '';
  const sFilterKey = `${oProject.sId}:${sBoardId || 'default'}`;
  const oState = {
    oBoard: null, aBoards: [], aSprints: [], oSprint: null, aMembers: [], aLabels: [], aEpics: [], oColumns: new Map(), iEpoch: 0, sDragId: '',
    oWorkflow: DEFAULT_WORKFLOW,
    oFilters: oFiltersByBoard.get(sFilterKey) || defaultFilters(),
  };
  oFiltersByBoard.set(sFilterKey, oState.oFilters);
  eMain.classList.add('board-mode');
  eMain.innerHTML = `
    <div class="crumbs"><a href="#/projects">Projects</a> / <a href="${escapeHtml(projectHash(oProject.sKey, 'overview'))}">${escapeHtml(oProject.sName)}</a></div>
    <div class="head"><h1 id="boardTitle">${escapeHtml(oProject.sKey)} board</h1>
      <button class="copy-btn" type="button" id="boardCopy" aria-label="Copy link to this board" title="Copy link">${ICONS.copy} Copy</button>
      <button class="btn btn-ghost" type="button" id="boardSwitch" aria-haspopup="menu" aria-expanded="false">${ICONS.board} Switch board ${ICONS.chevron}</button>
      <div class="spacer"></div>
      ${oProject.bArchived ? '<span class="pill">Archived project</span>' : ''}
      ${oPermissions.bCanEdit ? '<button class="btn btn-primary" type="button" id="boardCreate">+ Create issue</button>' : ''}</div>
    <div id="boardSprint"></div>
    <div class="board-filters" id="boardFilters" role="toolbar" aria-label="Board filters"></div>
    <div class="board" id="boardColumns" aria-label="Board columns">${skeletonRows(4, 'col skeleton')}</div>`;
  const eCreate = qs('#boardCreate', eMain);
  if (eCreate) eCreate.addEventListener('click', () => openCreateIssue(oProject.sId, createOptions(oState)));
  qs('#boardSwitch', eMain).addEventListener('click', (oEvent) => openBoardSwitcher(oState, oEvent.currentTarget));
  qs('#boardCopy', eMain).addEventListener('click', () => copyShareLink(
    { sProjectKey: oProject.sKey, sView: 'board', sTab: oState.oBoard ? oState.oBoard.sId : sBoardId },
    oState.oBoard ? oState.oBoard.sName : `${oProject.sKey} board`,
  ));

  const aUnsubscribe = [
    on('issue:created', (oIssue) => { if (oIssue.sProjectId === oProject.sId) reloadColumns(oState, [oIssue.iStatus]); }),
    on('issue:changed', (oIssue) => applyExternalChange(oState, oIssue)),
    on('issue:archived', (oIssue) => { if (oIssue.sProjectId === oProject.sId) reloadColumns(oState, [oIssue.iStatus]); }),
    on('sprint:changed', () => { data().invalidateCache(`sprints:${oProject.sId}`); loadBoard(oState, sBoardId); }),
    on('boards:changed', () => loadBoard(oState, sBoardId)),
    on('workflow:changed', () => loadBoard(oState, sBoardId)),
    on('panel:opened', (sKey) => highlightCard(sKey)),
    on('panel:closed', () => highlightCard('')),
  ];
  loadBoard(oState, sBoardId);
  return () => {
    oState.iEpoch += 1;
    aUnsubscribe.forEach((fnUnsubscribe) => fnUnsubscribe());
    eMain.classList.remove('board-mode');
  };
}

const isScrum = (oState) => Boolean(oState.oBoard) && oState.oBoard.iType === BOARD_TYPE.scrum;
const createOptions = (oState) => ({
  sBoardId: oState.oBoard && !oState.oBoard.bDefault ? oState.oBoard.sId : '',
  sSprintId: isScrum(oState) && oState.oSprint ? oState.oSprint.sId : '',
});

async function loadBoard(oState, sBoardId) {
  const iEpoch = ++oState.iEpoch;
  const eColumns = qs('#boardColumns');
  const oProject = oApp.oProject;
  try {
    const [aBoards, oBoard, aMembers, aLabels, aSprints, { aIssues: aEpics }, oWorkflow] = await Promise.all([
      data().listBoards(oProject), data().getBoard(oProject, sBoardId), data().listMembers(oProject.sId), data().listProjectLabels(oProject.sId),
      data().listSprints(oProject.sId),
      data().listIssues({ oCriteria: { sProjectId: oProject.sId, aTypes: [EPIC_TYPE] }, iPageSize: PAGING.boardColumn }),
      data().getWorkflow(oProject.sId),
    ]);
    if (iEpoch !== oState.iEpoch) return;
    const oSprint = aSprints.find((oItem) => oItem.sBoardId === oBoard.sId && oItem.iState === SPRINT_STATE.active) || null;
    Object.assign(oState, { aBoards, oBoard, aMembers, aLabels, aSprints, oSprint, aEpics, oWorkflow });
    qs('#boardTitle').textContent = oBoard.sName;
    document.title = `${oBoard.sName} · ${oProject.sKey} - Pira`;
    renderSprintBanner(oState);
    renderFilterBar(oState);
    if (isScrum(oState) && !oSprint) {
      eColumns.innerHTML = stateHtml({ sTitle: 'No active sprint', sMessage: 'This is a scrum board, so it shows the active sprint. Plan and start one from the backlog.', sIcon: '◷', sActionLabel: 'Open backlog', sActionId: 'boardOpenBacklog' });
      qs('#boardOpenBacklog').addEventListener('click', () => navigate(projectHash(oProject.sKey, 'backlog', oBoard.bDefault ? '' : oBoard.sId)));
      return;
    }
    oState.oColumns = new Map(oBoard.aColumns.map((oColumn) => [oColumn.sId, { oColumn, aIssues: [], sNextToken: '', iCount: 0, bLoading: true, sError: '' }]));
    renderColumns(oState);
    await Promise.all(oBoard.aColumns.map((oColumn) => loadColumn(oState, oColumn.sId, false)));
    renderSprintBanner(oState);
  } catch (oError) {
    if (iEpoch !== oState.iEpoch) return;
    renderError(eColumns, toFriendlyMessage(oError), () => loadBoard(oState, sBoardId));
    if (sBoardId) {
      eColumns.insertAdjacentHTML('beforeend', `<p class="hint" style="text-align:center"><a href="${escapeHtml(projectHash(oProject.sKey, 'board'))}">Open the project's default board</a></p>`);
    }
  }
}

// ── Board switcher & sprint banner ─────────────────────────────

function openBoardSwitcher(oState, eAnchor) {
  const oProject = oApp.oProject;
  const aItems = oState.aBoards.map((oBoard) => ({
    sHtml: `${oBoard.sId === (oState.oBoard && oState.oBoard.sId) ? '✓ ' : ''}${escapeHtml(oBoard.sName)}${oBoard.bDefault ? ' <span class="hint">(all issues)</span>' : ''}${oBoard.iType === BOARD_TYPE.scrum ? ' <span class="pill">Scrum</span>' : ''}`,
    fnSelect: () => navigate(projectHash(oProject.sKey, 'board', oBoard.bDefault ? '' : oBoard.sId)),
  }));
  const aManage = oApp.oPermissions.bCanManage && !oProject.bArchived ? [
    { bSeparator: true },
    { sHtml: '+ Create board', fnSelect: async () => { const oBoard = await openBoardEditor({ oProject }); if (oBoard && oBoard.sId) navigate(projectHash(oProject.sKey, 'board', oBoard.sId)); } },
    { sHtml: `${ICONS.settings} Manage boards`, fnSelect: () => navigate(projectHash(oProject.sKey, 'settings', 'boards')) },
  ] : [];
  openMenu(eAnchor, [{ sHeading: 'Boards' }, ...aItems, ...aManage], { sLabel: 'Switch board' });
}

function renderSprintBanner(oState) {
  const eHost = qs('#boardSprint');
  if (!eHost) return;
  const oSprint = oState.oSprint;
  if (!isScrum(oState) || !oSprint) { eHost.innerHTML = ''; return; }
  const aEntries = [...oState.oColumns.values()];
  const iTotal = aEntries.reduce((iSum, oEntry) => iSum + oEntry.iCount, 0);
  const iDone = aEntries.filter((oEntry) => isDoneStatus(oEntry.oColumn.iStatus)).reduce((iSum, oEntry) => iSum + oEntry.iCount, 0);
  eHost.innerHTML = `<div class="sprint-banner">
    <div><b>${escapeHtml(oSprint.sName)}</b> <span class="hint">${escapeHtml(formatSprintDates(oSprint))} · ${escapeHtml(daysLeft(oSprint))}</span>
      ${oSprint.sGoal ? `<div class="hint">${escapeHtml(oSprint.sGoal)}</div>` : ''}</div>
    <span class="spacer"></span>
    ${iTotal ? `<span class="progress-line compact" title="Done issues out of all sprint issues"><span class="bar" aria-hidden="true"><i style="width:${Math.round((iDone / iTotal) * 100)}%"></i></span><span class="hint">${iDone}/${iTotal} done</span></span>` : ''}
    <a class="btn btn-quiet" href="${escapeHtml(projectHash(oApp.oProject.sKey, 'sprints', oSprint.sId))}">Report</a>
    ${oApp.oPermissions.bCanEdit ? '<button class="btn btn-ghost" type="button" id="boardCompleteSprint">Complete sprint</button>' : ''}</div>`;
  const eComplete = qs('#boardCompleteSprint', eHost);
  if (eComplete) eComplete.addEventListener('click', () => openCompleteSprint({ oSprint, aSprints: oState.aSprints, aBoards: oState.aBoards }));
}

function criteriaFor(oState, oColumn) {
  const oFilters = oState.oFilters;
  return {
    sProjectId: oApp.oProject.sId,
    aStatuses: [oColumn.iStatus],
    sText: oFilters.sText,
    aAssigneeIds: oFilters.aAssigneeIds,
    aTypes: oFilters.iType ? [oFilters.iType] : [],
    aPriorities: oFilters.iPriority ? [oFilters.iPriority] : [],
    sLabelId: oFilters.sLabelId,
    sParentId: oFilters.sEpicId,
    sBoardId: oState.oBoard.bDefault ? '' : oState.oBoard.sId,
    sSprintId: isScrum(oState) && oState.oSprint ? oState.oSprint.sId : '',
  };
}

async function loadColumn(oState, sColumnId, bMore) {
  const oEntry = oState.oColumns.get(sColumnId);
  if (!oEntry) return;
  const iEpoch = oState.iEpoch;
  oEntry.bLoading = true;
  oEntry.sError = '';
  if (!bMore) { oEntry.aIssues = []; oEntry.sNextToken = ''; }
  renderColumn(oState, sColumnId);
  try {
    const { aIssues, sNextToken, iCount } = await data().listIssues({
      oCriteria: criteriaFor(oState, oEntry.oColumn), aOrderBy: ['wd_rank asc', 'createdon asc'],
      iPageSize: PAGING.boardColumn, sSkipToken: bMore ? oEntry.sNextToken : '', bCount: !bMore, bWithLabels: true,
    });
    if (iEpoch !== oState.iEpoch) return;
    oEntry.aIssues = bMore ? [...oEntry.aIssues, ...aIssues] : aIssues;
    oEntry.sNextToken = sNextToken;
    if (!bMore && typeof iCount === 'number') oEntry.iCount = iCount;
    if (!bMore && typeof iCount !== 'number') oEntry.iCount = aIssues.length;
  } catch (oError) {
    if (iEpoch !== oState.iEpoch) return;
    oEntry.sError = toFriendlyMessage(oError);
  }
  oEntry.bLoading = false;
  renderColumn(oState, sColumnId);
}

function reloadColumns(oState, aStatuses) {
  [...oState.oColumns.values()].filter((oEntry) => aStatuses.includes(oEntry.oColumn.iStatus))
    .forEach((oEntry) => loadColumn(oState, oEntry.oColumn.sId, false));
}

function reloadAll(oState) {
  oState.iEpoch += 1;
  [...oState.oColumns.keys()].forEach((sColumnId) => loadColumn(oState, sColumnId, false));
}

// ── Filters ────────────────────────────────────────────────────

function renderFilterBar(oState) {
  const oFilters = oState.oFilters;
  const eBar = qs('#boardFilters');
  const aPeople = [...oState.aMembers].sort((oA, oB) => (oA.sUserId === oApp.oUser.sId ? -1 : oB.sUserId === oApp.oUser.sId ? 1 : oA.sUserName.localeCompare(oB.sUserName))).slice(0, 9);
  eBar.innerHTML = `
    <label class="search"><span aria-hidden="true">${ICONS.search}</span><span class="sr">Search this board</span><input id="boardSearch" type="search" placeholder="Search this board" value="${escapeHtml(oFilters.sText)}" autocomplete="off"></label>
    <div class="stack" role="group" aria-label="Filter by assignee">
      ${aPeople.map((oMember) => `<button type="button" data-assignee="${escapeHtml(oMember.sUserId)}" aria-pressed="${oFilters.aAssigneeIds.includes(oMember.sUserId)}" title="${escapeHtml(oMember.sUserName)}">${avatar(oMember.sUserId, oMember.sUserName, '')}</button>`).join('')}
      <button type="button" data-assignee="none" aria-pressed="${oFilters.aAssigneeIds.includes('none')}" title="Unassigned">${avatar('', '', '')}</button>
    </div>
    <label class="sr" for="boardType">Filter by type</label>
    <select class="fsel${oFilters.iType ? ' active' : ''}" id="boardType"><option value="0">Type</option>${ISSUE_TYPES.map((oType) => `<option value="${oType.value}"${oType.value === oFilters.iType ? ' selected' : ''}>${escapeHtml(oType.label)}</option>`).join('')}</select>
    <label class="sr" for="boardPriority">Filter by priority</label>
    <select class="fsel${oFilters.iPriority ? ' active' : ''}" id="boardPriority"><option value="0">Priority</option>${[...PRIORITIES].reverse().map((oPriority) => `<option value="${oPriority.value}"${oPriority.value === oFilters.iPriority ? ' selected' : ''}>${escapeHtml(oPriority.label)}</option>`).join('')}</select>
    <label class="sr" for="boardLabel">Filter by label</label>
    <select class="fsel${oFilters.sLabelId ? ' active' : ''}" id="boardLabel"><option value="">Label</option>${oState.aLabels.map((oLabel) => `<option value="${escapeHtml(oLabel.sId)}"${oLabel.sId === oFilters.sLabelId ? ' selected' : ''}>${escapeHtml(oLabel.sName)}</option>`).join('')}</select>
    ${oState.aEpics.length ? `<label class="sr" for="boardEpic">Filter by epic</label>
    <select class="fsel${oFilters.sEpicId ? ' active' : ''}" id="boardEpic"><option value="">Epic</option>${oState.aEpics.map((oEpic) => `<option value="${escapeHtml(oEpic.sId)}"${oEpic.sId === oFilters.sEpicId ? ' selected' : ''}>${escapeHtml(`${oEpic.sKey} ${oEpic.sSummary}`)}</option>`).join('')}</select>` : ''}
    ${hasFilters(oFilters) ? '<button class="btn btn-quiet" type="button" id="boardClear">Clear filters</button>' : ''}`;

  const fnApply = () => { renderFilterBar(oState); reloadAll(oState); };
  const eSearch = qs('#boardSearch', eBar);
  eSearch.addEventListener('input', debounce(() => { oFilters.sText = eSearch.value.trim(); reloadAll(oState); }, SEARCH_DELAY_MS));
  qsa('[data-assignee]', eBar).forEach((eButton) => eButton.addEventListener('click', () => {
    const sId = eButton.dataset.assignee;
    oFilters.aAssigneeIds = oFilters.aAssigneeIds.includes(sId) ? oFilters.aAssigneeIds.filter((sItem) => sItem !== sId) : [...oFilters.aAssigneeIds, sId];
    fnApply();
    qs(`[data-assignee="${CSS.escape(sId)}"]`, eBar).focus();
  }));
  qs('#boardType', eBar).addEventListener('change', (oEvent) => { oFilters.iType = Number(oEvent.target.value); fnApply(); });
  qs('#boardPriority', eBar).addEventListener('change', (oEvent) => { oFilters.iPriority = Number(oEvent.target.value); fnApply(); });
  qs('#boardLabel', eBar).addEventListener('change', (oEvent) => { oFilters.sLabelId = oEvent.target.value; fnApply(); });
  const eEpic = qs('#boardEpic', eBar);
  if (eEpic) eEpic.addEventListener('change', (oEvent) => { oFilters.sEpicId = oEvent.target.value; fnApply(); });
  const eClear = qs('#boardClear', eBar);
  if (eClear) eClear.addEventListener('click', () => { Object.assign(oFilters, defaultFilters()); fnApply(); qs('#boardSearch').focus(); });
}

// ── Columns & cards ────────────────────────────────────────────

function renderColumns(oState) {
  const eColumns = qs('#boardColumns');
  eColumns.innerHTML = [...oState.oColumns.values()].map((oEntry) => `<section class="col" data-column="${escapeHtml(oEntry.oColumn.sId)}" aria-label="${escapeHtml(oEntry.oColumn.sName)}"></section>`).join('');
  oState.oColumns.forEach((oEntry, sColumnId) => renderColumn(oState, sColumnId));
}

function cardHtml(oIssue, bCanEdit) {
  const bSelected = getOpenIssueKey() === oIssue.sKey;
  return `<article class="card${isDoneStatus(oIssue.iStatus) ? ' done' : ''}${bSelected ? ' is-selected' : ''}" tabindex="0" ${bCanEdit ? 'draggable="true"' : ''} data-issue="${escapeHtml(oIssue.sId)}" aria-label="${escapeHtml(`${oIssue.sKey}: ${oIssue.sSummary}`)}">
    <p>${escapeHtml(oIssue.sSummary)}</p>
    ${oIssue.aLabels.length ? `<div class="lbls">${oIssue.aLabels.map((oLabel) => labelChip(oLabel.sName)).join('')}</div>` : ''}
    <div class="meta">${typeIcon(oIssue.iType)}<span class="key">${escapeHtml(oIssue.sKey)}</span>${oIssue.sParentKey ? `<span class="pill" title="Parent">${escapeHtml(oIssue.sParentKey)}</span>` : ''}<span class="spacer"></span>${oIssue.iStoryPoints !== null && oIssue.iStoryPoints !== undefined ? `<span class="points" title="Story points">${oIssue.iStoryPoints}</span>` : ''}${priorityIcon(oIssue.iPriority)}${avatar(oIssue.sAssigneeId, oIssue.sAssigneeName)}</div>
    ${bCanEdit ? `<button class="card-menu-btn" type="button" data-card-menu aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${escapeHtml(oIssue.sKey)}">${ICONS.more}</button>` : ''}
  </article>`;
}

function renderColumn(oState, sColumnId) {
  const oEntry = oState.oColumns.get(sColumnId);
  const eColumn = qs(`[data-column="${CSS.escape(sColumnId)}"]`);
  if (!oEntry || !eColumn) return;
  const oColumn = oEntry.oColumn;
  const bCanEdit = oApp.oPermissions.bCanEdit;
  const bOverWip = oColumn.iWipLimit > 0 && oEntry.iCount > oColumn.iWipLimit;
  eColumn.classList.toggle('over-wip', bOverWip);
  let sCards = '';
  if (oEntry.sError) sCards = `<div class="col-empty">${escapeHtml(oEntry.sError)}<br><button class="btn btn-quiet" type="button" data-retry>Try again</button></div>`;
  else if (!oEntry.aIssues.length && !oEntry.bLoading) sCards = `<div class="col-empty">${hasFilters(oState.oFilters) ? 'No issues match these filters' : 'No issues'}</div>`;
  else sCards = oEntry.aIssues.map((oIssue) => cardHtml(oIssue, bCanEdit)).join('');
  const bFirst = oState.oBoard && oState.oBoard.aColumns[0] && oState.oBoard.aColumns[0].sId === sColumnId;
  eColumn.innerHTML = `
    <div class="col-h"><span>${escapeHtml(oColumn.sName)}</span> <span class="n">${oEntry.iCount}</span>${isDoneStatus(oColumn.iStatus) ? '<span class="done-tick" aria-hidden="true">✓</span>' : ''}
      ${oColumn.iWipLimit > 0 ? `<span class="wip" title="Work-in-progress limit">${bOverWip ? 'Over WIP · ' : ''}max ${oColumn.iWipLimit}</span>` : ''}</div>
    <div class="cards" data-drop="${escapeHtml(sColumnId)}">${sCards}${oEntry.bLoading ? skeletonRows(oEntry.aIssues.length ? 1 : 3, 'sk-card') : ''}</div>
    ${oEntry.sNextToken && !oEntry.bLoading ? '<div class="load-more"><button class="btn btn-quiet" type="button" data-more>Load more</button></div>' : ''}
    ${bFirst && bCanEdit ? '<button class="add-card" type="button" data-add>+ Create issue</button>' : ''}`;
  wireColumn(oState, eColumn, oEntry);
}

function wireColumn(oState, eColumn, oEntry) {
  const sColumnId = oEntry.oColumn.sId;
  const eRetry = qs('[data-retry]', eColumn);
  if (eRetry) eRetry.addEventListener('click', () => loadColumn(oState, sColumnId, false));
  const eMore = qs('[data-more]', eColumn);
  if (eMore) eMore.addEventListener('click', () => loadColumn(oState, sColumnId, true));
  const eAdd = qs('[data-add]', eColumn);
  if (eAdd) eAdd.addEventListener('click', () => openCreateIssue(oApp.oProject.sId, createOptions(oState)));

  qsa('.card', eColumn).forEach((eCard) => {
    const oIssue = oEntry.aIssues.find((oItem) => oItem.sId === eCard.dataset.issue);
    eCard.addEventListener('click', (oEvent) => { if (!oEvent.target.closest('[data-card-menu]')) setIssueInRoute(oIssue.sKey); });
    eCard.addEventListener('keydown', (oEvent) => {
      if (oEvent.target !== eCard) return;
      if (oEvent.key === 'Enter') { oEvent.preventDefault(); setIssueInRoute(oIssue.sKey); }
      if ((oEvent.key === 'F10' && oEvent.shiftKey) || oEvent.key === 'ContextMenu') { oEvent.preventDefault(); openCardMenu(oState, qs('[data-card-menu]', eCard) || eCard, oIssue); }
    });
    const eMenu = qs('[data-card-menu]', eCard);
    if (eMenu) eMenu.addEventListener('click', (oEvent) => { oEvent.stopPropagation(); openCardMenu(oState, eMenu, oIssue); });
    eCard.addEventListener('dragstart', (oEvent) => {
      oState.sDragId = oIssue.sId;
      oEvent.dataTransfer.effectAllowed = 'move';
      oEvent.dataTransfer.setData('text/plain', oIssue.sKey);
      eCard.classList.add('dragging');
    });
    eCard.addEventListener('dragend', () => {
      eCard.classList.remove('dragging');
      oState.sDragId = '';
      clearDropMarkers();
    });
  });

  if (!oApp.oPermissions.bCanEdit) return;
  const eCards = qs('.cards', eColumn);
  eColumn.addEventListener('dragover', (oEvent) => {
    if (!oState.sDragId) return;
    oEvent.preventDefault();
    eColumn.classList.add('drop');
    placeDropMarker(eCards, oEvent.clientY);
  });
  eColumn.addEventListener('dragleave', (oEvent) => {
    if (!eColumn.contains(oEvent.relatedTarget)) { eColumn.classList.remove('drop'); clearDropMarkers(); }
  });
  eColumn.addEventListener('drop', (oEvent) => {
    oEvent.preventDefault();
    const iIndex = dropIndex(eCards, oEvent.clientY);
    eColumn.classList.remove('drop');
    clearDropMarkers();
    const sIssueId = oState.sDragId;
    oState.sDragId = '';
    if (sIssueId) moveIssue(oState, sIssueId, sColumnId, iIndex);
  });
}

function dropIndex(eCards, iClientY) {
  const aCards = qsa('.card:not(.dragging)', eCards);
  const iIndex = aCards.findIndex((eCard) => {
    const oRect = eCard.getBoundingClientRect();
    return iClientY < oRect.top + oRect.height / 2;
  });
  return iIndex === -1 ? aCards.length : iIndex;
}

function placeDropMarker(eCards, iClientY) {
  clearDropMarkers();
  const aCards = qsa('.card:not(.dragging)', eCards);
  const iIndex = dropIndex(eCards, iClientY);
  const eMarker = document.createElement('div');
  eMarker.className = 'drop-marker';
  if (aCards[iIndex]) eCards.insertBefore(eMarker, aCards[iIndex]);
  else eCards.appendChild(eMarker);
}

function clearDropMarkers() {
  qsa('.drop-marker').forEach((eMarker) => eMarker.remove());
  qsa('.col.drop').forEach((eColumn) => eColumn.classList.remove('drop'));
}

function findIssueEntry(oState, sIssueId) {
  for (const oEntry of oState.oColumns.values()) {
    const oIssue = oEntry.aIssues.find((oItem) => oItem.sId === sIssueId);
    if (oIssue) return { oEntry, oIssue };
  }
  return null;
}

async function changeBoards(oState, oIssue, fnNext, sSuccess) {
  try {
    const aCurrent = await data().listIssueBoardIds(oIssue.sId);
    const aBoardIds = fnNext(aCurrent);
    await data().setIssueBoards(oIssue, aBoardIds);
    showToast(sSuccess);
    emit('issue:changed', { ...oIssue, aBoardIds });
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
  }
}

function openCardMenu(oState, eAnchor, oIssue) {
  const oFound = findIssueEntry(oState, oIssue.sId);
  if (!oFound) return;
  const aItems = oFound.oEntry.aIssues;
  const iIndex = aItems.findIndex((oItem) => oItem.sId === oIssue.sId);
  const oColumnFor = (iStatus) => [...oState.oColumns.values()].find((oEntry) => oEntry.oColumn.iStatus === iStatus);
  const aMoves = getAllowedTransitions(oIssue.iStatus, oState.oWorkflow).filter((iStatus) => oColumnFor(iStatus))
    .map((iStatus) => ({ sHtml: `${ICONS.arrowRight} Move to ${statusPill(iStatus)}`, fnSelect: () => moveIssue(oState, oIssue.sId, oColumnFor(iStatus).oColumn.sId, oColumnFor(iStatus).aIssues.length) }));
  const oBoard = oState.oBoard;
  const aOtherBoards = oState.aBoards.filter((oItem) => !oItem.bDefault && oItem.sId !== oBoard.sId);
  const aBoardItems = [
    ...aOtherBoards.map((oItem) => ({ sHtml: `+ Add to ${escapeHtml(oItem.sName)}`, fnSelect: () => changeBoards(oState, oIssue, (aIds) => [...new Set([...aIds, oItem.sId])], `${oIssue.sKey} added to ${oItem.sName}`) })),
    ...(oBoard.bDefault ? [] : [{ sHtml: `Remove from ${escapeHtml(oBoard.sName)}`, fnSelect: () => changeBoards(oState, oIssue, (aIds) => aIds.filter((sId) => sId !== oBoard.sId), `${oIssue.sKey} removed from ${oBoard.sName}`) }]),
  ];
  openMenu(eAnchor, [
    { sHtml: 'Open issue', fnSelect: () => setIssueInRoute(oIssue.sKey) },
    { bSeparator: true },
    { sHeading: 'Change status' },
    ...aMoves,
    { bSeparator: true },
    { sHtml: 'Move to top', bDisabled: iIndex === 0, fnSelect: () => moveIssue(oState, oIssue.sId, oFound.oEntry.oColumn.sId, 0) },
    { sHtml: 'Move up', bDisabled: iIndex === 0, fnSelect: () => moveIssue(oState, oIssue.sId, oFound.oEntry.oColumn.sId, iIndex - 1) },
    { sHtml: 'Move down', bDisabled: iIndex === aItems.length - 1, fnSelect: () => moveIssue(oState, oIssue.sId, oFound.oEntry.oColumn.sId, iIndex + 1) },
    { sHtml: 'Move to bottom', bDisabled: iIndex === aItems.length - 1, fnSelect: () => moveIssue(oState, oIssue.sId, oFound.oEntry.oColumn.sId, aItems.length - 1) },
    ...(aBoardItems.length ? [{ bSeparator: true }, { sHeading: 'Boards' }, ...aBoardItems] : []),
  ], { sLabel: `Actions for ${oIssue.sKey}` });
}

// Local rank for the optimistic redraw only; the server re-ranks from the neighbours' current values.
function computeRank(aTarget, iIndex) {
  const sBefore = iIndex > 0 ? aTarget[iIndex - 1].sRank : '';
  const sAfter = iIndex < aTarget.length ? aTarget[iIndex].sRank : '';
  try {
    return rankBetween(sBefore, sAfter);
  } catch (oError) {
    return rankBetween(aTarget.length ? aTarget[aTarget.length - 1].sRank : '', '');
  }
}

// iIndex is the insertion point among the target column's cards, excluding the moved card.
async function moveIssue(oState, sIssueId, sTargetColumnId, iIndex) {
  const oFound = findIssueEntry(oState, sIssueId);
  const oTarget = oState.oColumns.get(sTargetColumnId);
  if (!oFound || !oTarget) return;
  const { oEntry: oSource, oIssue } = oFound;
  const iTargetStatus = oTarget.oColumn.iStatus;
  const bSameColumn = oSource === oTarget;
  const iOldIndex = oSource.aIssues.indexOf(oIssue);
  if (bSameColumn && iIndex === iOldIndex) return;
  if (!bSameColumn && !canTransition(oIssue.iStatus, iTargetStatus, oState.oWorkflow)) {
    showToast(`${oIssue.sKey} cannot move from ${getIssueStatus(oIssue.iStatus).label} to ${getIssueStatus(iTargetStatus).label}.`, { sKind: 'error' });
    return;
  }
  let oFields = {};
  if (!bSameColumn) {
    try {
      oFields = await collectTransitionFields(oIssue, iTargetStatus);
    } catch (oError) {
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
      return;
    }
    // The board may have reloaded while the dialog was open; only continue if the card is where it was.
    const oStill = oFields ? findIssueEntry(oState, sIssueId) : null;
    if (!oStill || oStill.oEntry !== oSource || oState.oColumns.get(sTargetColumnId) !== oTarget) return;
  }
  const oSnapshot = new Map([...oState.oColumns].map(([sId, oEntry]) => [sId, { ...oEntry, aIssues: [...oEntry.aIssues] }]));
  const aTarget = oTarget.aIssues.filter((oItem) => oItem.sId !== sIssueId);
  const iInsert = Math.max(0, Math.min(iIndex, aTarget.length));
  const oPlacement = { sBeforeId: iInsert > 0 ? aTarget[iInsert - 1].sId : '', sAfterId: iInsert < aTarget.length ? aTarget[iInsert].sId : '' };
  const oMoved = { ...oIssue, iStatus: iTargetStatus, sRank: computeRank(aTarget, iInsert) };
  oSource.aIssues = oSource.aIssues.filter((oItem) => oItem.sId !== sIssueId);
  if (bSameColumn) oSource.aIssues = aTarget;
  aTarget.splice(iInsert, 0, oMoved);
  oTarget.aIssues = aTarget;
  if (!bSameColumn) { oSource.iCount = Math.max(0, oSource.iCount - 1); oTarget.iCount += 1; }
  renderColumn(oState, oSource.oColumn.sId);
  if (!bSameColumn) renderColumn(oState, sTargetColumnId);
  const eCard = qs(`[data-issue="${CSS.escape(sIssueId)}"]`);
  if (eCard) { eCard.classList.add('saving'); eCard.setAttribute('aria-busy', 'true'); }
  try {
    const { oIssue: oSaved, bHistorySaved } = await data().transitionIssue(oIssue, iTargetStatus, oPlacement, oFields);
    const oLatest = findIssueEntry(oState, sIssueId);
    if (oLatest) Object.assign(oLatest.oIssue, { ...oSaved, aLabels: oIssue.aLabels });
    oTarget.aIssues.sort(compareRank);
    renderColumn(oState, sTargetColumnId);
    if (!bSameColumn) {
      showToast(`${oIssue.sKey} moved to ${getIssueStatus(iTargetStatus).label}`);
      if (!bHistorySaved) showToast('Moved, but the history entry could not be recorded.', { sKind: 'error' });
      emit('issue:moved', { ...oSaved, aLabels: oIssue.aLabels });
      renderSprintBanner(oState);
    }
    const eSaved = qs(`[data-issue="${CSS.escape(sIssueId)}"]`);
    if (eSaved) eSaved.focus();
  } catch (oError) {
    oState.oColumns = oSnapshot;
    renderColumns(oState);
    showToast(`${oIssue.sKey} was not moved. ${toFriendlyMessage(oError)}`, { sKind: 'error' });
  }
}

// Keeps cards in sync with edits made in the issue panel without reloading the whole board.
function applyExternalChange(oState, oIssue) {
  if (!oIssue || !oState.oBoard || oIssue.sProjectId !== oApp.oProject.sId) return;
  const oFound = findIssueEntry(oState, oIssue.sId);
  const bLeftBoard = !oState.oBoard.bDefault && Array.isArray(oIssue.aBoardIds) && !oIssue.aBoardIds.includes(oState.oBoard.sId);
  const bLeftSprint = isScrum(oState) && oState.oSprint && oIssue.sSprintId !== undefined && oIssue.sSprintId !== oState.oSprint.sId;
  if (oFound && oFound.oIssue.iStatus === oIssue.iStatus && !bLeftBoard && !bLeftSprint) {
    Object.assign(oFound.oIssue, oIssue, { aLabels: oIssue.aLabels || oFound.oIssue.aLabels });
    oFound.oEntry.aIssues.sort(compareRank);
    renderColumn(oState, oFound.oEntry.oColumn.sId);
    return;
  }
  const aStatuses = [oIssue.iStatus];
  if (oFound) aStatuses.push(oFound.oIssue.iStatus);
  reloadColumns(oState, aStatuses);
}

function highlightCard(sKey) {
  qsa('.card.is-selected').forEach((eCard) => eCard.classList.remove('is-selected'));
  if (!sKey) return;
  const eCard = qsa('.card').find((eItem) => (eItem.getAttribute('aria-label') || '').startsWith(`${sKey}:`));
  if (eCard) eCard.classList.add('is-selected');
}

export function boardAccessDenied(eMain) {
  eMain.innerHTML = stateHtml({ sTitle: 'You do not have access to this project', sMessage: 'Ask a project lead to add you as a member.', sIcon: '⊘', bFull: true });
}
