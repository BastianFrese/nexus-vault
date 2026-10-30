'use strict';
const { lesevault } = require('./vault-daten');

function tokenisiere(text) {
  return String(text || '').toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function vektor(tokens) {
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const norm = Math.sqrt([...counts.values()].reduce((s, c) => s + c * c, 0)) || 1;
  const result = new Map();
  for (const [t, c] of counts) result.set(t, c / norm);
  return result;
}

function cosine(a, b) {
  let s = 0;
  for (const [t, v] of a) if (b.has(t)) s += v * b.get(t);
  return s;
}

function semantischeSuche(wurzel, query, limit) {
  const qTokens = tokenisiere(query);
  if (!qTokens.length) return [];
  const qVec = vektor(qTokens);
  const { daten } = lesevault(wurzel);
  const notes = daten.notes || [];
  const results = notes.map(n => {
    const text = (n.title || '') + ' ' + (n.content || '') + ' ' + (n.tags || []).join(' ');
    const docVec = vektor(tokenisiere(text));
    let score = cosine(qVec, docVec);
    // Boost bei direkter Teilstringsuche im Titel
    if ((n.title || '').toLowerCase().includes(String(query || '').toLowerCase())) score += 1;
    return { id: n.id, title: n.title, category: n.category, score: Number(score.toFixed(4)),
      snippet: (n.content || '').slice(0, 200) };
  }).filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 15)));
  return results;
}

module.exports = { tokenisiere, vektor, cosine, semantischeSuche };
