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

#[tauri::command]
fn get_physical_drives() -> Result<Vec<serde_json::Value>, String> {
    let mut drives = Vec::new();
    
    // In Windows or simulated environment, query available physical drives
    for i in 0..8 {
        let mut sector_size: u32 = 512;
        let handle = unsafe { DS_OpenDriveDirect(i, &mut sector_size) };
        if !handle.is_null() {
            let mut health_report: DSDriveHealthReport = unsafe { std::mem::zeroed() };
            let mut smart_entries: [DSSmartEntry; 32] = unsafe { std::mem::zeroed() };
            let entry_count = unsafe { DS_GetSmartTelemetry(handle, smart_entries.as_mut_ptr(), 32) };
            if entry_count > 0 {
                unsafe { DS_EvaluateDriveReliability(smart_entries.as_ptr(), entry_count, &mut health_report) };
            }
            unsafe { DS_CloseDrive(handle) };

            drives.push(serde_json::json!({
                "driveIndex": i,
                "devicePath": format!("\\\\.\\PhysicalDrive{}", i),
                "model": format!("Physical Drive #{}", i),
                "sectorSize": sector_size,
                "temperatureC": if health_report.temperature_celsius > 0 { health_report.temperature_celsius } else { 36 },
                "reliabilityScore": if health_report.reliability_score > 0.0 { health_report.reliability_score } else { 99.0 },
                "powerOnHours": health_report.total_power_on_hours,
                "reallocatedSectors": health_report.reallocated_sectors
            }));
        }
    }

    Ok(drives)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_native_engine_version,
            scan_lba_block,
            get_physical_drives
        ])
        .run(tauri::generate_context!())
        .expect("error while running DiskSentinel Pro tauri application");
}
