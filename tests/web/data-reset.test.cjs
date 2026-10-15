const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../../docs/js', name), 'utf8');

test('lesson types use stable classes; other and missing types are green', () => {
  const context = vm.createContext({});
  vm.runInContext(source('render.js'), context);
  for (const [type, expected] of [['Лекция','lesson-lecture'],[' лек. ','lesson-lecture'],['Практическое занятие','lesson-practice'],['Практика','lesson-practice'],['Лабораторная работа','lesson-lab'],['Лаб.','lesson-lab'],[null,'lesson-other'],['Экзамен','lesson-other'],['Другой тип','lesson-other'],['','lesson-other']]) {
    assert.equal(context.lessonTypeClass(type), expected);
  }
});

function setup(confirm, fail = false) {
  let cleared = false, reloaded = false;
  const storage = { lecture_app_cache_v4:'old', lecture_app_appearance_v1:'prefs', 'lectures.official.v1:test:1':'cache', unrelated:'keep' };
  Object.defineProperty(storage, 'removeItem', { value(key) { delete this[key]; } });
  const client = {storage};
  const context = vm.createContext({
    window:{confirm:()=>confirm, location:{reload(){reloaded=true;}}},
    document:{body:{inert:false}},
    localStorage:storage, console:{error(){}},
    resettingAppData:false, scheduleClients:new Map([[1,client]]),
    saveQueue:Promise.resolve(), APPEARANCE_KEY:'lecture_app_appearance_v1', LS_LEGACY:'lecture_app_cache_v4',
    materialState:{mode:'editor'}, db:{lectures:[1]}, normalizeDB:()=>({lectures:[],drafts:{}}),
    showToast(){},
    async openIDB() {
      if (fail) throw new Error('storage unavailable');
      return {close(){},transaction(){
        const tx={objectStore:()=>({clear(){cleared=true;}})};
        setTimeout(()=>tx.oncomplete(),0);
        return tx;
      }};
    }
  });
  vm.runInContext(source('settings.js').split('async function clearAllAppData()')[1].replace(/^/, 'async function clearAllAppData()'), context);
  return {context,storage,client,get cleared(){return cleared;},get reloaded(){return reloaded;}};
}
test('cancel keeps all data', async () => {
  const s=setup(false); await s.context.clearAllAppData();
  assert.equal(s.cleared,false); assert.equal(s.reloaded,false); assert.equal(s.context.document.body.inert,false);
  assert.equal(s.storage.lecture_app_cache_v4,'old');
});
test('reset waits for pending saves and removes only app data', async () => {
  const s=setup(true);
  let finish;
  s.context.saveQueue=new Promise(resolve=>{finish=resolve;});
  const reset=s.context.clearAllAppData();
  assert.equal(s.cleared,false); assert.equal(s.client.storage,null);
  finish(); await reset;
  assert.equal(s.cleared,true); assert.equal(s.reloaded,true);
  assert.deepEqual(Object.keys(s.storage),['unrelated']);
  assert.equal(s.context.materialState,null);
});
test('storage failure unlocks interface and allows retry', async () => {
  const s=setup(true,true); await s.context.clearAllAppData();
  assert.equal(s.reloaded,false); assert.equal(s.context.resettingAppData,false);
  assert.equal(s.context.document.body.inert,false); assert.equal(s.client.storage,s.storage);
});
