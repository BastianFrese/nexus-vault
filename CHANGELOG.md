# Changelog

Alle Versionen von Nexus Vault (früher „Cyber Cortex").

## [0.2.0] - 2026-10-30

### Changed
- Projekt umbenannt von „Cyber Cortex" zu **Nexus Vault** (Repo, Paket, App-Titel,
  Umgebungsvariable `NEXUS_VAULT_VAULT`, Start-Launcher).
- Versionsverwaltung eingeführt: SemVer, CHANGELOG, Git-Tags (`v0.1.0`, `v0.2.0`).

### Notes
- Der Ordner im Vault bleibt `source\repos\nexus-vault`; alte Links auf
  `BastianFrese/cyber-cortex` leiten per GitHub-Redirect auf `nexus-vault` weiter.

## [0.1.0] - 2026-10-30

### Added
- MVP: Mockup-Fenster über dem echten Vault (Lesen, Suche, Roheditor, Watcher).
- Watcher mit Debounce plus 15-s-Silhouetten-Sicherheitsnetz.
- Strg+E / „Notiz bearbeiten" → Roh-Editor mit echtem Markdown-Text.

### Fixed
- String.replace-$-Falle (Vorlagen-Duplikat).
- XSS-Escape im Renderer, BOM/Frontmatter/Codeblock-Parser.
- Watcher-Sicherheitsnetz, Log statt Modal.
- Generische Pfade / Titel-Fix für öffentliche Veröffentlichung.
