// Pira boot, shell, routing and global shortcuts.
import { THEME_STORAGE_KEY, SEARCH_DELAY_MS, PROJECT_TYPES } from './config/app-config.js';
import { getProjectPermissions, parseIssueKey, toFriendlyMessage, getInitials, isFeatureEnabled } from './js/domain.js';
import {
  oApp, data, on, parseHash, projectHash, setIssueInRoute, findMembership, refreshMemberships, rememberProject, readRecentProjectKeys,
} from './js/ui/context.js';
import {
  qs, qsa, escapeHtml, ICONS, projectAvatar, stateHtml, renderError, setCurrentUserId, debounce, typeIcon, statusPill, closeMenu, skeletonRows, confirmDialog,
} from './js/ui/dom.js';
import {
  openIssuePanel, closeIssuePanel, isPanelOpen, focusCommentComposer, refreshPanelIssue, getOpenIssueKey, hasUnsavedChanges, discardPanelChanges,
} from './js/ui/issue-panel.js';
import { openCreateIssue } from './js/ui/create-issue.js';
import { renderBoard } from './js/ui/board.js';
import { renderBacklog } from './js/ui/backlog.js';
import { renderSprints } from './js/ui/sprints.js';
import { renderYourWork, renderIssueList } from './js/ui/lists.js';
import { renderProjects, renderOverview } from './js/ui/projects.js';
import { renderSettings } from './js/ui/project-settings.js';
import { initNotifications } from './js/ui/notifications.js';
import { renderReleases } from './js/ui/releases.js';
import { renderReports } from './js/ui/reports.js';
import { renderDependencies } from './js/ui/dependencies.js';
import { resolveLaunchHash } from './js/ui/deep-link.js';

// Phase 4 views are only routed when their feature is on.
const FEATURE_VIEWS = Object.freeze({ releases: 'releases', reports: 'analytics', dependencies: 'dependencies' });

const VIEW_RENDERERS = Object.freeze({
  'your-work': renderYourWork, projects: renderProjects, board: renderBoard, backlog: renderBacklog, sprints: renderSprints,
  issues: renderIssueList, overview: renderOverview, settings: renderSettings,
  releases: renderReleases, reports: renderReports, dependencies: renderDependencies,
});
const VIEW_TITLES = Object.freeze({
  'your-work': 'Your work', projects: 'Projects', board: 'Board', backlog: 'Backlog', sprints: 'Sprints', issues: 'Issues', overview: 'Overview', settings: 'Project settings',
  releases: 'Releases', reports: 'Reports', dependencies: 'Dependencies',
});
const isViewEnabled = (sView) => !FEATURE_VIEWS[sView] || isFeatureEnabled(FEATURE_VIEWS[sView]);

let fnCleanupView = null;
let sRenderedViewKey = '';
let iRouteEpoch = 0;

// ── Theme ──────────────────────────────────────────────────────

function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch (oError) {
    return 'dark';
  }
}

function applyTheme(sTheme, bPersist) {
  document.documentElement.dataset.theme = sTheme;
  qs('#themeToggle').setAttribute('aria-label', sTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  if (!bPersist) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, sTheme);
  } catch (oError) {
    // Preference only; storage may be blocked in some hosts.
  }
}

// ── Data service ───────────────────────────────────────────────

async function loadDataService() {
  const bLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const bMock = bLocal && new URLSearchParams(window.location.search).has('mock');
  const oService = bMock ? await import('../agent/dev/mock-data-service.js') : await import('./js/data-service.js');
  oService.initialise();
  return oService;
}

// ── Sidebar & top bar ──────────────────────────────────────────

function sideLink(sHref, sIcon, sLabel, bCurrent) {
  return `<a class="side-link" href="${escapeHtml(sHref)}"${bCurrent ? ' aria-current="page"' : ''}>${sIcon}<span>${escapeHtml(sLabel)}</span></a>`;
}

function renderSidebar(oRoute) {
  const eSide = qs('#sideNav');
  const oProject = oApp.oProject;
  const sCollapse = '<button class="collapse" type="button" id="sideCollapse" aria-label="Collapse sidebar" aria-expanded="true">‹</button>';
  if (oRoute.sProjectKey && oProject) {
    const sType = (PROJECT_TYPES.find((oType) => oType.value === oProject.iType) || PROJECT_TYPES[0]).label;
    eSide.innerHTML = `
      <div class="proj">${projectAvatar(oProject.sKey)}<div style="min-width:0"><strong title="${escapeHtml(oProject.sName)}">${escapeHtml(oProject.sName)}</strong><small>${escapeHtml(sType)} project${oProject.bArchived ? ' · Archived' : ''}</small></div></div>
      <h4>Planning</h4>
      ${sideLink(projectHash(oProject.sKey, 'board'), ICONS.board, 'Board', oRoute.sView === 'board')}
      ${sideLink(projectHash(oProject.sKey, 'backlog'), ICONS.backlog, 'Backlog', oRoute.sView === 'backlog')}
      ${sideLink(projectHash(oProject.sKey, 'sprints'), ICONS.sprint, 'Sprints', oRoute.sView === 'sprints')}
      ${isViewEnabled('releases') ? sideLink(projectHash(oProject.sKey, 'releases'), ICONS.release, 'Releases', oRoute.sView === 'releases') : ''}
      ${sideLink(projectHash(oProject.sKey, 'issues'), ICONS.list, 'Issues', oRoute.sView === 'issues')}
      ${isViewEnabled('dependencies') ? sideLink(projectHash(oProject.sKey, 'dependencies'), ICONS.dependencies, 'Dependencies', oRoute.sView === 'dependencies') : ''}
      ${sideLink(projectHash(oProject.sKey, 'overview'), ICONS.overview, 'Overview', oRoute.sView === 'overview')}
      ${isViewEnabled('reports') ? sideLink(projectHash(oProject.sKey, 'reports'), ICONS.reports, 'Reports', oRoute.sView === 'reports') : ''}
      <h4>Team</h4>
      ${sideLink(projectHash(oProject.sKey, 'settings', 'members'), ICONS.members, 'Members', oRoute.sView === 'settings' && oRoute.sTab === 'members')}
      <div class="side-sep"></div>
      ${sideLink(projectHash(oProject.sKey, 'settings', 'details'), ICONS.settings, 'Project settings', oRoute.sView === 'settings' && oRoute.sTab !== 'members')}
      ${sideLink('#/projects', ICONS.folder, 'All projects', false)}
      ${sCollapse}`;
  } else {
    const aRecent = readRecentProjectKeys();
    eSide.innerHTML = `
      <h4>Pira</h4>
      ${sideLink('#/your-work', ICONS.home, 'Your work', oRoute.sView === 'your-work')}
      ${sideLink('#/projects', ICONS.folder, 'Projects', oRoute.sView === 'projects')}
      ${aRecent.length ? `<h4>Recent</h4>${aRecent.map((sKey) => `<a class="side-link" href="${escapeHtml(projectHash(sKey, 'board'))}">${projectAvatar(sKey, 'sm')}<span>${escapeHtml(sKey)}</span></a>`).join('')}` : ''}
      ${sCollapse}`;
  }
  const eCollapse = qs('#sideCollapse', eSide);
  const bCollapsed = qs('#shell').classList.contains('collapsed');
  eCollapse.setAttribute('aria-expanded', String(!bCollapsed));
  eCollapse.setAttribute('aria-label', bCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
  eCollapse.addEventListener('click', () => {
    const bNowCollapsed = qs('#shell').classList.toggle('collapsed');
    eCollapse.setAttribute('aria-expanded', String(!bNowCollapsed));
    eCollapse.setAttribute('aria-label', bNowCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
  });
}

function updateTopNav(oRoute) {
  qsa('.topnav [data-nav]').forEach((eLink) => {
    const bCurrent = eLink.dataset.nav === 'projects' ? Boolean(oRoute.sProjectKey) || oRoute.sView === 'projects' : oRoute.sView === eLink.dataset.nav;
    if (bCurrent) eLink.setAttribute('aria-current', 'page');
    else eLink.removeAttribute('aria-current');
  });
}

// ── Global search ──────────────────────────────────────────────

function wireGlobalSearch() {
  const eInput = qs('#globalSearch');
  const eWrap = eInput.closest('.search-wrap');
  const eResults = document.createElement('div');
  eResults.className = 'menu';
  eResults.id = 'globalSearchResults';
  eResults.setAttribute('role', 'listbox');
  eResults.hidden = true;
  eResults.style.cssText = 'position:absolute;top:calc(100% + 6px);right:0;width:min(440px,90vw);max-height:60vh;overflow:auto';
  eWrap.appendChild(eResults);
  let aKeys = [];
  let iActive = -1;
  const fnHide = () => { eResults.hidden = true; eInput.setAttribute('aria-expanded', 'false'); iActive = -1; };
  const fnHighlight = () => qsa('[role="option"]', eResults).forEach((eOption, iIndex) => eOption.setAttribute('aria-selected', String(iIndex === iActive)));
  const fnOpen = (sKey) => { fnHide(); eInput.value = ''; eInput.blur(); setIssueInRoute(sKey); };
  const fnSearch = debounce(async () => {
    const sText = eInput.value.trim();
    if (!sText) { fnHide(); return; }
    eResults.innerHTML = `<div class="menu-h">Searching…</div>${skeletonRows(2, 'sk-line')}`;
    eResults.hidden = false;
    eInput.setAttribute('aria-expanded', 'true');
    try {
      const { aIssues } = await data().searchIssues(sText);
      if (eInput.value.trim() !== sText) return;
      aKeys = aIssues.map((oIssue) => oIssue.sKey);
      iActive = aIssues.length ? 0 : -1;
      eResults.innerHTML = aIssues.length
        ? `<div class="menu-h">Issues</div>${aIssues.map((oIssue) => `<button type="button" role="option" data-key="${escapeHtml(oIssue.sKey)}" aria-selected="false">${typeIcon(oIssue.iType)}<span style="min-width:0;flex:1"><span class="key">${escapeHtml(oIssue.sKey)}</span> ${escapeHtml(oIssue.sSummary)}</span>${statusPill(oIssue.iStatus)}</button>`).join('')}`
        : `<div class="menu-empty">No issues match “${escapeHtml(sText)}”.</div>`;
      fnHighlight();
      qsa('[role="option"]', eResults).forEach((eOption) => eOption.addEventListener('mousedown', (oEvent) => { oEvent.preventDefault(); fnOpen(eOption.dataset.key); }));
    } catch (oError) {
      eResults.innerHTML = `<div class="menu-empty">${escapeHtml(toFriendlyMessage(oError))}</div>`;
    }
  }, SEARCH_DELAY_MS);
  eInput.addEventListener('input', fnSearch);
  eInput.addEventListener('blur', () => setTimeout(fnHide, 150));
  eInput.addEventListener('keydown', (oEvent) => {
    if (oEvent.key === 'Escape') { fnHide(); eInput.blur(); }
    if (oEvent.key === 'ArrowDown' && aKeys.length) { oEvent.preventDefault(); iActive = (iActive + 1) % aKeys.length; fnHighlight(); }
    if (oEvent.key === 'ArrowUp' && aKeys.length) { oEvent.preventDefault(); iActive = (iActive - 1 + aKeys.length) % aKeys.length; fnHighlight(); }
    if (oEvent.key === 'Enter') {
      oEvent.preventDefault();
      const oKey = parseIssueKey(eInput.value);
      if (!eResults.hidden && iActive >= 0 && aKeys[iActive]) fnOpen(aKeys[iActive]);
      else if (oKey) fnOpen(`${oKey.sProjectKey}-${oKey.iSequence}`);
    }
  });
}

// ── Routing ────────────────────────────────────────────────────

async function loadProjectContext(sKey) {
  const oProject = await data().getProjectByKey(sKey);
  let oMembership = findMembership(oProject.sId);
  if (!oMembership) {
    await refreshMemberships();
    oMembership = findMembership(oProject.sId);
  }
  oApp.oProject = oProject;
  oApp.oMembership = oMembership;
  oApp.oPermissions = getProjectPermissions(oMembership, oProject.bArchived);
}

// Staged issue edits are never dropped silently: switching or closing the issue asks first.
async function syncIssuePanel(oRoute) {
  const sTarget = String(oRoute.sIssueKey || '').toUpperCase();
  const sOpen = getOpenIssueKey();
  if (sOpen && sTarget !== sOpen && hasUnsavedChanges()) {
    const bDiscard = await confirmDialog({ sTitle: 'Discard unsaved changes?', sMessage: `Your edits to ${sOpen} haven't been saved.`, sConfirmLabel: 'Discard changes', sKind: 'danger' });
    if (!bDiscard) {
      setIssueInRoute(sOpen);
      return;
    }
    discardPanelChanges();
  }
  if (sTarget) openIssuePanel(sTarget);
  else if (isPanelOpen()) closeIssuePanel();
}

async function renderRoute() {
  const oRoute = parseHash(window.location.hash);
  const iEpoch = ++iRouteEpoch;
  oApp.oRoute = oRoute;
  updateTopNav(oRoute);
  const sViewKey = `${oRoute.sView}|${oRoute.sProjectKey || ''}|${oRoute.sTab || ''}`;
  if (sViewKey !== sRenderedViewKey) {
    closeMenu();
    if (fnCleanupView) fnCleanupView();
    fnCleanupView = null;
    sRenderedViewKey = sViewKey;
    const eMain = qs('#main');
    eMain.classList.remove('board-mode');
    if (oRoute.sProjectKey) {
      if (!oApp.oProject || oApp.oProject.sKey !== oRoute.sProjectKey) {
        oApp.oProject = null;
        eMain.innerHTML = `<div class="page-pad">${skeletonRows(1, 'sk-line')}${skeletonRows(4, 'sk-row')}</div>`;
        renderSidebar(oRoute);
      }
      try {
        await loadProjectContext(oRoute.sProjectKey);
      } catch (oError) {
        if (iEpoch !== iRouteEpoch) return;
        oApp.oProject = null;
        renderSidebar(oRoute);
        eMain.innerHTML = stateHtml({ sTitle: 'Project unavailable', sMessage: toFriendlyMessage(oError), sIcon: '!', bFull: true });
        sRenderedViewKey = '';
        syncIssuePanel(oRoute);
        return;
      }
      if (iEpoch !== iRouteEpoch) return;
      rememberProject(oApp.oProject.sKey);
    } else {
      oApp.oProject = null;
      oApp.oMembership = null;
      oApp.oPermissions = getProjectPermissions(null);
    }
    renderSidebar(oRoute);
    const fnRender = isViewEnabled(oRoute.sView) ? VIEW_RENDERERS[oRoute.sView] : null;
    if (!fnRender) {
      eMain.innerHTML = stateHtml({ sTitle: 'Page not found', sMessage: 'That link does not match anything in Pira.', sIcon: '?', bFull: true });
    } else if (oRoute.sProjectKey && !oApp.oPermissions.bCanView && oRoute.sView !== 'settings') {
      eMain.innerHTML = stateHtml({ sTitle: 'You do not have access to this project', sMessage: `Ask ${oApp.oProject.sLeadName || 'a project lead'} to add you as a member.`, sIcon: '⊘', bFull: true });
    } else {
      try {
        fnCleanupView = fnRender(eMain, oRoute) || null;
      } catch (oError) {
        console.error('Pira: view failed to render', oError);
        renderError(eMain, toFriendlyMessage(oError), () => { sRenderedViewKey = ''; renderRoute(); }, true);
      }
    }
    document.title = `${VIEW_TITLES[oRoute.sView] || 'Pira'}${oApp.oProject ? ` · ${oApp.oProject.sKey}` : ''} - Pira`;
    if (document.activeElement === document.body) eMain.focus({ preventScroll: true });
  }
  syncIssuePanel(oRoute);
}

// ── Shortcuts ──────────────────────────────────────────────────

function isTyping(eTarget) {
  return Boolean(eTarget && (eTarget.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(eTarget.tagName)));
}

function wireShortcuts() {
  document.addEventListener('keydown', (oEvent) => {
    if (oEvent.ctrlKey || oEvent.metaKey || oEvent.altKey) return;
    if (qs('#modalHost').children.length || qs('.menu[role="menu"]')) return;
    if (oEvent.key === 'Escape' && isPanelOpen() && !isTyping(oEvent.target)) { setIssueInRoute(''); return; }
    if (isTyping(oEvent.target)) return;
    if (oEvent.key === 'c') { oEvent.preventDefault(); openCreateIssue(oApp.oProject ? oApp.oProject.sId : ''); }
    if (oEvent.key === '/') { oEvent.preventDefault(); qs('#globalSearch').focus(); }
    if (oEvent.key === 'm' && focusCommentComposer()) oEvent.preventDefault();
  });
}

// ── Boot ───────────────────────────────────────────────────────

async function boot() {
  applyTheme(readStoredTheme(), false);
  qs('#themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
  qs('#createButton').addEventListener('click', () => openCreateIssue(oApp.oProject ? oApp.oProject.sId : ''));
  const eMain = qs('#main');
  eMain.innerHTML = stateHtml({ sTitle: 'Loading Pira…', sIcon: '◆', bFull: true });
  try {
    oApp.oData = await loadDataService();
    oApp.oUser = await data().getCurrentUser();
    setCurrentUserId(oApp.oUser.sId);
    const eAvatar = qs('#currentUserAvatar');
    eAvatar.textContent = getInitials(oApp.oUser.sName);
    eAvatar.title = `Signed in as ${oApp.oUser.sName}`;
    eAvatar.setAttribute('aria-label', `Signed in as ${oApp.oUser.sName}`);
    oApp.aMyMemberships = await data().listMyMemberships();
  } catch (oError) {
    console.error('Pira: start-up failed', oError);
    renderError(eMain, toFriendlyMessage(oError), () => window.location.reload(), true);
    return;
  }
  wireGlobalSearch();
  wireShortcuts();
  initNotifications();
  on('issue:moved', refreshPanelIssue);
  on('project:changed', (oProject) => {
    oApp.oProject = oProject;
    oApp.oPermissions = getProjectPermissions(findMembership(oProject.sId), oProject.bArchived);
    renderSidebar(oApp.oRoute);
  });
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('beforeunload', (oEvent) => { if (hasUnsavedChanges()) { oEvent.preventDefault(); oEvent.returnValue = ''; } });
  if (!window.location.hash || window.location.hash === '#') window.history.replaceState(null, '', (await resolveLaunchHash()) || '#/your-work');
  renderRoute();
}

boot();
