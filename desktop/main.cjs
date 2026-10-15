const {app,BrowserWindow,protocol,net,ipcMain,shell,dialog}=require('electron');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs/promises');
const {SOURCE,validateForm}=require('./schedule.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'lectures',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const ORIGIN='lectures://app';
const {createLan}=require('./lan.cjs');
const lan=createLan();
let lanLifecycle=Promise.resolve();
let win;
function trusted(event){if(!event.senderFrame||!event.senderFrame.url.startsWith(ORIGIN+'/')||event.senderFrame!==event.sender.mainFrame)throw new Error('Недопустимый вызов');}
function external(url){try{const u=new URL(url);if(u.protocol==='https:')shell.openExternal(u.href);}catch{}}
async function createWindow(){
 win=new BrowserWindow({width:1440,height:950,minWidth:800,minHeight:600,title:'УУНиТ Дневник',backgroundColor:'#f5f5fc',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.setMenuBarVisibility(false);
 win.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(ORIGIN+'/')){event.preventDefault();external(url);}});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 await win.loadURL(ORIGIN+'/index.html');
}
app.whenReady().then(async()=>{
 const webRoot=path.resolve(__dirname,'../www');
 protocol.handle('lectures',async request=>{
  const u=new URL(request.url);
  if(u.host!=='app')return new Response('Not found',{status:404});
  let decoded;try{decoded=decodeURIComponent(u.pathname);}catch{return new Response('Bad path',{status:400});}
  const file=path.resolve(webRoot,'.'+decoded);
  if(!file.startsWith(webRoot+path.sep))return new Response('Forbidden',{status:403});
  try{return await net.fetch(pathToFileURL(file).href);}catch{return new Response('Not found',{status:404});}
 });
 ipcMain.handle('lectures:schedule',async(event,body)=>{
  trusted(event);body=validateForm(body);
  const response=await net.fetch(SOURCE,{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':'https://isu.uust.ru/class_schedule/','Origin':'https://isu.uust.ru'},signal:AbortSignal.timeout(25000),redirect:'error'});
  const text=await response.text();if(Buffer.byteLength(text)>8*1024*1024)throw new Error('Слишком большой ответ источника');
  return {status:response.status,text};
 });
 ipcMain.handle('lectures:backup',async(event,name,text)=>{
  trusted(event);
  if(typeof name!=='string'||!/^(?:lectures|uust-diary)-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)||typeof text!=='string'||Buffer.byteLength(text)>200*1024*1024)throw new Error('Неверная резервная копия');
  const result=await dialog.showSaveDialog(win,{defaultPath:name,filters:[{name:'Резервная копия УУНиТ Дневник',extensions:['json']}]});
  if(result.canceled)return {saved:false};await fs.writeFile(result.filePath,text,'utf8');return {saved:true};
 });
 ipcMain.handle('lectures:lan',async(event,action,...args)=>{
  trusted(event);
  if(action==='start'||action==='stop'){
   const next=lanLifecycle.catch(()=>{}).then(()=>lan[action](args[0]));lanLifecycle=next;return next;
  }
  if(['list','pending','decide','send'].includes(action))return lan[action](args[0]);
  throw new Error('Неизвестная операция');
 });
 ipcMain.handle('lectures:snapshot',async(event,text)=>{
  trusted(event);if(typeof text!=='string'||Buffer.byteLength(text)>200*1024*1024)throw new Error('Слишком большой файл');
  const result=await dialog.showOpenDialog(win,{title:'Выберите папку docs/data/schedule проекта',properties:['openDirectory','createDirectory']});
  if(result.canceled)return {saved:false};
  await fs.writeFile(path.join(result.filePaths[0],'snapshot.json'),text,'utf8');return {saved:true};
 });
 await createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
