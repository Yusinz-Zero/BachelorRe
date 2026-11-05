# Bachelor:Re Launcher

ภาษา: **ไทย** | [English (EN)](README.md)

Launcher แบบ desktop ที่จัดการ [OpenBachelor](https://github.com/pfyy) (S = server, C = client/launcher) ครบวงจร:

- **Download**: ดึง OpenBachelorS/C จาก GitHub `master` เก็บเป็น *version folder* แยก (ไม่ทับเวอร์ชันเก่า)
- **Patch**: ใช้ patch catalog แบบ declarative กับ config (region EN, config.json, version-sync, pc-setup)
- **Run**: boot server → เปิดเกม/attach (PC) → trainer console
- **UI**: สไตล์ RevivalSide — React/Vite ในเชลล์ Tauri 2

## สถานะ Milestones

| | งาน | สถานะ |
|---|---|---|
| M1 | manifest + updater (Check for Update) + installer | ✅ เสร็จ (ทั้งคู่ตามเวอร์ชันล่าสุด) |
| M2 | patch catalog (region/config/version-sync/pc-setup) | ✅ เสร็จ |
| M3 | services: server/game/trainer/health + PC tools (setup/unset/attach) | ✅ เสร็จ (attach ของจริงรอ GamePath) |
| M4 | UI Tauri+React สไตล์ RevivalSide (+ PC setup/unset/doctor, Browse เลือกไฟล์, พื้นหลังหมุนเวียน, NSIS installer) | ✅ เสร็จ |
| M5 | UX สมบูรณ์ (log export, log clear, relaunch เกมเฉพาะตัว, ซ่อน/ไม่มี console หลังบ้าน, แผง trainer ใน UI) | ✅ เสร็จ |

## คำสั่ง

```powershell
npm run check:update      # เทียบ SHA GitHub กับที่ติดตั้ง (Check for Update แบบเมนวล)
npm run update            # โหลด S+C ล่าสุดเป็น version folder ใหม่ + patch ให้อัตโนมัติ
npm run status            # ดูสถานะ component ที่ติดตั้ง
npm run deps              # สร้าง .venv + install deps ให้ component
npm run doctor            # ตรวจ runtime ที่ขาด
npm run patch             # ดูสถานะ patch catalog (อันไหนติดแล้ว/ยังค้าง)
npm run patch:apply       # apply patch catalog กับ component ที่ active (idempotent)
npm run ui                # เปิด UI server (http://127.0.0.1:5178) — serve ui/dist (fallback ui/legacy) + /api
npm run ui:dev            # Vite dev server (http://127.0.0.1:5173, proxy /api → 5178) + hot reload
npm run ui:build          # build React UI → ui/dist (tsc + vite)
npm run tauri:build       # build desktop + NSIS installer (release, src-tauri/target/release/bundle/nsis/)
npm run tauri:dev         # webview dev: เปิด ui:dev + Tauri shell

node cli.js health               # สถานะรวม stack (พร้อมเล่นไหม)
node cli.js server start|stop|status
node cli.js game start|stop|status
node cli.js trainer status|send <cmd>
node cli.js pc status|setup|unset|attach
```

## Patch Catalog (M2)

ทุกครั้งที่โหลด component เวอร์ชันใหม่ → `core/patcher.js` รัน `patches/*.js` ให้อัตโนมัติ (idempotent):

| patch | component | ทำอะไร |
|---|---|---|
| `region-en-s` / `region-en-c` | S / C | ตั้ง `GAME_REGION = EN` (S ยังสลับ res→res_en ด้วย) |
| `config-server` | S | `conf/config.json` host/port ตาม settings |
| `config-client` | C | `conf/config.json` host/port + `use_su=false` (PC) |
| `version-sync` | S | รัน `openbachelors.tool.version_updater` ดึง version official EN |
| `pc-setup` | C | LIEF inject frida-gadget ลง `hgdownloadsdk.dll` + เขียน `ak_exe_filepath.txt` (รันเมื่อตั้ง GamePath) |
| **Save edit** (`/save` page) | S | fresh start (ลบ delta files → เกมใหม่บน template สำเร็จรูปที่ **ปลดล็อกทุกอย่าง** มาให้) พร้อม auto backup (`multi_sav_backups/`) + ปุ่ม Backup/Restore/Delete จาก launcher |

โอเครทีละตัว: `node cli.js patch` · apply ทั้งหมด: `node cli.js patch apply` · dry-run: `--dry-run` · เฉพาะตัว: `--only=region-en-s`

## PC Tools (M3)

สคริปต์ 3 ไฟล์ที่ root ของ launcher (รันด้วย `.venv` ของ C — ไม่ต้อง pipx/poetry แบบ cmd ของ OpenBachelorC ต้นทาง):

| ไฟล์ | เรียก | ทำอะไร |
|---|---|---|
| `setup_pc.cmd` | `node cli.js pc setup` | inject frida-gadget (LIEF) + เขียน `ak_exe_filepath.txt` — GamePath อ่านจาก Settings |
| `unset_pc.cmd` | `node cli.js pc unset` | คืนสภาพ: restore `hgdownloadsdk.dll` จาก `.bak` + ลบ `ak_exe_filepath.txt` (idempotent) |
| `main_attach_pc.cmd` | `node cli.js pc attach` | รัน `main --attach_pc` ในคอนโซลเดิม (mirror อัปสตรีม) |

`node cli.js pc status` = ดูว่า inject แล้วหรือยัง / ชี้เกมตัวไหน · `node cli.js pc doctor` = check หลังอัปเดต C ว่า wrapper ยังเข้ากันอยู่ไหม (pc_const/entry/--attach_pc/frida xz). หมายเหตุ: ใน `components/C/<sha>/` ยังมี `setup_pc.cmd` / `unset_pc.cmd` / `main_attach_pc.cmd` แบบ pipx ของอัปสตรีม — เราไม่แตะ, launcher มีเวอร์ชันของตัวเอง และโฟลเดอร์ component ถูกโหลดใหม่ทุกครั้งที่อัปเดต (`pc-unset` ทำงานคู่กับ `pc-setup` patch เพื่อให้ status กลับไป "pending" ได้)

## หลักการ

- ไม่แตะโปรโตคอล/โค้ด OpenBachelor — ใช้ตัวจริง, patch แค่ config
- เวอร์ชัน = commit SHA ของ `master` (OpenBachelor ไม่มี release/tag)
- Manual update เท่านั้น (ปุ่ม "Check for Update")
- version isolation → rollback ได้

รายละเอียดเต็มดูที่ `../BLUEPRINT-Bachelor-Re-Launcher.md`

## UI (M4)

- **เชลล์**: Tauri 2 (`decorations:false` + window controls + แถบ drag ด้านบน — ดับเบิลคลิกเพื่อ maximize) — เชลล์ **พ่น ui-server เอง** (ซ่อน ด้วย `CREATE_NO_WINDOW` — ไม่มีหน้าต่าง cmd ว่าง) เดินหา `server/ui-server.js` จากโฟลเดอร์ exe ขึ้นไป, ถ้า :5178 มีตัวรันอยู่แล้วจะใช้ตัวนั้นต่อ (ไม่ยอม kill อันที่ไม่ได้เชลล์ประกอบ) — **ปิดหน้าต่าง = ซ่อนลง system tray** (toggle `MinimizeToTrayOnClose` ในหน้า Settings เปิดเป็นค่าเริ่ม) ui-server และเกมที่รันอยู่ยังทำงานต่อไป; ไอคอน tray มีเมนู **Open Bachelor:Re / Quit** (คลิกขวา = เมนู, คลิกซ้ายรูปไอคอน = คืนหน้าต่าง) และการเปิด exe ซ้ำจะโชว์หน้าต่างของตัวที่รันอยู่แล้วแทนการเปิดอีกบาน (single-instance)
- **พื้นหลังหมุนเวียน**: ui-server เปิดรายการภาพจาก folder `bg/` (JPG/PNG/WebP/SVG) เฟดตัดกันทุก 12 วิ — เพิ่มภาพเอง = ทิ้งไฟล์ในโฟลเดอร์ ไม่ต้อง rebuild (ไฟล์ขึ้นต้น `logo*` ถูกข้าม เพราะเป็นโลโก้ sidebar) — UI แคชรายการล่าสุดลง **localStorage** และแก้ `/api/bg/list` รอเรื่อย ๆ ตอน ui-server ยังบูตไม่เสร็จ แต่ `<img>` จะถูก mount **หลัง fetch สำเร็จเท่านั้น** — ถ้า mount จาก cache ตอน server ยังไม่ขึ้น ภาพจะโหลดพังทุกใบ (naturalWidth 0, ไม่มี retry) ซึ่งคือต้นเหตุ "เปิดโปรแกรมเจอหน้าจอดำ"
- **หน้า Play แบบ game-launcher**: หัวเรื่องเล็กซ้ายบน + เว้นพื้นที่กลางให้ภาพ; ล่างซ้าย = แบนเนอร์พร้อมเล่น (กว้างไม่เกิน ~560px ไม่ยืดเต็มจอ) + จุดสถานะ Server เล็ก + แถบ LOGS พับได้; ล่างขวา = ปุ่ม Start Game / Stop **แบบ pill โค้งเต็มวง** ยั่งขึ้นจากขอบล่างคู่กับปุ่มกลม "3 ขีด" ที่เด้งเมนูแสดง Version / Game (C) / Trainer และปุ่มไป Game Settings — **ชี้ค้างที่ปุ่ม Start เมื่อกดไม่ได้จะมี tooltip บอกว่าขาดอะไร** (เช่น GamePath ยังไม่ตั้ง)
- **การ์ด PC Hook** (gamePath / ak txt / backup + Setup / Unset / Doctor) อยู่ท้ายหน้า Settings
- **ภาษา UI**: UI, โค้ด และข้อความที่ user เห็นเป็น English ทั้งหมด; เฉพาะเอกสารมี 2 เวอร์ชัน (EN + TH)
- **ไม่มี console เด้ง**: child process ทุกตัวถูกซ่อน — `windowsHide:true` ใน `core/proc.js` (git/npm/pip) และ `services/spawner.js` (server S, เกม, log tailer); S และ C วิ่งผ่าน **`pythonw.exe`** ของ venv เพราะ venv แบบ uv มี `python.exe` ตัว trampoline ที่ไปปล่อย interpreter จริงที่โผล่ console *ใหม่วิ้ง ๆ* ของตัวเอง และ C bridge ใส่ `CREATE_NO_WINDOW` ทับ **ทุก** `subprocess.Popen` ที่มันเรียก (cmd ที่ใช้ปล่อยเกม และ adb เด้ง console ใหม่ตอนตัวแม่ไร้ console); ตัวที่ยังเห็นคอนโซลมีตัวเดียวคือ dev helper `pc attach` (`main_attach_pc.cmd`)
- **C flow แบบไร้หน้าจอ (`services/c-bridge.py`)**: REPL `--attach_pc` ของ upstream ต้องมี Windows console จริง (prompt_toolkit จะ crash เมื่อถูกซ่อน/pipe) — launcher เลยรันสะพานเล็ก ๆ ที่นำเข้า package ของ upstream เองและเปลี่ยนแค่ REPL: คำสั่ง trainer เดินทางผ่าน command file ต่อ C install ที่ bridge หางไฟล์ให้; เกมและ bridge รัน detached ต่อแม้ ui-server จะรีใหม่ และ Stop (`taskkill /T`) ปิด tree ทั้งชุด — ถ้า anti-cheat ของเกมปฏิเสธการหยุดจากภายนอก บันทึก stop จะแจ้งว่าต้องปิดเกมเองในหน้าจอเกม (hook อยู่ใน process เกม)
- **Export log**: หน้า Logs มีปุ่ม **Export** → `POST /api/logs/export` เท ring buffer 4000 บรรทัดลง `logs/bachelor-re-<UTC-stamp>.log` (รูปแบบ `[timestamp] [source] ข้อความ`) และ UI โชว์ path ที่บันทึก
- **Clear log**: ปุ่ม **Clear** หน้า Logs (`POST /api/logs/clear`) ลบ ring **และ truncate ไฟล์ `logs/service-*.log` บนดิสก์ด้วย** — เดิม wipe เฉพาะ ring เห็นไม่อะไรเพราะ ui-server รีใหม่แล้ว re-ingest ไฟล์จากไบต์ 0 "บรรทัดที่ลบไป" เลยกลับมาเหมือนเดิม
- **Trainer console** (หน้า Play, แถบ `TRAINER`): เปิดแผงสั่งด้วยการคลิกให้ bridge ไร้หน้าจอ — ชิปละสวิตช์ (`zero_cost`, `global_range`, …) คลิกเพื่อสลับ `enable`/`disable`, ปุ่ม **All on / All off** (`enable all` / `disable all`), ช่องพิมพ์คำสั่งดิบ (`!runcode`, `?callback` ด้วย) พร้อมฟีดตอบกลับ `[trainer]`/`[C]` แบบสด; **ไม่ต้องพิมพ์ใน console อีกต่อไป** — คำสั่งวิ่งผ่าน file channel เดิม และยังทำงานต่อแม้ ui-server รีใหม่ระหว่างเกมยังยึดอยู่
- **Relaunch game** (ในเมนู 3 ขีด): ปิด *เฉพาะตัวเกม* แล้วเปิดใหม่ — S server ยังรันต่อ ไม่ต้อง Stop ทั้งชุด (กดไม่ได้ + tooltip ระหว่าง server ยังไม่ทำงาน)
- **Installer**: ตัว NSIS แพ็ก **backend JS ทั้งชุด** (`server/`, `services/`, `core/`, `patches/`, `bg/` — staging ผ่าน `scripts/stage-backend.mjs`) — ติดตั้งแล้วแอปทำงาน *แยกขาดสมบูรณ์*: พ่น ui-server เองใต้โฟลเดอร์ติดตั้ง (`%LocalAppData%\BachelorRe` สำหรับติดตั้ง per-user) เก็บ `components/`, `logs/`, `data/` ของตัวเองข้างใน; แชร์กับ repo แค่ :5178 (ตัวที่ฟังอยู่อยู่แล้วจะถูกใช้ต่อ) ต้องมี Node.js ในเครื่อง (`Program Files\nodejs` หรือ PATH) ครั้งแรกเริ่มต้นใหม่: ตั้ง GamePath + กด Check for Update เพื่อโหลด S/C ลงโฟลเดอร์ติดตั้ง; NSIS hooks (`hooks.nsh`) normalize พาธ relative (เช่น `..\..\BachelorRe`) เป็นพาธเต็มก่อนคัดลอกไฟล์ ทำให้หน้าเลือกโฟลเดอร์พิมพ์พาธใดก็ได้; ตัวติดตั้งยังไม่ลงชื่อ (unsigned) — SmartScreen อาจเตือนก่อนเปิด
- **Save edit (M6)**: หน้า Save จัดการ save ของ S — **New game** ลบ delta files ของบัญชี แล้วการล็อกอินครั้งถัดไปจะเริ่มบัญชีใหม่บน template ที่ตัว server ปลดล็อกทุกอย่างมาให้ตอน birth (ออเปอเรเตอร์ทุกตัวเลเวลสูงสุด สกินทุกชิ้น เนื้อเรื่องจบ — สร้าง save ใหม่ของ OpenBachelorS ทำงานแบบนี้เอง) ทุก action ที่ทำลายล้างจะ backup อัตโนมัติไป `components/S/<ver>/multi_sav_backups/<stamp>__<user>` ก่อน; มีปุ่ม **Backup now**, **Restore** และลบ backup; ห้ามแก้ระหว่าง S server หรือเกมกำลังรัน (server เซฟ delta ทุก request — เขียนพร้อมกันจะชน)
- **เอกสาร**: `README.md` (EN) · `README.th.md` (ไฟล์นี้) · `bg/README.md` / `bg/README.th.md`
- **หน้า Credits** (`/credits`): เครดิตผู้ทำ launcher ([Yusinz-Zero](https://github.com/Yusinz-Zero)) และผู้ทำ OpenBachelor ([pfyy](https://github.com/pfyy)) — แทนลิงก์ GitHub ตรง ๆ ใน sidebar
- **ลิงก์ภายนอก** เปิดผ่าน system browser เสมอ ด้วย `POST /api/open-url` (มี host allowlist: github.com, arknights.global) — ไม่เปิดในหน้าต่างแอป (กดย้อนใน browser ได้ปกติ)
- **ขนาด UI**: ย่อรวมผ่าน `html { font-size: 15px }` ใน `ui/src/index.css`
- **GamePath**: กด Browse ในหน้า Settings (file dialog จริงผ่าน `POST /api/pc/browse`) แล้วกด Save
- หมายเหตุแก้ UI: ไฟล์ใหม่ใน `ui/src/*` ต้องเติมลงรายการ `@source` ใน `ui/src/index.css` (Tailwind v4 ของโปรเจกต์นี้ scan อัตโนมัติไม่ครบ)
