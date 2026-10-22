// Accessible type-ahead lookups (parent issue, linked issue, people). Results are fetched server-side, debounced and paged small.
import { SEARCH_DELAY_MS, PAGING } from '../../config/app-config.js';
import { toFriendlyMessage } from '../domain.js';
import { qs, qsa, escapeHtml, debounce, typeIcon, statusPill, avatar } from './dom.js';
import { data } from './context.js';

let iComboboxCount = 0;

export function comboboxHtml({ sId, sLabel, sPlaceholder = '', sExtraClass = '' }) {
  return `<div class="search-wrap combo ${sExtraClass}"><label class="sr" for="${sId}">${escapeHtml(sLabel)}</label>
    <input class="inp" id="${sId}" placeholder="${escapeHtml(sPlaceholder)}" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="${sId}List" aria-autocomplete="list">
    <div class="menu combo-list" id="${sId}List" role="listbox" hidden></div></div>`;
}

export const issueOptionHtml = (oIssue) => `${typeIcon(oIssue.iType)}<span class="combo-text"><span class="key">${escapeHtml(oIssue.sKey)}</span> ${escapeHtml(oIssue.sSummary)}</span>${statusPill(oIssue.iStatus)}`;

// Project members first (no API call), then anyone in Entra ID (Office 365 Users) who also has a Dataverse user.
export async function searchPeople(aMembers, sText) {
  const sQuery = String(sText || '').trim().toLowerCase();
  const aLocal = aMembers.filter((oMember) => !sQuery || oMember.sUserName.toLowerCase().includes(sQuery))
    .sort((oA, oB) => oA.sUserName.localeCompare(oB.sUserName))
    .map((oMember) => ({ sId: oMember.sUserId, sName: oMember.sUserName, sEmail: '', bProvisioned: true, bMember: true }));
  const aRemote = sQuery.length >= 2 ? await data().searchUsers(sQuery) : [];
  return [...aLocal, ...aRemote.filter((oPerson) => !oPerson.sId || !aLocal.some((oItem) => oItem.sId === oPerson.sId))].slice(0, PAGING.userSearch);
}

export function personOption(oPerson) {
  const sNote = oPerson.bProvisioned === false ? 'not set up in Dataverse yet' : (oPerson.bMember ? '' : 'not a project member');
  return {
    sHtml: `${avatar(oPerson.sId || oPerson.sObjectId, oPerson.sName, 'xs')}<span class="combo-text">${escapeHtml(oPerson.sName)}<small class="hint">${oPerson.sEmail ? ` ${escapeHtml(oPerson.sEmail)}` : ''}${sNote ? ` · ${sNote}` : ''}</small></span>`,
    bDisabled: oPerson.bProvisioned === false,
  };
}

// fnSearch(sText) → Promise<items>; fnOption(item) → { sHtml, bDisabled }; fnSelect(item) runs on click/Enter.
export function wireCombobox(eInput, { fnSearch, fnOption, fnSelect, iMinChars = 1, sEmpty = 'No matches.' }) {
  const eList = qs(`#${CSS.escape(eInput.getAttribute('aria-controls'))}`);
  const sPrefix = `combo${(iComboboxCount += 1)}`;
  let aItems = [];
  let iActive = -1;
  let iRequest = 0;
  const fnHide = () => { eList.hidden = true; eInput.setAttribute('aria-expanded', 'false'); eInput.removeAttribute('aria-activedescendant'); iActive = -1; };
  // Modal bodies scroll and clip, so inside a dialog the list floats (fixed) over it, flipping above the input when space is short.
  const eScroller = eInput.closest('.modal-body');
  const fnPlace = () => {
    if (!eScroller || eList.hidden) return;
    // Hosted on the scrim so the dialog's pop-in transform doesn't scale or offset it.
    const eHost = eInput.closest('.scrim');
    if (eHost && eList.parentElement !== eHost) eHost.appendChild(eList);
    eList.classList.add('combo-float');
    const oInput = eInput.getBoundingClientRect();
    const iBelow = window.innerHeight - oInput.bottom - 12;
    const iAbove = oInput.top - 12;
    const bUp = iBelow < 200 && iAbove > iBelow;
    Object.assign(eList.style, { left: `${oInput.left}px`, width: `${oInput.width}px`, top: '0px', maxHeight: `${Math.max(120, Math.min(280, bUp ? iAbove : iBelow))}px` });
    const iTop = bUp ? oInput.top - 4 - eList.offsetHeight : oInput.bottom + 4;
    // A transformed/filtered ancestor can become the fixed containing block, so correct by the measured offset.
    const oPlaced = eList.getBoundingClientRect();
    Object.assign(eList.style, { top: `${iTop - oPlaced.top}px`, left: `${2 * oInput.left - oPlaced.left}px` });
  };
  if (eScroller) {
    eScroller.addEventListener('scroll', fnPlace, { passive: true });
    window.addEventListener('resize', fnPlace);
  }
  const fnHighlight = () => {
    qsa('[role="option"]', eList).forEach((eOption, iIndex) => eOption.setAttribute('aria-selected', String(iIndex === iActive)));
    if (iActive >= 0) {
      eInput.setAttribute('aria-activedescendant', `${sPrefix}-${iActive}`);
      const eActive = qs(`#${sPrefix}-${iActive}`, eList);
      if (eActive) eActive.scrollIntoView({ block: 'nearest' });
    }
  };
  const fnChoose = (iIndex) => {
    const oItem = aItems[iIndex];
    if (!oItem || fnOption(oItem).bDisabled) return;
    fnHide();
    fnSelect(oItem);
  };
  const fnShow = (sHtml) => { eList.innerHTML = sHtml; eList.hidden = false; eInput.setAttribute('aria-expanded', 'true'); fnPlace(); };
  const fnRun = debounce(async () => {
    const sText = eInput.value.trim();
    const iThis = ++iRequest;
    if (sText.length < iMinChars) { fnHide(); return; }
    fnShow('<div class="menu-h">Searching…</div>');
    try {
      const aResults = await fnSearch(sText);
      if (iThis !== iRequest || !eInput.isConnected) return;
      aItems = aResults;
      iActive = aItems.findIndex((oItem) => !fnOption(oItem).bDisabled);
      fnShow(aItems.length
        ? aItems.map((oItem, iIndex) => {
          const oOption = fnOption(oItem);
          return `<button type="button" role="option" id="${sPrefix}-${iIndex}" data-index="${iIndex}" aria-selected="false"${oOption.bDisabled ? ' aria-disabled="true" class="is-disabled"' : ''}>${oOption.sHtml}</button>`;
        }).join('')
        : `<div class="menu-empty">${escapeHtml(sEmpty)}</div>`);
      fnHighlight();
      qsa('[data-index]', eList).forEach((eOption) => eOption.addEventListener('mousedown', (oEvent) => { oEvent.preventDefault(); fnChoose(Number(eOption.dataset.index)); }));
    } catch (oError) {
      if (iThis === iRequest) fnShow(`<div class="menu-empty">${escapeHtml(toFriendlyMessage(oError))}</div>`);
    }
  }, SEARCH_DELAY_MS);
  eInput.addEventListener('input', fnRun);
  // A minimum of 0 characters lists suggestions as soon as the box is focused.
  if (iMinChars === 0) {
    eInput.addEventListener('focus', fnRun);
    eInput.addEventListener('click', () => { if (eList.hidden) fnRun(); });
  }
  eInput.addEventListener('blur', () => setTimeout(fnHide, 150));
  eInput.addEventListener('keydown', (oEvent) => {
    const bOpen = !eList.hidden && aItems.length;
    if (oEvent.key === 'Escape' && !eList.hidden) { oEvent.stopPropagation(); fnHide(); }
    if (oEvent.key === 'ArrowDown' && bOpen) { oEvent.preventDefault(); iActive = (iActive + 1) % aItems.length; fnHighlight(); }
    if (oEvent.key === 'ArrowUp' && bOpen) { oEvent.preventDefault(); iActive = (iActive - 1 + aItems.length) % aItems.length; fnHighlight(); }
    if (oEvent.key === 'Enter' && bOpen && iActive >= 0) { oEvent.preventDefault(); fnChoose(iActive); }
  });
  return { fnHide };
}
