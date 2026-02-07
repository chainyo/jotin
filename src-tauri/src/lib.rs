use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use uuid::Uuid;

const MAIN_WINDOW_LABEL: &str = "main";
const CAPTURE_WINDOW_LABEL: &str = "capture";
const NOTES_FILE_NAME: &str = "notes.json";
const NOTES_CHANGED_EVENT: &str = "notes-changed";
const CAPTURE_OPENED_EVENT: &str = "capture-opened";
const CAPTURE_WINDOW_WIDTH: f64 = 900.0;
const CAPTURE_WINDOW_HEIGHT: f64 = 76.0;
const APP_ICON: tauri::image::Image<'_> = tauri::include_image!("./icons/32x32.png");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct Note {
    id: String,
    text: String,
    created_at: String,
    updated_at: Option<String>,
}

#[derive(Default)]
struct StorageState {
    write_lock: Mutex<()>,
}

#[tauri::command]
fn create_note(app: AppHandle, state: State<'_, StorageState>, text: String) -> Result<Note, String> {
    let note_text = text.trim();
    if note_text.is_empty() {
        return Err("Note text cannot be empty".to_string());
    }

    let _guard = state
        .write_lock
        .lock()
        .map_err(|_| "Storage lock was poisoned".to_string())?;

    let path = resolve_notes_path(&app)?;
    let mut notes = load_notes_from_path(&path)?;

    let note = Note {
        id: Uuid::new_v4().to_string(),
        text: note_text.to_string(),
        created_at: Utc::now().to_rfc3339(),
        updated_at: None,
    };

    notes.push(note.clone());
    save_notes_to_path(&path, &notes)?;

    let _ = app.emit(NOTES_CHANGED_EVENT, ());
    Ok(note)
}

#[tauri::command]
fn list_notes(app: AppHandle, state: State<'_, StorageState>) -> Result<Vec<Note>, String> {
    let _guard = state
        .write_lock
        .lock()
        .map_err(|_| "Storage lock was poisoned".to_string())?;

    let path = resolve_notes_path(&app)?;
    let mut notes = load_notes_from_path(&path)?;
    notes.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(notes)
}

#[tauri::command]
fn delete_note(app: AppHandle, state: State<'_, StorageState>, id: String) -> Result<(), String> {
    let _guard = state
        .write_lock
        .lock()
        .map_err(|_| "Storage lock was poisoned".to_string())?;

    let path = resolve_notes_path(&app)?;
    let mut notes = load_notes_from_path(&path)?;
    let before = notes.len();
    notes.retain(|note| note.id != id);

    if notes.len() == before {
        return Err("Note not found".to_string());
    }

    save_notes_to_path(&path, &notes)?;
    let _ = app.emit(NOTES_CHANGED_EVENT, ());
    Ok(())
}

#[tauri::command]
fn open_quick_capture(app: AppHandle) {
    show_capture_window(&app);
}

#[tauri::command]
fn close_quick_capture(app: AppHandle) {
    hide_capture_window(&app);
}

#[tauri::command]
fn copy_note_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {e}"))?;
    clipboard
        .set_text(text)
        .map_err(|e| format!("Failed to copy note: {e}"))
}

fn resolve_notes_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {e}"))?;

    Ok(app_data_dir.join(NOTES_FILE_NAME))
}

fn load_notes_from_path(path: &Path) -> Result<Vec<Note>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(path).map_err(|e| format!("Failed to read notes file: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str::<Vec<Note>>(&raw).map_err(|e| format!("Failed to parse notes file: {e}"))
}

fn save_notes_to_path(path: &Path, notes: &[Note]) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(notes)
        .map_err(|e| format!("Failed to serialize notes payload: {e}"))?;

    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, payload).map_err(|e| format!("Failed to write temp notes file: {e}"))?;

    match fs::rename(&temp_path, path) {
        Ok(()) => Ok(()),
        Err(rename_error) => match fs::copy(&temp_path, path) {
            Ok(_) => {
                if let Err(cleanup_error) = fs::remove_file(&temp_path) {
                    eprintln!(
                        "Saved notes via copy fallback, but failed to remove temp file: {cleanup_error}"
                    );
                }
                Ok(())
            }
            Err(copy_error) => Err(format!(
                "Failed to finalize notes file. rename error: {rename_error}; copy error: {copy_error}"
            )),
        },
            }
}

fn app_icon_image() -> Option<tauri::image::Image<'static>> {
    Some(APP_ICON.clone().to_owned())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Some(icon) = app_icon_image() {
            let _ = window.set_icon(icon);
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_capture_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(CAPTURE_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

fn position_capture_window_near_cursor(app: &AppHandle, window: &tauri::WebviewWindow) {
    let Ok(cursor) = app.cursor_position() else {
        let _ = window.center();
        return;
    };

    let size = window.outer_size().ok();
    let window_width = size
        .map(|s| f64::from(s.width))
        .unwrap_or(CAPTURE_WINDOW_WIDTH);
    let window_height = size
        .map(|s| f64::from(s.height))
        .unwrap_or(CAPTURE_WINDOW_HEIGHT);

    let mut x = cursor.x + 14.0;
    let mut y = cursor.y + 14.0;

    if let Ok(monitors) = app.available_monitors() {
        if let Some(monitor) = monitors.iter().find(|monitor| {
            let area = monitor.work_area();
            let left = f64::from(area.position.x);
            let top = f64::from(area.position.y);
            let right = left + f64::from(area.size.width);
            let bottom = top + f64::from(area.size.height);

            cursor.x >= left && cursor.x < right && cursor.y >= top && cursor.y < bottom
        }) {
            let area = monitor.work_area();
            let left = f64::from(area.position.x);
            let top = f64::from(area.position.y);
            let right = left + f64::from(area.size.width);
            let bottom = top + f64::from(area.size.height);

            let max_x = right - window_width;
            let max_y = bottom - window_height;

            x = if max_x < left {
                left
            } else {
                x.clamp(left, max_x)
            };
            y = if max_y < top { top } else { y.clamp(top, max_y) };
        }
    }

    let _ = window.set_position(tauri::PhysicalPosition::new(
        x.round() as i32,
        y.round() as i32,
    ));
}

fn show_capture_window(app: &AppHandle) {
    let window = if let Some(window) = app.get_webview_window(CAPTURE_WINDOW_LABEL) {
        window
    } else {
        let created = match WebviewWindowBuilder::new(
            app,
            CAPTURE_WINDOW_LABEL,
            WebviewUrl::App("index.html#/capture".into()),
        )
        .title("Quick Capture")
        .inner_size(CAPTURE_WINDOW_WIDTH, CAPTURE_WINDOW_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .background_color(tauri::utils::config::Color(0, 0, 0, 0))
        .skip_taskbar(true)
        .always_on_top(true)
        .build()
        {
            Ok(window) => window,
            Err(error) => {
                eprintln!("Failed to create capture window: {error}");
                return;
            }
        };

        if let Some(icon) = app_icon_image() {
            let _ = created.set_icon(icon);
        }

        let capture = created.clone();
        created.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = capture.hide();
            }
        });

        created
    };

    position_capture_window_near_cursor(app, &window);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.emit(CAPTURE_OPENED_EVENT, ());
}

fn setup_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let new_note = MenuItemBuilder::with_id("new_note", "New Note").build(app)?;
    let open_notes = MenuItemBuilder::with_id("open_notes", "Open Notes").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&new_note)
        .item(&open_notes)
        .separator()
        .item(&quit)
        .build()?;

    let mut tray = TrayIconBuilder::with_id("jotin-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "new_note" => show_capture_window(app),
            "open_notes" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app_icon_image() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;

    Ok(())
}

fn setup_global_shortcut(app: &AppHandle) -> tauri::Result<()> {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyN);

    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                show_capture_window(app);
            }
        })
        .map_err(|e| {
            tauri::Error::from(std::io::Error::other(format!(
                "Failed to register global shortcut: {e}"
            )))
        })
}

fn setup_main_window_behavior(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let main_window = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = main_window.hide();
            }
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(StorageState::default())
        .setup(|app| {
            setup_tray(app.handle())?;
            setup_main_window_behavior(app.handle());
            setup_global_shortcut(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_note,
            list_notes,
            delete_note,
            open_quick_capture,
            close_quick_capture,
            copy_note_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
