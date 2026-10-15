const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {IDBFactory}=require('fake-indexeddb');
test('device list compares counts; receiving needs consent and replaces data only after upload',async()=>{
 const docs=path.join(__dirname,'../../docs');
 let html=fs.readFileSync(path.join(docs,'index.html'),'utf8');
 const scripts=[...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(m=>fs.readFileSync(path.join(docs,m[1].split('?')[0]),'utf8'));
 html=html.replace(/<script defer src="[^"]+"><\/script>/g,'');
 const dom=new JSDOM(html,{url:'https://example.org/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const calls=[];let pending={},accept=false,stopped=false;
 const makePayload=(n)=>({format:'uust-diary-sync-v1',data:{subjects:[],lectures:Array.from({length:n},(_,i)=>({id:String(i),title:'Note',attachments:[]})),homeworks:[],exams:[],drafts:{}},schedule:{format:'uust-schedule-v1',groups:[]}});
 w.indexedDB=new IDBFactory();w.structuredClone=structuredClone;w.AbortController=AbortController;w.AbortSignal=AbortSignal;
 w.fetch=async()=>({ok:true,json:async()=>({format:'uust-schedule-v1',groups:[]})});
 w.confirm=()=>accept;
 w.LecturesPlatform={lan:async(action,options={})=>{
  calls.push({action,options});
  if(action==='start')return {id:'self',name:'This device'};
  if(action==='list')return {devices:[{id:'peer',name:'Phone',count:3}]};
  if(action==='pending')return pending;
  if(action==='decide'){
   pending=options.accepted&&pending.phase==='offer'?{id:'incoming',phase:'data',name:'Phone',count:3,payload:makePayload(3)}:{};
   return {};
  }
  if(action==='send')return {accepted:true};
  if(action==='stop'){stopped=true;return {};}
 }};
 w.eval(scripts.join('\n'));
 try {
  for(let i=0;i<100&&!w.document.querySelector('.welcome');i++)await new Promise(r=>setTimeout(r,10));
  await w.receiveSync(makePayload(2),{approved:true});
  w.openSettingsModal();
  for(let i=0;i<100&&!w.document.querySelector('.lan-device');i++)await new Promise(r=>setTimeout(r,10));
  assert.match(w.document.getElementById('lanOwnCount').textContent,/2 записей/);
  assert.match(w.document.querySelector('.lan-device').textContent,/Phone.*3 записей/);
  assert.equal(w.document.getElementById('lanAddress'),null);
  assert.equal(w.document.getElementById('lanToken'),null);
  await w.document.querySelector('.lan-device').onclick();
  assert.equal(calls.find(c=>c.action==='send').options.peerId,'peer');
  assert.equal(calls.find(c=>c.action==='send').options.payload.data.lectures.length,2);
  await new Promise(r=>setTimeout(r,20));
  pending={id:'incoming',phase:'offer',name:'Phone',count:3};
  await w.pollLanDevices();
  assert.equal(w.syncPayload().data.lectures.length,2);
  assert.equal(calls.filter(c=>c.action==='decide').at(-1).options.accepted,false);
  accept=true;pending={id:'incoming',phase:'offer',name:'Phone',count:3};
  await w.pollLanDevices();
  assert.equal(w.syncPayload().data.lectures.length,2); // Consent has not overwritten anything.
  await w.pollLanDevices();
  assert.equal(w.syncPayload().data.lectures.length,3);
  assert.match(w.document.getElementById('lanOwnCount').textContent,/3 записей/);
  w.closeSettingsModal();await new Promise(r=>setTimeout(r,10));assert.equal(stopped,true);
 }finally{await w.stopLanDiscovery();w.close();}
});
