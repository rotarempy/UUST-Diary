const http=require('node:http'), dgram=require('node:dgram'), os=require('node:os');
const {randomUUID}=require('node:crypto');
const GROUP='239.255.77.77', PORT=47777, SERVICE='uust-diary-lan-v2', LIMIT=200*1024*1024;
function validatePayload(p) {
 if(p?.format!=='uust-diary-sync-v1'||!['subjects','lectures','homeworks','exams'].every(k=>Array.isArray(p.data?.[k]))||!Array.isArray(p.schedule?.groups))throw new Error('Неверные данные');
 return p;
}
function createLan({discovery=true,name=os.hostname(),networkInterfaces=os.networkInterfaces}={}) {
 const id=randomUUID(), peers=new Map();
 let server,socket,timer,count=0,incoming=null,interfaces=[];
 function remember(message,address) {
  try {
   const p=JSON.parse(message);
   if(p.service!==SERVICE||p.id===id||typeof p.id!=='string'||p.id.length>100||typeof p.name!=='string'||!Number.isInteger(p.port)||p.port<1||p.port>65535||!Number.isInteger(p.count)||p.count<0)return;
   peers.set(p.id,{id:p.id,name:p.name.slice(0,100),count:p.count,port:p.port,address,seen:Date.now()});
  }catch{}
 }
 function announce() {
  if(!socket||!server)return;
  const msg=Buffer.from(JSON.stringify({service:SERVICE,id,name,count,port:server.address().port}));
  if(!interfaces.length)socket.send(msg,PORT,GROUP,()=>{});
  for(const address of interfaces){try{socket.setMulticastInterface(address);socket.send(msg,PORT,GROUP,()=>{});}catch{}}
 }
 async function stop() {
  if(timer)clearInterval(timer);timer=null;
  if(incoming){if(incoming.timeout)clearTimeout(incoming.timeout);incoming.finish(false);incoming=null;}
  if(socket){socket.close();socket=null;}
  if(server){const old=server;server=null;old.closeAllConnections();await new Promise(r=>old.close(r));}
  peers.clear();interfaces=[];
 }
 async function start(options={}) {
  count=Math.max(0,Number(options.count)||0);
  if(server){announce();return {id,name};}
  server=http.createServer(async(req,res)=>{
   const reply=(status,data)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
   if(req.method!=='POST'||!['/offer','/sync'].includes(req.url))return reply(404,{error:'Not found'});
   const offer=req.url==='/offer';
   let slot;
   if(offer){
    if(incoming)return reply(409,{error:'Устройство уже принимает данные'});
    slot={id:randomUUID(),phase:'loading',address:req.socket.remoteAddress,finish:()=>{}};incoming=slot;
   }else{
    slot=incoming;
    if(!slot||slot.phase!=='waiting'||slot.address!==req.socket.remoteAddress)return reply(403,{error:'Нет разрешения на передачу'});
    if(slot.timeout)clearTimeout(slot.timeout);
    slot.phase='loading';
   }
   try {
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>(offer?4096:LIMIT))throw new Error('Слишком много данных');chunks.push(chunk);}
    const envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!offer){if(envelope.id!==slot.id)throw new Error('Запрос истёк');validatePayload(envelope.payload);}
    if(slot.timeout)clearTimeout(slot.timeout);
    slot.timeout=setTimeout(()=>slot.finish(false),120000);
    slot.finish=accepted=>{
     clearTimeout(slot.timeout);
     if(offer&&accepted){
      slot.phase='waiting';
      slot.timeout=setTimeout(()=>{if(incoming===slot)incoming=null;},120000);
     }else if(incoming===slot)incoming=null;
     reply(200,{accepted,id:slot.id});
    };
    if(offer)Object.assign(slot,{phase:'offer',name:String(envelope.name||'Устройство').slice(0,100),count:Number(envelope.count)||0});
    else Object.assign(slot,{phase:'data',payload:envelope.payload});
    res.on('close',()=>{if(incoming===slot&&slot.phase!=='waiting')slot.finish(false);});
   }catch(e){if(incoming===slot)incoming=null;if(slot?.timeout)clearTimeout(slot.timeout);reply(400,{error:e.message});}
  });
  server.requestTimeout=180000;
  try {
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'0.0.0.0',resolve);});
   if(discovery) {
    socket=dgram.createSocket({type:'udp4',reuseAddr:true});
    socket.on('message',(msg,remote)=>remember(msg,remote.address));
    await new Promise((resolve,reject)=>{socket.once('error',reject);socket.bind(PORT,resolve);});
    socket.on('error',()=>{});
    // Join every IPv4 interface so Wi-Fi still works alongside VPN/Ethernet.
    let joined=false;
    for(const addresses of Object.values(networkInterfaces()))for(const a of addresses||[])if(a.family==='IPv4'&&!a.internal){
     try{socket.addMembership(GROUP,a.address);interfaces.push(a.address);joined=true;}catch{}
    }
    if(!joined)socket.addMembership(GROUP);
    socket.setMulticastTTL(1);
    announce();timer=setInterval(announce,2000);timer.unref();
   }
   return {id,name};
  }catch(error){await stop();throw error;}
 }
 async function send({peerId,payload,count:total}) {
  validatePayload(payload);
  const peer=peers.get(peerId);
  if(!peer||Date.now()-peer.seen>10000)throw new Error('Устройство больше не доступно');
  const post=async(path,body)=>{
   const response=await fetch('http://'+peer.address+':'+peer.port+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(150000),headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!response.ok)throw new Error(response.status===409?'На устройстве уже есть входящая передача':'Не удалось отправить данные');
   return response.json();
  };
  const consent=await post('/offer',{name,count:total});
  if(!consent.accepted)return {accepted:false};
  const result=await post('/sync',{id:consent.id,payload});
  return {accepted:result.accepted===true};

 }
 return {
  start,stop,send,
  list(options={}) {count=Math.max(0,Number(options.count)||0);return {devices:[...peers.values()].filter(p=>Date.now()-p.seen<10000).map(({id,name,count})=>({id,name,count}))};},
  pending(){if(!incoming||!['offer','data'].includes(incoming.phase))return {};return {id:incoming.id,phase:incoming.phase,name:incoming.name,count:incoming.count,payload:incoming.payload};},
  decide({id:requestId,accepted}){if(incoming?.id===requestId)incoming.finish(accepted===true);return {};},
  // Transport hooks for isolated network tests.
  remember,port:()=>server?.address().port
 };
}
module.exports={createLan,validatePayload};
