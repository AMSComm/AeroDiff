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
            close_diff_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running AeroDiff application");
}
