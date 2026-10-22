// Shared runtime state, a tiny event bus and hash routing for Pira.
import { RECENT_PROJECTS_STORAGE_KEY } from '../../config/app-config.js';
import { getProjectPermissions } from '../domain.js';

export const oApp = {
  oData: null,
  oUser: null,
  aMyMemberships: [],
  oRoute: null,
  oProject: null,
  oMembership: null,
  oPermissions: getProjectPermissions(null),
};

export const data = () => oApp.oData;

// ── Events ─────────────────────────────────────────────────────
const oListeners = new Map();

export function on(sEvent, fnHandler) {
  if (!oListeners.has(sEvent)) oListeners.set(sEvent, new Set());
  oListeners.get(sEvent).add(fnHandler);
  return () => oListeners.get(sEvent).delete(fnHandler);
}

export function emit(sEvent, payload) {
  (oListeners.get(sEvent) || new Set()).forEach((fnHandler) => {
    try {
      fnHandler(payload);
    } catch (oError) {
      console.error(`Pira: ${sEvent} handler failed`, oError);
    }
  });
}

// ── Membership helpers ─────────────────────────────────────────

export const findMembership = (sProjectId) => oApp.aMyMemberships.find((oMember) => oMember.sProjectId === sProjectId && oMember.bActive) || null;

export async function refreshMemberships() {
  oApp.oData.invalidateCache('members:mine');
  oApp.aMyMemberships = await oApp.oData.listMyMemberships();
  return oApp.aMyMemberships;
}

// ── Recent projects (local preference only) ────────────────────

export function readRecentProjectKeys() {
  try {
    const aKeys = JSON.parse(localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY) || '[]');
    return Array.isArray(aKeys) ? aKeys.filter((sKey) => typeof sKey === 'string').slice(0, 6) : [];
  } catch (oError) {
    return [];
  }
}

export function rememberProject(sKey) {
  try {
    const aKeys = [sKey, ...readRecentProjectKeys().filter((sItem) => sItem !== sKey)].slice(0, 6);
    localStorage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(aKeys));
  } catch (oError) {
    // Local preference only; ignore storage failures.
  }
}

// ── Routing ────────────────────────────────────────────────────
// #/your-work[/tab]   #/projects   #/projects/KEY[/board|backlog|sprints|issues|overview|settings[/tab]]   ?issue=KEY-1 on any route
// For board and backlog the tab is a board id; for sprints it is a sprint id; for releases it is 'list' or 'calendar'.

const PROJECT_VIEWS = new Set(['board', 'backlog', 'sprints', 'issues', 'overview', 'settings', 'releases', 'reports', 'dependencies']);

export function parseHash(sHash) {
  const sRaw = String(sHash || '').replace(/^#\/?/, '');
  const [sPath, sQuery = ''] = sRaw.split('?');
  const aParts = sPath.split('/').filter(Boolean).map((sPart) => decodeURIComponent(sPart));
  const sIssueKey = new URLSearchParams(sQuery).get('issue') || '';
  if (!aParts.length || aParts[0] === 'your-work') return { sView: 'your-work', sTab: aParts[1] || 'assigned', sIssueKey };
  if (aParts[0] === 'browse' && aParts[1]) {
    const sKey = aParts[1].toUpperCase();
    return { sView: 'board', sProjectKey: sKey.split('-')[0], sTab: '', sIssueKey: sKey };
  }
  if (aParts[0] === 'projects' && !aParts[1]) return { sView: 'projects', sTab: '', sIssueKey };
  if (aParts[0] === 'projects') {
    const sView = PROJECT_VIEWS.has(aParts[2]) ? aParts[2] : 'board';
    return { sView, sProjectKey: aParts[1].toUpperCase(), sTab: aParts[3] || '', sIssueKey };
  }
  return { sView: 'not-found', sTab: '', sIssueKey };
}

export function buildHash(oRoute) {
  let sPath = oRoute.sView;
  if (oRoute.sProjectKey) sPath = `projects/${encodeURIComponent(oRoute.sProjectKey)}/${oRoute.sView}`;
  if (oRoute.sTab) sPath += `/${encodeURIComponent(oRoute.sTab)}`;
  return `#/${sPath}${oRoute.sIssueKey ? `?issue=${encodeURIComponent(oRoute.sIssueKey)}` : ''}`;
}

export const projectHash = (sKey, sView = 'board', sTab = '') => buildHash({ sView, sProjectKey: sKey, sTab });

export function navigate(sHash) {
  if (window.location.hash === sHash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = sHash;
}

// Opens/closes the issue panel by changing only the ?issue parameter.
export function setIssueInRoute(sIssueKey) {
  const oRoute = parseHash(window.location.hash);
  navigate(buildHash({ ...oRoute, sIssueKey: sIssueKey || '' }));
}
