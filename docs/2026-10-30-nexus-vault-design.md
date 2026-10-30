# Design — Nexus Vault (30.10.2026)

**Auftrag Bastian, wörtlich:** „such nach einer passenden Programmiersprache und
passendem Backend etc und bau anhand der Mockup-HTML eine 1-zu-1-Kopie des Mockups
als eigene Obsidian-App, die Claude Code dann als Gehirn nutzt" — geklärt im Gespräch:
**nur zeigen + suchen + einfaches Bearbeiten (Roh-Markdown)**, kein Obsidian-Ersatz.
Autostart ja. Name „Nexus Vault" bestätigt.

## Intent

Der Vault (`Obsidian`-Ordner im Benutzerverzeichnis, per Umgebungsvariable
`NEXUS_VAULT_VAULT` übersteuerbar) ist das Gedächtnis (seit 29.10.: Eingang, Index,
Nächste-Liste, Claude schreibt jeden Block hinein). Die App ist das **Gesicht**:
Bastians Mockup-HTML **unverändert** (Platzhalter `__VAULT_DATA__` ersetzt — derselbe
Mechanismus wie im Obsidian-Plugin `cyber-vault-mockup`), ein eigenes Fenster, live.

## Technik (Wahl begründet)

- **Electron + Node** — es gibt schon eine funktionierende Fassung von exactly
  dieser UI (das Plugin), deren Code übernehmt wird; kein Web-Server nötig.
  Tauri (Rust) hätte mehr Bau-/Wartungsrisiko für dieselbe Optik.
- **Datenbasis:** Walk über `.md`-Dateien, eigener `[[Wikilink]]`-Parser
  (Zielauflösung wie Obsidian: Basisname eindeutig), Tags aus Frontmatter.
  Reine Funktionen — Node-Selbsttest.
- **Live:** `fs.watch` auf dem Vault (Debounce ~3 s) → Index neu → Fenster neu laden.
- **Bearbeiten:** eigenes kleines Fenster (Roh-Markdown in Textfeld, Strg+S,
  Zeilenenden + Kodierung bewahren). Eintrag per Menü/Strg+E zur aktiven Notiz.
  Konfliktregel: wer zuletzt speichert, gewinnt (Claude liest vor Änderung immer).
- **Autostart:** HKCU-Run-Eintrag → Launcher ohne Konsolenfenster
  (`.vbs`/`.cmd` im Repo).

## Nicht-Ziele / Anti-Ziele

- Kein Speicherort zweiter Art: geschrieben wird **nur** in den Vault, nur `.md`.
- Kein WYSIWYG/Live-Editor (Monatsprojekt — Bastian prüft separat).
- Lyra bleibt tabu; das Mockup-HTML wird nicht umgestaltet.

## Risiko

- Mockup lädt Tailwind per CDN — ohne Internet läuft die Oberfläche roh; egal fürs
  Homelab, aber vermerkt.