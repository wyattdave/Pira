// Create / rename boards. Extra boards show only the issues added to them; the default board shows the whole project.
import { BOARD_TYPES, LIMITS } from '../../config/app-config.js';
import { toFriendlyMessage } from '../domain.js';
import { data, emit } from './context.js';
import { qs, escapeHtml, openModal, showToast, showFieldErrors } from './dom.js';

// Resolves with the saved board (create) / true (edit), or null when cancelled.
export function openBoardEditor({ oProject, oBoard = null }) {
  return new Promise((fnResolve) => {
    openModal({
      sTitle: oBoard ? `Edit ${oBoard.sName}` : 'Create board',
      fnOnClose: (result) => fnResolve(result || null),
      sBodyHtml: `
        <label class="field">Board name <b class="req">*</b><input class="inp" data-field="sName" maxlength="${LIMITS.boardNameMax}" value="${escapeHtml(oBoard ? oBoard.sName : '')}" autocomplete="off" placeholder="e.g. Design board"><span class="err" data-error-for="sName"></span></label>
        <label class="field">Board type<select class="sel" data-field="iType">${BOARD_TYPES.map((oType) => `<option value="${oType.value}"${oBoard && oBoard.iType === oType.value ? ' selected' : ''}>${escapeHtml(oType.label)}</option>`).join('')}</select>
          <span class="hint">Scrum boards show only the board's active sprint. Kanban boards show all their issues.</span><span class="err" data-error-for="iType"></span></label>
        ${oBoard && oBoard.bDefault ? '<p class="hint">This is the project\'s default board, so it always shows every issue.</p>' : (oBoard ? '' : '<p class="hint">New boards start empty. Add issues from the issue panel (Boards) or create issues on the board.</p>')}`,
      aActions: [
        { sLabel: 'Cancel', sKind: 'ghost', fnClick: (oHandle) => oHandle.close(null) },
        {
          sLabel: oBoard ? 'Save' : 'Create board', sKind: 'primary',
          fnClick: async (oHandle, iActionIndex) => {
            const oDraft = { sName: qs('[data-field="sName"]', oHandle.eModal).value.trim(), iType: Number(qs('[data-field="iType"]', oHandle.eModal).value) };
            if (!oDraft.sName) { showFieldErrors(oHandle.eModal, { sName: 'Board name is required.' }); return; }
            oHandle.setBusy(true, iActionIndex);
            try {
              const result = oBoard ? await data().updateBoard(oProject, oBoard, oDraft) : await data().createBoard(oProject, oDraft);
              data().invalidateCache(`boards:${oProject.sId}`);
              emit('boards:changed', oProject.sId);
              showToast(oBoard ? 'Board saved' : `${oDraft.sName} created`);
              oHandle.close(result || true);
            } catch (oError) {
              oHandle.setBusy(false, iActionIndex);
              if (oError.details) showFieldErrors(oHandle.eModal, oError.details);
              showToast(toFriendlyMessage(oError), { sKind: 'error' });
            }
          },
        },
      ],
    });
  });
}
