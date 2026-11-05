# Bachelor:Re Launcher

ภาษา: **ไทย** | [English (EN)](README.md)

*OpenBachelor Launcher. For PvZ Online.*

Launcher **Windows** น้ำหนักเบา สำหรับรัน private server ของ OpenBachelor: กดโหลด S/C ล่าสุด, patch ให้อัตโนมัติ, boot server, เปิดเกม และควบคุม trainer ได้ทุกอย่างจาก UI desktop สะอาด ๆ

สร้างด้วย **Tauri 2 + React** ห่อ [OpenBachelor](https://github.com/pfyy) server/client (**S** = server, **C** = client/launcher)

---

## ฟีเจอร์

- **ติดตั้งได้ในคลิกเดียว** — โหลด OpenBachelor S/C, patch config อัตโนมัติ, boot server, เปิดเกม
- **Trainer console** — คลิกสลับสวิตช์ cheat หรือพิมพ์คำสั่งดิบ (`!runcode`, `?callback` ได้) ไม่ต้องใช้ console ใด ๆ
- **แก้ Save (/save)** — เริ่มเกม **ใหม่** หรือเล่นบน template ที่**ปลดล็อกทุกอย่าง** พร้อม backup อัตโนมัติ + Backup/Restore
- **ปิดเปิดภาพพื้นหลัง** — ไอคอนตาที่ sidebar เปิด/ปิดภาพหมุนเวียนได้ทันที
- **System tray** — ปิดหน้าต่างแล้วเกมกับ launcher ยังทำงาน (มีเมนู Open / Quit)
- **อัปเดต** — ปุ่ม *Check for Update* แบบ manual + version isolation rollback ได้
- **Logs & tools** — log สดพร้อม Export / Clear, PC setup / unset / attach, backup save

## ความต้องการของระบบ

- **Windows 10/11 x64**
- ติดตั้ง **Node.js** ไว้ (`Program Files\nodejs` หรืออยู่ใน PATH)
- มีตัวเกม (exe ของเกมตั้งในหน้า Settings)

## วิธีเริ่มต้น

1. **ดาวน์โหลดตัวติดตั้ง** จากหน้า [Releases](https://github.com/Yusinz-Zero/BachelorRe/releases) (`BachelorRe_0.1.0_x64-setup.exe`)
2. **รันติดตั้ง** — เลือกโฟลเดอร์ไหนก็ได้ (SmartScreen: *More info → Run anyway* เพราะ installer ยังไม่ sign)
3. เปิดแอป → **Settings** → ตั้ง **Game path** (exe ของเกม)
4. ครั้งแรกกด **Check for Update** เพื่อโหลด S/C แล้วกด **Start Game**

> การติดตั้งครั้งแรกจะลงทุกอย่างไว้ในโฟลเดอร์แอปเอง — ไม่ต้อง admin สำหรับติดตั้ง per-user

## หน้าในแอป

| หน้า | ใช้ทำอะไร |
| --- | --- |
| **Play** | สถานะพร้อมเล่น, Start/Stop server + เกม, relaunch, trainer console |
| **Components** | เวอร์ชัน OpenBachelor S/C ที่ติดตั้งอยู่ |
| **Patches** | patch config ที่ลงแล้ว / ค้างอยู่ |
| **Save** | save ของ server: เกมใหม่ · template ปลดล็อกทุกอย่าง · backup |
| **Logs** | ฟีด log สด, **Export** ลงไฟล์, **Clear** บนดิสก์ |
| **Settings** | พอร์ต server/trainer, game path, อัปเดต & การทำงานของ tray |
| **Credits** | เกี่ยวกับ launcher และ OpenBachelor |

## สำหรับนักพัฒนา

```powershell
npm install
npm run ui:dev       # Vite dev server + hot reload
npm run tauri:dev    # เชลล์เดสก์ท็อปแบบ dev
npm run tauri:build  # build แอป + NSIS installer (src-tauri/target/release/bundle/nsis/)
```

เรียกแบบ headless: `node cli.js server|game|trainer|pc health|status|…` — ดูรายละเอียดในโค้ดได้เลย

## เครดิต

Bachelor:Re Launcher เป็น launcher **อิสระ** สำหรับ [OpenBachelor](https://github.com/pfyy) — โปรเจกต์ private server โดย **pfyy**

- ผู้ทำ launcher: [Yusinz-Zero](https://github.com/Yusinz-Zero)
- OpenBachelor S / C: [pfyy](https://github.com/pfyy) — ขอบคุณสำหรับโปรโตคอลและ template ของ S/C 🖤

> **หมายเหตุ:** Launcher นี้ไม่เกี่ยวข้องกับ OpenBachelor หรือบริษัทผู้พัฒนาเกม — มันแก้แค่ *config* เท่านั้น ไม่แตะโปรโตคอล/โค้ดของ OpenBachelor ชื่อเกมและเครื่องหมายการค้าเป็นของเจ้าของที่เกี่ยวข้อง ใช้บน server ส่วนตัว/ทดสอบ ที่ความเสี่ยงของผู้ใช้เอง
