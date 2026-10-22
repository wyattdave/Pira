// Project settings: details, archive, membership and board columns. Leads only; others see read-only membership.
import { PROJECT_TYPES, MEMBER_ROLES, LIMITS, SEARCH_DELAY_MS, BOARD_TYPES } from '../../config/app-config.js';
import { normaliseProjectKey, validateProjectDraft, getMemberRole, toFriendlyMessage, getProjectPermissions, getErrorMessage, ERROR_CODES } from '../domain.js';
import { oApp, data, emit, navigate, projectHash, refreshMemberships, findMembership } from './context.js';
import {
  qs, qsa, escapeHtml, avatar, skeletonRows, stateHtml, renderError, debounce, showToast, showFieldErrors, confirmDialog, setBusy,
} from './dom.js';
import { openBoardEditor } from './board-dialogs.js';
import { renderWorkflowTab } from './workflow-settings.js';
import { renderCustomFieldsTab } from './custom-field-settings.js';

const TABS = Object.freeze([
  { sId: 'details', sLabel: 'Details' },
  { sId: 'members', sLabel: 'Members' },
  { sId: 'boards', sLabel: 'Boards & columns' },
  { sId: 'workflow', sLabel: 'Workflow' },
  { sId: 'fields', sLabel: 'Custom fields' },
]);

export function renderSettings(eMain, oRoute) {
  const oProject = oApp.oProject;
  const sTab = oRoute.sTab === 'columns' ? 'boards' : oRoute.sTab;
  const oTab = TABS.find((oItem) => oItem.sId === sTab) || TABS[0];
  const bManage = oApp.oPermissions.bCanManage;
  const oState = { iEpoch: 0, sBoardId: '' };
  eMain.innerHTML = `<div class="page-pad">
    <div class="crumbs"><a href="#/projects">Projects</a> / <a href="${escapeHtml(projectHash(oProject.sKey, 'overview'))}">${escapeHtml(oProject.sName)}</a></div>
    <div class="head"><h1>Project settings</h1></div>
    ${bManage ? '' : '<div class="notice">Only project leads can change settings. You can view the member list.</div>'}
    <nav class="tabs" role="tablist" aria-label="Settings sections">${TABS.map((oItem) => `<a role="tab" href="${escapeHtml(projectHash(oProject.sKey, 'settings', oItem.sId))}" aria-selected="${oItem.sId === oTab.sId}">${escapeHtml(oItem.sLabel)}</a>`).join('')}</nav>
    <div id="settingsBody" role="tabpanel"></div></div>`;
  const eBody = qs('#settingsBody', eMain);
  if (oTab.sId === 'members') renderMembers(eBody, oState, bManage);
  else if (!bManage) eBody.innerHTML = stateHtml({ sTitle: 'Leads only', sMessage: 'Ask a project lead to change these settings.', sIcon: '⊘' });
  else if (oTab.sId === 'boards') renderBoardsTab(eBody, oState);
  else if (oTab.sId === 'workflow') renderWorkflowTab(eBody, oState);
  else if (oTab.sId === 'fields') renderCustomFieldsTab(eBody, oState);
  else renderDetails(eBody);
  return () => { oState.iEpoch += 1; };
}

// ── Details ────────────────────────────────────────────────────

async function renderDetails(eBody) {
  const oProject = oApp.oProject;
  eBody.innerHTML = skeletonRows(4, 'sk-row');
  let aMembers = [];
  try {
    aMembers = await data().listMembers(oProject.sId);
  } catch (oError) {
    renderError(eBody, toFriendlyMessage(oError), () => renderDetails(eBody));
    return;
  }
  const aLeadChoices = aMembers.filter((oMember) => getMemberRole(oMember.iRole).key !== 'stakeholder');
  eBody.innerHTML = `
    <form class="settings-form" id="detailsForm" novalidate>
      <label class="field">Name <b class="req">*</b><input class="inp" data-field="sName" maxlength="${LIMITS.projectNameMax}" value="${escapeHtml(oProject.sName)}"><span class="err" data-error-for="sName"></span></label>
      <div class="row2">
        <label class="field">Key <b class="req">*</b><input class="inp" data-field="sKey" maxlength="${LIMITS.projectKeyMax}" value="${escapeHtml(oProject.sKey)}" style="font-family:var(--mono);text-transform:uppercase">
          <span class="hint">The key cannot change once the project has issues.</span><span class="err" data-error-for="sKey"></span></label>
        <label class="field">Type<select class="sel" data-field="iType">${PROJECT_TYPES.map((oType) => `<option value="${oType.value}"${oType.value === oProject.iType ? ' selected' : ''}>${escapeHtml(oType.label)}</option>`).join('')}</select></label>
      </div>
      <label class="field">Project lead<select class="sel" data-field="sLeadId">${aLeadChoices.map((oMember) => `<option value="${escapeHtml(oMember.sUserId)}"${oMember.sUserId === oProject.sLeadId ? ' selected' : ''}>${escapeHtml(oMember.sUserName)}</option>`).join('')}${aLeadChoices.some((oMember) => oMember.sUserId === oProject.sLeadId) ? '' : `<option value="${escapeHtml(oProject.sLeadId)}" selected>${escapeHtml(oProject.sLeadName || 'Current lead')}</option>`}</select></label>
      <label class="field">Description<textarea class="txt" data-field="sDescription" rows="4" maxlength="${LIMITS.projectDescriptionMax}">${escapeHtml(oProject.sDescription)}</textarea><span class="err" data-error-for="sDescription"></span></label>
      <div><button class="btn btn-primary" type="submit" id="detailsSave">Save changes</button></div>
    </form>
    <div class="sec-t" style="margin-top:30px">Danger zone</div>
    <div class="danger-zone"><div><b>${oProject.bArchived ? 'Restore this project' : 'Archive this project'}</b><p class="hint">${oProject.bArchived ? 'Restoring makes the project editable again.' : 'Archived projects are read-only and hidden from the project list. Nothing is deleted.'}</p></div>
      <button class="btn btn-danger" type="button" id="archiveToggle">${oProject.bArchived ? 'Restore project' : 'Archive project'}</button></div>`;
  const eForm = qs('#detailsForm', eBody);
  eForm.addEventListener('submit', async (oEvent) => {
    oEvent.preventDefault();
    const fnValue = (sField) => qs(`[data-field="${sField}"]`, eForm).value;
    const oChanges = { sName: fnValue('sName').trim(), sKey: normaliseProjectKey(fnValue('sKey')), iType: Number(fnValue('iType')), sLeadId: fnValue('sLeadId'), sDescription: fnValue('sDescription') };
    const { bValid, oErrors } = validateProjectDraft(oChanges);
    showFieldErrors(eForm, oErrors);
    if (!bValid) return;
    const eSave = qs('#detailsSave', eForm);
    setBusy(eSave, true);
    try {
      const sOldKey = oProject.sKey;
      const oUpdated = await data().updateProject(oProject, oChanges);
      data().invalidateCache('project:key:');
      oApp.oProject = oUpdated;
      await refreshMemberships();
      emit('project:changed', oUpdated);
      showToast('Project settings saved');
      if (oUpdated.sKey !== sOldKey) navigate(projectHash(oUpdated.sKey, 'settings', 'details'));
      else renderDetails(eBody);
    } catch (oError) {
      setBusy(eSave, false);
      if (oError.details) showFieldErrors(eForm, oError.details);
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
    }
  });
  qs('#archiveToggle', eBody).addEventListener('click', async (oEvent) => {
    const eButton = oEvent.currentTarget;
    const bArchive = !oProject.bArchived;
    const bConfirmed = await confirmDialog({
      sTitle: bArchive ? `Archive ${oProject.sName}?` : `Restore ${oProject.sName}?`,
      sMessage: bArchive ? 'Issues stay available read-only. You can restore the project at any time.' : 'Members will be able to create and edit issues again.',
      sConfirmLabel: bArchive ? 'Archive project' : 'Restore project', sKind: bArchive ? 'danger' : 'primary',
    });
    if (!bConfirmed) return;
    setBusy(eButton, true);
    try {
      oApp.oProject = await data().setProjectArchived(oProject, bArchive);
      oApp.oPermissions = getProjectPermissions(findMembership(oProject.sId), oApp.oProject.bArchived);
      emit('project:changed', oApp.oProject);
      showToast(bArchive ? 'Project archived' : 'Project restored');
      renderDetails(eBody);
    } catch (oError) {
      setBusy(eButton, false);
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
    }
  });
}

// ── Members ────────────────────────────────────────────────────

function roleSelect(iRole, sId, bDisabled) {
  return `<select class="sel" ${sId ? `id="${sId}"` : ''} data-role-select${bDisabled ? ' disabled' : ''} aria-label="Project role">${MEMBER_ROLES.map((oRole) => `<option value="${oRole.value}"${oRole.value === iRole ? ' selected' : ''}>${escapeHtml(oRole.label)}</option>`).join('')}</select>`;
}

async function renderMembers(eBody, oState, bManage) {
  const oProject = oApp.oProject;
  const iEpoch = ++oState.iEpoch;
  eBody.innerHTML = skeletonRows(4, 'sk-row');
  let aMembers;
  try {
    data().invalidateCache(`members:${oProject.sId}`);
    aMembers = await data().listMembers(oProject.sId);
  } catch (oError) {
    if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), () => renderMembers(eBody, oState, bManage));
    return;
  }
  if (iEpoch !== oState.iEpoch) return;
  const oSelected = { oUser: null };
  eBody.innerHTML = `
    ${bManage ? `<div class="add-member">
      <div class="field">Add people<div class="search-wrap"><input class="inp" id="memberSearch" placeholder="Search your organisation (Entra ID) by name or email" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="memberResults" aria-autocomplete="list">
        <div class="menu" id="memberResults" role="listbox" hidden style="position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:260px;overflow:auto"></div></div></div>
      <label class="field">Role${roleSelect(MEMBER_ROLES[1].value, 'newMemberRole', false)}</label>
      <button class="btn btn-primary" type="button" id="memberAdd" disabled>Add</button></div>` : ''}
    <div class="settings-list" aria-label="Project members">${aMembers.map((oMember) => {
      const bSelf = oMember.sUserId === oApp.oUser.sId;
      return `<div class="member-row" data-member="${escapeHtml(oMember.sId)}">
      <span class="who">${avatar(oMember.sUserId, oMember.sUserName)}<span>${escapeHtml(oMember.sUserName)}${bSelf ? ' <span class="hint">(you)</span>' : ''}</span></span>
      ${bManage ? roleSelect(oMember.iRole, '', bSelf) : `<span class="pill">${escapeHtml((getMemberRole(oMember.iRole) || {}).label || '')}</span>`}
      ${bManage && !bSelf ? '<button class="btn btn-quiet" type="button" data-remove>Remove</button>' : `<span class="hint">${bManage ? 'Another lead can change your role' : ''}</span>`}</div>`;
    }).join('') || '<p class="hint" style="padding:12px">No members.</p>'}</div>`;
  if (!bManage) return;

  qsa('[data-member]', eBody).forEach((eRow) => {
    const oMember = aMembers.find((oItem) => oItem.sId === eRow.dataset.member);
    qs('[data-role-select]', eRow).addEventListener('change', async (oEvent) => {
      const eSelect = oEvent.target;
      setBusy(eSelect, true);
      try {
        await data().updateMemberRole(oProject, oMember, Number(eSelect.value));
        await refreshMemberships();
        showToast(`${oMember.sUserName} is now ${getMemberRole(Number(eSelect.value)).label.toLowerCase()}`);
        renderMembers(eBody, oState, bManage);
      } catch (oError) {
        showToast(toFriendlyMessage(oError), { sKind: 'error' });
        renderMembers(eBody, oState, bManage);
      }
    });
    const eRemove = qs('[data-remove]', eRow);
    if (!eRemove) return;
    eRemove.addEventListener('click', async (oEvent) => {
      const bConfirmed = await confirmDialog({ sTitle: `Remove ${oMember.sUserName}?`, sMessage: 'They will lose access to this project in Pira. Their past comments and history are kept.', sConfirmLabel: 'Remove', sKind: 'danger' });
      if (!bConfirmed) return;
      setBusy(oEvent.target, true);
      try {
        await data().removeMember(oProject, oMember);
        await refreshMemberships();
        showToast(`${oMember.sUserName} removed`);
        renderMembers(eBody, oState, bManage);
      } catch (oError) {
        showToast(toFriendlyMessage(oError), { sKind: 'error' });
        setBusy(oEvent.target, false);
      }
    });
  });

  const eSearch = qs('#memberSearch', eBody);
  const eResults = qs('#memberResults', eBody);
  const eAdd = qs('#memberAdd', eBody);
  const fnHide = () => { eResults.hidden = true; eSearch.setAttribute('aria-expanded', 'false'); };
  const fnSearch = debounce(async () => {
    const sText = eSearch.value.trim();
    if (sText.length < 2) { fnHide(); return; }
    try {
      const aUsers = await data().searchUsers(sText);
      if (eSearch.value.trim() !== sText) return;
      const aCandidates = aUsers.filter((oUser) => !oUser.sId || !aMembers.some((oMember) => oMember.sUserId === oUser.sId));
      eResults.innerHTML = aCandidates.length
        ? aCandidates.map((oUser, iIndex) => `<button type="button" role="option" data-user-index="${iIndex}" aria-selected="false"${oUser.bProvisioned === false ? ' aria-disabled="true" class="is-disabled"' : ''}>${avatar(oUser.sId || oUser.sObjectId, oUser.sName, 'xs')} <span>${escapeHtml(oUser.sName)}<br><small class="hint">${escapeHtml(oUser.sEmail)}${oUser.bProvisioned === false ? ' · not set up in Dataverse yet' : ''}</small></span></button>`).join('')
        : '<div class="menu-empty">No matching people who are not already members.</div>';
      eResults.hidden = false;
      eSearch.setAttribute('aria-expanded', 'true');
      qsa('[data-user-index]', eResults).forEach((eOption) => eOption.addEventListener('mousedown', (oEvent) => {
        oEvent.preventDefault();
        const oCandidate = aCandidates[Number(eOption.dataset.userIndex)];
        if (oCandidate.bProvisioned === false) {
          showToast(`${oCandidate.sName}: ${getErrorMessage(ERROR_CODES.userNotProvisioned)}`, { sKind: 'error' });
          return;
        }
        oSelected.oUser = oCandidate;
        eSearch.value = oSelected.oUser.sName;
        eAdd.disabled = false;
        fnHide();
        eAdd.focus();
      }));
    } catch (oError) {
      eResults.innerHTML = `<div class="menu-empty">${escapeHtml(toFriendlyMessage(oError))}</div>`;
      eResults.hidden = false;
    }
  }, SEARCH_DELAY_MS);
  eSearch.addEventListener('input', () => { oSelected.oUser = null; eAdd.disabled = true; fnSearch(); });
  eSearch.addEventListener('blur', () => setTimeout(fnHide, 150));
  eSearch.addEventListener('keydown', (oEvent) => {
    const aOptions = qsa('[data-user-index]', eResults);
    if (oEvent.key === 'Escape') fnHide();
    if (oEvent.key === 'ArrowDown' && aOptions.length) {
      oEvent.preventDefault();
      const iCurrent = aOptions.findIndex((eOption) => eOption.getAttribute('aria-selected') === 'true');
      aOptions.forEach((eOption, iIndex) => eOption.setAttribute('aria-selected', String(iIndex === (iCurrent + 1) % aOptions.length)));
    }
    if (oEvent.key === 'Enter') {
      const eActive = aOptions.find((eOption) => eOption.getAttribute('aria-selected') === 'true') || aOptions[0];
      if (eActive) { oEvent.preventDefault(); eActive.dispatchEvent(new MouseEvent('mousedown')); }
    }
  });
  eAdd.addEventListener('click', async () => {
    if (!oSelected.oUser) return;
    setBusy(eAdd, true);
    try {
      await data().addMember(oProject, oSelected.oUser, Number(qs('#newMemberRole', eBody).value));
      showToast(`${oSelected.oUser.sName} added to ${oProject.sKey}`);
      renderMembers(eBody, oState, bManage);
    } catch (oError) {
      setBusy(eAdd, false);
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
    }
  });
}

// ── Boards & columns ──────────────────────────────────────────────

const boardTypeLabel = (iType) => (BOARD_TYPES.find((oType) => oType.value === iType) || BOARD_TYPES[0]).label;

async function renderBoardsTab(eBody, oState) {
  const oProject = oApp.oProject;
  const iEpoch = ++oState.iEpoch;
  eBody.innerHTML = skeletonRows(4, 'sk-row');
  let aBoards;
  try {
    data().invalidateCache(`boards:${oProject.sId}`);
    aBoards = await data().listBoards(oProject);
  } catch (oError) {
    if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), () => renderBoardsTab(eBody, oState));
    return;
  }
  if (iEpoch !== oState.iEpoch) return;
  if (!aBoards.some((oBoard) => oBoard.sId === oState.sBoardId)) oState.sBoardId = aBoards[0].sId;
  eBody.innerHTML = `<p class="hint" style="margin-bottom:12px">The default board always shows every project issue. Extra boards show only the issues added to them (issue panel → Boards, or a card's ⋯ menu); an issue can be on several boards.</p>
    <div class="settings-list" style="margin-bottom:12px">${aBoards.map((oBoard) => `<div class="board-row" data-board="${escapeHtml(oBoard.sId)}">
      <span><b>${escapeHtml(oBoard.sName)}</b> ${oBoard.bDefault ? '<span class="pill accent">Default · all issues</span>' : ''} <span class="pill">${escapeHtml(boardTypeLabel(oBoard.iType))}</span></span>
      <span style="display:flex;gap:4px;justify-content:flex-end">
        <button class="btn btn-quiet" type="button" data-board-columns aria-pressed="${oBoard.sId === oState.sBoardId}">Columns</button>
        <button class="btn btn-quiet" type="button" data-board-edit>Edit</button>
        ${oBoard.bDefault ? '' : '<button class="btn btn-quiet" type="button" data-board-archive>Archive</button>'}</span></div>`).join('')}</div>
    <button class="btn btn-ghost" type="button" id="boardAdd">+ Create board</button>
    <div class="sec-t" id="columnsTitle" style="margin-top:26px">Columns</div><div id="columnsHost"></div>`;
  qs('#boardAdd', eBody).addEventListener('click', async () => {
    const oBoard = await openBoardEditor({ oProject });
    if (oBoard && oBoard.sId) { oState.sBoardId = oBoard.sId; renderBoardsTab(eBody, oState); }
  });
  qsa('[data-board]', eBody).forEach((eRow) => {
    const oBoard = aBoards.find((oItem) => oItem.sId === eRow.dataset.board);
    qs('[data-board-columns]', eRow).addEventListener('click', () => { oState.sBoardId = oBoard.sId; renderBoardsTab(eBody, oState); });
    qs('[data-board-edit]', eRow).addEventListener('click', async () => { if (await openBoardEditor({ oProject, oBoard })) renderBoardsTab(eBody, oState); });
    const eArchive = qs('[data-board-archive]', eRow);
    if (!eArchive) return;
    eArchive.addEventListener('click', async () => {
      const bConfirmed = await confirmDialog({ sTitle: `Archive ${oBoard.sName}?`, sMessage: 'The board disappears from the board switcher. Its issues stay in the project and on the default board.', sConfirmLabel: 'Archive board', sKind: 'danger' });
      if (!bConfirmed) return;
      setBusy(eArchive, true);
      try {
        await data().archiveBoard(oProject, oBoard);
        emit('boards:changed', oProject.sId);
        showToast(`${oBoard.sName} archived`);
        renderBoardsTab(eBody, oState);
      } catch (oError) {
        setBusy(eArchive, false);
        showToast(toFriendlyMessage(oError), { sKind: 'error' });
      }
    });
  });
  const oSelected = aBoards.find((oBoard) => oBoard.sId === oState.sBoardId);
  qs('#columnsTitle', eBody).textContent = `Columns · ${oSelected.sName}`;
  renderColumnsTab(qs('#columnsHost', eBody), oState, oSelected.sId);
}

async function renderColumnsTab(eBody, oState, sBoardId) {
  const oProject = oApp.oProject;
  const iEpoch = oState.iEpoch;
  eBody.innerHTML = skeletonRows(4, 'sk-row');
  let oBoard;
  try {
    data().invalidateCache(`board:${oProject.sId}`);
    oBoard = await data().getBoard(oProject, sBoardId);
  } catch (oError) {
    if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), () => renderColumnsTab(eBody, oState, sBoardId));
    return;
  }
  if (iEpoch !== oState.iEpoch) return;
  const aColumns = oBoard.aColumns;
  eBody.innerHTML = `<p class="hint" style="margin-bottom:12px">Each column shows one workflow status (set the statuses and their order under Workflow). Rename columns, set a work-in-progress (WIP) limit (0 = no limit) and change the order.</p>
    <div class="settings-list">${aColumns.map((oColumn, iIndex) => `<div class="settings-row" data-column="${escapeHtml(oColumn.sId)}">
      <label class="field"><span class="sr">Column name</span><input class="inp" data-name maxlength="100" value="${escapeHtml(oColumn.sName)}" aria-label="Name for ${escapeHtml(oColumn.sName)} column"></label>
      <label class="field"><span class="sr">WIP limit</span><input class="inp" data-wip type="number" min="0" max="1000" value="${oColumn.iWipLimit}" aria-label="WIP limit for ${escapeHtml(oColumn.sName)}"></label>
      <span style="display:flex;gap:4px"><button class="btn btn-quiet" type="button" data-up${iIndex === 0 ? ' disabled' : ''} aria-label="Move ${escapeHtml(oColumn.sName)} left">↑</button><button class="btn btn-quiet" type="button" data-down${iIndex === aColumns.length - 1 ? ' disabled' : ''} aria-label="Move ${escapeHtml(oColumn.sName)} right">↓</button></span>
      <button class="btn btn-ghost" type="button" data-save>Save</button></div>`).join('')}</div>`;
  qsa('[data-column]', eBody).forEach((eRow, iIndex) => {
    const oColumn = aColumns[iIndex];
    qs('[data-save]', eRow).addEventListener('click', async (oEvent) => {
      setBusy(oEvent.currentTarget, true);
      try {
        await data().updateBoardColumn(oProject, oColumn, { sName: qs('[data-name]', eRow).value, iWipLimit: Number(qs('[data-wip]', eRow).value || 0) });
        showToast('Column saved');
        renderColumnsTab(eBody, oState, sBoardId);
      } catch (oError) {
        setBusy(oEvent.currentTarget, false);
        showToast(toFriendlyMessage(oError), { sKind: 'error' });
      }
    });
    const fnSwap = async (iOther) => {
      const oOther = aColumns[iOther];
      try {
        await Promise.all([
          data().updateBoardColumn(oProject, oColumn, { iOrder: oOther.iOrder === oColumn.iOrder ? iOther : oOther.iOrder }),
          data().updateBoardColumn(oProject, oOther, { iOrder: oOther.iOrder === oColumn.iOrder ? iIndex : oColumn.iOrder }),
        ]);
        renderColumnsTab(eBody, oState, sBoardId);
      } catch (oError) {
        showToast(toFriendlyMessage(oError), { sKind: 'error' });
        renderColumnsTab(eBody, oState, sBoardId);
      }
    };
    const eUp = qs('[data-up]', eRow);
    const eDown = qs('[data-down]', eRow);
    eUp.addEventListener('click', () => fnSwap(iIndex - 1));
    eDown.addEventListener('click', () => fnSwap(iIndex + 1));
  });
}
