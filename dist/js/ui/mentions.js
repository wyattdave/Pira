// "@" suggestions for comment boxes. Picking a person inserts "@Full Name"; the service turns those into notifications.
import { qsa, escapeHtml, avatar } from './dom.js';

const MENTION_PATTERN = /(^|\s)@([^\s@]{0,30})$/;
const MAX_SUGGESTIONS = 6;

// fnMembers() returns the project's current members ({ sUserId, sUserName }).
export function wireMentions(eTextarea, fnMembers) {
  const eMenu = document.createElement('div');
  eMenu.className = 'menu mention-menu';
  eMenu.setAttribute('role', 'listbox');
  eMenu.setAttribute('aria-label', 'Mention someone');
  eMenu.hidden = true;
  eTextarea.insertAdjacentElement('afterend', eMenu);
  let aMatches = [];
  let iActive = 0;
  let iStart = -1;

  const fnHide = () => { eMenu.hidden = true; aMatches = []; iStart = -1; };
  const fnHighlight = () => qsa('[role="option"]', eMenu).forEach((eOption, iIndex) => eOption.setAttribute('aria-selected', String(iIndex === iActive)));
  const fnChoose = (iIndex) => {
    const oMember = aMatches[iIndex];
    if (!oMember || iStart < 0) return;
    const iCaret = eTextarea.selectionStart;
    const sInsert = `@${oMember.sUserName} `;
    eTextarea.value = `${eTextarea.value.slice(0, iStart)}${sInsert}${eTextarea.value.slice(iCaret)}`;
    const iNewCaret = iStart + sInsert.length;
    eTextarea.setSelectionRange(iNewCaret, iNewCaret);
    fnHide();
    eTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    eTextarea.focus();
  };

  eTextarea.addEventListener('input', () => {
    const sBefore = eTextarea.value.slice(0, eTextarea.selectionStart);
    const aMatch = MENTION_PATTERN.exec(sBefore);
    if (!aMatch) { fnHide(); return; }
    const sQuery = aMatch[2].toLowerCase();
    aMatches = fnMembers().filter((oMember) => oMember.sUserName.toLowerCase().split(/\s+/).some((sPart) => sPart.startsWith(sQuery)) || oMember.sUserName.toLowerCase().startsWith(sQuery))
      .slice(0, MAX_SUGGESTIONS);
    if (!aMatches.length) { fnHide(); return; }
    iStart = sBefore.length - aMatch[2].length - 1;
    iActive = 0;
    eMenu.innerHTML = `<div class="menu-h">Mention</div>${aMatches.map((oMember, iIndex) => `<button type="button" role="option" data-index="${iIndex}" aria-selected="false">${avatar(oMember.sUserId, oMember.sUserName, 'xs')}<span class="combo-text">${escapeHtml(oMember.sUserName)}</span></button>`).join('')}`;
    eMenu.hidden = false;
    fnHighlight();
    qsa('[data-index]', eMenu).forEach((eOption) => eOption.addEventListener('mousedown', (oEvent) => { oEvent.preventDefault(); fnChoose(Number(eOption.dataset.index)); }));
  });

  // Registered before the composer's own keys so Enter/Escape pick or close the list first.
  eTextarea.addEventListener('keydown', (oEvent) => {
    if (eMenu.hidden) return;
    if (oEvent.key === 'ArrowDown' || oEvent.key === 'ArrowUp') {
      oEvent.preventDefault();
      iActive = (iActive + (oEvent.key === 'ArrowDown' ? 1 : -1) + aMatches.length) % aMatches.length;
      fnHighlight();
    } else if ((oEvent.key === 'Enter' && !oEvent.ctrlKey && !oEvent.metaKey) || oEvent.key === 'Tab') {
      oEvent.preventDefault();
      oEvent.stopImmediatePropagation();
      fnChoose(iActive);
    } else if (oEvent.key === 'Escape') {
      oEvent.stopImmediatePropagation();
      oEvent.stopPropagation();
      fnHide();
    }
  });
  eTextarea.addEventListener('blur', () => setTimeout(fnHide, 150));
}
