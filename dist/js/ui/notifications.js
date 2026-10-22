// Notification bell: unread count, recent notifications and personal preferences. Opening one marks it read.
// Rows never contain issue summaries; the issue opens under the viewer's own Dataverse access.
import { NOTIFICATION_EVENTS, NOTIFICATION_POLL_MS } from '../../config/app-config.js';
import { formatRelativeTime, toFriendlyMessage } from '../domain.js';
import { data, setIssueInRoute, projectHash, navigate } from './context.js';
import { qs, qsa, escapeHtml, avatar, openModal, showToast, skeletonRows, ICONS, setBusy } from './dom.js';

const oNotify = { iUnread: 0, aItems: [], sNextToken: '', bUnreadOnly: false, bLoading: false, sError: '', iEpoch: 0, ePanel: null };

const eventKey = (iEvent) => (NOTIFICATION_EVENTS.find((oEvent) => oEvent.value === iEvent) || {}).key || '';

function renderBadge() {
  const eBadge = qs('#notifyBadge');
  eBadge.hidden = !oNotify.iUnread;
  eBadge.textContent = oNotify.iUnread > 99 ? '99+' : String(oNotify.iUnread);
  qs('#notifyButton').setAttribute('aria-label', oNotify.iUnread ? `Notifications, ${oNotify.iUnread} unread` : 'Notifications');
}

export async function refreshUnreadCount() {
  try {
    oNotify.iUnread = await data().countUnreadNotifications();
    renderBadge();
  } catch (oError) {
    console.warn('Pira: unread notification count unavailable', oError);
  }
}

function notificationText(oItem) {
  const sWho = `<b>${escapeHtml(oItem.sActorName)}</b>`;
  const sKey = oItem.sIssueKey ? `<span class="key">${escapeHtml(oItem.sIssueKey)}</span>` : '';
  switch (eventKey(oItem.iEvent)) {
    case 'assigned': return `${sWho} assigned you ${sKey}`;
    case 'mentioned': return `${sWho} mentioned you on ${sKey}`;
    case 'status': return `${sWho} moved ${sKey} <span class="chip">${escapeHtml(oItem.sDetail)}</span>`;
    case 'comment': return `${sWho} commented on ${sKey}`;
    case 'bulk': return `${sWho} bulk-edited in ${escapeHtml(oItem.sProjectName || 'a project')}: ${escapeHtml(oItem.sDetail)}`;
    default: return `${sWho} updated ${sKey}`;
  }
}

function closePanel() {
  if (!oNotify.ePanel) return;
  oNotify.ePanel.remove();
  oNotify.ePanel = null;
  oNotify.iEpoch += 1;
  qs('#notifyButton').setAttribute('aria-expanded', 'false');
  document.removeEventListener('mousedown', fnOutside, true);
  document.removeEventListener('keydown', fnKeys, true);
}

function fnOutside(oEvent) {
  if (oNotify.ePanel && !oNotify.ePanel.contains(oEvent.target) && !qs('#notifyButton').contains(oEvent.target) && !qs('#modalHost').contains(oEvent.target)) closePanel();
}

function fnKeys(oEvent) {
  if (oEvent.key === 'Escape' && oNotify.ePanel && !qs('#modalHost').children.length) {
    oEvent.stopPropagation();
    closePanel();
    qs('#notifyButton').focus();
  }
}

function renderPanel() {
  const ePanel = oNotify.ePanel;
  if (!ePanel) return;
  const sList = oNotify.sError
    ? `<p class="menu-empty">${escapeHtml(oNotify.sError)}</p>`
    : oNotify.aItems.map((oItem) => `<button type="button" class="notify-item${oItem.bRead ? '' : ' unread'}" data-notification="${escapeHtml(oItem.sId)}">
        ${avatar(oItem.sActorId, oItem.sActorName, 'sm')}<span class="notify-text">${notificationText(oItem)}<small>${escapeHtml(formatRelativeTime(oItem.sCreatedOn))}${oItem.bRead ? '' : ' · <span class="notify-dot">New</span>'}</small></span></button>`).join('')
      || (!oNotify.bLoading ? `<p class="menu-empty">${oNotify.bUnreadOnly ? 'No unread notifications.' : 'No notifications yet.'}</p>` : '');
  ePanel.innerHTML = `<div class="notify-head"><b>Notifications</b><span class="spacer"></span>
      <label class="check"><input type="checkbox" id="notifyUnreadOnly"${oNotify.bUnreadOnly ? ' checked' : ''}> Unread only</label>
      <button class="icon-btn" type="button" id="notifySettings" aria-label="Notification settings" title="Notification settings">${ICONS.settings}</button></div>
    <div class="notify-list">${sList}${oNotify.bLoading ? skeletonRows(3, 'sk-row') : ''}</div>
    <div class="notify-foot">${oNotify.sNextToken && !oNotify.bLoading ? '<button class="btn btn-quiet" type="button" id="notifyMore">Load more</button>' : ''}<span class="spacer"></span>
      <button class="btn btn-quiet" type="button" id="notifyMarkAll"${oNotify.iUnread ? '' : ' disabled'}>Mark all read</button></div>`;
  qs('#notifyUnreadOnly', ePanel).addEventListener('change', (oEvent) => { oNotify.bUnreadOnly = oEvent.target.checked; loadNotifications(false); });
  qs('#notifySettings', ePanel).addEventListener('click', openPreferences);
  qs('#notifyMarkAll', ePanel).addEventListener('click', markAllRead);
  const eMore = qs('#notifyMore', ePanel);
  if (eMore) eMore.addEventListener('click', () => loadNotifications(true));
  qsa('[data-notification]', ePanel).forEach((eItem) => eItem.addEventListener('click', () => openNotification(eItem.dataset.notification)));
}

async function loadNotifications(bMore) {
  const iEpoch = ++oNotify.iEpoch;
  if (!bMore) Object.assign(oNotify, { aItems: [], sNextToken: '' });
  Object.assign(oNotify, { bLoading: true, sError: '' });
  renderPanel();
  try {
    const { aNotifications, sNextToken } = await data().listNotifications({ bUnreadOnly: oNotify.bUnreadOnly, sSkipToken: bMore ? oNotify.sNextToken : '' });
    if (iEpoch !== oNotify.iEpoch) return;
    Object.assign(oNotify, { aItems: bMore ? [...oNotify.aItems, ...aNotifications] : aNotifications, sNextToken });
  } catch (oError) {
    if (iEpoch !== oNotify.iEpoch) return;
    oNotify.sError = toFriendlyMessage(oError);
  }
  oNotify.bLoading = false;
  renderPanel();
}

async function openNotification(sId) {
  const oItem = oNotify.aItems.find((oNotification) => oNotification.sId === sId);
  if (!oItem) return;
  if (!oItem.bRead) {
    oItem.bRead = true;
    oNotify.iUnread = Math.max(0, oNotify.iUnread - 1);
    renderBadge();
    data().markNotificationsRead([oItem.sId]).catch((oError) => console.warn('Pira: could not mark the notification read', oError));
  }
  closePanel();
  if (oItem.sIssueKey) setIssueInRoute(oItem.sIssueKey);
  else if (oItem.sProjectId) {
    try {
      const oProject = await data().getProject(oItem.sProjectId);
      navigate(projectHash(oProject.sKey, 'issues'));
    } catch (oError) {
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
    }
  }
}

async function markAllRead(oEvent) {
  const eButton = oEvent.currentTarget;
  setBusy(eButton, true);
  try {
    await data().markAllNotificationsRead();
    oNotify.aItems.forEach((oItem) => { oItem.bRead = true; });
    oNotify.iUnread = 0;
    renderBadge();
    renderPanel();
  } catch (oError) {
    setBusy(eButton, false);
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
  }
}

async function openPreferences() {
  let oPreferences;
  try {
    oPreferences = await data().getNotificationPreferences();
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
    return;
  }
  const fnCheck = (sKey, sLabel, sHint = '') => `<label class="check pref-row"><input type="checkbox" data-pref="${sKey}"${oPreferences[sKey] ? ' checked' : ''}> <span>${escapeHtml(sLabel)}${sHint ? `<br><small class="hint">${escapeHtml(sHint)}</small>` : ''}</span></label>`;
  openModal({
    sTitle: 'Notification settings',
    sSize: 'sm',
    sBodyHtml: `<fieldset class="choice-group"><legend>Show in Pira</legend>${NOTIFICATION_EVENTS.map((oEvent) => fnCheck(oEvent.sPreference, oEvent.label)).join('')}</fieldset>
      <fieldset class="choice-group"><legend>Also send</legend>
        ${fnCheck('bEmail', 'Email', 'Needs the optional Pira notification flow. Ask your Pira administrator if emails don\'t arrive.')}
        ${fnCheck('bTeams', 'Teams message', 'Needs the optional Pira notification flow.')}</fieldset>
      <p class="hint">Bulk edits always send one summary instead of a message per issue. You never get notified about your own changes.</p>`,
    aActions: [
      { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oModal) => oModal.close(null) },
      {
        sLabel: 'Save', sKind: 'primary',
        fnClick: async (oModal, iIndex) => {
          const oNext = Object.fromEntries(qsa('[data-pref]', oModal.eModal).map((eInput) => [eInput.dataset.pref, eInput.checked]));
          oModal.setBusy(true, iIndex);
          try {
            await data().saveNotificationPreferences(oNext);
            oModal.close(true);
            showToast('Notification settings saved');
            refreshUnreadCount();
            if (oNotify.ePanel) loadNotifications(false);
          } catch (oError) {
            oModal.setBusy(false, iIndex);
            showToast(toFriendlyMessage(oError), { sKind: 'error' });
          }
        },
      },
    ],
  });
}

function togglePanel() {
  if (oNotify.ePanel) { closePanel(); return; }
  const ePanel = document.createElement('div');
  ePanel.className = 'notify-panel';
  ePanel.setAttribute('role', 'dialog');
  ePanel.setAttribute('aria-label', 'Notifications');
  document.body.appendChild(ePanel);
  oNotify.ePanel = ePanel;
  qs('#notifyButton').setAttribute('aria-expanded', 'true');
  document.addEventListener('mousedown', fnOutside, true);
  document.addEventListener('keydown', fnKeys, true);
  loadNotifications(false);
  refreshUnreadCount();
}

// Polls the unread count while the app is visible; no polling in background tabs.
export function initNotifications() {
  qs('#notifyButton').addEventListener('click', togglePanel);
  refreshUnreadCount();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshUnreadCount(); });
  setInterval(() => { if (document.visibilityState === 'visible') refreshUnreadCount(); }, NOTIFICATION_POLL_MS);
}
