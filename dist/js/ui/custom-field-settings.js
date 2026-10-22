// Project settings → Custom fields: a controlled set of types (text, number, date, yes/no, single choice).
// Fields show in the issue panel under Details for the issue types chosen; values are validated by type on save.
import { CUSTOM_FIELD_TYPES, ISSUE_TYPES, LIMITS } from '../../config/app-config.js';
import { getCustomFieldType, getIssueType, validateCustomFieldDraft, parseChoiceOptions, toFriendlyMessage } from '../domain.js';
import { oApp, data, emit } from './context.js';
import { qs, qsa, escapeHtml, skeletonRows, renderError, showToast, openModal, showFieldErrors, setBusy } from './dom.js';

const CHOICE_TYPE = CUSTOM_FIELD_TYPES.find((oType) => oType.key === 'choice').value;

const whereText = (aIssueTypes) => `Issue panel → Details, for ${aIssueTypes && aIssueTypes.length ? aIssueTypes.map((iType) => getIssueType(iType).label).join(', ') : 'every issue type'}`;

function readDraft(eModal, oField) {
  const fnValue = (sField) => qs(`[data-field="${sField}"]`, eModal).value;
  return {
    sName: fnValue('sName').trim(),
    iType: oField ? oField.iType : Number(fnValue('iType')),
    sOptions: fnValue('sOptions'),
    sDescription: fnValue('sDescription').trim(),
    aIssueTypes: qsa('[data-issue-type]', eModal).filter((eInput) => eInput.checked).map((eInput) => Number(eInput.dataset.issueType)),
  };
}

function openFieldEditor({ oProject, oField = null }) {
  return new Promise((fnResolve) => {
    const iType = oField ? oField.iType : CUSTOM_FIELD_TYPES[0].value;
    const oModal = openModal({
      sTitle: oField ? `Edit ${oField.sName}` : 'Add custom field',
      sBodyHtml: `
        <div class="row2">
          <label class="field">Name <b class="req">*</b><input class="inp" data-field="sName" maxlength="${LIMITS.customFieldNameMax}" value="${escapeHtml(oField ? oField.sName : '')}" autocomplete="off"><span class="err" data-error-for="sName"></span></label>
          <label class="field">Type<select class="sel" data-field="iType"${oField ? ' disabled' : ''}>${CUSTOM_FIELD_TYPES.map((oType) => `<option value="${oType.value}"${oType.value === iType ? ' selected' : ''}>${escapeHtml(oType.label)}</option>`).join('')}</select>
            <span class="hint">${oField ? 'The type can\'t change once values may exist.' : 'Can\'t be changed later.'}</span><span class="err" data-error-for="iType"></span></label>
        </div>
        <label class="field" id="cfOptionsField"${iType === CHOICE_TYPE ? '' : ' hidden'}>Options <b class="req">*</b><textarea class="txt" data-field="sOptions" rows="4" placeholder="One option per line">${escapeHtml(oField ? oField.sOptions : '')}</textarea>
          <span class="hint">Up to ${LIMITS.customFieldOptionsMax} options. Removing an option keeps existing values but they can't be chosen again.</span><span class="err" data-error-for="sOptions"></span></label>
        <fieldset class="choice-group"><legend>Issue types (none ticked = all)</legend><div class="cf-types">${ISSUE_TYPES.map((oType) => `<label class="check"><input type="checkbox" data-issue-type="${oType.value}"${oField && oField.aIssueTypes.includes(oType.value) ? ' checked' : ''}> ${escapeHtml(oType.label)}</label>`).join('')}</div><span class="err" data-error-for="aIssueTypes"></span></fieldset>
        <label class="field">Help text<input class="inp" data-field="sDescription" maxlength="${LIMITS.customFieldDescriptionMax}" value="${escapeHtml(oField ? oField.sDescription : '')}" placeholder="Shown under the field"><span class="err" data-error-for="sDescription"></span></label>
        <p class="hint" id="cfWhere">Shown in: ${escapeHtml(whereText(oField ? oField.aIssueTypes : []))}.</p>`,
      fnOnClose: (result) => fnResolve(result || null),
      aActions: [
        { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
        {
          sLabel: oField ? 'Save field' : 'Add field', sKind: 'primary',
          fnClick: async (oHandle, iIndex) => {
            const oDraft = readDraft(oHandle.eModal, oField);
            const { bValid, oErrors } = validateCustomFieldDraft(oDraft);
            showFieldErrors(oHandle.eModal, oErrors);
            if (!bValid) return;
            oHandle.setBusy(true, iIndex);
            try {
              const oSaved = oField ? await data().updateCustomField(oProject, oField, oDraft) : await data().createCustomField(oProject, oDraft);
              oHandle.close(oSaved);
            } catch (oError) {
              oHandle.setBusy(false, iIndex);
              if (oError.details) showFieldErrors(oHandle.eModal, oError.details);
              showToast(toFriendlyMessage(oError), { sKind: 'error' });
            }
          },
        },
      ],
    });
    const eType = qs('[data-field="iType"]', oModal.eModal);
    eType.addEventListener('change', () => { qs('#cfOptionsField', oModal.eModal).hidden = Number(eType.value) !== CHOICE_TYPE; });
    qsa('[data-issue-type]', oModal.eModal).forEach((eInput) => eInput.addEventListener('change', () => {
      qs('#cfWhere', oModal.eModal).textContent = `Shown in: ${whereText(readDraft(oModal.eModal, oField).aIssueTypes)}.`;
    }));
  });
}

export async function renderCustomFieldsTab(eBody, oState) {
  const oProject = oApp.oProject;
  const iEpoch = ++oState.iEpoch;
  eBody.innerHTML = skeletonRows(4, 'sk-row');
  let aFields;
  try {
    data().invalidateCache(`customfields:${oProject.sId}`);
    aFields = await data().listCustomFields(oProject.sId, true);
  } catch (oError) {
    if (iEpoch === oState.iEpoch) renderError(eBody, toFriendlyMessage(oError), () => renderCustomFieldsTab(eBody, oState));
    return;
  }
  if (iEpoch !== oState.iEpoch) return;
  const aActive = aFields.filter((oField) => oField.bActive);
  eBody.innerHTML = `<p class="hint" style="margin-bottom:12px;max-width:820px">Custom fields appear in the issue panel under Details, for the issue types you choose. Supported types: text, number, date, yes/no and single choice (no formulas). Values are checked against the type when an issue is saved. Retire a field to hide it; its values are kept. ${aActive.length}/${LIMITS.customFieldsPerProject} active.</p>
    <div class="settings-list" style="margin-bottom:12px">${aFields.map((oField) => {
      const iIndex = aActive.indexOf(oField);
      return `<div class="cf-row${oField.bActive ? '' : ' inactive'}" data-field-id="${escapeHtml(oField.sId)}">
        <span><b>${escapeHtml(oField.sName)}</b>${oField.bActive ? '' : ' <span class="pill">Retired</span>'}${oField.sDescription ? `<br><small class="hint">${escapeHtml(oField.sDescription)}</small>` : ''}</span>
        <span class="pill">${escapeHtml((getCustomFieldType(oField.iType) || {}).label || 'Unknown')}</span>
        <span class="hint">${escapeHtml(whereText(oField.aIssueTypes))}${oField.iType === CHOICE_TYPE ? `<br>Options: ${escapeHtml(parseChoiceOptions(oField.sOptions).join(', '))}` : ''}</span>
        <span style="display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">
          ${oField.bActive ? `<button class="btn btn-quiet" type="button" data-up${iIndex <= 0 ? ' disabled' : ''} aria-label="Move ${escapeHtml(oField.sName)} up">↑</button><button class="btn btn-quiet" type="button" data-down${iIndex === aActive.length - 1 ? ' disabled' : ''} aria-label="Move ${escapeHtml(oField.sName)} down">↓</button>` : ''}
          <button class="btn btn-quiet" type="button" data-edit>Edit</button>
          <button class="btn btn-quiet" type="button" data-toggle>${oField.bActive ? 'Retire' : 'Restore'}</button></span></div>`;
    }).join('') || '<p class="hint" style="padding:12px">No custom fields yet.</p>'}</div>
    <button class="btn btn-ghost" type="button" id="cfAdd"${aActive.length >= LIMITS.customFieldsPerProject || oProject.bArchived ? ' disabled' : ''}>+ Add custom field</button>`;
  const fnChanged = () => { emit('customfields:changed', oProject.sId); renderCustomFieldsTab(eBody, oState); };
  qs('#cfAdd', eBody).addEventListener('click', async () => {
    const oSaved = await openFieldEditor({ oProject });
    if (oSaved) { showToast(`${oSaved.sName} added`); fnChanged(); }
  });
  qsa('[data-field-id]', eBody).forEach((eRow) => {
    const oField = aFields.find((oItem) => oItem.sId === eRow.dataset.fieldId);
    qs('[data-edit]', eRow).addEventListener('click', async () => {
      const oSaved = await openFieldEditor({ oProject, oField });
      if (oSaved) { showToast(`${oSaved.sName} saved`); fnChanged(); }
    });
    qs('[data-toggle]', eRow).addEventListener('click', async (oEvent) => {
      setBusy(oEvent.currentTarget, true);
      try {
        await data().updateCustomField(oProject, oField, { bActive: !oField.bActive });
        showToast(`${oField.sName} ${oField.bActive ? 'retired' : 'restored'}`);
        fnChanged();
      } catch (oError) {
        setBusy(oEvent.currentTarget, false);
        showToast(toFriendlyMessage(oError), { sKind: 'error' });
      }
    });
    const fnSwap = async (iOffset) => {
      const iIndex = aActive.indexOf(oField);
      if (!aActive[iIndex + iOffset]) return;
      const aNext = [...aActive];
      [aNext[iIndex], aNext[iIndex + iOffset]] = [aNext[iIndex + iOffset], aNext[iIndex]];
      try {
        await Promise.all(aNext.filter((oItem, iPosition) => oItem.iOrder !== iPosition)
          .map((oItem) => data().updateCustomField(oProject, oItem, { iOrder: aNext.indexOf(oItem) })));
        fnChanged();
      } catch (oError) {
        showToast(toFriendlyMessage(oError), { sKind: 'error' });
        fnChanged();
      }
    };
    const eUp = qs('[data-up]', eRow);
    if (eUp) eUp.addEventListener('click', () => fnSwap(-1));
    const eDown = qs('[data-down]', eRow);
    if (eDown) eDown.addEventListener('click', () => fnSwap(1));
  });
}
