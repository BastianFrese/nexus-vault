/* vault-daten.js — liest den Realvault und baut die Mockup-Datenstruktur.
 *
 * Übernommen aus dem Obsidian-Plugin `cyber-vault-mockup/main.js` (reine
 * Funktionen baueDaten / kategorie / tagsAus / ohneFrontmatter / titelAus —
 * gleicher Verweis-Code wie dort, deshalb gleiches Ergebnis).
 * Anders als im Plugin gibt es hier keine metadataCache-Auflösung: Wikilinks
 * werden selbst geparst und nach Obsidians Kurzregel aufgelöst (Basisname
 * eindeutig, sonst voller Pfad ohne .md).
 */

'use strict';
const fs = require('fs');
const path = require('path');

/** Alle .md-Dateien, Ordner, die mit „." anfangen, sind aus. */
function listeMarkdown(wurzel) {
  const ergebnis = [];
  const stapel = [wurzel];
  while (stapel.length) {
    const ordner = stapel.pop();
    let eintraege;
    try {
      eintraege = fs.readdirSync(ordner, { withFileTypes: true });
    } catch (e) {
      continue; // unlesbar = überspringen, nicht das Ganze wegwerfen
    }
    for (const e of eintraege) {
      const voll = path.join(ordner, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith('.')) continue;
        stapel.push(voll);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        ergebnis.push(voll);
      }
    }
  }
  return ergebnis;
}

/** Wikilinks [[ziel#anker|alias]] aus dem Text — Ziele als rohe Namen. */
function wikilinks(text) {
  const regex = /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  const ziele = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    const ziel = m[1].trim();
    if (ziel) ziele.push(ziel);
  }
  return ziele;
}

/** Obsidians Auflösungsregel: „Basisname" eindeutig, sonst voller Pfad ohne .md */
function aufloesen(ziel, basisMap, pfadMap) {
  const schluessel = ziel.toLowerCase().replace(/\.md$/, '');
  if (pfadMap.has(schluessel)) return pfadMap.get(schluessel);
  if (basisMap.has(schluessel)) return basisMap.get(schluessel);
  return null; // unaufgelöst — bekommt keine Kante (wie resolvedLinks)
}

/** Aus Notiztexten + Verweisen die Mockup-Datenstruktur bauen. */
function baueDaten(notizen, verweise, aktiveId) {
  const pfade = new Set(notizen.map(n => n.id));
  const kanten = [];
  const gesehen = new Set();
  Object.keys(verweise || {}).forEach(quelle => {
    verweise[quelle].forEach(ziel => {
      if (!pfade.has(quelle) || !pfade.has(ziel) || quelle === ziel) return;
      const schluessel = quelle < ziel ? quelle + '|' + ziel : ziel + '|' + quelle;
      if (gesehen.has(schluessel)) return;
      gesehen.add(schluessel);
      kanten.push({ source: quelle, target: ziel });
    });
  });
  return {
    notes: notizen,
    edges: kanten,
    aktiv: aktiveId || (notizen[0] || {}).id || null,
  };
}

/* ------------------------------------------------------ Port aus dem Plugin */

function kategorie(pfad) {
  if (pfad.indexOf('Homelab/') === 0) return 'Homelab';
  if (pfad.indexOf('Projekte/') === 0) return 'Dev';
  return 'Life';
}

function ohneFrontmatter(text) {
  // Nur echtes YAML-Frontmatter: Öffner exakt `---\n` am Dateianfang
  // (Review-Befund: `----`-Trenner und `--- foo` sind kein Frontmatter).
  if (!/^---\r?\n/.test(text)) return text;
  const ende = text.indexOf('\n---', 3);
  if (ende === -1) return text;
  const danach = text.indexOf('\n', ende + 4);
  return danach === -1 ? '' : text.slice(danach + 1);
}

function tagsAus(text) {
  const treffer = text.match(/^tags:\s*(.+)$/m);
  if (!treffer) return [];
  return treffer[1]
    .replace(/[\[\]]/g, '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => (t.charAt(0) === '#' ? t : '#' + t));
}

function titelAus(text, fallback) {
  const treffer = text.match(/^#\s+(.+)$/m);
  return treffer ? treffer[1].trim() : fallback;
}

/** Der ganze Walk: Vault- Ordner → { daten, zaehler }. Reine Funktion über den Ordner. */
function lesevault(wurzel) {
  const dateien = listeMarkdown(wurzel).slice().sort();
  const basisMap = new Map();
  const pfadMap = new Map();
  const notizen = [];
  for (const voll of dateien) {
    let text;
    try {
      text = (fs.readFileSync(voll, 'utf8') || '').replace(/^\uFEFF/, ''); // BOM-Rest
    } catch (e) {
      continue;
    }
    const pfad = path.relative(wurzel, voll).split('\\').join('/');
    const koerper = ohneFrontmatter(text);
    notizen.push({
      id: pfad,
      title: titelAus(koerper, path.basename(pfad, '.md')),
      path: pfad,
      category: kategorie(pfad),
      tags: tagsAus(text),
      content: koerper, // bleibt — der Renderer braucht den Körper
      // Verweise aus dem KÖRPER ohne Code: [[x]] in ```-Blöcken ist Doku, kein Verweis
      _links: wikilinks(koerper.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')),
    });
    const basis = path.basename(pfad, path.extname(pfad)).toLowerCase();
    if (!basisMap.has(basis)) basisMap.set(basis, pfad);
    pfadMap.set(pfad.toLowerCase().replace(/\.md$/, ''), pfad);
  }

  // Verweise: quelle → aufgelöste Ziele
  const verweise = {};
  for (const n of notizen) {
    if (!n._links || !n._links.length) continue;
    const geloest = [];
    for (const ziel of n._links) {
      const gefunden = aufloesen(ziel, basisMap, pfadMap);
      if (gefunden) geloest.push(gefunden);
    }
    if (geloest.length) verweise[n.id] = geloest;
  }
  notizen.forEach(n => { delete n._links; }); // nicht in die Mockup-Daten

  const daten = baueDaten(notizen, verweise, null);
  return {
    daten: daten,
    zaehler: { notes: notizen.length, links: daten.edges.length },
  };
}


/** Vault-Gesundheitsprüfung für Claude Code: Orphans, broken Links, Frontmatter, ... */
function pruefeVault(wurzel) {
  const dateien = listeMarkdown(wurzel).slice().sort();
  const basisMap = new Map();
  const pfadMap = new Map();
  const meta = [];
  const eingehend = new Map();
  const basen = new Map();
  for (const voll of dateien) {
    let text = '';
    try { text = (fs.readFileSync(voll, 'utf8') || '').replace(/^﻿/, ''); } catch (e) { continue; }
    const pfad = path.relative(wurzel, voll).split('\\').join('/');
    const basis = path.basename(pfad, path.extname(pfad)).toLowerCase();
    basen.set(basis, (basen.get(basis) || 0) + 1);
    const hatFrontmatter = new RegExp('^---\\r?\\n').test(text);
    const links = wikilinks((ohneFrontmatter(text)).replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' '));
    const on = tagsAus(text);
    const resolves = [];
    const broken = [];
    // basis/pfad maps lazy: erst alles eintragen, dann auflösen
    meta.push({ pfad, basis, hatFrontmatter, links, on });
  }
  for (const m of meta) { if (!basisMap.has(m.basis)) basisMap.set(m.basis, m.pfad); }
  for (const m of meta) { pfadMap.set(m.pfad.toLowerCase().replace(/\.md$/, ''), m.pfad); }
  for (const m of meta) {
    const geloest = [];
    const kaputt = [];
    for (const z of m.links) {
      const gefunden = aufloesen(z, basisMap, pfadMap);
      if (gefunden) { geloest.push(gefunden); eingehend.set(gefunden, (eingehend.get(gefunden) || 0) + 1); }
      else kaputt.push(z);
    }
    m.resolves = geloest;
    m.broken = kaputt;
  }
  // fix resolves push above (ensure arrays)
  meta.forEach(m => { if (!Array.isArray(m.resolves)) m.resolves = []; if (!Array.isArray(m.broken)) m.broken = []; });
  const orphans = meta.filter(m => !eingehend.has(m.pfad)).map(m => m.pfad);
  const missingFrontmatter = meta.filter(m => !m.hatFrontmatter).map(m => m.pfad);
  const missingTags = meta.filter(m => !m.on.length).map(m => m.pfad);
  const brokenAll = meta.flatMap(m => m.broken.map(b => ({ note: m.pfad, link: b })));
  const duplicateBasenames = [...basen.entries()].filter(([, c]) => c > 1).map(([b]) => b);
  return {
    stats: { notes: dateien.length, links: meta.reduce((s, m) => s + m.links.length, 0), orphans: orphans.length, broken: brokenAll.length },
    orphans: orphans.slice(0, 30),
    brokenLinks: brokenAll.slice(0, 50),
    missingFrontmatter: missingFrontmatter.slice(0, 30),
    missingTags: missingTags.slice(0, 30),
    duplicateBasenames,
  };
}

module.exports = {
  listeMarkdown,
  wikilinks,
  aufloesen,
  baueDaten,
  kategorie,
  tagsAus,
  ohneFrontmatter,
  titelAus,
  lesevault,
  pruefeVault,
};