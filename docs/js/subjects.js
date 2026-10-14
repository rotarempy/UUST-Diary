// ===================== Subjects =====================
function renderManage() {
  const list = document.getElementById('subjectsList');
  list.innerHTML = db.subjects.map(s => `
    <div class="subject-item">
      <input type="text" value="${escapeHtml(s.name)}" onchange="renameSubject('${s.id}', this.value)">
      <button class="btn danger sm" onclick="deleteSubject('${s.id}')">Удалить</button>
    </div>
  `).join('') || '<div style="color:var(--text-muted)">Пока нет предметов</div>';
}

async function addSubject() {
  const name = document.getElementById('newSubjectName').value.trim();
  if (!name) return;
  db.subjects.push({ id: uuid(), name });
  await saveDB();
  document.getElementById('newSubjectName').value = '';
  render();
}

async function renameSubject(id, name) {
  const s = db.subjects.find(x => x.id === id);
  if (s) {
    s.name = name.trim() || s.name;
    await saveDB();
    render();
  }
}

async function deleteSubject(id) {
  if (!confirm('Удалить предмет? Лекции и ДЗ останутся без предмета.')) return;
  db.subjects = db.subjects.filter(s => s.id !== id);
  db.lectures.forEach(l => { if (l.subjectId === id) l.subjectId = null; });
  (db.homeworks || []).forEach(h => { if (h.subjectId === id) h.subjectId = null; });
  await saveDB();
  render();
}
