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
        .invoke_handler(tauri::generate_handler![
            compare_text,
            compare_files,
            merge_chunk,
            read_file,
            save_file,
            compare_folders_cmd,
            compare_csv_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running AeroDiff application");
}
