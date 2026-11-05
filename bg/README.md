# Background art (rotating)

The launcher rotates every image in this folder (crossfade, one every 12 s) —
drop JPG / PNG / WebP files in and they are picked up automatically at
`/bg/<filename>` — no rebuild needed.

Current set: `bg1.jpg` … `bg5.jpg` (user-supplied, rotation cycles these).

`Logo.png` in here is the **sidebar logo asset**, not a background — the
`/api/bg/list` endpoint excludes files starting with "logo" on purpose.
