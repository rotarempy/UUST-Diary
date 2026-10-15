// One palette per theme and appearance; components share the same color tokens.
const APPEARANCE_KEY = 'lecture_app_appearance_v1';
const THEMES = {
  neutral: {name:'Классическая', light:['#f4f5f7','#ffffff','#e9edf2','#cdd4de','#202734','#586577','#315fa6','#254c89'], dark:['#13171d','#1c222b','#28313e','#3e4a5b','#edf1f7','#b0bdcf','#97bbf5','#b4cefa']},
  uunit: {name:'УУНиТ', light:['#f5f5fc','#ffffff','#edecff','#d4d2f2','#24233d','#62617d','#4e48e7','#3d37cb'], dark:['#13131f','#1c1b30','#2b2943','#454262','#f0efff','#b8b6d5','#aaa7ff','#c6c4ff']},
  paper: {name:'Бумага', light:['#f4eddf','#fffbf2','#ece2ce','#d3c3a5','#382f22','#75634e','#80582e','#65421e'], dark:['#201d17','#2b271f','#373126','#544936','#f6efdf','#c7b89c','#d7b780','#e8cba0']},
  coffee: {name:'Кофе', light:['#f5ece7','#fffbf9','#eee0d7','#d7bfb0','#3d2b24','#806150','#8c4c32','#713b26'], dark:['#211711','#2f211a','#3e2c22','#604537','#f8ede6','#d1b39f','#e0a77e','#f0c09b']},
  ocean: {name:'Океан', light:['#edf5fa','#ffffff','#dfedf5','#b9d3e2','#193748','#506d7f','#166b94','#0b5478'], dark:['#0e1c27','#162b3a','#213c4e','#395b70','#e6f5ff','#a2c5da','#79c9f1','#a0ddfa']},
  forest: {name:'Лес', light:['#eff5ef','#ffffff','#e1eee3','#bfd2c2','#243a2b','#536f59','#306c46','#235334'], dark:['#121e17','#1d2d22','#2b3d30','#435e4a','#eaf5ed','#acc8b3','#90d4a4','#b2e6c0']}
};
const PALETTE_KEYS = ['bg','surface','surface2','border','text','text-muted','accent','accent-hover'];
function normalizeAppearance(value) {
  const prefs = value && typeof value === 'object' ? {...value} : {};
  const legacy = {gray:['neutral','dark'],light:['neutral','light'],'uunit-dark':['uunit','dark']};
  if (legacy[prefs.theme]) [prefs.theme,prefs.mode] = legacy[prefs.theme];
  if (!Object.hasOwn(THEMES,prefs.theme)) { prefs.theme = 'uunit'; prefs.mode = 'light'; }
  if (!['light','dark'].includes(prefs.mode)) prefs.mode = ['paper','uunit'].includes(prefs.theme) ? 'light' : 'dark';
  prefs.scale = Math.min(130, Math.max(80, Number(prefs.scale) || 100));
  return {theme:prefs.theme,mode:prefs.mode,scale:prefs.scale};
}
function loadAppearance() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY) || 'null'); } catch (_) {}
  const prefs = normalizeAppearance(saved);
  applyAppearance(prefs);
  return prefs;
}
function applyAppearance(value, save = true) {
  const prefs = normalizeAppearance(value), root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.appearance = prefs.mode;
  root.style.colorScheme = prefs.mode === 'light' ? 'only light' : 'dark';
  THEMES[prefs.theme][prefs.mode].forEach((color,i) => root.style.setProperty('--'+PALETTE_KEYS[i], color));
  const light = prefs.mode === 'light';
  root.style.setProperty('--danger',light ? '#b13742' : '#f2a0a8');
  root.style.setProperty('--success',light ? '#287044' : '#90d5a7');
  root.style.setProperty('--warning',light ? '#865b15' : '#efd08d');
  root.style.setProperty('--overlay',light ? 'rgba(20,25,35,.30)' : 'rgba(0,0,0,.65)');
  root.style.setProperty('--shadow',light ? '0 18px 55px rgba(20,25,35,.12)' : '0 18px 55px rgba(0,0,0,.4)');
  root.style.setProperty('--app-scale', String(prefs.scale / 100));
  root.style.setProperty('--app-unscaled-height', `${window.innerHeight / (prefs.scale / 100)}px`);
  const grid = document.getElementById('themeGrid');
  if (grid) {
    if (!grid.children.length) {
      Object.entries(THEMES).forEach(([id,theme]) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'theme-card'; button.dataset.themeChoice = id;
        button.setAttribute('aria-label',theme.name);
        button.innerHTML = `<span class="theme-preview" aria-hidden="true">
          <span class="preview-toolbar"><b>Расписание</b><i></i><i></i></span>
          <span class="preview-table">
            <span class="preview-date">Время</span><span class="preview-date">Пн</span><span class="preview-date">Вт</span>
            <span class="preview-time">08:00</span><span class="preview-cell"><span class="preview-lesson">Лекция<span></span></span></span><span class="preview-cell"></span>
            <span class="preview-time">09:35</span><span class="preview-cell"></span><span class="preview-cell"><span class="preview-lesson">Практика<span></span></span></span>
          </span></span><span class="theme-card-footer"><span class="theme-card-name"></span><span class="theme-check" aria-hidden="true">✓</span></span>`;
        button.querySelector('.theme-card-name').textContent = theme.name;
        grid.append(button);
      });
    }
    grid.querySelectorAll('[data-theme-choice]').forEach(button => {
      const active = button.dataset.themeChoice === prefs.theme;
      button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active));
      const preview = button.querySelector('.theme-preview');
      THEMES[button.dataset.themeChoice][prefs.mode].forEach((color,i) => preview.style.setProperty('--preview-'+PALETTE_KEYS[i],color));
    });
  }
  document.querySelectorAll('[data-appearance-mode]').forEach(button => {
    const active = button.dataset.appearanceMode === prefs.mode;
    button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active));
  });
  const scaleRange = document.getElementById('scaleRange'), scaleValue = document.getElementById('scaleValue');
  if (scaleRange) {
    scaleRange.value = prefs.scale;
    scaleRange.style.setProperty('--scale-fill', ((prefs.scale - 80) / 50 * 100) + '%');
    scaleRange.setAttribute('aria-valuetext',prefs.scale + '%');
  }
  const resetScale = document.getElementById('resetScale');
  if (resetScale) resetScale.disabled = prefs.scale === 100;
  if (scaleValue) scaleValue.textContent = prefs.scale + '%';
  if (save) { try { localStorage.setItem(APPEARANCE_KEY,JSON.stringify(prefs)); } catch (_) {} }
}
let appearance = loadAppearance();
window.addEventListener('resize', () => applyAppearance(appearance, false));
function openSettingsModal() { document.getElementById('settingsModal').classList.remove('hidden'); startLanDiscovery(); }
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); stopLanDiscovery(); }

async function clearAllAppData() {
  if (resettingAppData || !window.confirm('Удалить все данные приложения на этом устройстве? Будут удалены лекции, ДЗ, экзамены, вложения, черновики, выбранная группа, сохранённое расписание и настройки. Отменить удаление нельзя. При необходимости сначала экспортируйте резервную копию JSON.')) return;
  resettingAppData = true;
  document.body.inert = true;
  const clients = [...scheduleClients.values()];
  const storages = clients.map(client => client.storage);
  // Running network requests must not recreate the schedule cache.
  clients.forEach(client => { client.storage = null; });
  try {
    if (typeof stopLanDiscovery === 'function') await stopLanDiscovery();
    await saveQueue.catch(() => {});
    const idb = await openIDB();
    await new Promise((resolve, reject) => {
      const tx = idb.transaction('data', 'readwrite');
      tx.objectStore('data').clear();
      tx.oncomplete = () => { idb.close(); resolve(); };
      tx.onerror = tx.onabort = () => { idb.close(); reject(tx.error); };
    });
    // Remove only this application's keys, preserving other apps on the same origin.
    for (const key of Object.keys(localStorage)) {
      if (key === APPEARANCE_KEY || key === LS_LEGACY || key.startsWith('lectures.official.v1:')) localStorage.removeItem(key);
    }
    materialState = null;
    db = normalizeDB({});
    window.db = db;
    window.location.reload();
  } catch (error) {
    clients.forEach((client, i) => { client.storage = storages[i]; });
    resettingAppData = false;
    document.body.inert = false;
    console.error('Failed to clear application data', error);
    showToast('Не удалось полностью очистить данные. Повторите попытку.', 5000);
  }
}
