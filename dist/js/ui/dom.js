// Shared UI helpers: escaping, icons, toasts, modals, menus and states. All dynamic text goes through escapeHtml.
import { getIssueType, getIssueStatus, getPriority, isHighPriority, getInitials } from '../domain.js';

let sCurrentUserId = '';
export const setCurrentUserId = (sId) => { sCurrentUserId = sId || ''; };

export const qs = (sSelector, eRoot = document) => eRoot.querySelector(sSelector);
export const qsa = (sSelector, eRoot = document) => [...eRoot.querySelectorAll(sSelector)];

const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (sChar) => HTML_ESCAPES[sChar]);
}

export function debounce(fnTarget, iDelay) {
  let iTimer = 0;
  return (...aArgs) => {
    clearTimeout(iTimer);
    iTimer = setTimeout(() => fnTarget(...aArgs), iDelay);
  };
}

export function setBusy(eButton, bBusy) {
  if (!eButton) return;
  eButton.disabled = bBusy;
  eButton.setAttribute('aria-busy', bBusy ? 'true' : 'false');
}

// ── Icons ──────────────────────────────────────────────────────

const TYPE_GLYPHS = Object.freeze({
  story: '<path class="fg" d="M5 4h6v8l-3-2-3 2z"/>',
  bug: '<circle class="fg" cx="8" cy="8" r="3"/>',
  task: '<path class="fg-line" d="m5 8 2 2 4-4" stroke-width="1.8"/>',
  epic: '<path class="fg" d="M9 3 5 9h3l-1 4 4-6H8z"/>',
});
const PRIORITY_PATHS = Object.freeze({
  highest: 'M3 9l5-4 5 4M3 13l5-4 5 4', high: 'M3 11l5-5 5 5', medium: 'M3 6h10M3 10h10',
  low: 'M3 5l5 5 5-5', lowest: 'M3 3l5 4 5-4M3 7l5 4 5-4',
});

export const ICONS = Object.freeze({
  board: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1.5" y="2" width="3.5" height="12" rx="1"/><rect x="6.3" y="2" width="3.5" height="8" rx="1"/><rect x="11" y="2" width="3.5" height="10" rx="1"/></svg>',
  list: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9"/><circle cx="2" cy="4" r=".8" fill="currentColor"/><circle cx="2" cy="8" r=".8" fill="currentColor"/><circle cx="2" cy="12" r=".8" fill="currentColor"/></svg>',
  backlog: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1.5" y="2" width="13" height="4" rx="1"/><path d="M2 9h12M2 12.5h8"/></svg>',
  sprint: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2v3h-3"/></svg>',
  overview: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 14V8M6 14V4M10 14v-4M14 14V2"/></svg>',
  members: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><path d="M1.5 14c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4"/><circle cx="11.5" cy="5" r="2"/><path d="M11 9.6c1.8 0 3.2 1.2 3.6 3.4"/></svg>',
  settings: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',
  home: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 7.5 8 2.5l6 5V14H10v-4H6v4H2z"/></svg>',
  folder: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1.5 4.5 3 3h4l1.5 1.5h6V13h-13z"/></svg>',
  more: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="m11 11 4 4"/></svg>',
  chevron: '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 3.5l3 3 3-3"/></svg>',
  arrowRight: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
  attach: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" style="flex:none"><path d="M13 7.5 8 12.5a3.2 3.2 0 0 1-4.5-4.5l5.3-5.3a2.1 2.1 0 0 1 3 3L6.6 10.9a1 1 0 0 1-1.5-1.5L10 4.5"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  filter: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5z"/></svg>',
  workflow: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1.5" y="2" width="5" height="4" rx="1"/><rect x="9.5" y="10" width="5" height="4" rx="1"/><path d="M4 6v3.5a2 2 0 0 0 2 2h3.5"/></svg>',
  release: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 8.6V2.5h6.1L14 8.4 8.4 14z"/><circle cx="5.2" cy="5.6" r="1.1" fill="currentColor"/></svg>',
  reports: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 2v12h12"/><path d="m4.5 10 3-3.5 2.5 2 4-4.5"/></svg>',
  dependencies: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1.5" y="6" width="4" height="4" rx="1"/><rect x="10.5" y="2" width="4" height="4" rx="1"/><rect x="10.5" y="10" width="4" height="4" rx="1"/><path d="M5.5 8h2.5V4h2.5M8 8v4h2.5"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" style="flex:none"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11"/></svg>',
  upload: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 11V3M4.5 6 8 2.5 11.5 6M2.5 13.5h11"/></svg>',
});

export function typeIcon(iType, iSize = 16) {
  const oType = getIssueType(iType);
  return `<svg class="type-ico" width="${iSize}" height="${iSize}" viewBox="0 0 16 16" role="img" aria-label="${escapeHtml(oType.label)}"><title>${escapeHtml(oType.label)}</title><rect class="bg" width="16" height="16" rx="3"/>${TYPE_GLYPHS[oType.key]}</svg>`;
}

export function priorityIcon(iPriority) {
  const oPriority = getPriority(iPriority);
  const sStroke = isHighPriority(iPriority) ? 'var(--accent-text)' : 'var(--muted)';
  return `<svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="${escapeHtml(oPriority.label)} priority" style="flex:none"><title>${escapeHtml(oPriority.label)} priority</title><path d="${PRIORITY_PATHS[oPriority.key]}" stroke="${sStroke}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function avatar(sUserId, sName, sSize = 'sm') {
  if (!sUserId) return `<span class="avatar ${sSize} unassigned" title="Unassigned" aria-label="Unassigned">?</span>`;
  const sMe = sUserId === sCurrentUserId ? ' me' : '';
  return `<span class="avatar ${sSize}${sMe}" title="${escapeHtml(sName)}" aria-label="${escapeHtml(sName)}">${escapeHtml(getInitials(sName))}</span>`;
}

export function statusPill(iStatus, sExtraClass = '') {
  const oStatus = getIssueStatus(iStatus);
  return `<span class="status s-${oStatus.key} ${sExtraClass}">${escapeHtml(oStatus.label)}</span>`;
}

export const labelChip = (sName) => `<span class="lbl">${escapeHtml(sName)}</span>`;
export const projectAvatar = (sKey, sSize = '') => `<span class="proj-av ${sSize}" aria-hidden="true">${escapeHtml(String(sKey || '?').slice(0, 4))}</span>`;

// ── States ─────────────────────────────────────────────────────

export function stateHtml({ sTitle, sMessage = '', sIcon = '◇', sActionLabel = '', sActionId = '', bFull = false }) {
  const sAction = sActionLabel ? `<button class="btn btn-ghost" type="button" id="${escapeHtml(sActionId)}">${escapeHtml(sActionLabel)}</button>` : '';
  return `<div class="state${bFull ? ' full' : ''}" role="status"><span class="state-ico" aria-hidden="true">${escapeHtml(sIcon)}</span><h3>${escapeHtml(sTitle)}</h3>${sMessage ? `<p>${escapeHtml(sMessage)}</p>` : ''}${sAction}</div>`;
}

export function renderError(eTarget, sMessage, fnRetry, bFull = false) {
  const sActionId = `retry-${Math.random().toString(36).slice(2, 8)}`;
  eTarget.innerHTML = stateHtml({ sTitle: 'Something went wrong', sMessage, sIcon: '!', sActionLabel: fnRetry ? 'Try again' : '', sActionId, bFull });
  const eRetry = fnRetry ? eTarget.querySelector(`#${sActionId}`) : null;
  if (eRetry) eRetry.addEventListener('click', fnRetry);
}

export const skeletonRows = (iCount, sClass = 'sk-row') => Array.from({ length: iCount }, () => `<div class="skeleton ${sClass}"></div>`).join('');

// ── Toasts ─────────────────────────────────────────────────────

export function showToast(sMessage, { sKind = 'success', sActionLabel = '', fnAction = null, iDuration = 3600 } = {}) {
  const eHost = qs('#toastHost');
  const eToast = document.createElement('div');
  eToast.className = `toast ${sKind}`;
  eToast.innerHTML = `<span class="toast-msg">${escapeHtml(sMessage)}</span>${sActionLabel ? `<button type="button">${escapeHtml(sActionLabel)}</button>` : ''}<button type="button" class="icon-btn" aria-label="Dismiss">${ICONS.close}</button>`;
  const fnRemove = () => eToast.remove();
  const aButtons = qsa('button', eToast);
  if (sActionLabel && fnAction) aButtons[0].addEventListener('click', () => { fnRemove(); fnAction(); });
  aButtons[aButtons.length - 1].addEventListener('click', fnRemove);
  eHost.appendChild(eToast);
  setTimeout(fnRemove, sKind === 'error' ? iDuration * 2 : iDuration);
}

// ── Modals ─────────────────────────────────────────────────────

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let iModalCount = 0;

export function openModal({ sTitle, sBodyHtml, aActions = [], sSize = '', sFooterStartHtml = '', fnOnClose = null }) {
  iModalCount += 1;
  const sTitleId = `modalTitle${iModalCount}`;
  const eReturnFocus = document.activeElement;
  const eScrim = document.createElement('div');
  eScrim.className = 'scrim';
  eScrim.innerHTML = `<div class="modal ${sSize}" role="dialog" aria-modal="true" aria-labelledby="${sTitleId}">
    <header id="${sTitleId}">${escapeHtml(sTitle)}</header>
    <div class="modal-body">${sBodyHtml}</div>
    <footer>${sFooterStartHtml}<span class="spacer"></span>${aActions.map((oAction, iIndex) => `<button type="button" class="btn btn-${oAction.sKind || 'ghost'}" data-action="${iIndex}">${escapeHtml(oAction.sLabel)}</button>`).join('')}</footer>
  </div>`;
  const eModal = qs('.modal', eScrim);
  let bBusy = false;
  let bClosed = false;

  const oHandle = {
    eModal,
    eBody: qs('.modal-body', eScrim),
    setBusy(bValue, iActionIndex = -1) {
      bBusy = bValue;
      qsa('footer button', eModal).forEach((eButton) => { eButton.disabled = bValue; });
      if (iActionIndex >= 0) setBusy(qs(`[data-action="${iActionIndex}"]`, eModal), bValue);
    },
    close(result) {
      if (bClosed) return;
      bClosed = true;
      document.removeEventListener('keydown', fnKeydown, true);
      eScrim.remove();
      if (eReturnFocus && document.contains(eReturnFocus)) eReturnFocus.focus();
      if (fnOnClose) fnOnClose(result);
    },
  };

  function fnKeydown(oEvent) {
    if (oEvent.key === 'Escape' && !bBusy) {
      oEvent.stopPropagation();
      oHandle.close(null);
    }
    if (oEvent.key === 'Tab') {
      const aFocusable = qsa(FOCUSABLE, eModal).filter((eItem) => eItem.offsetParent !== null);
      if (!aFocusable.length) return;
      const eFirst = aFocusable[0];
      const eLast = aFocusable[aFocusable.length - 1];
      if (oEvent.shiftKey && document.activeElement === eFirst) { oEvent.preventDefault(); eLast.focus(); }
      else if (!oEvent.shiftKey && document.activeElement === eLast) { oEvent.preventDefault(); eFirst.focus(); }
    }
  }

  qsa('footer [data-action]', eModal).forEach((eButton) => {
    const oAction = aActions[Number(eButton.dataset.action)];
    eButton.addEventListener('click', () => (oAction.fnClick ? oAction.fnClick(oHandle, Number(eButton.dataset.action)) : oHandle.close(null)));
  });
  eScrim.addEventListener('mousedown', (oEvent) => { if (oEvent.target === eScrim && !bBusy) oHandle.close(null); });
  document.addEventListener('keydown', fnKeydown, true);
  qs('#modalHost').appendChild(eScrim);
  const eFirstField = qs('input:not([type="checkbox"]):not([disabled]),textarea,select', eModal) || qs(FOCUSABLE, eModal);
  if (eFirstField) setTimeout(() => eFirstField.focus(), 20);
  return oHandle;
}

export function confirmDialog({ sTitle, sMessage, sConfirmLabel = 'Confirm', sKind = 'primary' }) {
  return new Promise((fnResolve) => {
    openModal({
      sTitle, sSize: 'sm', sBodyHtml: `<p>${escapeHtml(sMessage)}</p>`,
      fnOnClose: (result) => fnResolve(result === true),
      aActions: [
        { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oModal) => oModal.close(false) },
        { sLabel: sConfirmLabel, sKind, fnClick: (oModal) => oModal.close(true) },
      ],
    });
  });
}

// Writes server/validation errors into [data-error-for="field"] slots and flags the matching input.
export function showFieldErrors(eRoot, oErrors = {}) {
  qsa('[data-error-for]', eRoot).forEach((eSlot) => {
    const sField = eSlot.dataset.errorFor;
    eSlot.textContent = oErrors[sField] || '';
    const eInput = qs(`[data-field="${sField}"]`, eRoot);
    if (eInput) eInput.setAttribute('aria-invalid', oErrors[sField] ? 'true' : 'false');
  });
  const sFirst = Object.keys(oErrors)[0];
  const eFirst = sFirst ? qs(`[data-field="${sFirst}"]`, eRoot) : null;
  if (eFirst) eFirst.focus();
}

// ── Menus ──────────────────────────────────────────────────────

let fnCloseOpenMenu = null;

export function closeMenu() {
  if (fnCloseOpenMenu) fnCloseOpenMenu();
}

// aItems: [{ sHtml, fnSelect }] or { sHeading } or { bSeparator }.
export function openMenu(eAnchor, aItems, { sLabel = 'Menu' } = {}) {
  closeMenu();
  const eMenu = document.createElement('div');
  eMenu.className = 'menu';
  eMenu.setAttribute('role', 'menu');
  eMenu.setAttribute('aria-label', sLabel);
  eMenu.innerHTML = aItems.map((oItem, iIndex) => {
    if (oItem.sHeading) return `<div class="menu-h">${escapeHtml(oItem.sHeading)}</div>`;
    if (oItem.bSeparator) return '<div class="menu-sep"></div>';
    return `<button type="button" role="menuitem" data-index="${iIndex}"${oItem.bDisabled ? ' disabled' : ''}>${oItem.sHtml}</button>`;
  }).join('') || '<div class="menu-empty">Nothing here</div>';
  document.body.appendChild(eMenu);
  const oRect = eAnchor.getBoundingClientRect();
  const iLeft = Math.min(oRect.left, window.innerWidth - eMenu.offsetWidth - 8);
  const bAbove = oRect.bottom + eMenu.offsetHeight + 8 > window.innerHeight && oRect.top > eMenu.offsetHeight + 8;
  eMenu.style.left = `${Math.max(8, iLeft)}px`;
  eMenu.style.top = `${bAbove ? oRect.top - eMenu.offsetHeight - 4 : oRect.bottom + 4}px`;
  eAnchor.setAttribute('aria-expanded', 'true');

  const aButtons = qsa('button[role="menuitem"]:not([disabled])', eMenu);
  const fnClose = () => {
    eMenu.remove();
    eAnchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', fnOutside, true);
    document.removeEventListener('keydown', fnKeys, true);
    window.removeEventListener('resize', fnClose);
    fnCloseOpenMenu = null;
  };
  function fnOutside(oEvent) {
    if (!eMenu.contains(oEvent.target) && !eAnchor.contains(oEvent.target)) fnClose();
  }
  function fnKeys(oEvent) {
    const iCurrent = aButtons.indexOf(document.activeElement);
    if (oEvent.key === 'Escape') { oEvent.stopPropagation(); fnClose(); eAnchor.focus(); }
    if (oEvent.key === 'ArrowDown') { oEvent.preventDefault(); (aButtons[iCurrent + 1] || aButtons[0]).focus(); }
    if (oEvent.key === 'ArrowUp') { oEvent.preventDefault(); (aButtons[iCurrent - 1] || aButtons[aButtons.length - 1]).focus(); }
    if (oEvent.key === 'Tab') fnClose();
  }
  aButtons.forEach((eButton) => eButton.addEventListener('click', () => {
    const oItem = aItems[Number(eButton.dataset.index)];
    fnClose();
    eAnchor.focus();
    oItem.fnSelect();
  }));
  document.addEventListener('mousedown', fnOutside, true);
  document.addEventListener('keydown', fnKeys, true);
  window.addEventListener('resize', fnClose);
  fnCloseOpenMenu = fnClose;
  if (aButtons[0]) aButtons[0].focus();
  return fnClose;
}

export async function copyText(sText) {
  try {
    await navigator.clipboard.writeText(sText);
    return true;
  } catch (oError) {
    const eArea = document.createElement('textarea');
    eArea.value = sText;
    eArea.setAttribute('readonly', '');
    eArea.style.position = 'fixed';
    eArea.style.opacity = '0';
    document.body.appendChild(eArea);
    eArea.select();
    const bCopied = document.execCommand('copy');
    eArea.remove();
    return bCopied;
  }
}

// Saves through a short-lived local object URL; the content is never rendered in the app's origin.
export function saveFile(data, sFileName, sType = 'application/octet-stream') {
  const sUrl = URL.createObjectURL(new Blob([data], { type: sType }));
  const eLink = document.createElement('a');
  eLink.href = sUrl;
  eLink.download = sFileName;
  document.body.appendChild(eLink);
  eLink.click();
  eLink.remove();
  setTimeout(() => URL.revokeObjectURL(sUrl), 30000);
}

// Simple bar chart as accessible HTML: aBars [{ sLabel, iValue, sTitle }].
export function barChartHtml(aBars, { sUnit = '', sEmpty = 'No data yet.' } = {}) {
  if (!aBars.length || aBars.every((oBar) => !oBar.iValue)) return `<p class="hint">${escapeHtml(sEmpty)}</p>`;
  const iMax = Math.max(...aBars.map((oBar) => oBar.iValue), 1);
  return `<div class="bar-chart" role="list">${aBars.map((oBar) => `<div class="bar-col" role="listitem" title="${escapeHtml(oBar.sTitle || `${oBar.sLabel}: ${oBar.iValue}${sUnit}`)}">
    <span class="bar-val">${escapeHtml(String(oBar.iValue))}</span><span class="bar-fill" style="height:${Math.max(2, Math.round((oBar.iValue / iMax) * 100))}%"></span><span class="bar-lbl">${escapeHtml(oBar.sLabel)}</span></div>`).join('')}</div>`;
}
