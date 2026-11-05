# Bachelor:Re — non-interactive PC setup (mirrors OpenBachelorC setup_pc.py, no Tk dialog)
# Usage: <C venv python> patches/helpers/pc_setup_noninteractive.py --component <C root> --game <Arknights.exe>
#
# - backs up <game>/hgdownloadsdk.dll -> .bak if missing
# - decompresses frida-gadget xz (version derived from filename) -> <game>/florida-<ver>.dll
# - LIEF-injects the florida import into hgdownloadsdk.dll (from the .bak)
# - writes ak_exe_filepath.txt in the C component root (what main --attach_pc reads)
import argparse
import lzma
import shutil
import sys
from pathlib import Path

import lief


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--component", required=True)
    ap.add_argument("--game", required=True)
    args = ap.parse_args()

    comp_root = Path(args.component).resolve()
    game_exe = Path(args.game).resolve()
    game_dir = game_exe.parent

    # pull the stable constants from the component's own pc_const.py (stays current w/ upstream)
    src_dir = comp_root / "src" / "launcher" / "openbachelorc"
    if src_dir.is_dir():
        sys.path.insert(0, str(src_dir))
        import pc_const  # noqa: F401

        VICTIM = pc_const.VICTIM_DLL_FILENAME
        AK_TXT = pc_const.AK_EXE_FILEPATH_TXT_FILEPATH
    else:
        VICTIM = "hgdownloadsdk.dll"
        AK_TXT = "ak_exe_filepath.txt"

    victim = game_dir / VICTIM
    if not victim.is_file():
        print("err: victim dll not found: " + str(victim))
        sys.exit(1)

    bak = victim.with_name(victim.name + ".bak")
    if not bak.is_file():
        shutil.copy2(victim, bak)
        print("backup -> " + str(bak))

    xz_paths = sorted(comp_root.glob("frida-gadget/*-windows-x86_64.dll.xz"))
    if not xz_paths:
        print("err: no frida-gadget xz found in component frida-gadget/")
        sys.exit(1)
    xz = xz_paths[0]
    stem = xz.name[len("frida-gadget-") : -len("-windows-x86_64.dll.xz")]
    florida_name = f"florida-{stem}.dll"
    florida_dst = game_dir / florida_name

    with lzma.open(str(xz)) as fh:
        florida_dst.write_bytes(fh.read())
    print("gadget -> " + str(florida_dst))

    victim_dll = lief.PE.parse(str(bak))
    frida_import = victim_dll.add_import(florida_name)
    frida_import.add_entry("_frida_application_query_options_deserialize")

    cfg = lief.PE.Builder.config_t()
    cfg.imports = True
    cfg.tls = False
    victim_dll.write(str(victim), config=cfg)
    print("injected -> " + str(victim))

    (comp_root / AK_TXT).write_text(str(game_exe), encoding="utf-8")
    print("wrote -> " + str(comp_root / AK_TXT))


if __name__ == "__main__":
    main()
