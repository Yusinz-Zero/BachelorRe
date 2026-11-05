# Bachelor:Re C-bridge — headless runner for the OpenBachelorC PC flow.
#
# The launcher spawns this INSTEAD of `python -m openbachelorc.main --attach_pc`
# because upstream's interactive prompt (prompt_toolkit) requires a real Windows
# console and would crash inside the launcher's hidden, pipe-backed child
# (NoConsoleScreenBufferError). This bridge keeps using the upstream package
# itself — same imports, same attach flow, same command dispatch — and replaces
# only the REPL. It accepts exactly what the upstream "> " prompt accepts:
#
#   enable|disable <cmd> [all]   trainer switches (same word list as upstream)
#   !<raw>                       forwarded to game.exec_trainer_command as-is
#   ?<cb>                        invokes an upstream callback hook
#
# Commands arrive through a COMMAND FILE (argv[1]) rather than stdin: the
# launcher appends one line per command, this bridge tails the file every 300 ms
# and executes the new ones. A file channel survives ui-server restarts — the
# game and this bridge keep running detached while the launcher is closed, and
# when it comes back the trainer works again without touching the game.
# The bridge is stopped by the launcher (taskkill /T on its tree).

import subprocess
import sys
import time
from pathlib import Path

# Windows: this bridge runs console-less (windowless pythonw), so any console-subsystem
# child the flow spawns (the hidden cmd.exe of the game launch, adb, ...) would get a
# fresh VISIBLE console of its own — Windows attaches a new console when the parent has
# none. Push CREATE_NO_WINDOW onto every Popen in this process BEFORE importing the
# upstream package; it only suppresses the child's own console window, never the
# game's GUI windows.
if sys.platform == "win32":
    class _QuietPopen(subprocess.Popen):
        """Real subclass — other code (asyncio.windows_utils) subclasses this attribute,
        so it must stay a class, not a plain function wrapper."""

        def __init__(self, *args, **kwargs):
            kwargs["creationflags"] = (kwargs.get("creationflags") or 0) | subprocess.CREATE_NO_WINDOW
            super().__init__(*args, **kwargs)

    subprocess.Popen = _QuietPopen

from openbachelorc.adb import kill_adb_server
from openbachelorc.config import config
from openbachelorc.inject import start_game
from openbachelorc.pc_const import AK_EXE_FILEPATH_TXT_FILEPATH
from openbachelorc.util import invoke_callback_func

# line-buffered UTF-8 stdout/stderr so upstream prints (and the trainer panel)
# reach the launcher's log pump immediately, without console-codepage mojibake
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", line_buffering=True)
    except Exception:
        pass


def run_cmd(game, text):
    """Verbatim copy of upstream openbachelorc.main.run_cmd (the only change:
    command_lst is imported at call time instead of a module-level completer)."""
    from openbachelorc.main import command_lst

    cmd_arr = text.split()
    cmd_flag = True

    if cmd_arr[0] == "enable":
        cmd_arr = cmd_arr[1:]
    elif cmd_arr[0] == "disable":
        cmd_arr = cmd_arr[1:]
        cmd_flag = False

    if cmd_flag:
        cmd_prefix = "enable:"
    else:
        cmd_prefix = "disable:"

    for cmd in cmd_arr:
        if cmd == "all":
            for rel_cmd in command_lst:
                game.exec_trainer_command(f"{cmd_prefix}{rel_cmd}")
        else:
            game.exec_trainer_command(f"{cmd_prefix}{cmd}")


def main():
    cmd_file = Path(sys.argv[1]) if len(sys.argv) > 1 else None

    config["attach_pc"] = True  # == upstream `--attach_pc`

    print("info: ensuring that adb server is killed")
    kill_adb_server()

    print("info: starting pc game")
    subprocess.Popen(
        f'"{Path(AK_EXE_FILEPATH_TXT_FILEPATH).read_text(encoding="utf-8")}"',
        shell=True,
    )

    game = start_game(None)  # PC attach: gadget hooked, proxy configured
    print("info: game started")
    print("----------")

    if not cmd_file:
        print("bridge: no command file given — attach done, exiting")
        return

    # command-file loop: tail new lines (offset starts at EOF — commands
    # queued before the bridge started are ignored, same as a missed stdin)
    offset = cmd_file.stat().st_size if cmd_file.exists() else 0
    print(f"bridge: command file {cmd_file}")
    while True:
        try:
            size = cmd_file.stat().st_size
            if size > offset:
                with cmd_file.open("r", encoding="utf-8", errors="replace") as fh:
                    fh.seek(offset)
                    data = fh.read()
                    offset = fh.tell()
                for line in data.splitlines():
                    text = line.strip()
                    if not text:
                        continue
                    try:
                        if text.startswith("?"):
                            invoke_callback_func(text[1:])
                        elif text.startswith("!"):
                            game.exec_trainer_command(text[1:])
                        else:
                            run_cmd(game, text)
                    except BaseException as err:  # even SystemExit from upstream internals must not kill the trainer
                        print(f"error: {err}")
            elif size < offset:
                # file was truncated/cleared — jump to its start and replay
                offset = 0
        except FileNotFoundError:
            pass  # file may be recreated between polls; keep waiting
        time.sleep(0.3)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
