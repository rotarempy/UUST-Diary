function ufaToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Yekaterinburg', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
(async function init() {
  updateCurrentDateTitle();
  bindTransfers();
  await loadPublishedSchedule();
  let loaded = await loadDataFromIDB();
  if (!loaded && loadFromLegacyLocalStorage()) await saveDB();
  db = normalizeDB(db); restoreSelectedGroup();
  currentWeekStart = startOfWeek(dateFromISO(scheduleClient?.today() || ufaToday()));
  render();
  if (scheduleClient) enterSchedule();
})();
