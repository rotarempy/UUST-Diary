// Mobile layout is opt-in by viewport; the Electron desktop is never changed.
(function () {
  const root = document.documentElement;
  const query = window.matchMedia?.('(max-width: 760px), (pointer: coarse) and (max-width: 1024px)');
  let selectedDay = null;
  let lastMobile = false;
  function active() { return !window.LecturesDesktop && Boolean(query?.matches); }
  function viewport() {
    const vv = window.visualViewport;
    root.style.setProperty('--mobile-viewport-height', (vv?.height || window.innerHeight) + 'px');
    root.style.setProperty('--mobile-viewport-top', (vv?.offsetTop || 0) + 'px');
  }
  function update() {
    const mobile = active();
    root.classList.toggle('mobile-layout', mobile);
    viewport();
    if (mobile !== lastMobile) {
      lastMobile = mobile;
      if (typeof render === 'function') render();
    }
  }
  function renderDay(container, days) {
    const today = scheduleClient.today();
    if (!days.some(d => d.date === selectedDay)) {
      const previousIndex = selectedDay ? (new Date(selectedDay+'T12:00:00').getDay()+6)%7 : null;
      selectedDay = days.find(d=>d.date===today)?.date || days[previousIndex ?? 0].date;
    }
    const day = days.find(d=>d.date===selectedDay);
    const labels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    container.innerHTML = `<section class="mobile-schedule">
      <nav class="mobile-days" aria-label="Дни недели">${days.map((d,i)=>`<button type="button" class="mobile-day ${d.date===selectedDay?'selected':''} ${d.date===today?'is-today':''}" data-mobile-day="${d.date}" aria-pressed="${d.date===selectedDay}" ${d.date===today?'aria-current="date"':''} aria-label="${escapeHtml(formatDate(dateFromISO(d.date)))}${d.date===today?', сегодня':''}"><span>${labels[i]}</span><strong>${Number(d.date.slice(-2))}</strong><i aria-hidden="true"></i></button>`).join('')}</nav>
      <div class="mobile-day-heading"><h2>${escapeHtml(formatDate(dateFromISO(day.date)))}</h2>${day.date===today?'<span class="badge subject">Сегодня</span>':''}<span class="mobile-lesson-count">${day.lessons.length} ${day.lessons.length===1?'занятие':day.lessons.length>=2&&day.lessons.length<=4?'занятия':'занятий'}</span></div>
      <div class="mobile-lessons">${day.lessons.length ? [...day.lessons].sort((a,b)=>a.timeStart.localeCompare(b.timeStart)).map(lessonCard).join('') : `<div class="mobile-free-day"><strong>${scheduleBusy?'Загружаем расписание…':'В этот день нет пар'}</strong><p>${scheduleBusy?'Можно выбрать другой день.':'Выберите другой день в строке сверху.'}</p></div>`}</div>
    </section>`;
  }
  window.LecturesMobile = { active, renderDay };
  document.getElementById('daysView').addEventListener('click', event => {
    const button = event.target.closest('[data-mobile-day]');
    if (!button) return;
    selectedDay = button.dataset.mobileDay;
    renderDays();
    document.querySelector(`[data-mobile-day="${selectedDay}"]`)?.focus({preventScroll:true});
  });
  document.getElementById('todayBtn').addEventListener('click',()=>{selectedDay=scheduleClient?.today()||null;});
  function modalState() {
    root.classList.toggle('mobile-modal-open', [...document.querySelectorAll('.modal-overlay')].some(m=>!m.classList.contains('hidden')));
    viewport();
  }
  const observer = new MutationObserver(modalState);
  document.querySelectorAll('.modal-overlay').forEach(modal=>observer.observe(modal,{attributes:true,attributeFilter:['class']}));
  query?.addEventListener?.('change',update);
  window.addEventListener('resize',update);
  window.visualViewport?.addEventListener('resize',viewport);
  window.visualViewport?.addEventListener('scroll',viewport);
  // Do not call render while the rest of the scripts are still initializing.
  lastMobile = active();root.classList.toggle('mobile-layout',lastMobile);viewport();
})();
