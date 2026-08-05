use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_sql::{Migration, MigrationKind};

mod ai;
mod export;
mod orchestrator;

/// Sticky ids are client-generated nanoids; reject anything else before the
/// id is embedded in a window label and webview URL.
fn is_valid_sticky_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 36
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Open (or focus) a floating sticky-note window for the given sticky id.
#[tauri::command]
async fn open_sticky(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if !is_valid_sticky_id(&id) {
        return Err("invalid sticky id".into());
    }
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
        Migration {
            version: 4,
            description: "add notified column to tasks",
            sql: include_str!("../migrations/0004_task_notified.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "enable fts5 secure-delete",
            sql: include_str!("../migrations/0005_fts_secure_delete.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add due_has_time column to tasks",
            sql: include_str!("../migrations/0006_task_due_time.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add description column to tasks",
            sql: include_str!("../migrations/0007_task_description.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add recur column to tasks",
            sql: include_str!("../migrations/0008_task_recur.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add day_marks table for the calendar",
            sql: include_str!("../migrations/0009_day_marks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add memories table for persistent AI context",
            sql: include_str!("../migrations/0010_memories.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add workers table for orchestration sessions",
            sql: include_str!("../migrations/0011_workers.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add board_items table for the unified board",
            sql: include_str!("../migrations/0012_board.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add notifications table for the in-app feed",
            sql: include_str!("../migrations/0013_notifications.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "add depends_on to workers for queued dependencies",
            sql: include_str!("../migrations/0014_worker_depends_on.sql"),
            kind: MigrationKind::Up,
        },
    ];

    // Versions must be unique and ascending. A duplicate or out-of-order one
    // silently skips a migration at startup, and the symptom — a missing
    // column, much later — points nowhere near the cause.
    debug_assert!(
        migrations.windows(2).all(|w| w[0].version < w[1].version),
        "migrations must be registered in ascending, unique version order"
    );

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:thinkstack.db", migrations)
                .build(),
        );

    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
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
        .manage(orchestrator::Orchestrator::default())
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
            show_main,
            ai::ai_set_key,
            ai::ai_has_key,
            ai::ai_clear_key,
            ai::ai_complete,
            orchestrator::orch_check_env,
            orchestrator::orch_repo_label,
            orchestrator::orch_list_work,
            orchestrator::orch_spawn,
            orchestrator::orch_stop,
            orchestrator::orch_diff,
            orchestrator::orch_changed_files,
            orchestrator::orch_approve,
            orchestrator::orch_discard,
            export::export_write_file,
            export::export_write_bundle,
            export::import_read_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
