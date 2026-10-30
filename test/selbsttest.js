/* Selbsttest für core/vault-daten.js — läuft ohne Obsidian. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { wikilinks, aufloesen, baueDaten, lesevault, kategorie, tagsAus, ohneFrontmatter, titelAus } = require('../core/vault-daten');

/* Arrange: ein Fake-Vault im Temp */
const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-test-'));
fs.mkdirSync(path.join(wurzel, 'Projekte'));
fs.writeFileSync(path.join(wurzel, 'a.md'), '---\ndatum: 2026-10-30\ntags: [doku, test]\nstatus: [laufend]\n---\n# Notiz A\n[[b]] und [[Projekte/c]] und [[fremd]]\n');
fs.writeFileSync(path.join(wurzel, 'Projekte', 'b.md'), '# Notiz B\n[[a]]\n');
fs.writeFileSync(path.join(wurzel, 'Projekte', 'c.md'), '# Notiz C\nkein link\n');

const vault = lesevault(wurzel);

/* Kanten: a↔b (Paar zusammengefallen — mit sort() liest b.md zuerst, die Kante
   trägt b als Quelle), a→c (voller Pfad), a→fremd unaufgelöst → weg. */
assert.deepStrictEqual(vault.zaehler, { notes: 3, links: 2 }, 'zaehler: ' + JSON.stringify(vault.zaehler));

const kanten = vault.daten.edges.map(k => [k.source, k.target]).sort();
assert.deepStrictEqual(kanten, [
  ['Projekte/b.md', 'a.md'],
  ['a.md', 'Projekte/c.md'],
], 'kanten: ' + JSON.stringify(kanten));

/* Notizform wie im Plugin (id, title, path, category, tags, content ohne Frontmatter) */
const a = vault.daten.notes.find(n => n.id === 'a.md');
assert.strictEqual(a.title, 'Notiz A');
assert.strictEqual(a.category, 'Life');
assert.deepStrictEqual(a.tags, ['#doku', '#test']);
assert.ok(!a.content.includes('datum:'), 'Frontmatter muss raus');
assert.ok(a.content.includes('[[b]]'));

/* Einheitliche Kanten-Paare: quelle<ziel normalisiert */
assert.ok(!kanten.some(k => k[0] === 'b.md' && k[1] === 'Projekte/b.md'), 'Kanten sind paarweise');

/* Port-Funktionen direkt */
assert.strictEqual(kategorie('Homelab/x.md'), 'Homelab');
assert.strictEqual(kategorie('Projekte/x.md'), 'Dev');
assert.strictEqual(kategorie('x.md'), 'Life');
assert.deepStrictEqual(tagsAus('tags: [a, b]'), ['#a', '#b']);
assert.strictEqual(titelAus('# Titel\n', 'fail'), 'Titel');
assert.deepStrictEqual(wikilinks('[[B]] und [[Ordner/N2#x|alias]] und [[n]]'), ['B', 'Ordner/N2', 'n']);

/* Auflösung: Basisname eindeutig → pfad; Pfadkey ohne .md → pfad; unbekannt → null */
assert.strictEqual(aufloesen('b', new Map([['b', 'p/b.md']]), new Map()), 'p/b.md');
assert.strictEqual(aufloesen('p/b', new Map([['b', 'p/b.md']]), new Map([['p/b', 'p/b.md']])), 'p/b.md');
assert.strictEqual(aufloesen('fremd', new Map([]), new Map()), null);

/* baueDaten ignorierst selbsteigene Kanten (a→a) */
const einzeln = baueDaten([{}], { a: ['a'] }, null);
assert.deepStrictEqual(einzeln.edges, []);

/* Aufräumen */
fs.rmSync(wurzel, { recursive: true, force: true });
console.log('Selbsttest OK — ' + 10 + ' Prüfungen grün');