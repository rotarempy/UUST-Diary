const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB } = require('fake-indexeddb');
const groups = [{ uust_api_id:14380, title:'ПИ-101Б' }, { uust_api_id:14381, title:'ИВТ-202Б' }];
const rows = [101,102].map((id,i) => ({ uust_api_id:id, group_uust_api_id:14380, title:'Математика', weekday:1, weeks:Array.from({length:52},(_,i)=>i+1), numbers:[i+1], time_start:i?'11:00':'09:00', time_end:i?'12:30':'10:30', location:'101', teacher:{fullname:'Иванов'} }));
let offline = false;
let responseStatus = 200;
const errors = [];
let cachedStorage = {};
async function wait(check, label) {
  for(let i=0;i<200;i++){ if(check()) return; await new Promise(r=>setTimeout(r,10)); }
  throw new Error('Timeout: '+label);
}
async function create() {
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.cause?.stack || error.message));
  const fs = require('node:fs');
  const docs = path.resolve(__dirname, '../../docs');
  let html = fs.readFileSync(path.join(docs, 'index.html'), 'utf8');
  html = html.replace(/<link rel="stylesheet" href="css\/styles\.css[^"]*">/, () => '<style>' + fs.readFileSync(path.join(docs, 'css/styles.css'), 'utf8') + '</style>');
  const sources = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(match => fs.readFileSync(path.join(docs, match[1].split('?')[0]), 'utf8'));
  html = html.replace(/<script defer src="[^"]+"><\/script>/g, '').replace('</body>', () => '<script>' + sources.join('\n').replace(/<\/script/gi, '<\\/script') + '</script></body>');
  const dom = new JSDOM(html, { url: 'http://localhost/',
    runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:console,
    beforeParse(window) {
      window.LECTURES_SCHEDULE_CONFIG={endpoint:'http://localhost/schedule-source',bootstrapWeek:7};
      const OriginalDate = window.Date;
      window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ['2026-10-12T17:00:00Z'])); } static now() { return Date.parse('2026-10-12T17:00:00Z'); } };
      window.structuredClone = structuredClone;
      window.indexedDB = indexedDB;
      window.AbortController = AbortController; window.AbortSignal = AbortSignal;
      window.confirm = () => true; window.alert = () => {};
      window.scheduleRequests = 0;
      window.fetch = async (url, options = {}) => {
        window.scheduleRequests++;
        if(offline) throw new Error('offline');
        const fields=Object.fromEntries(new URLSearchParams(options.body));
        let html='';
        if(fields.funct==='filter_group') html=groups.map(g=>`<button onclick="link_group(${g.uust_api_id},7)">${g.title}</button>`).join('');
        else if(fields.funct==='group_name') html=require('node:fs').readFileSync(path.join(__dirname,'fixtures/choices.html'),'utf8');
        else if(fields.funct==='group') {
          const start=new Date('2026-10-12T00:00:00Z');start.setUTCDate(start.getUTCDate()+(Number(fields.week)-7)*7);
          const labels=Array.from({length:6},(_,i)=>{const d=new Date(+start+i*86400000);return `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}.${d.getUTCFullYear()}`;});
          html='<table><thead><tr><th>№</th><th>Время</th>'+labels.map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+rows.map((row,i)=>`<tr><td>${i+1}</td><td>${row.time_start}-${row.time_end}</td>${labels.map((_,day)=>`<td id="${i+1}_${day+1}_group"></td>`).join('')}</tr>`).join('')+'</tbody></table>';
          for(let i=0;i<rows.length;i++) {
            const row=rows[i];const fragment=`<div><br>${row.title} (Лекция)<br><button onclick="link_teacher(1,7)">${row.teacher.fullname}</button><br><button onclick="link_class(1,7)">${row.location}</button></div>`;
            html+=`<script>$('#${i+1}_1_group').append(${JSON.stringify(fragment)});</script>`;
          }
        } else throw new Error('Unexpected request: '+options.body);
        return {ok:responseStatus===200,status:responseStatus,text:async()=>html};
      };
      Object.entries(cachedStorage).forEach(([k,v])=>window.localStorage.setItem(k,v));
    }
  });
  await wait(()=>dom.window.document.querySelector('.welcome, [data-pair]'),'init');
  return dom;
}
function snapshot(dom) {
  cachedStorage = {};
  for(let i=0;i<dom.window.localStorage.length;i++) {
    const key = dom.window.localStorage.key(i); cachedStorage[key] = dom.window.localStorage.getItem(key);
  }
}
function click(dom, selector) {
  const el = selector === '[data-pair]:nth-child(2)' ? dom.window.document.querySelectorAll('[data-pair]')[1] : dom.window.document.querySelector(selector); assert.ok(el,selector); el.click();
}
function fill(dom, selector, value) {
  const el = dom.window.document.querySelector(selector); assert.ok(el,selector); el.value=value; el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
}
async function stored(dom) { await dom.window.eval('saveQueue').catch(()=>{}); }
function content(dom, selector) { return dom.window.document.querySelector(selector)?.textContent; }
function pointer(dom, target, type) {
  const e = new dom.window.MouseEvent(type,{bubbles:true,button:0}); Object.defineProperty(e,'pointerId',{value:1}); target.dispatchEvent(e);
}
(async()=>{
  let dom = await create(); let w=dom.window, d=w.document;
  click(dom,'#settingsBtn');
  fill(dom,'#scaleRange','115');assert.equal(d.querySelector('#scaleValue').textContent,'115%');
  assert.equal(d.querySelector('#resetScale').disabled,false);click(dom,'#resetScale');
  assert.equal(d.querySelector('#scaleRange').value,'100');assert.equal(d.querySelector('#scaleValue').textContent,'100%');
  assert.equal(JSON.parse(w.localStorage.getItem('lecture_app_appearance_v1')).scale,100);
  assert.equal(d.querySelector('#resetScale').disabled,true);
  click(dom,'[data-appearance-mode="light"]');
  click(dom,'[data-theme-choice="uunit"] .preview-lesson');
  assert.equal(d.documentElement.dataset.appearance,'light');assert.equal(d.documentElement.dataset.theme,'uunit');
  click(dom,'[data-appearance-mode="dark"]');assert.equal(d.querySelector('[data-theme-choice][aria-pressed="true"]').dataset.themeChoice,'uunit');
  assert.equal(d.documentElement.dataset.appearance,'dark');click(dom,'#closeSettings');
  assert.equal(d.querySelectorAll('.tab').length,3); assert.equal(d.querySelectorAll('[data-pair]').length,0);
  fill(dom,'#groupSearch','пи-'); await wait(()=>d.querySelector('[role="option"]'),'groups'); await w.eval('groupLoading');
  assert.equal(d.querySelectorAll('[role="option"]').length,1); click(dom,'[role="option"]');
  await wait(()=>d.querySelectorAll('[data-pair]').length===2,'schedule'); await stored(dom);
  assert.equal(d.querySelectorAll('.today-column').length,1);
  assert.equal(d.querySelectorAll('.timetable tbody tr').length,2);
  assert.equal(d.querySelector('.timetable [data-slot="11:00"] [data-pair]').dataset.pair.includes(':2:'),true);
  assert.equal(d.querySelectorAll('.timetable [data-slot="09:00"] td').length,7);
  assert.equal(d.querySelectorAll('.timetable [data-slot="09:00"] .empty-slot').length,6);
  await w.eval('scheduleClient.pending');
  const before = w.scheduleRequests;
  click(dom,'#nextWeek'); await w.eval('scheduleClient.pending');
  const after = w.scheduleRequests; assert.equal(after,before+1);
  click(dom,'#prevWeek');
  assert.equal(w.scheduleRequests,after);
  assert.equal(d.querySelector('[data-pair]').dataset.pair.includes('2026-10-12'),true);
  click(dom,'#nextWeek'); click(dom,'#prevWeek'); click(dom,'#todayBtn');
  d.dispatchEvent(new w.Event('visibilitychange'));
  await w.eval('scheduleClient.pending');assert.equal(w.scheduleRequests,after);
  assert.equal(d.querySelector('#refreshSchedule').hidden,true);
  assert.equal(w.eval('db.selectedGroup.id'),14380);
  snapshot(dom); dom.window.close(); dom=await create(); w=dom.window; d=w.document;
  await wait(()=>d.querySelector('[data-pair]'),'restore');
  await wait(()=>w.eval('scheduleClient.sessionWeeks.size')===2,'refresh all saved weeks on reentry');
  assert.equal(w.scheduleRequests,3);
  assert.equal(d.querySelector('#groupSearch').value,'ПИ-101Б');
  click(dom,'[data-pair]'); click(dom,'[data-kind="lecture"]');
  assert.equal(d.querySelectorAll('#fDate,#fSubject').length,0);
  assert.equal(d.querySelectorAll('#modalFooter button').length,2);
  fill(dom,'#fTitle','Первая лекция');
  const text='# Тема\n\nПервое  слово    второе\nстрока два\n\n\n\nСледующий абзац\n\n<mark>тег</mark> и ~~удалено~~\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] готово\n\n```js\nconst a = 1;\n```';
  fill(dom,'#fContent',text); await stored(dom);
  pointer(dom,d.querySelector('#fContent'),'pointerdown'); pointer(dom,d.querySelector('#lectureModal'),'pointerup');
  assert.equal(d.querySelector('#lectureModal').classList.contains('hidden'),false);
  pointer(dom,d.querySelector('#lectureModal'),'pointerdown'); pointer(dom,d.querySelector('#lectureModal'),'pointerup');
  assert.equal(d.querySelector('#lectureModal').classList.contains('hidden'),true); await stored(dom);
  click(dom,'[data-pair]'); click(dom,'[data-kind="lecture"]'); assert.equal(d.querySelector('#fContent').value,text);
  click(dom,'#closeModal'); click(dom,'[data-pair]:nth-child(2)'); click(dom,'[data-kind="lecture"]');
  assert.equal(d.querySelector('#fContent').value,''); click(dom,'#closeModal'); await stored(dom);
  snapshot(dom); dom.window.close(); dom=await create(); w=dom.window; d=w.document;
  await wait(()=>d.querySelector('[data-pair]'),'restore draft'); click(dom,'[data-pair]'); click(dom,'[data-kind="lecture"]');
  assert.equal(d.querySelector('#fContent').value,text);
  const file = new w.File(['file content'],'notes.txt',{type:'text/plain'});
  Object.defineProperty(d.querySelector('#fFiles'),'files',{value:[file],configurable:true});
  d.querySelector('#fFiles').dispatchEvent(new w.Event('change',{bubbles:true}));
  await wait(()=>!d.querySelector('#saveMaterial').disabled,'attachment'); await stored(dom);
  click(dom,'#saveMaterial'); await wait(()=>d.querySelector('#editMaterial'),'saved');
  assert.equal(content(dom,'.viewer-content h1'),'Тема'); assert.equal(content(dom,'.viewer-content mark'),'тег');
  assert.equal(content(dom,'.viewer-content del'),'удалено'); assert.equal(d.querySelectorAll('.viewer-content table').length,1);
  assert.equal(d.querySelectorAll('.viewer-content input:disabled').length,1);
  assert.equal(d.querySelectorAll('.viewer-content pre code').length,1);
  const p=[...d.querySelectorAll('.viewer-content p')].find(p=>p.textContent.startsWith('Первое'));
  assert.equal(p.textContent,'Первое  слово    второе\nстрока два'); assert.equal(w.getComputedStyle(p).whiteSpace,'pre-wrap');
  assert.ok(d.querySelector('.md-gap[style="height:3lh"]')); assert.ok(d.querySelector('[download="notes.txt"]'));
  click(dom,'#editMaterial'); fill(dom,'#fTitle','Продолжение'); click(dom,'#closeModal'); await stored(dom);
  click(dom,'[data-pair]'); click(dom,'[data-kind="lecture"]'); assert.equal(d.querySelector('#fTitle').value,'Продолжение');
  click(dom,'#clearMaterial'); await stored(dom); assert.equal(d.querySelector('#fContent').value,'');
  assert.equal(d.querySelectorAll('#fFilesPreview .file-thumb').length,0);
  click(dom,'#closeModal'); click(dom,'[data-pair]'); click(dom,'[data-kind="homework"]');
  assert.equal(d.querySelectorAll('#fTitle,#modalBody input[type="checkbox"]').length,0);
  fill(dom,'#fContent','Задачи  1 и 2\n\n\n**Решить**');
  Object.defineProperty(d.querySelector('#fFiles'),'files',{value:[new w.File(['task'],'task.txt',{type:'text/plain'})],configurable:true});
  d.querySelector('#fFiles').dispatchEvent(new w.Event('change',{bubbles:true}));
  await wait(()=>!d.querySelector('#saveMaterial').disabled,'hw attachment');
  click(dom,'#saveMaterial'); await wait(()=>d.querySelector('#toggleDone'),'hw saved');
  assert.ok(d.querySelector('[download="task.txt"]')); assert.equal(content(dom,'#toggleDone'),'Сделано');
  click(dom,'#toggleDone'); await stored(dom); assert.equal(content(dom,'#toggleDone'),'Не сделано');
  click(dom,'#toggleDone'); await stored(dom); assert.equal(content(dom,'#toggleDone'),'Сделано');
  click(dom,'#closeModal'); click(dom,'[data-pair]'); click(dom,'[data-kind="exam"]');
  assert.equal(content(dom,'#modalTitle'),'Редактор экзамена');
  fill(dom,'#fTitle','Экзамен по математике'); fill(dom,'#fContent','Билеты 1–20\n\n**Подготовить** конспект');
  Object.defineProperty(d.querySelector('#fFiles'),'files',{value:[new w.File(['pdf'],'exam.pdf',{type:'application/pdf'})],configurable:true});
  d.querySelector('#fFiles').dispatchEvent(new w.Event('change',{bubbles:true}));
  await wait(()=>!d.querySelector('#saveMaterial').disabled,'exam attachment');
  click(dom,'#closeModal'); await stored(dom);
  snapshot(dom); dom.window.close(); dom=await create();w=dom.window;d=w.document;
  await wait(()=>d.querySelector('[data-pair]'),'exam draft reload');
  click(dom,'[data-view="calendar"]');
  const examDraft=d.querySelector('[data-calendar-draft^="exam:"]');assert.ok(examDraft);
  const calendarDay=d.querySelector('[data-calendar-cell="2026-10-12"]');
  assert.equal(calendarDay.closest('tr').querySelector('.calendar-week').textContent,'7');
  assert.ok(calendarDay.querySelector('[data-calendar-kind="homework"]'));
  examDraft.click();assert.equal(d.querySelector('#fTitle').value,'Экзамен по математике');
  assert.equal(d.querySelectorAll('#fFilesPreview .file-thumb').length,1);
  click(dom,'#saveMaterial');await wait(()=>d.querySelector('#editMaterial'),'exam save');
  assert.equal(w.eval('db.exams.length'),1);assert.ok(d.querySelector('[download="exam.pdf"]'));
  click(dom,'#closeModal');
  assert.equal(d.querySelectorAll('[data-calendar-kind="exam"]').length,1);
  const requestCount=w.scheduleRequests;
  click(dom,'[data-calendar-shift="1"]');assert.match(content(dom,'#calendarMonthTitle'),/ноябрь/);
  click(dom,'[data-calendar-shift="-1"]');assert.equal(w.scheduleRequests,requestCount);
  click(dom,'[data-calendar-date="2026-10-12"]');assert.equal(d.querySelectorAll('.calendar-agenda-event').length,2);
  click(dom,'.calendar-agenda-event[data-calendar-kind="exam"]');assert.equal(content(dom,'#modalTitle'),'Экзамен по математике');
  click(dom,'#closeModal');click(dom,'[data-view="days"]');

  click(dom,'#closeModal'); click(dom,'[data-pair]:nth-child(2)'); click(dom,'[data-kind="lecture"]'); fill(dom,'#fContent','Вторая пара'); click(dom,'#closeModal');
  click(dom,'[data-view="subjects"]'); assert.equal(d.querySelectorAll('#subjectsView [data-lecture]').length,1); assert.equal(d.querySelectorAll('#subjectsView [data-draft]').length,1);
  click(dom,'[data-draft]'); click(dom,'#clearMaterial'); await stored(dom); click(dom,'#closeModal'); assert.equal(d.querySelectorAll('#subjectsView [data-draft]').length,0);
  // Closing/reopening while a file is still being read must not overwrite newer text.
  click(dom,'[data-view="days"]'); click(dom,'[data-pair]:nth-child(2)'); click(dom,'[data-kind="lecture"]');
  const originalReader=w.FileReader;
  w.FileReader=class { readAsDataURL() { setTimeout(()=>{ this.result='data:text/plain;base64,ZmlsZQ=='; this.onload(); },80); } };
  Object.defineProperty(d.querySelector('#fFiles'),'files',{value:[new w.File(['file'],'slow.txt',{type:'text/plain'})],configurable:true});
  d.querySelector('#fFiles').dispatchEvent(new w.Event('change',{bubbles:true}));
  click(dom,'#closeModal'); click(dom,'[data-pair]:nth-child(2)'); click(dom,'[data-kind="lecture"]');
  assert.equal(d.querySelector('#saveMaterial').disabled,true);
  fill(dom,'#fContent','Новый текст во время загрузки');
  await wait(()=>!d.querySelector('#saveMaterial').disabled,'slow file');
  assert.equal(d.querySelector('#fContent').value,'Новый текст во время загрузки');
  assert.equal(d.querySelectorAll('#fFilesPreview .file-thumb').length,1);
  w.FileReader=originalReader; click(dom,'#clearMaterial'); await stored(dom); click(dom,'#closeModal');
  const html=w.renderMarkdown('<mark>ok</mark><script>window.pwned=true</script><img src=x onerror="window.pwned=true"><a href="javascript:alert(1)">bad</a>');
  assert.ok(html.includes('<mark>ok</mark>')); assert.ok(!/script|onerror|javascript:/.test(html)); assert.equal(w.pwned,undefined);
  const edge=w.renderMarkdown('\n\na  b\n\n'); const temp=d.createElement('div'); temp.innerHTML=edge;
  assert.equal(temp.firstElementChild.style.height,'2lh'); assert.equal(temp.lastElementChild.style.height,'2lh');
  assert.equal(temp.querySelectorAll('.md-gap').length,2);
  const old=w.normalizeDB({version:5,subjects:[{id:'old',name:'Старый предмет'}],lectures:[{id:'legacy',date:'2025-01-01',title:'Старая лекция',subjectId:'old',content:'Старый текст'}],homeworks:[]});
  assert.equal(old.selectedGroup,null); assert.equal(old.lectures.length,1);
  // Export exact new format, including drafts and group.
  click(dom,'[data-view="days"]'); click(dom,'[data-pair]:nth-child(2)'); click(dom,'[data-kind="lecture"]'); fill(dom,'#fContent','Черновик для экспорта'); click(dom,'#closeModal'); await stored(dom);
  let exported;
  w.URL.createObjectURL=blob=>{exported=blob;return 'blob:test';}; w.URL.revokeObjectURL=()=>{};
  const originalClick=w.HTMLAnchorElement.prototype.click; w.HTMLAnchorElement.prototype.click=function(){};
  await w.exportDataToJson();
  const reader=new w.FileReader(); const json=await new Promise(resolve=>{reader.onload=()=>resolve(reader.result);reader.readAsText(exported);});
  const payload=JSON.parse(json); assert.equal(payload.version,7); assert.equal(payload.selectedGroup.id,14380);
  assert.equal(Object.keys(payload.drafts).length,1); assert.equal(payload.homeworks[0].attachments.length,1);assert.equal(payload.exams.length,1);assert.equal(payload.exams[0].attachments.length,1);
  w.HTMLAnchorElement.prototype.click=originalClick;
  snapshot(dom); await stored(dom); dom.window.close(); offline=true; dom=await create(); w=dom.window; d=w.document;
  await wait(()=>d.querySelector('[data-pair]'),'offline schedule');
  await wait(()=>!d.querySelector('#refreshSchedule').disabled,'offline refreshed');
  assert.equal(d.querySelector('#groupSearch').value,'ПИ-101Б'); assert.match(content(dom,'#scheduleStatus'),/сохранённая версия/);
  click(dom,'[data-pair]'); click(dom,'[data-kind="homework"]'); assert.ok(d.querySelector('[download="task.txt"]'));
  // Navigating to a different week requests its week number; it never repeats last week's pairs.
  offline=false;responseStatus=200;
  click(dom,'[data-view="days"]');click(dom,'#nextWeek');
  await wait(()=>!d.querySelector('#refreshSchedule').disabled,'next week');
  assert.ok([...d.querySelectorAll('[data-pair]')].every(b=>b.dataset.pair.includes('2026-10-19')));
  click(dom,'#todayBtn');await wait(()=>!d.querySelector('#refreshSchedule').disabled,'today');
  // Real import path preserves v6 data and safely closes an active editor.
  click(dom,'#closeModal');
  await w.importDataFromJson({ text:async()=>JSON.stringify(payload) }); await stored(dom);
  assert.equal(w.eval('db.selectedGroup.id'),14380); assert.equal(w.eval('Object.keys(db.drafts).length'),1);
  click(dom,'[data-pair]'); click(dom,'[data-kind="homework"]'); click(dom,'#deleteMaterial'); await stored(dom);
  assert.equal(w.eval('db.homeworks.length'),0);
  click(dom,'[data-view="calendar"]');click(dom,'[data-calendar-kind="exam"]');click(dom,'#deleteMaterial');await stored(dom);
  assert.equal(w.eval('db.exams.length'),0);assert.equal(d.querySelectorAll('[data-calendar-kind="exam"]').length,0);
  offline=false; responseStatus=401;
  await w.loadGroups(true); assert.match(w.eval('groupError'),/HTTP 401/);
  await w.refreshSchedule({force:true}); assert.match(content(dom,'#scheduleStatus'),/Не удалось обновить/);
  dom.window.close();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: DOM integration: group search/persistence, timetable, independent drafts and reload, drag-safe closing, lecture and homework fields, GFM/tags/whitespace, attachments, done toggle, subjects view, clear, export, offline, legacy migration.');
})().catch(error=>{console.error(error);console.error(errors);process.exit(1);});
