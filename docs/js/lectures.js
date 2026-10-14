let materialState = null;
const activeUploads = new Map();
let modalReturnFocus = null;
function showMaterialModal(title, body, footer = '') {
  const overlay = document.getElementById('lectureModal');
  if (overlay.classList.contains('hidden')) modalReturnFocus = document.activeElement;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = footer;
  overlay.classList.remove('hidden');
  document.getElementById('modalBox').focus();
}
function openPair(id) {
  const lesson = currentLesson(id);
  if (!lesson) return;
  materialState = null;
  const savedL = db.lectures.find(l => l.occurrenceId === id), savedH = db.homeworks.find(h => h.occurrenceId === id), savedE = db.exams.find(e => e.occurrenceId === id);
  showMaterialModal(lesson.title, `<p class="pair-details">${lesson.date} · ${lesson.timeStart} — ${lesson.timeEnd}</p>
    <div class="material-choices"><button class="material-choice" data-kind="lecture"><strong>Лекция</strong><span>${db.drafts['lecture:' + (savedL?.id || id)] ? 'Продолжить черновик' : savedL ? 'Открыть запись' : 'Добавить запись'}</span></button>
    <button class="material-choice" data-kind="homework"><strong>ДЗ</strong><span>${db.drafts['homework:' + (savedH?.id || id)] ? 'Продолжить черновик' : savedH ? (savedH.done ? 'Сделано' : 'Открыть задание') : 'Добавить задание'}</span></button>
    <button class="material-choice" data-kind="exam"><strong>Экзамен</strong><span>${db.drafts['exam:' + (savedE?.id || id)] ? 'Продолжить черновик' : savedE ? 'Открыть экзамен' : 'Добавить экзамен'}</span></button></div>`);
  document.querySelectorAll('[data-kind]').forEach(button => button.onclick = () => openMaterial(button.dataset.kind, lesson));
}
function collection(kind) { return kind === 'lecture' ? db.lectures : kind === 'exam' ? db.exams : db.homeworks; }
function openMaterial(kind, lesson, record = null) {
  record = record || collection(kind).find(r => r.occurrenceId === lesson?.occurrenceId);
  const key = kind + ':' + (record?.id || lesson?.occurrenceId);
  const draft = db.drafts[key];
  if (draft) { showEditor(kind, structuredClone(draft.record), key); return; }
  if (record) { showViewer(kind, record, key); return; }
  const subjectId = ensureSubject(lesson);
  const base = { id: uuid(), occurrenceId: lesson.occurrenceId, date: lesson.date,
    subjectId, lesson: { ...lesson, groupName: db.selectedGroup?.name || '' },
    attachments: [], createdAt: Date.now(), updatedAt: Date.now() };
  const fresh = kind !== 'homework' ? { ...base, title: '', content: '' } : { ...base, text: '', addedDate: lesson.date, done: false };
  showEditor(kind, fresh, key);
}
function openLecture(id) {
  const record = db.lectures.find(r => r.id === id);
  if (record) openMaterial('lecture', record.lesson, record);
}
function openDraft(key) {
  const draft = db.drafts[key];
  if (draft) showEditor(draft.kind, structuredClone(draft.record), key);
}
function showViewer(kind, record, key) {
  materialState = { mode: 'viewer', kind, record, key };
  const name = db.subjects.find(s => s.id === record.subjectId)?.name || record.lesson?.title;
  const body = `<div class="meta viewer-meta"><span class="badge">${escapeHtml(record.date || record.addedDate || '')}</span>
    ${name ? `<span class="badge subject">${escapeHtml(name)}</span>` : ''}
    ${kind === 'homework' ? `<span class="badge ${record.done ? 'done-badge' : ''}">${record.done ? 'Сделано' : 'Не сделано'}</span>` : ''}</div>
    <div class="viewer-content">${renderMarkdown(kind !== 'homework' ? record.content : record.text)}</div>${renderAttachments(record.attachments || [])}`;
  showMaterialModal(kind !== 'homework' ? record.title || (kind === 'exam' ? 'Экзамен' : 'Лекция') : 'Домашнее задание', body,
    `<button class="btn secondary" id="editMaterial">Редактировать</button><button class="btn danger" id="deleteMaterial">Удалить</button>
    ${kind === 'homework' ? `<button class="btn" id="toggleDone">${record.done ? 'Не сделано' : 'Сделано'}</button>` : ''}`);
  document.getElementById('editMaterial').onclick = () => showEditor(kind, structuredClone(record), key);
  document.getElementById('deleteMaterial').onclick = deleteMaterial;
  const toggle = document.getElementById('toggleDone');
  if (toggle) toggle.onclick = async () => {
    record.done = !record.done; record.updatedAt = Date.now();
    await saveDB(); showViewer(kind, record, key); render();
  };
}
function nonEmptyRecord(kind, record) {
  return Boolean((kind !== 'homework' ? (record.title || '').trim() || (record.content || '').trim() : (record.text || '').trim()) || record.attachments?.length);
}
function captureDraft() {
  const state = materialState;
  if (!state || state.mode !== 'editor') return;
  const title = document.getElementById('fTitle'), content = document.getElementById('fContent');
  if (!content) return;
  if (state.kind !== 'homework') { state.record.title = title.value; state.record.content = content.value; }
  else state.record.text = content.value;
  state.record.updatedAt = Date.now();
  if (nonEmptyRecord(state.kind, state.record)) db.drafts[state.key] = { kind: state.kind, record: structuredClone(state.record) };
  else delete db.drafts[state.key];
}
async function autosaveDraft() { captureDraft(); await saveDB(); render(); }
function showEditor(kind, record, key) {
  materialState = { mode: 'editor', kind, record, key, uploads: activeUploads.get(key) || 0 };
  document.getElementById('modalBox').classList.remove('wide');
  showMaterialModal(kind === 'exam' ? 'Редактор экзамена' : kind === 'lecture' ? 'Редактор лекции' : 'Редактор ДЗ',
    `${kind !== 'homework' ? `<div class="form-group"><label for="fTitle">Название</label><input id="fTitle" type="text" value="${escapeHtml(record.title || '')}" placeholder="${kind === 'exam' ? 'Название экзамена' : 'Название лекции'}"></div>` : ''}
    <div class="form-group"><label for="fContent">${kind === 'exam' ? 'Текст экзамена' : kind === 'lecture' ? 'Текст лекции' : 'Текст ДЗ'} · Markdown</label><textarea id="fContent" spellcheck="false" placeholder="Текст, Markdown или HTML-теги…">${escapeHtml(kind !== 'homework' ? record.content || '' : record.text || '')}</textarea></div>
    <details class="editor-preview"><summary>Предпросмотр</summary><div id="markdownPreview" class="viewer-content"></div></details>
    <div class="form-group"><label for="fFiles">Вложения</label><div class="file-picker-row"><input class="file-input-hidden" id="fFiles" type="file" multiple><label class="file-picker-btn" for="fFiles">＋ Добавить файлы</label><span class="file-picker-status" id="fFilesStatus"></span></div><div id="fFilesPreview" class="files-preview"></div></div>
    <div id="draftStatus" class="draft-status" role="status">Непустой черновик сохраняется автоматически</div>`,
    '<button class="btn danger" id="clearMaterial">Очистить</button><button class="btn" id="saveMaterial">Сохранить</button>');
  const update = () => {
    const state = materialState;
    captureDraft();
    document.getElementById('markdownPreview').innerHTML = renderMarkdown(document.getElementById('fContent').value);
    document.getElementById('draftStatus').textContent = 'Сохраняем черновик…';
    saveDB().then(saved => {
      if (materialState === state) document.getElementById('draftStatus').textContent = saved ? 'Черновик сохранён на устройстве' : 'Не удалось сохранить черновик';
    });
    render();
  };
  document.getElementById('fContent').oninput = update;
  if (kind !== 'homework') document.getElementById('fTitle').oninput = update;
  document.getElementById('markdownPreview').innerHTML = renderMarkdown(document.getElementById('fContent').value);
  document.getElementById('fFiles').onchange = uploadAttachments;
  document.getElementById('saveMaterial').onclick = saveMaterial;
  document.getElementById('clearMaterial').onclick = clearMaterial;
  renderEditorAttachments();
  document.getElementById('saveMaterial').disabled = materialState.uploads > 0;
  document.getElementById('clearMaterial').disabled = materialState.uploads > 0;
}
function safeAttachmentUrl(file) {
  return typeof file.data === 'string' && /^data:[a-z0-9.+/-]+(?:;[a-z0-9=._-]+)*;base64,[a-z0-9+/=\s]*$/i.test(file.data) ? file.data : '';
}
function renderAttachments(files) {
  return files.map(file => {
    const data = safeAttachmentUrl(file); if (!data) return '';
    const isImage = /^data:image\/(png|jpeg|gif|webp);/i.test(data);
    const isPdf = /^data:application\/pdf;/i.test(data);
    return `<div class="attachment-view">${isImage ? `<img class="attachment-image" src="${data}" alt="${escapeHtml(file.name)}">` : ''}
      <a class="btn secondary sm" href="${data}" download="${escapeHtml(file.name)}">Скачать ${escapeHtml(file.name)}</a>
      ${isPdf ? (window.LecturesPlatform?.isAndroid ? `<a class="btn secondary sm" href="${data}" data-native-open="${escapeHtml(file.name)}">Открыть PDF</a>` : `<embed class="attachment-pdf" src="${data}" type="application/pdf">`) : ''}</div>`;
  }).join('');
}
function renderEditorAttachments() {
  const state = materialState; if (!state || state.mode !== 'editor') return;
  document.getElementById('fFilesStatus').textContent = state.uploads ? 'Загружаем файлы…' : state.record.attachments.length ? `Файлов: ${state.record.attachments.length}` : 'Файлы не выбраны';
  const container = document.getElementById('fFilesPreview'); container.innerHTML = '';
  state.record.attachments.forEach((file, i) => {
    const card = document.createElement('div'); card.className = 'file-thumb';
    const image = /^data:image\/(png|jpeg|gif|webp);/i.test(file.data);
    if (image) { const img = document.createElement('img'); img.src = safeAttachmentUrl(file); img.alt = file.name; card.append(img); }
    const name = document.createElement('div'); name.className = 'fname'; name.textContent = file.name; card.append(name);
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Удалить вложение ' + file.name);
    remove.onclick = () => { state.record.attachments.splice(i, 1); renderEditorAttachments(); autosaveDraft(); };
    card.append(remove); container.append(card);
  });
}
async function uploadAttachments(event) {
  const state = materialState;
  const files = [...event.target.files]; event.target.value = '';
  state.uploads = (activeUploads.get(state.key) || 0) + 1; activeUploads.set(state.key, state.uploads); renderEditorAttachments();
  document.getElementById('saveMaterial').disabled = true;
  document.getElementById('clearMaterial').disabled = true;
  try {
    for (const file of files) {
      const data = await readFileAsDataURL(file);
      // Merge into the latest editor/draft if the user closed and reopened while reading.
      const current = materialState?.mode === 'editor' && materialState.key === state.key ? materialState : null;
      if (current) captureDraft();
      const target = current?.record || db.drafts[state.key]?.record || state.record;
      target.attachments.push({ id: uuid(), name: file.name, type: file.type || 'application/octet-stream', data });
      target.updatedAt = Date.now();
      if (nonEmptyRecord(state.kind, target)) db.drafts[state.key] = { kind: state.kind, record: structuredClone(target) };
      await saveDB();
    }
  } catch (_) { showToast('Не удалось прочитать вложение'); }
  finally {
    const remaining = Math.max(0, (activeUploads.get(state.key) || 1) - 1);
    if (remaining) activeUploads.set(state.key, remaining); else activeUploads.delete(state.key);
    render();
    if (materialState?.mode === 'editor' && materialState.key === state.key) {
      materialState.uploads = remaining;
      renderEditorAttachments(); document.getElementById('saveMaterial').disabled = remaining > 0;
      document.getElementById('clearMaterial').disabled = remaining > 0;
    }
  }
}
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
}
async function saveMaterial() {
  const state = materialState;
  if (!state || state.mode !== 'editor' || state.uploads) return;
  captureDraft();
  if (!nonEmptyRecord(state.kind, state.record)) { showToast('Добавьте текст, название или вложение'); return; }
  const rows = collection(state.kind), index = rows.findIndex(r => r.id === state.record.id);
  const previous = index >= 0 ? rows[index] : null;
  const record = structuredClone(state.record);
  if (index >= 0) rows[index] = record; else rows.push(record);
  const draft = db.drafts[state.key]; delete db.drafts[state.key];
  document.getElementById('saveMaterial').disabled = true;
  if (!await saveDB()) {
    if (index >= 0) rows[index] = previous; else rows.splice(rows.indexOf(record), 1);
    if (draft) db.drafts[state.key] = draft;
    if (materialState === state) document.getElementById('saveMaterial').disabled = false;
    return;
  }
  if (materialState === state) showViewer(state.kind, record, state.kind + ':' + record.id);
  render(); showToast('Сохранено');
}
async function clearMaterial() {
  const state = materialState; if (!state || state.mode !== 'editor' || state.uploads) return;
  if (state.kind !== 'homework') { state.record.title = ''; state.record.content = ''; } else state.record.text = '';
  state.record.attachments = []; delete db.drafts[state.key];
  showEditor(state.kind, state.record, state.key);
  await saveDB(); render();
}
async function deleteMaterial() {
  const state = materialState; if (!state || state.mode !== 'viewer') return;
  if (!confirm(state.kind === 'exam' ? 'Удалить экзамен?' : state.kind === 'lecture' ? 'Удалить лекцию?' : 'Удалить ДЗ?')) return;
  const rows = collection(state.kind), i = rows.findIndex(r => r.id === state.record.id);
  if (i < 0) return;
  const [removed] = rows.splice(i, 1); delete db.drafts[state.key];
  if (!await saveDB()) { rows.splice(i, 0, removed); return; }
  closeModal(); render(); showToast('Запись удалена');
}
function closeModal() {
  if (materialState?.mode === 'editor') { captureDraft(); saveDB(); render(); }
  materialState = null;
  document.getElementById('lectureModal').classList.add('hidden');
  document.getElementById('modalBox').classList.remove('wide');
  modalReturnFocus?.focus?.();
}
