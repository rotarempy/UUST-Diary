document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => { currentView = tab.dataset.view; render(); });
document.getElementById('closeModal').onclick = closeModal;
function shiftWeek(delta) { currentWeekStart.setDate(currentWeekStart.getDate() + delta * 7); currentView = 'days'; render(); if (scheduleClient) refreshSchedule(); }
function goToToday() { currentWeekStart = startOfWeek(dateFromISO(scheduleClient?.today() || ufaToday())); currentView = 'days'; render(); if (scheduleClient) refreshSchedule(); }
document.getElementById('prevWeek').onclick = () => shiftWeek(-1);
document.getElementById('nextWeek').onclick = () => shiftWeek(1);
document.getElementById('todayBtn').onclick = goToToday;
document.getElementById('refreshSchedule').onclick = refreshSchedule;
const groupSearch = document.getElementById('groupSearch');
groupSearch.onfocus = showGroupResults;
groupSearch.oninput = () => { groupCursor = -1; showGroupResults(); };
groupSearch.onkeydown = event => {
  const rows = filteredGroups();
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    groupCursor = Math.max(0, Math.min(rows.length - 1, groupCursor + (event.key === 'ArrowDown' ? 1 : -1)));
    renderGroupResults(); document.getElementById('group-option-' + groupCursor)?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter' && rows[groupCursor]) { event.preventDefault(); selectGroup(rows[groupCursor]); }
  else if (event.key === 'Escape') { hideGroupResults(); groupSearch.value = db.selectedGroup?.name || ''; }
};
document.addEventListener('click', event => {
  if (!document.getElementById('groupPicker').contains(event.target)) { hideGroupResults(); groupSearch.value = db.selectedGroup?.name || ''; }
  const pair = event.target.closest('[data-pair]'), lecture = event.target.closest('[data-lecture]'), draft = event.target.closest('[data-draft]');
  if (pair) openPair(pair.dataset.pair); else if (lecture) openLecture(lecture.dataset.lecture); else if (draft) openDraft(draft.dataset.draft);
});
// Close only when both press and release are on the backdrop; dragging from the editor never closes it.
function bindBackdrop(id, close) {
  const overlay = document.getElementById(id);
  let startedOutside = false, pointer = null;
  overlay.addEventListener('pointerdown', event => {
    startedOutside = event.target === overlay && event.button === 0; pointer = event.pointerId;
  });
  overlay.addEventListener('pointerup', event => {
    const shouldClose = startedOutside && pointer === event.pointerId && event.target === overlay;
    startedOutside = false; pointer = null;
    if (shouldClose) close();
  });
  overlay.addEventListener('pointercancel', () => { startedOutside = false; pointer = null; });
}
bindBackdrop('lectureModal', closeModal); bindBackdrop('settingsModal', closeSettingsModal);
document.addEventListener('keydown', event => {
  const overlay = document.getElementById('lectureModal');
  if (!overlay.classList.contains('hidden')) {
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
    if (event.key === 'Tab') {
      const elements = [...overlay.querySelectorAll('button, input, textarea, a[href], summary, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === document.getElementById('modalBox'))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (!document.getElementById('settingsModal').classList.contains('hidden')) { if (event.key === 'Escape') closeSettingsModal(); return; }
  if (['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); currentView === 'calendar' ? shiftCalendarMonth(-1) : shiftWeek(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); currentView === 'calendar' ? shiftCalendarMonth(1) : shiftWeek(1); }
});
document.getElementById('settingsBtn').onclick = openSettingsModal;
document.getElementById('closeSettings').onclick = closeSettingsModal;
document.getElementById('themeGrid').onclick = event => {
  const card = event.target.closest('[data-theme-choice]');
  if (card) { appearance.theme = card.dataset.themeChoice; applyAppearance(appearance); }
};
document.querySelectorAll('[data-appearance-mode]').forEach(button => button.onclick = () => { appearance.mode = button.dataset.appearanceMode; applyAppearance(appearance); });
document.getElementById('scaleRange').oninput = event => { appearance.scale = Number(event.target.value); applyAppearance(appearance); };
document.getElementById('resetScale').onclick = () => { appearance.scale = 100; applyAppearance(appearance); };
document.getElementById('exportDataBtn').onclick = exportDataToJson;
document.getElementById('importDataBtn').onclick = () => { document.getElementById('importDataFile').value = ''; document.getElementById('importDataFile').click(); };
document.getElementById('importDataFile').onchange = event => { if (event.target.files[0]) importDataFromJson(event.target.files[0]); };
window.addEventListener('pagehide', () => { if (materialState?.mode === 'editor') { captureDraft(); saveDB(); } });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && materialState?.mode === 'editor') { captureDraft(); saveDB(); }
  if (document.visibilityState === 'visible') {
    updateCurrentDateTitle();
  }
});

document.getElementById('clearAllDataBtn').onclick = clearAllAppData;
