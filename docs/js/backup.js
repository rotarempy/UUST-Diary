// ===================== Export / Import JSON =====================
async function exportDataToJson() {
  try {
    captureDraft();
    await saveQueue.catch(() => {});
    const payload = { ...db, version: 7, exportedAt: new Date().toISOString() };
    const json = JSON.stringify(payload, null, 2);
    const stamp = toISODate(new Date());
    const defaultName = `uust-diary-backup-${stamp}.json`;

    if (window.LecturesPlatform?.saveBackup) {
      const result = await LecturesPlatform.saveBackup(defaultName,json);
      if (result.saved) showToast(result.shared ? 'Открыто окно сохранения файла' : 'Экспорт сохранён');
      return;
    }
    // The browser downloads the backup as a regular JSON file.
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('Экспорт сохранён');
  } catch (e) {
    console.error(e);
    alert('Не удалось экспортировать данные: ' + (e.message || e));
  }
}

async function importDataFromJson(file) {
  if (!file) return;
  try {
    const text = await file.text();
    let incoming;
    try {
      incoming = JSON.parse(text);
    } catch (_) {
      throw new Error('Файл не является корректным JSON');
    }
    if (!incoming || !Array.isArray(incoming.lectures)) {
      throw new Error('В файле нет поля lectures — это не резервная копия приложения');
    }
    const nL = (incoming.lectures || []).length;
    const nH = (incoming.homeworks || []).length;
    const nE = (incoming.exams || []).length;
    const nS = (incoming.subjects || []).length;
    if (!confirm(
      `Импорт заменит ВСЕ текущие данные.\n\n` +
      `В файле: ${nS} предметов, ${nL} лекций, ${nH} ДЗ, ${nE} экзаменов.\n\n` +
      `Продолжить?`
    )) return;

    // Backup current DB before overwrite
    try {
      await idbPut('data', 'pre_import_backup_' + Date.now(), db);
    } catch (_) {}

    closeModal();
    await saveQueue.catch(() => {});
    const previous = db;
    db = normalizeDB(incoming);
    if (!db.homeworks) db.homeworks = [];
    if (!await saveDB()) { db = previous; throw new Error('Не удалось сохранить импорт'); }
    restoreSelectedGroup(); scheduleMessage = '';
    currentWeekStart = startOfWeek(dateFromISO(scheduleClient?.today() || ufaToday()));
    render();
    if (scheduleClient) refreshSchedule();
    closeSettingsModal();
    showToast(`Импортировано: ${nL} лекций, ${nH} ДЗ, ${nE} экзаменов, ${nS} предметов`);
  } catch (e) {
    console.error(e);
    alert('Ошибка импорта: ' + (e.message || e));
  }
}
