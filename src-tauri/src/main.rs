// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use disksentinel_core::*;

#[tauri::command]
fn get_native_engine_version() -> String {
    "4.6.0".to_string()
}

#[tauri::command]
fn read_raw_sector(drive_index: u32, lba: u64, size: u32) -> Result<Vec<u8>, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut buffer = vec![0u8; size as usize];
    let ok = unsafe { DS_ReadRawSector(handle, lba, buffer.as_mut_ptr(), size) };
    unsafe { DS_CloseDrive(handle) };

    if !ok {
        return Err("Read operation returned failure".to_string());
    }

    Ok(buffer)
}

#[tauri::command]
fn scan_lba_block(drive_index: u32, lba: u64, sector_count: u64) -> Result<serde_json::Value, String> {
    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut total_latency_ms = 0.0;
    let mut final_result: DSBlockResult = unsafe { std::mem::zeroed() };
    let mut remaining = sector_count.max(1);
    let mut current_lba = lba;
    let mut all_ok = true;

    while remaining > 0 {
        let chunk = remaining.min(u32::MAX as u64) as u32;
        let mut chunk_res: DSBlockResult = unsafe { std::mem::zeroed() };
        let ok = unsafe { DS_ScanLbaBlock(handle, current_lba, chunk, &mut chunk_res) };
        total_latency_ms += chunk_res.latency_ms;
        final_result = chunk_res;
        if !ok {
            all_ok = false;
            break;
        }
        current_lba = current_lba.saturating_add(chunk as u64);
        remaining -= chunk as u64;
    }

    unsafe { DS_CloseDrive(handle) };

    if !all_ok {
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

#[tauri::command]
fn attempt_sector_repair(drive_index: u32, lba: u64, count: u32) -> Result<serde_json::Value, String> {
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

            let is_external = bus.eq_ignore_ascii_case("USB") || bus.to_lowercase().contains("usb");

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
                "connectionType": if is_external { "usb" } else { "internal" },
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_native_engine_version,
            scan_lba_block,
            get_physical_drives,
            read_raw_sector,
            scan_multiple_drives_parallel,
            attempt_sector_repair,
            execute_bit_carving,
            run_tray_guardian_check
        ])
        .run(tauri::generate_context!())
        .expect("error while running DiskSentinel Pro tauri application");
}
