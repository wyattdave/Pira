// Phase 5: Power Platform solutions on epics (one per stage) and the solution-version check on stories.
// Environments and solutions are read live through the connectors as the signed-in user; the issue panel owns the hosts.
import { SOLUTION_STAGES, SOLUTION_STAGE_STORAGE_KEY } from '../../config/app-config.js';
import {
  epicSolutionsByStage, buildSolutionUrl, pickAutoSelectSource, filterEnvironments, toFriendlyMessage, formatRelativeTime,
  getSolutionStage, getSolutionStageByKey, isLinkedSolution, buildStoryVersionCheck, compareSolutionVersions,
} from '../domain.js';
import { data, setIssueInRoute } from './context.js';
import { qs, qsa, escapeHtml, showToast, openModal, skeletonRows, setBusy, confirmDialog, showFieldErrors } from './dom.js';
import { comboboxHtml, wireCombobox } from './pickers.js';

// fnContext() → { eHost, oIssue, bCanEdit, fnHistoryChanged } so renders always target the panel's current host element.
const oEpic = { sIssueId: '', aLinks: [], oLive: {}, bLoading: false, sError: '', iToken: 0, fnContext: null };
const oStory = { sIssueId: '', iStage: readStoredStage(), oResult: null, bLoading: false, sError: '', iToken: 0, fnContext: null };

function readStoredStage() {
  try {
    const oStage = getSolutionStageByKey(localStorage.getItem(SOLUTION_STAGE_STORAGE_KEY) || '');
    return oStage ? oStage.value : SOLUTION_STAGES[0].value;
  } catch (oError) {
    return SOLUTION_STAGES[0].value;
  }
}

function storeStage(iStage) {
  try {
    localStorage.setItem(SOLUTION_STAGE_STORAGE_KEY, getSolutionStage(iStage).key);
  } catch (oError) {
    // Local preference only; ignore storage failures.
  }
}

export function resetSolutionPanels() {
  oEpic.iToken += 1;
  oStory.iToken += 1;
  Object.assign(oEpic, { sIssueId: '', aLinks: [], oLive: {}, bLoading: false, sError: '' });
  Object.assign(oStory, { sIssueId: '', oResult: null, bLoading: false, sError: '' });
}

const currentContext = (oState) => {
  const oContext = oState.fnContext ? oState.fnContext() : null;
  return oContext && oContext.eHost && oContext.oIssue && oContext.oIssue.sId === oState.sIssueId ? oContext : null;
};

function formatModified(sIso) {
  if (!sIso) return '';
  const oDate = new Date(sIso);
  if (Number.isNaN(oDate.getTime())) return '';
  const sRelative = formatRelativeTime(sIso);
  const sDate = oDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `<span title="${escapeHtml(oDate.toLocaleString())}">${escapeHtml(sDate)}${/ago|now|today|yesterday/i.test(sRelative) ? ` (${escapeHtml(sRelative)})` : ''}</span>`;
}

function solutionLinkHtml(sEnvironmentId, sSolutionId, sName) {
  const sUrl = buildSolutionUrl(sEnvironmentId, sSolutionId);
  return sUrl
    ? `<a href="${escapeHtml(sUrl)}" target="_blank" rel="noopener noreferrer" title="Open the solution in Power Apps">${escapeHtml(sName)}</a>`
    : `<span class="sol-name">${escapeHtml(sName)}</span>`;
}

function wireIssueLinks(eHost) {
  qsa('[data-open-issue]', eHost).forEach((eLink) => eLink.addEventListener('click', (oEvent) => { oEvent.preventDefault(); setIssueInRoute(eLink.dataset.openIssue); }));
}

// ── Epic: one solution per stage ───────────────────────────────

export async function loadEpicSolutions(fnContext, { bRefresh = false } = {}) {
  const oContext = fnContext();
  if (!oContext || !oContext.oIssue) return;
  const iToken = ++oEpic.iToken;
  Object.assign(oEpic, { fnContext, sIssueId: oContext.oIssue.sId, bLoading: true, sError: '', oLive: bRefresh ? {} : oEpic.oLive });
  renderEpicSolutions();
  try {
    const aLinks = await data().listEpicSolutions(oContext.oIssue.sId, { bRefresh });
    if (iToken !== oEpic.iToken) return;
    oEpic.aLinks = aLinks;
  } catch (oError) {
    if (iToken !== oEpic.iToken) return;
    oEpic.sError = toFriendlyMessage(oError);
  }
  oEpic.bLoading = false;
  renderEpicSolutions();
  loadLiveSolutions(iToken, oEpic.aLinks.filter(isLinkedSolution), bRefresh);
}

// Each stage reads its own environment, so one slow or inaccessible environment never blocks the others.
async function loadLiveSolutions(iToken, aLinks, bRefresh) {
  aLinks.forEach((oLink) => { oEpic.oLive[oLink.iStage] = { bLoading: true }; });
  renderEpicSolutions();
  await Promise.all(aLinks.map(async (oLink) => {
    let oEntry;
    try {
      oEntry = { oSolution: await data().getLinkedSolution(oLink, { bRefresh }), sError: '' };
    } catch (oError) {
      oEntry = { oSolution: null, sError: toFriendlyMessage(oError) };
    }
    if (iToken !== oEpic.iToken) return;
    oEpic.oLive[oLink.iStage] = { ...oEntry, bLoading: false, sSolutionId: oLink.sSolutionId };
    renderEpicSolutions();
  }));
}

function liveVersionHtml(oLink) {
  const oLive = oEpic.oLive[oLink.iStage];
  const sSnapshot = `<span class="sol-version">${escapeHtml(oLink.sSolutionVersion ? `v${oLink.sSolutionVersion}` : 'version unknown')}</span>${oLink.sSolutionModifiedOn ? ` · modified ${formatModified(oLink.sSolutionModifiedOn)}` : ''}`;
  if (!oLive || oLive.bLoading || oLive.sSolutionId !== oLink.sSolutionId) return `<small>Reading the live version… Last known: ${sSnapshot}</small>`;
  if (oLive.sError) return `<small>${escapeHtml(oLive.sError)} Last known when linked: ${sSnapshot}</small>`;
  if (!oLive.oSolution) return '<span><span class="ver-pill missing">Not found in this environment</span></span>';
  const bChanged = compareSolutionVersions(oLive.oSolution.sVersion, oLink.sSolutionVersion) !== 0;
  return `<small><span class="sol-version">v${escapeHtml(oLive.oSolution.sVersion || '?')}</span> · modified ${formatModified(oLive.oSolution.sModifiedOn) || 'unknown'}${oLive.oSolution.bManaged ? ' · managed' : ''}${bChanged && oLink.sSolutionVersion ? ` · was v${escapeHtml(oLink.sSolutionVersion)} when linked` : ''}</small>`;
}

function stageRowHtml({ oStage, oLink, bLinked }, bCanEdit) {
  const sActions = bCanEdit
    ? (bLinked
      ? `<button class="btn btn-quiet" type="button" data-link-stage="${oStage.value}">Change</button><button class="btn btn-quiet" type="button" data-unlink-stage="${oStage.value}">Unlink</button>`
      : `<button class="btn btn-quiet" type="button" data-link-stage="${oStage.value}">+ Link solution</button>`)
    : '';
  const sMain = bLinked
    ? `${solutionLinkHtml(oLink.sEnvironmentId, oLink.sSolutionId, oLink.sSolutionName || oLink.sSolutionUniqueName)}
      <small>${escapeHtml(oLink.sSolutionUniqueName)} · ${escapeHtml(oLink.sEnvironmentName || 'Environment')}</small>${liveVersionHtml(oLink)}`
    : '<span class="hint">No solution linked</span>';
  return `<div class="sol-row"><span class="sol-stage">${escapeHtml(oStage.label)}</span><span class="sol-main">${sMain}</span><span class="sol-actions">${sActions}</span></div>`;
}

export function renderEpicSolutions() {
  const oContext = currentContext(oEpic);
  if (!oContext) return;
  const eHost = oContext.eHost;
  if (oEpic.sError) {
    eHost.innerHTML = `<p class="hint">${escapeHtml(oEpic.sError)} <button class="btn btn-quiet" type="button" id="solRetry">Try again</button></p>`;
    qs('#solRetry', eHost).addEventListener('click', () => loadEpicSolutions(oEpic.fnContext, { bRefresh: true }));
    return;
  }
  const bAny = oEpic.aLinks.some(isLinkedSolution);
  eHost.innerHTML = oEpic.bLoading && !oEpic.aLinks.length
    ? skeletonRows(2, 'sk-line')
    : `<div class="mini-rows">${epicSolutionsByStage(oEpic.aLinks).map((oEntry) => stageRowHtml(oEntry, oContext.bCanEdit)).join('')}</div>
      <div class="mini-actions">${bAny ? '<button class="btn btn-quiet" type="button" id="solRefresh">Refresh versions</button>' : ''}<span class="hint">Versions are read live from each environment with your access.</span></div>`;
  const eRefresh = qs('#solRefresh', eHost);
  if (eRefresh) eRefresh.addEventListener('click', () => loadEpicSolutions(oEpic.fnContext, { bRefresh: true }));
  qsa('[data-link-stage]', eHost).forEach((eButton) => eButton.addEventListener('click', () => openLinkDialog(Number(eButton.dataset.linkStage))));
  qsa('[data-unlink-stage]', eHost).forEach((eButton) => eButton.addEventListener('click', () => unlinkStage(Number(eButton.dataset.unlinkStage), eButton)));
}

function afterEpicChange(oContext, aLinks, bHistorySaved, sMessage) {
  oEpic.aLinks = aLinks;
  showToast(sMessage);
  if (!bHistorySaved) showToast('Saved, but the history entry could not be recorded.', { sKind: 'error' });
  if (oContext.fnHistoryChanged) oContext.fnHistoryChanged();
}

async function unlinkStage(iStage, eButton) {
  const oContext = currentContext(oEpic);
  const oStage = getSolutionStage(iStage);
  if (!oContext || !oStage) return;
  const bConfirmed = await confirmDialog({
    sTitle: `Unlink the ${oStage.label} solution?`, sMessage: 'The solution itself is not changed. Stories under this epic can no longer check their version against this stage until another solution is linked.',
    sConfirmLabel: 'Unlink', sKind: 'danger',
  });
  if (!bConfirmed) return;
  const iToken = oEpic.iToken;
  setBusy(eButton, true);
  try {
    const { aLinks, bHistorySaved } = await data().unlinkEpicSolution(oContext.oIssue, iStage);
    if (iToken !== oEpic.iToken) return;
    delete oEpic.oLive[iStage];
    afterEpicChange(oContext, aLinks, bHistorySaved, `${oStage.label} solution unlinked`);
    renderEpicSolutions();
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
    setBusy(eButton, false);
  }
}

const environmentOption = (oEnvironment) => ({
  sHtml: `<span class="combo-text">${escapeHtml(oEnvironment.sName)}<small class="hint"> ${escapeHtml(oEnvironment.sType || 'Environment')} · ${escapeHtml(oEnvironment.sUrl.replace(/^https:\/\//, ''))}</small></span>`,
});

const solutionOption = (oSolution) => ({
  sHtml: `<span class="combo-text">${escapeHtml(oSolution.sName)}<small class="hint"> ${escapeHtml(oSolution.sUniqueName)} · v${escapeHtml(oSolution.sVersion || '?')}${oSolution.bManaged ? ' · managed' : ''}</small></span>`,
});

// Searchable environment picker, then a searchable solution picker. Choosing an environment tries the SchemaName already
// linked for the nearest other stage first, so promoting Dev → Test → Stage → Prod is usually one click.
function openLinkDialog(iStage) {
  const oContext = currentContext(oEpic);
  const oStage = getSolutionStage(iStage);
  if (!oContext || !oStage) return;
  const oCurrent = oEpic.aLinks.find((oLink) => oLink.iStage === iStage && isLinkedSolution(oLink)) || null;
  const oPick = { oEnvironment: null, oSolution: null, iToken: 0 };
  const oModal = openModal({
    sTitle: `${oCurrent ? 'Change' : 'Link'} the ${oStage.label} solution for ${oContext.oIssue.sKey}`,
    sBodyHtml: `<div class="field"><span>Environment <b class="req">*</b></span>${comboboxHtml({ sId: 'solEnvInput', sLabel: 'Environment', sPlaceholder: 'Search environments by name, type or URL', sExtraClass: 'field-combo' })}
        <div id="solEnvPicked"></div><span class="err" data-error-for="sEnvironmentId"></span></div>
      <div class="field" id="solSolutionField" hidden><span>Solution <b class="req">*</b></span>${comboboxHtml({ sId: 'solSolutionInput', sLabel: 'Solution', sPlaceholder: 'Search solutions by display or schema name', sExtraClass: 'field-combo' })}
        <div id="solSolutionPicked"></div><span class="err" data-error-for="sSolutionId"></span></div>
      <p class="hint" id="solNote" aria-live="polite"></p>`,
    aActions: [
      { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
      { sLabel: 'Save', sKind: 'primary', fnClick: (oHandle, iIndex) => submitLink(oHandle, iIndex, iStage, oPick) },
    ],
  });
  const eRoot = oModal.eModal;
  const fnNote = (sText) => { qs('#solNote', eRoot).textContent = sText; };
  const fnRenderSolution = () => {
    const oSolution = oPick.oSolution;
    qs('#solSolutionPicked', eRoot).innerHTML = oSolution
      ? `<div class="picked">${solutionLinkHtml(oPick.oEnvironment.sId, oSolution.sId, oSolution.sName)}<small>${escapeHtml(oSolution.sUniqueName)}</small><span class="sol-version">v${escapeHtml(oSolution.sVersion || '?')}</span><small>modified ${formatModified(oSolution.sModifiedOn) || 'unknown'}</small></div>`
      : '';
  };
  const fnSelectSolution = (oSolution) => {
    oPick.oSolution = oSolution;
    showFieldErrors(eRoot, {});
    fnRenderSolution();
  };
  const fnSelectEnvironment = async (oEnvironment) => {
    const iToken = ++oPick.iToken;
    Object.assign(oPick, { oEnvironment, oSolution: null });
    showFieldErrors(eRoot, {});
    qs('#solEnvPicked', eRoot).innerHTML = `<div class="picked"><b>${escapeHtml(oEnvironment.sName)}</b><small>${escapeHtml(oEnvironment.sType)} · ${escapeHtml(oEnvironment.sUrl.replace(/^https:\/\//, ''))}</small></div>`;
    qs('#solEnvInput', eRoot).value = '';
    qs('#solSolutionField', eRoot).hidden = false;
    qs('#solSolutionInput', eRoot).value = '';
    fnRenderSolution();
    const oSource = pickAutoSelectSource(oEpic.aLinks, iStage);
    if (!oSource) { fnNote(''); return; }
    const sUniqueName = oSource.sSolutionUniqueName;
    fnNote(`Looking for ${sUniqueName} in ${oEnvironment.sName}…`);
    try {
      const oFound = await data().findSolution(oEnvironment, { sUniqueName });
      if (iToken !== oPick.iToken) return;
      if (oFound) {
        fnSelectSolution(oFound);
        fnNote(`Selected automatically: it has the same schema name (${sUniqueName}) as the ${getSolutionStage(oSource.iStage).label} solution.`);
      } else {
        fnNote(`No solution with the schema name ${sUniqueName} in ${oEnvironment.sName}. Pick one below.`);
        qs('#solSolutionInput', eRoot).focus();
      }
    } catch (oError) {
      if (iToken === oPick.iToken) fnNote(toFriendlyMessage(oError));
    }
  };
  wireCombobox(qs('#solEnvInput', eRoot), {
    fnSearch: async (sText) => filterEnvironments(await data().listEnvironments(), sText),
    fnOption: environmentOption, fnSelect: fnSelectEnvironment, iMinChars: 0, sEmpty: 'No environments with Dataverse match.',
  });
  wireCombobox(qs('#solSolutionInput', eRoot), {
    fnSearch: (sText) => (oPick.oEnvironment ? data().searchSolutions(oPick.oEnvironment, sText) : Promise.resolve([])),
    fnOption: solutionOption, fnSelect: fnSelectSolution, iMinChars: 0, sEmpty: 'No visible solutions match.',
  });
  if (oCurrent) {
    oPick.oEnvironment = { sId: oCurrent.sEnvironmentId, sName: oCurrent.sEnvironmentName, sUrl: oCurrent.sEnvironmentUrl, sType: '' };
    qs('#solEnvPicked', eRoot).innerHTML = `<div class="picked"><b>${escapeHtml(oCurrent.sEnvironmentName)}</b><small>${escapeHtml(oCurrent.sEnvironmentUrl.replace(/^https:\/\//, ''))} · currently linked</small></div>`;
    qs('#solSolutionField', eRoot).hidden = false;
    fnSelectSolution({ sId: oCurrent.sSolutionId, sUniqueName: oCurrent.sSolutionUniqueName, sName: oCurrent.sSolutionName, sVersion: oCurrent.sSolutionVersion, sModifiedOn: oCurrent.sSolutionModifiedOn });
  }
}

async function submitLink(oHandle, iIndex, iStage, oPick) {
  const oErrors = {};
  if (!oPick.oEnvironment) oErrors.sEnvironmentId = 'Choose an environment.';
  else if (!oPick.oSolution) oErrors.sSolutionId = 'Choose a solution.';
  showFieldErrors(oHandle.eModal, oErrors);
  if (Object.keys(oErrors).length) return;
  const oContext = currentContext(oEpic);
  if (!oContext) { oHandle.close(null); return; }
  const iToken = oEpic.iToken;
  oHandle.setBusy(true, iIndex);
  try {
    const { aLinks, oSolution, bHistorySaved } = await data().linkEpicSolution(oContext.oIssue, iStage, oPick.oEnvironment, oPick.oSolution);
    oHandle.close(true);
    if (iToken !== oEpic.iToken) return;
    oEpic.oLive[iStage] = { oSolution, sError: '', bLoading: false, sSolutionId: oSolution.sId };
    afterEpicChange(oContext, aLinks, bHistorySaved, `${getSolutionStage(iStage).label} solution linked`);
    renderEpicSolutions();
  } catch (oError) {
    oHandle.setBusy(false, iIndex);
    if (oError.details) showFieldErrors(oHandle.eModal, oError.details);
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
  }
}

// ── Story: version check against one stage ─────────────────────

export async function loadStoryCheck(fnContext, { bRefresh = false } = {}) {
  const oContext = fnContext();
  if (!oContext || !oContext.oIssue) return;
  const iToken = ++oStory.iToken;
  Object.assign(oStory, { fnContext, sIssueId: oContext.oIssue.sId, bLoading: true, sError: '' });
  renderStoryCheck();
  try {
    const oResult = await data().getStoryVersionCheck(oContext.oIssue, oStory.iStage, { bRefresh });
    if (iToken !== oStory.iToken) return;
    oStory.oResult = oResult;
  } catch (oError) {
    if (iToken !== oStory.iToken) return;
    Object.assign(oStory, { oResult: null, sError: toFriendlyMessage(oError) });
  }
  oStory.bLoading = false;
  renderStoryCheck();
}

function storyResultHtml(oIssue) {
  if (oStory.sError) return `<p class="hint">${escapeHtml(oStory.sError)}</p>`;
  const oResult = oStory.oResult;
  if (!oResult) return '';
  // Re-evaluated on every render so a saved version change shows straight away.
  const oCheck = buildStoryVersionCheck({
    sExpected: oIssue.sSolutionVersion, bHasEpic: Boolean(oResult.oEpic), oLink: oResult.oLink, oSolution: oResult.oSolution, bFailed: Boolean(oResult.sError),
  });
  const sStage = getSolutionStage(oStory.iStage).label;
  const sPill = ['match', 'older', 'newer', 'missing'].includes(oCheck.sState)
    ? `<span class="ver-pill ${oCheck.sState}">${oCheck.sState === 'match' ? '✓' : '✗'} ${escapeHtml(oCheck.sLabel)}</span>`
    : `<span class="ver-pill">${escapeHtml(oCheck.sLabel)}</span>`;
  const sVersions = `<div class="ver-check-row"><span>Story needs <b>${escapeHtml(oIssue.sSolutionVersion || 'not set')}</b></span>
    <span>${escapeHtml(sStage)} has <b>${escapeHtml(oResult.oSolution ? oResult.oSolution.sVersion || '?' : '—')}</b></span>${sPill}</div>`;
  const oLink = oResult.oLink;
  const sSource = oResult.oEpic
    ? `<div class="ver-check-row"><span>Epic <a class="key-strong" href="#" data-open-issue="${escapeHtml(oResult.oEpic.sKey)}">${escapeHtml(oResult.oEpic.sKey)}</a></span>
      ${oLink ? `<span>${solutionLinkHtml(oLink.sEnvironmentId, oLink.sSolutionId, oLink.sSolutionName || oLink.sSolutionUniqueName)} in ${escapeHtml(oLink.sEnvironmentName)}</span>` : ''}
      ${oResult.oSolution ? `<span class="hint">modified ${formatModified(oResult.oSolution.sModifiedOn) || 'unknown'}</span>` : ''}</div>`
    : '';
  const sError = oResult.sError ? `<p class="hint">${escapeHtml(oResult.sError)}</p>` : '';
  return `<div class="ver-check">${sVersions}${sSource}${sError}</div>`;
}

export function renderStoryCheck() {
  const oContext = currentContext(oStory);
  if (!oContext) return;
  const eHost = oContext.eHost;
  const sTabs = `<div class="mini-tabs" role="tablist" aria-label="Stage to check">${SOLUTION_STAGES.map((oStage) => `<button type="button" role="tab" data-check-stage="${oStage.value}" aria-selected="${oStage.value === oStory.iStage}">${escapeHtml(oStage.label)}</button>`).join('')}</div>`;
  eHost.innerHTML = `${sTabs}${oStory.bLoading ? skeletonRows(2, 'sk-line') : storyResultHtml(oContext.oIssue)}
    <div class="mini-actions"><button class="btn btn-quiet" type="button" id="verRefresh"${oStory.bLoading ? ' disabled' : ''}>Refresh</button><span class="hint">Compares the saved solution version with the epic's solution in that stage.</span></div>`;
  qsa('[data-check-stage]', eHost).forEach((eTab) => eTab.addEventListener('click', () => {
    oStory.iStage = Number(eTab.dataset.checkStage);
    storeStage(oStory.iStage);
    loadStoryCheck(oStory.fnContext);
  }));
  qs('#verRefresh', eHost).addEventListener('click', () => loadStoryCheck(oStory.fnContext, { bRefresh: true }));
  wireIssueLinks(eHost);
}
