// Projects directory, create-project flow and project overview.
import { PROJECT_TYPES, LIMITS, SEARCH_DELAY_MS, PRIORITIES, PROJECT_TEMPLATES } from '../../config/app-config.js';
import { suggestProjectKey, normaliseProjectKey, validateProjectDraft, getMemberRole, toFriendlyMessage, formatRelativeTime, getIssueStatus } from '../domain.js';
import { oApp, data, on, navigate, projectHash, findMembership, refreshMemberships, setIssueInRoute } from './context.js';
import {
  qs, qsa, escapeHtml, avatar, projectAvatar, skeletonRows, stateHtml, renderError, debounce, openModal, showToast, showFieldErrors, ICONS,
} from './dom.js';
import { issueRowHtml } from './lists.js';
import { copyShareLink } from './deep-link.js';

const typeLabel = (iType) => (PROJECT_TYPES.find((oType) => oType.value === iType) || PROJECT_TYPES[0]).label;

// ── Create project ─────────────────────────────────────────────

export function openCreateProject() {
  let bKeyEdited = false;
  const oModal = openModal({
    sTitle: 'Create project',
    sBodyHtml: `
      <label class="field">Name <b class="req">*</b><input class="inp" data-field="sName" maxlength="${LIMITS.projectNameMax}" autocomplete="off" placeholder="e.g. Website Revamp">
        <span class="err" data-error-for="sName"></span></label>
      <div class="row2">
        <label class="field">Key <b class="req">*</b><input class="inp" data-field="sKey" maxlength="${LIMITS.projectKeyMax}" autocomplete="off" style="text-transform:uppercase;font-family:var(--mono)">
          <span class="hint">2–10 letters/numbers. Issue keys look like <span id="keyPreview">KEY-1</span>. Locked once issues exist.</span>
          <span class="err" data-error-for="sKey"></span></label>
        <label class="field">Type<select class="sel" data-field="iType">${PROJECT_TYPES.map((oType) => `<option value="${oType.value}">${escapeHtml(oType.label)}</option>`).join('')}</select></label>
      </div>
      <label class="field">Description<textarea class="txt" data-field="sDescription" rows="3" maxlength="${LIMITS.projectDescriptionMax}" placeholder="What is this project for?"></textarea>
        <span class="err" data-error-for="sDescription"></span></label>
      <fieldset class="choice-group"><legend>Workflow template</legend><div class="template-cards">
        <label class="template-card"><span><input type="radio" name="projectTemplate" value="" checked> <b>Default</b></span><small>To Do, In Progress, In Review and Done. Any move is allowed.</small></label>
        ${PROJECT_TEMPLATES.map((oTemplate) => `<label class="template-card"><span><input type="radio" name="projectTemplate" value="${escapeHtml(oTemplate.key)}"> <b>${escapeHtml(oTemplate.label)}</b></span><small>${escapeHtml(oTemplate.sDescription)}</small></label>`).join('')}
      </div></fieldset>
      <p class="hint">You will be the project lead. A default board with a column per workflow status is created for you. Leads can change the workflow later in Project settings → Workflow.</p>`,
    aActions: [
      { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
      { sLabel: 'Create project', sKind: 'primary', fnClick: submitProject },
    ],
  });
  const eName = qs('[data-field="sName"]', oModal.eModal);
  const eKey = qs('[data-field="sKey"]', oModal.eModal);
  const fnPreview = () => { qs('#keyPreview', oModal.eModal).textContent = `${normaliseProjectKey(eKey.value) || 'KEY'}-1`; };
  eName.addEventListener('input', () => { if (!bKeyEdited) { eKey.value = suggestProjectKey(eName.value); fnPreview(); } });
  eKey.addEventListener('input', () => { bKeyEdited = true; eKey.value = eKey.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); fnPreview(); });
  qsa('[name="projectTemplate"]', oModal.eModal).forEach((eRadio) => eRadio.addEventListener('change', () => {
    const oTemplate = PROJECT_TEMPLATES.find((oItem) => oItem.key === eRadio.value);
    if (oTemplate) qs('[data-field="iType"]', oModal.eModal).value = String(oTemplate.iProjectType);
  }));
}

async function submitProject(oModal, iActionIndex) {
  const fnValue = (sField) => qs(`[data-field="${sField}"]`, oModal.eModal).value;
  const sTemplateKey = (qs('[name="projectTemplate"]:checked', oModal.eModal) || {}).value || '';
  const oDraft = { sName: fnValue('sName').trim(), sKey: normaliseProjectKey(fnValue('sKey')), iType: Number(fnValue('iType')), sDescription: fnValue('sDescription'), sTemplateKey };
  const { bValid, oErrors } = validateProjectDraft(oDraft);
  showFieldErrors(oModal.eModal, oErrors);
  if (!bValid) return;
  oModal.setBusy(true, iActionIndex);
  try {
    const oProject = await data().createProject(oDraft);
    await refreshMemberships();
    oModal.close(oProject);
    showToast(`Project ${oProject.sKey} created`);
    if (sTemplateKey && oProject.sTemplateKey !== sTemplateKey) showToast('The project was created, but its template couldn\'t be applied. Apply it from Project settings → Workflow.', { sKind: 'error' });
    navigate(projectHash(oProject.sKey, 'board'));
  } catch (oError) {
    oModal.setBusy(false, iActionIndex);
    if (oError.details) showFieldErrors(oModal.eModal, oError.details);
    else showToast(toFriendlyMessage(oError), { sKind: 'error' });
  }
}

// ── Projects directory ─────────────────────────────────────────

const oDirectory = { sText: '', bArchived: false };

export function renderProjects(eMain) {
  const oState = { aProjects: [], sNextToken: '', iEpoch: 0 };
  eMain.innerHTML = `<div class="page-pad">
    <div class="head"><h1>Projects</h1><div class="spacer"></div><button class="btn btn-primary" type="button" id="projectsCreate">Create project</button></div>
    <div class="toolbar">
      <label class="search"><span aria-hidden="true">${ICONS.search}</span><span class="sr">Search projects</span><input id="projectsSearch" type="search" placeholder="Search projects" value="${escapeHtml(oDirectory.sText)}" autocomplete="off"></label>
      <label class="check"><input type="checkbox" id="projectsArchived"${oDirectory.bArchived ? ' checked' : ''}> Show archived</label>
    </div>
    <div id="projectsBody"></div></div>`;
  qs('#projectsCreate', eMain).addEventListener('click', openCreateProject);

  async function load(bMore) {
    const iEpoch = ++oState.iEpoch;
    const eBody = qs('#projectsBody', eMain);
    if (!bMore) eBody.innerHTML = skeletonRows(5, 'sk-row');
    try {
      const { aProjects, sNextToken } = await data().listProjects({ sText: oDirectory.sText, bIncludeArchived: oDirectory.bArchived, sSkipToken: bMore ? oState.sNextToken : '' });
      if (iEpoch !== oState.iEpoch) return;
      oState.aProjects = bMore ? [...oState.aProjects, ...aProjects] : aProjects;
      oState.sNextToken = sNextToken;
      if (!oState.aProjects.length) {
        eBody.innerHTML = stateHtml({ sTitle: oDirectory.sText ? 'No projects match your search' : 'No projects yet', sMessage: oDirectory.sText ? 'Try a different name or key.' : 'Create the first project to start tracking work.', sIcon: '◇', sActionLabel: oDirectory.sText ? '' : 'Create project', sActionId: 'projectsEmptyCreate' });
        const eEmptyCreate = qs('#projectsEmptyCreate', eBody);
        if (eEmptyCreate) eEmptyCreate.addEventListener('click', openCreateProject);
        return;
      }
      eBody.innerHTML = `<table class="grid"><thead><tr><th scope="col">Name</th><th scope="col">Key</th><th scope="col">Type</th><th scope="col">Lead</th><th scope="col">Your role</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
        <tbody>${oState.aProjects.map((oProject) => {
          const oRole = getMemberRole((findMembership(oProject.sId) || {}).iRole);
          return `<tr class="clickable" data-key="${escapeHtml(oProject.sKey)}">
            <td><div class="who">${projectAvatar(oProject.sKey, 'sm')}<a class="row-link" href="${escapeHtml(projectHash(oProject.sKey, 'board'))}">${escapeHtml(oProject.sName)}</a>${oProject.bArchived ? '<span class="pill">Archived</span>' : ''}</div></td>
            <td><span class="key">${escapeHtml(oProject.sKey)}</span></td>
            <td>${escapeHtml(typeLabel(oProject.iType))}</td>
            <td><div class="who">${avatar(oProject.sLeadId, oProject.sLeadName, 'xs')} ${escapeHtml(oProject.sLeadName || '—')}</div></td>
            <td>${oRole ? `<span class="pill${oRole.key === 'lead' ? ' accent' : ''}">${escapeHtml(oRole.label)}</span>` : '<span class="hint">Not a member</span>'}</td>
            <td><a class="btn btn-quiet" href="${escapeHtml(projectHash(oProject.sKey, 'overview'))}">Overview</a></td></tr>`;
        }).join('')}</tbody></table>
        ${oState.sNextToken ? '<div class="load-more"><button class="btn btn-ghost" type="button" id="projectsMore">Load more</button></div>' : ''}`;
      qsa('tr[data-key]', eBody).forEach((eRow) => eRow.addEventListener('click', (oEvent) => { if (!oEvent.target.closest('a')) navigate(projectHash(eRow.dataset.key, 'board')); }));
      const eMore = qs('#projectsMore', eBody);
      if (eMore) eMore.addEventListener('click', () => load(true));
    } catch (oError) {
      if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), () => load(false));
    }
  }
  const eSearch = qs('#projectsSearch', eMain);
  eSearch.addEventListener('input', debounce(() => { oDirectory.sText = eSearch.value.trim(); load(false); }, SEARCH_DELAY_MS));
  qs('#projectsArchived', eMain).addEventListener('change', (oEvent) => { oDirectory.bArchived = oEvent.target.checked; load(false); });
  load(false);
  return () => { oState.iEpoch += 1; };
}

// ── Project overview ───────────────────────────────────────────

export function renderOverview(eMain) {
  const oProject = oApp.oProject;
  const oPermissions = oApp.oPermissions;
  const oState = { iEpoch: 0 };
  eMain.innerHTML = `<div class="page-pad">
    <div class="crumbs"><a href="#/projects">Projects</a> / ${escapeHtml(oProject.sName)}</div>
    <div class="overview-head">${projectAvatar(oProject.sKey, 'lg')}
      <div><h1>${escapeHtml(oProject.sName)}</h1><div class="hint"><span class="key">${escapeHtml(oProject.sKey)}</span> <button class="copy-btn" type="button" id="overviewCopy" aria-label="Copy link to project ${escapeHtml(oProject.sKey)}" title="Copy link">${ICONS.copy} Copy</button> · ${escapeHtml(typeLabel(oProject.iType))} project · Lead: ${escapeHtml(oProject.sLeadName || '—')}${oProject.bArchived ? ' · <span class="pill">Archived</span>' : ''}</div></div>
      <div class="spacer"></div>
      <a class="btn btn-primary" href="${escapeHtml(projectHash(oProject.sKey, 'board'))}">Open board</a>
      ${oPermissions.bCanManage ? `<a class="btn btn-ghost" href="${escapeHtml(projectHash(oProject.sKey, 'settings'))}">Settings</a>` : ''}
    </div>
    ${oProject.sDescription ? `<p class="prose" style="max-width:820px;margin-bottom:18px">${escapeHtml(oProject.sDescription)}</p>` : ''}
    <div class="cards-grid page-section" id="overviewCounts">${skeletonRows(4, 'tile skeleton')}</div>
    <div class="overview-grid page-section">
      <section><div class="sec-t">Active sprints</div><div id="overviewSprints">${skeletonRows(2, 'sk-row')}</div></section>
      <section><div class="sec-t">Open work by priority</div><div class="tile" id="overviewPriorities">${skeletonRows(5, 'sk-line')}</div></section>
    </div>
    <div class="overview-grid">
      <section><div class="sec-t">Recently updated</div><div id="overviewRecent">${skeletonRows(4, 'sk-row')}</div></section>
      <section><div class="sec-t">Members</div><div class="tile" id="overviewMembers">${skeletonRows(3, 'sk-line')}</div></section>
    </div></div>`;
  qs('#overviewCopy', eMain).addEventListener('click', () => copyShareLink({ sProjectKey: oProject.sKey, sView: 'overview' }, oProject.sKey));

  async function load() {
    const iEpoch = ++oState.iEpoch;
    const [oDashboard, oRecent, aMembers] = await Promise.allSettled([
      data().getDashboard(oProject),
      data().listIssues({ oCriteria: { sProjectId: oProject.sId }, aOrderBy: ['modifiedon desc'], iPageSize: 6 }),
      data().listMembers(oProject.sId),
    ]);
    if (iEpoch !== oState.iEpoch) return;
    const eCounts = qs('#overviewCounts', eMain);
    const eSprints = qs('#overviewSprints', eMain);
    const ePriorities = qs('#overviewPriorities', eMain);
    if (oDashboard.status === 'fulfilled') {
      const { oStatusCounts, oPriorityCounts, iOverdue, iUnassigned, aSprintProgress } = oDashboard.value;
      const iTotal = Object.values(oStatusCounts).reduce((iSum, iCount) => iSum + iCount, 0);
      // Object keys come back in numeric order, so the workflow (already cached by the dashboard) supplies the column order.
      const oWorkflow = await data().getWorkflow(oProject.sId).catch(() => null);
      if (iEpoch !== oState.iEpoch) return;
      const aStatuses = oWorkflow ? oWorkflow.aStatuses.filter((iStatus) => iStatus in oStatusCounts) : Object.keys(oStatusCounts).map(Number);
      eCounts.innerHTML = aStatuses.map((iStatus) => {
        const iCount = oStatusCounts[iStatus] || 0;
        return `<div class="tile stat"><small>${escapeHtml(getIssueStatus(iStatus).label)}</small><b>${iCount}</b><span class="bar" aria-hidden="true"><i style="width:${iTotal ? Math.round((iCount / iTotal) * 100) : 0}%"></i></span></div>`;
      }).join('') + `<div class="tile stat"><small>Overdue (open)</small><b>${iOverdue}</b><span class="hint">Due before today</span></div>
        <div class="tile stat"><small>Unassigned (open)</small><b>${iUnassigned}</b><span class="hint">Nobody picked these up</span></div>`;
      const iOpenTotal = Object.values(oPriorityCounts).reduce((iSum, iCount) => iSum + iCount, 0);
      ePriorities.innerHTML = `<div class="priority-bars">${[...PRIORITIES].reverse().map((oPriority) => {
        const iCount = oPriorityCounts[oPriority.value] || 0;
        return `<div><span>${escapeHtml(oPriority.label)}</span><span class="bar" aria-hidden="true"><i style="width:${iOpenTotal ? Math.round((iCount / iOpenTotal) * 100) : 0}%"></i></span><b>${iCount}</b></div>`;
      }).join('')}</div>`;
      eSprints.innerHTML = aSprintProgress.length
        ? aSprintProgress.map(({ oSprint, oMetrics, oScope }) => {
          const iPercent = oMetrics.iIssues ? Math.round((oMetrics.iDone / oMetrics.iIssues) * 100) : 0;
          return `<a class="tile sprint-tile" href="${escapeHtml(projectHash(oProject.sKey, 'sprints', oSprint.sId))}"><h3>${escapeHtml(oSprint.sName)}</h3>
            <span class="progress-line"><span class="bar" aria-hidden="true"><i style="width:${iPercent}%"></i></span><span class="hint">${oMetrics.iDone}/${oMetrics.iIssues} done</span></span>
            <small>${oMetrics.iDonePoints}/${oMetrics.iPoints} pts done${oScope ? ` · scope ${oScope.iIssueDelta >= 0 ? '+' : ''}${oScope.iIssueDelta} issues` : ''}${oMetrics.iUnestimated ? ` · ${oMetrics.iUnestimated} not estimated` : ''}</small></a>`;
        }).join('')
        : stateHtml({ sTitle: 'No active sprint', sMessage: 'Plan and start sprints from the backlog.', sIcon: '◷', sActionLabel: 'Open backlog', sActionId: 'overviewBacklog' });
      const eBacklog = qs('#overviewBacklog', eSprints);
      if (eBacklog) eBacklog.addEventListener('click', () => navigate(projectHash(oProject.sKey, 'backlog')));
    } else {
      renderError(eCounts, toFriendlyMessage(oDashboard.reason), load);
      eSprints.innerHTML = '';
      ePriorities.innerHTML = '';
    }
    const eRecent = qs('#overviewRecent', eMain);
    if (oRecent.status === 'fulfilled') {
      eRecent.innerHTML = oRecent.value.aIssues.length
        ? `<div class="issue-rows">${oRecent.value.aIssues.map((oIssue) => issueRowHtml(oIssue, false)).join('')}</div>`
        : stateHtml({ sTitle: 'No issues yet', sMessage: oPermissions.bCanEdit ? 'Create the first issue from the board.' : '', sIcon: '◇' });
      qsa('.issue-row', eRecent).forEach((eRow) => eRow.addEventListener('click', () => setIssueInRoute(eRow.dataset.key)));
    } else renderError(eRecent, toFriendlyMessage(oRecent.reason), load);
    const eMembers = qs('#overviewMembers', eMain);
    if (aMembers.status === 'fulfilled') {
      eMembers.innerHTML = `<div class="member-list">${aMembers.value.map((oMember) => `<div>${avatar(oMember.sUserId, oMember.sUserName)}<span>${escapeHtml(oMember.sUserName)}</span><small>${escapeHtml((getMemberRole(oMember.iRole) || {}).label || '')}</small></div>`).join('') || '<p class="hint">No members.</p>'}</div>
        <p class="hint" style="margin-top:12px">Joined ${escapeHtml(formatRelativeTime((findMembership(oProject.sId) || {}).sJoinedOn || oProject.sCreatedOn))}</p>`;
    } else renderError(eMembers, toFriendlyMessage(aMembers.reason), load);
  }
  load();
  const aUnsubscribe = [on('issue:created', load), on('issue:moved', load), on('issue:archived', load), on('sprint:changed', load)];
  return () => { oState.iEpoch += 1; aUnsubscribe.forEach((fnUnsubscribe) => fnUnsubscribe()); };
}
