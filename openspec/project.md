# Project Context

## Purpose
Build a **tiny, local-only macOS menubar note-capture app** that lets me **capture a note instantly via a global shortcut**, then **review/search/delete** later in a simple notes list window.

This is a **personal tool**, optimized for:
- zero friction capture
- minimal UI
- fast startup and low memory
- local storage only (no accounts, no cloud)

## Product Definition

### Core UX (2 windows)
1) **Quick Capture Window (global shortcut)**
- Pops a small, minimal input window (like the screenshot).
- Single-line input by default (optionally auto-expands to multi-line later).
- Keyboard-first:
  - `Enter` = save note
  - `Esc` = close (no save)
  - `Cmd+Enter` (optional) = insert newline if multi-line is enabled
- On save:
  - persist note
  - close window
  - optionally show a subtle “saved” toast (optional)

2) **Main Notes Window (menubar icon click)**
- Shows notes as a vertical list.
- Each note is a small “card row” (one per note) with:
  - note text
  - timestamp
  - actions: copy / delete (and maybe pin later)
- Simple search input at the top to filter notes.

### Global Shortcut
- **Default:** `Ctrl + Option + N` (⌃⌥N)
  - easy to hit, rarely conflicts, mnemonic (“Note”)
  - avoids `Option + Space` (Super Whisper) and `Cmd + Space` (Spotlight)
- Shortcut should be configurable later, but not required for MVP.

## Tech Stack

### Desktop App
- **Tauri** (Rust backend)
- **Frontend:** Vite + TypeScript + minimal UI (no heavy frameworks required, but React is fine if you prefer)
- **Target:** macOS first (menubar/tray + global shortcut)

### Local Persistence
MVP choice (pick one, default to simplest):
- **Option A (simplest):** JSON file in app data dir
- **Option B (more robust):** SQLite (via `tauri-plugin-sql`)

MVP recommendation: **JSON** until you feel friction (search/perf/locking), then migrate to SQLite.

## Project Structure (suggested)

```
.
├── README.md
├── project.md
├── openspec/
│   ├── overview.md
│   ├── decisions.md
│   └── tasks.md
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands.rs
│   │   ├── storage.rs
│   │   └── shortcuts.rs
│   └── tauri.conf.json
└── src/
├── main.ts
├── ui/
│  ├── QuickCapture.tsx
│  ├── NotesWindow.tsx
│  └── components/
└── styles.css
```

## Architecture Overview

### Main components
- **Rust (Tauri backend)**
  - Global shortcut registration
  - Window management (show/hide quick capture, open notes window)
  - Storage read/write
  - Commands exposed to frontend: `create_note`, `list_notes`, `delete_note`, `copy_note`

- **Frontend (Vite UI)**
  - Quick capture UI (input)
  - Notes list UI (search + list + actions)

### Data model
`Note`
- `id: string` (uuid)
- `text: string`
- `created_at: string` (ISO timestamp)
- `updated_at?: string` (optional)
- `pinned?: boolean` (optional later)

## Functional Requirements (MVP)

### Quick Capture
- Open via global shortcut.
- Input focused by default.
- Save note on `Enter`.
- Close on `Esc`.
- If empty or whitespace: do nothing and close (or keep open; prefer “do nothing and close”).

### Notes Window
- Accessible via menubar icon click.
- Shows notes newest-first.
- Search filters notes by substring match (case-insensitive).
- Copy note text to clipboard.
- Delete note with confirmation (or undo toast).

### Menubar
- Menubar icon always present when app runs.
- Menu items:
  - “New Note” (opens quick capture)
  - “Open Notes”
  - “Quit”

## Non-Goals (explicitly not doing in MVP)
- Sync / cloud / login
- Tags / folders
- Rich text / markdown rendering
- AI features
- Collaboration
- Complex settings UI

## Important Constraints
- Must work fully offline.
- Must store data locally in a predictable location (app data dir).
- Must stay minimal: avoid dependency bloat and over-engineering.
- macOS-first UX; Windows/Linux can be “later”.

## Conventions

### Code Style
- Rust: `rustfmt`, clippy clean
- TypeScript: strict mode, no `any` unless justified
- Keep commands small and explicit (AI-friendly naming).

### Error Handling
- Backend returns typed errors to UI; UI shows a tiny non-blocking message when needed.
- No silent failures for write operations.

### UX Rules
- Keyboard-first everywhere.
- Instant open/close behavior for quick capture.
- Never block on heavy work when opening the capture window.

## Development Workflow

### Local dev
- `pnpm install`
- `pnpm tauri dev`

### Build
- `pnpm tauri build`

### Release (personal)
- Local build artifact is enough; no auto-updater in MVP.

## OpenSpec Usage
- `openspec/overview.md`: product + UX definition (this doc distilled)
- `openspec/decisions.md`: architecture choices (JSON vs SQLite, shortcut, window behavior)
- `openspec/tasks.md`: small, incremental tasks for Codex/agents (one feature per task)

## Initial Task Breakdown (AI-friendly)
1) Tauri bootstrap + menubar icon + menu actions
2) Implement quick capture window + focus + enter/esc behavior
3) Implement storage (JSON) + create/list/delete note commands
4) Notes window UI (list + delete + copy)
5) Global shortcut (⌃⌥N) to open quick capture
6) Search filter
7) Basic polish (empty state, small spacing, minimal styling)
