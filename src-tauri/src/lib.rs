// Bachelor:Re — Tauri 2 shell. The heavy lifting lives in the Node ui-server
// (server/ui-server.js); this desktop shell simply hosts the same React UI and
// talks to the local ui-server over http://127.0.0.1:5178 (see ui/src/lib/api.ts).
// Window controls use the core window plugin (see capabilities).
//
// The shell also starts the ui-server ITSELF, hidden (CREATE_NO_WINDOW) — no
// empty cmd window — and takes it down again when the main window closes.
// If something is already listening on :5178 (e.g. `npm run ui`), it reuses
// that instance and never kills it.

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const UI_PORT: u16 = 5178;

struct ServerPid(Mutex<Option<u32>>);

fn port_open() -> bool {
    TcpStream::connect(("127.0.0.1", UI_PORT)).is_ok()
}

/// Locate the backend for spawning the ui-server.
/// Installed layout: <exe_dir>\backend\server\ui-server.js (shipped as resources).
/// Dev layout: walk up from the exe folder until a folder containing
/// server/ui-server.js is found (src-tauri/target/release → repo root is 3 up).
/// Returns the folder the node cwd should be (backend dir or repo root).
fn find_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir: PathBuf = exe.parent()?.to_path_buf();

    // installed-first: the backend tree sits next to the exe under "backend"
    let backend = dir.join("backend");
    if backend.join("server").join("ui-server.js").is_file() {
        return Some(backend);
    }

    for _ in 0..6 {
        if dir.join("server").join("ui-server.js").is_file() {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

/// node.exe next to the exe → %ProgramFiles%\nodejs → whatever PATH resolves.
fn find_node() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let c = dir.join("node.exe");
            if c.is_file() {
                return c;
            }
        }
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        let c = PathBuf::from(pf).join("nodejs").join("node.exe");
        if c.is_file() {
            return c;
        }
    }
    PathBuf::from("node.exe")
}

fn kill_spawned(app: &tauri::AppHandle) {
    let pid = app.state::<ServerPid>().0.lock().unwrap().take();
    if let Some(pid) = pid {
        let mut k = Command::new("taskkill");
        k.args(["/PID", &pid.to_string(), "/T", "/F"]);
        #[cfg(windows)]
        k.creation_flags(CREATE_NO_WINDOW);
        let _ = k.output();
    }
}

fn spawn_ui_server(app: &tauri::App) {
    if port_open() {
        // reuse the existing ui-server (manual `npm run ui`, dev instance…).
        // We did not spawn it, so we must not kill it on exit either.
        return;
    }
    let root = match find_root() {
        Some(r) => r,
        None => {
            eprintln!("BachelorRe: server/ui-server.js not found near the exe — start it manually with `npm run ui`");
            return;
        }
    };
    let node = find_node();
    let mut cmd = Command::new(node);
    cmd.arg("server/ui-server.js").current_dir(&root);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    match cmd.spawn() {
        Ok(child) => {
            app.state::<ServerPid>().0.lock().unwrap().replace(child.id());
        }
        Err(e) => eprintln!("BachelorRe: failed to start the ui-server: {e}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // MUST be first: a second exe launch just reveals the first window
        // (possibly hidden in the tray) instead of starting a parallel instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .manage(ServerPid(Mutex::new(None)))
        .setup(|app| {
            spawn_ui_server(app);
            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // "Minimize to tray on close" (Settings): don't actually close — hide the
            // window and keep the ui-server (and any game) running. Tray Quit exits.
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if tray_on_close_enabled() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            tauri::WindowEvent::Destroyed => kill_spawned(window.app_handle()),
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building Bachelor:Re")
        .run(|app, event| {
            // every exit path must take the spawned ui-server down with it —
            // WindowEvent::Destroyed misses some (force-quit, app-level exit)
            if matches!(event, tauri::RunEvent::Exit { .. }) {
                kill_spawned(app);
            }
        });
}

/// Un-hide / focus the main window (tray click, menu Open, second exe launch).
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// System tray icon with Open / Quit. Open reveals the window (it may be hidden
/// in the tray); Quit exits the app and takes the spawned ui-server along.
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let open = MenuItem::with_id(app, "open", "Open Bachelor:Re", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit (stops launcher server + game)", true, None::<&str>)?;
    let menu = MenuBuilder::new(app).items(&[&open, &quit]).build()?;

    let mut tray = TrayIconBuilder::with_id("bachelor-re-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Bachelor:Re")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // left click anywhere on the icon = bring the window back
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

/// Read "MinimizeToTrayOnClose" from the root launcher-settings.json.
/// Missing file / key defaults to true — matching the Settings UI default.
fn tray_on_close_enabled() -> bool {
    let root = match find_root() {
        Some(r) => r,
        None => return true,
    };
    let path = root.join("launcher-settings.json");
    let raw = match std::fs::read_to_string(path) {
        Ok(r) => r,
        Err(_) => return true,
    };
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(value) => value
            .get("MinimizeToTrayOnClose")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        Err(_) => true,
    }
}
