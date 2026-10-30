/* index-bau.js — baut .lauf/index.html: Bastians Mockup unverändert,
 * nur __VAULT_DATA__ + die Startnotiz-Zeile ersetzt (derselbe Mechanismus
 * wie im Obsidian-Plugin cyber-vault-mockup — genau vier Stellen).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { lesevault } = require('./vault-daten');

const ASSETS = path.join(__dirname, '..', 'assets', 'mockup.html');
const ZIEL_ORDNER = path.join(__dirname, '..', '.lauf');
const ZIEL = path.join(ZIEL_ORDNER, 'index.html');

/** Der Platzhalter im HTML-String: < im JSON maskieren, damit kein
 *  „</script>" im Notiztext das Inline-Skript beenden kann. */
function datenInHtml(html, daten) {
  const json = JSON.stringify(daten).replace(/</g, '\\u003c');
  if (!html.includes('__VAULT_DATA__')) {
    throw new Error('Platzhalter __VAULT_DATA__ fehlt — Vorlage geändert?');
  }
  /* Ersetzer-FUNKTION statt String: ein String-Ersatz expandiert $-Muster
     ($', $&, …) — ein `$'` in einer echten Notiz hat die Vorlage sonst in die
     Ausgabe hineinkopiert und das Skript zerstört (Befund 30.10.). */
  html = html.replace('__VAULT_DATA__', () => json);
  return html.replace(
    'let activeNoteId = (vaultData.notes[0] || { id: null }).id;',
    () => 'let activeNoteId = ' + JSON.stringify(daten.aktiv) + ';',
  );
}

function bauIndex(wurzel, zielOrdner) {
  const ordner = zielOrdner || ZIEL_ORDNER;
  const ziel = path.join(ordner, 'index.html');
  const vorlage = fs.readFileSync(ASSETS, 'utf8');
  const { daten, zaehler } = lesevault(wurzel);
  const html = datenInHtml(vorlage, daten);
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(ziel, html, 'utf8');
  return { zaehler, ziel };
}

function bauStartnotizHtml(wurzel, pfad) {
  /* Für die Editor-Vorschau nicht nötig — nur benutzt, um die Daten der
   * AKTUELLEN Notiz zu aktualisieren, ohne das ganze Fenster neu zu bauen. */
  const vorlage = fs.readFileSync(ASSETS, 'utf8');
  const { daten } = lesevault(wurzel);
  daten.aktiv = pfad;
  return datenInHtml(vorlage, daten);
}

module.exports = { bauIndex, datenInHtml, bauStartnotizHtml };