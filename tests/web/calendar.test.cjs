const {test}=require('node:test');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {JSDOM}=require('jsdom');
const docs=path.join(__dirname,'../../docs');
function setup(){
 const dom=new JSDOM(fs.readFileSync(path.join(docs,'index.html'),'utf8'),{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
 const source=['core','database','schedule','uust-official-parser','calendar'].map(name=>fs.readFileSync(path.join(docs,'js/'+name+'.js'),'utf8')).join('\n');
 w.fixture=fs.readFileSync(path.join(__dirname,'fixtures/choices.html'),'utf8');
 w.eval(source+`;window.testWeeks=UustOfficialParser.parseChoices(window.fixture).weeks;scheduleClient={today:()=> '2026-10-14',weekFor:date=>window.testWeeks.find(w=>w.start<=date&&date<=w.end)?.number??null};window.setTestDB=value=>{db=normalizeDB(value);renderCalendar();};`);
 return {dom,w,d:w.document};
}
test('month grid uses real academic weeks; January and leap February dates are aligned',()=>{
 const {dom,w}=setup();const rows=w.calendarRows(new w.Date(2026,9,1,12));assert.equal(rows.length,5);
 assert.equal(rows.find(row=>row.days[0]==='2026-10-12').number,7);assert.equal(rows[0].days[0],'2026-09-28');
 const january=w.calendarRows(new w.Date(2027,0,1,12));assert.equal(january[0].days[0],'2026-12-28');assert.equal(january[0].days[4],'2027-01-01');
 const leap=w.calendarRows(new w.Date(2028,1,1,12));assert.equal(leap.flatMap(r=>r.days).filter(d=>d.startsWith('2028-02')).length,29);
 assert.equal(leap.every(r=>r.number===null),true);dom.window.close();
});
test('old backups migrate; exam drafts replace edited events; titles stay text',()=>{
 const {dom,w,d}=setup();assert.equal(w.normalizeDB({lectures:[],homeworks:[]}).exams.length,0);
 w.setTestDB({lectures:[],homeworks:[{id:'h',date:'2026-10-14',text:'Задание'}],exams:[{id:'e',date:'2026-10-14',title:'old'}],drafts:{'exam:e':{kind:'exam',record:{id:'e',date:'2026-10-14',title:'<img src=x onerror=alert(1)>'}}}});
 assert.equal(w.calendarEvents().length,2);assert.equal(d.querySelectorAll('[data-calendar-draft]').length,1);assert.equal(d.querySelector('.calendar-table img'),null);
 assert.match(d.querySelector('[data-calendar-draft]').textContent,/<img/);
 assert.equal(w.calendarDateValid('2026-02-30'),false);assert.equal(w.calendarDateValid('2028-02-29'),true);dom.window.close();
});
