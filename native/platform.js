import {Capacitor,CapacitorHttp} from '@capacitor/core';
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {App} from '@capacitor/app';
import {FileViewer} from '@capacitor/file-viewer';
const SOURCE='https://isu.uust.ru/module/schedule/schedule_2024_script.php';
const native=Capacitor.isNativePlatform();
const desktop=window.LecturesDesktop;
const webFetch=window.fetch.bind(window);
function abortable(task,signal){
 if(!signal)return task;
 if(signal.aborted)return Promise.reject(signal.reason||new DOMException('Отменено','AbortError'));
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason||new DOMException('Отменено','AbortError'));
  signal.addEventListener('abort',abort,{once:true});
  task.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
if(native||desktop){
 window.LECTURES_SCHEDULE_CONFIG={endpoint:SOURCE,bootstrapWeek:7,sourcePage:'https://uust.ru/schedule/'};
 window.fetch=async(url,options={})=>{
  if(String(url)!==SOURCE)return webFetch(url,options);
  if(options.method!=='POST')throw new Error('Источник расписания принимает POST');
  const body=String(options.body||'');
  const request=desktop?desktop.schedule(body):CapacitorHttp.request({url:SOURCE,method:'POST',data:body,headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':'https://isu.uust.ru/class_schedule/','Origin':'https://isu.uust.ru'},responseType:'text',connectTimeout:15000,readTimeout:25000,disableRedirects:true}).then(r=>({status:r.status,text:typeof r.data==='string'?r.data:JSON.stringify(r.data)}));
  const r=await abortable(request,options.signal);
  return {ok:r.status>=200&&r.status<300,status:r.status,text:async()=>r.text,json:async()=>JSON.parse(r.text)};
 };
 window.LecturesPlatform={
  isAndroid:native,
  async saveBackup(name,text){
   if(desktop)return desktop.saveBackup(name,text);
   const result=await Filesystem.writeFile({path:name,data:text,directory:Directory.Cache,encoding:Encoding.UTF8});
   await Share.share({title:'Резервная копия УУНиТ Дневник',files:[result.uri],dialogTitle:'Сохранить или отправить резервную копию'});
   return {saved:true,shared:true};
  }
 };
}
if(native){
 document.documentElement.dataset.platform='android';
 App.addListener('backButton',()=>{
  const modal=document.querySelector('#lectureModal:not(.hidden),#settingsModal:not(.hidden)');
  if(modal){modal.querySelector('#closeModal,#closeSettings')?.click();return;}
  App.minimizeApp();
 });
 // Android WebView does not download data/blob URLs itself: export via native share.
 document.addEventListener('click',async event=>{
  const link=event.target.closest('a[download],a[data-native-open]');if(!link)return;
  event.preventDefault();
  try{
   const blob=await webFetch(link.href).then(r=>r.blob());
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
   const name=(link.download||link.dataset.nativeOpen||'attachment').replace(/[^\p{L}\p{N}._-]/gu,'_');
   const file=await Filesystem.writeFile({path:name,data,directory:Directory.Cache});
   if(link.dataset.nativeOpen)await FileViewer.openDocumentFromLocalPath({path:decodeURIComponent(file.uri.replace(/^file:\/\//,''))});
   else await Share.share({files:[file.uri],dialogTitle:'Сохранить или открыть файл'});
  }catch(error){alert('Не удалось сохранить файл: '+error.message);}
 });
}
