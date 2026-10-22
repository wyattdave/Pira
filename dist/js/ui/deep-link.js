// Share links and launch parameters. Pira runs in a cross-origin iframe, so links target the Power Apps play URL and
// carry ?project=KEY&view=board&tab=<boardId>&issue=KEY-1 rather than the iframe's own hash route.
import { normaliseProjectKey, validateProjectKey, parseIssueKey } from '../domain.js';
import { buildHash, parseHash } from './context.js';
import { copyText, showToast } from './dom.js';
import { getContext } from '../../power-apps-data.js';

const DEEP_LINK_KEYS = Object.freeze(['project', 'view', 'tab', 'issue']);
const TAB_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const CONTEXT_TIMEOUT_MS = 1500;

// ── Host URL discovery ─────────────────────────────────────────

function formatGuid(sRaw) {
  const sHex = String(sRaw || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (sHex.length !== 32) return '';
  return `${sHex.slice(0, 8)}-${sHex.slice(8, 12)}-${sHex.slice(12, 16)}-${sHex.slice(16, 20)}-${sHex.slice(20)}`;
}

function parsePlayUrlFromCandidate(sCandidate) {
  let oUrl;
  try {
    oUrl = new URL(sCandidate);
  } catch (oError) {
    return '';
  }
  const aPlayMatch = oUrl.pathname.match(/\/play\/(?:e|tenants)\/[^/]+\/app\/[0-9a-fA-F-]+/);
  if (aPlayMatch) return oUrl.origin + aPlayMatch[0];
  // Runtime iframe host: {env 30 hex}.{env 2 hex}.environment.api.powerplatformusercontent.com/powerapps/appruntime/{appId}
  const aAppMatch = oUrl.pathname.match(/\/appruntime\/([0-9a-fA-F-]{36})(?:\/|$)/);
  if (!aAppMatch) return '';
  const aHostLabels = oUrl.hostname.split('.');
  const sEnvironmentId = aHostLabels.length >= 2 ? formatGuid(aHostLabels[0] + aHostLabels[1]) : '';
  return sEnvironmentId ? `https://apps.powerapps.com/play/e/${sEnvironmentId}/app/${aAppMatch[1].toLowerCase()}` : '';
}

export function getHostUrlCandidates() {
  const aCandidates = [];
  try {
    if (window.top && window.top !== window && window.top.location.href) aCandidates.push(window.top.location.href);
  } catch (oError) {
    // Cross-origin host: fall back to the other sources.
  }
  if (document.referrer) aCandidates.push(document.referrer);
  try {
    if (window.location.ancestorOrigins && window.location.ancestorOrigins.length) aCandidates.push(window.location.ancestorOrigins[0]);
  } catch (oError) {
    // ancestorOrigins is not supported everywhere.
  }
  aCandidates.push(window.location.href);
  return aCandidates;
}

export const getPlayBaseUrl = () => getHostUrlCandidates().map(parsePlayUrlFromCandidate).find(Boolean) || '';

// ── Build links ────────────────────────────────────────────────

function routeToParams({ sProjectKey = '', sView = '', sTab = '', sIssueKey = '' }) {
  return [['project', sProjectKey], ['view', sProjectKey ? sView : ''], ['tab', sProjectKey ? sTab : ''], ['issue', sIssueKey]]
    .filter(([, sValue]) => sValue);
}

// Outside the Power Apps host (local dev) the current page is used, keeping its own query such as ?mock.
export function buildShareUrl(oRoute) {
  const oUrl = new URL(getPlayBaseUrl() || window.location.href);
  oUrl.hash = '';
  DEEP_LINK_KEYS.forEach((sKey) => oUrl.searchParams.delete(sKey));
  routeToParams(oRoute).forEach(([sKey, sValue]) => oUrl.searchParams.set(sKey, sValue));
  return oUrl.toString();
}

export async function copyShareLink(oRoute, sLabel) {
  const bCopied = await copyText(buildShareUrl(oRoute));
  showToast(bCopied ? `Link to ${sLabel} copied` : 'Copy is not available here.', { sKind: bCopied ? 'success' : 'error', iDuration: 1800 });
}

// ── Read launch parameters ─────────────────────────────────────

function addParam(oParams, sKey, value) {
  const sName = String(sKey).toLowerCase();
  if (!DEEP_LINK_KEYS.includes(sName) || oParams.has(sName)) return;
  if (typeof value === 'string' || typeof value === 'number') oParams.set(sName, String(value));
}

function addQueryString(oParams, sRaw) {
  const sText = String(sRaw || '').split('#')[0];
  const sQuery = sText.includes('?') ? sText.slice(sText.indexOf('?') + 1) : sText;
  if (sQuery.includes('=')) new URLSearchParams(sQuery).forEach((sValue, sKey) => addParam(oParams, sKey, sValue));
}

export function readDeepLinkParamsFromUrl() {
  const oParams = new URLSearchParams();
  addQueryString(oParams, window.location.search);
  getHostUrlCandidates().forEach((sUrl) => addQueryString(oParams, sUrl));
  return oParams;
}

// The play URL's query reaches the app through the SDK launch context, not the iframe URL or (usually) the referrer.
function collectContextParams(oSource, oParams, oSeen) {
  if (!oSource || typeof oSource !== 'object' || oSeen.has(oSource)) return;
  oSeen.add(oSource);
  Object.entries(oSource).forEach(([sKey, value]) => {
    if (value && typeof value === 'object') collectContextParams(value, oParams, oSeen);
    else if (DEEP_LINK_KEYS.includes(sKey.toLowerCase())) addParam(oParams, sKey, value);
    else if (typeof value === 'string' && DEEP_LINK_KEYS.some((sName) => value.toLowerCase().includes(`${sName}=`))) addQueryString(oParams, value);
  });
}

export async function readDeepLinkParamsFromContext() {
  const oParams = new URLSearchParams();
  try {
    const oTimeout = new Promise((fnResolve) => { setTimeout(() => fnResolve(null), CONTEXT_TIMEOUT_MS); });
    const oContext = await Promise.race([getContext(), oTimeout]);
    collectContextParams(oContext, oParams, new Set());
  } catch (oError) {
    // No host context (e.g. local mock mode); URL parameters still apply.
  }
  return oParams;
}

// Only allowlisted, well-formed values become a route; the project and issue are then checked against Dataverse by the normal routing.
export function deepLinkToHash(oParams) {
  const oIssueKey = parseIssueKey(oParams.get('issue'));
  const sIssueKey = oIssueKey ? `${oIssueKey.sProjectKey}-${oIssueKey.iSequence}` : '';
  const sProjectKey = normaliseProjectKey(oParams.get('project'));
  if (!sProjectKey || validateProjectKey(sProjectKey)) return sIssueKey ? `#/browse/${sIssueKey}` : '';
  const sView = String(oParams.get('view') || 'board').toLowerCase();
  const sTab = String(oParams.get('tab') || '');
  // parseHash maps unknown views back to the board.
  const oRoute = parseHash(buildHash({ sView: TAB_PATTERN.test(sView) ? sView : 'board', sProjectKey, sTab: TAB_PATTERN.test(sTab) ? sTab : '' }));
  return buildHash({ ...oRoute, sIssueKey });
}

export async function resolveLaunchHash() {
  const oParams = await readDeepLinkParamsFromContext();
  readDeepLinkParamsFromUrl().forEach((sValue, sKey) => { if (!oParams.has(sKey)) oParams.set(sKey, sValue); });
  return deepLinkToHash(oParams);
}
