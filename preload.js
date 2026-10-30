const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cortex', {
  editorOeffnen: () => ipcRenderer.send('editor-oeffnen-aktuell'),
  lesen: (pfad) => ipcRenderer.invoke('notiz-lesen', pfad),
  speichern: (pfad, text) => ipcRenderer.invoke('notiz-speichern', pfad, text),
});

/* Strg+E im Fenster öffnet die aktive Notiz im Roheditor. */
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    ipcRenderer.send('editor-oeffnen-aktuell');
  }
});