// Migrate old images[] → attachments[]
function normalizeLecture(l) {
  if (!l.attachments) {
    l.attachments = [];
    if (l.images && l.images.length) {
      l.images.forEach((data, i) => {
        l.attachments.push({
          id: uuid(),
          name: 'image-' + (i + 1) + '.jpg',
          type: 'image',
          data
        });
      });
    }
  }
  return l;
}


// ===================== IndexedDB (primary storage) =====================
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('data')) {
        idb.createObjectStore('data');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(store, key, value) {
  const idb = await openIDB();
  const tx = idb.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function idbGet(store, key) {
  const idb = await openIDB();
  const tx = idb.transaction(store, 'readonly');
  const req = tx.objectStore(store).get(key);
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function saveDataToIDB() {
  await idbPut('data', 'main', db);
}

async function loadDataFromIDB() {
  try {
    const data = await idbGet('data', 'main');
    if (data && Array.isArray(data.lectures)) {
      db = normalizeDB(data);
      return true;
    }
  } catch (e) {
    console.warn('IDB load failed', e);
  }
  return false;
}


// Automatic local save. No cloud or internet connection is used.
let saveQueue = Promise.resolve();
async function saveDB() {
  const snapshot = structuredClone(db);
  const write = saveQueue.catch(() => {}).then(() => idbPut('data', 'main', snapshot));
  saveQueue = write;
  try { await write; return true; }
  catch (error) { console.error('IndexedDB save failed', error); showToast('Не удалось сохранить данные на устройстве'); return false; }
}

// Migrate old localStorage cache if present
function loadFromLegacyLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_LEGACY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.lectures)) {
        db = normalizeDB(parsed);
        return true;
      }
    }
  } catch (e) {}
  return false;
}
