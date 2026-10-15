let scheduleClient = null;
const scheduleClients = new Map();
const scheduleEntries = new Set();
let scheduleBusy = false;
let scheduleRefreshId = 0;
let scheduleMessage = '';
let groupList = [];
let groupLoading = null;
let groupError = '';
let groupCursor = -1;
const scheduleConfig = window.LECTURES_SCHEDULE_CONFIG || {};
const scheduleBaseUrl = scheduleConfig.endpoint;
function normalizeGroups(rows) {
  if (!Array.isArray(rows)) throw new Error('Источник вернул неверный список групп');
  const unique = new Map();
  rows.forEach(row => {
    const id = Number(row.uust_api_id ?? row.id);
    const name = String(row.title ?? row.name ?? '').trim();
    if (!Number.isSafeInteger(id) || id < 1 || !name) throw new Error('Неверный формат группы');
    unique.set(id, { id, name });
  });
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
}
async function loadGroups(force = false) {
  if (scheduleConfig.staticOnly && publishedSchedule) {
    groupList = normalizeGroups(publishedSchedule.groups); groupError = ''; renderGroupResults(); return;
  }
  if (groupLoading) return groupLoading;
  groupLoading = (async () => {
    if (!force) {
      try {
        const cache = await idbGet('data', 'schedule_groups:' + scheduleBaseUrl);
        if (cache?.groups?.length) groupList = normalizeGroups(cache.groups);
      } catch (_) {}
      if (groupList.length) { renderGroupResults(); return; }
    }
    if (!groupList.length && window.UUST_OFFICIAL_SEED?.groups) groupList = normalizeGroups(UUST_OFFICIAL_SEED.groups);
    groupError = ''; renderGroupResults(true);
    try {
      const html = await UustOfficialClient.request(scheduleBaseUrl, { text_search_group: '', week: scheduleConfig.bootstrapWeek || 7, funct: 'filter_group' });
      groupList = normalizeGroups(UustOfficialParser.parseGroups(html));
      try { await idbPut('data', 'schedule_groups:' + scheduleBaseUrl, { groups: groupList }); } catch (_) {}
    } catch (error) {
      if (!groupList.length && window.UUST_OFFICIAL_SEED?.groups) groupList = normalizeGroups(UUST_OFFICIAL_SEED.groups);
      groupError = scheduleConfig.staticOnly ? '' : (error.message || 'Источник недоступен') + (groupList.length ? '. Доступен сохранённый список групп.' : '. Не удалось загрузить группы.');
    }
    renderGroupResults();
  })().finally(() => { groupLoading = null; });
  return groupLoading;
}
function filteredGroups() {
  const query = document.getElementById('groupSearch').value.toLocaleLowerCase('ru').replace(/\s+/g, '');
  return groupList.filter(g => g.name.toLocaleLowerCase('ru').replace(/\s+/g, '').includes(query)).slice(0, 80);
}
function renderGroupResults(loading = false) {
  const list = document.getElementById('groupResults');
  const rows = filteredGroups();
  list.innerHTML = '';
  if (loading || groupError || !rows.length) {
    const message = document.createElement('div'); message.className = 'group-message';
    message.textContent = loading ? 'Загружаем группы…' : groupError || 'Группы не найдены';
    list.append(message);
    if (groupError) {
      const retry = document.createElement('button'); retry.className = 'btn secondary sm'; retry.textContent = 'Повторить';
      retry.onclick = () => loadGroups(true); list.append(retry);
    }
  }
  rows.forEach((group, i) => {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'group-option';
    item.id = 'group-option-' + i; item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(i === groupCursor)); item.textContent = group.name;
    item.classList.toggle('selected', i === groupCursor);
    item.onclick = () => selectGroup(group); list.append(item);
  });
  const input = document.getElementById('groupSearch');
  if (groupCursor >= 0 && rows[groupCursor]) input.setAttribute('aria-activedescendant', 'group-option-' + groupCursor);
  else input.removeAttribute('aria-activedescendant');
}
function showGroupResults() {
  document.getElementById('groupResults').classList.remove('hidden');
  document.getElementById('groupSearch').setAttribute('aria-expanded', 'true');
  renderGroupResults(); loadGroups();
}
function hideGroupResults() {
  document.getElementById('groupResults').classList.add('hidden');
  document.getElementById('groupSearch').setAttribute('aria-expanded', 'false');
  document.getElementById('groupSearch').removeAttribute('aria-activedescendant');
  groupCursor = -1;
}
function restoreSelectedGroup() {
  document.getElementById('groupSearch').value = db.selectedGroup?.name || '';
  if (db.selectedGroup && !scheduleClients.has(db.selectedGroup.id)) {
    scheduleClients.set(db.selectedGroup.id, new UustOfficialClient({ groupId: db.selectedGroup.id, endpoint: scheduleBaseUrl, bootstrapWeek: scheduleConfig.bootstrapWeek || 7 }));
  }
  scheduleClient = db.selectedGroup ? scheduleClients.get(db.selectedGroup.id) : null;
}
async function selectGroup(group) {
  closeModal();
  db.selectedGroup = { id: group.id, name: group.name };
  restoreSelectedGroup(); hideGroupResults();
  currentWeekStart = dateFromISO(scheduleClient.today());
  currentView = 'days'; scheduleMessage = ''; render();
  await saveDB();
  await enterSchedule();
}
// Once per group per page load: refresh the current week and all saved weeks.
// Navigation itself never refreshes a cached week.
async function enterSchedule() {
  const client = scheduleClient;
  if (!client || scheduleEntries.has(client)) return refreshSchedule();
  scheduleEntries.add(client);
  const current = toISODate(startOfWeek(new Date(currentWeekStart)));
  const saved = Object.keys(client.snapshots).filter(day => day !== current);
  await refreshSchedule({ force: true });
  for (const day of saved) {
    try { await client.sync({ date: day }); } catch (_) { /* Keep offline copy. */ }
    if (client === scheduleClient && toISODate(startOfWeek(new Date(currentWeekStart))) === day) render();
  }
}
async function refreshSchedule({ force = false } = {}) {
  if (!scheduleClient) { showGroupResults(); return; }
  const client = scheduleClient;
  const refreshId = ++scheduleRefreshId;
  const requestedMonday = startOfWeek(new Date(currentWeekStart)).getTime();
  if (!force && client.getStatus(toISODate(currentWeekStart)).hasCache) {
    scheduleBusy = false; scheduleMessage = ''; render(); return;
  }
  scheduleBusy = true; scheduleMessage = ''; render();
  try {
    const requestedDate = toISODate(currentWeekStart);
    const result = await client.sync({ date: requestedDate, force });
    if (refreshId !== scheduleRefreshId || client !== scheduleClient || requestedMonday !== startOfWeek(new Date(currentWeekStart)).getTime()) return;
    scheduleMessage = scheduleConfig.staticOnly ? '' : result.reason === 'empty-response' ? 'Источник вернул пустой ответ. Сохранённое расписание оставлено.' : result.warning || '';
  } catch (error) {
    if (refreshId !== scheduleRefreshId || client !== scheduleClient || requestedMonday !== startOfWeek(new Date(currentWeekStart)).getTime()) return;
    const reason = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'Источник не ответил вовремя' : error.message || 'Ошибка соединения';
    scheduleMessage = scheduleConfig.staticOnly ? '' : 'Не удалось обновить расписание: ' + reason + '. ' + (client.getStatus(toISODate(currentWeekStart)).hasCache ? 'Показана сохранённая версия этой недели.' : 'Для этой недели нет сохранённых данных. Проверьте соединение с источником.');

  } finally {
    if (refreshId === scheduleRefreshId && client === scheduleClient) { scheduleBusy = false; render(); }
  }
}
function dateFromISO(iso) { return new Date(iso + 'T12:00:00'); }
function currentLesson(id) {
  return scheduleClient?.getWeek(toISODate(currentWeekStart)).flatMap(day => day.lessons).find(l => l.occurrenceId === id);
}
function ensureSubject(lesson) {
  let subject = db.subjects.find(s => s.name.trim().toLocaleLowerCase('ru') === lesson.title.trim().toLocaleLowerCase('ru'));
  if (!subject) { subject = { id: uuid(), name: lesson.title }; db.subjects.push(subject); }
  return subject.id;
}
