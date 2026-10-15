// Public schedule snapshots never contain private notes or attachments.
let publishedSchedule = null;
function validateSchedule(value) {
  if (!value || value.format !== 'uust-schedule-v1' || !Array.isArray(value.groups)) throw new Error('Неверный файл расписания');
  for (const group of value.groups) {
    if (!Number.isSafeInteger(group.id) || group.id < 1 || typeof group.name !== 'string' || !Array.isArray(group.weeks) || !group.snapshots || typeof group.snapshots !== 'object') throw new Error('Неверная группа');
    for (const [day, snapshot] of Object.entries(group.snapshots)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(snapshot.lessons)) throw new Error('Неверная неделя');
      for (const l of snapshot.lessons) {
        if (!l || !['occurrenceId','title','date','timeStart','timeEnd'].every(key => typeof l[key] === 'string') || !Array.isArray(l.numbers) || !l.numbers.every(Number.isSafeInteger) || !/^\d{2}:\d{2}$/.test(l.timeStart) || !/^\d{2}:\d{2}$/.test(l.timeEnd)) throw new Error('Неверная пара');
      }
    }
  }
  return value;
}
async function loadPublishedSchedule() {
  if (!scheduleConfig.staticOnly) return;
  try {
    const response = await fetch(new URL('snapshot.json', scheduleBaseUrl), {cache:'no-cache'});
    if (response.ok) publishedSchedule = validateSchedule(await response.json());
  } catch (_) { /* Older published HTML remains available offline. */ }
}
function collectSchedule() {
  const groups = new Map();
  const names = new Map([...(window.UUST_OFFICIAL_SEED?.groups || []).map(g => [Number(g.id ?? g.uust_api_id), g.name ?? g.title]), ...groupList.map(g => [g.id, g.name])]);
  if (db.selectedGroup) names.set(db.selectedGroup.id, db.selectedGroup.name);
  function add(id, value, name) {
    if (!Number.isSafeInteger(id) || !value?.snapshots) return;
    const previous = groups.get(id) || {id, name:name || names.get(id) || String(id), weeks:[], snapshots:{}};
    if (name) previous.name = name;
    if ((value.calendarAt || 0) >= (previous.calendarAt || 0)) {
      previous.weeks = value.weeks || []; previous.calendarAt = value.calendarAt || 0;
    }
    for (const [day, snapshot] of Object.entries(value.snapshots)) {
      if (!previous.snapshots[day] || (snapshot.lastSync || 0) >= (previous.snapshots[day].lastSync || 0)) previous.snapshots[day] = snapshot;
    }
    groups.set(id, previous);
  }
  publishedSchedule?.groups.forEach(g => add(g.id, g, g.name));
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('lectures.official.v1:')) continue;
    try { const value = JSON.parse(localStorage.getItem(key)); add(value.groupId, value); } catch (_) {}
  }
  scheduleClients.forEach((client, id) => add(id, client));
  return validateSchedule({format:'uust-schedule-v1', exportedAt:new Date().toISOString(), groups:[...groups.values()]});
}
async function exportScheduleSnapshot() {
  try {
    const data = collectSchedule();
    if (!data.groups.length) { showToast('Нет сохранённого расписания'); return; }
    const text = JSON.stringify(data, null, 2);
    if (window.LecturesPlatform?.saveSnapshot) {
      const result = await LecturesPlatform.saveSnapshot(text);
      if (result.saved) showToast(window.LecturesPlatform.isAndroid ? 'Сохранено: Documents/UUST-Diary/schedule/snapshot.json' : 'snapshot.json сохранён', 6000);
    } else {
      const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
      const a = document.createElement('a'); a.href=url; a.download='snapshot.json'; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      showToast('Поместите snapshot.json в docs/data/schedule репозитория',6000);
    }
  } catch (error) { alert('Не удалось сохранить расписание: '+error.message); }
}
function syncPayload() {
  captureDraft();
  return {format:'uust-diary-sync-v1', data:structuredClone(db), schedule:collectSchedule(), appearance:{...appearance}};
}
async function receiveSync(value, options = {}) {
  if (!value || value.format !== 'uust-diary-sync-v1' || !['subjects','lectures','homeworks','exams'].every(k=>Array.isArray(value.data?.[k]))) throw new Error('Неверные данные синхронизации');
  validateSchedule(value.schedule);
  if (!options.approved && !confirm(options.message || 'Заменить все записи, черновики, сохранённое расписание и настройки данными другого устройства?')) return false;
  if (options.check && !await options.check()) throw new Error('Запрос истёк. Попросите отправителя повторить передачу.');
  closeModal();
  await saveQueue.catch(()=>{});
  const previous=db;
  await idbPut('data','pre_sync_backup',previous);
  const updates=value.schedule.groups.map(group=>({
    key:'lectures.official.v1:'+encodeURIComponent(scheduleBaseUrl)+':'+group.id,
    text:JSON.stringify({version:1,groupId:group.id,weeks:group.weeks,calendarAt:group.calendarAt||0,snapshots:group.snapshots})
  }));
  const oldCache=new Map(Object.keys(localStorage).filter(key=>key.startsWith('lectures.official.v1:')).map(key=>[key,localStorage.getItem(key)]));
  const oldAppearance={...appearance};
  const clients=[...scheduleClients.values()], stores=clients.map(client=>client.storage);
  clients.forEach(client=>{client.storage=null;});
  try {
    for (const key of oldCache.keys()) localStorage.removeItem(key);
    updates.forEach(update=>localStorage.setItem(update.key,update.text));
    db=normalizeDB(value.data);
    if (!await saveDB()) throw new Error('Не удалось сохранить записи');
  } catch(error) {
    db=previous;
    for (const update of updates) { try { localStorage.removeItem(update.key); } catch (_) {} }
    for (const [key,text] of oldCache) { try { localStorage.setItem(key,text); } catch (_) {} }
    appearance=oldAppearance;
    clients.forEach((client,i)=>{client.storage=stores[i];});
    throw error;
  }
  if(value.appearance){appearance=normalizeAppearance(value.appearance);applyAppearance(appearance);}
  window.db=db;
  scheduleClients.clear(); scheduleEntries.clear(); scheduleRefreshId++; scheduleBusy=false;
  restoreSelectedGroup(); scheduleMessage=''; render();
  showToast('Данные получены');
  return true;
}
let lanGeneration = 0;
let lanTimer = null, lanActive = false, lanPolling = false, lanReceiving = false, lanSending = false;
function recordCount(data = db) {
  return ['lectures','homeworks','exams'].reduce((sum,key)=>sum+(data[key]?.length || 0),0)+Object.keys(data.drafts || {}).length;
}
function localRecordsText() {
  return `На этом устройстве: ${recordCount()} записей · Лекции: ${db.lectures.length} · ДЗ: ${db.homeworks.length} · Экзамены: ${db.exams.length} · Черновики: ${Object.keys(db.drafts).length}`;
}
async function startLanDiscovery() {
  if (!window.LecturesPlatform?.lan || lanActive) return;
  const status=document.getElementById('lanStatus');
  lanActive=true;
  const generation=++lanGeneration;
  status.textContent='Ищем устройства…';
  try {
    await LecturesPlatform.lan('start',{count:recordCount()});
    if(!lanActive || generation!==lanGeneration)return;
    document.getElementById('lanOwnCount').textContent=localRecordsText();
    await pollLanDevices();
    if(lanActive && generation===lanGeneration)lanTimer=setInterval(pollLanDevices,1500);
  } catch(error) {if(generation===lanGeneration){lanActive=false;status.textContent='Не удалось включить обнаружение: '+error.message;}}
}
async function stopLanDiscovery() {
  lanActive=false;lanGeneration++;
  clearInterval(lanTimer);lanTimer=null;
  if(window.LecturesPlatform?.lan) {
    try {await LecturesPlatform.lan('stop');} catch (_) {}
  }
}
async function pollLanDevices() {
  if(!lanActive || lanPolling)return;
  lanPolling=true;
  const status=document.getElementById('lanStatus');
  try {
    const result=await LecturesPlatform.lan('list',{count:recordCount()});
    if(!lanActive)return;
    document.getElementById('lanOwnCount').textContent=localRecordsText();
    const list=document.getElementById('lanDevices');
    list.replaceChildren();
    for(const peer of result.devices || []) {
      const button=document.createElement('button');
      button.type='button';button.className='lan-device';
      const title=document.createElement('strong');title.textContent=peer.name;
      const detail=document.createElement('span');detail.textContent=peer.count+' записей · Отправить все данные';
      button.append(title,detail);button.disabled=lanSending||lanReceiving;
      button.onclick=()=>sendToDevice(peer);
      list.append(button);
    }
    if(!list.children.length)list.textContent='Устройства пока не найдены. Откройте настройки приложения на другом устройстве в той же сети.';
    if(list.children.length && status.textContent==='Ищем устройства…')status.textContent='Выберите устройство для отправки';
    const incoming=await LecturesPlatform.lan('pending');
    if(incoming.id && !lanReceiving && lanActive) {
      lanReceiving=true;
      try {
        if(lanSending){await LecturesPlatform.lan('decide',{id:incoming.id,accepted:false});return;}
        if(incoming.phase==='offer') {
          const accepted=confirm(`Устройство «${incoming.name}» хочет отправить ${incoming.count} записей.
Сейчас у вас: ${recordCount()} записей.

Принять все данные и заменить свои записи, черновики, расписание и настройки?`);
          const current=await LecturesPlatform.lan('pending');
          if(current.id!==incoming.id)throw new Error('Время ожидания истекло');
          await LecturesPlatform.lan('decide',{id:incoming.id,accepted});
          status.textContent=accepted?'Разрешение дано. Получаем данные…':'Передача отклонена';
        } else {
          const accepted=await receiveSync(incoming.payload,{
            approved:true,
            check:async()=>lanActive && (await LecturesPlatform.lan('pending')).id===incoming.id
          });
          await LecturesPlatform.lan('decide',{id:incoming.id,accepted});
          status.textContent=accepted?'Все данные приняты и заменены':'Передача отклонена';
        }
        document.getElementById('lanOwnCount').textContent=localRecordsText();
      }catch(error){
        await LecturesPlatform.lan('decide',{id:incoming.id,accepted:false});
        status.textContent='Данные не приняты: '+error.message;
      }finally{lanReceiving=false;}
    }
  } catch(error) {status.textContent='Ошибка обнаружения: '+error.message;}
  finally{lanPolling=false;}
}
async function sendToDevice(peer) {
  if(lanSending||lanReceiving)return;
  lanSending=true;
  const status=document.getElementById('lanStatus');
  document.querySelectorAll('.lan-device').forEach(button=>{button.disabled=true;});
  status.textContent='Отправка на «'+peer.name+'». Ожидаем подтверждение на устройстве…';
  try {
    const payload=syncPayload();
    const result=await LecturesPlatform.lan('send',{peerId:peer.id,payload,count:recordCount(payload.data)});
    status.textContent=result.accepted?'Устройство «'+peer.name+'» приняло данные':'Передача отклонена или время ожидания истекло';
  } catch(error){status.textContent='Не удалось отправить: '+error.message;}
  finally{lanSending=false;pollLanDevices();}
}
function bindTransfers() {
  document.getElementById('exportScheduleBtn').onclick=exportScheduleSnapshot;
  if(!window.LecturesPlatform?.lan)return;
  document.getElementById('lanSettings').hidden=false;
  document.getElementById('lanRefresh').onclick=()=>lanActive?pollLanDevices():startLanDiscovery();
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')stopLanDiscovery();
    else if(!document.getElementById('settingsModal').classList.contains('hidden'))startLanDiscovery();
  });
}
