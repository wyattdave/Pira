// Visual query builder (Phase 4): AND/OR conditions with one level of groups. Only allowlisted fields and operators are
// offered; the data layer re-checks everything and turns it into server-side OData.
import { QUERY_FIELDS, QUERY_OPERATORS, ISSUE_TYPES, PRIORITIES, RESOLUTIONS, STATUS_CATEGORIES, ISSUE_STATUSES, LIMITS } from '../../config/app-config.js';
import {
  getQueryField, queryOperatorsFor, queryOperatorTakesValues, queryOperatorTakesMany, queryOperatorTakesDays, validateQuery,
  getCustomFieldType, isFeatureEnabled, formatDuration, parseDuration, getSprintState, getVersionState, getIssueStatus,
} from '../domain.js';
import { qs, qsa, escapeHtml, ICONS } from './dom.js';

const CUSTOM_KINDS = Object.freeze({ text: 'cfText', number: 'cfNumber', date: 'cfDate', boolean: 'cfBoolean', choice: 'cfChoice' });

export const emptyQuery = () => ({ sJoin: 'and', aItems: [{ sField: 'status', sOp: 'in', aValues: [] }] });
export const cloneQuery = (oQuery) => JSON.parse(JSON.stringify(oQuery || emptyQuery()));

// oLookups: { aStatuses, aMembers, aLabels, aSprints, aVersions, aCustomFields }
function fieldOptions(oLookups) {
  const aBuiltIn = QUERY_FIELDS.filter((oField) => (oField.kind !== 'version' || isFeatureEnabled('releases'))
    && (oField.kind !== 'duration' || isFeatureEnabled('timeTracking')));
  const aCustom = (oLookups.aCustomFields || []).filter((oField) => CUSTOM_KINDS[(getCustomFieldType(oField.iType) || {}).key])
    .map((oField) => ({ key: `cf:${oField.sId.toLowerCase()}`, label: `${oField.sName}${oField.bActive ? '' : ' (retired)'}` }));
  return [...aBuiltIn.map((oField) => ({ key: oField.key, label: oField.label })), ...aCustom];
}

function valueChoices(oField, oLookups) {
  switch (oField.kind) {
    case 'status': return (oLookups.aStatuses && oLookups.aStatuses.length ? oLookups.aStatuses : ISSUE_STATUSES.map((oItem) => oItem.value)).map((iStatus) => [iStatus, getIssueStatus(iStatus).label]);
    case 'category': return STATUS_CATEGORIES.map((oItem) => [oItem.key, oItem.label]);
    case 'type': return ISSUE_TYPES.map((oItem) => [oItem.value, oItem.label]);
    case 'priority': return [...PRIORITIES].reverse().map((oItem) => [oItem.value, oItem.label]);
    case 'resolution': return RESOLUTIONS.map((oItem) => [oItem.value, oItem.label]);
    case 'user': return [['me', 'Me (whoever runs it)'], ...(oLookups.aMembers || []).map((oMember) => [oMember.sUserId.toLowerCase(), oMember.sUserName])];
    case 'label': return (oLookups.aLabels || []).map((oLabel) => [oLabel.sId.toLowerCase(), oLabel.sName]);
    case 'sprint': return (oLookups.aSprints || []).map((oSprint) => [oSprint.sId.toLowerCase(), `${oSprint.sName} · ${getSprintState(oSprint.iState).label}`]);
    case 'version': return (oLookups.aVersions || []).map((oVersion) => [oVersion.sId.toLowerCase(), `${oVersion.sName} · ${getVersionState(oVersion.iState).label}`]);
    case 'cfChoice': return (oField.oCustomField.aOptions || []).map((sOption) => [sOption, sOption]);
    default: return [];
  }
}

const NUMERIC_KINDS = Object.freeze(['status', 'type', 'priority', 'resolution']);

function valueControl(oRule, oField, sPath, oLookups) {
  if (!oField || !queryOperatorTakesValues(oRule.sOp)) return '';
  const sLabel = `${oField.label} value`;
  if (queryOperatorTakesMany(oRule.sOp)) {
    const aChoices = valueChoices(oField, oLookups);
    const sText = (value) => (aChoices.find(([choice]) => String(choice) === String(value)) || [value, 'Unknown'])[1];
    const aLeft = aChoices.filter(([choice]) => !oRule.aValues.map(String).includes(String(choice)));
    return `<span class="qb-values">${oRule.aValues.map((value, iIndex) => `<span class="lbl">${escapeHtml(sText(value))}<button type="button" data-remove-value="${sPath}:${iIndex}" aria-label="Remove ${escapeHtml(sText(value))}">×</button></span>`).join('')}
      ${aLeft.length && oRule.aValues.length < LIMITS.queryValuesMax ? `<label class="sr" for="qbAdd-${sPath}">Add ${escapeHtml(sLabel)}</label><select class="sel qb-add" id="qbAdd-${sPath}" data-add-value="${sPath}"><option value="">${oRule.aValues.length ? 'Add…' : 'Choose…'}</option>${aLeft.map(([choice, sName]) => `<option value="${escapeHtml(String(choice))}">${escapeHtml(sName)}</option>`).join('')}</select>` : ''}
      ${!aChoices.length ? '<span class="hint">Nothing to choose from yet.</span>' : ''}</span>`;
  }
  const value = oRule.aValues[0] ?? '';
  const sAttributes = `data-value="${sPath}" aria-label="${escapeHtml(sLabel)}"`;
  if (queryOperatorTakesDays(oRule.sOp)) return `<input class="inp qb-input" type="number" min="1" max="${LIMITS.queryDaysMax}" step="1" ${sAttributes} value="${escapeHtml(value)}" placeholder="days">`;
  switch (oField.kind) {
    case 'dateOnly': case 'dateTime': case 'cfDate': return `<input class="inp qb-input" type="date" ${sAttributes} value="${escapeHtml(value)}">`;
    case 'number': case 'cfNumber': return `<input class="inp qb-input" inputmode="decimal" ${sAttributes} value="${escapeHtml(value)}" placeholder="number">`;
    case 'duration': return `<input class="inp qb-input" ${sAttributes} data-duration value="${escapeHtml(oRule.sInput ?? formatDuration(value))}" placeholder="e.g. 1d 4h">`;
    default: return `<input class="inp qb-input" ${sAttributes} maxlength="${LIMITS.summaryMax}" value="${escapeHtml(value)}" placeholder="text">`;
  }
}

function ruleHtml(oRule, sPath, oLookups, oErrors) {
  const aFields = fieldOptions(oLookups);
  const oField = getQueryField(oRule.sField, oLookups.aCustomFields || []);
  const aOps = queryOperatorsFor(oField);
  return `<div class="qb-rule${oErrors[sPath] ? ' has-error' : ''}" data-path="${sPath}">
    <label class="sr" for="qbField-${sPath}">Field</label><select class="sel" id="qbField-${sPath}" data-field-select="${sPath}">${aFields.map((oItem) => `<option value="${escapeHtml(oItem.key)}"${oItem.key === oRule.sField ? ' selected' : ''}>${escapeHtml(oItem.label)}</option>`).join('')}</select>
    <label class="sr" for="qbOp-${sPath}">Condition</label><select class="sel" id="qbOp-${sPath}" data-op-select="${sPath}">${aOps.map((sOp) => `<option value="${sOp}"${sOp === oRule.sOp ? ' selected' : ''}>${escapeHtml(QUERY_OPERATORS[sOp])}</option>`).join('')}</select>
    ${valueControl(oRule, oField, sPath, oLookups)}
    <button class="icon-btn" type="button" data-remove-item="${sPath}" aria-label="Remove condition">${ICONS.close}</button>
    ${oErrors[sPath] ? `<span class="err">${escapeHtml(oErrors[sPath])}</span>` : ''}</div>`;
}

const joinToggle = (oGroup, sPath) => `<span class="qb-join" role="group" aria-label="Match">Match <button type="button" data-join="${sPath}:and" aria-pressed="${oGroup.sJoin === 'and'}">all (AND)</button><button type="button" data-join="${sPath}:or" aria-pressed="${oGroup.sJoin === 'or'}">any (OR)</button></span>`;

function itemAt(oQuery, sPath) {
  const [sTop, sInner] = String(sPath).split('.');
  const oTop = oQuery.aItems[Number(sTop)];
  return sInner === undefined ? oTop : oTop.aItems[Number(sInner)];
}

function removeAt(oQuery, sPath) {
  const [sTop, sInner] = String(sPath).split('.');
  if (sInner === undefined) oQuery.aItems.splice(Number(sTop), 1);
  else {
    const oGroup = oQuery.aItems[Number(sTop)];
    oGroup.aItems.splice(Number(sInner), 1);
    if (!oGroup.aItems.length) oQuery.aItems.splice(Number(sTop), 1);
  }
}

// Keeps values that still make sense for the new field/operator; resets the rest.
function resetRule(oRule, oField) {
  const aOps = queryOperatorsFor(oField);
  if (!aOps.includes(oRule.sOp)) oRule.sOp = aOps[0];
  if (!queryOperatorTakesValues(oRule.sOp)) oRule.aValues = [];
  if (!queryOperatorTakesMany(oRule.sOp)) oRule.aValues = oRule.aValues.slice(0, 1);
  delete oRule.sInput;
}

// Renders into eHost and edits oState.oDraft in place. fnApply(oQuery) runs a valid query.
export function mountQueryBuilder(eHost, oState, oLookups, fnApply) {
  let oErrors = {};
  let sGlobalError = '';
  const fnRender = (sFocusSelector = '') => {
    const oDraft = oState.oDraft;
    const sItems = oDraft.aItems.map((oItem, iIndex) => (oItem.aItems
      ? `<div class="qb-group" data-path="${iIndex}"><div class="qb-group-head">${joinToggle(oItem, String(iIndex))}<span class="spacer"></span>
          <button class="btn btn-quiet" type="button" data-add-rule="${iIndex}">+ Condition</button><button class="icon-btn" type="button" data-remove-item="${iIndex}" aria-label="Remove group">${ICONS.close}</button></div>
          ${oItem.aItems.map((oRule, iRule) => ruleHtml(oRule, `${iIndex}.${iRule}`, oLookups, oErrors)).join('')}${oErrors[String(iIndex)] ? `<span class="err">${escapeHtml(oErrors[String(iIndex)])}</span>` : ''}</div>`
      : ruleHtml(oItem, String(iIndex), oLookups, oErrors))).join(`<div class="qb-sep">${oDraft.sJoin.toUpperCase()}</div>`);
    eHost.innerHTML = `<div class="query-builder" role="group" aria-label="Advanced query">
      <div class="qb-head">${joinToggle(oDraft, 'root')}<span class="spacer"></span><span class="hint">Runs on the server as you. Not JQL: only these fields and conditions are supported.</span></div>
      ${sItems || '<p class="hint">No conditions yet.</p>'}
      <div class="qb-actions"><button class="btn btn-quiet" type="button" data-add-rule="root">+ Condition</button><button class="btn btn-quiet" type="button" id="qbAddGroup">+ Group</button>
        <span class="spacer"></span>${sGlobalError ? `<span class="err">${escapeHtml(sGlobalError)}</span>` : ''}
        <button class="btn btn-ghost" type="button" id="qbReset">Reset</button><button class="btn btn-primary" type="button" id="qbApply">Apply</button></div></div>`;
    wire();
    const eFocus = sFocusSelector ? qs(sFocusSelector, eHost) : null;
    if (eFocus) eFocus.focus();
  };
  const fnFieldFor = (oRule) => getQueryField(oRule.sField, oLookups.aCustomFields || []);
  const wire = () => {
    const oDraft = oState.oDraft;
    qsa('[data-join]', eHost).forEach((eButton) => eButton.addEventListener('click', () => {
      const [sPath, sJoin] = eButton.dataset.join.split(':');
      (sPath === 'root' ? oDraft : itemAt(oDraft, sPath)).sJoin = sJoin;
      fnRender(`[data-join="${sPath}:${sJoin}"]`);
    }));
    qsa('[data-field-select]', eHost).forEach((eSelect) => eSelect.addEventListener('change', () => {
      const oRule = itemAt(oDraft, eSelect.dataset.fieldSelect);
      oRule.sField = eSelect.value;
      oRule.aValues = [];
      resetRule(oRule, fnFieldFor(oRule));
      fnRender(`#${CSS.escape(eSelect.id)}`);
    }));
    qsa('[data-op-select]', eHost).forEach((eSelect) => eSelect.addEventListener('change', () => {
      const oRule = itemAt(oDraft, eSelect.dataset.opSelect);
      const bWasDays = queryOperatorTakesDays(oRule.sOp);
      oRule.sOp = eSelect.value;
      if (bWasDays !== queryOperatorTakesDays(oRule.sOp)) oRule.aValues = [];
      resetRule(oRule, fnFieldFor(oRule));
      fnRender(`#${CSS.escape(eSelect.id)}`);
    }));
    qsa('[data-add-value]', eHost).forEach((eSelect) => eSelect.addEventListener('change', () => {
      if (!eSelect.value) return;
      const oRule = itemAt(oDraft, eSelect.dataset.addValue);
      const oField = fnFieldFor(oRule);
      oRule.aValues.push(NUMERIC_KINDS.includes(oField.kind) ? Number(eSelect.value) : eSelect.value);
      fnRender(`#${CSS.escape(eSelect.id)}`);
    }));
    qsa('[data-remove-value]', eHost).forEach((eButton) => eButton.addEventListener('click', () => {
      const [sPath, sIndex] = eButton.dataset.removeValue.split(':');
      itemAt(oDraft, sPath).aValues.splice(Number(sIndex), 1);
      fnRender(`[data-add-value="${sPath}"]`);
    }));
    qsa('[data-value]', eHost).forEach((eInput) => eInput.addEventListener('input', () => {
      const oRule = itemAt(oDraft, eInput.dataset.value);
      const oField = fnFieldFor(oRule);
      const sText = eInput.value.trim();
      if (eInput.hasAttribute('data-duration')) {
        oRule.sInput = eInput.value;
        const { iMinutes } = parseDuration(sText);
        oRule.aValues = iMinutes === null ? [] : [iMinutes];
      } else if (queryOperatorTakesDays(oRule.sOp) || ['number', 'cfNumber'].includes(oField.kind)) {
        oRule.aValues = sText === '' ? [] : [Number(sText)];
      } else oRule.aValues = sText ? [sText] : [];
    }));
    qsa('[data-remove-item]', eHost).forEach((eButton) => eButton.addEventListener('click', () => { removeAt(oDraft, eButton.dataset.removeItem); oErrors = {}; fnRender('[data-add-rule="root"]'); }));
    qsa('[data-add-rule]', eHost).forEach((eButton) => eButton.addEventListener('click', () => {
      const sPath = eButton.dataset.addRule;
      const oTarget = sPath === 'root' ? oDraft : itemAt(oDraft, sPath);
      oTarget.aItems.push({ sField: 'status', sOp: 'in', aValues: [] });
      const sNew = sPath === 'root' ? String(oTarget.aItems.length - 1) : `${sPath}.${oTarget.aItems.length - 1}`;
      fnRender(`[data-field-select="${sNew}"]`);
    }));
    qs('#qbAddGroup', eHost).addEventListener('click', () => {
      oDraft.aItems.push({ sJoin: 'or', aItems: [{ sField: 'status', sOp: 'in', aValues: [] }] });
      fnRender(`[data-field-select="${oDraft.aItems.length - 1}.0"]`);
    });
    qs('#qbReset', eHost).addEventListener('click', () => { oState.oDraft = emptyQuery(); oErrors = {}; sGlobalError = ''; fnRender(); });
    qs('#qbApply', eHost).addEventListener('click', () => {
      const { bValid, aErrors, oQuery } = validateQuery(oState.oDraft, oLookups.aCustomFields || []);
      oErrors = Object.fromEntries(aErrors.filter((oItem) => oItem.sPath).map((oItem) => [oItem.sPath, oItem.sMessage]));
      sGlobalError = (aErrors.find((oItem) => !oItem.sPath) || {}).sMessage || '';
      if (!bValid) { fnRender(); return; }
      fnRender();
      fnApply(oQuery);
    });
  };
  fnRender();
}
