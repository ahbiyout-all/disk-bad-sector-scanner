// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use disksentinel_core::*;

#[tauri::command]
fn get_native_engine_version() -> String {
    "4.6.0".to_string()
}

struct PooledDriveHandle {
    raw: *mut std::ffi::c_void,
    sector_size: u32,
}

// Win32 HANDLE inside DriveContext is strictly synchronized per-drive via Mutex.
unsafe impl Send for PooledDriveHandle {}

impl Drop for PooledDriveHandle {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            unsafe { DS_CloseDrive(self.raw) };
            self.raw = std::ptr::null_mut();
        }
    }
}

static DRIVE_HANDLE_POOL: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<u32, std::sync::Arc<std::sync::Mutex<PooledDriveHandle>>>>,
> = std::sync::OnceLock::new();

fn drive_handle_pool() -> &'static std::sync::Mutex<
    std::collections::HashMap<u32, std::sync::Arc<std::sync::Mutex<PooledDriveHandle>>>,
> {
    DRIVE_HANDLE_POOL.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

fn acquire_pooled_drive(drive_index: u32) -> Result<std::sync::Arc<std::sync::Mutex<PooledDriveHandle>>, String> {
    {
        if let Ok(map) = drive_handle_pool().lock() {
            if let Some(entry) = map.get(&drive_index) {
                return Ok(entry.clone());
            }
        }
    }

    let mut sector_size: u32 = 512;
    let raw = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if raw.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let arc = std::sync::Arc::new(std::sync::Mutex::new(PooledDriveHandle {
        raw,
        sector_size: sector_size.max(512),
    }));

    if let Ok(mut map) = drive_handle_pool().lock() {
        if let Some(existing) = map.get(&drive_index) {
            return Ok(existing.clone());
        }
        map.insert(drive_index, arc.clone());
    }

    Ok(arc)
}

fn invalidate_pooled_drive(drive_index: u32) {
    if let Ok(mut map) = drive_handle_pool().lock() {
        map.remove(&drive_index);
    }
}

#[inline]
fn is_stale_handle_win32_error(code: u32) -> bool {
    // ERROR_INVALID_HANDLE (6), ERROR_NOT_READY (21), ERROR_DEV_NOT_EXIST (55),
    // ERROR_NO_SUCH_DEVICE (433), ERROR_DEVICE_NOT_CONNECTED (1167)
    matches!(code, 6 | 21 | 55 | 433 | 1167)
}

fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    let mut i = 0;
    while i + 3 <= input.len() {
        let n = ((input[i] as u32) << 16) | ((input[i + 1] as u32) << 8) | (input[i + 2] as u32);
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
        out.push(TABLE[(n & 0x3F) as usize] as char);
        i += 3;
    }
    let rem = input.len() - i;
    if rem == 1 {
        let n = (input[i] as u32) << 16;
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rem == 2 {
        let n = ((input[i] as u32) << 16) | ((input[i + 1] as u32) << 8);
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
        out.push('=');
    }
    out
}

#[tauri::command]
fn read_raw_sector(drive_index: u32, lba: u64, size: u32) -> Result<Vec<u8>, String> {
    let pooled = acquire_pooled_drive(drive_index)?;
    let guard = pooled.lock().map_err(|_| "Drive handle mutex poisoned".to_string())?;
    let mut buffer = vec![0u8; size as usize];
    let mut bytes_read: u32 = 0;
    let mut w32_err: u32 = 0;
    let ok = unsafe {
        DS_ReadRawSectorWithError(
            guard.raw,
            lba,
            buffer.as_mut_ptr(),
            size,
            &mut bytes_read,
            &mut w32_err,
        )
    };

    if !ok {
        drop(guard);
        if is_stale_handle_win32_error(w32_err) {
            invalidate_pooled_drive(drive_index);
        }
        return Err(format!("Read operation returned failure (Win32 error {})", w32_err));
    }

    Ok(buffer)
}

#[tauri::command]
fn scan_lba_block(drive_index: u32, lba: u64, sector_count: u64) -> Result<serde_json::Value, String> {
    let pooled = acquire_pooled_drive(drive_index)?;
    let guard = pooled.lock().map_err(|_| "Drive handle mutex poisoned".to_string())?;

    let mut total_latency_ms = 0.0;
    let mut final_result: DSBlockResult = unsafe { std::mem::zeroed() };
    let mut remaining = sector_count.max(1);
    let mut current_lba = lba;
    let mut all_ok = true;

    while remaining > 0 {
        let chunk = remaining.min(u32::MAX as u64) as u32;
        let mut chunk_res: DSBlockResult = unsafe { std::mem::zeroed() };
        let ok = unsafe { DS_ScanLbaBlock(guard.raw, current_lba, chunk, &mut chunk_res) };
        total_latency_ms += chunk_res.latency_ms;
        final_result = chunk_res;
        if !ok {
            all_ok = false;
            break;
        }
        current_lba = current_lba.saturating_add(chunk as u64);
        remaining -= chunk as u64;
    }

    drop(guard);
    if !all_ok && is_stale_handle_win32_error(final_result.win32_error_code) {
        invalidate_pooled_drive(drive_index);
    }

    if !all_ok && final_result.status_code == 0 && final_result.win32_error_code == 0 {
        return Err("Scan operation returned failure".to_string());
    }

    Ok(serde_json::json!({
        "startLba": lba,
        "sectorCount": sector_count,
        "latencyMs": total_latency_ms,
        "statusCode": final_result.status_code,
        "win32ErrorCode": final_result.win32_error_code
    }))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchScanItem {
    block_id: usize,
    lba: u64,
    sector_count: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchScanItemResult {
    block_id: usize,
    start_lba: u64,
    sector_count: u64,
    latency_ms: f64,
    status_code: u32,
    win32_error_code: u32,
}

#[tauri::command]
fn scan_lba_batch(
    drive_index: u32,
    items: Vec<BatchScanItem>,
    verify_mode: bool,
) -> Result<Vec<BatchScanItemResult>, String> {
    if items.is_empty() {
        return Ok(Vec::new());
    }

    let pooled = acquire_pooled_drive(drive_index)?;
    let guard = pooled.lock().map_err(|_| "Drive handle mutex poisoned".to_string())?;
    let mut results = Vec::with_capacity(items.len().min(128));

    let mut stale_detected = false;
    for item in items.into_iter().take(128) {
        let mut total_latency_ms = 0.0;
        let mut final_result: DSBlockResult = unsafe { std::mem::zeroed() };
        let mut remaining = item.sector_count.max(1);
        let mut current_lba = item.lba;

        while remaining > 0 {
            let chunk = remaining.min(u32::MAX as u64) as u32;
            let mut chunk_res: DSBlockResult = unsafe { std::mem::zeroed() };
            let ok = if verify_mode {
                unsafe { DS_VerifyLbaBlock(guard.raw, current_lba, chunk, &mut chunk_res) }
            } else {
                unsafe { DS_ScanLbaBlock(guard.raw, current_lba, chunk, &mut chunk_res) }
            };
            total_latency_ms += chunk_res.latency_ms;
            final_result = chunk_res;
            if !ok {
                if is_stale_handle_win32_error(final_result.win32_error_code) {
                    stale_detected = true;
                }
                break;
            }
            current_lba = current_lba.saturating_add(chunk as u64);
            remaining -= chunk as u64;
        }

        results.push(BatchScanItemResult {
            block_id: item.block_id,
            start_lba: item.lba,
            sector_count: item.sector_count,
            latency_ms: total_latency_ms,
            status_code: final_result.status_code,
            win32_error_code: final_result.win32_error_code,
        });
    }

    drop(guard);
    if stale_detected {
        invalidate_pooled_drive(drive_index);
    }

    Ok(results)
}

#[tauri::command]
fn attempt_sector_repair(drive_index: u32, lba: u64, count: u32) -> Result<serde_json::Value, String> {
    invalidate_pooled_drive(drive_index);
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut recovered_status: u32 = 0;
    let ok = unsafe { DS_AttemptSoftSectorRepair(handle, lba, count, &mut recovered_status) };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "recoveredStatus": recovered_status
    }))
}

#[derive(Clone)]
struct VolumePartitionInfo {
    drive_letter: String,
    label: String,
    filesystem: String,
    total_bytes: u64,
    free_bytes: u64,
    used_bytes: u64,
}

// Reverse mapping of Windows drive letters (C:, D:, E:, etc.) to PhysicalDrive index with real space/FS stats
fn get_volume_mappings() -> std::collections::HashMap<u32, Vec<VolumePartitionInfo>> {
    let mut map: std::collections::HashMap<u32, Vec<VolumePartitionInfo>> = std::collections::HashMap::new();

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::Storage::FileSystem::{
            CreateFileW, GetDiskFreeSpaceExW, GetVolumeInformationW,
            FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_SHARE_DELETE, OPEN_EXISTING,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        const IOCTL_STORAGE_GET_DEVICE_NUMBER: u32 = 0x002D1080;

        #[repr(C)]
        struct StorageDeviceNumber {
            device_type: u32,
            device_number: u32,
            partition_number: u32,
        }

        for letter in b'A'..=b'Z' {
            let path_str = format!("\\\\.\\{}:\0", letter as char);
            let wide: Vec<u16> = path_str.encode_utf16().collect();
            let handle = unsafe {
                CreateFileW(
                    wide.as_ptr(),
                    0, // Query access only (avoids locking issues)
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    0,
                    0,
                )
            };

            if handle != INVALID_HANDLE_VALUE {
                let mut sdn: StorageDeviceNumber = unsafe { std::mem::zeroed() };
                let mut bytes_returned: u32 = 0;
                let ok = unsafe {
                    DeviceIoControl(
                        handle as _,
                        IOCTL_STORAGE_GET_DEVICE_NUMBER,
                        std::ptr::null(),
                        0,
                        &mut sdn as *mut _ as _,
                        std::mem::size_of::<StorageDeviceNumber>() as u32,
                        &mut bytes_returned,
                        std::ptr::null_mut(),
                    )
                };
                unsafe { CloseHandle(handle) };

                if ok != 0 {
                    let drive_letter = format!("{}:", letter as char);
                    let root_str = format!("{}:\\\0", letter as char);
                    let root_wide: Vec<u16> = root_str.encode_utf16().collect();

                    let mut avail_to_caller: u64 = 0;
                    let mut total_bytes: u64 = 0;
                    let mut free_bytes: u64 = 0;
                    unsafe {
                        GetDiskFreeSpaceExW(
                            root_wide.as_ptr(),
                            &mut avail_to_caller,
                            &mut total_bytes,
                            &mut free_bytes,
                        );
                    }

                    let mut vol_name_buf = [0u16; 260];
                    let mut fs_name_buf = [0u16; 260];
                    let vol_ok = unsafe {
                        GetVolumeInformationW(
                            root_wide.as_ptr(),
                            vol_name_buf.as_mut_ptr(),
                            vol_name_buf.len() as u32,
                            std::ptr::null_mut(),
                            std::ptr::null_mut(),
                            std::ptr::null_mut(),
                            fs_name_buf.as_mut_ptr(),
                            fs_name_buf.len() as u32,
                        )
                    };

                    let utf16_to_string = |buf: &[u16]| -> String {
                        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                        String::from_utf16_lossy(&buf[..end]).trim().to_string()
                    };

                    let label = if vol_ok != 0 { utf16_to_string(&vol_name_buf) } else { String::new() };
                    let filesystem = if vol_ok != 0 { utf16_to_string(&fs_name_buf) } else { String::new() };
                    let used_bytes = total_bytes.saturating_sub(free_bytes);

                    map.entry(sdn.device_number).or_default().push(VolumePartitionInfo {
                        drive_letter,
                        label,
                        filesystem,
                        total_bytes,
                        free_bytes,
                        used_bytes,
                    });
                }
            }
        }
    }

    map
}

#[tauri::command]
fn get_physical_drives() -> Result<Vec<serde_json::Value>, String> {
    let mut drives = Vec::new();
    let volume_map = get_volume_mappings();

    // Windows IOCTL 32 PhysicalDrive exhaustive search (PhysicalDrive0 to PhysicalDrive31)
    for i in 0..32 {
        let mut sector_size: u32 = 512;
        let handle = unsafe { DS_OpenDriveDirect(i, &mut sector_size) };
        if !handle.is_null() {
            let mut detail: DSPhysicalDriveDetail = unsafe { std::mem::zeroed() };
            let mut health_report: DSDriveHealthReport = unsafe { std::mem::zeroed() };
            let mut smart_entries: [DSSmartEntry; 64] = unsafe { std::mem::zeroed() };

            unsafe { DS_GetDriveDetails(handle, &mut detail) };
            let entry_count = unsafe { DS_GetSmartTelemetry(handle, smart_entries.as_mut_ptr(), 64) };
            let has_reliability = if entry_count > 0 {
                unsafe { DS_EvaluateDriveReliability(smart_entries.as_ptr(), entry_count, &mut health_report) }
            } else {
                false
            };

            let bus = String::from_utf8_lossy(&detail.bus_type).trim_matches(char::from(0)).to_string();
            let mut nvme_log: DSNvmeHealthLog = unsafe { std::mem::zeroed() };
            let has_nvme_log = if detail.is_ssd && bus == "NVMe" {
                unsafe { DS_GetNvmeDeepTelemetry(handle, &mut nvme_log) }
            } else {
                false
            };

            // Close handle after all telemetry is gathered
            unsafe { DS_CloseDrive(handle) };

            let model = String::from_utf8_lossy(&detail.model).trim_matches(char::from(0)).to_string();
            let serial = String::from_utf8_lossy(&detail.serial_number).trim_matches(char::from(0)).to_string();
            let firmware = String::from_utf8_lossy(&detail.firmware_rev).trim_matches(char::from(0)).to_string();
            let path = String::from_utf8_lossy(&detail.device_path).trim_matches(char::from(0)).to_string();

            let vol_infos = volume_map.get(&i).cloned().unwrap_or_default();
            let mount_points: Vec<String> = vol_infos.iter().map(|v| v.drive_letter.clone()).collect();
            let partitions_json: Vec<serde_json::Value> = vol_infos.iter().map(|v| {
                let gb = 1024.0 * 1024.0 * 1024.0;
                serde_json::json!({
                    "driveLetter": v.drive_letter,
                    "label": v.label,
                    "filesystem": v.filesystem,
                    "totalBytes": v.total_bytes,
                    "freeBytes": v.free_bytes,
                    "usedBytes": v.used_bytes,
                    "totalGb": (v.total_bytes as f64 / gb).round() as u64,
                    "usedGb": (v.used_bytes as f64 / gb).round() as u64
                })
            }).collect();

            let is_sd_or_mmc = bus.eq_ignore_ascii_case("SD") || bus.eq_ignore_ascii_case("MMC");
            let is_external = bus.eq_ignore_ascii_case("USB") || bus.to_lowercase().contains("usb") || is_sd_or_mmc;
            let connection_type = if is_sd_or_mmc { "sd_card" } else if is_external { "usb" } else { "internal" };

            let resolved_temp: Option<u32> = if has_nvme_log && nvme_log.temperature_celsius > 0 {
                Some(nvme_log.temperature_celsius as u32)
            } else if detail.temperature_celsius > 0 {
                Some(detail.temperature_celsius)
            } else if has_reliability && health_report.temperature_celsius > 0 {
                Some(health_report.temperature_celsius)
            } else {
                None
            };

            let resolved_reliability: Option<f64> = if has_nvme_log {
                let mut nvme_score = 100.0 - (nvme_log.percentage_used as f64).min(90.0);
                if nvme_log.media_errors > 0 {
                    nvme_score -= ((nvme_log.media_errors as f64) * 10.0).min(45.0);
                }
                if nvme_log.available_spare < nvme_log.available_spare_threshold {
                    nvme_score -= 25.0;
                }
                Some(nvme_score.clamp(0.0, 100.0))
            } else if has_reliability {
                Some(health_report.reliability_score)
            } else {
                None
            };

            let has_poh_smart = (0..(entry_count.max(0) as usize)).any(|j| smart_entries[j].attribute_id == 0x09);
            let resolved_poh: Option<u64> = if has_nvme_log {
                Some(nvme_log.power_on_hours)
            } else if has_poh_smart {
                Some(health_report.total_power_on_hours as u64)
            } else {
                None
            };

            drives.push(serde_json::json!({
                "driveIndex": i,
                "devicePath": path,
                "model": model,
                "serialNumber": serial,
                "firmware": firmware,
                "busType": bus,
                "isSsd": detail.is_ssd,
                "isTrimSupported": detail.is_trim_supported,
                "isExternal": is_external,
                "connectionType": connection_type,
                "mountPoints": mount_points,
                "partitions": partitions_json,
                "totalCapacityBytes": detail.total_capacity_bytes,
                "totalCapacityGb": detail.total_capacity_bytes / (1024 * 1024 * 1024),
                "sectorSize": detail.sector_size,
                "physicalSectorSize": detail.physical_sector_size,
                "temperatureC": resolved_temp,
                "reliabilityScore": resolved_reliability,
                "powerOnHours": resolved_poh,
                "reallocatedSectors": health_report.reallocated_sectors,
                "nvmeTelemetry": if has_nvme_log {
                    Some(serde_json::json!({
                        "percentageUsed": nvme_log.percentage_used,
                        "dataUnitsReadTb": nvme_log.data_units_read_tb,
                        "dataUnitsWrittenTb": nvme_log.data_units_written_tb,
                        "hostReadCommands": nvme_log.host_read_commands,
                        "hostWriteCommands": nvme_log.host_write_commands,
                        "controllerBusyTimeMinutes": nvme_log.controller_busy_time_minutes,
                        "powerCycles": nvme_log.power_cycles,
                        "powerOnHours": nvme_log.power_on_hours,
                        "unsafeShutdowns": nvme_log.unsafe_shutdowns,
                        "mediaErrors": nvme_log.media_errors,
                        "numErrLogEntries": nvme_log.num_err_log_entries,
                        "availableSpare": nvme_log.available_spare,
                        "availableSpareThreshold": nvme_log.available_spare_threshold,
                        "criticalWarning": nvme_log.critical_warning
                    }))
                } else {
                    None
                },
                "smartAttributes": (0..(entry_count.max(0) as usize)).map(|j| {
                    let e = smart_entries[j];
                    serde_json::json!({
                        "id": e.attribute_id,
                        "name": String::from_utf8_lossy(&e.attribute_name).trim_matches(char::from(0)).to_string(),
                        "current": e.current_value,
                        "worst": e.worst_value,
                        "threshold": e.threshold_value,
                        "raw": format!("{}", e.raw_value),
                        "rawHex": format!("0x{:012X}", e.raw_value & 0xFFFFFFFFFFFF),
                        "status": if e.health_status == 0 { "good" } else if e.health_status == 1 { "warning" } else { "critical" }
                    })
                }).collect::<Vec<_>>()
            }));
        }
    }

    Ok(drives)
}

#[tauri::command]
fn scan_multiple_drives_parallel(targets: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>, String> {
    let mut native_targets = Vec::new();
    for t in targets {
        native_targets.push(DSMultiDriveScanTarget {
            drive_index: t["driveIndex"].as_u64().unwrap_or(0) as u32,
            start_lba: t["startLba"].as_u64().unwrap_or(0),
            sector_count: t["sectorCount"].as_u64().unwrap_or(0),
            burst_step: t["burstStep"].as_u64().unwrap_or(256) as u32,
        });
    }

    let mut summaries = vec![unsafe { std::mem::zeroed::<DSMultiDriveScanSummary>() }; native_targets.len()];
    let ok = unsafe {
        DS_ScanMultipleDrivesParallel(
            native_targets.as_ptr(),
            native_targets.len() as u32,
            summaries.as_mut_ptr(),
            0, // auto concurrency
        )
    };

    if !ok {
        return Err("Parallel scan failed".to_string());
    }

    let result = summaries.iter().map(|s| {
        serde_json::json!({
            "driveIndex": s.drive_index,
            "totalSectorsScanned": s.total_sectors_scanned,
            "badSectorsFound": s.bad_sectors_found,
            "elapsedMs": s.elapsed_ms,
            "avgLatencyMs": s.avg_latency_ms,
            "isCompleted": s.is_completed,
            "statusCode": s.status_code
        })
    }).collect();

    Ok(result)
}

#[tauri::command]
fn execute_bit_carving(drive_index: u32, lba: u64, cluster_span: u32) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut carved: DSCarvedSectorResult = unsafe { std::mem::zeroed() };
    let ok = unsafe { DS_ExecuteBitCarvingRecovery(handle, lba, cluster_span, &mut carved) };
    unsafe { DS_CloseDrive(handle) };

    if !ok {
        return Err("Raw sector read or bit carving failed".to_string());
    }

    let sig_name = String::from_utf8_lossy(&carved.signature_name)
        .trim_matches(char::from(0))
        .to_string();
    let hex_preview: Vec<u8> = carved.hex_preview.to_vec();

    Ok(serde_json::json!({
        "sourceLba": carved.source_lba,
        "signatureType": carved.signature_type,
        "signatureName": sig_name,
        "carvedSizeBytes": carved.carved_size_bytes,
        "eccRecoveredBits": carved.ecc_recovered_bits,
        "isSalvaged": carved.is_salvaged,
        "hexPreview": hex_preview
    }))
}

#[tauri::command]
fn run_tray_guardian_check(poll_interval_sec: u32, temp_threshold_c: u32, alert_on_pending_sector: bool) -> Result<serde_json::Value, String> {
    unsafe {
        DS_ConfigureTrayGuardian(poll_interval_sec, temp_threshold_c, alert_on_pending_sector);
    }
    let mut status: DSTrayGuardianStatus = unsafe { std::mem::zeroed() };
    let ok = unsafe { DS_RunTrayGuardianCheck(&mut status) };
    if !ok {
        return Err("Guardian poll failed".to_string());
    }
    let msg = String::from_utf8_lossy(&status.last_alert_message)
        .trim_matches(char::from(0))
        .to_string();

    Ok(serde_json::json!({
        "isMonitoringActive": status.is_monitoring_active,
        "pollIntervalSec": status.poll_interval_sec,
        "monitoredDriveCount": status.monitored_drive_count,
        "highestTempCelsius": if status.highest_temp_celsius > 0 { serde_json::json!(status.highest_temp_celsius) } else { serde_json::Value::Null },
        "criticalAlertTriggered": status.critical_alert_triggered,
        "warningDriveIndex": status.warning_drive_index,
        "lastAlertCode": status.last_alert_code,
        "lastAlertMessage": msg
    }))
}

#[tauri::command]
fn verify_lba_block(drive_index: u32, lba: u64, sector_count: u64) -> Result<serde_json::Value, String> {
    let pooled = acquire_pooled_drive(drive_index)?;
    let guard = pooled.lock().map_err(|_| "Drive handle mutex poisoned".to_string())?;

    let mut total_latency_ms = 0.0;
    let mut final_result: DSBlockResult = unsafe { std::mem::zeroed() };
    let mut remaining = sector_count.max(1);
    let mut current_lba = lba;
    let mut all_ok = true;

    while remaining > 0 {
        let chunk = remaining.min(u32::MAX as u64) as u32;
        let mut chunk_res: DSBlockResult = unsafe { std::mem::zeroed() };
        let ok = unsafe { DS_VerifyLbaBlock(guard.raw, current_lba, chunk, &mut chunk_res) };
        total_latency_ms += chunk_res.latency_ms;
        final_result = chunk_res;
        if !ok {
            all_ok = false;
            break;
        }
        current_lba = current_lba.saturating_add(chunk as u64);
        remaining -= chunk as u64;
    }

    drop(guard);
    if !all_ok && is_stale_handle_win32_error(final_result.win32_error_code) {
        invalidate_pooled_drive(drive_index);
    }

    if !all_ok && final_result.status_code == 0 && final_result.win32_error_code == 0 {
        return Err("Verify operation returned failure".to_string());
    }

    Ok(serde_json::json!({
        "startLba": lba,
        "sectorCount": sector_count,
        "latencyMs": total_latency_ms,
        "statusCode": final_result.status_code,
        "win32ErrorCode": final_result.win32_error_code
    }))
}

#[tauri::command]
fn run_smart_self_test(drive_index: u32, test_type: String) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let code: u32 = match test_type.as_str() {
        "short" => 1,
        "extended" => 2,
        "conveyance" => 3,
        "abort" => 127,
        _ => 1,
    };

    let ok = unsafe { DS_StartSmartSelfTest(handle, code) };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "supported": ok,
        "accepted": ok,
        "testType": test_type,
        "code": code,
        "executionCode": code,
        "statusText": if ok { format!("SMART {} self-test command accepted by controller", test_type) } else { "Controller rejected or does not support SMART self-test pass-through".to_string() }
    }))
}

#[tauri::command]
fn get_smart_self_test_status(drive_index: u32) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut exec_code: u32 = 0;
    let mut progress_pct: u32 = 0;
    let ok = unsafe { DS_GetSmartSelfTestStatus(handle, &mut exec_code, &mut progress_pct) };
    unsafe { DS_CloseDrive(handle) };

    if !ok {
        return Err("S.M.A.R.T. self-test status unsupported on this controller".to_string());
    }

    let nibble = (exec_code >> 4) & 0x0F;
    let in_progress = nibble == 0x0F;
    let status = if in_progress {
        "running"
    } else if nibble == 0x00 {
        "completed"
    } else if nibble == 0x01 {
        "aborted"
    } else {
        "failed"
    };

    Ok(serde_json::json!({
        "supported": true,
        "inProgress": in_progress,
        "executionCode": exec_code,
        "progressPct": progress_pct,
        "status": status,
        "statusText": format!("SMART Self-Test: {} ({}%)", status, progress_pct)
    }))
}

#[tauri::command]
fn poll_drive_temperatures(drive_indices: Option<Vec<u32>>) -> Result<Vec<serde_json::Value>, String> {
    let indices: Vec<u32> = match drive_indices {
        Some(list) if !list.is_empty() => list,
        _ => (0..32u32).collect(),
    };

    let mut temps = Vec::with_capacity(indices.len());
    for i in indices {
        let Ok(pooled) = acquire_pooled_drive(i) else {
            continue;
        };
        let Ok(guard) = pooled.lock() else {
            continue;
        };

        let mut detail: DSPhysicalDriveDetail = unsafe { std::mem::zeroed() };
        let detail_ok = unsafe { DS_GetDriveDetails(guard.raw, &mut detail) };
        let mut temp_c: Option<u32> = if detail.temperature_celsius > 0 && detail.temperature_celsius < 150 {
            Some(detail.temperature_celsius)
        } else {
            None
        };

        if temp_c.is_none() {
            let mut nvme_log: DSNvmeHealthLog = unsafe { std::mem::zeroed() };
            if unsafe { DS_GetNvmeDeepTelemetry(guard.raw, &mut nvme_log) }
                && nvme_log.temperature_celsius > 0
                && nvme_log.temperature_celsius < 150
            {
                temp_c = Some(nvme_log.temperature_celsius as u32);
            }
        }

        if temp_c.is_none() {
            let mut entries: [DSSmartEntry; 32] = unsafe { std::mem::zeroed() };
            let count = unsafe { DS_GetSmartTelemetry(guard.raw, entries.as_mut_ptr(), 32) };
            for j in 0..(count.max(0) as usize) {
                if entries[j].attribute_id == 0xC2 || entries[j].attribute_id == 0xBE {
                    let t = (entries[j].raw_value & 0xFF) as u32;
                    if t > 0 && t < 150 {
                        temp_c = Some(t);
                        break;
                    }
                }
            }
        }

        drop(guard);
        if !detail_ok && detail.total_capacity_bytes == 0 && temp_c.is_none() {
            invalidate_pooled_drive(i);
            continue;
        }

        temps.push(serde_json::json!({
            "driveIndex": i,
            "temperatureC": temp_c
        }));
    }
    Ok(temps)
}

#[tauri::command]
fn get_drive_identify_data(drive_index: u32) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut detail: DSPhysicalDriveDetail = unsafe { std::mem::zeroed() };
    unsafe { DS_GetDriveDetails(handle, &mut detail) };
    let bus = String::from_utf8_lossy(&detail.bus_type).trim_matches(char::from(0)).to_string();

    let mut ata_buf = [0u8; 512];
    let ata_ok = if bus != "NVMe" {
        unsafe { DS_AtaIdentifyDevice(handle, ata_buf.as_mut_ptr()) }
    } else {
        false
    };

    if ata_ok {
        unsafe { DS_CloseDrive(handle) };
        return Ok(serde_json::json!({
            "supported": true,
            "protocol": "ATA",
            "rawBytes": ata_buf.to_vec()
        }));
    }

    let mut nvme_buf = vec![0u8; 4096];
    let nvme_ok = unsafe { DS_GetNvmeIdentifyController(handle, nvme_buf.as_mut_ptr()) };
    unsafe { DS_CloseDrive(handle) };

    if nvme_ok {
        return Ok(serde_json::json!({
            "supported": true,
            "protocol": "NVMe",
            "rawBytes": nvme_buf[..512].to_vec()
        }));
    }

    Ok(serde_json::json!({
        "supported": false,
        "protocol": "UNSUPPORTED",
        "rawBytes": Vec::<u8>::new(),
        "reason": "컨트롤러 또는 브릿지 칩셋이 ATA/NVMe Identify 패스스루 명령을 지원하지 않습니다 (Windows 관리자 권한 필요)."
    }))
}

#[tauri::command]
fn get_drive_features(drive_index: u32) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut detail: DSPhysicalDriveDetail = unsafe { std::mem::zeroed() };
    unsafe { DS_GetDriveDetails(handle, &mut detail) };
    let bus = String::from_utf8_lossy(&detail.bus_type).trim_matches(char::from(0)).to_string();

    if bus == "NVMe" {
        unsafe { DS_CloseDrive(handle) };
        return Ok(serde_json::json!({
            "driveIndex": drive_index,
            "protocol": "NVMe",
            "isAtaPassthroughAvailable": false,
            "powerMode": "active_idle",
            "aamSupported": false,
            "aamEnabled": false,
            "aamCurrent": null,
            "aamRecommended": null,
            "apmSupported": false,
            "apmEnabled": false,
            "apmCurrent": null,
            "pmSupported": false,
            "writeCacheSupported": detail.is_write_cache_enabled,
            "writeCacheEnabled": detail.is_write_cache_enabled,
            "readLookAheadSupported": false,
            "readLookAheadEnabled": false,
            "reason": "NVMe PCIe 장치는 ATA AAM/APM/스핀다운 대신 자율 전원 상태 전환(APST)을 사용합니다."
        }));
    }

    let mut power_sc: u8 = 0;
    let pwr_ok = unsafe { DS_AtaCheckPowerMode(handle, &mut power_sc) };

    let mut id_buf = [0u8; 512];
    let id_ok = unsafe { DS_AtaIdentifyDevice(handle, id_buf.as_mut_ptr()) };
    unsafe { DS_CloseDrive(handle) };

    if !id_ok {
        return Ok(serde_json::json!({
            "driveIndex": drive_index,
            "protocol": "UNSUPPORTED",
            "isAtaPassthroughAvailable": false,
            "powerMode": "unknown",
            "aamSupported": false,
            "aamEnabled": false,
            "aamCurrent": null,
            "aamRecommended": null,
            "apmSupported": false,
            "apmEnabled": false,
            "apmCurrent": null,
            "pmSupported": false,
            "writeCacheSupported": detail.is_write_cache_enabled,
            "writeCacheEnabled": detail.is_write_cache_enabled,
            "readLookAheadSupported": false,
            "readLookAheadEnabled": false,
            "reason": "ATA Pass-Through IOCTL이 차단되었거나 USB 브릿지가 IDENTIFY DEVICE(0xEC)를 지원하지 않습니다."
        }));
    }

    let word = |w: usize| -> u16 {
        let idx = w * 2;
        u16::from_le_bytes([id_buf[idx], id_buf[idx + 1]])
    };

    let w82 = word(82);
    let w83 = word(83);
    let w85 = word(85);
    let w86 = word(86);
    let w91 = word(91);
    let w94 = word(94);

    let pm_supported = (w82 & (1 << 3)) != 0;
    let write_cache_supported = (w82 & (1 << 5)) != 0;
    let write_cache_enabled = (w85 & (1 << 5)) != 0;
    let read_look_ahead_supported = (w82 & (1 << 6)) != 0;
    let read_look_ahead_enabled = (w85 & (1 << 6)) != 0;

    let apm_supported = (w83 & (1 << 3)) != 0;
    let apm_enabled = (w86 & (1 << 3)) != 0;
    let apm_current = if apm_supported { Some((w91 & 0xFF) as u8) } else { None };

    let aam_supported = (w83 & (1 << 9)) != 0;
    let aam_enabled = (w86 & (1 << 9)) != 0;
    let aam_current = if aam_supported { Some((w94 & 0xFF) as u8) } else { None };
    let aam_recommended = if aam_supported { Some(((w94 >> 8) & 0xFF) as u8) } else { None };

    let power_mode = if !pwr_ok {
        "unknown"
    } else if power_sc == 0x00 || power_sc == 0x01 || power_sc == 0x40 || power_sc == 0x41 {
        "standby"
    } else if power_sc >= 0x80 {
        "active_idle"
    } else {
        "unknown"
    };

    Ok(serde_json::json!({
        "driveIndex": drive_index,
        "protocol": "ATA",
        "isAtaPassthroughAvailable": true,
        "powerMode": power_mode,
        "aamSupported": aam_supported,
        "aamEnabled": aam_enabled,
        "aamCurrent": aam_current,
        "aamRecommended": aam_recommended,
        "apmSupported": apm_supported,
        "apmEnabled": apm_enabled,
        "apmCurrent": apm_current,
        "pmSupported": pm_supported,
        "writeCacheSupported": write_cache_supported,
        "writeCacheEnabled": write_cache_enabled,
        "readLookAheadSupported": read_look_ahead_supported,
        "readLookAheadEnabled": read_look_ahead_enabled
    }))
}

#[tauri::command]
fn set_drive_aam(drive_index: u32, enable: bool, level: u8) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }
    let clamped = level.clamp(0x80, 0xFE);
    let subcmd = if enable { 0x42 } else { 0xC2 };
    let val = if enable { clamped } else { 0 };
    let ok = unsafe { DS_AtaSetFeature(handle, subcmd, val) };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "message": if ok {
            if enable { format!("AAM 소음 관리 레벨을 0x{:02X}({})로 설정했습니다.", clamped, clamped) }
            else { "AAM(자동 소음 관리) 기능을 비활성화했습니다.".to_string() }
        } else {
            "디스크 컨트롤러가 AAM SET FEATURES 명령을 거부했거나 지원하지 않습니다.".to_string()
        }
    }))
}

#[tauri::command]
fn set_drive_apm(drive_index: u32, enable: bool, level: u8) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }
    let clamped = level.clamp(0x01, 0xFE);
    let subcmd = if enable { 0x05 } else { 0x85 };
    let val = if enable { clamped } else { 0 };
    let ok = unsafe { DS_AtaSetFeature(handle, subcmd, val) };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "message": if ok {
            if enable { format!("APM 전원 관리 레벨을 0x{:02X}({})로 설정했습니다.", clamped, clamped) }
            else { "APM(고급 전원 관리) 기능을 비활성화했습니다.".to_string() }
        } else {
            "디스크 컨트롤러가 APM SET FEATURES 명령을 거부했거나 지원하지 않습니다.".to_string()
        }
    }))
}

#[tauri::command]
fn set_drive_write_cache(drive_index: u32, enable: bool) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }
    let subcmd = if enable { 0x02 } else { 0x82 };
    let ok = unsafe { DS_AtaSetFeature(handle, subcmd, 0) };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "message": if ok {
            if enable { "휘발성 쓰기 캐시(Write Cache)를 활성화했습니다.".to_string() }
            else { "휘발성 쓰기 캐시(Write Cache)를 비활성화했습니다.".to_string() }
        } else {
            "컨트롤러가 Write Cache 제어 명령을 지원하지 않습니다.".to_string()
        }
    }))
}

#[tauri::command]
fn set_drive_read_look_ahead(drive_index: u32, enable: bool) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }
    let subcmd = if enable { 0xAA } else { 0x55 };
    let ok = unsafe { DS_AtaSetFeature(handle, subcmd, 0) };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "message": if ok {
            if enable { "미리 읽기(Read Look-Ahead)를 활성화했습니다.".to_string() }
            else { "미리 읽기(Read Look-Ahead)를 비활성화했습니다.".to_string() }
        } else {
            "컨트롤러가 Read Look-Ahead 제어 명령을 지원하지 않습니다.".to_string()
        }
    }))
}

#[tauri::command]
fn set_drive_standby_timer(drive_index: u32, timer_code: u8) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }
    // ATA IDLE command (0xE3) programs the auto-spindown standby timer without immediate spindown
    let ok = unsafe { DS_AtaPowerCommand(handle, 0xE3, timer_code) };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "message": if ok {
            if timer_code == 0 { "스탠바이 자동 절전 타이머를 해제했습니다.".to_string() }
            else { format!("스탠바이 절전 타이머 코드(0x{:02X})를 드라이브에 적용했습니다.", timer_code) }
        } else {
            "컨트롤러가 ATA IDLE 타이머 설정 명령(0xE3)을 거부했습니다.".to_string()
        }
    }))
}

#[tauri::command]
fn spindown_drive_now(drive_index: u32) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }
    // ATA STANDBY IMMEDIATE (0xE0)
    let ok = unsafe { DS_AtaPowerCommand(handle, 0xE0, 0) };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "message": if ok {
            "즉시 스핀다운(STANDBY IMMEDIATE 0xE0) 명령을 전송했습니다.".to_string()
        } else {
            "즉시 스핀다운 명령이 컨트롤러 또는 OS에 의해 차단되었습니다.".to_string()
        }
    }))
}

#[tauri::command]
fn get_smart_extended_logs(drive_index: u32) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut detail: DSPhysicalDriveDetail = unsafe { std::mem::zeroed() };
    unsafe { DS_GetDriveDetails(handle, &mut detail) };
    let bus = String::from_utf8_lossy(&detail.bus_type).trim_matches(char::from(0)).to_string();

    if bus == "NVMe" {
        let mut nvme_err_buf = [0u8; 512];
        let nvme_ok = unsafe { DS_GetNvmeErrorLogPage(handle, nvme_err_buf.as_mut_ptr()) };
        unsafe { DS_CloseDrive(handle) };

        if !nvme_ok {
            return Ok(serde_json::json!({
                "supported": false,
                "protocol": "NVMe",
                "selfTestLogs": Vec::<serde_json::Value>::new(),
                "errorLogs": Vec::<serde_json::Value>::new(),
                "totalErrorCount": 0,
                "reason": "NVMe Error Information Log Page(01h)를 읽을 수 없습니다."
            }));
        }

        let mut error_logs = Vec::new();
        let mut max_err_count: u64 = 0;
        for idx in 0..8usize {
            let off = idx * 64;
            let err_num = u64::from_le_bytes(nvme_err_buf[off..off + 8].try_into().unwrap_or([0; 8]));
            if err_num == 0 {
                continue;
            }
            if err_num > max_err_count {
                max_err_count = err_num;
            }
            let cmd_id = u16::from_le_bytes([nvme_err_buf[off + 10], nvme_err_buf[off + 11]]);
            let status_field = u16::from_le_bytes([nvme_err_buf[off + 12], nvme_err_buf[off + 13]]);
            let lba = u64::from_le_bytes(nvme_err_buf[off + 16..off + 24].try_into().unwrap_or([0; 8]));
            error_logs.push(serde_json::json!({
                "errorNumber": err_num,
                "lifeTimeHours": 0,
                "lba": lba,
                "statusFlags": (status_field >> 1) & 0xFF,
                "errorFlags": status_field & 0xFF,
                "errorMnemonic": format!("NVMe Status 0x{:04X}", status_field),
                "commandReg": cmd_id
            }));
        }

        return Ok(serde_json::json!({
            "supported": true,
            "protocol": "NVMe",
            "selfTestLogs": Vec::<serde_json::Value>::new(),
            "errorLogs": error_logs,
            "totalErrorCount": max_err_count
        }));
    }

    let mut st_buf = [0u8; 512];
    let st_ok = unsafe { DS_GetSmartLogPage(handle, 0x06, st_buf.as_mut_ptr()) };

    let mut err_buf = [0u8; 512];
    let err_ok = unsafe { DS_GetSmartLogPage(handle, 0x01, err_buf.as_mut_ptr()) };

    unsafe { DS_CloseDrive(handle) };

    if !st_ok && !err_ok {
        return Ok(serde_json::json!({
            "supported": false,
            "protocol": "UNSUPPORTED",
            "selfTestLogs": Vec::<serde_json::Value>::new(),
            "errorLogs": Vec::<serde_json::Value>::new(),
            "totalErrorCount": 0,
            "reason": "S.M.A.R.T. 로그 페이지(06h/01h) 읽기 명령(0xD5)이 지원되지 않거나 관리자 권한이 필요합니다."
        }));
    }

    let mut self_test_logs = Vec::new();
    if st_ok {
        let current_ptr = st_buf[508] as usize; // 1-based circular index (1..=21)
        let mut order: Vec<usize> = Vec::with_capacity(21);
        if (1..=21).contains(&current_ptr) {
            for step in 0..21 {
                let slot = ((current_ptr - 1 + 21 - step) % 21) as usize;
                order.push(slot);
            }
        } else {
            for slot in 0..21 {
                order.push(slot);
            }
        }

        let mut seq = 1u32;
        for slot in order {
            let off = 2 + slot * 24;
            let test_code = st_buf[off];
            let status_byte = st_buf[off + 1];
            let poh = u16::from_le_bytes([st_buf[off + 2], st_buf[off + 3]]);
            if test_code == 0 && status_byte == 0 && poh == 0 {
                continue;
            }
            let nibble = (status_byte >> 4) & 0x0F;
            let remaining_pct = ((status_byte & 0x0F) as u32) * 10;
            let failing_lba_raw = u32::from_le_bytes([st_buf[off + 5], st_buf[off + 6], st_buf[off + 7], st_buf[off + 8]]);
            let failing_lba: Option<u64> = if nibble >= 3 && nibble <= 8 {
                Some(failing_lba_raw as u64)
            } else {
                None
            };

            let test_type = match test_code {
                0x01 => "Short offline",
                0x02 => "Extended offline",
                0x03 => "Conveyance offline",
                0x04 => "Selective offline",
                0x7F => "Abort offline",
                0x81 => "Short captive",
                0x82 => "Extended captive",
                0x83 => "Conveyance captive",
                _ => "Offline diagnostic",
            };

            let status_text = match nibble {
                0x00 => "Completed without error",
                0x01 => "Aborted by host",
                0x02 => "Interrupted (host reset)",
                0x03 => "Fatal / Unknown error",
                0x04 => "Completed (unknown element failure)",
                0x05 => "Completed (electrical failure)",
                0x06 => "Completed (servo/seek failure)",
                0x07 => "Completed (read failure)",
                0x08 => "Completed (handling damage)",
                0x0F => "In progress",
                _ => "Unknown status",
            };

            self_test_logs.push(serde_json::json!({
                "index": seq,
                "testCode": test_code,
                "testType": test_type,
                "statusCode": nibble,
                "statusText": status_text,
                "remainingPct": remaining_pct,
                "lifeTimeHours": poh,
                "failingLba": failing_lba
            }));
            seq += 1;
        }
    }

    let mut error_logs = Vec::new();
    let mut total_error_count = 0u16;
    if err_ok {
        total_error_count = u16::from_le_bytes([err_buf[452], err_buf[453]]);
        let err_ptr = err_buf[1] as usize; // 1-based circular index (1..=5)
        let mut err_order: Vec<usize> = Vec::with_capacity(5);
        if (1..=5).contains(&err_ptr) {
            for step in 0..5 {
                let slot = (err_ptr - 1 + 5 - step) % 5;
                err_order.push(slot);
            }
        } else {
            for slot in 0..5 {
                err_order.push(slot);
            }
        }

        let mut seq = 1u32;
        for slot in err_order {
            let off = 2 + slot * 90;
            let err_struct = &err_buf[off + 60..off + 90];
            let err_reg = err_struct[1];
            let status_reg = err_struct[7];
            let poh = u16::from_le_bytes([err_struct[28], err_struct[29]]);
            if err_reg == 0 && status_reg == 0 && poh == 0 {
                continue;
            }
            let lba_low = err_struct[3] as u64;
            let lba_mid = (err_struct[4] as u64) << 8;
            let lba_high = (err_struct[5] as u64) << 16;
            let lba_dev = ((err_struct[6] & 0x0F) as u64) << 24;
            let lba = lba_low | lba_mid | lba_high | lba_dev;
            let cmd_reg = err_buf[off + 48 + 7];

            let mut mnemonics = Vec::new();
            if (err_reg & 0x80) != 0 { mnemonics.push("ICRC"); }
            if (err_reg & 0x40) != 0 { mnemonics.push("UNC"); }
            if (err_reg & 0x10) != 0 { mnemonics.push("IDNF"); }
            if (err_reg & 0x04) != 0 { mnemonics.push("ABRT"); }
            if (err_reg & 0x02) != 0 { mnemonics.push("TK0NF"); }
            if (err_reg & 0x01) != 0 { mnemonics.push("AMNF"); }
            let mnemonic = if mnemonics.is_empty() {
                format!("ERR_0x{:02X}", err_reg)
            } else {
                mnemonics.join(" | ")
            };

            let display_num = if total_error_count > 0 {
                (total_error_count as u32).saturating_sub(seq - 1).max(1)
            } else {
                seq
            };

            error_logs.push(serde_json::json!({
                "errorNumber": display_num,
                "lifeTimeHours": poh,
                "lba": lba,
                "statusFlags": status_reg,
                "errorFlags": err_reg,
                "errorMnemonic": mnemonic,
                "commandReg": cmd_reg
            }));
            seq += 1;
        }
    }

    Ok(serde_json::json!({
        "supported": true,
        "protocol": "ATA",
        "selfTestLogs": self_test_logs,
        "errorLogs": error_logs,
        "totalErrorCount": total_error_count
    }))
}

#[tauri::command]
fn read_raw_sector_range(drive_index: u32, start_lba: u64, sector_count: u32) -> Result<serde_json::Value, String> {
    let pooled = acquire_pooled_drive(drive_index)?;
    let guard = pooled.lock().map_err(|_| "Drive handle mutex poisoned".to_string())?;

    let safe_sec_size = guard.sector_size.max(512);
    let safe_count = sector_count.clamp(1, 64);
    let total_bytes = (safe_count as usize).saturating_mul(safe_sec_size as usize).min(256 * 1024);
    let mut buffer = vec![0u8; total_bytes];
    let mut bytes_read: u32 = 0;
    let mut w32_err: u32 = 0;

    let ok = unsafe {
        DS_ReadRawSectorWithError(
            guard.raw,
            start_lba,
            buffer.as_mut_ptr(),
            total_bytes as u32,
            &mut bytes_read,
            &mut w32_err,
        )
    };
    drop(guard);

    if !ok {
        if is_stale_handle_win32_error(w32_err) {
            invalidate_pooled_drive(drive_index);
        }
        return Err(format!(
            "Failed to read {} sector(s) at LBA {} (Win32 error {})",
            safe_count, start_lba, w32_err
        ));
    }

    Ok(serde_json::json!({
        "driveIndex": drive_index,
        "startLba": start_lba,
        "sectorCount": safe_count,
        "sectorSize": safe_sec_size,
        "bytes": buffer
    }))
}

#[tauri::command]
fn read_raw_sector_range_b64(drive_index: u32, start_lba: u64, sector_count: u32) -> Result<serde_json::Value, String> {
    let pooled = acquire_pooled_drive(drive_index)?;
    let guard = pooled.lock().map_err(|_| "Drive handle mutex poisoned".to_string())?;

    let safe_sec_size = guard.sector_size.max(512);
    let max_sectors = (4 * 1024 * 1024 / safe_sec_size).max(1).min(2048);
    let safe_count = sector_count.clamp(1, max_sectors);
    let total_bytes = (safe_count as usize).saturating_mul(safe_sec_size as usize);
    let mut buffer = vec![0u8; total_bytes];
    let mut bytes_read: u32 = 0;
    let mut w32_err: u32 = 0;

    let ok = unsafe {
        DS_ReadRawSectorWithError(
            guard.raw,
            start_lba,
            buffer.as_mut_ptr(),
            total_bytes as u32,
            &mut bytes_read,
            &mut w32_err,
        )
    };
    drop(guard);

    if !ok {
        if is_stale_handle_win32_error(w32_err) {
            invalidate_pooled_drive(drive_index);
        }
        return Err(format!(
            "Failed to read {} sector(s) at LBA {} (Win32 error {})",
            safe_count, start_lba, w32_err
        ));
    }

    Ok(serde_json::json!({
        "driveIndex": drive_index,
        "startLba": start_lba,
        "sectorCount": safe_count,
        "sectorSize": safe_sec_size,
        "bytesBase64": encode_base64(&buffer)
    }))
}

#[tauri::command]
fn run_lba_benchmark_sample(
    drive_index: u32,
    start_lba: u64,
    block_bytes: u32,
    mode: u32,
    iterations: u32,
) -> Result<serde_json::Value, String> {
    let pooled = acquire_pooled_drive(drive_index)?;
    let guard = pooled.lock().map_err(|_| "Drive handle mutex poisoned".to_string())?;

    let mut bench: DSLbaBenchmarkResult = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        DS_RunLbaBenchmarkProbe(guard.raw, start_lba, block_bytes, mode, iterations, &mut bench)
    };
    drop(guard);

    if !ok {
        if is_stale_handle_win32_error(bench.win32_error_code) {
            invalidate_pooled_drive(drive_index);
        }
        return Err(format!(
            "Benchmark I/O probe failed at LBA {} (Win32 error {})",
            start_lba, bench.win32_error_code
        ));
    }

    Ok(serde_json::json!({
        "startLba": bench.start_lba,
        "blockBytes": bench.block_bytes,
        "iterations": bench.iterations,
        "throughputMbSec": bench.throughput_mb_sec,
        "iops": bench.iops,
        "avgLatencyMs": bench.avg_latency_ms,
        "minLatencyMs": bench.min_latency_ms,
        "p99LatencyMs": bench.p99_latency_ms,
        "statusCode": bench.status_code,
        "win32ErrorCode": bench.win32_error_code
    }))
}

fn is_os_system_drive(drive_index: u32) -> (bool, Vec<String>) {
    let vol_map = get_volume_mappings();
    let mounted_volumes: Vec<String> = vol_map
        .get(&drive_index)
        .map(|list| list.iter().map(|v| v.drive_letter.clone()).collect())
        .unwrap_or_default();

    let sys_drive = std::env::var("SystemDrive")
        .unwrap_or_else(|_| "C:".to_string())
        .trim()
        .to_uppercase();
    let normalized_sys = if sys_drive.ends_with(':') {
        sys_drive
    } else {
        format!("{}:", sys_drive.chars().next().unwrap_or('C'))
    };

    let has_sys_vol = mounted_volumes
        .iter()
        .any(|v| v.trim().to_uppercase() == normalized_sys);

    let is_system = has_sys_vol || (drive_index == 0 && mounted_volumes.is_empty());
    (is_system, mounted_volumes)
}

#[tauri::command]
fn copy_lba_range_to_file(
    drive_index: u32,
    start_lba: u64,
    sector_count: u32,
    output_path: String,
    dest_byte_offset: u64,
    fill_zero_only: bool,
) -> Result<serde_json::Value, String> {
    let trimmed_path = output_path.trim();
    if trimmed_path.is_empty() {
        return Err("출력 이미지 파일 경로가 비어 있습니다.".to_string());
    }

    let (_, mounted_vols) = is_os_system_drive(drive_index);
    if trimmed_path.len() >= 2 && trimmed_path.as_bytes()[1] == b':' {
        let out_letter = format!("{}:", trimmed_path.chars().next().unwrap_or(' ').to_ascii_uppercase());
        if mounted_vols.iter().any(|v| v.trim().to_uppercase() == out_letter) {
            return Err(format!(
                "안전 가드 차단: 대상 디스크(PhysicalDrive{})에 마운트된 볼륨({})과 동일한 드라이브에는 이미지 파일을 저장할 수 없습니다.",
                drive_index, out_letter
            ));
        }
    }

    if let Some(parent) = std::path::Path::new(trimmed_path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("출력 폴더 생성 실패: {}", e))?;
        }
    }

    let path_bytes = trimmed_path.as_bytes();
    let safe_sectors = sector_count.clamp(1, 8192);
    let mut bytes_written: u64 = 0;
    let mut status_code: u32 = 4;
    let mut win32_error: u32 = 0;

    if fill_zero_only {
        let ok = unsafe {
            DS_CopyLbaRangeChunk(
                std::ptr::null_mut(),
                start_lba,
                safe_sectors,
                path_bytes.as_ptr(),
                path_bytes.len() as u32,
                dest_byte_offset,
                true,
                &mut bytes_written,
                &mut status_code,
                &mut win32_error,
            )
        };
        return Ok(serde_json::json!({
            "success": ok,
            "startLba": start_lba,
            "sectorCount": safe_sectors,
            "bytesWritten": bytes_written,
            "statusCode": status_code,
            "win32ErrorCode": win32_error
        }));
    }

    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let ok = unsafe {
        DS_CopyLbaRangeChunk(
            handle,
            start_lba,
            safe_sectors,
            path_bytes.as_ptr(),
            path_bytes.len() as u32,
            dest_byte_offset,
            false,
            &mut bytes_written,
            &mut status_code,
            &mut win32_error,
        )
    };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "startLba": start_lba,
        "sectorCount": safe_sectors,
        "sectorSize": sector_size.max(512),
        "bytesWritten": bytes_written,
        "statusCode": status_code,
        "win32ErrorCode": win32_error
    }))
}

#[tauri::command]
fn save_lba_clone_map(map_path: String, json_content: String) -> Result<bool, String> {
    let trimmed = map_path.trim();
    if trimmed.is_empty() {
        return Err("맵 파일 경로가 비어 있습니다.".to_string());
    }
    if let Some(parent) = std::path::Path::new(trimmed).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("맵 폴더 생성 실패: {}", e))?;
        }
    }
    std::fs::write(trimmed, json_content.as_bytes())
        .map_err(|e| format!("복제 맵 저장 실패: {}", e))?;
    Ok(true)
}

#[tauri::command]
fn load_lba_clone_map(map_path: String) -> Result<String, String> {
    let trimmed = map_path.trim();
    if trimmed.is_empty() {
        return Err("맵 파일 경로가 비어 있습니다.".to_string());
    }
    std::fs::read_to_string(trimmed)
        .map_err(|e| format!("복제 맵 불러오기 실패: {}", e))
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DdrescueInterval {
    start_lba: u64,
    sector_count: u64,
    status: String,
    attempts: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_error_code: Option<u32>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DdrescueRetryEvent {
    timestamp_ms: u64,
    lba: u64,
    sector_count: u64,
    phase: String,
    attempt: u32,
    max_retries: u32,
    outcome: String,
    win32_error_code: u32,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DdrescueBackendSnapshot {
    is_running: bool,
    phase: String,
    drive_index: u32,
    drive_model: String,
    drive_serial: String,
    sector_size: u32,
    range_start_lba: u64,
    range_end_lba: u64,
    output_path: String,
    map_path: String,
    chunk_sectors: u32,
    max_retries: u32,
    zero_fill_bad: bool,
    total_sectors: u64,
    finished_sectors: u64,
    non_tried_sectors: u64,
    non_trimmed_sectors: u64,
    non_scraped_sectors: u64,
    bad_sectors: u64,
    pass1_attempted_sectors: u64,
    pass1_rescued_sectors: u64,
    pass2_attempted_sectors: u64,
    pass2_rescued_sectors: u64,
    pass3_attempted_sectors: u64,
    pass3_rescued_sectors: u64,
    total_retry_attempts: u64,
    rescued_on_retry_sectors: u64,
    bytes_written: u64,
    current_lba: u64,
    throughput_mb_sec: f64,
    elapsed_ms: u64,
    last_error: Option<String>,
    intervals: Vec<DdrescueInterval>,
    recent_events: Vec<DdrescueRetryEvent>,
}

impl Default for DdrescueBackendSnapshot {
    fn default() -> Self {
        Self {
            is_running: false,
            phase: "idle".to_string(),
            drive_index: 0,
            drive_model: String::new(),
            drive_serial: String::new(),
            sector_size: 512,
            range_start_lba: 0,
            range_end_lba: 0,
            output_path: String::new(),
            map_path: String::new(),
            chunk_sectors: 128,
            max_retries: 3,
            zero_fill_bad: false,
            total_sectors: 0,
            finished_sectors: 0,
            non_tried_sectors: 0,
            non_trimmed_sectors: 0,
            non_scraped_sectors: 0,
            bad_sectors: 0,
            pass1_attempted_sectors: 0,
            pass1_rescued_sectors: 0,
            pass2_attempted_sectors: 0,
            pass2_rescued_sectors: 0,
            pass3_attempted_sectors: 0,
            pass3_rescued_sectors: 0,
            total_retry_attempts: 0,
            rescued_on_retry_sectors: 0,
            bytes_written: 0,
            current_lba: 0,
            throughput_mb_sec: 0.0,
            elapsed_ms: 0,
            last_error: None,
            intervals: Vec::new(),
            recent_events: Vec::new(),
        }
    }
}

struct DdrescueEngineRuntime {
    snapshot: DdrescueBackendSnapshot,
    cancel_flag: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
}

static DDRESCUE_RUNTIME: std::sync::OnceLock<std::sync::Arc<std::sync::Mutex<DdrescueEngineRuntime>>> =
    std::sync::OnceLock::new();

fn ddrescue_runtime() -> std::sync::Arc<std::sync::Mutex<DdrescueEngineRuntime>> {
    DDRESCUE_RUNTIME
        .get_or_init(|| {
            std::sync::Arc::new(std::sync::Mutex::new(DdrescueEngineRuntime {
                snapshot: DdrescueBackendSnapshot::default(),
                cancel_flag: None,
            }))
        })
        .clone()
}

fn coalesce_ddrescue_intervals(mut intervals: Vec<DdrescueInterval>) -> Vec<DdrescueInterval> {
    intervals.retain(|iv| iv.sector_count > 0);
    intervals.sort_by_key(|iv| iv.start_lba);
    let mut merged: Vec<DdrescueInterval> = Vec::with_capacity(intervals.len());
    for iv in intervals {
        if let Some(last) = merged.last_mut() {
            if last.start_lba + last.sector_count == iv.start_lba
                && last.status == iv.status
                && last.attempts == iv.attempts
                && last.last_error_code == iv.last_error_code
            {
                last.sector_count += iv.sector_count;
                continue;
            }
        }
        merged.push(iv);
    }
    merged
}

fn update_ddrescue_interval(
    intervals: Vec<DdrescueInterval>,
    upd_start: u64,
    upd_count: u64,
    next_status: &str,
    attempts_inc: u32,
    err_code: Option<u32>,
) -> Vec<DdrescueInterval> {
    if upd_count == 0 {
        return intervals;
    }
    let upd_end = upd_start.saturating_add(upd_count);
    let mut next = Vec::with_capacity(intervals.len() + 2);
    for iv in intervals {
        let iv_start = iv.start_lba;
        let iv_end = iv.start_lba.saturating_add(iv.sector_count);
        if iv_end <= upd_start || iv_start >= upd_end {
            next.push(iv);
            continue;
        }
        if iv_start < upd_start {
            next.push(DdrescueInterval {
                start_lba: iv_start,
                sector_count: upd_start - iv_start,
                status: iv.status.clone(),
                attempts: iv.attempts,
                last_error_code: iv.last_error_code,
            });
        }
        let ov_start = iv_start.max(upd_start);
        let ov_end = iv_end.min(upd_end);
        if ov_end > ov_start {
            next.push(DdrescueInterval {
                start_lba: ov_start,
                sector_count: ov_end - ov_start,
                status: next_status.to_string(),
                attempts: iv.attempts.saturating_add(attempts_inc),
                last_error_code: err_code,
            });
        }
        if iv_end > upd_end {
            next.push(DdrescueInterval {
                start_lba: upd_end,
                sector_count: iv_end - upd_end,
                status: iv.status,
                attempts: iv.attempts,
                last_error_code: iv.last_error_code,
            });
        }
    }
    coalesce_ddrescue_intervals(next)
}

fn recompute_ddrescue_counts(snap: &mut DdrescueBackendSnapshot) {
    let mut fin = 0u64;
    let mut nt = 0u64;
    let mut ntr = 0u64;
    let mut nsc = 0u64;
    let mut bad = 0u64;
    for iv in &snap.intervals {
        match iv.status.as_str() {
            "finished" => fin += iv.sector_count,
            "non_tried" => nt += iv.sector_count,
            "non_trimmed" => ntr += iv.sector_count,
            "non_scraped" => nsc += iv.sector_count,
            "bad_sector" => bad += iv.sector_count,
            _ => {}
        }
    }
    snap.finished_sectors = fin;
    snap.non_tried_sectors = nt;
    snap.non_trimmed_sectors = ntr;
    snap.non_scraped_sectors = nsc;
    snap.bad_sectors = bad;
    snap.total_sectors = fin + nt + ntr + nsc + bad;
}

fn persist_ddrescue_map_json(snap: &DdrescueBackendSnapshot) {
    if snap.map_path.trim().is_empty() {
        return;
    }
    if let Some(parent) = std::path::Path::new(&snap.map_path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let payload = serde_json::json!({
        "version": 2,
        "driveId": format!("drive-tauri-physical-{}", snap.drive_index),
        "driveModel": snap.drive_model,
        "driveSerial": snap.drive_serial,
        "sectorSize": snap.sector_size,
        "rangeStartLba": snap.range_start_lba,
        "rangeEndLba": snap.range_end_lba,
        "outputPath": snap.output_path,
        "mapPath": snap.map_path,
        "phase": snap.phase,
        "chunkSectors": snap.chunk_sectors,
        "maxRetries": snap.max_retries,
        "copiedSectors": snap.finished_sectors,
        "badSectors": snap.bad_sectors,
        "retriedSectors": snap.total_retry_attempts,
        "rescuedOnRetrySectors": snap.rescued_on_retry_sectors,
        "bytesWritten": snap.bytes_written,
        "startedAt": now_ms.saturating_sub(snap.elapsed_ms),
        "updatedAt": now_ms,
        "intervals": snap.intervals,
    });
    if let Ok(text) = serde_json::to_string(&payload) {
        let _ = std::fs::write(&snap.map_path, text.as_bytes());
    }
}

fn push_ddrescue_event(snap: &mut DdrescueBackendSnapshot, ev: DdrescueRetryEvent) {
    snap.recent_events.push(ev);
    if snap.recent_events.len() > 40 {
        let drain_n = snap.recent_events.len() - 40;
        snap.recent_events.drain(0..drain_n);
    }
}

fn update_ddrescue_interval_local(
    intervals: &mut Vec<DdrescueInterval>,
    upd_start: u64,
    upd_count: u64,
    next_status: &str,
    attempts_inc: u32,
    err_code: Option<u32>,
) {
    if upd_count == 0 {
        return;
    }
    let taken = std::mem::take(intervals);
    *intervals = update_ddrescue_interval(taken, upd_start, upd_count, next_status, attempts_inc, err_code);
}

#[tauri::command]
fn start_ddrescue_backup(
    drive_index: u32,
    range_start_lba: u64,
    range_end_lba: u64,
    output_path: String,
    map_path: String,
    chunk_sectors: u32,
    max_retries: u32,
    zero_fill_bad: bool,
    resume_intervals_json: Option<String>,
) -> Result<DdrescueBackendSnapshot, String> {
    let trimmed_out = output_path.trim().to_string();
    if trimmed_out.is_empty() {
        return Err("출력 이미지 파일 경로가 비어 있습니다.".to_string());
    }
    let trimmed_map = if map_path.trim().is_empty() {
        format!("{}.map.json", trimmed_out)
    } else {
        map_path.trim().to_string()
    };

    let (_, mounted_vols) = is_os_system_drive(drive_index);
    if trimmed_out.len() >= 2 && trimmed_out.as_bytes()[1] == b':' {
        let out_letter = format!("{}:", trimmed_out.chars().next().unwrap_or(' ').to_ascii_uppercase());
        if mounted_vols.iter().any(|v| v.trim().to_uppercase() == out_letter) {
            return Err(format!(
                "안전 가드 차단: 원본 디스크(PhysicalDrive{})의 볼륨({})과 동일한 드라이브에는 백업 이미지를 저장할 수 없습니다.",
                drive_index, out_letter
            ));
        }
    }

    if let Some(parent) = std::path::Path::new(&trimmed_out).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("출력 폴더 생성 실패: {}", e))?;
        }
    }

    let safe_start = range_start_lba;
    let safe_end = range_end_lba.max(safe_start);
    let total_sectors = safe_end.saturating_sub(safe_start).saturating_add(1);
    let safe_chunk = chunk_sectors.clamp(16, 2048);
    let safe_retries = max_retries.clamp(1, 5);

    let initial_intervals: Vec<DdrescueInterval> = resume_intervals_json
        .and_then(|raw| serde_json::from_str::<Vec<DdrescueInterval>>(&raw).ok())
        .filter(|list| !list.is_empty())
        .map(coalesce_ddrescue_intervals)
        .unwrap_or_else(|| {
            vec![DdrescueInterval {
                start_lba: safe_start,
                sector_count: total_sectors,
                status: "non_tried".to_string(),
                attempts: 0,
                last_error_code: None,
            }]
        });

    invalidate_pooled_drive(drive_index);

    let runtime = ddrescue_runtime();
    let cancel_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let initial_snapshot = {
        let mut guard = runtime.lock().map_err(|_| "엔진 잠금 실패".to_string())?;
        if guard.snapshot.is_running {
            return Err("이미 실행 중인 ddrescue 백업 작업이 있습니다.".to_string());
        }

        let mut snap = DdrescueBackendSnapshot {
            is_running: true,
            phase: "copying".to_string(),
            drive_index,
            drive_model: format!("PhysicalDrive{}", drive_index),
            drive_serial: String::new(),
            sector_size: 512,
            range_start_lba: safe_start,
            range_end_lba: safe_end,
            output_path: trimmed_out.clone(),
            map_path: trimmed_map.clone(),
            chunk_sectors: safe_chunk,
            max_retries: safe_retries,
            zero_fill_bad,
            total_sectors,
            current_lba: safe_start,
            intervals: initial_intervals.clone(),
            ..Default::default()
        };
        recompute_ddrescue_counts(&mut snap);
        guard.snapshot = snap.clone();
        guard.cancel_flag = Some(cancel_flag.clone());
        snap
    };

    let worker_runtime = runtime.clone();
    let mut local_intervals = initial_intervals;
    let worker_initial_snapshot = initial_snapshot.clone();
    std::thread::spawn(move || {
        use std::io::{Seek, SeekFrom, Write};

        let mut sector_size: u32 = 512;
        let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
        if handle.is_null() {
            let map_snap = {
                if let Ok(mut guard) = worker_runtime.lock() {
                    guard.snapshot.is_running = false;
                    guard.snapshot.phase = "error".to_string();
                    guard.snapshot.last_error = Some(format!(
                        "물리 디스크 핸들 열기 실패 (PhysicalDrive{} — 관리자 권한 필요)",
                        drive_index
                    ));
                    guard.cancel_flag = None;
                    Some(guard.snapshot.clone())
                } else {
                    None
                }
            };
            if let Some(s) = map_snap {
                persist_ddrescue_map_json(&s);
            }
            return;
        }

        let mut dest_file = match std::fs::OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(&trimmed_out)
        {
            Ok(f) => f,
            Err(e) => {
                unsafe { DS_CloseDrive(handle) };
                let map_snap = {
                    if let Ok(mut guard) = worker_runtime.lock() {
                        guard.snapshot.is_running = false;
                        guard.snapshot.phase = "error".to_string();
                        guard.snapshot.last_error = Some(format!("출력 파일 열기 실패: {}", e));
                        guard.cancel_flag = None;
                        Some(guard.snapshot.clone())
                    } else {
                        None
                    }
                };
                if let Some(s) = map_snap {
                    persist_ddrescue_map_json(&s);
                }
                return;
            }
        };

        let mut detail: DSPhysicalDriveDetail = unsafe { std::mem::zeroed() };
        unsafe { DS_GetDriveDetails(handle, &mut detail) };
        let model_str = String::from_utf8_lossy(&detail.model)
            .trim_matches(char::from(0))
            .trim()
            .to_string();
        let serial_str = String::from_utf8_lossy(&detail.serial_number)
            .trim_matches(char::from(0))
            .trim()
            .to_string();

        let sec_size = sector_size.max(512);
        let mut local_snap = {
            if let Ok(mut guard) = worker_runtime.lock() {
                guard.snapshot.sector_size = sec_size;
                if !model_str.is_empty() {
                    guard.snapshot.drive_model = model_str;
                }
                guard.snapshot.drive_serial = serial_str;
                guard.snapshot.clone()
            } else {
                worker_initial_snapshot
            }
        };

        let max_buf_bytes = (safe_chunk as usize)
            .saturating_mul(sec_size as usize)
            .min(4 * 1024 * 1024)
            .max(sec_size as usize);
        let mut io_buf = vec![0u8; max_buf_bytes];
        let zero_sector_buf = vec![0u8; sec_size as usize];

        let started = std::time::Instant::now();
        let mut last_snapshot_publish = std::time::Instant::now();
        let mut last_file_flush = std::time::Instant::now();
        let mut last_map_save = std::time::Instant::now();
        let mut prev_phase = local_snap.phase.clone();

        loop {
            if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
                let _ = dest_file.flush();
                local_snap.is_running = false;
                local_snap.phase = "paused".to_string();
                local_snap.elapsed_ms = started.elapsed().as_millis() as u64;
                local_snap.intervals = local_intervals.clone();
                if let Ok(mut guard) = worker_runtime.lock() {
                    guard.snapshot = local_snap.clone();
                    guard.cancel_flag = None;
                }
                persist_ddrescue_map_json(&local_snap);
                break;
            }

            let next_work: Option<(&'static str, u64, u32)> =
                if let Some(iv) = local_intervals.iter().find(|iv| iv.status == "non_tried") {
                    Some((
                        "copying",
                        iv.start_lba,
                        iv.sector_count.min(safe_chunk as u64) as u32,
                    ))
                } else if let Some(iv) = local_intervals.iter().find(|iv| iv.status == "non_trimmed") {
                    let trim_step = (safe_chunk / 4).clamp(4, 16) as u64;
                    Some((
                        "trimming",
                        iv.start_lba,
                        iv.sector_count.min(trim_step) as u32,
                    ))
                } else if let Some(iv) = local_intervals.iter().find(|iv| iv.status == "non_scraped") {
                    Some(("retrying", iv.start_lba, 1))
                } else {
                    None
                };

            let Some((phase_name, work_lba, work_count)) = next_work else {
                let _ = dest_file.flush();
                local_snap.is_running = false;
                local_snap.phase = "completed".to_string();
                local_snap.elapsed_ms = started.elapsed().as_millis() as u64;
                local_snap.intervals = local_intervals.clone();
                if let Ok(mut guard) = worker_runtime.lock() {
                    guard.snapshot = local_snap.clone();
                    guard.cancel_flag = None;
                }
                persist_ddrescue_map_json(&local_snap);
                break;
            };

            let dest_byte_offset = work_lba.saturating_sub(safe_start).saturating_mul(sec_size as u64);
            let chunk_start_time = std::time::Instant::now();
            let req_bytes = (work_count as usize).saturating_mul(sec_size as usize).min(io_buf.len());

            if phase_name == "retrying" {
                let mut rescued = false;
                let mut attempts_done: u32 = 0;
                let mut last_win32_err: u32 = 0;
                let mut written_bytes: u64 = 0;

                for attempt in 1..=safe_retries {
                    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
                        break;
                    }
                    attempts_done = attempt;
                    let mut bytes_read: u32 = 0;
                    let mut w32_err: u32 = 0;
                    let ok = unsafe {
                        DS_ReadRawSectorWithError(
                            handle,
                            work_lba,
                            io_buf.as_mut_ptr(),
                            req_bytes as u32,
                            &mut bytes_read,
                            &mut w32_err,
                        )
                    };
                    if ok && bytes_read > 0 {
                        if dest_file.seek(SeekFrom::Start(dest_byte_offset)).is_ok()
                            && dest_file.write_all(&io_buf[..bytes_read as usize]).is_ok()
                        {
                            rescued = true;
                            written_bytes = bytes_read as u64;
                            break;
                        } else {
                            last_win32_err = 29;
                        }
                    } else {
                        last_win32_err = w32_err;
                    }
                }

                if !rescued && zero_fill_bad && !cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    if dest_file.seek(SeekFrom::Start(dest_byte_offset)).is_ok() {
                        let _ = dest_file.write_all(&zero_sector_buf);
                    }
                }

                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                local_snap.phase = "retrying".to_string();
                local_snap.current_lba = work_lba;
                local_snap.pass3_attempted_sectors += 1;
                local_snap.total_retry_attempts += attempts_done as u64;
                local_snap.non_scraped_sectors = local_snap.non_scraped_sectors.saturating_sub(1);

                if rescued {
                    local_snap.pass3_rescued_sectors += 1;
                    local_snap.rescued_on_retry_sectors += 1;
                    local_snap.finished_sectors += 1;
                    local_snap.bytes_written += written_bytes;
                    update_ddrescue_interval_local(&mut local_intervals, work_lba, 1, "finished", attempts_done, None);
                    push_ddrescue_event(
                        &mut local_snap,
                        DdrescueRetryEvent {
                            timestamp_ms: now_ms,
                            lba: work_lba,
                            sector_count: 1,
                            phase: "retrying".to_string(),
                            attempt: attempts_done,
                            max_retries: safe_retries,
                            outcome: "recovered".to_string(),
                            win32_error_code: 0,
                        },
                    );
                } else {
                    local_snap.bad_sectors += 1;
                    update_ddrescue_interval_local(
                        &mut local_intervals,
                        work_lba,
                        1,
                        "bad_sector",
                        attempts_done,
                        Some(last_win32_err),
                    );
                    push_ddrescue_event(
                        &mut local_snap,
                        DdrescueRetryEvent {
                            timestamp_ms: now_ms,
                            lba: work_lba,
                            sector_count: 1,
                            phase: "retrying".to_string(),
                            attempt: attempts_done,
                            max_retries: safe_retries,
                            outcome: "permanent_bad".to_string(),
                            win32_error_code: last_win32_err,
                        },
                    );
                }
            } else {
                let mut bytes_read: u32 = 0;
                let mut w32_err: u32 = 0;
                let read_ok = unsafe {
                    DS_ReadRawSectorWithError(
                        handle,
                        work_lba,
                        io_buf.as_mut_ptr(),
                        req_bytes as u32,
                        &mut bytes_read,
                        &mut w32_err,
                    )
                };
                let mut write_failed_msg: Option<String> = None;
                let ok = if read_ok && bytes_read > 0 {
                    if let Err(e) = dest_file.seek(SeekFrom::Start(dest_byte_offset)) {
                        write_failed_msg = Some(format!("출력 파일 seek 오류: {}", e));
                        w32_err = 29; // ERROR_WRITE_FAULT
                        false
                    } else if let Err(e) = dest_file.write_all(&io_buf[..bytes_read as usize]) {
                        write_failed_msg = Some(format!("출력 파일 쓰기 오류 (디스크 공간 부족/분리 등): {}", e));
                        w32_err = 29; // ERROR_WRITE_FAULT
                        false
                    } else {
                        true
                    }
                } else {
                    false
                };

                let dt_sec = chunk_start_time.elapsed().as_secs_f64().max(0.0005);
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                local_snap.phase = phase_name.to_string();
                local_snap.current_lba = work_lba;
                if phase_name == "copying" {
                    local_snap.pass1_attempted_sectors += work_count as u64;
                    local_snap.non_tried_sectors = local_snap.non_tried_sectors.saturating_sub(work_count as u64);
                } else {
                    local_snap.pass2_attempted_sectors += work_count as u64;
                    local_snap.non_trimmed_sectors = local_snap.non_trimmed_sectors.saturating_sub(work_count as u64);
                }

                if ok {
                    let bw = bytes_read as u64;
                    local_snap.bytes_written += bw;
                    local_snap.finished_sectors += work_count as u64;
                    local_snap.throughput_mb_sec =
                        ((bw as f64 / (1024.0 * 1024.0)) / dt_sec * 10.0).round() / 10.0;
                    if phase_name == "copying" {
                        local_snap.pass1_rescued_sectors += work_count as u64;
                    } else {
                        local_snap.pass2_rescued_sectors += work_count as u64;
                    }
                    update_ddrescue_interval_local(&mut local_intervals, work_lba, work_count as u64, "finished", 1, None);
                } else {
                    if let Some(msg) = write_failed_msg {
                        local_snap.last_error = Some(msg);
                    }
                    let next_status = if phase_name == "copying" {
                        local_snap.non_trimmed_sectors += work_count as u64;
                        "non_trimmed"
                    } else {
                        local_snap.non_scraped_sectors += work_count as u64;
                        "non_scraped"
                    };
                    update_ddrescue_interval_local(
                        &mut local_intervals,
                        work_lba,
                        work_count as u64,
                        next_status,
                        1,
                        Some(w32_err),
                    );
                    push_ddrescue_event(
                        &mut local_snap,
                        DdrescueRetryEvent {
                            timestamp_ms: now_ms,
                            lba: work_lba,
                            sector_count: work_count as u64,
                            phase: phase_name.to_string(),
                            attempt: 1,
                            max_retries: safe_retries,
                            outcome: "escalated".to_string(),
                            win32_error_code: w32_err,
                        },
                    );
                }
            }

            local_snap.elapsed_ms = started.elapsed().as_millis() as u64;
            let phase_changed = local_snap.phase != prev_phase;
            if phase_changed {
                prev_phase = local_snap.phase.clone();
            }

            if last_file_flush.elapsed().as_millis() >= 2000 {
                last_file_flush = std::time::Instant::now();
                let _ = dest_file.flush();
            }

            if phase_changed || last_snapshot_publish.elapsed().as_millis() >= 90 {
                last_snapshot_publish = std::time::Instant::now();
                local_snap.intervals = local_intervals.clone();
                if let Ok(mut guard) = worker_runtime.lock() {
                    guard.snapshot = local_snap.clone();
                }
            }

            if last_map_save.elapsed().as_millis() >= 4000 {
                last_map_save = std::time::Instant::now();
                local_snap.intervals = local_intervals.clone();
                persist_ddrescue_map_json(&local_snap);
            }
        }

        unsafe { DS_CloseDrive(handle) };
    });

    Ok(initial_snapshot)
}

#[tauri::command]
fn get_ddrescue_backup_status() -> Result<DdrescueBackendSnapshot, String> {
    let runtime = ddrescue_runtime();
    let guard = runtime.lock().map_err(|_| "엔진 상태 조회 실패".to_string())?;
    Ok(guard.snapshot.clone())
}

#[tauri::command]
fn pause_ddrescue_backup() -> Result<DdrescueBackendSnapshot, String> {
    let runtime = ddrescue_runtime();
    let guard = runtime.lock().map_err(|_| "엔진 일시정지 실패".to_string())?;
    if let Some(ref flag) = guard.cancel_flag {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(guard.snapshot.clone())
}

fn query_windows_disable_delete_notify() -> Option<bool> {
    #[cfg(windows)]
    {
        if let Ok(out) = std::process::Command::new("fsutil")
            .args(["behavior", "query", "DisableDeleteNotify"])
            .output()
        {
            let txt = String::from_utf8_lossy(&out.stdout).to_string();
            for line in txt.lines() {
                if let Some(eq_idx) = line.rfind('=') {
                    let val_part = line[eq_idx + 1..].trim();
                    if val_part.starts_with('0') {
                        return Some(true); // 0 means TRIM enabled
                    } else if val_part.starts_with('1') {
                        return Some(false); // 1 means TRIM disabled
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
fn inspect_sanitize_capabilities(drive_index: u32) -> Result<serde_json::Value, String> {
    let (is_sys, mounted_vols) = is_os_system_drive(drive_index);
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut detail: DSPhysicalDriveDetail = unsafe { std::mem::zeroed() };
    unsafe { DS_GetDriveDetails(handle, &mut detail) };

    let mut caps: DSSanitizeCapabilities = unsafe { std::mem::zeroed() };
    let cap_ok = unsafe { DS_InspectSanitizeCapabilities(handle, &mut caps) };
    unsafe { DS_CloseDrive(handle) };

    let serial = String::from_utf8_lossy(&detail.serial_number).trim_matches(char::from(0)).to_string();
    let model = String::from_utf8_lossy(&detail.model).trim_matches(char::from(0)).to_string();
    let protocol = match caps.protocol_code {
        1 => "ATA",
        2 => "NVMe",
        _ => "UNSUPPORTED",
    };
    let os_trim_enabled = query_windows_disable_delete_notify();

    Ok(serde_json::json!({
        "supported": cap_ok || detail.is_trim_supported,
        "driveIndex": drive_index,
        "model": model,
        "serialNumber": serial,
        "protocol": protocol,
        "isSystemDrive": is_sys,
        "mountedVolumes": mounted_vols,
        "trimSupported": detail.is_trim_supported || caps.trim_supported,
        "osTrimEnabled": os_trim_enabled,
        "ataSecurity": {
            "supported": caps.ata_security_supported,
            "enabled": caps.ata_security_enabled,
            "locked": caps.ata_security_locked,
            "frozen": caps.ata_security_frozen,
            "countExpired": caps.ata_security_count_expired,
            "enhancedEraseSupported": caps.ata_enhanced_erase_supported,
            "eraseTimeMin": caps.ata_erase_time_min,
            "enhancedEraseTimeMin": caps.ata_enhanced_erase_time_min
        },
        "nvmeFormat": {
            "formatSupported": caps.nvme_format_supported,
            "cryptoEraseSupported": caps.nvme_crypto_erase_supported,
            "sanitizeBlockErase": caps.nvme_sanitize_block_erase,
            "sanitizeCryptoErase": caps.nvme_sanitize_crypto_erase,
            "sanitizeOverwrite": caps.nvme_sanitize_overwrite,
            "oacsRaw": caps.nvme_oacs_raw,
            "fnaRaw": caps.nvme_fna_raw,
            "sanicapRaw": caps.nvme_sanicap_raw
        }
    }))
}

#[tauri::command]
fn execute_sanitize_or_trim(
    drive_index: u32,
    action: String,
    confirmation_serial: Option<String>,
    volume_letter: Option<String>,
) -> Result<serde_json::Value, String> {
    let (is_sys, mounted_vols) = is_os_system_drive(drive_index);

    if action == "volume_trim" {
        let target_vol = volume_letter
            .unwrap_or_else(|| mounted_vols.first().cloned().unwrap_or_default())
            .trim()
            .to_uppercase();
        if target_vol.is_empty() || !mounted_vols.iter().any(|v| v.trim().to_uppercase() == target_vol) {
            return Ok(serde_json::json!({
                "success": false,
                "action": action,
                "message": format!("선택한 볼륨({})이 PhysicalDrive{}에 마운트되어 있지 않습니다.", target_vol, drive_index)
            }));
        }

        #[cfg(windows)]
        {
            let output = std::process::Command::new("defrag")
                .args([&target_vol, "/L", "/U"])
                .output();
            return match output {
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                    let ok = out.status.success();
                    Ok(serde_json::json!({
                        "success": ok,
                        "action": action,
                        "message": if ok {
                            format!("{} 볼륨 SSD TRIM(Slab ReTrim) 최적화가 완료되었습니다. {}", target_vol, stdout)
                        } else {
                            format!("TRIM 최적화 실패 (관리자 권한 확인 필요): {} {}", stderr, stdout)
                        }
                    }))
                }
                Err(e) => Ok(serde_json::json!({
                    "success": false,
                    "action": action,
                    "message": format!("Windows defrag /L 실행 오류: {}", e)
                })),
            };
        }

        #[cfg(not(windows))]
        {
            return Ok(serde_json::json!({
                "success": false,
                "action": action,
                "message": "Windows 네이티브 환경에서만 볼륨 TRIM(defrag /L)을 실행할 수 있습니다."
            }));
        }
    }

    if is_sys {
        return Ok(serde_json::json!({
            "success": false,
            "action": action,
            "message": format!(
                "하드 가드 차단: PhysicalDrive{}({})는 OS 시스템/부트 드라이브이므로 파괴적 Format/Sanitize 명령이 영구 차단됩니다.",
                drive_index,
                mounted_vols.join(", ")
            )
        }));
    }

    invalidate_pooled_drive(drive_index);
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut detail: DSPhysicalDriveDetail = unsafe { std::mem::zeroed() };
    unsafe { DS_GetDriveDetails(handle, &mut detail) };
    let real_serial = String::from_utf8_lossy(&detail.serial_number)
        .trim_matches(char::from(0))
        .trim()
        .to_string();

    let expected_suffix: String = if real_serial.len() >= 4 {
        real_serial[real_serial.len() - 4..].to_string()
    } else if !real_serial.is_empty() {
        real_serial.clone()
    } else {
        format!("DRIVE{}", drive_index)
    };

    let provided = confirmation_serial.unwrap_or_default().trim().to_string();
    if provided.is_empty() || !provided.eq_ignore_ascii_case(&expected_suffix) {
        unsafe { DS_CloseDrive(handle) };
        return Ok(serde_json::json!({
            "success": false,
            "action": action,
            "message": format!("시리얼 번호 뒷자리 확인({})이 일치하지 않아 작업을 취소했습니다.", expected_suffix)
        }));
    }

    let action_code: u32 = match action.as_str() {
        "nvme_format_user" => 1,
        "nvme_format_crypto" => 2,
        "ata_security_erase" => 3,
        _ => {
            unsafe { DS_CloseDrive(handle) };
            return Ok(serde_json::json!({
                "success": false,
                "action": action,
                "message": format!("알 수 없는 삭제 명령: {}", action)
            }));
        }
    };

    let mut win32_err: u32 = 0;
    let ok = unsafe { DS_ExecuteSanitizeAction(handle, action_code, &mut win32_err) };
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "action": action,
        "win32ErrorCode": win32_err,
        "message": if ok {
            format!("PhysicalDrive{}에 대한 하드웨어 보안 삭제({})가 정상 완료되었습니다.", drive_index, action)
        } else {
            format!(
                "컨트롤러가 명령을 거부했거나 보안 동결(Frozen) 상태입니다 (Win32 Error {}). Cold Boot/전원 재인가 후 다시 시도하세요.",
                win32_err
            )
        }
    }))
}

fn run_cli_batch_mode(args: &[String]) -> i32 {
    let mut action = "smart-snapshot".to_string();
    let mut drives_arg = "all".to_string();
    let mut format = "json".to_string();
    let mut out_path: Option<String> = None;
    let mut fail_on_bad = false;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--action" if i + 1 < args.len() => {
                action = args[i + 1].clone();
                i += 1;
            }
            "--drives" if i + 1 < args.len() => {
                drives_arg = args[i + 1].clone();
                i += 1;
            }
            "--format" if i + 1 < args.len() => {
                format = args[i + 1].to_lowercase();
                i += 1;
            }
            "--out" if i + 1 < args.len() => {
                out_path = Some(args[i + 1].clone());
                i += 1;
            }
            "--fail-on-bad" => {
                fail_on_bad = true;
            }
            _ => {}
        }
        i += 1;
    }

    let all_drives = match get_physical_drives() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Batch drive enumeration failed: {}", e);
            return 2;
        }
    };

    let target_indices: Option<Vec<u64>> = if drives_arg.eq_ignore_ascii_case("all") {
        None
    } else {
        Some(
            drives_arg
                .split(',')
                .filter_map(|s| s.trim().parse::<u64>().ok())
                .collect(),
        )
    };

    let mut results = Vec::new();
    let mut has_bad = false;
    let mut has_warn = false;

    for drv in all_drives {
        let idx = drv["driveIndex"].as_u64().unwrap_or(0);
        if let Some(ref allowed) = target_indices {
            if !allowed.contains(&idx) {
                continue;
            }
        }

        let mut drive_warn = false;
        let health = drv["reliabilityScore"].as_f64();
        let temp = drv["temperatureC"].as_u64();
        let realloc = drv["reallocatedSectors"].as_u64().unwrap_or(0);

        if let Some(h) = health {
            if h < 70.0 {
                drive_warn = true;
                has_warn = true;
            }
        }
        if let Some(t) = temp {
            if t >= 58 {
                drive_warn = true;
                has_warn = true;
            }
        }
        if realloc > 0 {
            drive_warn = true;
            has_warn = true;
        }

        let mut bad_lbas_detected = 0u64;
        let mut verify_samples = 0u64;

        if action == "quick-verify" || action == "full-audit" {
            let sec_size = drv["sectorSize"].as_u64().unwrap_or(512).max(512);
            let cap_bytes = drv["totalCapacityBytes"].as_u64().unwrap_or(0);
            let total_sectors = cap_bytes / sec_size;
            let sample_points: u64 = if action == "full-audit" { 64 } else { 12 };
            if total_sectors > 0 {
                for step in 0..sample_points {
                    let probe_lba = (step * total_sectors) / sample_points.max(1);
                    verify_samples += 1;
                    if let Ok(res) = scan_lba_block(idx as u32, probe_lba, 64.min(total_sectors - probe_lba).max(1)) {
                        let code = res["statusCode"].as_u64().unwrap_or(4);
                        if code >= 4 {
                            bad_lbas_detected += 1;
                            has_bad = true;
                        } else if code >= 2 {
                            drive_warn = true;
                            has_warn = true;
                        }
                    } else {
                        drive_warn = true;
                        has_warn = true;
                    }
                }
            }
        }

        results.push(serde_json::json!({
            "driveIndex": idx,
            "model": drv["model"],
            "serialNumber": drv["serialNumber"],
            "busType": drv["busType"],
            "healthScore": health,
            "temperatureC": temp,
            "powerOnHours": drv["powerOnHours"],
            "reallocatedSectors": realloc,
            "verifySamples": verify_samples,
            "badBlocksDetected": bad_lbas_detected,
            "status": if bad_lbas_detected > 0 { "BAD" } else if drive_warn { "WARNING" } else { "HEALTHY" }
        }));
    }

    let rendered = if format == "csv" {
        let mut lines = vec![
            "driveIndex,model,serialNumber,busType,healthScore,temperatureC,powerOnHours,reallocatedSectors,verifySamples,badBlocksDetected,status".to_string()
        ];
        for r in &results {
            let csv_escape = |s: &str| format!("\"{}\"", s.replace('"', "\"\""));
            lines.push(format!(
                "{},{},{},{},{},{},{},{},{},{},{}",
                r["driveIndex"],
                csv_escape(r["model"].as_str().unwrap_or("")),
                csv_escape(r["serialNumber"].as_str().unwrap_or("")),
                csv_escape(r["busType"].as_str().unwrap_or("")),
                r["healthScore"],
                r["temperatureC"],
                r["powerOnHours"],
                r["reallocatedSectors"],
                r["verifySamples"],
                r["badBlocksDetected"],
                csv_escape(r["status"].as_str().unwrap_or("HEALTHY"))
            ));
        }
        lines.join("\n")
    } else {
        serde_json::to_string_pretty(&serde_json::json!({
            "action": action,
            "generatedAt": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            "drives": results
        }))
        .unwrap_or_else(|_| "{}".to_string())
    };

    if let Some(ref path) = out_path {
        if let Some(parent) = std::path::Path::new(path).parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    eprintln!("Failed to create output directory: {}", e);
                    return 2;
                }
            }
        }
        if let Err(e) = std::fs::write(path, rendered.as_bytes()) {
            eprintln!("Failed to write report '{}': {}", path, e);
            return 2;
        }
    } else {
        println!("{}", rendered);
    }

    if fail_on_bad {
        if has_bad {
            20
        } else if has_warn {
            10
        } else {
            0
        }
    } else {
        0
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--batch") {
        let code = run_cli_batch_mode(&args[1..]);
        std::process::exit(code);
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_native_engine_version,
            scan_lba_block,
            scan_lba_batch,
            verify_lba_block,
            get_physical_drives,
            read_raw_sector,
            read_raw_sector_range,
            read_raw_sector_range_b64,
            run_lba_benchmark_sample,
            copy_lba_range_to_file,
            save_lba_clone_map,
            load_lba_clone_map,
            start_ddrescue_backup,
            get_ddrescue_backup_status,
            pause_ddrescue_backup,
            inspect_sanitize_capabilities,
            execute_sanitize_or_trim,
            scan_multiple_drives_parallel,
            attempt_sector_repair,
            execute_bit_carving,
            run_tray_guardian_check,
            run_smart_self_test,
            get_smart_self_test_status,
            poll_drive_temperatures,
            get_drive_identify_data,
            get_drive_features,
            set_drive_aam,
            set_drive_apm,
            set_drive_write_cache,
            set_drive_read_look_ahead,
            set_drive_standby_timer,
            spindown_drive_now,
            get_smart_extended_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running Disk Bad Sector Scanner tauri application");
}
