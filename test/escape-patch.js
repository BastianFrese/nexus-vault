/* Wendet die ent()-Escapes an den verbleibenden innerHTML-Stellen an. */
const fs = require('fs');
let t = fs.readFileSync(__dirname + '/../assets/mockup.html', 'utf8');
const vor = {
  tag: t.includes('${tag}'),
  wikilink: t.includes("${targetId}"),
  wikilinkTitle: (t.match(/\$\{title\}<\/span>/g) || []).length,
  badge: (t.match(/\$\{t\}<\/span>\`\)\.join/g) || []).length,
  tooltip: t.includes("tooltip-tags").innerHTML,
};

t = t.replace(/\$\{tag\}(?=\s*\n\s*<\/span>)/g, '${ent(tag)}');
t = t.replace(/onclick="selectNote\('\$\{targetId\}'\)"/g, "onclick=\"selectNote('${ent(targetId)}')\"");
t = t.replace(/\$\{title\}<\/span>`/g, '${ent(title)}</span>`');
t = t.replace(/\$\{t\}<\/span>`\)\.join\(' '\)/g, "${ent(t)}</span>`).join(' ')");
t = t.replace(/hoveredNode\.tags\.map\(t => `<span/, 'hoveredNode.tags.map(t => `<span');
t = t.replace(/hoveredNode\.tags\.map\(t => `(\$\{[^}]*\})/g, (m, p1) => 'hoveredNode.tags.map(t => `${ent(t)');

fs.writeFileSync(__dirname + '/../assets/mockup.html', t);
console.log('vor:', JSON.stringify(vor));
console.log('nach:', {
  tag: t.includes('${ent(tag)}'),
  wikilink: t.includes("${ent(targetId)}"),
  wikilinkTitle: t.includes('${ent(title)}'),
  badge: t.includes("${ent(t)}</span>`)"),
});