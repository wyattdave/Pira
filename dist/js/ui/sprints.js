// Sprint reports (#/projects/KEY/sprints[/<sprintId>]): every sprint in the project with a simple summary.
// Metrics are deliberately simple counts and sums with documented definitions, not a Jira-equivalent burndown.
import { PAGING, SPRINT_STATE } from '../../config/app-config.js';
import { toFriendlyMessage, getSprintState, formatRelativeTime } from '../domain.js';
import { oApp, data, on, setIssueInRoute, projectHash } from './context.js';
import { qs, qsa, escapeHtml, skeletonRows, stateHtml, renderError } from './dom.js';
import { issueRowHtml } from './lists.js';
import { openSprintEditor, openCompleteSprint, confirmCancelSprint, openReopenSprint, formatSprintDates, daysLeft } from './sprint-dialogs.js';

const STATE_ORDER = [SPRINT_STATE.active, SPRINT_STATE.planned, SPRINT_STATE.completed, SPRINT_STATE.cancelled];

export function renderSprints(eMain, oRoute) {
  const oProject = oApp.oProject;
  const oState = { iEpoch: 0, aSprints: [], aBoards: [], sSelectedId: (oRoute && oRoute.sTab) || '' };
  eMain.innerHTML = `<div class="page-pad">
    <div class="crumbs"><a href="#/projects">Projects</a> / <a href="${escapeHtml(projectHash(oProject.sKey, 'overview'))}">${escapeHtml(oProject.sName)}</a></div>
    <div class="head"><h1>Sprints</h1><div class="spacer"></div><a class="btn btn-ghost" href="${escapeHtml(projectHash(oProject.sKey, 'backlog'))}">Open backlog</a></div>
    <div class="sprint-layout"><nav id="sprintList" aria-label="Sprints">${skeletonRows(5, 'sk-row')}</nav><section id="sprintDetail" aria-live="polite"></section></div></div>`;
  const aUnsubscribe = [on('sprint:changed', () => { data().invalidateCache(`sprints:${oProject.sId}`); load(oState); })];
  load(oState);
  return () => { oState.iEpoch += 1; aUnsubscribe.forEach((fnUnsubscribe) => fnUnsubscribe()); };
}

async function load(oState) {
  const iEpoch = ++oState.iEpoch;
  const oProject = oApp.oProject;
  const eList = qs('#sprintList');
  try {
    const [aSprints, aBoards] = await Promise.all([data().listSprints(oProject.sId), data().listBoards(oProject)]);
    if (iEpoch !== oState.iEpoch) return;
    Object.assign(oState, { aSprints, aBoards });
    const aSorted = [...aSprints].sort((oA, oB) => STATE_ORDER.indexOf(oA.iState) - STATE_ORDER.indexOf(oB.iState) || oB.sCreatedOn.localeCompare(oA.sCreatedOn));
    if (!aSorted.length) {
      eList.innerHTML = '';
      qs('#sprintDetail').innerHTML = stateHtml({ sTitle: 'No sprints yet', sMessage: 'Create and start sprints from the backlog.', sIcon: '◷' });
      return;
    }
    const oSelected = aSorted.find((oSprint) => oSprint.sId === oState.sSelectedId) || aSorted[0];
    eList.innerHTML = `<div class="sprint-nav">${aSorted.map((oSprint) => `<a href="${escapeHtml(projectHash(oProject.sKey, 'sprints', oSprint.sId))}"${oSprint.sId === oSelected.sId ? ' aria-current="page"' : ''}>
      <b>${escapeHtml(oSprint.sName)}</b><small>${escapeHtml(getSprintState(oSprint.iState).label)} · ${escapeHtml(formatSprintDates(oSprint))}${oState.aBoards.length > 1 ? ` · ${escapeHtml(boardName(oState, oSprint.sBoardId))}` : ''}</small></a>`).join('')}</div>`;
    renderDetail(oState, oSelected);
  } catch (oError) {
    if (iEpoch === oState.iEpoch) renderError(eList, toFriendlyMessage(oError), () => load(oState));
  }
}

const boardName = (oState, sBoardId) => (oState.aBoards.find((oBoard) => oBoard.sId === sBoardId) || {}).sName || 'Board';
const metricHtml = (sValue, sLabel, sHint = '') => `<div class="metric"><b>${escapeHtml(sValue)}</b><small>${escapeHtml(sLabel)}</small>${sHint ? `<span class="hint">${escapeHtml(sHint)}</span>` : ''}</div>`;
const signed = (iValue) => (iValue > 0 ? `+${iValue}` : String(iValue));

function metricsHtml(oSprint, oMetrics, oScope) {
  if (oSprint.iState === SPRINT_STATE.completed) {
    const iIssueDelta = oSprint.iCompletedIssues + oSprint.iIncompleteIssues - oSprint.iCommittedIssues;
    const iPointDelta = oSprint.iCompletedPoints + oSprint.iIncompletePoints - oSprint.iCommittedPoints;
    return `<div class="metric-row">
      ${metricHtml(`${oSprint.iCommittedIssues}`, 'Committed issues', `${oSprint.iCommittedPoints} pts at start`)}
      ${metricHtml(`${oSprint.iCompletedIssues}`, 'Completed', `${oSprint.iCompletedPoints} pts`)}
      ${metricHtml(`${oSprint.iIncompleteIssues}`, 'Incomplete (moved out)', `${oSprint.iIncompletePoints} pts`)}
      ${metricHtml(signed(iIssueDelta), 'Scope change', `${signed(iPointDelta)} pts`)}</div>`;
  }
  return `<div class="metric-row">
    ${oScope ? metricHtml(`${oSprint.iCommittedIssues}`, 'Committed issues', `${oSprint.iCommittedPoints} pts at start`) : ''}
    ${metricHtml(`${oMetrics.iDone}/${oMetrics.iIssues}`, 'Done', `${oMetrics.iDonePoints}/${oMetrics.iPoints} pts`)}
    ${metricHtml(`${oMetrics.iOpen}`, 'Open', `${oMetrics.iOpenPoints} pts`)}
    ${metricHtml(`${oMetrics.iUnestimated}`, 'Not estimated')}
    ${oScope ? metricHtml(signed(oScope.iIssueDelta), 'Scope change', `${signed(oScope.iPointDelta)} pts`) : ''}</div>`;
}

async function renderDetail(oState, oSprint) {
  const iEpoch = oState.iEpoch;
  const oProject = oApp.oProject;
  const eDetail = qs('#sprintDetail');
  const bCanEdit = oApp.oPermissions.bCanEdit;
  eDetail.innerHTML = skeletonRows(6, 'sk-row');
  try {
    const [oReport, oIssues] = await Promise.all([
      data().getSprintReport(oSprint),
      data().listIssues({ oCriteria: { sProjectId: oProject.sId, sSprintId: oSprint.sId }, aOrderBy: ['wd_rank asc', 'createdon asc'], iPageSize: PAGING.sprintIssues, bCount: true }),
    ]);
    if (iEpoch !== oState.iEpoch) return;
    const oFresh = oReport.oSprint;
    const bActive = oFresh.iState === SPRINT_STATE.active;
    const sActions = [
      bCanEdit && bActive ? '<button class="btn btn-primary" type="button" data-action="complete">Complete sprint</button>' : '',
      bCanEdit && oFresh.iState === SPRINT_STATE.planned ? '<button class="btn btn-primary" type="button" data-action="start">Start sprint</button><button class="btn btn-ghost" type="button" data-action="edit">Edit</button><button class="btn btn-danger" type="button" data-action="cancel">Cancel sprint</button>' : '',
      bCanEdit && bActive ? '<button class="btn btn-ghost" type="button" data-action="edit">Edit</button>' : '',
      oApp.oPermissions.bCanManage && oFresh.iState === SPRINT_STATE.completed ? '<button class="btn btn-danger" type="button" data-action="reopen">Reopen for correction</button>' : '',
    ].join('');
    eDetail.innerHTML = `
      <div class="sprint-head"><div><h2>${escapeHtml(oFresh.sName)} <span class="pill${bActive ? ' accent' : ''}">${escapeHtml(getSprintState(oFresh.iState).label)}</span></h2>
        <p class="hint">${escapeHtml(boardName(oState, oFresh.sBoardId))} · ${escapeHtml(formatSprintDates(oFresh))}${bActive ? ` · ${escapeHtml(daysLeft(oFresh))}` : ''}${oFresh.sStartedOn ? ` · started ${escapeHtml(formatRelativeTime(oFresh.sStartedOn))}` : ''}${oFresh.sCompletedOn ? ` · completed ${escapeHtml(formatRelativeTime(oFresh.sCompletedOn))}` : ''}</p></div>
        <div class="spacer"></div>${sActions}</div>
      ${oFresh.sGoal ? `<p class="prose bl-goal">${escapeHtml(oFresh.sGoal)}</p>` : ''}
      ${oFresh.sCorrectionNote ? `<div class="notice">Corrected: ${escapeHtml(oFresh.sCorrectionNote)}</div>` : ''}
      ${metricsHtml(oFresh, oReport.oMetrics, oReport.oScope)}
      <details class="definitions"><summary>How these numbers are worked out</summary><ul>
        <li><b>Committed</b>: issues and story points in the sprint when it was started.</li>
        <li><b>Completed</b>: issues in Done when the sprint was completed (live for active sprints).</li>
        <li><b>Incomplete</b>: open issues when the sprint was completed; they were moved to the destination you chose.</li>
        <li><b>Scope change</b>: net change against the committed snapshot (issues added minus removed). It is not a burndown.</li>
        <li>Archived issues never count, so deleted work is never reported as completed. Unestimated issues count as 0 points.</li></ul></details>
      <div class="sec-t">Issues in this sprint${oIssues.iCount !== null ? ` (${oIssues.iCount})` : ''}</div>
      ${oIssues.aIssues.length ? `<div class="issue-rows">${oIssues.aIssues.map((oIssue) => issueRowHtml(oIssue, false)).join('')}</div>` : '<p class="hint">No issues are in this sprint.</p>'}
      ${oIssues.sNextToken ? '<p class="hint">Showing the first issues. Open the backlog to see the rest.</p>' : ''}`;
    qsa('.issue-row', eDetail).forEach((eRow) => eRow.addEventListener('click', () => setIssueInRoute(eRow.dataset.key)));
    const oBoard = oState.aBoards.find((oItem) => oItem.sId === oFresh.sBoardId) || null;
    const oActions = {
      complete: () => openCompleteSprint({ oSprint: oFresh, aSprints: oState.aSprints, aBoards: oState.aBoards }),
      start: () => openSprintEditor({ oProject, oBoard, oSprint: oFresh, aSprints: oState.aSprints, sMode: 'start' }),
      edit: () => openSprintEditor({ oProject, oBoard, oSprint: oFresh, aSprints: oState.aSprints, sMode: 'edit' }),
      cancel: () => confirmCancelSprint(oFresh),
      reopen: () => openReopenSprint(oFresh),
    };
    qsa('[data-action]', eDetail).forEach((eButton) => eButton.addEventListener('click', () => oActions[eButton.dataset.action]()));
  } catch (oError) {
    if (iEpoch === oState.iEpoch) renderError(eDetail, toFriendlyMessage(oError), () => renderDetail(oState, oSprint));
  }
}
