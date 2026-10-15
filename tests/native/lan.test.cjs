const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLan}=require('../../desktop/lan.cjs');
const payload={format:'uust-diary-sync-v1',data:{subjects:[],lectures:[{id:'note'}],homeworks:[],exams:[],drafts:{}},schedule:{format:'uust-schedule-v1',groups:[]}};
async function waitFor(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Timeout');}
test('discovery excludes self, shows record counts; receiver accepts or rejects a complete transfer',async()=>{
 const a=createLan({discovery:false,name:'Notebook'}),b=createLan({discovery:false,name:'Phone'});
 try {
  const own=await a.start({count:1}),other=await b.start({count:5});
  const advert=(info,port,count)=>JSON.stringify({service:'uust-diary-lan-v2',...info,port,count});
  a.remember(advert(own,a.port(),1),'127.0.0.1');
  a.remember(advert(other,b.port(),5),'127.0.0.1');
  assert.deepEqual(a.list({count:1}).devices,[{id:other.id,name:'Phone',count:5}]);
  const transfer=a.send({peerId:other.id,payload,count:1});
  await waitFor(()=>b.pending().id);
  assert.equal(b.pending().phase,'offer');
  assert.equal(b.pending().payload,undefined);
  assert.equal(b.pending().name,'Notebook');
  assert.equal(b.pending().count,1);
  await assert.rejects(a.send({peerId:other.id,payload,count:1}),/принимает|передача/);
  b.decide({id:b.pending().id,accepted:true});
  await waitFor(()=>b.pending().phase==='data');
  assert.deepEqual(b.pending().payload,payload);
  b.decide({id:b.pending().id,accepted:true});
  assert.deepEqual(await transfer,{accepted:true});
  assert.deepEqual(b.pending(),{});
  const declined=a.send({peerId:other.id,payload,count:1});
  await waitFor(()=>b.pending().id);
  b.decide({id:b.pending().id,accepted:false});
  assert.deepEqual(await declined,{accepted:false});
  const response=await fetch('http://127.0.0.1:'+b.port()+'/sync');
  assert.equal(response.status,404); // A peer can never read private data.
 }finally{await a.stop();await b.stop();}
});
test('unknown peers and invalid discovery packets cannot receive data',async()=>{
 const lan=createLan({discovery:false});
 try {
  await lan.start();
  for(const packet of ['not json','{}',JSON.stringify({service:'other',id:'x',name:'bad',port:1,count:0})])lan.remember(packet,'127.0.0.1');
  assert.deepEqual(lan.list().devices,[]);
  await assert.rejects(lan.send({peerId:'unknown',payload,count:1}),/доступно/);
  await assert.rejects(lan.send({peerId:'unknown',payload:{}}),/данные/);
 }finally{await lan.stop();}
});
test('multicast announcements discover peers without manual addresses',async()=>{
 const networkInterfaces=()=>({loopback:[{family:'IPv4',internal:false,address:'127.0.0.1'}]});
 const a=createLan({name:'A',networkInterfaces}),b=createLan({name:'B',networkInterfaces});
 try {
  const own=await a.start({count:2}),other=await b.start({count:7});
  for(let i=0;i<60&&!a.list({count:2}).devices.length;i++)await new Promise(r=>setTimeout(r,100));
  assert.deepEqual(a.list({count:2}).devices,[{id:other.id,name:'B',count:7}]);
  assert.ok(!a.list().devices.some(p=>p.id===own.id));
 }finally{await a.stop();await b.stop();}
});
