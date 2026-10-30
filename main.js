/* main.js — Nexus Vault: das Mockup-Fenster über dem echten Vault.
 *
 * Aufgaben: Fenster → .lauf/index.html (Bastians HTML mit echten Daten),
 * Watcher auf dem Vault (Neuaufbau mit Debounce), IPC für Lesen/Speichern,
 * Editor-Fenster (rohes Markdown, Strg+S), Autostart-Helfer.
 */
'use strict';
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { bauIndex } = require('./core/index-bau');
const { autoUpdater } = require('electron-updater');

/* Vault-Ort: Umgebungsvariable oder der Ordner „Obsidian" im Benutzerverzeichnis. */
const VAULT = process.env.NEXUS_VAULT_VAULT || path.join(os.homedir(), 'Obsidian');
const RUNDIR = path.join(app.getPath('userData'), 'lauf');
const LAUF = path.join(RUNDIR, 'index.html');
const ERNEUERUNG = 3000; // Debounce: Claude schreibt Blöcke über Sekunden
const WACHSEINHEIT = 15000; // Sicherheitsnetz: Dateizahl + neueste Änderung

let haupt = null;
let editor = null; // { fenster, pfad } — genau eine bearbeitete Notiz
let wachstimer = null;

/* ---------------------------------------------------------- Aufbau + Watch */

function neuBauen(ursache) {
  try { fs.mkdirSync(RUNDIR, { recursive: true }); } catch (e) {}
  try {
    bauIndex(VAULT, RUNDIR);
  } catch (e) {
    /* Kein dialog.showErrorBox — modal und blockiert den Main-Prozess, bis
       ihn jemand anklickt (Befund 30.10.: Port tot bei CPU-Last). */
    try { fs.mkdirSync(RUNDIR, { recursive: true }); } catch (e2) {}
    fs.appendFileSync(path.join(RUNDIR, 'fehler.log'),
      new Date().toISOString() + ' ' + (ursache || '') + ': ' + (e && e.message) + '\n');
  }
  if (haupt && !haupt.isDestroyed()) {
    /* Reload auch im Fehlerfall: die alte Datei bleibt lesbar, nichts hängt. */
    haupt.loadFile(LAUF);
  }
}

function wacheVault() {
  if (wachstimer) clearTimeout(wachstimer);
  wachstimer = setTimeout(() => neuBauen('vault'), ERNEUERUNG);
}

/* Sicherheitsnetz für Fälle, die fs.watch verpasst (Befund 30.10.: das Löschen
   einer .md löste kein Watch-Ereignis aus): ein Fingerabdruck aus Dateizahl
   + neuester Änderungszeit wird alle 15 s nachgemessen — ändert er sich,
   wird neu gebaut. readdir über ~130 Dateien kostet nichts. */
function silhouette() {
  const dateien = fs.readdirSync(VAULT, { recursive: true })
    .filter(n => n.toLowerCase().endsWith('.md'));
  let frischeste = 0;
  for (const d of dateien) {
    let t = 0;
    try { t = fs.statSync(path.join(VAULT, d)).mtimeMs; } catch (e) { t = 0; }
    if (t > frischeste) frischeste = t;
  }
  return dateien.length + '|' + frischeste;
}

let letzteSilhouette = '';
setInterval(() => {
  try {
    const s = silhouette();
    if (s !== letzteSilhouette) {
      letzteSilhouette = s;
      wacheVault();
    }
  } catch (e) { /* Nächste Runde */
  }
}, WACHSEINHEIT);

/* -------------------------------------------------------------- Notizen-I/O */

function inVault(pfad) {
  /* Nur relative Pfade unter dem Vault; kein .. nach draußen. */
  if (typeof pfad !== 'string' || !pfad.length) return null;
  const normal = path.normalize(pfad).replace(/^(\.\.[/\\])+/, '');
  const voll = path.resolve(VAULT, normal);
  if (!voll.toLowerCase().startsWith(VAULT.toLowerCase() + path.sep)) return null;
  return voll;
}

/** Zeilenenden + Kodierung der Datei bewahren; UTF-8 ohne BOM schreiben. */
function schreibeNotiz(pfad, text) {
  const voll = inVault(pfad);
  if (!voll) throw new Error('Pfad liegt nicht im Vault: ' + pfad);
  try { fs.mkdirSync(path.dirname(voll), { recursive: true }); } catch (e) {}
  let alt = '';
  try {
    const puff = fs.readFileSync(voll);
    // BOM-Falle: Obsidian schreibt ohne BOM — also bleibt er auch weg.
    alt = puff.toString('utf8').replace(/^\uFEFF/, '');
  } catch (e) { /* neu angelegte Notiz */ }
  const crlf = /\r\n/.test(alt);
  const neu = crlf ? text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n') : text.replace(/\r\n/g, '\n');
  if (neu === alt) return { geaendert: false };
  fs.writeFileSync(voll, neu, 'utf8');
  return { geaendert: true };
}

/* ----------------------------------------------------------------------- UI */

function editorOeffnen(pfad) {
  const voll = inVault(pfad);
  if (!voll) return;
  if (editor && !editor.fenster.isDestroyed()) {
    editor.pfad = path.relative(VAULT, voll).split('\\').join('/');
    editor.fenster.loadFile(path.join(__dirname, 'editor.html'));
    editor.fenster.focus();
    return;
  }
  editor = { pfad: path.relative(VAULT, voll).split('\\').join('/'), fenster: new BrowserWindow({
    width: 860,
    height: 720,
    title: 'Nexus Vault v' + app.getVersion() + ' — Editor',
    backgroundColor: '#0a0d14',
    webPreferences: { preload: path.join(__dirname, 'editor-preload.js') },
  }) };
  editor.fenster.loadFile(path.join(__dirname, 'editor.html'));
}

ipcMain.on('editor-oeffnen-aktuell', () => {
  haupt?.webContents.executeJavaScript('typeof activeNoteId!=="undefined"?activeNoteId:null')
    .then(id => (id ? editorOeffnen(id) : null))
    .catch(() => {});
});

const menuVorlage = [
  {
    label: 'Notiz',
    submenu: [
      { label: 'Aktuelle Notiz bearbeiten', click: () => {
        haupt?.webContents.executeJavaScript('typeof activeNoteId!=="undefined"?activeNoteId:null')
          .then(id => (id ? editorOeffnen(id) : null))
          .catch(() => {});
      } },
      { label: 'Neu von innen', accelerator: 'Ctrl+R', click: () => neuBauen('manuell') },
      { type: 'separator' },
      { label: 'Beenden', accelerator: 'Ctrl+Q', click: () => app.quit() },
    ],
  },
];

app.whenReady().then(() => {
  neuBauen('start');
  haupt = new BrowserWindow({
    width: 1600,
    height: 900,
    title: 'Nexus Vault v' + app.getVersion(),
    backgroundColor: '#0a0d14',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  haupt.loadFile(LAUF);
  if (app.isPackaged) {
    try { autoUpdater.checkForUpdatesAndNotify(); } catch (e) { console.error(e); }
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuVorlage));

  let wache = null;
  try {
    wache = fs.watch(VAULT, { recursive: true }, (ereignis, dateiname) => {
      if (!dateiname || !dateiname.toLowerCase().endsWith('.md')) return;
      wacheVault();
    });
  } catch (e) {
    // Vault fehlt/ist gesperrt → das 15-s-Silhouetten-Netz übernimmt, sobald da
    const log = path.join(RUNDIR, 'fehler.log');
    fs.appendFileSync(log, new Date().toISOString() + ' watch: ' + e.message + '\n');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) app.quit();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

/* ----------------------------------------------------------------------- IPC */

ipcMain.handle('notiz-lesen', (ev, pfad) => {
  const voll = inVault(pfad);
  if (!voll) return { fehler: 'Pfad liegt nicht im Vault' };
  let text = '';
  try {
    text = fs.readFileSync(voll, 'utf8').replace(/^\uFEFF/, '');
  } catch (e) {
    return { fehler: e.message };
  }
  return { text };
});

ipcMain.handle('notiz-speichern', (ev, pfad, text) => {
  try {
    if (typeof text !== 'string') return { fehler: 'Text muss eine Zeichenkette sein' };
    return schreibeNotiz(pfad, text);
  } catch (e) {
    return { fehler: e.message };
  }
});

/* Der Editor lädt neu und braucht Pfad + Inhalt seines Auftrags. */
ipcMain.handle('editor-init', () => {
  if (!editor) return { fehler: 'kein Editor' };
  const pfad = editor.pfad;
  const voll = inVault(pfad);
  let text = '';
  try {
    text = fs.readFileSync(voll, 'utf8').replace(/^\uFEFF/, '');
  } catch (e) {
    return { pfad, fehler: e.message };
  }
  return { pfad, text };
});

/* -------------------------------------------------------------- Autostart */

/* Registry-Eintrag setzt ein Skript außerhalb (start-cortex.vbs) — die App
 * macht ihn nicht selbst, Bastian hat ihn über die Einrichtung bekommen. */