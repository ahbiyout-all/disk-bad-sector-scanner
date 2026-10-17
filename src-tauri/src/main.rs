// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use disksentinel_core::*;

#[tauri::command]
fn get_native_engine_version() -> String {
    "4.5.0".to_string()
}

#[tauri::command]
fn scan_lba_block(drive_index: u32, lba: u64, sector_count: u64) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut result: DSBlockResult = unsafe { std::mem::zeroed() };
    let ok = unsafe { DS_ScanLbaBlock(handle, lba, sector_count, &mut result) };
    unsafe { DS_CloseDrive(handle) };

    if !ok {
        return Err("Scan operation returned failure".to_string());
    }

    Ok(serde_json::json!({
        "startLba": result.start_lba,
        "sectorCount": result.sector_count,
        "latencyMs": result.latency_ms,
        "statusCode": result.status_code,
        "win32ErrorCode": result.win32_error_code
    }))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_native_engine_version,
            scan_lba_block
        ])
        .run(tauri::generate_context!())
        .expect("error while running DiskSentinel Pro tauri application");
}
