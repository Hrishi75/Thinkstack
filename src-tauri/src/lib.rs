use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Open (or focus) a floating sticky-note window for the given sticky id.
#[tauri::command]
async fn open_sticky(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let label = format!("sticky-{id}");
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("index.html?window=sticky&id={id}").into()),
    )
    .title("Sticky")
    .inner_size(280.0, 280.0)
    .min_inner_size(180.0, 160.0)
    .always_on_top(true)
    .decorations(false)
    .transparent(true)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Toggle the centered quick-capture window.
#[tauri::command]
async fn toggle_quick_capture(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("quick-capture") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(
        &app,
        "quick-capture",
        WebviewUrl::App("index.html?window=capture".into()),
    )
    .title("Quick Capture")
    .inner_size(560.0, 140.0)
    .always_on_top(true)
    .decorations(false)
    .transparent(true)
    .resizable(false)
    .center()
    .skip_taskbar(true)
    .build()
    .map_err(|e| e.to_string())?;
    let _ = win.set_focus();
    Ok(())
}

/// Show and focus the main application window.
#[tauri::command]
fn show_main(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create core tables and fts",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add pinned column to notes",
            sql: include_str!("../migrations/0002_note_pinned.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add tags and note_tags tables",
            sql: include_str!("../migrations/0003_tags.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:thinkstack.db", migrations)
                .build(),
        );

    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{Modifiers, Code, ShortcutState};
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Cmd+Shift+Space → toggle quick capture from anywhere.
                    if event.state() == ShortcutState::Pressed
                        && shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::Space)
                    {
                        let h = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = toggle_quick_capture(h).await;
                        });
                    }
                })
                .build(),
        );
    }

    builder
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
                let capture_shortcut =
                    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
                let _ = app.global_shortcut().register(capture_shortcut);
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_sticky,
            toggle_quick_capture,
            show_main
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
