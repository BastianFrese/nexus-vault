const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cortex', {
  init: () => ipcRenderer.invoke('editor-init'),
  speichern: (pfad, text) => ipcRenderer.invoke('notiz-speichern', pfad, text),
});