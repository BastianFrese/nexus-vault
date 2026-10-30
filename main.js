/* main.js — Nexus Vault: das Mockup-Fenster über dem echten Vault.
 *
 * Aufgaben: Fenster → .lauf/index.html (Bastians HTML mit echten Daten),
 * Watcher auf dem Vault (Neuaufbau mit Debounce), IPC für Lesen/Speichern,
 * Editor-Fenster (rohes Markdown, Strg+S), Autostart-Helfer.
 */
'use strict';
const { app, BrowserWindow, ipcMain, Menu, clipboard } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { bauIndex } = require('./core/index-bau');
const { lesevault, pruefeVault } = require('./core/vault-daten');
const { autoUpdater } = require('electron-updater');
const http = require('http');

/* Vault-Ort: Umgebungsvariable oder der Ordner „Obsidian" im Benutzerverzeichnis. */
const VAULT = process.env.NEXUS_VAULT_VAULT || path.join(os.homedir(), 'Obsidian');
const RUNDIR = path.join(app.getPath('userData'), 'lauf');
const LAUF = path.join(RUNDIR, 'index.html');
const ERNEUERUNG = 3000; // Debounce: Claude schreibt Blöcke über Sekunden
const API_PORT = Number(process.env.NEXUS_VAULT_API_PORT || 8787);
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
      { label: 'Claude: Vault-Kontext kopieren', click: () => {
        try {
          const { daten } = lesevault(VAULT);
          const lines = ['# Nexus Vault — Kontext für Claude Code', '',
            'Vault: ' + VAULT, 'Notizen: ' + (daten.notes || []).length,
            'Verweise: ' + (daten.edges || []).length, '', '## Notizen', ''];
          (daten.notes || []).forEach(n => lines.push('- ' + n.id + ' — ' + n.title));
          clipboard.writeText(lines.join('\n'));
        } catch (e) { console.error(e); }
      } },
      { label: 'Claude: API-Adresse (localhost:' + API_PORT + ')', enabled: false },
      { type: 'separator' },
      { label: 'Beenden', accelerator: 'Ctrl+Q', click: () => app.quit() },
    ],
  },
];


/* ---------------------------------------------------------- Claude-API (localhost) */
function startClaudeApi() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1:' + API_PORT);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
    if (req.method !== 'GET' && !(req.url || '').startsWith('/mcp')) {
      res.statusCode = 405;
      res.end(JSON.stringify({ fehler: 'Nur GET unterstützt' }));
      return;
    }
    try {
      if (url.pathname === '/mcp') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          let rpc = {};
          try { rpc = JSON.parse(body || '{}'); } catch (e) { rpc = {}; }
          const reply = (result, error) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id ?? null, ...(error ? { error } : { result }) }));
          };
          const { method, params } = rpc;
          if (method === 'initialize') {
            reply({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'Nexus Vault', version: app.getVersion() } });
            return;
          }
          if (method === 'tools/list') {
            reply({ tools: [
              { name: 'list_notes', description: 'Listet Vault-Notizen (id, title, category, tags).', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
              { name: 'read_note', description: 'Liest den Rohinhalt einer Notiz.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
              { name: 'search_notes', description: 'Volltextsuche im Vault.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } } } },
              { name: 'vault_checks', description: 'Prüft Orphans, kaputte Links, fehlende Frontmatter/Tags.', inputSchema: { type: 'object', properties: {} } },
              { name: 'graph_summary', description: 'Knoten- und Kantenanzahl plus Top-Verweise.', inputSchema: { type: 'object', properties: {} } },
            ] });
            return;
          }
          if (method === 'tools/call') {
            const name = params && params.name;
            const args = (params && params.arguments) || {};
            let out;
            if (name === 'list_notes') {
              const { daten } = lesevault(VAULT);
              out = (daten.notes || []).slice(0, Number(args.limit) || 200).map(n => ({ id: n.id, title: n.title, category: n.category, tags: n.tags }));
            } else if (name === 'read_note') {
              const voll = inVault(args.path || '');
              if (!voll) throw new Error('Ungültiger Pfad');
              out = { path: args.path, content: fs.readFileSync(voll, 'utf8').replace(/^﻿/, '') };
            } else if (name === 'search_notes') {
              const q = (args.query || '').toLowerCase();
              const { daten } = lesevault(VAULT);
              out = (daten.notes || []).filter(n => (n.title + ' ' + (n.content || '') + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(q))
                .slice(0, Number(args.limit) || 20)
                .map(n => ({ id: n.id, title: n.title, snippet: (n.content || '').slice(0, 240) }));
            } else if (name === 'vault_checks') {
              out = pruefeVault(VAULT);
            } else if (name === 'graph_summary') {
              const { daten } = lesevault(VAULT);
              out = { notes: (daten.notes || []).length, edges: (daten.edges || []).length };
            } else {
              reply(null, { code: -32601, message: 'Unbekanntes Tool: ' + name });
              return;
            }
            reply({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
            return;
          }
          reply(null, { code: -32601, message: 'Unbekannte Methode: ' + method });
        });
        return; // response handled in end handler
      }
      if (url.pathname === '/health') {
        res.end(JSON.stringify({ ok: true, version: app.getVersion(), vault: VAULT, port: API_PORT }));
        return;
      }
      if (url.pathname === '/api/notes') {
        const { daten } = lesevault(VAULT);
        const notes = (daten.notes || []).map(n => ({
          id: n.id, title: n.title, category: n.category, tags: n.tags, path: n.path,
        }));
        res.end(JSON.stringify({ count: notes.length, notes }));
        return;
      }
      if (url.pathname === '/api/note') {
        const pfad = url.searchParams.get('path') || '';
        const voll = inVault(pfad);
        if (!voll) {
          res.statusCode = 400;
          res.end(JSON.stringify({ fehler: 'Ungültiger Pfad' }));
          return;
        }
        let text = '';
        try { text = fs.readFileSync(voll, 'utf8').replace(/^﻿/, ''); } catch (e) {
          res.statusCode = 404;
          res.end(JSON.stringify({ fehler: e.message }));
          return;
        }
        res.end(JSON.stringify({ id: pfad, path: pfad, content: text, ok: true }));
        return;
      }
      if (url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') || '').toLowerCase().trim();
        const { daten } = lesevault(VAULT);
        const hits = (daten.notes || [])
          .map(n => {
            const haystack = (n.title + ' ' + (n.content || '') + ' ' + (n.tags || []).join(' ')).toLowerCase();
            if (!q || !haystack.includes(q)) return null;
            const idx = haystack.indexOf(q);
            const start = Math.max(0, idx - 80);
            return { id: n.id, title: n.title, category: n.category, snippet: (n.content || '').slice(start, start + 180) };
          })
          .filter(Boolean)
          .slice(0, 30);
        res.end(JSON.stringify({ count: hits.length, hits }));
        return;
      }
      if (url.pathname === '/api/checks') {
        res.end(JSON.stringify(pruefeVault(VAULT)));
        return;
      }
      if (url.pathname === '/api/graph') {
        const { daten } = lesevault(VAULT);
        res.end(JSON.stringify({ notes: (daten.notes || []).map(n => ({ id: n.id, title: n.title })),
          edges: daten.edges || [] }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ fehler: 'Nicht gefunden', routen: ['/health','/api/notes','/api/note?path=','/api/search?q=','/api/graph'] }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ fehler: e.message }));
    }
  });
  server.on('error', (e) => {
    console.error('Claude-API konnte nicht starten:', e.message);
  });
  server.listen(API_PORT, '127.0.0.1', () => {
    console.log('Claude-API läuft auf http://127.0.0.1:' + API_PORT);
  });
}

app.whenReady().then(() => {
  neuBauen('start');
  startClaudeApi();
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