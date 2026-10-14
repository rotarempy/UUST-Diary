const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const docs=path.join(__dirname,'../../docs');
function setup({mobile=true,desktop=false}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(docs,'index.html'),'utf8'),{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const media={matches:mobile,addEventListener(_type,callback){this.onchange=callback;}};
 w.matchMedia=()=>media;w.structuredClone=structuredClone;if(desktop)w.LecturesDesktop={};
 const source=['core','schedule','mobile','render'].map(name=>fs.readFileSync(path.join(docs,'js/'+name+'.js'),'utf8')).join('\n');
 const dates=['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18'];
 const lessons=dates.map((date,i)=>({date,title:'Предмет '+i,occurrenceId:'pair-'+i,timeStart:'09:35',timeEnd:'10:55',numbers:[2],location:'Корпус 7',teacher:'Преподаватель',type:'Лекция'}));
 w.testDays=dates.map((date,i)=>({date,lessons:i===6?[]:[lessons[i]]}));
 w.testClient={today:()=>dates[2],getWeek:()=>w.testDays,getStatus:()=>({hasCache:true}),getSlots:()=>[{number:2,timeStart:'09:35',timeEnd:'10:55'}]};
 w.eval(source+'\nscheduleClient=window.testClient;currentWeekStart=dateFromISO("2026-10-12");db.selectedGroup={id:14380,name:"ТОП-105Б"};render();');
 return {dom,w,d:w.document,media};
}
test('one mobile day; cached day switching; empty Sunday',()=>{
 const {dom,w,d}=setup();assert.ok(d.documentElement.classList.contains('mobile-layout'));
 assert.equal(d.querySelectorAll('[data-mobile-day]').length,7);assert.equal(d.querySelectorAll('[data-pair]').length,1);
 assert.equal(d.querySelector('[data-pair]').dataset.pair,'pair-2');assert.equal(d.querySelector('.timetable'),null);
 d.querySelector('[data-mobile-day="2026-10-13"]').click();assert.equal(d.querySelector('[data-pair]').dataset.pair,'pair-1');
 d.querySelector('[data-mobile-day="2026-10-18"]').click();assert.equal(d.querySelectorAll('[data-pair]').length,0);assert.match(d.querySelector('.mobile-free-day').textContent,/нет пар/);
 d.querySelector('#todayBtn').click();w.eval('render();');assert.equal(d.querySelector('[data-pair]').dataset.pair,'pair-2');dom.window.close();
});
test('desktop table stays unchanged; Electron never enables phone layout',()=>{
 for(const desktop of [false,true]){
  const {dom,d}=setup({mobile:desktop,desktop});assert.equal(d.documentElement.classList.contains('mobile-layout'),false);
  assert.ok(d.querySelector('.timetable'));assert.equal(d.querySelectorAll('[data-mobile-day]').length,0);
  assert.equal(d.querySelectorAll('.timetable tbody td').length,7);dom.window.close();
 }
});
test('rotation restores table; modal scroll lock releases on close',async()=>{
 const {dom,d,media}=setup();media.matches=false;media.onchange();assert.ok(d.querySelector('.timetable'));
 media.matches=true;media.onchange();assert.ok(d.querySelector('.mobile-days'));
 d.querySelector('#settingsModal').classList.remove('hidden');await Promise.resolve();assert.ok(d.documentElement.classList.contains('mobile-modal-open'));
 d.querySelector('#settingsModal').classList.add('hidden');await Promise.resolve();assert.equal(d.documentElement.classList.contains('mobile-modal-open'),false);dom.window.close();
});

test('desktop keeps six rows, extends through last weekly pair, and restores rows on week change',()=>{
 const {dom,w,d}=setup({mobile:false});
 const slots=Array.from({length:9},(_,i)=>({number:i+1,timeStart:String(8+i).padStart(2,'0')+':00',timeEnd:String(8+i).padStart(2,'0')+':50'}));
 w.testClient.getSlots=()=>slots;
 const show=(numbers)=>{
  w.testDays.forEach(day=>day.lessons=[]);
  w.testDays[5].lessons=numbers.map(number=>({date:w.testDays[5].date,title:'Пара '+number,occurrenceId:'test-'+number,numbers:[number],...slots[number-1]}));
  w.eval('render();');
  return [...d.querySelectorAll('.timetable tbody tr > th strong')].map(el=>Number(el.textContent.split(' ')[0]));
 };
 assert.deepEqual(show([]),[1,2,3,4,5,6]);
 assert.deepEqual(show([2,5]),[1,2,3,4,5,6]);
 assert.deepEqual(show([7]),[1,2,3,4,5,6,7]);
 assert.deepEqual(show([8]),[1,2,3,4,5,6,7,8]);
 assert.equal(d.querySelectorAll('[data-pair]').length,1);
 assert.deepEqual(show([9]),[1,2,3,4,5,6,7,8,9]);
 assert.deepEqual(show([1]),[1,2,3,4,5,6]);
 assert.equal(w.testClient.getSlots().length,9,'source slots stay intact');
 dom.window.close();
});
