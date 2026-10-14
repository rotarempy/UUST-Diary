// ===================== Homework =====================
function sortHomeworks(list) {
  const withDue = list.filter(h => !h.done && h.dueDate);
  const withoutDue = list.filter(h => !h.done && !h.dueDate);
  const done = list.filter(h => h.done);

  withDue.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.createdAt || 0) - (b.createdAt || 0));
  withoutDue.sort((a, b) => (a.addedDate || '').localeCompare(b.addedDate || '') || (a.createdAt || 0) - (b.createdAt || 0));
  done.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return [...withDue, ...withoutDue, ...done];
}

function renderHomework() {
  const container = document.getElementById('hwList');
  const sorted = sortHomeworks(db.homeworks || []);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="hw-empty">Нет домашних заданий.<br>Нажми «+ ДЗ», чтобы добавить.</div>';
    return;
  }

  const withDue = sorted.filter(h => !h.done && h.dueDate);
  const withoutDue = sorted.filter(h => !h.done && !h.dueDate);
  const done = sorted.filter(h => h.done);

  let html = '';
  if (withDue.length) {
    html += '<div class="hw-section-title">С датой сдачи</div>';
    html += withDue.map(hwCard).join('');
  }
  if (withoutDue.length) {
    html += '<div class="hw-section-title">Без даты сдачи</div>';
    html += withoutDue.map(hwCard).join('');
  }
  if (done.length) {
    html += '<div class="hw-section-title">Сделано</div>';
    html += done.map(hwCard).join('');
  }
  container.innerHTML = html;
}

function hwCard(h) {
  const subj = db.subjects.find(s => s.id === h.subjectId);
  const dueInfo = h.dueDate ? daysUntil(h.dueDate) : null;
  let dueBadge = '';
  if (h.dueDate && !h.done) {
    let cls = 'due';
    let label = 'до ' + h.dueDate;
    if (dueInfo !== null) {
      if (dueInfo < 0) { label = 'просрочено (' + h.dueDate + ')'; }
      else if (dueInfo === 0) { label = 'сегодня'; cls = 'due soon'; }
      else if (dueInfo <= 3) { label = 'через ' + dueInfo + ' дн.'; cls = 'due soon'; }
    }
    dueBadge = `<span class="badge ${cls}">${label}</span>`;
  }

  return `
    <div class="hw-card ${h.done ? 'done' : ''}" onclick="openHomework('${h.id}')">
      <h3>${escapeHtml(h.text ? h.text.slice(0, 120) + (h.text.length > 120 ? '…' : '') : 'Без текста')}</h3>
      <div class="meta">
        ${subj ? `<span class="badge subject">${escapeHtml(subj.name)}</span>` : ''}
        <span class="badge">добавлено ${h.addedDate || '—'}</span>
        ${dueBadge}
        ${h.done ? '<span class="badge done-badge">✓ сделано</span>' : ''}
      </div>
    </div>
  `;
}

function openNewHomework() {
  editingHwId = null;
  showHwForm({
    text: '',
    subjectId: '',
    addedDate: toISODate(new Date()),
    dueDate: '',
    done: false
  });
}

function openHomework(id) {
  const h = db.homeworks.find(x => x.id === id);
  if (!h) return;
  editingHwId = id;
  showHwViewer(h);
}

function showHwViewer(h) {
  const subj = db.subjects.find(s => s.id === h.subjectId);
  document.getElementById('modalBox').classList.remove('wide');
  document.getElementById('modalTitle').textContent = 'Домашнее задание';
  document.getElementById('modalBody').innerHTML = `
    <div class="meta" style="margin-bottom:16px; display:flex; gap:10px; flex-wrap:wrap;">
      ${subj ? `<span class="badge subject">${escapeHtml(subj.name)}</span>` : ''}
      <span class="badge">добавлено ${h.addedDate || '—'}</span>
      ${h.dueDate ? `<span class="badge due">сдать до ${h.dueDate}</span>` : ''}
      ${h.done ? '<span class="badge done-badge">✓ сделано</span>' : ''}
    </div>
    <div class="viewer-content" style="white-space:pre-wrap;">${escapeHtml(h.text || '—')}</div>
  `;
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn secondary" onclick="closeModal()">Закрыть</button>
    <button class="btn ${h.done ? 'secondary' : 'success'}" onclick="toggleHwDone()">
      ${h.done ? 'Снять отметку' : '✓ Сделано'}
    </button>
    <button class="btn" onclick="editCurrentHw()">Редактировать</button>
    <button class="btn danger" onclick="deleteCurrentHw()">Удалить</button>
  `;
  document.getElementById('lectureModal').classList.remove('hidden');
}

function editCurrentHw() {
  const h = db.homeworks.find(x => x.id === editingHwId);
  if (!h) return;
  showHwForm(h);
}

function showHwForm(h) {
  document.getElementById('modalBox').classList.remove('wide');
  document.getElementById('modalTitle').textContent = editingHwId ? 'Редактирование ДЗ' : 'Новое ДЗ';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group">
      <label>Предмет</label>
      <select id="hwSubject">
        <option value="">— без предмета —</option>
        ${db.subjects.map(s =>
          `<option value="${s.id}" ${s.id === h.subjectId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Дата добавления *</label>
      <input type="date" id="hwAdded" value="${h.addedDate || toISODate(new Date())}" required>
    </div>
    <div class="form-group">
      <label>Дата сдачи (необязательно)</label>
      <input type="date" id="hwDue" value="${h.dueDate || ''}">
    </div>
    <div class="form-group">
      <label>Текст задания</label>
      <textarea id="hwText" placeholder="Что нужно сделать...">${escapeHtml(h.text || '')}</textarea>
    </div>
    <div class="checkbox-row">
      <input type="checkbox" id="hwDone" ${h.done ? 'checked' : ''}>
      <label for="hwDone" style="margin:0;color:var(--text);">Отметить как сделанное</label>
    </div>
  `;
  ['hwSubject','hwAdded','hwDue','hwText','hwDone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => saveDraft('hw', { subjectId: document.getElementById('hwSubject').value, addedDate: document.getElementById('hwAdded').value, dueDate: document.getElementById('hwDue').value, text: document.getElementById('hwText').value, done: document.getElementById('hwDone').checked }));
  });
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn secondary" onclick="closeModal()">Отмена</button>
    <button class="btn danger" onclick="clearHwEditor()">Очистить</button>
    <button class="btn" onclick="saveHomework()">Сохранить</button>
  `;
  document.getElementById('lectureModal').classList.remove('hidden');
}

function clearHwEditor() {
  ['hwSubject','hwDue','hwText'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
  // Дата добавления сохраняется при очистке редактора
  const d=document.getElementById('hwDone'); if(d) d.checked=false;
  clearDraft('hw');
}

async function saveHomework() {
  const subjectId = document.getElementById('hwSubject').value || null;
  const addedDate = document.getElementById('hwAdded').value;
  const dueDate = document.getElementById('hwDue').value || null;
  const text = document.getElementById('hwText').value.trim();
  const done = document.getElementById('hwDone').checked;

  if (!addedDate) {
    alert('Укажите дату добавления');
    return;
  }

  if (editingHwId) {
    const idx = db.homeworks.findIndex(h => h.id === editingHwId);
    if (idx >= 0) {
      db.homeworks[idx] = {
        ...db.homeworks[idx],
        subjectId, addedDate, dueDate, text, done,
        updatedAt: Date.now()
      };
    }
  } else {
    if (!db.homeworks) db.homeworks = [];
    db.homeworks.push({
      id: uuid(),
      subjectId, addedDate, dueDate, text, done,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  await saveDB();
  clearDraft('hw');
  closeModal();
  render();
  showToast('ДЗ сохранено');
}

async function toggleHwDone() {
  const h = db.homeworks.find(x => x.id === editingHwId);
  if (!h) return;
  h.done = !h.done;
  h.updatedAt = Date.now();
  await saveDB();
  showHwViewer(h);
  render();
  showToast(h.done ? 'Отмечено как сделанное' : 'Отметка снята');
}

async function deleteCurrentHw() {
  if (!editingHwId) return;
  if (!confirm('Удалить это ДЗ?')) return;
  db.homeworks = db.homeworks.filter(h => h.id !== editingHwId);
  await saveDB();
  closeModal();
  render();
  showToast('ДЗ удалено');
}
