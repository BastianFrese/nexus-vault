const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cortex', {
  lesen: (pfad) => ipcRenderer.invoke('notiz-lesen', pfad),
  speichern: (pfad, text) => ipcRenderer.invoke('notiz-speichern', pfad, text),
});