# Bachelor:Re Launcher

Language: **English** | [ไทย (TH)](README.th.md)

A desktop launcher that manages [OpenBachelor](https://github.com/pfyy) (S = server, C = client/launcher) end-to-end:

- **Download**: pulls OpenBachelorS/C from GitHub `master` into separate *version folders* (never overwrites the previous one)
- **Patch**: applies a declarative patch catalog to configs (region EN, config.json, version-sync, pc-setup)
- **Run**: boot server → launch game / attach (PC) → trainer console
- **UI**: RevivalSide-style — React/Vite web view inside a Tauri 2 desktop shell

## Milestone status

| | Work | Status |
|---|---|---|
| M1 | manifest + updater (Check for Update) + installer | ✅ done (both components track latest) |
| M2 | patch catalog (region/config/version-sync/pc-setup) | ✅ done |
| M3 | services: server/game/trainer/health + PC tools (setup/unset/attach) | ✅ done (real attach pending GamePath) |
| M4 | RevivalSide-style Tauri+React UI (+ PC setup/unset/doctor, file Browse, rotating background, NSIS installer) | ✅ done |
| M5 | UX polish (log export, log clear, in-game relaunch, hidden/no-console processes, trainer console UI) | ✅ done |

## Commands

```powershell
npm run check:update      # compare GitHub SHA vs installed (manual "Check for Update")
npm run update            # download latest S+C into a new version folder + patch automatically
npm run status            # show installed component status
npm run deps              # create .venv + install component dependencies
npm run doctor            # detect missing runtime bits
npm run patch             # show patch catalog status (which patches are applied / pending)
npm run patch:apply       # apply the patch catalog to the active components (idempotent)
npm run ui                # start the UI server (http://127.0.0.1:5178) — serves ui/dist (fallback ui/legacy) + /api
npm run ui:dev            # Vite dev server (http://127.0.0.1:5173, proxies /api → 5178) + hot reload
npm run ui:build          # build the React UI → ui/dist (tsc + vite)
npm run tauri:build       # build the desktop app + NSIS installer (release, src-tauri/target/release/bundle/nsis/)
npm run tauri:dev         # webview dev: starts ui:dev + the Tauri shell

node cli.js health               # overall stack status (ready to play?)
node cli.js server start|stop|status
node cli.js game start|stop|status
node cli.js trainer status|send <cmd>
node cli.js pc status|setup|unset|attach
```

## Patch catalog (M2)

Every time a new component version is downloaded, `core/patcher.js` runs `patches/*.js` automatically (idempotent):

| patch | component | what it does |
|---|---|---|
| `region-en-s` / `region-en-c` | S / C | sets `GAME_REGION = EN` (S also swaps res→res_en) |
| `config-server` | S | `conf/config.json` host/port from settings |
| `config-client` | C | `conf/config.json` host/port + `use_su=false` (PC) |
| `version-sync` | S | runs `openbachelors.tool.version_updater` to fetch the official EN version |
| `pc-setup` | C | LIEF injects frida-gadget into `hgdownloadsdk.dll` + writes `ak_exe_filepath.txt` (runs once GamePath is set) |
| **Save edit** (`/save` page) | S | fresh start (clears delta files → new game on the built-in **unlock-everything** template), with automatic backups (`multi_sav_backups/`) + manual Backup/Restore/Delete from the launcher |

Per-patch status: `node cli.js patch` · apply all: `node cli.js patch apply` · dry-run: `--dry-run` · single patch: `--only=region-en-s`

## PC tools (M3)

Three launcher scripts at the repo root (run with C's `.venv` — no pipx/poetry like the upstream OpenBachelorC commands):

| file | invoke | what it does |
|---|---|---|
| `setup_pc.cmd` | `node cli.js pc setup` | inject frida-gadget (LIEF) + write `ak_exe_filepath.txt` — GamePath is read from Settings |
| `unset_pc.cmd` | `node cli.js pc unset` | restore: re-copy `hgdownloadsdk.dll` from `.bak` + delete `ak_exe_filepath.txt` (idempotent) |
| `main_attach_pc.cmd` | `node cli.js pc attach` | run `main --attach_pc` in the same console (mirrors upstream) |

`node cli.js pc status` = see whether the injection already points to your game · `node cli.js pc doctor` = after a C update, verify the wrapper still matches (pc_const/entry/--attach_pc/frida xz). Note: each `components/C/<sha>/` folder still carries the upstream pipx-style `setup_pc.cmd` / `unset_pc.cmd` / `main_attach_pc.cmd` — we leave them untouched; this launcher ships its own versions, and component folders are re-downloaded on each update (`pc-unset` works with the `pc-setup` patch so status can go back to "pending").

## Principles

- Never touch OpenBachelor protocol/code — use the real thing, patch configs only
- Version = commit SHA of `master` (OpenBachelor publishes no releases/tags)
- Manual updates only (the "Check for Update" button)
- Version isolation → rollback possible

Full design details: `../BLUEPRINT-Bachelor-Re-Launcher.md`

## UI (M4)

- **Shell**: Tauri 2 (`decorations:false` + window controls + top drag strip — double-click to maximize); the shell **spawns the ui-server itself** (hidden, `CREATE_NO_WINDOW` — no empty cmd window) walking up from the exe to locate `server/ui-server.js`, reuses an already-listening :5178 instance (never kills one it did not start). **Closing the window hides the app to the system tray** (`MinimizeToTrayOnClose` Settings toggle, default ON) — the ui-server and any running game keep going; the tray icon has **Open Bachelor:Re / Quit** (right-click; left-click restores the window), and launching the exe again just reveals the running instance (single-instance plugin) instead of opening a second one
- **Rotating background**: the ui-server lists images from the data-root `bg/` folder (JPG/PNG/WebP/SVG), crossfading every 12 s — drop files in to add your own, no rebuild needed (`logo*` files are skipped; they are the sidebar logo assets). The UI caches the last list in **localStorage** and keeps retrying `/api/bg/list` while the ui-server is still booting; the `<img>` art is only mounted **after a successful fetch** — mounting from the cached list while the server is down made every image fail permanently (naturalWidth 0, no image retry), which was the "black background at open" bug
- **Game-launcher Play page**: compact title top-left + open middle area for the art; bottom-left = readiness banner (max-width ~560px, not stretched) + a small Server status dot + a collapsible LOGS strip; bottom-right = a single Start Game / Stop **pill button** raised off the window edge next to a round "3 lines" button whose popover shows Version / Game (C) / Trainer and jumps to Game Settings. Hovering the disabled Start button shows a native tooltip explaining what is still missing (e.g. GamePath not set)
- **PC Hook** card (gamePath / ak txt / backup + Setup / Unset / Doctor) sits at the bottom of the Settings page
- **UI language**: all UI, code and user-visible messages are English; only documentation ships in two versions (EN + TH)
- **No console popups**: every child-process spawn is hidden — `windowsHide:true` in `core/proc.js` (git/npm/pip) and `services/spawner.js` (S server, game, log tailers); S and C run through the venv's **`pythonw.exe`** because uv-style venvs ship a `python.exe` trampoline that re-spawns the real interpreter with a brand-new *visible* console of its own, and the C bridge pushes `CREATE_NO_WINDOW` onto **every** `subprocess.Popen` it makes (the game-launch `cmd` and `adb` would otherwise pop fresh consoles from a console-less parent). The only visible console is the upstream dev helper `pc attach` (`main_attach_pc.cmd`)
- **Headless C flow (`services/c-bridge.py`)**: upstream's `--attach_pc` REPL needs a real Windows console (prompt_toolkit crashes when hidden/piped), so the launcher runs a small bridge that imports the upstream package itself and replaces only the REPL — trainer commands travel through a per-C-install command file that the bridge tails; both the game and the bridge keep running detached while the ui-server restarts, and Stop (`taskkill /T`) closes the whole tree. If the game's anti-cheat refuses external termination, the stop log says so — close that game in-game (the hook sits inside the game process)
- **Log export**: the Logs page has an **Export** button → `POST /api/logs/export` dumps the whole 4000-line ring buffer to `logs/bachelor-re-<UTC-stamp>.log` (`[timestamp] [source] line` format) and the UI shows the saved path
- **Log clear**: the Logs page **Clear** button (`POST /api/logs/clear`) empties the ring **and truncates the `logs/service-*.log` files on disk** — a plain ring wipe was unobservable because a ui-server restart re-ingests those files from byte 0 and the "cleared" lines came straight back
- **Trainer console** (Play page, `TRAINER` strip): opens a click-driven panel for the headless bridge — a chip per trainer switch (`zero_cost`, `global_range`, …) that toggles `enable`/`disable` on click, **All on / All off** (`enable all` / `disable all`), and a raw line input (`!runcode`, `?callback` syntax included) with a live `[trainer]`/`[C]` feedback feed; **no console typing is needed anywhere** — commands ride the same file channel to the bridge and even survive ui-server restarts while the game stays attached
- **Relaunch game** (popover item): closes *only* the game and launches it again — the S server keeps running, no full Stop/Start cycle (disabled with a tooltip while the server is down)
- **Installer**: the NSIS setup ships the exe **plus the whole JS backend** (`server/`, `services/`, `core/`, `patches/`, `bg/` staged by `scripts/stage-backend.mjs` before the build) — the installed app is fully *self-contained*: it spawns its own ui-server under its install folder (`%LocalAppData%\BachelorRe` for per-user install), keeping its own `components/`, `logs/`, `data/` etc. inside; nothing is shared with a repo copy except :5178 (whose running owner it reuses). Node.js must exist on the machine (`Program Files\nodejs` or PATH). First run starts fresh: set GamePath + press Check for Update to download S/C into the install folder. The NSIS hooks (`hooks.nsh`) normalize a typed relative install dir (e.g. `..\..\BachelorRe`) to an absolute path before copying, so the directory page accepts any folder; the installer is unsigned - Windows SmartScreen may ask for confirmation
- **Save edit (M6)**: the Save page manages the S save slot — **New game** clears the account's delta files so the next login starts a new account on the server's built-in **unlock-everything template** (all operators maxed, all skins, story — that is how OpenBachelorS builds a fresh save), and every destructive action first writes an automatic backup into `components/S/<ver>/multi_sav_backups/<stamp>__<user>`; **Backup now**, **Restore** and backup delete are one click. Editing is refused while the S server or the game is running (the server re-saves deltas per request — writes would race)
- **Docs**: `README.md` (EN, this file) · `README.th.md` (Thai) · `bg/README.md` / `bg/README.th.md`
- **Credits page** (`/credits`): credits the launcher author ([Yusinz-Zero](https://github.com/Yusinz-Zero)) and the OpenBachelor author ([pfyy](https://github.com/pfyy)) — replaced the direct GitHub link in the sidebar
- **External links** always open in the system browser via `POST /api/open-url` (host-allowlisted: github.com, arknights.global) — never inside the app window
- **UI size**: scaled down globally via `html { font-size: 15px }` in `ui/src/index.css`
- **GamePath**: press Browse in Settings (real file dialog via `POST /api/pc/browse`), press Save
- UI edit note: new files under `ui/src/*` must be added to the `@source` list in `ui/src/index.css` (Tailwind v4 auto-scan misses whole class groups in this project)
