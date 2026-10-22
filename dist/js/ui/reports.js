// Reports (Phase 4): lead/cycle time, throughput, overdue trend, sprint outcomes and time tracking for one project.
// Calculated from issues the signed-in user can read; definitions are shown on the page and in docs/phase-4-design.md.
import { ANALYTICS } from '../../config/app-config.js';
import { formatDateOnly, formatDuration, formatRelativeTime, toFriendlyMessage, isFeatureEnabled } from '../domain.js';
import { oApp, data, projectHash } from './context.js';
import { qs, escapeHtml, skeletonRows, renderError, barChartHtml } from './dom.js';

const oReportState = { iWeeks: ANALYTICS.iDefaultWeeks, bPoints: false };

const DEFINITIONS = Object.freeze([
  ['Lead time', 'Created → resolved, in days, for issues resolved in the window that are still done.'],
  ['Cycle time', 'First moved to an in-progress status → resolved. Issues that went straight to done are left out and counted separately.'],
  ['Median / 85th percentile', 'Half of the issues took up to the median; 85% took up to the 85th percentile (nearest-rank).'],
  ['Throughput', 'Issues (or story points) resolved per week, Monday to Sunday. The last week is the current, partial week.'],
  ['Overdue trend', 'Open issues with a due date before the end of each week. Uses today\'s due dates and resolution dates, so moved due dates and reopened issues count as they are now.'],
  ['Sprint outcomes', 'Completed sprints: committed = snapshot when the sprint started; completed = done when it was completed. Say/do = completed points ÷ committed points.'],
  ['Estimate accuracy', 'Time spent ÷ original estimate for resolved issues that had an estimate. 100% = spot on; above 100% = took longer.'],
  ['Scope', 'Archived issues are excluded. Up to 2,000 issues per query; the page says so if a limit was reached.'],
]);

const days = (fValue) => (fValue === null ? '—' : `${fValue}d`);
const weekLabel = (oBucket) => formatDateOnly(oBucket.sStart).replace(/ \d{4}$/, '');
const issuesText = (iCount) => `${iCount} issue${iCount === 1 ? '' : 's'}`;

function statTile(sLabel, sValue, sHint) {
  return `<div class="tile stat"><small>${escapeHtml(sLabel)}</small><b>${escapeHtml(sValue)}</b><span class="hint">${escapeHtml(sHint)}</span></div>`;
}

function sprintTable(aOutcomes) {
  if (!aOutcomes.length) return '<p class="hint">No completed sprints yet.</p>';
  return `<table class="grid"><thead><tr><th scope="col">Sprint</th><th scope="col">Committed</th><th scope="col">Completed</th><th scope="col">Incomplete</th><th scope="col">Say/do</th></tr></thead>
    <tbody>${aOutcomes.map((oSprint) => `<tr><td>${escapeHtml(oSprint.sName)}<br><small class="hint">${escapeHtml(formatDateOnly(String(oSprint.sCompletedOn).slice(0, 10)))}</small></td>
      <td>${issuesText(oSprint.iCommittedIssues)} · ${oSprint.iCommittedPoints} pts</td><td>${issuesText(oSprint.iCompletedIssues)} · ${oSprint.iCompletedPoints} pts</td>
      <td>${issuesText(oSprint.iIncompleteIssues)} · ${oSprint.iIncompletePoints} pts</td>
      <td>${oSprint.fSayDo === null ? '<span class="hint">no committed points</span>' : `<span class="progress-line compact"><span class="bar" aria-hidden="true"><i style="width:${Math.min(100, oSprint.fSayDo)}%"></i></span><b>${oSprint.fSayDo}%</b></span>`}</td></tr>`).join('')}</tbody></table>`;
}

function timeTiles(oTime) {
  return `<div class="cards-grid">
    ${statTile('Open: remaining', formatDuration(oTime.iOpenRemaining) || '0m', `${formatDuration(oTime.iOpenOriginal) || '0m'} originally estimated`)}
    ${statTile('Open: logged so far', formatDuration(oTime.iOpenSpent) || '0m', `${oTime.iOpenUnestimated} open issue${oTime.iOpenUnestimated === 1 ? '' : 's'} not estimated`)}
    ${statTile('Logged on resolved issues', formatDuration(oTime.iResolvedSpent) || '0m', 'In this window')}
    ${statTile('Estimate accuracy', oTime.fAccuracy === null ? '—' : `${oTime.fAccuracy}%`, `${oTime.iEstimatedIssues} resolved issue${oTime.iEstimatedIssues === 1 ? '' : 's'} with an estimate`)}</div>`;
}

export function renderReports(eMain) {
  const oProject = oApp.oProject;
  const oState = { iEpoch: 0, oReport: null };
  eMain.innerHTML = `<div class="page-pad">
    <div class="crumbs"><a href="#/projects">Projects</a> / <a href="${escapeHtml(projectHash(oProject.sKey, 'overview'))}">${escapeHtml(oProject.sName)}</a></div>
    <div class="head"><h1>Reports</h1><span class="hint" id="reportsGenerated"></span><div class="spacer"></div>
      <label class="sr" for="reportsWindow">Reporting window</label><select class="fsel active" id="reportsWindow">${ANALYTICS.aWindows.map((iWeeks) => `<option value="${iWeeks}"${iWeeks === oReportState.iWeeks ? ' selected' : ''}>Last ${iWeeks} weeks</option>`).join('')}</select></div>
    <details class="definitions page-section"><summary>How these are calculated</summary><ul>${DEFINITIONS.map(([sTerm, sText]) => `<li><b>${escapeHtml(sTerm)}:</b> ${escapeHtml(sText)}</li>`).join('')}
      <li><b>Security:</b> every figure is calculated from issues you can read in Pira. For cross-project reporting in Power BI, connect as each viewer (not a shared service account) so Dataverse security still applies.</li></ul></details>
    <div id="reportsBody">${skeletonRows(4, 'tile skeleton')}</div></div>`;

  async function load() {
    const iEpoch = ++oState.iEpoch;
    const eBody = qs('#reportsBody', eMain);
    eBody.innerHTML = `<div class="cards-grid">${skeletonRows(4, 'tile skeleton')}</div>${skeletonRows(3, 'sk-card')}`;
    try {
      const oReport = await data().getAnalytics(oProject, { iWeeks: oReportState.iWeeks });
      if (iEpoch !== oState.iEpoch) return;
      oState.oReport = oReport;
      renderReport(eBody);
    } catch (oError) {
      if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), load);
    }
  }

  function renderReport(eBody) {
    const oReport = oState.oReport;
    qs('#reportsGenerated', eMain).textContent = `Updated ${formatRelativeTime(oReport.sGeneratedOn)}`;
    const iResolved = oReport.aThroughput.reduce((iSum, oBucket) => iSum + oBucket.iIssues, 0);
    const iPoints = oReport.aThroughput.reduce((iSum, oBucket) => iSum + oBucket.iPoints, 0);
    const oLatestOverdue = oReport.aOverdue[oReport.aOverdue.length - 1] || { iOverdue: 0 };
    const aThroughputBars = oReport.aThroughput.map((oBucket) => ({
      sLabel: weekLabel(oBucket), iValue: oReportState.bPoints ? oBucket.iPoints : oBucket.iIssues,
      sTitle: `Week of ${formatDateOnly(oBucket.sStart)}${oBucket.bCurrent ? ' (so far)' : ''}: ${oBucket.iIssues} issues, ${oBucket.iPoints} points`,
    }));
    eBody.innerHTML = `${oReport.bTruncated ? '<div class="notice">This project has more issues than one report reads, so some figures only cover the first 2,000 matching issues.</div>' : ''}
      <div class="cards-grid page-section">
        ${statTile('Lead time (median)', days(oReport.oLeadTime.fMedian), `85th percentile ${days(oReport.oLeadTime.fP85)} · ${oReport.oLeadTime.iCount} issues`)}
        ${statTile('Cycle time (median)', days(oReport.oCycleTime.fMedian), `85th percentile ${days(oReport.oCycleTime.fP85)} · ${oReport.oCycleTime.iCount} issues${oReport.oCycleTime.iNotStarted ? ` (${oReport.oCycleTime.iNotStarted} never started)` : ''}`)}
        ${statTile('Resolved', String(iResolved), `${iPoints} points · ${Math.round((iResolved / oReport.iWeeks) * 10) / 10} per week`)}
        ${statTile('Overdue now', String(oLatestOverdue.iOverdue), 'Open issues past their due date')}
      </div>
      <div class="overview-grid page-section">
        <section><div class="sec-t">Throughput <span class="mini-tabs" role="group" aria-label="Throughput measure" style="display:inline-flex;margin-left:8px">
          <button type="button" data-measure="issues" aria-pressed="${!oReportState.bPoints}" aria-selected="${!oReportState.bPoints}">Issues</button><button type="button" data-measure="points" aria-pressed="${oReportState.bPoints}" aria-selected="${oReportState.bPoints}">Points</button></span></div>
          <div class="tile">${barChartHtml(aThroughputBars, { sEmpty: 'Nothing resolved in this window.' })}</div></section>
        <section><div class="sec-t">Overdue trend (end of week)</div>
          <div class="tile">${barChartHtml(oReport.aOverdue.map((oBucket) => ({ sLabel: weekLabel(oBucket), iValue: oBucket.iOverdue, sTitle: `${oBucket.iOverdue} overdue at the end of ${formatDateOnly(oBucket.sSnapshotDay)}` })), { sEmpty: 'Nothing was overdue in this window.' })}</div></section>
      </div>
      <section class="page-section"><div class="sec-t">Sprint outcomes</div>${sprintTable(oReport.aSprintOutcomes)}</section>
      ${isFeatureEnabled('timeTracking') ? `<section class="page-section"><div class="sec-t">Time tracking</div>${timeTiles(oReport.oTime)}</section>` : ''}`;
    eBody.querySelectorAll('[data-measure]').forEach((eButton) => eButton.addEventListener('click', () => { oReportState.bPoints = eButton.dataset.measure === 'points'; renderReport(eBody); }));
  }
  qs('#reportsWindow', eMain).addEventListener('change', (oEvent) => { oReportState.iWeeks = Number(oEvent.target.value); load(); });
  load();
  return () => { oState.iEpoch += 1; };
}
