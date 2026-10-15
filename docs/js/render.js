function render() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === currentView));
  document.getElementById('daysView').classList.toggle('hidden', currentView !== 'days');
  document.getElementById('subjectsView').classList.toggle('hidden', currentView !== 'subjects');
  document.getElementById('calendarView').classList.toggle('hidden', currentView !== 'calendar');
  document.getElementById('weekNav').style.display = currentView === 'days' && db.selectedGroup ? 'flex' : 'none';
  const status = document.getElementById('scheduleStatus');
  status.textContent = scheduleConfig.staticOnly ? '' : scheduleBusy ? 'Обновляем расписание…' : scheduleMessage;
  if (scheduleMessage && scheduleConfig.sourcePage) {
    const link = document.createElement('a'); link.href = scheduleConfig.sourcePage;
    link.textContent = 'Открыть источник'; link.target = '_blank'; link.rel = 'noopener noreferrer';
    status.append(' ', link);
  }
  status.classList.toggle('hidden', currentView !== 'days' || !status.textContent);
  document.getElementById('refreshSchedule').disabled = scheduleBusy;
  document.getElementById('refreshSchedule').hidden = scheduleConfig.staticOnly || currentView !== 'days' || !scheduleClient || scheduleClient.getStatus(toISODate(currentWeekStart)).hasCache;
  if (currentView === 'days') renderDays(); else if (currentView === 'calendar') renderCalendar(); else renderSubjectsView();
}
function attachmentBadges(atts = []) {
  return atts.length ? `<span class="badge">Вложения: ${atts.length}</span>` : '';
}
function renderDays() {
  const container = document.getElementById('daysView');
  if (!scheduleClient) {
    container.innerHTML = '<div class="welcome"><h2>Выберите свою группу</h2><p>Начните вводить её название в поле сверху. Здесь появится расписание, а к каждой паре можно будет добавить лекцию и ДЗ.</p></div>';
    return;
  }
  const days = scheduleClient.getWeek(toISODate(currentWeekStart));
  document.getElementById('weekLabel').textContent = `${formatDate(dateFromISO(days[0].date))} — ${formatDate(dateFromISO(days[6].date))}`;
  if (!scheduleClient.getStatus(toISODate(currentWeekStart)).hasCache && !scheduleBusy) {
    if (scheduleConfig.staticOnly) { container.innerHTML = '<div class="welcome"><h2>На эту неделю нет опубликованного расписания</h2><p>Выберите другую неделю или добавьте snapshot.json в файлы сайта.</p></div>'; return; }
    container.innerHTML = '<div class="welcome"><h2>Расписание пока не загружено</h2><p>Выбранная группа сохранена. Нажмите «Повторить загрузку», чтобы загрузить эту неделю.</p></div>';
    return;
  }
  if (window.LecturesMobile?.active()) { LecturesMobile.renderDay(container, days); return; }
  const slots = scheduleClient.getSlots(toISODate(currentWeekStart));
  // Older saved snapshots have no empty rows: derive their known slots from lessons.
  const byTime = new Map(slots.map(slot => [slot.timeStart + '-' + slot.timeEnd, slot]));
  days.forEach(day => day.lessons.forEach(lesson => {
    const key = lesson.timeStart + '-' + lesson.timeEnd;
    if (!byTime.has(key)) byTime.set(key, { number: lesson.numbers[0], timeStart: lesson.timeStart, timeEnd: lesson.timeEnd });
  }));
  // Keep rows 1–6 and every row through this week's last occupied pair.
  // Do not trim gaps: an eighth pair must also leave the seventh row visible.
  const weekLessons = days.flatMap(day => day.lessons);
  const occupiedTimes = new Set(weekLessons.map(lesson => lesson.timeStart + '-' + lesson.timeEnd));
  const lastPair = Math.max(6,
    ...weekLessons.flatMap(lesson => lesson.numbers || []).map(Number).filter(Number.isFinite),
    ...[...byTime.values()].filter(slot => occupiedTimes.has(slot.timeStart + '-' + slot.timeEnd))
      .map(slot => Number(slot.number)).filter(Number.isFinite));
  const ordered = [...byTime.values()]
    .filter(slot => !Number(slot.number) || Number(slot.number) <= lastPair || occupiedTimes.has(slot.timeStart + '-' + slot.timeEnd))
    .sort((a,b) => a.timeStart.localeCompare(b.timeStart));
  container.innerHTML = `<div class="timetable-scroll" tabindex="0" role="region" aria-label="Расписание недели">
    <table class="timetable"><caption class="sr-only">Расписание по дням и времени пар</caption>
    <thead><tr><th scope="col" class="time-column">Пара / время</th>${days.map(day => {
      const today = day.date === scheduleClient.today();
      return `<th scope="col" class="${today ? 'today-column' : ''}" ${today ? 'aria-current="date"' : ''}>${escapeHtml(formatDate(dateFromISO(day.date)))}${today ? '<span class="today-label">Сегодня</span>' : ''}</th>`;
    }).join('')}</tr></thead><tbody>${ordered.map(slot => `<tr data-slot="${escapeHtml(slot.timeStart)}">
      <th scope="row" class="time-column"><strong>${slot.number ? escapeHtml(String(slot.number)) + ' пара' : 'Пара'}</strong><span>${escapeHtml(slot.timeStart)} — ${escapeHtml(slot.timeEnd)}</span></th>
      ${days.map(day => {
        const lessons = day.lessons.filter(l => l.timeStart === slot.timeStart && l.timeEnd === slot.timeEnd);
        return `<td data-date="${day.date}">${lessons.length ? lessons.map(lessonCard).join('') : '<span class="empty-slot" aria-label="Нет пары">—</span>'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>
      ${!ordered.length ? '<p class="empty-col">' + (scheduleBusy ? 'Загружаем неделю…' : 'На этой неделе нет пар') + '</p>' : ''}
    </div>`;
}
function lessonTypeClass(type) {
  const value = String(type || '').trim().toLocaleLowerCase('ru');
  if (/^(лек|lecture)/.test(value)) return 'lesson-lecture';
  if (/^(прак|пр\.|пз|сем|practice|seminar)/.test(value)) return 'lesson-practice';
  if (/^(лаб|лб|лр|lab)/.test(value)) return 'lesson-lab';
  return 'lesson-other';
}
function lessonCard(lesson) {
  const lecture = db.lectures.find(l => l.occurrenceId === lesson.occurrenceId);
  const homework = db.homeworks.find(h => h.occurrenceId === lesson.occurrenceId);
  const exam = db.exams.find(e => e.occurrenceId === lesson.occurrenceId);
  const draftL = db.drafts['lecture:' + (lecture?.id || lesson.occurrenceId)];
  const draftH = db.drafts['homework:' + (homework?.id || lesson.occurrenceId)];
  const draftE = db.drafts['exam:' + (exam?.id || lesson.occurrenceId)];
  return `<button class="lecture-card pair-card ${lessonTypeClass(lesson.type)}" data-pair="${escapeHtml(lesson.occurrenceId)}">
    <div class="pair-time">${lesson.timeStart} — ${lesson.timeEnd}${lesson.numbers.length ? ` · ${lesson.numbers.join(', ')} пара` : ''}</div>
    <h3>${escapeHtml(lesson.title)}</h3>
    <div class="pair-details">${[lesson.type, lesson.location, lesson.teacher].filter(Boolean).map(escapeHtml).join(' · ')}</div>
    ${lesson.comment ? `<div class="pair-details">${escapeHtml(lesson.comment)}</div>` : ''}
    <div class="meta">${draftL ? '<span class="badge">Черновик лекции</span>' : lecture ? '<span class="badge subject">Лекция</span>' : ''}
      ${draftH ? '<span class="badge">Черновик ДЗ</span>' : homework ? `<span class="badge ${homework.done ? 'done-badge' : ''}">${homework.done ? 'ДЗ сделано' : 'ДЗ'}</span>` : ''}
      ${draftE ? '<span class="badge exam-badge">Черновик экзамена</span>' : exam ? '<span class="badge exam-badge">Экзамен</span>' : ''}</div>
  </button>`;
}
function lectureCard(record, draftKey = null) {
  return `<button class="lecture-card pair-card ${lessonTypeClass(record.lesson?.type)}" ${draftKey ? `data-draft="${escapeHtml(draftKey)}"` : `data-lecture="${escapeHtml(record.id)}"`}>
    <h3>${escapeHtml(record.title || 'Без названия')}</h3><div class="meta"><span class="badge">${escapeHtml(record.date || '')}</span>
    ${draftKey ? '<span class="badge">Черновик</span>' : ''}${attachmentBadges(record.attachments)}</div>
    ${record.lesson?.groupName ? `<div class="pair-details">${escapeHtml(record.lesson.groupName)}</div>` : ''}</button>`;
}
function renderSubjectsView() {
  const container = document.getElementById('subjectsView');
  const drafts = Object.entries(db.drafts).filter(([, d]) => d.kind === 'lecture');
  const edited = new Set(drafts.map(([, d]) => d.record.id));
  const entries = db.lectures.filter(l => !edited.has(l.id)).map(record => ({ record, key: null }))
    .concat(drafts.map(([key, d]) => ({ record: d.record, key })));
  if (!entries.length) { container.innerHTML = '<div class="welcome"><h2>Здесь будут ваши лекции</h2><p>Выберите пару в расписании и добавьте лекцию. Незавершённые черновики тоже появятся здесь.</p></div>'; return; }
  const groups = new Map();
  entries.forEach(entry => {
    const name = db.subjects.find(s => s.id === entry.record.subjectId)?.name || entry.record.lesson?.title || 'Без предмета';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(entry);
  });
  container.innerHTML = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'ru')).map(([name, rows]) =>
    `<section class="column"><div class="column-header"><div>${escapeHtml(name)}</div><span class="badge">${rows.length}</span></div>
      <div class="column-body">${rows.sort((a,b) => (a.record.date || '').localeCompare(b.record.date || '')).map(e => lectureCard(e.record, e.key)).join('')}</div></section>`).join('');
}
