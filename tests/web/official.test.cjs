const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const fixture=name=>fs.readFileSync(path.join(__dirname,'fixtures',name+'.html'),'utf8');
function setup(){
 const dom=new JSDOM('',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
 w.AbortSignal=AbortSignal;w.AbortController=AbortController;
 for(const name of ['uust-official-parser','uust-official-client'])w.eval(fs.readFileSync(path.join(__dirname,'../../docs/js/'+name+'.js'),'utf8'));
 return {dom,w,p:w.UustOfficialParser};
}
test('actual source: 787 groups, 52 weeks, 16 lessons; no script execution',()=>{
 const {dom,w,p}=setup();assert.equal(p.parseGroups(fixture('groups')).length,787);
 const choices=p.parseChoices(fixture('choices'));assert.equal(choices.group.id,14380);assert.equal(choices.selectedWeek,7);assert.equal(choices.weeks.length,52);
 const result=p.parseSchedule(fixture('week')+'<script>window.executed=true</script>',14380);
 assert.equal(result.lessons.length,16);assert.equal(result.dates[0],'2026-10-12');assert.equal(w.executed,undefined);
 const language=result.lessons.find(l=>l.title==='Иностранный язык');assert.equal(language.type,'Практика (семинар)');assert.equal(language.teacher,null);assert.equal(language.location,'Корпус 6 - 305а');dom.window.close();
});
test('exact known POST forms, cache, reload, zero lessons on Monday',async()=>{
 const {dom,w}=setup(),calls=[];
 const fetch=async(url,options)=>{calls.push(Object.fromEntries(new URLSearchParams(options.body)));assert.equal(options.method,'POST');return {ok:true,text:async()=>calls.at(-1).funct==='group_name'?fixture('choices'):fixture('week')};};
 const opts={groupId:14380,endpoint:'http://localhost/schedule-source',fetch,storage:w.localStorage,seed:null,now:()=>Date.parse('2026-10-12T17:00Z')};
 const client=new w.UustOfficialClient(opts);await client.sync({date:'2026-10-12'});
 assert.deepEqual(calls,[{group_id:'14380',week:'7',funct:'group_name'},{group_id:'14380',week:'7',funct:'group',show_temp:'0'}]);
 assert.equal(client.getDay('2026-10-12').length,0);assert.equal(client.getDay('2026-10-13').length,5);assert.equal(client.getWeek('2026-10-12').length,7);
 const restored=new w.UustOfficialClient({...opts,fetch:async()=>{throw new Error('offline');}});
 await assert.rejects(restored.sync());assert.equal(restored.getDay('2026-10-13').length,5);assert.equal(restored.getStatus('2026-10-19').hasCache,false);dom.window.close();
});
test('each requested week loaded separately, real calendar used, old cache survives invalid reply',async()=>{
 const {dom,w}=setup();let malformed=false;const calls=[];
 const fetch=async(_url,options)=>{
  const fields=Object.fromEntries(new URLSearchParams(options.body));calls.push(fields);
  if(malformed)return {ok:true,text:async()=>'<html>ошибка</html>'};
  let html=fixture(fields.funct==='group_name'?'choices':'week');
  if(fields.funct==='group'&&fields.week==='8')for(let d=12;d<=17;d++)html=html.replaceAll(d+'.10.2026',(d+7)+'.10.2026');
  return {ok:true,text:async()=>html};
 };
 const client=new w.UustOfficialClient({groupId:14380,endpoint:'x',fetch,storage:null,seed:null});
 await Promise.all([client.sync({date:'2026-10-12'}),client.sync({date:'2026-10-19'})]);
 assert.equal(calls.filter(c=>c.funct==='group').map(c=>c.week).join(','),'7,8');
 assert.equal(client.getDay('2026-10-20').length,5);assert.equal(client.getDay('2026-10-13').length,5);
 malformed=true;await assert.rejects(client.sync({date:'2026-10-12',force:true}));assert.equal(client.getDay('2026-10-13').length,5);dom.window.close();
});
test('empty valid week replaces old lessons, malformed table rejected; stable IDs when rooms change',async()=>{
 const {dom,w,p}=setup();
 const original=p.parseSchedule(fixture('week'),14380),changed=p.parseSchedule(fixture('week').replaceAll('Корпус 9 - 304','Другая аудитория'),14380);
 assert.equal(original.lessons[0].occurrenceId,changed.lessons[0].occurrenceId);
 const empty=fixture('week').replace(/<script>[\s\S]*?<\/script>/g,'');assert.equal(p.parseSchedule(empty,14380).lessons.length,0);
 assert.throws(()=>p.parseSchedule('<table></table>',14380));
 const opts={groupId:14380,endpoint:'x',storage:null,seed:null,fetch:async(_url,{body})=>({ok:true,text:async()=>new URLSearchParams(body).get('funct')==='group_name'?fixture('choices'):fixture('week')})};
 const client=new w.UustOfficialClient(opts);await client.sync({date:'2026-10-12'});
 client.fetch=async(_url,{body})=>({ok:true,text:async()=>new URLSearchParams(body).get('funct')==='group_name'?fixture('choices'):empty});await client.sync({date:'2026-10-12',force:true});assert.equal(client.getDay('2026-10-13').length,0);dom.window.close();
});

test('session cache deduplicates queued requests, persists rows, refreshes after reopening',async()=>{
 const {dom,w}=setup();const calls=[];
 const opts={groupId:14380,endpoint:'x',storage:w.localStorage,seed:null,fetch:async(_url,{body})=>{
  const fields=Object.fromEntries(new URLSearchParams(body));calls.push(fields);
  return {ok:true,text:async()=>fixture(fields.funct==='group_name'?'choices':'week')};
 }};
 const client=new w.UustOfficialClient(opts);
 await Promise.all([client.sync({date:'2026-10-12'}),client.sync({date:'2026-10-13'})]);
 assert.equal(calls.length,2);
 await client.sync({date:'2026-10-12'});assert.equal(calls.length,2);
 assert.equal(client.getSlots('2026-10-12').length,9);
 assert.equal(client.getSlots('2026-10-12')[0].timeStart,'08:00');
 const reopened=new w.UustOfficialClient(opts);
 assert.equal(reopened.getSlots('2026-10-12').length,9);
 await reopened.sync({date:'2026-10-12'});assert.equal(calls.length,4);
 dom.window.close();
});
