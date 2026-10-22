// CSV export (what the Issues list shows you) and CSV import with a dry run first and per-row results (Phase 4).
import { LIMITS } from '../../config/app-config.js';
import { toFriendlyMessage, buildCsv } from '../domain.js';
import { data } from './context.js';
import { qs, escapeHtml, openModal, showToast, saveFile, ICONS } from './dom.js';

const TEMPLATE_HEADERS = Object.freeze(['Summary', 'Description', 'Type', 'Priority', 'Assignee', 'Labels', 'Story points', 'Due date', 'Original estimate', 'Fix version']);
const TEMPLATE_EXAMPLE = Object.freeze(['Example: tidy the login page', 'Optional details', 'Task', 'Medium', 'name@contoso.com', 'ux; login', '3', '2026-12-01', '1d 4h', '']);

export async function exportIssuesCsv(oProject, oCriteria, eButton = null) {
  if (eButton) eButton.setAttribute('aria-busy', 'true');
  try {
    const { sCsv, iCount, bTruncated, sFileName } = await data().exportIssues(oProject, oCriteria);
    saveFile(`\uFEFF${sCsv}`, sFileName, 'text/csv;charset=utf-8');
    showToast(`Exported ${iCount} issue${iCount === 1 ? '' : 's'}`);
    if (bTruncated) showToast(`Only the first ${LIMITS.csvExportMax} issues were exported. Narrow the filter to export the rest.`, { sKind: 'error' });
  } catch (oError) {
    showToast(toFriendlyMessage(oError), { sKind: 'error' });
  } finally {
    if (eButton) eButton.setAttribute('aria-busy', 'false');
  }
}

const outcomeHtml = (sOutcome, sText) => `<span class="outcome ${escapeHtml(sOutcome)}">${escapeHtml(sText)}</span>`;

function previewHtml(oPlan) {
  if (oPlan.sError) return `<p class="err">${escapeHtml(oPlan.sError)}</p>`;
  return `<p><b>${oPlan.iCreate}</b> issue${oPlan.iCreate === 1 ? '' : 's'} ready to create${oPlan.iError ? ` · <b>${oPlan.iError}</b> row${oPlan.iError === 1 ? '' : 's'} with problems (skipped)` : ''}.</p>
    ${oPlan.aIgnored.length ? `<p class="hint">Ignored columns: ${escapeHtml(oPlan.aIgnored.join(', '))}. Status is never imported: new issues start in the workflow's initial status.</p>` : '<p class="hint">New issues start in the workflow\'s initial status.</p>'}
    <div class="bulk-scroll"><table class="bulk-table"><thead><tr><th scope="col">Line</th><th scope="col">Summary</th><th scope="col">Result</th></tr></thead>
    <tbody>${oPlan.aRows.map((oRow) => `<tr><td>${oRow.iLine}</td><td>${escapeHtml(oRow.sSummary || '(blank)')}</td>
      <td>${oRow.sOutcome === 'create' ? outcomeHtml('change', 'Will create') : `${outcomeHtml('blocked', 'Skipped')}<br><span class="hint">${escapeHtml(oRow.aErrors.join(' '))}</span>`}${oRow.aWarnings.length ? `<br><span class="hint">${escapeHtml(oRow.aWarnings.join(' '))}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function resultsHtml(oResult) {
  return `<p><b>${oResult.iSucceeded}</b> created${oResult.iFailed ? ` · <b>${oResult.iFailed}</b> failed` : ''}${oResult.iSkipped ? ` · ${oResult.iSkipped} skipped in the preview` : ''}.</p>
    <div class="bulk-scroll"><table class="bulk-table"><thead><tr><th scope="col">Line</th><th scope="col">Summary</th><th scope="col">Result</th></tr></thead>
    <tbody>${oResult.aResults.map((oRow) => `<tr><td>${oRow.iLine}</td><td>${escapeHtml(oRow.sSummary)}</td><td>${oRow.sOutcome === 'success' ? outcomeHtml('success', oRow.sKey) : `${outcomeHtml('failed', 'Failed')}<br><span class="hint">${escapeHtml(oRow.sReason)}</span>`}</td></tr>`).join('')}</tbody></table></div>`;
}

// fnDone(bCreatedAny) runs once when the dialog closes.
export function openCsvImport(oProject, fnDone) {
  const oState = { sCsv: '', oPlan: null, oResult: null, bCreated: false, bBusy: false };
  const oModal = openModal({
    sTitle: `Import issues into ${oProject.sKey}`,
    sSize: 'lg',
    sBodyHtml: '',
    fnOnClose: () => fnDone(oState.bCreated),
    sFooterStartHtml: `<button class="btn btn-quiet" type="button" id="csvTemplate">${ICONS.download} Template</button>`,
    aActions: [
      { sLabel: 'Close', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
      { sLabel: 'Import', sKind: 'primary', fnClick: (oHandle, iIndex) => runImport(oHandle, iIndex, null) },
    ],
  });
  const eImport = qs('[data-action="1"]', oModal.eModal);
  qs('#csvTemplate', oModal.eModal).addEventListener('click', () => saveFile(`\uFEFF${buildCsv(TEMPLATE_HEADERS, [TEMPLATE_EXAMPLE])}`, 'pira-import-template.csv', 'text/csv;charset=utf-8'));

  function render() {
    const sBody = oState.oResult ? resultsHtml(oState.oResult) : (oState.oPlan ? previewHtml(oState.oPlan) : '');
    oModal.eBody.innerHTML = `<label class="field">CSV file (UTF-8, up to ${LIMITS.csvImportMax} issues)<input class="inp" type="file" id="csvFile" accept=".csv,text/csv"></label>
      <p class="hint">Columns (any order): ${escapeHtml(TEMPLATE_HEADERS.join(', '))}. Summary is required. Assignees are project members by email or full name; labels are separated by semicolons; dates are YYYY-MM-DD; estimates look like 1d 4h.</p>
      <div id="csvBody" aria-live="polite">${sBody}</div>
      ${oState.oResult && oState.oResult.iFailed ? '<button class="btn btn-ghost" type="button" id="csvRetry">Retry failed rows</button>' : ''}`;
    qs('#csvFile', oModal.eBody).addEventListener('change', (oEvent) => readFile(oEvent.target.files[0]));
    const eRetry = qs('#csvRetry', oModal.eBody);
    if (eRetry) eRetry.addEventListener('click', () => runImport(oModal, 1, oState.oResult.aResults.filter((oRow) => oRow.sOutcome === 'failed').map((oRow) => oRow.iLine)));
    eImport.disabled = oState.bBusy || Boolean(oState.oResult) || !oState.oPlan || Boolean(oState.oPlan.sError) || !oState.oPlan.iCreate;
    eImport.textContent = oState.oPlan && oState.oPlan.iCreate && !oState.oResult ? `Import ${oState.oPlan.iCreate} issue${oState.oPlan.iCreate === 1 ? '' : 's'}` : 'Import';
  }

  async function readFile(oFile) {
    if (!oFile) return;
    Object.assign(oState, { oPlan: null, oResult: null, sCsv: '' });
    if (oFile.size > LIMITS.csvImportBytes) {
      oState.oPlan = { sError: `Import files can be up to ${Math.round(LIMITS.csvImportBytes / 1024)} KB.` };
      render();
      return;
    }
    qs('#csvBody', oModal.eBody).innerHTML = '<p class="hint">Checking the file… nothing is created yet.</p>';
    try {
      oState.sCsv = await oFile.text();
      oState.oPlan = await data().previewCsvImport(oProject, oState.sCsv);
    } catch (oError) {
      oState.oPlan = { sError: toFriendlyMessage(oError) };
    }
    render();
  }

  async function runImport(oHandle, iIndex, aOnlyLines) {
    if (oState.bBusy || !oState.sCsv) return;
    oState.bBusy = true;
    oHandle.setBusy(true, iIndex);
    const eBody = qs('#csvBody', oModal.eBody);
    try {
      const oResult = await data().importCsvIssues(oProject, oState.sCsv, {
        aOnlyLines, fnProgress: (iDone, iTotal) => { eBody.innerHTML = `<p>Creating issues… ${iDone} of ${iTotal}</p>`; },
      });
      if (aOnlyLines && oState.oResult) {
        const oByLine = new Map(oResult.aResults.map((oRow) => [oRow.iLine, oRow]));
        const aMerged = oState.oResult.aResults.map((oRow) => oByLine.get(oRow.iLine) || oRow);
        oState.oResult = { ...oResult, aResults: aMerged, iSucceeded: aMerged.filter((oRow) => oRow.sOutcome === 'success').length, iFailed: aMerged.filter((oRow) => oRow.sOutcome === 'failed').length, iSkipped: oState.oResult.iSkipped };
      } else oState.oResult = oResult;
      if (oResult.iSucceeded) oState.bCreated = true;
      showToast(`${oResult.iSucceeded} issue${oResult.iSucceeded === 1 ? '' : 's'} imported${oResult.iFailed ? `, ${oResult.iFailed} failed` : ''}`, { sKind: oResult.iFailed ? 'error' : 'success' });
    } catch (oError) {
      showToast(toFriendlyMessage(oError), { sKind: 'error' });
    }
    oState.bBusy = false;
    oHandle.setBusy(false, iIndex);
    render();
  }

  render();
}
