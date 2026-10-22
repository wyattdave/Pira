// Dependencies (Phase 4): "blocks" links drawn left → right so blockers come first. Scope: open issues, a sprint, a version
// or an epic's children. Links to issues outside the scope appear as dashed external nodes.
import { ISSUE_TYPES, SPRINT_STATE } from '../../config/app-config.js';
import { getIssueStatus, getSprintState, getVersionState, isFeatureEnabled, toFriendlyMessage, isDoneStatus } from '../domain.js';
import { oApp, data, on, setIssueInRoute, projectHash } from './context.js';
import { qs, qsa, escapeHtml, typeIcon, statusPill, skeletonRows, stateHtml, renderError } from './dom.js';

const NODE_WIDTH = 210;
const NODE_HEIGHT = 58;
const GAP_X = 70;
const GAP_Y = 16;
const PAD = 16;
const EPIC_TYPE = ISSUE_TYPES.find((oType) => oType.key === 'epic').value;
const oViewState = { sScope: 'open', sScopeId: '', bRelated: false };

const nodeX = (oNode) => PAD + oNode.iLevel * (NODE_WIDTH + GAP_X);
const nodeY = (oNode) => PAD + oNode.iRow * (NODE_HEIGHT + GAP_Y);

function edgePath(oFrom, oTo) {
  const iX1 = nodeX(oFrom) + NODE_WIDTH;
  const iY1 = nodeY(oFrom) + NODE_HEIGHT / 2;
  const iX2 = nodeX(oTo);
  const iY2 = nodeY(oTo) + NODE_HEIGHT / 2;
  const iBend = Math.max(36, Math.abs(iX2 - iX1) / 2);
  return `M${iX1},${iY1} C${iX1 + iBend},${iY1} ${iX2 - iBend},${iY2} ${iX2 - 4},${iY2}`;
}

function graphHtml(oGraph) {
  const oById = new Map(oGraph.aNodes.map((oNode) => [oNode.sId, oNode]));
  const iWidth = PAD * 2 + Math.max(1, oGraph.iLevels) * (NODE_WIDTH + GAP_X) - GAP_X;
  const iHeight = PAD * 2 + Math.max(1, oGraph.iRows) * (NODE_HEIGHT + GAP_Y) - GAP_Y;
  const sEdges = oGraph.aEdges.map((oEdge) => {
    const oFrom = oById.get(oEdge.sFromId);
    const oTo = oById.get(oEdge.sToId);
    if (!oFrom || !oTo) return '';
    const sClass = `dep-edge${oEdge.bBlocks ? '' : ' related'}${oEdge.bCycle ? ' cycle' : ''}${oEdge.bBlocks && !isDoneStatus(oFrom.iStatus) ? ' active' : ''}`;
    return `<path class="${sClass}" d="${edgePath(oFrom, oTo)}"${oEdge.bBlocks ? ' marker-end="url(#depArrow)"' : ''}><title>${escapeHtml(`${oFrom.sKey} ${oEdge.bBlocks ? 'blocks' : 'relates to'} ${oTo.sKey}`)}</title></path>`;
  }).join('');
  const sNodes = oGraph.aNodes.map((oNode) => `<button type="button" class="dep-node${oNode.bBlocked ? ' blocked' : ''}${oNode.bExternal ? ' external' : ''}${oNode.bCycle ? ' cycle' : ''}${isDoneStatus(oNode.iStatus) ? ' done' : ''}"
      data-key="${escapeHtml(oNode.sKey)}" style="left:${nodeX(oNode)}px;top:${nodeY(oNode)}px;width:${NODE_WIDTH}px;height:${NODE_HEIGHT}px"
      aria-label="${escapeHtml(`${oNode.sKey}: ${oNode.sSummary}. ${getIssueStatus(oNode.iStatus).label}${oNode.bBlocked ? '. Blocked' : ''}${oNode.bExternal ? '. Outside this scope' : ''}${oNode.bCycle ? '. In a blocking loop' : ''}`)}">
      <span class="dep-top">${typeIcon(oNode.iType, 14)}<b>${escapeHtml(oNode.sKey)}</b>${statusPill(oNode.iStatus)}</span><span class="dep-summary">${escapeHtml(oNode.sSummary)}</span></button>`).join('');
  return `<div class="dep-canvas" style="width:${iWidth}px;height:${iHeight}px">
    <svg class="dep-lines" width="${iWidth}" height="${iHeight}" aria-hidden="true"><defs><marker id="depArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${sEdges}</svg>
    ${sNodes}</div>`;
}

function linkListHtml(oGraph) {
  const oById = new Map(oGraph.aNodes.map((oNode) => [oNode.sId, oNode]));
  const aLines = oGraph.aEdges.map((oEdge) => `${(oById.get(oEdge.sFromId) || {}).sKey} ${oEdge.bBlocks ? 'blocks' : 'relates to'} ${(oById.get(oEdge.sToId) || {}).sKey}${oEdge.bCycle ? ' (loop)' : ''}`);
  return `<details class="definitions"><summary>Links as a list (${aLines.length})</summary><ul>${aLines.map((sLine) => `<li>${escapeHtml(sLine)}</li>`).join('')}</ul></details>`;
}

export function renderDependencies(eMain) {
  const oProject = oApp.oProject;
  const oState = { iEpoch: 0, aSprints: [], aVersions: [], aEpics: [] };
  eMain.innerHTML = `<div class="page-pad">
    <div class="crumbs"><a href="#/projects">Projects</a> / <a href="${escapeHtml(projectHash(oProject.sKey, 'overview'))}">${escapeHtml(oProject.sName)}</a></div>
    <div class="head"><h1>Dependencies</h1><div class="spacer"></div></div>
    <div class="toolbar" id="depToolbar"></div>
    <div class="dep-legend hint"><span><i class="dep-key blocked"></i> blocked by unfinished work</span><span><i class="dep-key external"></i> outside this scope</span><span><i class="dep-key cycle"></i> blocking loop</span><span>Arrows point from the blocker to the issue it blocks.</span></div>
    <div id="depBody">${skeletonRows(4, 'sk-row')}</div></div>`;

  function scopeItems() {
    if (oViewState.sScope === 'sprint') return oState.aSprints.map((oSprint) => [oSprint.sId, `${oSprint.sName} · ${getSprintState(oSprint.iState).label}`]);
    if (oViewState.sScope === 'version') return oState.aVersions.map((oVersion) => [oVersion.sId, `${oVersion.sName} · ${getVersionState(oVersion.iState).label}`]);
    if (oViewState.sScope === 'epic') return oState.aEpics.map((oEpic) => [oEpic.sId, `${oEpic.sKey} ${oEpic.sSummary}`]);
    return [];
  }

  function renderToolbar() {
    const aScopes = [['open', 'Open issues'], ['sprint', 'Sprint'], ...(isFeatureEnabled('releases') ? [['version', 'Version']] : []), ['epic', 'Epic']];
    const aItems = scopeItems();
    if (oViewState.sScope !== 'open' && !aItems.some(([sId]) => sId === oViewState.sScopeId)) oViewState.sScopeId = aItems.length ? aItems[0][0] : '';
    const eBar = qs('#depToolbar', eMain);
    eBar.innerHTML = `<label class="sr" for="depScope">Scope</label><select class="fsel active" id="depScope">${aScopes.map(([sValue, sText]) => `<option value="${sValue}"${sValue === oViewState.sScope ? ' selected' : ''}>${escapeHtml(sText)}</option>`).join('')}</select>
      ${oViewState.sScope !== 'open' ? `<label class="sr" for="depScopeItem">Which</label><select class="fsel" id="depScopeItem">${aItems.map(([sId, sText]) => `<option value="${escapeHtml(sId)}"${sId === oViewState.sScopeId ? ' selected' : ''}>${escapeHtml(sText)}</option>`).join('') || '<option value="">None available</option>'}</select>` : ''}
      <label class="check"><input type="checkbox" id="depRelated"${oViewState.bRelated ? ' checked' : ''}> Show "relates to" links</label>`;
    qs('#depScope', eBar).addEventListener('change', (oEvent) => { oViewState.sScope = oEvent.target.value; oViewState.sScopeId = ''; renderToolbar(); load(); });
    const eItem = qs('#depScopeItem', eBar);
    if (eItem) eItem.addEventListener('change', () => { oViewState.sScopeId = eItem.value; load(); });
    qs('#depRelated', eBar).addEventListener('change', (oEvent) => { oViewState.bRelated = oEvent.target.checked; load(); });
  }

  async function load() {
    const iEpoch = ++oState.iEpoch;
    const eBody = qs('#depBody', eMain);
    if (oViewState.sScope !== 'open' && !oViewState.sScopeId) {
      eBody.innerHTML = stateHtml({ sTitle: 'Nothing to show', sMessage: `This project has no ${oViewState.sScope}s yet.`, sIcon: '◇' });
      return;
    }
    eBody.innerHTML = skeletonRows(4, 'sk-row');
    try {
      const oGraph = await data().getDependencyGraph(oProject, { sScope: oViewState.sScope, sScopeId: oViewState.sScopeId, bIncludeRelated: oViewState.bRelated });
      if (iEpoch !== oState.iEpoch) return;
      if (!oGraph.aEdges.length) {
        eBody.innerHTML = stateHtml({ sTitle: 'No dependencies here', sMessage: oGraph.iScopeIssues ? `None of the ${oGraph.iScopeIssues} issue${oGraph.iScopeIssues === 1 ? '' : 's'} in this scope ${oViewState.bRelated ? 'are linked' : 'block or are blocked by another issue'}. Add links from an issue's Linked issues section.` : 'This scope has no issues.', sIcon: '◇' });
        return;
      }
      const aCycleKeys = oGraph.aNodes.filter((oNode) => oNode.bCycle).map((oNode) => oNode.sKey);
      const iBlocked = oGraph.aNodes.filter((oNode) => oNode.bBlocked && !oNode.bExternal).length;
      eBody.innerHTML = `${aCycleKeys.length ? `<div class="notice">These issues block each other in a loop, so none of them can finish first: ${escapeHtml(aCycleKeys.join(', '))}. Remove one of the links.</div>` : ''}
        ${oGraph.bTruncated ? '<div class="notice">This scope is large, so only part of it is shown. Pick a sprint, version or epic to narrow it.</div>' : ''}
        <p class="hint">${oGraph.aNodes.filter((oNode) => !oNode.bExternal).length} linked issue${oGraph.aNodes.length === 1 ? '' : 's'} · ${iBlocked} blocked · ${oGraph.iIsolated} without links not shown</p>
        <div class="dep-scroll">${graphHtml(oGraph)}</div>${linkListHtml(oGraph)}`;
      qsa('.dep-node', eBody).forEach((eNode) => eNode.addEventListener('click', () => setIssueInRoute(eNode.dataset.key)));
    } catch (oError) {
      if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), load);
    }
  }

  async function init() {
    const [aSprints, aVersions, oEpics] = await Promise.allSettled([
      data().listSprints(oProject.sId),
      isFeatureEnabled('releases') ? data().listVersions(oProject.sId) : Promise.resolve([]),
      data().listIssues({ oCriteria: { sProjectId: oProject.sId, aTypes: [EPIC_TYPE] }, aOrderBy: ['modifiedon desc'], iPageSize: 50 }),
    ]);
    const aStateOrder = [SPRINT_STATE.active, SPRINT_STATE.planned, SPRINT_STATE.completed, SPRINT_STATE.cancelled];
    oState.aSprints = aSprints.status === 'fulfilled'
      ? [...aSprints.value].reverse().sort((oA, oB) => aStateOrder.indexOf(oA.iState) - aStateOrder.indexOf(oB.iState)) : [];
    oState.aVersions = aVersions.status === 'fulfilled' ? aVersions.value : [];
    oState.aEpics = oEpics.status === 'fulfilled' ? oEpics.value.aIssues : [];
    renderToolbar();
    load();
  }
  init();
  const aUnsubscribe = [on('issue:changed', load), on('issue:created', load), on('issue:archived', load)];
  return () => { oState.iEpoch += 1; aUnsubscribe.forEach((fnUnsubscribe) => fnUnsubscribe()); };
}
