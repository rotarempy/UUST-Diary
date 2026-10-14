const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('LecturesDesktop',{
 schedule:body=>ipcRenderer.invoke('lectures:schedule',body),
 saveBackup:(name,text)=>ipcRenderer.invoke('lectures:backup',name,text)
});
