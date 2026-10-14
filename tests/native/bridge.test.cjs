const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {SOURCE}=require('../../desktop/schedule.cjs');
function setup(){
 const dom=new JSDOM('',{url:'https://localhost',runScripts:'outside-only'}),w=dom.window;
 const calls=[];w.fetch=async()=>{throw new Error('Web fetch must not handle schedule');};
 w.LecturesDesktop={schedule:async body=>{calls.push(body);return {status:200,text:'<table>Расписание</table>'};},saveBackup:async(name,text)=>({saved:true,name,text})};
 w.eval(fs.readFileSync(path.join(__dirname,'../../www/js/platform.js'),'utf8'));
 return {dom,w,calls};
}
test('desktop bridge routes schedule and backup through narrow native API',async()=>{
 const {dom,w,calls}=setup();const body='group_id=14380&week=7&funct=group_name';
 const r=await w.fetch(SOURCE,{method:'POST',body});assert.equal(r.ok,true);assert.equal(await r.text(),'<table>Расписание</table>');assert.deepEqual(calls,[body]);
 assert.equal(w.LECTURES_SCHEDULE_CONFIG.endpoint,SOURCE);
 const saved=await w.LecturesPlatform.saveBackup('test.json','{}');assert.equal(saved.saved,true);assert.equal(saved.text,'{}');dom.window.close();
});
test('native error statuses and cancellation remain visible to UI',async()=>{
 const {dom,w}=setup();w.LecturesDesktop.schedule=async()=>({status:503,text:'offline'});
 const r=await w.fetch(SOURCE,{method:'POST',body:'x'});assert.equal(r.status,503);assert.equal(r.ok,false);
 const controller=new AbortController();controller.abort(new Error('cancelled'));
 await assert.rejects(w.fetch(SOURCE,{method:'POST',body:'x',signal:controller.signal}),/cancelled/);
 dom.window.close();
});
