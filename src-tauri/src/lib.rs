pub mod commands;
pub mod csv;
pub mod diff;
pub mod folder;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::{Emitter, Manager};
            let paths: Vec<String> = args.into_iter().skip(1).collect();
            let _ = app.emit("cli-open-files", paths);
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            compare_text,
            compare_files,
            merge_chunk,
            read_file,
            save_file,
            check_path,
            compare_folders_cmd,
            compare_csv_cmd,
            get_diff_slice,
            close_diff_session,
            get_cli_args
        ])
        .build(tauri::generate_context!())
        .expect("error while running AeroDiff application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                use tauri::Emitter;
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                let _ = app_handle.emit("cli-open-files", paths);
            }
            let _ = (&app_handle, &event);
        });
}
