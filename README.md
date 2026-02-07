<p align="center">
  <img src="./src-tauri/icons/128x128.png" alt="Jotin icon" width="96" height="96" />
</p>

<h1 align="center">Jotin</h1>

<p align="center">
  Fast, local-first note capture from your macOS menu bar.
</p>

<p align="center">
  Press <code>⌃⌥N</code>, jot your thought, hit <code>Enter</code>, done.
</p>

---

## What It Is

Jotin is a lightweight desktop app built with Tauri.

- Instant quick-capture window
- Menu bar notes list with search
- Copy / delete actions
- Light and dark theme toggle
- 100% local storage (no sync, no account, no cloud)

## Install (Development)

### Prerequisites

- macOS
- [Bun](https://bun.sh/)
- Rust toolchain (`rustup`, `cargo`)
- Xcode Command Line Tools

### Setup

```bash
bun install
```

### Run

```bash
bun run tauri dev
```

### Build

```bash
bun run tauri build
```

## How To Use

1. Launch the app.
2. Use the global shortcut `Ctrl + Option + N` to open quick capture.
3. Type your note and press `Enter` to save.
4. Click the menu bar icon to open your notes list.
5. Search, copy, or delete notes from the main window.

## Notes Storage

Notes are stored locally as JSON in the app data directory managed by Tauri.

## Tech Stack

- Tauri (Rust backend)
- React + TypeScript (Vite frontend)
- shadcn/ui components

