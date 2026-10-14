// Local storage: IndexedDB. Works fully offline.
const IDB_NAME = 'lecture_app_db_v5';
const IDB_VER = 1;
const LS_LEGACY = 'lecture_app_cache_v4'; // migrate from old versions

let db = { subjects: [], lectures: [], homeworks: [], exams: [], drafts: {}, selectedGroup: null, version: 7 };
let currentView = 'days';
let currentWeekStart = startOfWeek(new Date());
let editingLectureId = null;
let editingHwId = null;

// Shared state used by the feature scripts loaded below.
Object.assign(window, { db, currentView, currentWeekStart, editingLectureId, editingHwId });

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function formatDate(d) {
  const days = ['вс','пн','вт','ср','чт','пт','сб'];
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return `${d.getDate()} ${months[d.getMonth()]} (${days[d.getDay()]})`;
}

function formatCurrentDateTitle(d = new Date()) {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const weekdays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} (${weekdays[d.getDay()]})`;
}

function updateCurrentDateTitle() {
  const title = document.getElementById('currentDateTitle');
  if (title) title.textContent = formatCurrentDateTitle();
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0,0,0,0);
  return date;
}

function getWeekDates(base) {
  const start = startOfWeek(base);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function showToast(msg, ms = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}


function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const due = new Date(iso + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

function normalizeDB(data) {
  const array = value => Array.isArray(value) ? value : [];
  const selected = data.selectedGroup;
  return {
    subjects: array(data.subjects),
    lectures: array(data.lectures).map(normalizeLecture),
    homeworks: array(data.homeworks).map(h => ({ ...h, attachments: array(h.attachments) })),
    exams: array(data.exams).map(e => ({ ...e, attachments: array(e.attachments) })),
    drafts: Object.fromEntries(Object.entries(data.drafts && typeof data.drafts === 'object' ? data.drafts : {}).filter(([key, value]) => /^(lecture|homework|exam):/.test(key) && value && ['lecture', 'homework', 'exam'].includes(value.kind) && value.record && typeof value.record === 'object').map(([key, value]) => [key, { kind: value.kind, record: { ...value.record, attachments: array(value.record.attachments) } }])),
    selectedGroup: selected && Number.isSafeInteger(selected.id) && selected.id > 0 && typeof selected.name === 'string' ? selected : null,
    version: 7
  };
}
