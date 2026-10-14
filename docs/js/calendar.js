let calendarMonth = null;
function calendarToday() { return scheduleClient?.today() || ufaToday(); }
function calendarDateValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value+'T00:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0,10) === value;
}
function calendarEvents() {
  const drafts = Object.entries(db.drafts).filter(([,d]) => ['homework','exam'].includes(d.kind));
  const edited = new Set(drafts.map(([,d]) => d.kind+':'+d.record.id));
  const events = [];
  for (const kind of ['homework','exam']) {
    const rows = kind === 'exam' ? db.exams : db.homeworks;
    rows.forEach(record => { if (!edited.has(kind+':'+record.id)) events.push({kind,record,draftKey:null}); });
  }
  drafts.forEach(([key,d]) => events.push({kind:d.kind,record:d.record,draftKey:key}));
  return events.filter(e => calendarDateValid(e.record.date || e.record.addedDate)).map(e => {
    const subject = db.subjects.find(s=>s.id===e.record.subjectId)?.name || e.record.lesson?.title || '';
    return {...e,date:e.record.date || e.record.addedDate,title:e.kind==='exam' ? e.record.title || subject || 'Экзамен' : subject || 'Домашнее задание'};
  }).sort((a,b) => a.date.localeCompare(b.date) || (a.record.lesson?.timeStart || '').localeCompare(b.record.lesson?.timeStart || '') || a.title.localeCompare(b.title,'ru'));
}
function calendarEventAttributes(event) {
  return event.draftKey ? `data-calendar-draft="${escapeHtml(event.draftKey)}"` : `data-calendar-kind="${event.kind}" data-calendar-id="${escapeHtml(event.record.id)}"`;
}
function calendarEventLabel(event) {
  return (event.kind==='exam'?'Экзамен':'ДЗ') + (event.draftKey?' · Черновик':event.kind==='homework'&&event.record.done?' · Сделано':'');
}
function calendarRows(month) {
  const start = startOfWeek(new Date(month.getFullYear(),month.getMonth(),1,12));
  const end = new Date(month.getFullYear(),month.getMonth()+1,0,12);
  const rows=[];
  for (let monday=new Date(start);monday<=end;monday.setDate(monday.getDate()+7)) {
    const days=Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return toISODate(d);});
    rows.push({days,number:scheduleClient?.weekFor?.(days[0]) ?? null});
  }
  return rows;
}
function renderCalendar() {
  const today=calendarToday();
  if (!calendarMonth) { const d=dateFromISO(today);calendarMonth=new Date(d.getFullYear(),d.getMonth(),1,12); }
  const key=toISODate(calendarMonth).slice(0,7),events=calendarEvents();
  const eventsByDate=new Map();events.forEach(e=>{if(!eventsByDate.has(e.date))eventsByDate.set(e.date,[]);eventsByDate.get(e.date).push(e);});
  const monthLabel=new Intl.DateTimeFormat('ru',{month:'long',year:'numeric'}).format(calendarMonth);
  const rows=calendarRows(calendarMonth);
  document.getElementById('calendarView').innerHTML=`<section class="event-calendar">
    <div class="calendar-toolbar"><h2 id="calendarMonthTitle">${escapeHtml(monthLabel)}</h2><div class="calendar-controls"><button type="button" class="btn secondary toolbar-icon" data-calendar-shift="-1" aria-label="Предыдущий месяц">‹</button><button type="button" class="btn secondary" data-calendar-today>Сегодня</button><button type="button" class="btn secondary toolbar-icon" data-calendar-shift="1" aria-label="Следующий месяц">›</button></div></div>
    <div class="calendar-legend"><span class="badge subject">ДЗ</span><span class="badge exam-badge">Экзамен</span><span>События показаны на дату пары. Нажмите день для полного списка.</span></div>
    ${rows.some(r=>r.number===null)?'<p class="calendar-note">Номера учебных недель берутся из расписания выбранной группы. «—» означает, что календарь источника для этой даты недоступен.</p>':''}
    <div class="calendar-table-wrap"><table class="calendar-table" aria-labelledby="calendarMonthTitle"><thead><tr><th scope="col" class="calendar-week" aria-label="Учебная неделя"><span class="calendar-week-title">Неделя</span><span class="calendar-week-short" aria-hidden="true">№</span></th>${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<th scope="col">${d}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row" class="calendar-week" title="${row.number!==null?'Учебная неделя '+row.number:'Номер недели недоступен'}">${row.number??'—'}</th>${row.days.map(date=>{
      const outside=!date.startsWith(key),list=eventsByDate.get(date)||[];
      return `<td class="${outside?'outside-month ':''}${date===today?'calendar-today':''}" data-calendar-cell="${date}"><button type="button" class="calendar-day-number" data-calendar-date="${date}" aria-label="${escapeHtml(formatDate(dateFromISO(date)))}: ${list.length} событий" ${date===today?'aria-current="date"':''}>${Number(date.slice(-2))}</button><div class="calendar-cell-events">${list.slice(0,3).map(e=>`<button type="button" class="calendar-event ${e.kind==='exam'?'is-exam':'is-homework'} ${e.kind==='homework'&&e.record.done?'is-done':''}" ${calendarEventAttributes(e)} title="${escapeHtml(calendarEventLabel(e)+': '+e.title)}"><span class="calendar-event-type">${escapeHtml(calendarEventLabel(e))}</span><span class="calendar-event-title">${escapeHtml(e.title)}</span></button>`).join('')}${list.length>3?`<button type="button" class="calendar-more" data-calendar-date="${date}">Ещё ${list.length-3}</button>`:''}</div></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
  </section>`;
}
function shiftCalendarMonth(delta) {
  if (!calendarMonth) renderCalendar();
  calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+delta,1,12);renderCalendar();
}
function openCalendarDay(date) {
  const events=calendarEvents().filter(e=>e.date===date);
  materialState=null;
  showMaterialModal(formatDate(dateFromISO(date)),events.length ? `<div class="calendar-agenda">${events.map(e=>`<button type="button" class="calendar-agenda-event ${e.kind==='exam'?'is-exam':''}" ${calendarEventAttributes(e)}><span class="badge ${e.kind==='exam'?'exam-badge':'subject'}">${escapeHtml(calendarEventLabel(e))}</span><strong>${escapeHtml(e.title)}</strong><span>${escapeHtml([e.record.lesson?.timeStart,e.record.lesson?.groupName].filter(Boolean).join(' · '))}${e.record.attachments?.length?' · Вложения: '+e.record.attachments.length:''}</span></button>`).join('')}</div>` : '<p class="empty-col">На этот день нет ДЗ и экзаменов.</p>');
}
document.addEventListener('click',event=>{
  const shift=event.target.closest('[data-calendar-shift]');if(shift){shiftCalendarMonth(Number(shift.dataset.calendarShift));return;}
  if(event.target.closest('[data-calendar-today]')) {const d=dateFromISO(calendarToday());calendarMonth=new Date(d.getFullYear(),d.getMonth(),1,12);renderCalendar();return;}
  const draft=event.target.closest('[data-calendar-draft]');if(draft){openDraft(draft.dataset.calendarDraft);return;}
  const item=event.target.closest('[data-calendar-id]');if(item){const kind=item.dataset.calendarKind;const record=(kind==='exam'?db.exams:db.homeworks).find(r=>r.id===item.dataset.calendarId);if(record)openMaterial(kind,record.lesson,record);return;}
  const day=event.target.closest('[data-calendar-date]');if(day){openCalendarDay(day.dataset.calendarDate);return;}
  const cell=event.target.closest('[data-calendar-cell]');if(cell)openCalendarDay(cell.dataset.calendarCell);
});
