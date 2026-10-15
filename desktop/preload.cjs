const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('LecturesDesktop',{
 lan:(action,...args)=>ipcRenderer.invoke('lectures:lan',action,...args),
 saveSnapshot:text=>ipcRenderer.invoke('lectures:snapshot',text),
 schedule:body=>ipcRenderer.invoke('lectures:schedule',body),
 saveBackup:(name,text)=>ipcRenderer.invoke('lectures:backup',name,text)
});
