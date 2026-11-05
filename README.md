# Bachelor:Re Launcher

Language: **English** | [ไทย (TH)](README.th.md)

*OpenBachelor Launcher. For PvZ Online.*

A lightweight **Windows launcher** for running a private OpenBachelor server in one click — download the latest S/C, apply the right patches, boot the server, launch the game, and control the trainer — all from a clean desktop UI.

Built with **Tauri 2 + React**, wrapping [OpenBachelor](https://github.com/pfyy) server/client (**S** = server, **C** = client/launcher).

---

## Features

- **One-click setup** — download OpenBachelor S/C, patch configs automatically, boot the server, start the game
- **Trainer console** — click-to-toggle cheat switches or type raw commands (`!runcode`, `?callback` included) — no console needed
- **Save editor (/save)** — start a **new game** or play the built-in **unlock-everything** template, with automatic backups + Backup/Restore
- **Background toggle** — eye icon in the sidebar to show/hide the rotating art
- **System tray** — closing the window keeps the game and launcher running (Open / Quit from the tray)
- **Updates** — manual *Check for Update* with version isolation and rollback
- **Logs & tools** — live logs with export / clear, PC setup / unset / attach, save backups

## Requirements

- **Windows 10/11 x64**
- **Node.js** installed (`Program Files\nodejs` or on PATH)
- The **game client** installed (its exe is set in Settings)

## Getting started

1. **Download the installer** from the [Releases](https://github.com/Yusinz-Zero/BachelorRe/releases) page (`BachelorRe_0.1.0_x64-setup.exe`).
2. **Run it** — pick any install folder (SmartScreen: *More info → Run anyway*; the installer is unsigned).
3. Open the app → **Settings** → set **Game path** (your game's exe).
4. Press **Check for Update** on the first run to download S/C, then hit **Start Game**.

> First run installs everything into the app folder — no admin needed for a per-user install.

## Pages

| Page | What it does |
| --- | --- |
| **Play** | readiness status, Start/Stop server + game, relaunch, trainer console |
| **Components** | installed OpenBachelor S/C versions |
| **Patches** | applied / pending config patches |
| **Save** | server save: new game · unlock-everything template · backups |
| **Logs** | live log feed, **Export** to file, **Clear** on disk |
| **Settings** | server/trainer ports, game path, update & tray behaviour |
| **Credits** | about the launcher and OpenBachelor |

## Development

```powershell
npm install
npm run ui:dev       # Vite dev server + hot reload
npm run tauri:dev    # desktop shell in dev
npm run tauri:build  # build app + NSIS installer (src-tauri/target/release/bundle/nsis/)
```

Headless CLI: `node cli.js server|game|trainer|pc health|status|…` — see the codebase for details. Full Thai walkthrough: [README.th.md](README.th.md)

## Credits

Bachelor:Re Launcher is an **independent launcher** for [OpenBachelor](https://github.com/pfyy) — the private-server project by **pfyy**.

- Launcher author: [Yusinz-Zero](https://github.com/Yusinz-Zero)
- OpenBachelor S / C: [pfyy](https://github.com/pfyy) — thank you for the S/C protocol, patches and templates 🖤

> **Disclaimer:** This launcher is not affiliated with OpenBachelor or the game publisher. It only patches *configs* — it never modifies OpenBachelor protocol/code. Game and trademark names belong to their respective owners. Use on private/testing servers at your own risk.
