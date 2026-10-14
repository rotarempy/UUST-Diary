(function(root) {
  'use strict';
  function date(iso) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw new Error('Дата должна быть YYYY-MM-DD');
    const d=new Date(iso+'T00:00:00Z');
    if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==iso)throw new Error('Неверная дата');
    return d;
  }
  function monday(iso) {const d=date(iso);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
  const clone=value=>JSON.parse(JSON.stringify(value));
  class Client {
    constructor({groupId,endpoint,fetch:fetchImpl,now=()=>Date.now(),storage,seed=root.UUST_OFFICIAL_SEED,bootstrapWeek=7}={}) {
      if(!Number.isSafeInteger(groupId)||groupId<1)throw new Error('Неверная группа');
      this.groupId=groupId;this.endpoint=endpoint;this.fetch=fetchImpl||root.fetch.bind(root);this.now=now;
      this.bootstrapWeek=bootstrapWeek;this.calendarAt=0;this.weeks=[];this.snapshots={};this.pending=null;this.warning=null;this.sessionWeeks=new Set();this.calendarLoaded=false;
      this.key='lectures.official.v1:'+encodeURIComponent(endpoint)+':'+groupId;
      try {
        this.storage=storage===undefined?root.localStorage:storage;
        const cache=JSON.parse(this.storage?.getItem(this.key)||'null');
        if(cache?.version===1&&cache.groupId===groupId&&Array.isArray(cache.weeks)&&cache.snapshots&&typeof cache.snapshots==='object') {
          this.weeks=cache.weeks;this.calendarAt=Number(cache.calendarAt)||0;this.snapshots=cache.snapshots;
        }
      }catch(_){this.warning='Сохранённое расписание недоступно';}
      // Actual user-supplied source snapshot, not demonstration data.
      if(seed?.groupId===groupId&&!Object.keys(this.snapshots).length) {
        this.weeks=clone(seed.weeks);this.calendarAt=seed.capturedAt;this.snapshots[seed.monday]={lessons:clone(seed.lessons),lastSync:seed.capturedAt};
        this.warning='Показано расписание из сохранённого ответа сайта';
      }
    }
    today() {
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(this.now())).map(p=>[p.type,p.value]));
      return `${parts.year}-${parts.month}-${parts.day}`;
    }
    weekFor(iso) { date(iso);return this.weeks.find(w=>w.start<=iso&&iso<=w.end)?.number??null; }
    getStatus(iso=this.today()) {
      const snapshot=this.snapshots[monday(iso)];
      return {groupId:this.groupId,hasCache:!!snapshot,lastSync:snapshot?.lastSync??null,warning:this.warning};
    }
    isStale(maxAge=12*3600000,iso=this.today()) {const s=this.getStatus(iso);return !s.hasCache||this.now()-s.lastSync>=maxAge;}
    getDay(iso=this.today()) {
      date(iso);return clone((this.snapshots[monday(iso)]?.lessons||[]).filter(l=>l.date===iso));
    }
    getWeek(iso=this.today()) {
      const start=+date(monday(iso));
      return Array.from({length:7},(_,i)=>{const day=new Date(start+i*86400000).toISOString().slice(0,10);return {date:day,academicWeek:this.weekFor(day),lessons:this.getDay(day)};});
    }
    async request(fields,signal) {
      return Client.request(this.endpoint,fields,{fetch:this.fetch,signal});
    }
    static async request(endpoint,fields,{fetch:fetchImpl=root.fetch.bind(root),signal}={}) {
      // GitHub Pages has no POST API. Read pre-fetched official HTML snapshots.
      if (new URL(endpoint,root.location?.href || 'https://example.invalid').pathname.endsWith('/data/schedule/')) {
        const id=Number(fields.group_id), week=Number(fields.week);
        let filename;
        if(fields.funct==='filter_group')filename='groups.html';
        else if(Number.isSafeInteger(id)&&id>0&&fields.funct==='group_name')filename=`groups/${id}.html`;
        else if(Number.isSafeInteger(id)&&id>0&&Number.isInteger(week)&&week>=1&&week<=60&&fields.funct==='group')filename=`weeks/${id}/${week}.html`;
        else throw new Error('Некорректные параметры расписания');
        const response=await fetchImpl(new URL(filename,endpoint).href,{method:'GET',signal:signal||AbortSignal.timeout(30000),cache:'no-cache'});
        if(response.status===404)throw new Error('Расписание этой группы или недели ещё не опубликовано. GitHub Actions загружает группы по очереди; попробуйте позже.');
        if(!response.ok)throw new Error(`Ошибка загрузки расписания: HTTP ${response.status}`);
        return response.text();
      }
      const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Accept:'text/html'},body:new URLSearchParams(fields).toString(),signal:signal||AbortSignal.timeout(30000),cache:'no-store'});
      if(!response.ok) {
        let message = response.status === 404 || response.status === 501
          ? 'Локальный сервер не поддерживает загрузку расписания. Запустите serve.py из нового архива.'
          : `Ошибка загрузки: HTTP ${response.status}`;
        try { const detail = await response.json(); if (typeof detail.error === 'string') message = detail.error; } catch (_) {}
        throw new Error(message);
      }
      return response.text();
    }
    getSlots(iso=this.today()) { return clone(this.snapshots[monday(iso)]?.slots||[]); }
    sync({date:iso=this.today(),signal,force=false}={}) {
      date(iso);
      // Serialize requests; different weeks are queued, never coalesced into the wrong response.
      const next=(this.pending||Promise.resolve()).catch(()=>{}).then(()=>!force&&this.sessionWeeks.has(monday(iso)) ? {updated:false,...this.getStatus(iso)} : this._sync(iso,signal));
      this.pending=next;
      next.finally(()=>{if(this.pending===next)this.pending=null;}).catch(()=>{});
      return next;
    }
    async _sync(iso,signal) {
      const controller=new AbortController();const abort=()=>controller.abort(signal.reason);
      if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>controller.abort(new Error('Источник не ответил вовремя')),30000);
      try {
        let weeks=this.weeks, calendarAt=this.calendarAt;
        let academicWeek=weeks.find(w=>w.start<=iso&&iso<=w.end);
        // The site's calendar is loaded at group selection and reused for week navigation.
        // Refresh it daily or when the requested date is outside the cached year.
        if(!academicWeek || !this.calendarLoaded) {
          const hint=this.weekFor(iso)||this.bootstrapWeek;
          const choices=root.UustOfficialParser.parseChoices(await this.request({group_id:this.groupId,week:hint,funct:'group_name'},controller.signal));
          if(choices.group?.id!==this.groupId)throw new Error('Источник вернул другую группу');
          weeks=choices.weeks;calendarAt=this.now();this.calendarLoaded=true;this.weeks=weeks;this.calendarAt=calendarAt;
          academicWeek=weeks.find(w=>w.start<=iso&&iso<=w.end);
        }
        if(!academicWeek)throw new Error('Дата находится вне календаря учебного года источника');
        const parsed=root.UustOfficialParser.parseSchedule(await this.request({group_id:this.groupId,week:academicWeek.number,funct:'group',show_temp:0},controller.signal),this.groupId);
        if(controller.signal.aborted)throw controller.signal.reason;
        if(parsed.dates[0]!==academicWeek.start)throw new Error('Источник вернул другую неделю');
        const nextSnapshots={...this.snapshots,[monday(iso)]:{lessons:parsed.lessons,slots:parsed.slots,lastSync:this.now()}};
        this.warning=null;let persisted=false;
        try {
          if(!this.storage)throw new Error('Нет хранилища');
          this.storage.setItem(this.key,JSON.stringify({version:1,groupId:this.groupId,weeks,calendarAt,snapshots:nextSnapshots}));persisted=true;
        }catch(_){this.warning='Расписание загружено, но не сохранено на устройстве';}
        this.weeks=weeks;this.calendarAt=calendarAt;this.snapshots=nextSnapshots;this.sessionWeeks.add(monday(iso));
        return {updated:true,persisted,...this.getStatus(iso)};
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
    }
  }
  root.UustOfficialClient=Client;
})(globalThis);
