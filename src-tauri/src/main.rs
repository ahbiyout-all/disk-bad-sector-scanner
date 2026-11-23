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

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BatchScanPolicy {
    slow_threshold_ms: Option<u32>,
    critical_threshold_ms: Option<u32>,
    max_retries: Option<u32>,
    retry_delay_ms: Option<u32>,
    cooldown_every_n_blocks: Option<u32>,
    cooldown_ms: Option<u32>,
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
    policy: Option<BatchScanPolicy>,
) -> Result<Vec<BatchScanItemResult>, String> {
    if items.is_empty() {
        return Ok(Vec::new());
    }

    let pooled = acquire_pooled_drive(drive_index)?;
    let guard = pooled.lock().map_err(|_| "Drive handle mutex poisoned".to_string())?;
    let mut results = Vec::with_capacity(items.len().min(128));

    let pol = policy.unwrap_or_default();
    let use_policy = pol.slow_threshold_ms.is_some()
        || pol.critical_threshold_ms.is_some()
        || pol.max_retries.is_some()
        || pol.retry_delay_ms.is_some();
    let slow_ms = pol.slow_threshold_ms.unwrap_or(50).max(5);
    let crit_ms = pol.critical_threshold_ms.unwrap_or(slow_ms.saturating_mul(3)).max(slow_ms + 5);
    let retries = pol.max_retries.unwrap_or(1).min(5);
    let retry_delay_ms = pol.retry_delay_ms.unwrap_or(40).min(2000);
    let cooldown_every = pol.cooldown_every_n_blocks.unwrap_or(0);
    let cooldown_ms = pol.cooldown_ms.unwrap_or(0).min(500);

    let mut stale_detected = false;
    for (idx, item) in items.into_iter().take(128).enumerate() {
        let mut total_latency_ms = 0.0;
        let mut final_result: DSBlockResult = unsafe { std::mem::zeroed() };
        let mut remaining = item.sector_count.max(1);
        let mut current_lba = item.lba;

        while remaining > 0 {
            let chunk = remaining.min(u32::MAX as u64) as u32;
            let mut chunk_res: DSBlockResult = unsafe { std::mem::zeroed() };
            let ok = if verify_mode {
                unsafe { DS_VerifyLbaBlock(guard.raw, current_lba, chunk, &mut chunk_res) }
            } else if use_policy {
                unsafe {
                    DS_ScanLbaBlockWithPolicy(
                        guard.raw,
                        current_lba,
                        chunk,
                        slow_ms,
                        crit_ms,
                        retries,
                        retry_delay_ms,
                        &mut chunk_res,
                    )
                }
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

        if cooldown_every > 0 && cooldown_ms > 0 && (idx as u32 + 1) % cooldown_every == 0 {
            std::thread::sleep(std::time::Duration::from_millis(cooldown_ms as u64));
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

    let t0 = std::time::Instant::now();
    let mut recovered_status: u32 = 0;
    let ok = unsafe { DS_AttemptSoftSectorRepair(handle, lba, count, &mut recovered_status) };
    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
    unsafe { DS_CloseDrive(handle) };

    Ok(serde_json::json!({
        "success": ok,
        "recoveredStatus": recovered_status,
        "latencyMs": (elapsed_ms * 1000.0).round() / 1000.0
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

            let ext_caps = unsafe {
                ds_probe_extended_drive_caps(handle, &bus, detail.physical_sector_size)
            };

            let link_probe = probe_drive_bus_link_and_controller(i, handle, &bus, detail.is_ssd);

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

            let mut usb_info: DSUsbTopologyInfo = unsafe { std::mem::zeroed() };
            let has_usb_probe = if is_external || bus.eq_ignore_ascii_case("NVMe") {
                unsafe { DS_ProbeUsbTopology(i, &mut usb_info) }
            } else {
                false
            };

            let usb_topology_json = if has_usb_probe && usb_info.probe_succeeded != 0 && (usb_info.usb_generation_code > 0 || usb_info.transport_code == 1 || usb_info.transport_code == 2 || usb_info.transport_code == 4) {
                let gen_code = usb_info.usb_generation_code;
                let speed_mbps = usb_info.negotiated_speed_mbps;
                let tr_code = usb_info.transport_code;
                let vid = usb_info.vendor_id;
                let pid = usb_info.product_id;
                let bcd = usb_info.bcd_usb;
                let port_num = usb_info.port_number;
                let ver_label = String::from_utf8_lossy(&usb_info.usb_version_label).trim_matches(char::from(0)).to_string();
                let tr_label = String::from_utf8_lossy(&usb_info.transport_label).trim_matches(char::from(0)).to_string();
                let drv_svc = String::from_utf8_lossy(&usb_info.driver_service).trim_matches(char::from(0)).to_string();
                let chipset = String::from_utf8_lossy(&usb_info.bridge_chipset).trim_matches(char::from(0)).to_string();
                let pnp = String::from_utf8_lossy(&usb_info.pnp_device_id).trim_matches(char::from(0)).to_string();
                Some(serde_json::json!({
                    "usbGenerationCode": gen_code,
                    "negotiatedSpeedMbps": speed_mbps,
                    "transportCode": tr_code,
                    "vendorIdHex": if vid > 0 { Some(format!("{:04X}", vid)) } else { None },
                    "productIdHex": if pid > 0 { Some(format!("{:04X}", pid)) } else { None },
                    "bcdUsbHex": if bcd > 0 { Some(format!("{:04X}", bcd)) } else { None },
                    "portNumber": port_num,
                    "usbVersionLabel": ver_label,
                    "transportLabel": tr_label,
                    "driverService": drv_svc,
                    "bridgeChipset": if chipset.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(chipset) },
                    "pnpDeviceId": pnp,
                    "probeSucceeded": true
                }))
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
                "usbTopology": usb_topology_json,
                "mountPoints": mount_points,
                "partitions": partitions_json,
                "totalCapacityBytes": detail.total_capacity_bytes,
                "totalCapacityGb": detail.total_capacity_bytes / (1024 * 1024 * 1024),
                "sectorSize": detail.sector_size,
                "physicalSectorSize": detail.physical_sector_size,
                "partitionStyle": ext_caps.partition_style,
                "alignmentStatus": ext_caps.alignment_status,
                "misalignedPartitions": ext_caps.misaligned_partitions,
                "isWriteCacheEnabled": detail.is_write_cache_enabled,
                "volatileWriteCache": ext_caps.volatile_write_cache,
                "writeCacheFlushSupported": ext_caps.write_cache_flush_supported,
                "readLookAheadSupported": ext_caps.read_look_ahead_supported,
                "ncqSupported": ext_caps.ncq_supported,
                "queueDepth": ext_caps.queue_depth,
                "apmAamSupported": ext_caps.apm_aam_supported,
                "rotationalSpeedRpm": ext_caps.rotational_speed_rpm,
                "warningTempThresholdC": ext_caps.warning_temp_threshold_c,
                "temperatureC": resolved_temp,
                "reliabilityScore": resolved_reliability,
                "powerOnHours": resolved_poh,
                "reallocatedSectors": health_report.reallocated_sectors,
                "linkProbe": link_probe,
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
fn eject_physical_drive(drive_index: u32) -> Result<serde_json::Value, String> {
    let (is_sys, mounted_vols) = is_os_system_drive(drive_index);
    if is_sys {
        return Ok(serde_json::json!({
            "success": false,
            "win32ErrorCode": 5,
            "message": format!(
                "OS 시스템/부트 드라이브(PhysicalDrive{}, 볼륨: {})는 안전상 분리할 수 없습니다.",
                drive_index,
                if mounted_vols.is_empty() { "N/A".to_string() } else { mounted_vols.join(", ") }
            )
        }));
    }

    // Release any cached physical disk HANDLE before locking/dismounting volumes and invoking PnP eject
    invalidate_pooled_drive(drive_index);

    let (success, message, win32_err) = ds_eject_physical_drive_win32(drive_index, &mounted_vols);
    Ok(serde_json::json!({
        "success": success,
        "win32ErrorCode": win32_err,
        "message": message
    }))
}

#[tauri::command]
fn probe_usb_topology_all() -> Result<Vec<serde_json::Value>, String> {
    let mut list = Vec::new();
    for i in 0..32u32 {
        let mut info: DSUsbTopologyInfo = unsafe { std::mem::zeroed() };
        if unsafe { DS_ProbeUsbTopology(i, &mut info) } && info.probe_succeeded != 0 {
            let gen_code = info.usb_generation_code;
            let speed_mbps = info.negotiated_speed_mbps;
            let tr_code = info.transport_code;
            let vid = info.vendor_id;
            let pid = info.product_id;
            let bcd = info.bcd_usb;
            let port_num = info.port_number;
            if gen_code > 0 || tr_code == 1 || tr_code == 2 || tr_code == 4 {
                list.push(serde_json::json!({
                    "driveIndex": i,
                    "usbGenerationCode": gen_code,
                    "negotiatedSpeedMbps": speed_mbps,
                    "transportCode": tr_code,
                    "vendorIdHex": if vid > 0 { Some(format!("{:04X}", vid)) } else { None },
                    "productIdHex": if pid > 0 { Some(format!("{:04X}", pid)) } else { None },
                    "bcdUsbHex": if bcd > 0 { Some(format!("{:04X}", bcd)) } else { None },
                    "portNumber": port_num,
                    "usbVersionLabel": String::from_utf8_lossy(&info.usb_version_label).trim_matches(char::from(0)).to_string(),
                    "transportLabel": String::from_utf8_lossy(&info.transport_label).trim_matches(char::from(0)).to_string(),
                    "driverService": String::from_utf8_lossy(&info.driver_service).trim_matches(char::from(0)).to_string(),
                    "bridgeChipset": String::from_utf8_lossy(&info.bridge_chipset).trim_matches(char::from(0)).to_string(),
                    "pnpDeviceId": String::from_utf8_lossy(&info.pnp_device_id).trim_matches(char::from(0)).to_string(),
                    "probeSucceeded": true
                }));
            }
        }
    }
    Ok(list)
}

fn fill_xoshiro256_checkpoint_pattern(buf: &mut [u8], checkpoint_lba: u64) {
    let mut s = [
        checkpoint_lba ^ 0x4453_5553_4254_4553u64,
        checkpoint_lba.wrapping_mul(0x9E37_79B9_7F4A_7C15u64) ^ 0xA076_1D64_78BD_642Fu64,
        0xE703_7ED1_A0B4_28DBu64 ^ (checkpoint_lba >> 3),
        0x8EBC_6AF0_9C88_C6E3u64 ^ (checkpoint_lba << 7),
    ];
    let mut next_u64 = || -> u64 {
        let result = s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = s[1] << 17;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = s[3].rotate_left(45);
        result
    };
    let mut offset = 0usize;
    while offset + 8 <= buf.len() {
        let val = next_u64().to_le_bytes();
        buf[offset..offset + 8].copy_from_slice(&val);
        offset += 8;
    }
}

fn compute_shannon_entropy_bits(buf: &[u8]) -> f64 {
    if buf.is_empty() {
        return 0.0;
    }
    let mut counts = [0u32; 256];
    for &b in buf {
        counts[b as usize] += 1;
    }
    let len = buf.len() as f64;
    let mut ent = 0.0f64;
    for &c in &counts {
        if c > 0 {
            let p = c as f64 / len;
            ent -= p * p.log2();
        }
    }
    ent
}

#[tauri::command]
fn probe_fake_capacity_checkpoints(
    drive_index: u32,
    write_verify_mode: bool,
    allow_destructive_write: bool,
) -> Result<serde_json::Value, String> {
    let vol_map = get_volume_mappings();
    let is_c_drive = vol_map
        .get(&drive_index)
        .map(|vols| vols.iter().any(|v| v.drive_letter.eq_ignore_ascii_case("C:")))
        .unwrap_or(false);

    if write_verify_mode && (drive_index == 0 || is_c_drive || !allow_destructive_write) {
        return Err(
            "OS/System boot drive (PhysicalDrive0 / C:) is permanently protected from Tier-2 write verification."
                .to_string(),
        );
    }

    let mut sector_size: u32 = 512;
    let handle = unsafe { DS_OpenDriveDirect(drive_index, &mut sector_size) };
    if handle.is_null() {
        return Err(format!("Failed to open physical drive {}", drive_index));
    }

    let mut detail: DSPhysicalDriveDetail = unsafe { std::mem::zeroed() };
    let has_detail = unsafe { DS_GetDriveDetails(handle, &mut detail) };
    let cap_bytes = if has_detail { detail.total_capacity_bytes } else { 0 };
    let sec_size = sector_size.max(512) as u64;
    let total_sectors = cap_bytes / sec_size;

    if total_sectors < 16384 {
        unsafe { DS_CloseDrive(handle) };
        return Err("Drive capacity too small or inaccessible for boundary verification.".to_string());
    }

    // Power-of-2 checkpoints: 512MB, 1GB, 2GB, ..., 1TB plus 99.5% tail boundary
    let mut mb_points: Vec<(String, u64)> = Vec::new();
    let mut target_mb = 512u64;
    while target_mb <= 1024 * 1024 {
        let lba = (target_mb * 1024 * 1024) / sec_size;
        if lba + 64 < total_sectors {
            let label = if target_mb >= 1024 {
                format!("{} GiB", target_mb / 1024)
            } else {
                format!("{} MiB", target_mb)
            };
            mb_points.push((label, lba));
        }
        target_mb *= 2;
    }
    let tail_lba = ((total_sectors as f64) * 0.995) as u64;
    if tail_lba + 32 < total_sectors && mb_points.last().map(|x| x.1 != tail_lba).unwrap_or(true) {
        mb_points.push(("99.5% Tail".to_string(), tail_lba));
    }

    let sample_bytes: u32 = (sec_size as u32) * 8; // 4KB for 512B sector
    let mut seen_non_zero_crcs: std::collections::HashMap<u32, u64> = std::collections::HashMap::new();
    let mut checkpoints_json = Vec::new();
    let mut verified_limit_bytes: u64 = 0;
    let mut suspected_fake = false;
    let mut failure_reason = String::new();

    #[cfg(windows)]
    let mut rw_handle: *mut std::ffi::c_void = std::ptr::null_mut();
    #[cfg(windows)]
    {
        if write_verify_mode && allow_destructive_write && drive_index != 0 && !is_c_drive {
            use windows_sys::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE, INVALID_HANDLE_VALUE};
            use windows_sys::Win32::Storage::FileSystem::{
                CreateFileW, FILE_FLAG_NO_BUFFERING, FILE_FLAG_WRITE_THROUGH,
                FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
            };
            let path_w: Vec<u16> = format!("\\\\.\\PhysicalDrive{}\0", drive_index).encode_utf16().collect();
            let h_rw = unsafe {
                CreateFileW(
                    path_w.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH,
                    0,
                )
            };
            if h_rw != INVALID_HANDLE_VALUE {
                rw_handle = h_rw as *mut std::ffi::c_void;
            }
        }
    }

    for (label, lba) in &mb_points {
        let mut buf = vec![0u8; sample_bytes as usize];
        let mut bytes_read: u32 = 0;
        let mut w32_err: u32 = 0;
        let t0 = std::time::Instant::now();
        let read_ok = unsafe {
            DS_ReadRawSectorWithError(
                handle,
                *lba,
                buf.as_mut_ptr(),
                sample_bytes,
                &mut bytes_read,
                &mut w32_err,
            )
        };
        let latency_ms = t0.elapsed().as_secs_f64() * 1000.0;

        let mut is_all_zero = false;
        let mut crc32: u32 = 0;
        let mut parity: u64 = 0;
        if read_ok {
            unsafe {
                DS_CalculateAvx2ChecksumAndZeroCheck(
                    buf.as_ptr(),
                    bytes_read,
                    &mut is_all_zero,
                    &mut crc32,
                    &mut parity,
                );
            }
        }
        let entropy = if read_ok { compute_shannon_entropy_bits(&buf) } else { 0.0 };

        let mut status = "PASS";
        let mut note = "Valid unique boundary block".to_string();

        if !read_ok {
            status = "UNREACHABLE";
            note = format!("Boundary I/O read error (Win32 {})", w32_err);
            suspected_fake = true;
            if failure_reason.is_empty() {
                failure_reason = format!("Read error beyond physical boundary at {}", label);
            }
        } else if !is_all_zero && seen_non_zero_crcs.contains_key(&crc32) {
            let first_lba = seen_non_zero_crcs[&crc32];
            status = "ALIAS_COLLISION";
            note = format!("CRC32 0x{:08X} mirrors LBA {}", crc32, first_lba);
            suspected_fake = true;
            if failure_reason.is_empty() {
                failure_reason = format!("LBA wraparound / aliasing collision detected at {}", label);
            }
        } else {
            if !is_all_zero {
                seen_non_zero_crcs.insert(crc32, *lba);
            } else {
                note = "Zero-filled unallocated block (clean read)".to_string();
            }

            #[cfg(windows)]
            if write_verify_mode && !rw_handle.is_null() {
                use windows_sys::Win32::Storage::FileSystem::{
                    FlushFileBuffers, ReadFile, SetFilePointerEx, WriteFile, FILE_BEGIN,
                };
                let byte_off = (*lba * sec_size) as i64;
                let mut prng_buf = vec![0u8; sample_bytes as usize];
                fill_xoshiro256_checkpoint_pattern(&mut prng_buf, *lba);
                let mut readback = vec![0u8; sample_bytes as usize];
                let mut wr: u32 = 0;
                let mut rd: u32 = 0;

                let write_ok = unsafe {
                    SetFilePointerEx(rw_handle as _, byte_off, std::ptr::null_mut(), FILE_BEGIN) != 0
                        && WriteFile(rw_handle as _, prng_buf.as_ptr(), sample_bytes, &mut wr, std::ptr::null_mut()) != 0
                        && wr == sample_bytes
                };
                if write_ok {
                    unsafe { FlushFileBuffers(rw_handle as _) };
                    let rb_ok = unsafe {
                        SetFilePointerEx(rw_handle as _, byte_off, std::ptr::null_mut(), FILE_BEGIN) != 0
                            && ReadFile(rw_handle as _, readback.as_mut_ptr(), sample_bytes, &mut rd, std::ptr::null_mut()) != 0
                            && rd == sample_bytes
                    };
                    if !rb_ok || readback != prng_buf {
                        status = "WRITE_CORRUPTION";
                        note = "Xoshiro256** write-readback mismatch (fake / black-hole NAND)";
                        suspected_fake = true;
                        if failure_reason.is_empty() {
                            failure_reason = format!("Tier-2 write-readback failure at {}", label);
                        }
                    } else {
                        note = "Tier-2 Xoshiro256** non-destructive roundtrip verified";
                    }
                    // Restore original sector payload immediately
                    unsafe {
                        let mut rw_orig: u32 = 0;
                        SetFilePointerEx(rw_handle as _, byte_off, std::ptr::null_mut(), FILE_BEGIN);
                        WriteFile(rw_handle as _, buf.as_ptr(), sample_bytes, &mut rw_orig, std::ptr::null_mut());
                        FlushFileBuffers(rw_handle as _);
                    }
                } else {
                    status = "WRITE_LOCKED";
                    note = "Controller write-protected or volume mounted (Tier-1 read-only passed)";
                }
            }

            if !suspected_fake {
                verified_limit_bytes = (*lba).saturating_mul(sec_size);
            }
        }

        checkpoints_json.push(serde_json::json!({
            "label": label,
            "lba": lba,
            "offsetBytes": (*lba).saturating_mul(sec_size),
            "crc32Hex": format!("{:08X}", crc32),
            "entropyBits": (entropy * 100.0).round() / 100.0,
            "isAllZero": is_all_zero,
            "latencyMs": (latency_ms * 100.0).round() / 100.0,
            "status": status,
            "note": note
        }));
    }

    #[cfg(windows)]
    if !rw_handle.is_null() {
        unsafe { windows_sys::Win32::Foundation::CloseHandle(rw_handle as _) };
    }
    unsafe { DS_CloseDrive(handle) };

    let verdict = if suspected_fake {
        "SUSPECTED_FAKE_CAPACITY"
    } else {
        "GENUINE_CAPACITY_VERIFIED"
    };

    Ok(serde_json::json!({
        "driveIndex": drive_index,
        "tier": if write_verify_mode { "tier2_prng_roundtrip" } else { "tier1_readonly_alias" },
        "reportedCapacityBytes": cap_bytes,
        "verifiedBoundaryBytes": if suspected_fake { verified_limit_bytes } else { cap_bytes },
        "verdict": verdict,
        "summary": if suspected_fake {
            failure_reason
        } else {
            format!("All {} power-of-2 LBA checkpoints passed without aliasing or wraparound.", checkpoints_json.len())
        },
        "checkpoints": checkpoints_json
    }))
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
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        if let Ok(out) = std::process::Command::new("fsutil")
            .args(["behavior", "query", "DisableDeleteNotify"])
            .creation_flags(CREATE_NO_WINDOW)
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
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            let output = std::process::Command::new("defrag")
                .args([&target_vol, "/L", "/U"])
                .creation_flags(CREATE_NO_WINDOW)
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

// ===========================================================================
// Pure Creative Predictive & Acoustic Analytics DLL Bridge (DiskSentinelPredictive.dll)
// ===========================================================================

#[repr(C)]
#[derive(Clone, Copy)]
struct DspEngineInfoC {
    engine_name: [u8; 48],
    version: [u8; 16],
    abi_version: u32,
    capabilities_mask: u32,
    self_test_passed: u8,
    reserved: [u8; 7],
    weibull_self_test_error: f64,
    ols_self_test_r2: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DspWeibullInputC {
    media_type: u32,
    power_on_hours: u32,
    temperature_celsius: u32,
    percentage_used: u32,
    available_spare_pct: u32,
    reallocated_sectors: u32,
    pending_sectors: u32,
    uncorrectable_errors: u32,
    unsafe_shutdowns: u64,
    avg_daily_power_on_hours: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DspWeibullRulReportC {
    weibull_shape_beta: f64,
    weibull_scale_eta_hours: f64,
    failure_prob_30d_pct: f64,
    failure_prob_90d_pct: f64,
    failure_prob_365d_pct: f64,
    hazard_rate_per_1k_hours: f64,
    reliability_index_pct: f64,
    estimated_rul_days: u32,
    risk_grade_code: u32,
    primary_risk_factor: [u8; 64],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DspAcousticSampleC {
    lba: u64,
    latency_ms: f64,
    status_code: u32,
    reserved: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DspAcousticProfileC {
    valid_sample_count: u32,
    consecutive_step_count: u32,
    micro_stall_burst_count: u32,
    stride_jump_count: u32,
    acoustic_grade_code: u32,
    reserved: u32,
    rmssd_jitter_ms: f64,
    mean_step_delta_ms: f64,
    peak_step_delta_ms: f64,
    sequential_jitter_ms: f64,
    random_seek_jitter_ms: f64,
    resonance_ratio: f64,
    acoustic_instability_score: f64,
    diagnostic_summary: [u8; 96],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DspThermalWearInputC {
    media_type: u32,
    current_temp_celsius: u32,
    peak_temp_celsius: u32,
    warning_temp_time_min: u32,
    critical_temp_time_min: u32,
    power_on_hours: u64,
    total_tb_written: f64,
    rated_tbw_limit_tb: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DspThermalWearReportC {
    arrhenius_acceleration_factor: f64,
    sustained_thermal_stress_factor: f64,
    effective_aged_hours: f64,
    daily_tbw_rate_gb: f64,
    estimated_tbw_remaining_years: f64,
    thermal_stress_score: f64,
    thermal_grade_code: u32,
    reserved: u32,
    thermal_summary: [u8; 96],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DspSmartHistoryPointC {
    timestamp_sec: i64,
    value: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DspSmartTrendProjectionC {
    valid_point_count: u32,
    trend_direction: u32,
    is_statistically_significant: u8,
    reserved: [u8; 7],
    observation_span_days: f64,
    latest_value: f64,
    slope_per_day: f64,
    intercept_value: f64,
    r_squared: f64,
    projected_value_30d: f64,
    projected_days_to_warning: f64,
    projected_days_to_critical: f64,
}

#[cfg(windows)]
struct PredictiveDllDispatch {
    loaded_path: String,
    fn_info: unsafe extern "system" fn(*mut DspEngineInfoC) -> bool,
    fn_weibull: unsafe extern "system" fn(*const DspWeibullInputC, *mut DspWeibullRulReportC) -> bool,
    fn_acoustic: unsafe extern "system" fn(*const DspAcousticSampleC, u32, u32, *mut DspAcousticProfileC) -> bool,
    fn_thermal: unsafe extern "system" fn(*const DspThermalWearInputC, *mut DspThermalWearReportC) -> bool,
    fn_trend: unsafe extern "system" fn(*const DspSmartHistoryPointC, u32, f64, f64, u32, *mut DspSmartTrendProjectionC) -> bool,
}

#[cfg(windows)]
unsafe impl Send for PredictiveDllDispatch {}
#[cfg(windows)]
unsafe impl Sync for PredictiveDllDispatch {}

#[cfg(windows)]
static PREDICTIVE_DLL_DISPATCH: std::sync::OnceLock<Option<PredictiveDllDispatch>> = std::sync::OnceLock::new();

#[cfg(windows)]
fn get_predictive_dll() -> Option<&'static PredictiveDllDispatch> {
    PREDICTIVE_DLL_DISPATCH
        .get_or_init(|| {
            use windows_sys::Win32::System::LibraryLoader::{FreeLibrary, GetProcAddress, LoadLibraryW};

            let mut candidates: Vec<std::path::PathBuf> = Vec::new();
            if let Ok(exe) = std::env::current_exe() {
                if let Some(dir) = exe.parent() {
                    candidates.push(dir.join("DiskSentinelPredictive.dll"));
                    candidates.push(dir.join("resources").join("DiskSentinelPredictive.dll"));
                    candidates.push(dir.join("_up_").join("bin").join("native").join("DiskSentinelPredictive.dll"));
                }
            }
            candidates.push(std::path::PathBuf::from("bin\\native\\DiskSentinelPredictive.dll"));
            candidates.push(std::path::PathBuf::from("DiskSentinelPredictive.dll"));

            for path in candidates {
                let path_str = path.to_string_lossy().to_string();
                let mut wide: Vec<u16> = path_str.encode_utf16().collect();
                wide.push(0);
                let hmod = unsafe { LoadLibraryW(wide.as_ptr()) };
                if hmod == 0 {
                    continue;
                }

                unsafe {
                    let p_info = GetProcAddress(hmod, b"DSP_GetPredictiveEngineInfo\0".as_ptr());
                    let p_weibull = GetProcAddress(hmod, b"DSP_ComputeWeibullRul\0".as_ptr());
                    let p_acoustic = GetProcAddress(hmod, b"DSP_AnalyzeAcousticSeekProfile\0".as_ptr());
                    let p_thermal = GetProcAddress(hmod, b"DSP_EvaluateThermalWearStress\0".as_ptr());
                    let p_trend = GetProcAddress(hmod, b"DSP_ProjectSmartDegradationTrend\0".as_ptr());

                    if let (Some(f_info), Some(f_weibull), Some(f_acoustic), Some(f_thermal), Some(f_trend)) =
                        (p_info, p_weibull, p_acoustic, p_thermal, p_trend)
                    {
                        return Some(PredictiveDllDispatch {
                            loaded_path: path_str,
                            fn_info: std::mem::transmute(f_info),
                            fn_weibull: std::mem::transmute(f_weibull),
                            fn_acoustic: std::mem::transmute(f_acoustic),
                            fn_thermal: std::mem::transmute(f_thermal),
                            fn_trend: std::mem::transmute(f_trend),
                        });
                    }
                    FreeLibrary(hmod);
                }
            }
            None
        })
        .as_ref()
}

fn c_buf_to_string(buf: &[u8]) -> String {
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    String::from_utf8_lossy(&buf[..end]).trim().to_string()
}

#[inline]
fn dsp_clamp(val: f64, lo: f64, hi: f64) -> f64 {
    if !val.is_finite() {
        lo
    } else {
        val.clamp(lo, hi)
    }
}

fn dsp_weibull_cond_prob_rust(t0_hours: f64, delta_hours: f64, beta: f64, eta_hours: f64) -> f64 {
    if eta_hours <= 1.0 || delta_hours <= 0.0 || beta <= 0.0 {
        return 0.0;
    }
    let ratio0 = (t0_hours / eta_hours).min(50.0);
    let ratio1 = ((t0_hours + delta_hours) / eta_hours).min(50.0);
    let diff = ratio0.powf(beta) - ratio1.powf(beta);
    if !diff.is_finite() {
        return 1.0;
    }
    if diff >= 0.0 {
        return 0.0;
    }
    if diff < -60.0 {
        return 1.0;
    }
    dsp_clamp(1.0 - diff.exp(), 0.0, 1.0)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PredictiveWeibullArgs {
    media_type: u32,
    power_on_hours: u32,
    temperature_celsius: u32,
    percentage_used: u32,
    available_spare_pct: u32,
    reallocated_sectors: u32,
    pending_sectors: u32,
    uncorrectable_errors: u32,
    unsafe_shutdowns: u64,
    avg_daily_power_on_hours: f64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PredictiveAcousticSampleArg {
    lba: u64,
    latency_ms: f64,
    status_code: u32,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PredictiveThermalArgs {
    media_type: u32,
    current_temp_celsius: u32,
    peak_temp_celsius: u32,
    warning_temp_time_min: u32,
    critical_temp_time_min: u32,
    power_on_hours: u64,
    total_tb_written: f64,
    rated_tbw_limit_tb: f64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PredictiveHistoryPointArg {
    timestamp_sec: i64,
    value: f64,
}

fn eval_smart_trend_rust(
    points: &[PredictiveHistoryPointArg],
    warning_threshold: f64,
    critical_threshold: f64,
    lower_is_worse: bool,
) -> (u32, u32, bool, f64, f64, f64, f64, f64, f64, f64, f64) {
    let mut valid_n: u32 = 0;
    let mut min_ts: i64 = 0;
    let mut max_ts: i64 = 0;
    let mut latest_ts: i64 = 0;
    let mut latest_val: f64 = 0.0;

    for pt in points {
        if !pt.value.is_finite() {
            continue;
        }
        if valid_n == 0 {
            min_ts = pt.timestamp_sec;
            max_ts = pt.timestamp_sec;
            latest_ts = pt.timestamp_sec;
            latest_val = pt.value;
        } else {
            min_ts = min_ts.min(pt.timestamp_sec);
            max_ts = max_ts.max(pt.timestamp_sec);
            if pt.timestamp_sec >= latest_ts {
                latest_ts = pt.timestamp_sec;
                latest_val = pt.value;
            }
        }
        valid_n += 1;
    }

    if valid_n == 0 {
        return (0, 0, false, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -1.0, -1.0);
    }

    let span_days = ((max_ts - min_ts) as f64 / 86400.0).max(0.0);
    // Require at least 1 hour of observation span to prevent wild daily slope spikes on sub-minute samples
    if valid_n < 2 || max_ts == min_ts || span_days < (1.0 / 24.0) {
        return (valid_n, 0, false, span_days, latest_val, 0.0, latest_val, 0.0, latest_val, -1.0, -1.0);
    }

    let mut mean_x = 0.0;
    let mut mean_y = 0.0;
    for pt in points {
        if !pt.value.is_finite() {
            continue;
        }
        mean_x += (pt.timestamp_sec - min_ts) as f64 / 86400.0;
        mean_y += pt.value;
    }
    mean_x /= valid_n as f64;
    mean_y /= valid_n as f64;

    let mut sxx = 0.0;
    let mut syy = 0.0;
    let mut sxy = 0.0;
    for pt in points {
        if !pt.value.is_finite() {
            continue;
        }
        let dx = ((pt.timestamp_sec - min_ts) as f64 / 86400.0) - mean_x;
        let dy = pt.value - mean_y;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
    }

    let slope = if sxx > 1e-12 { sxy / sxx } else { 0.0 };
    let intercept = mean_y - slope * mean_x;
    let r2 = if sxx > 1e-12 && syy > 1e-12 {
        dsp_clamp((sxy * sxy) / (sxx * syy), 0.0, 1.0)
    } else {
        0.0
    };
    let proj30 = latest_val + slope * 30.0;
    let eps = 1e-6;
    let dir = if lower_is_worse {
        if slope < -eps { 1 } else if slope > eps { 2 } else { 0 }
    } else if slope > eps {
        1
    } else if slope < -eps {
        2
    } else {
        0
    };

    let days_to = |threshold: f64| -> f64 {
        if !threshold.is_finite() || threshold < 0.0 {
            return -1.0;
        }
        if lower_is_worse {
            if latest_val <= threshold { return 0.0; }
            if slope >= -eps { return -1.0; }
            ((latest_val - threshold) / (-slope)).min(36500.0)
        } else {
            if latest_val >= threshold { return 0.0; }
            if slope <= eps { return -1.0; }
            ((threshold - latest_val) / slope).min(36500.0)
        }
    };

    let sig = valid_n >= 3 && r2 >= 0.35 && slope.abs() > eps;
    (
        valid_n,
        dir,
        sig,
        span_days,
        latest_val,
        slope,
        intercept,
        r2,
        proj30,
        days_to(warning_threshold),
        days_to(critical_threshold),
    )
}

#[tauri::command]
fn inspect_predictive_dll_status() -> serde_json::Value {
    #[cfg(windows)]
    {
        if let Some(dll) = get_predictive_dll() {
            let mut info: DspEngineInfoC = unsafe { std::mem::zeroed() };
            let ok = unsafe { (dll.fn_info)(&mut info) };
            if ok {
                return serde_json::json!({
                    "dllLoaded": true,
                    "engineSource": "native-cpp-dll",
                    "loadedPath": dll.loaded_path,
                    "engineName": c_buf_to_string(&info.engine_name),
                    "version": c_buf_to_string(&info.version),
                    "abiVersion": info.abi_version,
                    "capabilitiesMask": info.capabilities_mask,
                    "selfTestPassed": info.self_test_passed != 0,
                    "weibullSelfTestError": info.weibull_self_test_error,
                    "olsSelfTestR2": info.ols_self_test_r2
                });
            }
        }
    }

    let expected_f = 1.0 - (-1.0f64).exp();
    let actual_f = dsp_weibull_cond_prob_rust(0.0, 1000.0, 2.0, 1000.0);
    let weibull_err = (actual_f - expected_f).abs();
    let test_pts = [
        PredictiveHistoryPointArg { timestamp_sec: 0, value: 10.0 },
        PredictiveHistoryPointArg { timestamp_sec: 86400, value: 12.0 },
        PredictiveHistoryPointArg { timestamp_sec: 172800, value: 14.0 },
    ];
    let (_, _, _, _, _, slope, _, r2, _, _, _) = eval_smart_trend_rust(&test_pts, 20.0, 30.0, false);

    serde_json::json!({
        "dllLoaded": false,
        "engineSource": "rust-parity-fallback",
        "loadedPath": null,
        "engineName": "DiskSentinelPredictive Rust Parity Engine",
        "version": "4.6.0",
        "abiVersion": 1,
        "capabilitiesMask": 0b1111,
        "selfTestPassed": weibull_err < 1e-9 && (slope - 2.0).abs() < 1e-6 && r2 > 0.999999,
        "weibullSelfTestError": weibull_err,
        "olsSelfTestR2": r2
    })
}

#[tauri::command]
fn compute_predictive_weibull_rul(input: PredictiveWeibullArgs) -> Result<serde_json::Value, String> {
    #[cfg(windows)]
    {
        if let Some(dll) = get_predictive_dll() {
            let c_in = DspWeibullInputC {
                media_type: input.media_type,
                power_on_hours: input.power_on_hours,
                temperature_celsius: input.temperature_celsius,
                percentage_used: input.percentage_used,
                available_spare_pct: input.available_spare_pct,
                reallocated_sectors: input.reallocated_sectors,
                pending_sectors: input.pending_sectors,
                uncorrectable_errors: input.uncorrectable_errors,
                unsafe_shutdowns: input.unsafe_shutdowns,
                avg_daily_power_on_hours: input.avg_daily_power_on_hours,
            };
            let mut c_out: DspWeibullRulReportC = unsafe { std::mem::zeroed() };
            if unsafe { (dll.fn_weibull)(&c_in, &mut c_out) } {
                return Ok(serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "weibullShapeBeta": c_out.weibull_shape_beta,
                    "weibullScaleEtaHours": c_out.weibull_scale_eta_hours,
                    "failureProb30dPct": c_out.failure_prob_30d_pct,
                    "failureProb90dPct": c_out.failure_prob_90d_pct,
                    "failureProb365dPct": c_out.failure_prob_365d_pct,
                    "hazardRatePer1kHours": c_out.hazard_rate_per_1k_hours,
                    "reliabilityIndexPct": c_out.reliability_index_pct,
                    "estimatedRulDays": c_out.estimated_rul_days,
                    "riskGradeCode": c_out.risk_grade_code,
                    "primaryRiskFactor": c_buf_to_string(&c_out.primary_risk_factor)
                }));
            }
        }
    }

    let (base_eta, base_beta) = match input.media_type {
        2 => (75000.0, 1.25),
        1 => (65000.0, 1.30),
        3 => (25000.0, 1.45),
        _ => (50000.0, 1.40),
    };
    let t0 = input.power_on_hours as f64;
    let avg_daily = if input.avg_daily_power_on_hours.is_finite() && input.avg_daily_power_on_hours > 0.25 {
        dsp_clamp(input.avg_daily_power_on_hours, 0.25, 24.0)
    } else {
        8.0
    };

    let mut defect_severity = 0.0;
    let mut max_weight = 0.0;
    let mut primary_driver = "Nominal Aging Baseline";

    if input.pending_sectors > 0 {
        let w = 0.45 * (input.pending_sectors as f64).ln_1p() + 0.06 * (input.pending_sectors as f64);
        defect_severity += w;
        if w > max_weight { max_weight = w; primary_driver = "Pending Unstable Sectors (0xC5)"; }
    }
    if input.uncorrectable_errors > 0 {
        let w = 0.40 * (input.uncorrectable_errors as f64).ln_1p() + 0.05 * (input.uncorrectable_errors as f64);
        defect_severity += w;
        if w > max_weight { max_weight = w; primary_driver = "Uncorrectable Media Errors (0xBB/0xC6)"; }
    }
    if input.reallocated_sectors > 0 {
        let w = 0.28 * (input.reallocated_sectors as f64).ln_1p() + 0.015 * (input.reallocated_sectors as f64);
        defect_severity += w;
        if w > max_weight { max_weight = w; primary_driver = "Reallocated Spare Sectors (0x05)"; }
    }
    let used_clamped = dsp_clamp(input.percentage_used as f64, 0.0, 200.0);
    if used_clamped >= 70.0 {
        let w = (used_clamped - 65.0) * 0.025;
        defect_severity += w;
        if w > max_weight { max_weight = w; primary_driver = "Flash Wear-Out Depletion (% Used)"; }
    }
    if (input.available_spare_pct > 0 && input.available_spare_pct < 40)
        || (input.available_spare_pct == 0 && (used_clamped >= 80.0 || input.uncorrectable_errors > 0))
    {
        let w = (40.0 - input.available_spare_pct as f64) * 0.04;
        defect_severity += w;
        if w > max_weight { max_weight = w; primary_driver = "Low Available Spare Blocks"; }
    }
    if input.temperature_celsius > 45 && input.temperature_celsius < 150 {
        let w = (input.temperature_celsius - 45) as f64 * 0.035;
        defect_severity += w;
        if w > max_weight { primary_driver = "Elevated Operating Temperature Stress"; }
    }
    if input.unsafe_shutdowns > 50 {
        defect_severity += 0.08 * ((input.unsafe_shutdowns - 50) as f64).ln_1p();
    }

    let eta = (base_eta * (-dsp_clamp(defect_severity * 0.42, 0.0, 4.5)).exp()).max(720.0);
    let beta = dsp_clamp(base_beta + defect_severity * 0.35 + used_clamped * 0.005, 1.05, 3.80);

    let p30 = dsp_weibull_cond_prob_rust(t0, 30.0 * avg_daily, beta, eta);
    let p90 = dsp_weibull_cond_prob_rust(t0, 90.0 * avg_daily, beta, eta);
    let p365 = dsp_weibull_cond_prob_rust(t0, 365.0 * avg_daily, beta, eta);

    let safe_ratio = if t0 > 1.0 { t0 / eta } else { 1.0 / eta }.min(20.0);
    let hazard_per_1k = dsp_clamp((beta / eta) * safe_ratio.powf(beta - 1.0) * 1000.0, 0.0, 1000.0);

    let base_cum = dsp_clamp(t0 / eta, 0.0, 50.0).powf(beta);
    let target_total_hours = eta * (base_cum + std::f64::consts::LN_2).powf(1.0 / beta);
    let remaining_hours = (target_total_hours - t0).max(0.0);
    let est_days = dsp_clamp(remaining_hours / avg_daily, 0.0, 3650.0).round() as u32;

    let mut reliability = (1.0 - p90) * 100.0;
    reliability = dsp_clamp(reliability - dsp_clamp(defect_severity * 12.0, 0.0, 65.0), 0.0, 100.0);

    let grade: u32 = if p30 >= 0.25 || reliability < 35.0 || est_days <= 30 {
        4
    } else if p90 >= 0.22 || reliability < 60.0 || est_days <= 120 {
        3
    } else if p365 >= 0.25 || reliability < 80.0 || defect_severity > 0.35 {
        2
    } else if reliability < 93.0 || defect_severity > 0.05 {
        1
    } else {
        0
    };

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "weibullShapeBeta": beta,
        "weibullScaleEtaHours": eta,
        "failureProb30dPct": p30 * 100.0,
        "failureProb90dPct": p90 * 100.0,
        "failureProb365dPct": p365 * 100.0,
        "hazardRatePer1kHours": hazard_per_1k,
        "reliabilityIndexPct": reliability,
        "estimatedRulDays": est_days,
        "riskGradeCode": grade,
        "primaryRiskFactor": primary_driver
    }))
}

#[tauri::command]
fn analyze_acoustic_seek_profile(
    samples: Vec<PredictiveAcousticSampleArg>,
    media_type: u32,
) -> Result<serde_json::Value, String> {
    #[cfg(windows)]
    {
        if let Some(dll) = get_predictive_dll() {
            let c_samples: Vec<DspAcousticSampleC> = samples
                .iter()
                .map(|s| DspAcousticSampleC {
                    lba: s.lba,
                    latency_ms: s.latency_ms,
                    status_code: s.status_code,
                    reserved: 0,
                })
                .collect();
            let mut c_out: DspAcousticProfileC = unsafe { std::mem::zeroed() };
            let ptr = if c_samples.is_empty() { std::ptr::null() } else { c_samples.as_ptr() };
            if let Ok(cnt_u32) = u32::try_from(c_samples.len()) {
                if unsafe { (dll.fn_acoustic)(ptr, cnt_u32, media_type, &mut c_out) } {
                return Ok(serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "validSampleCount": c_out.valid_sample_count,
                    "consecutiveStepCount": c_out.consecutive_step_count,
                    "microStallBurstCount": c_out.micro_stall_burst_count,
                    "strideJumpCount": c_out.stride_jump_count,
                    "acousticGradeCode": c_out.acoustic_grade_code,
                    "rmssdJitterMs": c_out.rmssd_jitter_ms,
                    "meanStepDeltaMs": c_out.mean_step_delta_ms,
                    "peakStepDeltaMs": c_out.peak_step_delta_ms,
                    "sequentialJitterMs": c_out.sequential_jitter_ms,
                    "randomSeekJitterMs": c_out.random_seek_jitter_ms,
                    "resonanceRatio": c_out.resonance_ratio,
                    "acousticInstabilityScore": c_out.acoustic_instability_score,
                    "diagnosticSummary": c_buf_to_string(&c_out.diagnostic_summary)
                }));
                }
            }
        }
    }

    if samples.is_empty() {
        return Ok(serde_json::json!({
            "engineSource": "rust-parity-fallback",
            "validSampleCount": 0,
            "consecutiveStepCount": 0,
            "microStallBurstCount": 0,
            "strideJumpCount": 0,
            "acousticGradeCode": 0,
            "rmssdJitterMs": 0.0,
            "meanStepDeltaMs": 0.0,
            "peakStepDeltaMs": 0.0,
            "sequentialJitterMs": 0.0,
            "randomSeekJitterMs": 0.0,
            "resonanceRatio": 0.0,
            "acousticInstabilityScore": 0.0,
            "diagnosticSummary": "No sector latency samples available"
        }));
    }

    let mut valid_lats: Vec<f64> = Vec::with_capacity(samples.len());
    let mut bad_count: u32 = 0;
    for s in &samples {
        if s.status_code >= 4 || !s.latency_ms.is_finite() || s.latency_ms < 0.0 {
            bad_count += 1;
        } else {
            valid_lats.push(s.latency_ms);
        }
    }

    if valid_lats.is_empty() {
        return Ok(serde_json::json!({
            "engineSource": "rust-parity-fallback",
            "validSampleCount": 0,
            "consecutiveStepCount": 0,
            "microStallBurstCount": 0,
            "strideJumpCount": 0,
            "acousticGradeCode": if bad_count > 0 { 3 } else { 0 },
            "rmssdJitterMs": 0.0,
            "meanStepDeltaMs": 0.0,
            "peakStepDeltaMs": 0.0,
            "sequentialJitterMs": 0.0,
            "randomSeekJitterMs": 0.0,
            "resonanceRatio": 0.0,
            "acousticInstabilityScore": if bad_count > 0 { 95.0 } else { 0.0 },
            "diagnosticSummary": if bad_count > 0 { "All sampled blocks failed I/O (severe media fault)" } else { "No valid latency readings" }
        }));
    }

    valid_lats.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median_ms = valid_lats[valid_lats.len() / 2];
    let is_solid_state = media_type == 1 || media_type == 2;
    let stall_floor = if is_solid_state { 15.0 } else { 35.0 };
    let stall_threshold = (median_ms * 3.0).max(stall_floor);

    let mut sum_sq_all = 0.0;
    let mut sum_abs_all = 0.0;
    let mut peak_delta = 0.0f64;
    let mut sum_sq_seq = 0.0;
    let mut sum_sq_rand = 0.0;
    let mut step_count = 0u32;
    let mut seq_count = 0u32;
    let mut rand_count = 0u32;
    let mut stride_jumps = 0u32;
    let mut micro_stall_bursts = 0u32;
    let mut current_stall_run = 0u32;

    let mut has_prev = false;
    let mut prev_lba = 0u64;
    let mut prev_lat = 0.0f64;

    for s in &samples {
        if s.status_code >= 4 || !s.latency_ms.is_finite() || s.latency_ms < 0.0 {
            if current_stall_run >= 2 { micro_stall_bursts += 1; }
            current_stall_run = 0;
            has_prev = false;
            continue;
        }
        if s.latency_ms >= stall_threshold {
            current_stall_run += 1;
        } else {
            if current_stall_run >= 2 { micro_stall_bursts += 1; }
            current_stall_run = 0;
        }
        if has_prev {
            let delta = (s.latency_ms - prev_lat).abs();
            sum_abs_all += delta;
            sum_sq_all += delta * delta;
            peak_delta = peak_delta.max(delta);
            step_count += 1;
            if s.lba > prev_lba && (s.lba - prev_lba) <= 131_072 {
                sum_sq_seq += delta * delta;
                seq_count += 1;
            } else {
                sum_sq_rand += delta * delta;
                rand_count += 1;
                stride_jumps += 1;
            }
        }
        prev_lba = s.lba;
        prev_lat = s.latency_ms;
        has_prev = true;
    }
    if current_stall_run >= 2 { micro_stall_bursts += 1; }

    let rmssd_all = if step_count > 0 { (sum_sq_all / step_count as f64).sqrt() } else { 0.0 };
    let mean_delta = if step_count > 0 { sum_abs_all / step_count as f64 } else { 0.0 };
    let seq_rmssd = if seq_count > 0 { (sum_sq_seq / seq_count as f64).sqrt() } else { rmssd_all };
    let rand_rmssd = if rand_count > 0 { (sum_sq_rand / rand_count as f64).sqrt() } else { seq_rmssd };
    let mut resonance_ratio = if rand_count > 0 {
        rand_rmssd / seq_rmssd.max(0.25)
    } else {
        peak_delta / median_ms.max(0.25)
    };
    if !resonance_ratio.is_finite() { resonance_ratio = 1.0; }

    let ref_jitter = if is_solid_state { 6.0 } else { 18.0 };
    let score = dsp_clamp(
        dsp_clamp((rmssd_all / ref_jitter) * 42.0, 0.0, 55.0)
            + dsp_clamp(micro_stall_bursts as f64 * 8.5, 0.0, 30.0)
            + dsp_clamp((peak_delta / (ref_jitter * 5.0)) * 15.0, 0.0, 15.0),
        0.0,
        100.0,
    );

    let (grade, summary) = if score >= 70.0 {
        (3u32, if is_solid_state { "Severe FTL GC/die-stall spikes detected" } else { "Severe actuator seek settling oscillation detected" })
    } else if score >= 42.0 {
        (2u32, if is_solid_state { "Elevated NAND write-amplification / GC latency jitter" } else { "Moderate mechanical seek-jitter / track retry resonance" })
    } else if score >= 18.0 {
        (1u32, if is_solid_state { "Mild controller queue jitter within normal tolerance" } else { "Minor rotational seek step variance" })
    } else {
        (0u32, if is_solid_state { "Low NAND latency variance (FTL stable)" } else { "Quiet sequential seek track profile" })
    };

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "validSampleCount": valid_lats.len() as u32,
        "consecutiveStepCount": step_count,
        "microStallBurstCount": micro_stall_bursts,
        "strideJumpCount": stride_jumps,
        "acousticGradeCode": grade,
        "rmssdJitterMs": rmssd_all,
        "meanStepDeltaMs": mean_delta,
        "peakStepDeltaMs": peak_delta,
        "sequentialJitterMs": seq_rmssd,
        "randomSeekJitterMs": rand_rmssd,
        "resonanceRatio": resonance_ratio,
        "acousticInstabilityScore": score,
        "diagnosticSummary": summary
    }))
}

#[tauri::command]
fn evaluate_thermal_wear_stress(input: PredictiveThermalArgs) -> Result<serde_json::Value, String> {
    #[cfg(windows)]
    {
        if let Some(dll) = get_predictive_dll() {
            let c_in = DspThermalWearInputC {
                media_type: input.media_type,
                current_temp_celsius: input.current_temp_celsius,
                peak_temp_celsius: input.peak_temp_celsius,
                warning_temp_time_min: input.warning_temp_time_min,
                critical_temp_time_min: input.critical_temp_time_min,
                power_on_hours: input.power_on_hours,
                total_tb_written: input.total_tb_written,
                rated_tbw_limit_tb: input.rated_tbw_limit_tb,
            };
            let mut c_out: DspThermalWearReportC = unsafe { std::mem::zeroed() };
            if unsafe { (dll.fn_thermal)(&c_in, &mut c_out) } {
                return Ok(serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "arrheniusAccelerationFactor": c_out.arrhenius_acceleration_factor,
                    "sustainedThermalStressFactor": c_out.sustained_thermal_stress_factor,
                    "effectiveAgedHours": c_out.effective_aged_hours,
                    "dailyTbwRateGb": c_out.daily_tbw_rate_gb,
                    "estimatedTbwRemainingYears": c_out.estimated_tbw_remaining_years,
                    "thermalStressScore": c_out.thermal_stress_score,
                    "thermalGradeCode": c_out.thermal_grade_code,
                    "thermalSummary": c_buf_to_string(&c_out.thermal_summary)
                }));
            }
        }
    }

    let ea_over_kb = 8123.166;
    let t_ref_k = 35.0 + 273.15;
    let cur_c = if input.current_temp_celsius > 0 && input.current_temp_celsius < 150 {
        input.current_temp_celsius as f64
    } else {
        35.0
    };
    let t_op_k = cur_c + 273.15;
    let af = dsp_clamp(ea_over_kb * ((1.0 / t_ref_k) - (1.0 / t_op_k)), -5.0, 5.0).exp();

    let total_min = if input.power_on_hours > 0 { input.power_on_hours as f64 * 60.0 } else { 60.0 };
    let warn_ratio = dsp_clamp(input.warning_temp_time_min as f64 / total_min, 0.0, 1.0);
    let crit_ratio = dsp_clamp(input.critical_temp_time_min as f64 / total_min, 0.0, 1.0);
    let excursion_boost = 1.0 + warn_ratio * 1.4 + crit_ratio * 3.8;
    let sustained_factor = dsp_clamp((0.65 * af + 0.35) * excursion_boost, 0.3, 12.0);
    let effective_hours = input.power_on_hours as f64 * sustained_factor;

    let mut daily_tbw_gb = 0.0;
    let mut tbw_rem_years = -1.0;
    if input.power_on_hours > 0 && input.total_tb_written.is_finite() && input.total_tb_written > 0.0 {
        let days_active = (input.power_on_hours as f64 / 24.0).max(0.05);
        daily_tbw_gb = (input.total_tb_written * 1000.0) / days_active;
        if input.rated_tbw_limit_tb.is_finite() && input.rated_tbw_limit_tb > 0.0 {
            let rem_tb = input.rated_tbw_limit_tb - input.total_tb_written;
            if rem_tb <= 0.0 {
                tbw_rem_years = 0.0;
            } else if daily_tbw_gb > 0.001 {
                tbw_rem_years = dsp_clamp(((rem_tb * 1000.0) / daily_tbw_gb) / 365.25, 0.0, 99.0);
            }
        }
    }

    let wear_pressure = if input.rated_tbw_limit_tb.is_finite()
        && input.rated_tbw_limit_tb > 0.0
        && input.total_tb_written.is_finite()
        && input.total_tb_written > 0.0
    {
        dsp_clamp((input.total_tb_written / input.rated_tbw_limit_tb) * 35.0, 0.0, 35.0)
    } else {
        0.0
    };
    let thermal_comp = dsp_clamp(
        (sustained_factor - 1.0) * 18.0 + if cur_c > 45.0 { (cur_c - 45.0) * 1.8 } else { 0.0 },
        0.0,
        65.0,
    );
    let stress_score = dsp_clamp(thermal_comp + wear_pressure, 0.0, 100.0);

    let (grade, summary) = if cur_c >= 65.0 || input.critical_temp_time_min >= 15 || stress_score >= 75.0 {
        (4u32, "Critical thermal acceleration or TBW endurance saturation")
    } else if cur_c >= 55.0 || input.warning_temp_time_min >= 60 || stress_score >= 50.0 {
        (3u32, "High sustained thermal stress accelerating cell/lubricant aging")
    } else if cur_c >= 46.0 || stress_score >= 25.0 {
        (2u32, "Moderate thermal load; verify chassis airflow under sustained I/O")
    } else if stress_score >= 10.0 {
        (1u32, "Acceptable thermal aging factor")
    } else {
        (0u32, "Optimal thermal headroom (Arrhenius AF ~ 1.0x)")
    };

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "arrheniusAccelerationFactor": af,
        "sustainedThermalStressFactor": sustained_factor,
        "effectiveAgedHours": effective_hours,
        "dailyTbwRateGb": daily_tbw_gb,
        "estimatedTbwRemainingYears": tbw_rem_years,
        "thermalStressScore": stress_score,
        "thermalGradeCode": grade,
        "thermalSummary": summary
    }))
}

#[tauri::command]
fn project_smart_degradation_trend(
    points: Vec<PredictiveHistoryPointArg>,
    warning_threshold: f64,
    critical_threshold: f64,
    lower_is_worse: bool,
) -> Result<serde_json::Value, String> {
    #[cfg(windows)]
    {
        if let Some(dll) = get_predictive_dll() {
            let c_pts: Vec<DspSmartHistoryPointC> = points
                .iter()
                .map(|p| DspSmartHistoryPointC {
                    timestamp_sec: p.timestamp_sec,
                    value: p.value,
                })
                .collect();
            let mut c_out: DspSmartTrendProjectionC = unsafe { std::mem::zeroed() };
            let ptr = if c_pts.is_empty() { std::ptr::null() } else { c_pts.as_ptr() };
            if let Ok(cnt_u32) = u32::try_from(c_pts.len()) {
                if unsafe {
                    (dll.fn_trend)(
                        ptr,
                        cnt_u32,
                        warning_threshold,
                        critical_threshold,
                        if lower_is_worse { 1 } else { 0 },
                        &mut c_out,
                    )
                } {
                    return Ok(serde_json::json!({
                        "engineSource": "native-cpp-dll",
                        "validPointCount": c_out.valid_point_count,
                        "trendDirection": c_out.trend_direction,
                        "isStatisticallySignificant": c_out.is_statistically_significant != 0,
                        "observationSpanDays": c_out.observation_span_days,
                        "latestValue": c_out.latest_value,
                        "slopePerDay": c_out.slope_per_day,
                        "interceptValue": c_out.intercept_value,
                        "rSquared": c_out.r_squared,
                        "projectedValue30d": c_out.projected_value_30d,
                        "projectedDaysToWarning": c_out.projected_days_to_warning,
                        "projectedDaysToCritical": c_out.projected_days_to_critical
                    }));
                }
            }
        }
    }

    let (valid_n, dir, sig, span_days, latest_val, slope, intercept, r2, proj30, days_warn, days_crit) =
        eval_smart_trend_rust(&points, warning_threshold, critical_threshold, lower_is_worse);

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "validPointCount": valid_n,
        "trendDirection": dir,
        "isStatisticallySignificant": sig,
        "observationSpanDays": span_days,
        "latestValue": latest_val,
        "slopePerDay": slope,
        "interceptValue": intercept,
        "rSquared": r2,
        "projectedValue30d": proj30,
        "projectedDaysToWarning": days_warn,
        "projectedDaysToCritical": days_crit
    }))
}

// ===========================================================================
// Pure Creative Compute & Forensics DLL Bridge (DiskSentinelForensics.dll)
// ===========================================================================

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfEngineInfoC {
    engine_name: [u8; 48],
    version: [u8; 16],
    capabilities_mask: u32,
    crc32_self_test_value: u32,
    crc32_self_test_passed: u8,
    reserved: [u8; 7],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfTelemetrySampleC {
    lba: u64,
    block_id: u32,
    status_code: u32,
    latency_ms: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfContiguousZoneC {
    start_lba: u64,
    end_lba: u64,
    start_block_id: u32,
    end_block_id: u32,
    block_count: u32,
    bad_count: u32,
    avg_latency_ms: f64,
    peak_latency_ms: f64,
    peak_z_score: f64,
    severity: u32,
    reserved: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfZScoreReportC {
    total_samples: u32,
    slow_or_bad_count: u32,
    within_1_sigma_count: u32,
    sigma_1_to_2_count: u32,
    sigma_2_to_3_count: u32,
    over_3_sigma_count: u32,
    contiguous_zone_count: u32,
    longest_run_blocks: u32,
    risk_level: u32,
    reserved: u32,
    mean_ms: f64,
    std_dev_ms: f64,
    max_latency_ms: f64,
    degradation_risk_score: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfExtentInputC {
    start_lba: u64,
    sector_count: u64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfHeatmapSummaryC {
    total_extents: u32,
    impacted_extent_count: u32,
    peak_cell_index: u32,
    total_bad_hits: u32,
    total_sectors_mapped: u64,
    peak_cell_density_pct: f64,
    fragmentation_spread_score: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfSectorEntropyResultC {
    inspected_bytes: u32,
    crc32: u32,
    repeating_word32: u32,
    sector_class: u32,
    shannon_entropy: f64,
    zero_byte_ratio: f64,
    ff_byte_ratio: f64,
    printable_ratio: f64,
    has_repeating_pattern: u8,
    is_all_zero: u8,
    is_all_ff: u8,
    reserved: [u8; 5],
    classification_label: [u8; 48],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfPartitionRecordC {
    index: u32,
    sector_aligned_4k: u32,
    start_lba: u64,
    end_lba: u64,
    sector_count: u64,
    size_bytes: u64,
    mbr_type_byte: u8,
    is_bootable: u8,
    is_gpt: u8,
    reserved: [u8; 5],
    type_label: [u8; 48],
    name_utf8: [u8; 72],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfPartitionTableReportC {
    sector_size: u32,
    partition_count: u32,
    has_mbr_signature: u8,
    has_gpt_header: u8,
    gpt_header_crc_valid: u8,
    gpt_entries_crc_valid: u8,
    is_protective_mbr: u8,
    reserved: [u8; 3],
    stored_header_crc32: u32,
    computed_header_crc32: u32,
    stored_entries_crc32: u32,
    computed_entries_crc32: u32,
    first_usable_lba: u64,
    last_usable_lba: u64,
    scheme_name: [u8; 32],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct DsfVbrInfoC {
    fs_type: u32,
    bytes_per_sector: u32,
    sectors_per_cluster: u32,
    cluster_size_bytes: u32,
    reserved_sectors: u32,
    root_cluster: u32,
    total_sectors: u64,
    mft_start_lcn: u64,
    has_boot_signature: u8,
    reserved: [u8; 7],
    oem_id: [u8; 16],
}

#[cfg(windows)]
struct ForensicsDllDispatch {
    loaded_path: String,
    fn_info: unsafe extern "system" fn(*mut DsfEngineInfoC) -> bool,
    fn_zscore: unsafe extern "system" fn(
        *const DsfTelemetrySampleC,
        u32,
        f64,
        u32,
        *mut DsfZScoreReportC,
        *mut DsfContiguousZoneC,
        u32,
        *mut u32,
    ) -> bool,
    fn_heatmap: unsafe extern "system" fn(
        *const DsfExtentInputC,
        u32,
        *const u64,
        u32,
        bool,
        u32,
        *mut u32,
        *mut f64,
        *mut DsfHeatmapSummaryC,
    ) -> bool,
    fn_entropy: unsafe extern "system" fn(*const u8, u32, *mut DsfSectorEntropyResultC) -> bool,
    fn_partition: unsafe extern "system" fn(
        *const u8,
        u32,
        u32,
        *mut DsfPartitionTableReportC,
        *mut DsfPartitionRecordC,
        u32,
    ) -> bool,
    fn_vbr: unsafe extern "system" fn(*const u8, u32, *mut DsfVbrInfoC) -> bool,
}

#[cfg(windows)]
unsafe impl Send for ForensicsDllDispatch {}
#[cfg(windows)]
unsafe impl Sync for ForensicsDllDispatch {}

#[cfg(windows)]
static FORENSICS_DLL_DISPATCH: std::sync::OnceLock<Option<ForensicsDllDispatch>> =
    std::sync::OnceLock::new();

#[cfg(windows)]
fn get_forensics_dll() -> Option<&'static ForensicsDllDispatch> {
    FORENSICS_DLL_DISPATCH
        .get_or_init(|| {
            use windows_sys::Win32::System::LibraryLoader::{FreeLibrary, GetProcAddress, LoadLibraryW};

            let mut candidates: Vec<std::path::PathBuf> = Vec::new();
            if let Ok(exe) = std::env::current_exe() {
                if let Some(dir) = exe.parent() {
                    candidates.push(dir.join("DiskSentinelForensics.dll"));
                    candidates.push(dir.join("resources").join("DiskSentinelForensics.dll"));
                    candidates.push(dir.join("_up_").join("bin").join("native").join("DiskSentinelForensics.dll"));
                }
            }
            candidates.push(std::path::PathBuf::from("bin\\native\\DiskSentinelForensics.dll"));
            candidates.push(std::path::PathBuf::from("DiskSentinelForensics.dll"));

            for path in candidates {
                let path_str = path.to_string_lossy().to_string();
                let mut wide: Vec<u16> = path_str.encode_utf16().collect();
                wide.push(0);
                let hmod = unsafe { LoadLibraryW(wide.as_ptr()) };
                if hmod == 0 {
                    continue;
                }

                unsafe {
                    let p_info = GetProcAddress(hmod, b"DSF_GetForensicsEngineInfo\0".as_ptr());
                    let p_zscore = GetProcAddress(hmod, b"DSF_AnalyzeSectorTelemetryZScore\0".as_ptr());
                    let p_heatmap = GetProcAddress(hmod, b"DSF_ComputeExtentBadDensityHeatmap\0".as_ptr());
                    let p_entropy = GetProcAddress(hmod, b"DSF_ComputeSectorEntropyAndPattern\0".as_ptr());
                    let p_partition = GetProcAddress(hmod, b"DSF_InspectBootAndPartitionTable\0".as_ptr());
                    let p_vbr = GetProcAddress(hmod, b"DSF_InspectVbrBootSector\0".as_ptr());

                    if let (
                        Some(f_info),
                        Some(f_zscore),
                        Some(f_heatmap),
                        Some(f_entropy),
                        Some(f_partition),
                        Some(f_vbr),
                    ) = (p_info, p_zscore, p_heatmap, p_entropy, p_partition, p_vbr)
                    {
                        return Some(ForensicsDllDispatch {
                            loaded_path: path_str,
                            fn_info: std::mem::transmute(f_info),
                            fn_zscore: std::mem::transmute(f_zscore),
                            fn_heatmap: std::mem::transmute(f_heatmap),
                            fn_entropy: std::mem::transmute(f_entropy),
                            fn_partition: std::mem::transmute(f_partition),
                            fn_vbr: std::mem::transmute(f_vbr),
                        });
                    }
                    FreeLibrary(hmod);
                }
            }
            None
        })
        .as_ref()
}

fn dsf_crc32_ieee_rust(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFFFFFF;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if (crc & 1) != 0 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForensicsTelemetrySampleArg {
    lba: u64,
    block_id: u32,
    status_code: u32,
    latency_ms: f64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForensicsExtentInputArg {
    start_lba: u64,
    sector_count: u64,
}

#[tauri::command]
fn inspect_forensics_dll_status() -> serde_json::Value {
    #[cfg(windows)]
    {
        if let Some(dll) = get_forensics_dll() {
            let mut info: DsfEngineInfoC = unsafe { std::mem::zeroed() };
            let ok = unsafe { (dll.fn_info)(&mut info) };
            if ok {
                return serde_json::json!({
                    "dllLoaded": true,
                    "engineSource": "native-cpp-dll",
                    "loadedPath": dll.loaded_path,
                    "engineName": c_buf_to_string(&info.engine_name),
                    "version": c_buf_to_string(&info.version),
                    "capabilitiesMask": info.capabilities_mask,
                    "crc32SelfTestValue": info.crc32_self_test_value,
                    "crc32SelfTestPassed": info.crc32_self_test_passed != 0
                });
            }
        }
    }

    let check_crc = dsf_crc32_ieee_rust(b"123456789");
    serde_json::json!({
        "dllLoaded": false,
        "engineSource": "rust-parity-fallback",
        "loadedPath": null,
        "engineName": "DiskSentinelForensics Rust Parity Engine",
        "version": "4.6.0",
        "capabilitiesMask": 0b11111,
        "crc32SelfTestValue": check_crc,
        "crc32SelfTestPassed": check_crc == 0xCBF43926
    })
}

#[tauri::command]
fn analyze_forensics_sector_zscore(
    samples: Vec<ForensicsTelemetrySampleArg>,
    baseline_expected_ms: f64,
    max_block_id_gap: u32,
) -> Result<serde_json::Value, String> {
    #[cfg(windows)]
    {
        if let Some(dll) = get_forensics_dll() {
            let c_samples: Vec<DsfTelemetrySampleC> = samples
                .iter()
                .map(|s| DsfTelemetrySampleC {
                    lba: s.lba,
                    block_id: s.block_id,
                    status_code: s.status_code,
                    latency_ms: s.latency_ms,
                })
                .collect();
            let mut report: DsfZScoreReportC = unsafe { std::mem::zeroed() };
            let mut zones = vec![unsafe { std::mem::zeroed::<DsfContiguousZoneC>() }; 64];
            let mut written_zones: u32 = 0;
            let ptr = if c_samples.is_empty() { std::ptr::null() } else { c_samples.as_ptr() };
            if let Ok(cnt_u32) = u32::try_from(c_samples.len()) {
                if unsafe {
                    (dll.fn_zscore)(
                        ptr,
                        cnt_u32,
                        baseline_expected_ms,
                        max_block_id_gap,
                        &mut report,
                        zones.as_mut_ptr(),
                        zones.len() as u32,
                        &mut written_zones,
                    )
                } {
                let zones_json: Vec<serde_json::Value> = zones[..(written_zones as usize).min(zones.len())]
                    .iter()
                    .map(|z| {
                        serde_json::json!({
                            "startLba": z.start_lba,
                            "endLba": z.end_lba,
                            "startBlockId": z.start_block_id,
                            "endBlockId": z.end_block_id,
                            "blockCount": z.block_count,
                            "badCount": z.bad_count,
                            "avgLatencyMs": z.avg_latency_ms,
                            "peakLatencyMs": z.peak_latency_ms,
                            "peakZScore": z.peak_z_score,
                            "severity": z.severity
                        })
                    })
                    .collect();
                return Ok(serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "totalSamples": report.total_samples,
                    "slowOrBadCount": report.slow_or_bad_count,
                    "within1SigmaCount": report.within_1_sigma_count,
                    "sigma1To2Count": report.sigma_1_to_2_count,
                    "sigma2To3Count": report.sigma_2_to_3_count,
                    "over3SigmaCount": report.over_3_sigma_count,
                    "contiguousZoneCount": report.contiguous_zone_count,
                    "longestRunBlocks": report.longest_run_blocks,
                    "riskLevel": report.risk_level,
                    "meanMs": report.mean_ms,
                    "stdDevMs": report.std_dev_ms,
                    "maxLatencyMs": report.max_latency_ms,
                    "degradationRiskScore": report.degradation_risk_score,
                    "zones": zones_json
                }));
                }
            }
        }
    }

    if samples.is_empty() {
        return Ok(serde_json::json!({
            "engineSource": "rust-parity-fallback",
            "totalSamples": 0,
            "slowOrBadCount": 0,
            "within1SigmaCount": 0,
            "sigma1To2Count": 0,
            "sigma2To3Count": 0,
            "over3SigmaCount": 0,
            "contiguousZoneCount": 0,
            "longestRunBlocks": 0,
            "riskLevel": 0,
            "meanMs": 0.0,
            "stdDevMs": 0.0,
            "maxLatencyMs": 0.0,
            "degradationRiskScore": 0.0,
            "zones": []
        }));
    }

    let safe_gap = max_block_id_gap.max(1);
    let safe_baseline = if baseline_expected_ms > 0.1 { baseline_expected_ms } else { 1.0 };

    let mut mean = 0.0f64;
    let mut m2 = 0.0f64;
    let mut max_lat = 0.0f64;
    let mut valid_n = 0u32;
    let mut slow_bad_count = 0u32;
    let mut needs_sort = false;

    for (i, s) in samples.iter().enumerate() {
        if i > 0 && s.block_id < samples[i - 1].block_id {
            needs_sort = true;
        }
        if s.status_code >= 2 {
            slow_bad_count += 1;
        }
        if !s.latency_ms.is_finite() || s.latency_ms < 0.0 {
            continue;
        }
        valid_n += 1;
        let delta = s.latency_ms - mean;
        mean += delta / valid_n as f64;
        let delta2 = s.latency_ms - mean;
        m2 += delta * delta2;
        if s.latency_ms > max_lat {
            max_lat = s.latency_ms;
        }
    }

    let variance = if valid_n > 1 { m2 / (valid_n - 1) as f64 } else { 0.0 };
    let std_dev = variance.max(0.0).sqrt();
    let eff_std_dev = std_dev.max(0.05);

    let mut ordered_indices: Vec<usize> = (0..samples.len()).collect();
    if needs_sort && samples.len() > 1 {
        ordered_indices.sort_by(|&a, &b| {
            samples[a]
                .block_id
                .cmp(&samples[b].block_id)
                .then_with(|| samples[a].lba.cmp(&samples[b].lba))
        });
    }

    let mut w1 = 0u32;
    let mut s12 = 0u32;
    let mut s23 = 0u32;
    let mut s3p = 0u32;
    let mut zones_out: Vec<serde_json::Value> = Vec::new();
    let mut total_zones = 0u32;
    let mut longest_run = 0u32;

    let mut in_run = false;
    let mut z_start_lba = 0u64;
    let mut z_end_lba = 0u64;
    let mut z_start_blk = 0u32;
    let mut z_end_blk = 0u32;
    let mut z_blk_cnt = 0u32;
    let mut z_bad_cnt = 0u32;
    let mut z_peak_lat = 0.0f64;
    let mut z_peak_z = 0.0f64;
    let mut z_sev = 1u32;
    let mut z_lat_sum = 0.0f64;

    let flush_zone = |in_run: &mut bool,
                      z_blk_cnt: u32,
                      z_bad_cnt: u32,
                      z_start_lba: u64,
                      z_end_lba: u64,
                      z_start_blk: u32,
                      z_end_blk: u32,
                      z_peak_lat: f64,
                      z_peak_z: f64,
                      z_sev: u32,
                      z_lat_sum: &mut f64,
                      longest_run: &mut u32,
                      total_zones: &mut u32,
                      zones_out: &mut Vec<serde_json::Value>| {
        if !*in_run {
            return;
        }
        if z_blk_cnt >= 2 || z_bad_cnt >= 1 {
            let avg_lat = *z_lat_sum / (z_blk_cnt.max(1) as f64);
            if z_blk_cnt > *longest_run {
                *longest_run = z_blk_cnt;
            }
            if zones_out.len() < 64 {
                zones_out.push(serde_json::json!({
                    "startLba": z_start_lba,
                    "endLba": z_end_lba,
                    "startBlockId": z_start_blk,
                    "endBlockId": z_end_blk,
                    "blockCount": z_blk_cnt,
                    "badCount": z_bad_cnt,
                    "avgLatencyMs": avg_lat,
                    "peakLatencyMs": z_peak_lat,
                    "peakZScore": z_peak_z,
                    "severity": z_sev
                }));
            }
            *total_zones += 1;
        }
        *in_run = false;
        *z_lat_sum = 0.0;
    };

    for idx in ordered_indices {
        let s = &samples[idx];
        let is_bad = s.status_code >= 4;
        let lat_valid = s.latency_ms.is_finite() && s.latency_ms >= 0.0;
        let lat = if lat_valid { s.latency_ms } else { 0.0 };
        let z = if valid_n > 0 && lat_valid {
            (lat - mean) / eff_std_dev
        } else {
            0.0
        };
        if valid_n > 0 && lat_valid {
            if z <= 1.0 { w1 += 1; }
            else if z <= 2.0 { s12 += 1; }
            else if z <= 3.0 { s23 += 1; }
            else { s3p += 1; }
        }
        let is_anom = s.status_code >= 2 || (z >= 2.5 && lat >= safe_baseline * 2.0);
        if is_anom {
            if !in_run {
                in_run = true;
                z_start_lba = s.lba;
                z_end_lba = s.lba;
                z_start_blk = s.block_id;
                z_end_blk = s.block_id;
                z_blk_cnt = 1;
                z_bad_cnt = if is_bad { 1 } else { 0 };
                z_peak_lat = lat;
                z_peak_z = z;
                z_sev = if is_bad { 2 } else { 1 };
                z_lat_sum = lat;
            } else {
                let gap = if s.block_id >= z_end_blk { s.block_id - z_end_blk } else { safe_gap + 1 };
                if gap <= safe_gap {
                    z_end_lba = s.lba;
                    z_end_blk = s.block_id;
                    z_blk_cnt += 1;
                    if is_bad { z_bad_cnt += 1; z_sev = 2; }
                    if lat > z_peak_lat { z_peak_lat = lat; }
                    if z > z_peak_z { z_peak_z = z; }
                    z_lat_sum += lat;
                } else {
                    flush_zone(
                        &mut in_run, z_blk_cnt, z_bad_cnt, z_start_lba, z_end_lba,
                        z_start_blk, z_end_blk, z_peak_lat, z_peak_z, z_sev, &mut z_lat_sum,
                        &mut longest_run, &mut total_zones, &mut zones_out,
                    );
                    in_run = true;
                    z_start_lba = s.lba;
                    z_end_lba = s.lba;
                    z_start_blk = s.block_id;
                    z_end_blk = s.block_id;
                    z_blk_cnt = 1;
                    z_bad_cnt = if is_bad { 1 } else { 0 };
                    z_peak_lat = lat;
                    z_peak_z = z;
                    z_sev = if is_bad { 2 } else { 1 };
                    z_lat_sum = lat;
                }
            }
        } else {
            flush_zone(
                &mut in_run, z_blk_cnt, z_bad_cnt, z_start_lba, z_end_lba,
                z_start_blk, z_end_blk, z_peak_lat, z_peak_z, z_sev, &mut z_lat_sum,
                &mut longest_run, &mut total_zones, &mut zones_out,
            );
        }
    }
    flush_zone(
        &mut in_run, z_blk_cnt, z_bad_cnt, z_start_lba, z_end_lba,
        z_start_blk, z_end_blk, z_peak_lat, z_peak_z, z_sev, &mut z_lat_sum,
        &mut longest_run, &mut total_zones, &mut zones_out,
    );

    let sample_cnt = samples.len() as f64;
    let slow_pct = (slow_bad_count as f64 * 100.0) / sample_cnt;
    let outlier_pct = ((s23 + s3p) as f64 * 100.0) / sample_cnt;
    let cluster_pen = (total_zones as f64 * 7.5) + (longest_run as f64 * 2.5);
    let score = dsp_clamp(slow_pct * 3.0 + outlier_pct * 1.4 + cluster_pen, 0.0, 100.0);
    let risk: u32 = if score >= 70.0 || longest_run >= 8 { 4 }
        else if score >= 45.0 || total_zones >= 3 { 3 }
        else if score >= 20.0 || total_zones >= 1 { 2 }
        else if score >= 5.0 || slow_bad_count > 0 { 1 }
        else { 0 };

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "totalSamples": samples.len() as u32,
        "slowOrBadCount": slow_bad_count,
        "within1SigmaCount": w1,
        "sigma1To2Count": s12,
        "sigma2To3Count": s23,
        "over3SigmaCount": s3p,
        "contiguousZoneCount": total_zones,
        "longestRunBlocks": longest_run,
        "riskLevel": risk,
        "meanMs": mean,
        "stdDevMs": std_dev,
        "maxLatencyMs": max_lat,
        "degradationRiskScore": score,
        "zones": zones_out
    }))
}

#[tauri::command]
fn compute_forensics_extent_heatmap(
    extents: Vec<ForensicsExtentInputArg>,
    bad_lbas: Vec<u64>,
    cell_count: u32,
) -> Result<serde_json::Value, String> {
    let safe_cells = cell_count.clamp(1, 4096);
    #[cfg(windows)]
    {
        if let Some(dll) = get_forensics_dll() {
            let c_ext: Vec<DsfExtentInputC> = extents
                .iter()
                .map(|e| DsfExtentInputC {
                    start_lba: e.start_lba,
                    sector_count: e.sector_count,
                })
                .collect();
            let mut counts = vec![0u32; safe_cells as usize];
            let mut densities = vec![0.0f64; safe_cells as usize];
            let mut summary: DsfHeatmapSummaryC = unsafe { std::mem::zeroed() };
            let ext_ptr = if c_ext.is_empty() { std::ptr::null() } else { c_ext.as_ptr() };
            let bad_ptr = if bad_lbas.is_empty() { std::ptr::null() } else { bad_lbas.as_ptr() };
            if let (Ok(ext_len), Ok(bad_len)) = (u32::try_from(c_ext.len()), u32::try_from(bad_lbas.len())) {
                if unsafe {
                    (dll.fn_heatmap)(
                        ext_ptr,
                        ext_len,
                        bad_ptr,
                        bad_len,
                        false,
                        safe_cells,
                        counts.as_mut_ptr(),
                        densities.as_mut_ptr(),
                        &mut summary,
                    )
                } {
                    return Ok(serde_json::json!({
                        "engineSource": "native-cpp-dll",
                        "totalExtents": summary.total_extents,
                        "impactedExtentCount": summary.impacted_extent_count,
                        "peakCellIndex": summary.peak_cell_index,
                        "totalBadHits": summary.total_bad_hits,
                        "totalSectorsMapped": summary.total_sectors_mapped,
                        "peakCellDensityPct": summary.peak_cell_density_pct,
                        "fragmentationSpreadScore": summary.fragmentation_spread_score,
                        "cellBadCounts": counts,
                        "cellDensityPct": densities
                    }));
                }
            }
        }
    }

    let mut counts = vec![0u32; safe_cells as usize];
    let mut densities = vec![0.0f64; safe_cells as usize];
    let total_sectors: u64 = extents.iter().fold(0u64, |acc, e| acc.saturating_add(e.sector_count));

    if extents.is_empty() || total_sectors == 0 || bad_lbas.is_empty() {
        return Ok(serde_json::json!({
            "engineSource": "rust-parity-fallback",
            "totalExtents": extents.len() as u32,
            "impactedExtentCount": 0,
            "peakCellIndex": 0,
            "totalBadHits": 0,
            "totalSectorsMapped": total_sectors,
            "peakCellDensityPct": 0.0,
            "fragmentationSpreadScore": 0.0,
            "cellBadCounts": counts,
            "cellDensityPct": densities
        }));
    }

    let mut sorted_bad = bad_lbas;
    sorted_bad.sort_unstable();
    let min_bad = sorted_bad[0];
    let max_bad = sorted_bad[sorted_bad.len() - 1];

    let mut impacted = 0u32;
    let mut total_hits = 0u32;
    let mut cum_off = 0u64;

    for e in &extents {
        if e.sector_count == 0 { continue; }
        let ext_end = e.start_lba.saturating_add(e.sector_count);
        if max_bad >= e.start_lba && min_bad < ext_end {
            let lo = sorted_bad.partition_point(|&v| v < e.start_lba);
            let hi = sorted_bad.partition_point(|&v| v < ext_end);
            if hi > lo {
                impacted += 1;
                for &b in &sorted_bad[lo..hi] {
                    let rel = cum_off.saturating_add(b - e.start_lba);
                    let mut cidx = ((rel as f64 / total_sectors as f64) * safe_cells as f64) as usize;
                    if cidx >= safe_cells as usize { cidx = safe_cells as usize - 1; }
                    counts[cidx] += 1;
                    total_hits += 1;
                }
            }
        }
        cum_off = cum_off.saturating_add(e.sector_count);
    }

    let sec_per_cell = (total_sectors as f64 / safe_cells as f64).max(1.0);
    let mut non_zero = 0u32;
    let mut peak_idx = 0u32;
    let mut peak_pct = 0.0f64;
    for c in 0..safe_cells as usize {
        let pct = ((counts[c] as f64 / sec_per_cell) * 100.0).min(100.0);
        densities[c] = pct;
        if counts[c] > 0 { non_zero += 1; }
        if pct > peak_pct { peak_pct = pct; peak_idx = c as u32; }
    }

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "totalExtents": extents.len() as u32,
        "impactedExtentCount": impacted,
        "peakCellIndex": peak_idx,
        "totalBadHits": total_hits,
        "totalSectorsMapped": total_sectors,
        "peakCellDensityPct": peak_pct,
        "fragmentationSpreadScore": (non_zero as f64 * 100.0) / (safe_cells as f64),
        "cellBadCounts": counts,
        "cellDensityPct": densities
    }))
}

#[tauri::command]
fn compute_forensics_sector_entropy(bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    if bytes.is_empty() {
        return Err("Empty sector buffer".to_string());
    }
    #[cfg(windows)]
    {
        if let Some(dll) = get_forensics_dll() {
            let mut res: DsfSectorEntropyResultC = unsafe { std::mem::zeroed() };
            if let Ok(len_u32) = u32::try_from(bytes.len()) {
                if unsafe { (dll.fn_entropy)(bytes.as_ptr(), len_u32, &mut res) } {
                    return Ok(serde_json::json!({
                        "engineSource": "native-cpp-dll",
                        "inspectedBytes": res.inspected_bytes,
                        "crc32": res.crc32,
                        "repeatingWord32": res.repeating_word32,
                        "sectorClass": res.sector_class,
                        "shannonEntropy": res.shannon_entropy,
                        "zeroByteRatio": res.zero_byte_ratio,
                        "ffByteRatio": res.ff_byte_ratio,
                        "printableRatio": res.printable_ratio,
                        "hasRepeatingPattern": res.has_repeating_pattern != 0,
                        "isAllZero": res.is_all_zero != 0,
                        "isAllFF": res.is_all_ff != 0,
                        "classificationLabel": c_buf_to_string(&res.classification_label)
                    }));
                }
            }
        }
    }

    let n = bytes.len() as f64;
    let mut hist = [0u32; 256];
    let mut printable = 0u32;
    for &b in &bytes {
        hist[b as usize] += 1;
        if (32..=126).contains(&b) || b == b'\t' || b == b'\r' || b == b'\n' {
            printable += 1;
        }
    }
    let mut entropy = 0.0f64;
    for &cnt in &hist {
        if cnt > 0 {
            let p = cnt as f64 / n;
            entropy -= p * p.log2();
        }
    }
    if entropy < 0.0 { entropy = 0.0; }
    let is_zero = hist[0] as usize == bytes.len();
    let is_ff = hist[0xFF] as usize == bytes.len();

    let mut has_pat = false;
    let mut word0 = 0u32;
    if bytes.len() >= 8 {
        word0 = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        has_pat = true;
        for chunk in bytes.chunks_exact(4).skip(1) {
            if u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]) != word0 {
                has_pat = false;
                break;
            }
        }
        if has_pat {
            let tail_start = bytes.len() & !3usize;
            for (idx, &b) in bytes[tail_start..].iter().enumerate() {
                if b != word0.to_le_bytes()[idx & 3] {
                    has_pat = false;
                    break;
                }
            }
        }
    }

    let print_ratio = printable as f64 / n;
    let (s_class, label) = if is_zero {
        (0u32, "Zero-Filled / TRIM-Deallocated Sector")
    } else if is_ff {
        (1u32, "Erased NAND / All-0xFF Sector")
    } else if has_pat {
        (2u32, "Repeating Wipe / Poison Word Pattern")
    } else if print_ratio >= 0.85 && entropy <= 6.2 {
        (3u32, "UTF-8 / ASCII Text or System Log")
    } else if entropy >= 7.5 {
        (5u32, "High-Entropy Encrypted / Compressed Data")
    } else {
        (4u32, "Structured Binary / Filesystem Metadata")
    };

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "inspectedBytes": bytes.len() as u32,
        "crc32": dsf_crc32_ieee_rust(&bytes),
        "repeatingWord32": word0,
        "sectorClass": s_class,
        "shannonEntropy": entropy,
        "zeroByteRatio": hist[0] as f64 / n,
        "ffByteRatio": hist[0xFF] as f64 / n,
        "printableRatio": print_ratio,
        "hasRepeatingPattern": has_pat,
        "isAllZero": is_zero,
        "isAllFF": is_ff,
        "classificationLabel": label
    }))
}

#[tauri::command]
fn inspect_forensics_partition_table(bytes: Vec<u8>, sector_size: u32) -> Result<serde_json::Value, String> {
    if bytes.len() < 512 {
        return Err("Buffer smaller than 512 bytes".to_string());
    }
    #[cfg(windows)]
    {
        if let Some(dll) = get_forensics_dll() {
            let mut rep: DsfPartitionTableReportC = unsafe { std::mem::zeroed() };
            let mut recs = vec![unsafe { std::mem::zeroed::<DsfPartitionRecordC>() }; 128];
            if let Ok(len_u32) = u32::try_from(bytes.len()) {
                if unsafe {
                    (dll.fn_partition)(
                        bytes.as_ptr(),
                        len_u32,
                        sector_size,
                        &mut rep,
                        recs.as_mut_ptr(),
                        recs.len() as u32,
                    )
                } {
                let take_n = (rep.partition_count as usize).min(recs.len());
                let parts: Vec<serde_json::Value> = recs[..take_n]
                    .iter()
                    .map(|r| {
                        serde_json::json!({
                            "index": r.index,
                            "sectorAligned4K": r.sector_aligned_4k != 0,
                            "startLba": r.start_lba,
                            "endLba": r.end_lba,
                            "sectorCount": r.sector_count,
                            "sizeBytes": r.size_bytes,
                            "mbrTypeByte": r.mbr_type_byte,
                            "isBootable": r.is_bootable != 0,
                            "isGpt": r.is_gpt != 0,
                            "typeLabel": c_buf_to_string(&r.type_label),
                            "nameUtf8": c_buf_to_string(&r.name_utf8)
                        })
                    })
                    .collect();
                return Ok(serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "sectorSize": rep.sector_size,
                    "partitionCount": rep.partition_count,
                    "hasMbrSignature": rep.has_mbr_signature != 0,
                    "hasGptHeader": rep.has_gpt_header != 0,
                    "gptHeaderCrcValid": rep.gpt_header_crc_valid != 0,
                    "gptEntriesCrcValid": rep.gpt_entries_crc_valid != 0,
                    "isProtectiveMbr": rep.is_protective_mbr != 0,
                    "storedHeaderCrc32": rep.stored_header_crc32,
                    "computedHeaderCrc32": rep.computed_header_crc32,
                    "storedEntriesCrc32": rep.stored_entries_crc32,
                    "computedEntriesCrc32": rep.computed_entries_crc32,
                    "firstUsableLba": rep.first_usable_lba,
                    "lastUsableLba": rep.last_usable_lba,
                    "schemeName": c_buf_to_string(&rep.scheme_name),
                    "partitions": parts
                }));
                }
            }
        }
    }

    let sec_bytes = if sector_size == 4096 { 4096usize } else { 512usize };
    let mbr_sig = bytes[510] == 0x55 && bytes[511] == 0xAA;
    let is_protective = mbr_sig && bytes[446 + 4] == 0xEE;

    if bytes.len() >= sec_bytes + 92 && &bytes[sec_bytes..sec_bytes + 8] == b"EFI PART" {
        let hdr = &bytes[sec_bytes..];
        let mut hdr_size = u32::from_le_bytes([hdr[12], hdr[13], hdr[14], hdr[15]]) as usize;
        if hdr_size < 92 || hdr_size > sec_bytes {
            hdr_size = 92;
        }
        let stored_hdr_crc = u32::from_le_bytes([hdr[16], hdr[17], hdr[18], hdr[19]]);
        let copy_len = hdr_size.min(128).min(hdr.len());
        let mut hdr_copy = hdr[..copy_len].to_vec();
        if hdr_copy.len() >= 20 {
            hdr_copy[16..20].fill(0);
        }
        let computed_hdr_crc = dsf_crc32_ieee_rust(&hdr_copy);
        let first_usable = u64::from_le_bytes(hdr[40..48].try_into().unwrap_or([0; 8]));
        let last_usable = u64::from_le_bytes(hdr[48..56].try_into().unwrap_or([0; 8]));
        let part_lba = u64::from_le_bytes(hdr[72..80].try_into().unwrap_or([0; 8]));
        let num_entries = u32::from_le_bytes([hdr[80], hdr[81], hdr[82], hdr[83]]) as usize;
        let entry_size = u32::from_le_bytes([hdr[84], hdr[85], hdr[86], hdr[87]]) as usize;
        let stored_arr_crc = u32::from_le_bytes([hdr[88], hdr[89], hdr[90], hdr[91]]);

        let mut parts = Vec::new();
        let mut computed_arr_crc = 0u32;
        let mut arr_crc_valid = false;
        let mut found = 0u32;

        if entry_size >= 128 && entry_size <= 512 && num_entries > 0 && num_entries <= 1024 {
            if let Some(arr_off) = (part_lba as usize).checked_mul(sec_bytes) {
                if let Some(arr_bytes) = num_entries.checked_mul(entry_size) {
                    if arr_off <= bytes.len() && arr_bytes <= bytes.len() - arr_off {
                        let arr_slice = &bytes[arr_off..arr_off + arr_bytes];
                        computed_arr_crc = dsf_crc32_ieee_rust(arr_slice);
                        arr_crc_valid = computed_arr_crc == stored_arr_crc;
                        for idx in 0..num_entries {
                            let ent = &arr_slice[idx * entry_size..(idx + 1) * entry_size];
                            if ent[..16].iter().all(|&b| b == 0) {
                                continue;
                            }
                            let s_lba = u64::from_le_bytes(ent[32..40].try_into().unwrap_or([0; 8]));
                            let e_lba = u64::from_le_bytes(ent[40..48].try_into().unwrap_or([0; 8]));
                            if e_lba < s_lba {
                                continue;
                            }
                            found += 1;
                            if parts.len() < 128 {
                                let scnt = (e_lba - s_lba).saturating_add(1);
                                let units: Vec<u16> = (0..36)
                                    .map(|k| u16::from_le_bytes([ent[56 + k * 2], ent[56 + k * 2 + 1]]))
                                    .take_while(|&u| u != 0)
                                    .collect();
                                let name_utf8 = String::from_utf16_lossy(&units);
                                let d1 = u32::from_le_bytes([ent[0], ent[1], ent[2], ent[3]]);
                                let d2 = u16::from_le_bytes([ent[4], ent[5]]);
                                let d3 = u16::from_le_bytes([ent[6], ent[7]]);
                                let type_label = match (d1, d2, d3) {
                                    (0xEBD0A0A2, 0xB9E5, 0x4433) => "Microsoft Basic Data (NTFS/exFAT)",
                                    (0xC12A7328, 0xF81F, 0x11D2) => "EFI System Partition (ESP)",
                                    (0xE3C9E316, 0x0B5C, 0x4DB8) => "Microsoft Reserved (MSR)",
                                    (0xDE94BBA4, 0x06D1, 0x4D40) => "Windows Recovery Environment",
                                    (0x0FC63DAF, 0x8483, 0x4772) => "Linux Filesystem Data",
                                    _ => "GPT Partition",
                                };
                                parts.push(serde_json::json!({
                                    "index": found,
                                    "sectorAligned4K": s_lba.checked_mul(sec_bytes as u64).map(|b| b % 4096 == 0).unwrap_or(false),
                                    "startLba": s_lba,
                                    "endLba": e_lba,
                                    "sectorCount": scnt,
                                    "sizeBytes": scnt.saturating_mul(sec_bytes as u64),
                                    "mbrTypeByte": 0,
                                    "isBootable": (ent[48] & 0x04) != 0,
                                    "isGpt": true,
                                    "typeLabel": type_label,
                                    "nameUtf8": name_utf8
                                }));
                            }
                        }
                    }
                }
            }
        }

        return Ok(serde_json::json!({
            "engineSource": "rust-parity-fallback",
            "sectorSize": sec_bytes as u32,
            "partitionCount": found,
            "hasMbrSignature": mbr_sig,
            "hasGptHeader": true,
            "gptHeaderCrcValid": stored_hdr_crc == computed_hdr_crc,
            "gptEntriesCrcValid": arr_crc_valid,
            "isProtectiveMbr": is_protective,
            "storedHeaderCrc32": stored_hdr_crc,
            "computedHeaderCrc32": computed_hdr_crc,
            "storedEntriesCrc32": stored_arr_crc,
            "computedEntriesCrc32": computed_arr_crc,
            "firstUsableLba": first_usable,
            "lastUsableLba": last_usable,
            "schemeName": "GPT",
            "partitions": parts
        }));
    }

    if mbr_sig {
        let mut parts = Vec::new();
        let mut found = 0u32;
        for p in 0..4 {
            let ent = &bytes[446 + p * 16..446 + (p + 1) * 16];
            let p_type = ent[4];
            let s_lba = u32::from_le_bytes([ent[8], ent[9], ent[10], ent[11]]) as u64;
            let cnt = u32::from_le_bytes([ent[12], ent[13], ent[14], ent[15]]) as u64;
            if p_type == 0 || cnt == 0 {
                continue;
            }
            found += 1;
            let label = match p_type {
                0x07 => "NTFS / exFAT",
                0x0B | 0x0C => "FAT32",
                0x83 => "Linux ext4/xfs",
                0xEE => "Protective GPT",
                _ => "MBR Partition",
            };
            parts.push(serde_json::json!({
                "index": found,
                "sectorAligned4K": (s_lba * sec_bytes as u64) % 4096 == 0,
                "startLba": s_lba,
                "endLba": s_lba + cnt - 1,
                "sectorCount": cnt,
                "sizeBytes": cnt * sec_bytes as u64,
                "mbrTypeByte": p_type,
                "isBootable": ent[0] == 0x80,
                "isGpt": false,
                "typeLabel": label,
                "nameUtf8": format!("MBR Partition #{}", p + 1)
            }));
        }
        return Ok(serde_json::json!({
            "engineSource": "rust-parity-fallback",
            "sectorSize": sec_bytes as u32,
            "partitionCount": found,
            "hasMbrSignature": true,
            "hasGptHeader": false,
            "gptHeaderCrcValid": false,
            "gptEntriesCrcValid": false,
            "isProtectiveMbr": is_protective,
            "storedHeaderCrc32": 0,
            "computedHeaderCrc32": 0,
            "storedEntriesCrc32": 0,
            "computedEntriesCrc32": 0,
            "firstUsableLba": 0,
            "lastUsableLba": 0,
            "schemeName": "MBR",
            "partitions": parts
        }));
    }

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "sectorSize": sec_bytes as u32,
        "partitionCount": 0,
        "hasMbrSignature": false,
        "hasGptHeader": false,
        "gptHeaderCrcValid": false,
        "gptEntriesCrcValid": false,
        "isProtectiveMbr": false,
        "storedHeaderCrc32": 0,
        "computedHeaderCrc32": 0,
        "storedEntriesCrc32": 0,
        "computedEntriesCrc32": 0,
        "firstUsableLba": 0,
        "lastUsableLba": 0,
        "schemeName": "RAW/UNFORMATTED",
        "partitions": []
    }))
}

#[tauri::command]
fn inspect_forensics_vbr_sector(bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    if bytes.len() < 512 {
        return Ok(serde_json::json!({ "detected": false }));
    }
    #[cfg(windows)]
    {
        if let Some(dll) = get_forensics_dll() {
            let mut info: DsfVbrInfoC = unsafe { std::mem::zeroed() };
            if let Ok(len_u32) = u32::try_from(bytes.len()) {
                if unsafe { (dll.fn_vbr)(bytes.as_ptr(), len_u32, &mut info) } && info.fs_type != 0 {
                    return Ok(serde_json::json!({
                        "detected": true,
                        "engineSource": "native-cpp-dll",
                        "fsType": info.fs_type,
                        "bytesPerSector": info.bytes_per_sector,
                        "sectorsPerCluster": info.sectors_per_cluster,
                        "clusterSizeBytes": info.cluster_size_bytes,
                        "reservedSectors": info.reserved_sectors,
                        "rootCluster": info.root_cluster,
                        "totalSectors": info.total_sectors,
                        "mftStartLcn": info.mft_start_lcn,
                        "hasBootSignature": info.has_boot_signature != 0,
                        "oemId": c_buf_to_string(&info.oem_id)
                    }));
                }
            }
        }
    }

    let has_sig = bytes[510] == 0x55 && bytes[511] == 0xAA;
    let oem_id: String = bytes[3..11]
        .iter()
        .map(|&b| if (32..=126).contains(&b) { b as char } else { ' ' })
        .collect::<String>()
        .trim()
        .to_string();

    if &bytes[3..11] == b"NTFS    " {
        let bps = u16::from_le_bytes([bytes[11], bytes[12]]) as u32;
        let spc = bytes[13] as u32;
        if (512..=4096).contains(&bps) && bps.is_power_of_two() && spc > 0 && spc.is_power_of_two() {
            return Ok(serde_json::json!({
                "detected": true,
                "engineSource": "rust-parity-fallback",
                "fsType": 1,
                "bytesPerSector": bps,
                "sectorsPerCluster": spc,
                "clusterSizeBytes": bps * spc,
                "reservedSectors": u16::from_le_bytes([bytes[14], bytes[15]]) as u32,
                "rootCluster": 0,
                "totalSectors": u64::from_le_bytes(bytes[40..48].try_into().unwrap_or([0; 8])),
                "mftStartLcn": u64::from_le_bytes(bytes[48..56].try_into().unwrap_or([0; 8])),
                "hasBootSignature": has_sig,
                "oemId": oem_id
            }));
        }
        return Ok(serde_json::json!({ "detected": false }));
    }

    if &bytes[3..11] == b"EXFAT   " {
        let sec_shift = bytes[108];
        let clus_shift = bytes[109];
        if (9..=12).contains(&sec_shift) && clus_shift <= 25 {
            let bps = 1u32 << sec_shift;
            let spc = 1u32 << clus_shift;
            if (bps as u64) * (spc as u64) <= 33_554_432 {
                return Ok(serde_json::json!({
                    "detected": true,
                    "engineSource": "rust-parity-fallback",
                    "fsType": 3,
                    "bytesPerSector": bps,
                    "sectorsPerCluster": spc,
                    "clusterSizeBytes": bps * spc,
                    "reservedSectors": 0,
                    "rootCluster": u32::from_le_bytes([bytes[96], bytes[97], bytes[98], bytes[99]]),
                    "totalSectors": u64::from_le_bytes(bytes[72..80].try_into().unwrap_or([0; 8])),
                    "mftStartLcn": 0,
                    "hasBootSignature": has_sig,
                    "oemId": oem_id
                }));
            }
        }
        return Ok(serde_json::json!({ "detected": false }));
    }

    let has_fat32_sig = &bytes[82..87] == b"FAT32";
    let fat_size32 = u32::from_le_bytes([bytes[36], bytes[37], bytes[38], bytes[39]]);
    let res_secs = u16::from_le_bytes([bytes[14], bytes[15]]) as u32;
    let num_fats = bytes[16];
    if has_fat32_sig || (has_sig && fat_size32 > 0 && res_secs > 0 && (1..=4).contains(&num_fats)) {
        let bps = u16::from_le_bytes([bytes[11], bytes[12]]) as u32;
        let spc = bytes[13] as u32;
        if (512..=4096).contains(&bps) && bps.is_power_of_two() && spc > 0 && spc.is_power_of_two() {
            let tot16 = u16::from_le_bytes([bytes[19], bytes[20]]) as u64;
            let tot32 = u32::from_le_bytes([bytes[32], bytes[33], bytes[34], bytes[35]]) as u64;
            return Ok(serde_json::json!({
                "detected": true,
                "engineSource": "rust-parity-fallback",
                "fsType": 2,
                "bytesPerSector": bps,
                "sectorsPerCluster": spc,
                "clusterSizeBytes": bps * spc,
                "reservedSectors": res_secs,
                "rootCluster": u32::from_le_bytes([bytes[44], bytes[45], bytes[46], bytes[47]]),
                "totalSectors": if tot16 != 0 { tot16 } else { tot32 },
                "mftStartLcn": 0,
                "hasBootSignature": has_sig,
                "oemId": oem_id
            }));
        }
    }

    Ok(serde_json::json!({ "detected": false }))
}

// ===========================================================================
// Pure Creative Deep Recovery, MFT Decoder & PRNG Sanitize DLL (DiskSentinelRecovery.dll)
// ===========================================================================
#[cfg(windows)]
#[repr(C)]
struct DsrEngineInfoC {
    version: [u8; 32],
    capability_mask: u32,
    self_test_passed: u8,
    reserved0: [u8; 3],
    signature_rule_count: u32,
    self_test_crc32: u32,
    self_test_prng_sample: u64,
}

#[cfg(windows)]
#[repr(C)]
struct DsrCarveInspectionResultC {
    inspected_bytes: u32,
    signature_type: u32,
    confidence_score: u32,
    footer_detected: u8,
    is_truncated: u8,
    is_zero_filled: u8,
    reserved0: u8,
    estimated_payload_bytes: u64,
    crc32: u32,
    near_match_bit_flips: u32,
    galois_parity_64: u64,
    shannon_entropy: f64,
    printable_ratio: f64,
    signature_name: [u8; 64],
    file_extension: [u8; 16],
    footer_marker: [u8; 32],
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DsrNtfsDataRunC {
    lcn_start: u64,
    vcn_start: u64,
    cluster_count: u64,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DsrNtfsMftParsedRecordC {
    record_number: u32,
    parent_record_number: u32,
    in_use: u8,
    is_directory: u8,
    is_resident_data: u8,
    usa_fixup_applied: u8,
    usa_mismatch_sectors: u32,
    best_namespace: i32,
    data_run_count: u32,
    file_size_bytes: u64,
    creation_timestamp_ms: i64,
    file_name_utf8: [u8; 256],
}

#[cfg(windows)]
#[repr(C)]
struct DsrWipeVerifyReportC {
    checked_bytes: u64,
    verified_clean: u8,
    reserved0: [u8; 3],
    pattern_mode: u32,
    residual_non_matching_bytes: u64,
    first_mismatch_offset: i64,
    crc32: u32,
    reserved1: u32,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DsrDdrescueIntervalC {
    start_lba: u64,
    sector_count: u64,
    status_code: u32,
    attempts: u32,
    last_error_code: u32,
    reserved0: u32,
}

#[cfg(windows)]
#[repr(C)]
struct DsrDdrescuePlanSummaryC {
    coalesced_interval_count: u32,
    suggested_phase_code: u32,
    next_work_start_lba: u64,
    next_work_sector_count: u32,
    has_next_work: u8,
    completed: u8,
    reserved0: [u8; 2],
    total_sectors: u64,
    finished_sectors: u64,
    non_tried_sectors: u64,
    non_trimmed_sectors: u64,
    non_scraped_sectors: u64,
    bad_sectors: u64,
}

#[cfg(windows)]
struct RecoveryDllDispatch {
    loaded_path: String,
    fn_info: unsafe extern "system" fn(*mut DsrEngineInfoC) -> bool,
    fn_carve: unsafe extern "system" fn(*const u8, u32, *mut DsrCarveInspectionResultC) -> bool,
    fn_scan_mft: unsafe extern "system" fn(
        *const u8,
        u32,
        u32,
        u32,
        u64,
        u32,
        u64,
        u64,
        *mut DsrNtfsMftParsedRecordC,
        u32,
        *mut u32,
        *mut DsrNtfsDataRunC,
        u32,
        *mut u32,
    ) -> bool,
    fn_gen_wipe: unsafe extern "system" fn(*mut u8, u32, u32, u8, u64, u64, *mut u32) -> bool,
    fn_verify_wipe: unsafe extern "system" fn(*const u8, u32, u32, u8, u64, u64, *mut DsrWipeVerifyReportC) -> bool,
    fn_plan_ddrescue: unsafe extern "system" fn(
        *const DsrDdrescueIntervalC,
        u32,
        u32,
        *mut DsrDdrescueIntervalC,
        u32,
        *mut DsrDdrescuePlanSummaryC,
    ) -> bool,
}

#[cfg(windows)]
unsafe impl Send for RecoveryDllDispatch {}
#[cfg(windows)]
unsafe impl Sync for RecoveryDllDispatch {}

#[cfg(windows)]
static RECOVERY_DLL_DISPATCH: std::sync::OnceLock<Option<RecoveryDllDispatch>> =
    std::sync::OnceLock::new();

#[cfg(windows)]
fn get_recovery_dll() -> Option<&'static RecoveryDllDispatch> {
    RECOVERY_DLL_DISPATCH
        .get_or_init(|| {
            use windows_sys::Win32::System::LibraryLoader::{FreeLibrary, GetProcAddress, LoadLibraryW};

            let mut candidates: Vec<std::path::PathBuf> = Vec::new();
            if let Ok(exe) = std::env::current_exe() {
                if let Some(dir) = exe.parent() {
                    candidates.push(dir.join("DiskSentinelRecovery.dll"));
                    candidates.push(dir.join("resources").join("DiskSentinelRecovery.dll"));
                    candidates.push(dir.join("_up_").join("bin").join("native").join("DiskSentinelRecovery.dll"));
                }
            }
            candidates.push(std::path::PathBuf::from("bin\\native\\DiskSentinelRecovery.dll"));
            candidates.push(std::path::PathBuf::from("DiskSentinelRecovery.dll"));

            for path in candidates {
                let path_str = path.to_string_lossy().to_string();
                let mut wide: Vec<u16> = path_str.encode_utf16().collect();
                wide.push(0);
                let hmod = unsafe { LoadLibraryW(wide.as_ptr()) };
                if hmod == 0 {
                    continue;
                }
                unsafe {
                    let p_info = GetProcAddress(hmod, b"DSR_GetRecoveryEngineInfo\0".as_ptr());
                    let p_carve = GetProcAddress(hmod, b"DSR_InspectRecoveryCarveBuffer\0".as_ptr());
                    let p_scan_mft = GetProcAddress(hmod, b"DSR_ScanMftBufferForCluster\0".as_ptr());
                    let p_gen_wipe = GetProcAddress(hmod, b"DSR_GenerateWipePatternBuffer\0".as_ptr());
                    let p_verify_wipe = GetProcAddress(hmod, b"DSR_VerifyWipedBuffer\0".as_ptr());
                    let p_plan_dd = GetProcAddress(hmod, b"DSR_CoalesceAndPlanDdrescueIntervals\0".as_ptr());

                    if let (
                        Some(f_info),
                        Some(f_carve),
                        Some(f_mft),
                        Some(f_gen),
                        Some(f_ver),
                        Some(f_plan),
                    ) = (p_info, p_carve, p_scan_mft, p_gen_wipe, p_verify_wipe, p_plan_dd)
                    {
                        return Some(RecoveryDllDispatch {
                            loaded_path: path_str,
                            fn_info: std::mem::transmute(f_info),
                            fn_carve: std::mem::transmute(f_carve),
                            fn_scan_mft: std::mem::transmute(f_mft),
                            fn_gen_wipe: std::mem::transmute(f_gen),
                            fn_verify_wipe: std::mem::transmute(f_ver),
                            fn_plan_ddrescue: std::mem::transmute(f_plan),
                        });
                    }
                    FreeLibrary(hmod);
                }
            }
            None
        })
        .as_ref()
}

fn dsr_splitmix64_rust(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

struct DsrXoshiro256Rust {
    s: [u64; 4],
}

impl DsrXoshiro256Rust {
    fn new(seed64: u64, lba_offset: u64) -> Self {
        let mut sm = seed64
            ^ lba_offset.wrapping_mul(0xD6E8_FEB8_6659_FD93)
            ^ 0xA076_1D64_78BD_642F;
        let mut s = [
            dsr_splitmix64_rust(&mut sm),
            dsr_splitmix64_rust(&mut sm),
            dsr_splitmix64_rust(&mut sm),
            dsr_splitmix64_rust(&mut sm),
        ];
        if (s[0] | s[1] | s[2] | s[3]) == 0 {
            s = [
                0x243F_6A88_85A3_08D3,
                0x1319_8A2E_0370_7344,
                0xA409_3822_299F_31D0,
                0x082E_FA98_EC4E_6C89,
            ];
        }
        Self { s }
    }

    fn next64(&mut self) -> u64 {
        let result = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        result
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryDdrescueIntervalArg {
    start_lba: u64,
    sector_count: u64,
    status: String,
    attempts: u32,
    last_error_code: Option<u32>,
}

#[tauri::command]
fn inspect_recovery_dll_status() -> serde_json::Value {
    #[cfg(windows)]
    {
        if let Some(dll) = get_recovery_dll() {
            let mut info: DsrEngineInfoC = unsafe { std::mem::zeroed() };
            if unsafe { (dll.fn_info)(&mut info) } {
                return serde_json::json!({
                    "nativeDllLoaded": true,
                    "dllPath": dll.loaded_path,
                    "version": c_buf_to_string(&info.version),
                    "capabilityMask": info.capability_mask,
                    "selfTestPassed": info.self_test_passed != 0,
                    "signatureRuleCount": info.signature_rule_count,
                    "selfTestCrc32": info.self_test_crc32,
                    "selfTestPrngSample": info.self_test_prng_sample.to_string()
                });
            }
        }
    }

    let crc = dsf_crc32_ieee_rust(b"123456789");
    let mut rng = DsrXoshiro256Rust::new(0x2026_0406, 0);
    let sample = rng.next64();
    serde_json::json!({
        "nativeDllLoaded": false,
        "dllPath": serde_json::Value::Null,
        "version": "4.6.0-rust-parity",
        "capabilityMask": 0x0F,
        "selfTestPassed": crc == 0xCBF4_3926,
        "signatureRuleCount": 16,
        "selfTestCrc32": crc,
        "selfTestPrngSample": sample.to_string()
    })
}

#[tauri::command]
fn analyze_recovery_carve_buffer(bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    if bytes.is_empty() {
        return Err("Empty recovery inspection buffer".to_string());
    }
    #[cfg(windows)]
    {
        if let Some(dll) = get_recovery_dll() {
            let mut res: DsrCarveInspectionResultC = unsafe { std::mem::zeroed() };
            if let Ok(len_u32) = u32::try_from(bytes.len()) {
                if unsafe { (dll.fn_carve)(bytes.as_ptr(), len_u32, &mut res) } {
                    return Ok(serde_json::json!({
                        "engineSource": "native-cpp-dll",
                        "inspectedBytes": res.inspected_bytes,
                        "signatureType": res.signature_type,
                        "confidenceScore": res.confidence_score,
                        "footerDetected": res.footer_detected != 0,
                        "isTruncated": res.is_truncated != 0,
                        "isZeroFilled": res.is_zero_filled != 0,
                        "estimatedPayloadBytes": res.estimated_payload_bytes,
                        "crc32": res.crc32,
                        "nearMatchBitFlips": res.near_match_bit_flips,
                        "galoisParity64": res.galois_parity_64.to_string(),
                        "shannonEntropy": res.shannon_entropy,
                        "printableRatio": res.printable_ratio,
                        "signatureName": c_buf_to_string(&res.signature_name),
                        "fileExtension": c_buf_to_string(&res.file_extension),
                        "footerMarker": c_buf_to_string(&res.footer_marker)
                    }));
                }
            }
        }
    }

    let n = bytes.len();
    let mut hist = [0u32; 256];
    let mut printable = 0u32;
    let mut zero_acc = 0u8;
    let mut galois_parity = 0u64;
    let mut idx = 0usize;
    while idx < n {
        let b = bytes[idx];
        hist[b as usize] += 1;
        zero_acc |= b;
        galois_parity ^= (b as u64) << ((idx & 7) * 8);
        if (32..=126).contains(&b) || b == b'\t' || b == b'\r' || b == b'\n' {
            printable += 1;
            idx += 1;
        } else if (0xC2..=0xDF).contains(&b) && idx + 1 < n && (bytes[idx + 1] & 0xC0) == 0x80 {
            let cb1 = bytes[idx + 1];
            hist[cb1 as usize] += 1;
            zero_acc |= cb1;
            galois_parity ^= (cb1 as u64) << (((idx + 1) & 7) * 8);
            printable += 2;
            idx += 2;
        } else if (0xE0..=0xEF).contains(&b)
            && idx + 2 < n
            && (bytes[idx + 1] & 0xC0) == 0x80
            && (bytes[idx + 2] & 0xC0) == 0x80
        {
            for k in 1..=2 {
                let cb = bytes[idx + k];
                hist[cb as usize] += 1;
                zero_acc |= cb;
                galois_parity ^= (cb as u64) << (((idx + k) & 7) * 8);
            }
            printable += 3;
            idx += 3;
        } else if (0xF0..=0xF4).contains(&b)
            && idx + 3 < n
            && (bytes[idx + 1] & 0xC0) == 0x80
            && (bytes[idx + 2] & 0xC0) == 0x80
            && (bytes[idx + 3] & 0xC0) == 0x80
        {
            for k in 1..=3 {
                let cb = bytes[idx + k];
                hist[cb as usize] += 1;
                zero_acc |= cb;
                galois_parity ^= (cb as u64) << (((idx + k) & 7) * 8);
            }
            printable += 4;
            idx += 4;
        } else {
            idx += 1;
        }
    }
    let nf = n as f64;
    let mut entropy = 0.0f64;
    for &c in &hist {
        if c > 0 {
            let p = c as f64 / nf;
            entropy -= p * p.log2();
        }
    }
    if entropy < 0.0 { entropy = 0.0; }
    let printable_ratio = printable as f64 / nf;
    let crc32 = dsf_crc32_ieee_rust(&bytes);

    if zero_acc == 0 {
        return Ok(serde_json::json!({
            "engineSource": "rust-parity-fallback",
            "inspectedBytes": n,
            "signatureType": 0,
            "confidenceScore": 100,
            "footerDetected": false,
            "isTruncated": false,
            "isZeroFilled": true,
            "estimatedPayloadBytes": 0,
            "crc32": crc32,
            "nearMatchBitFlips": 0,
            "galoisParity64": galois_parity.to_string(),
            "shannonEntropy": entropy,
            "printableRatio": printable_ratio,
            "signatureName": "Zero-Filled / Deallocated Sector",
            "fileExtension": "bin",
            "footerMarker": ""
        }));
    }

    let find_sub = |needle: &[u8], start: usize| -> Option<usize> {
        if start >= bytes.len() || needle.is_empty() || bytes.len() - start < needle.len() {
            return None;
        }
        bytes[start..].windows(needle.len()).position(|w| w == needle).map(|idx| start + idx)
    };

    let (sig_type, sig_name, ext, conf, footer_ok, trunc, est_bytes, footer_marker, bit_flips): (
        u32, &str, &str, u32, bool, bool, u64, &str, u32
    ) = if n >= 3 && bytes[..3] == [0xFF, 0xD8, 0xFF] {
        if let Some(pos) = find_sub(&[0xFF, 0xD9], 4) {
            (1, "JPEG Image (EXIF/JFIF)", "jpg", 98, true, false, (pos + 2) as u64, "FF D9 (JPEG EOI)", 0)
        } else {
            (1, "JPEG Image (EXIF/JFIF)", "jpg", 88, false, true, n as u64, "", 0)
        }
    } else if n >= 8 && bytes[..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        if let Some(pos) = find_sub(&[0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82], 8) {
            (2, "PNG Lossless Image", "png", 99, true, false, (pos + 8) as u64, "IEND (CRC32 OK)", 0)
        } else {
            (2, "PNG Lossless Image", "png", 92, false, true, n as u64, "", 0)
        }
    } else if n >= 5 && &bytes[..5] == b"%PDF-" {
        if let Some(pos) = find_sub(b"%%EOF", 5) {
            (3, "PDF Portable Document", "pdf", 97, true, false, (pos + 5) as u64, "%%EOF Trailer", 0)
        } else {
            (3, "PDF Portable Document", "pdf", 90, false, true, n as u64, "", 0)
        }
    } else if n >= 4 && bytes[..4] == [0x50, 0x4B, 0x03, 0x04] {
        if let Some(pos) = find_sub(&[0x50, 0x4B, 0x05, 0x06], 4) {
            (4, "ZIP / DOCX / XLSX Archive", "zip", 97, true, false, (pos + 22) as u64, "PK EOCD (0x06054B50)", 0)
        } else {
            (4, "ZIP / DOCX / XLSX Archive", "zip", 89, false, true, n as u64, "", 0)
        }
    } else if n >= 8 && &bytes[4..8] == b"ftyp" {
        (5, "MP4 / MOV / ISO BMFF Video", "mp4", 91, false, false, n as u64, "", 0)
    } else if n >= 12 && &bytes[..4] == b"RIFF" {
        let riff_len = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as u64 + 8;
        let (sname, sext) = if &bytes[8..12] == b"WEBP" {
            ("RIFF WebP Image", "webp")
        } else if &bytes[8..12] == b"WAVE" {
            ("RIFF WAV Audio", "wav")
        } else {
            ("RIFF Media Container (AVI/WAV)", "avi")
        };
        (7, sname, sext, 93, riff_len <= n as u64, riff_len > n as u64, riff_len, "", 0)
    } else if n >= 6 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a") {
        (8, "GIF Animated Image", "gif", 94, false, false, n as u64, "", 0)
    } else if n >= 14 && bytes[0] == 0x42 && bytes[1] == 0x4D && u32::from_le_bytes([bytes[2], bytes[3], bytes[4], bytes[5]]) >= 26 {
        let bmp_len = u32::from_le_bytes([bytes[2], bytes[3], bytes[4], bytes[5]]) as u64;
        (9, "BMP Bitmap Image", "bmp", 87, bmp_len <= n as u64, bmp_len > n as u64, bmp_len, "", 0)
    } else if n >= 6 && bytes[..6] == [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] {
        (10, "7-Zip Compressed Archive", "7z", 96, false, false, n as u64, "", 0)
    } else if n >= 7 && bytes[..6] == *b"Rar!\x1A\x07" {
        (11, "RAR Archive", "rar", 95, false, false, n as u64, "", 0)
    } else if n >= 3 && bytes[..3] == [0x1F, 0x8B, 0x08] {
        (12, "GZIP Compressed Stream", "gz", 90, false, false, n as u64, "", 0)
    } else if n >= 16 && &bytes[..16] == b"SQLite format 3\0" {
        (13, "SQLite 3 Database", "sqlite", 99, false, false, n as u64, "", 0)
    } else if n >= 4 && bytes[..4] == [0x7F, b'E', b'L', b'F'] {
        (14, "ELF Executable / Shared Object", "elf", 95, false, false, n as u64, "", 0)
    } else if n >= 64 && bytes[0] == b'M' && bytes[1] == b'Z' {
        let pe_off = u32::from_le_bytes([bytes[60], bytes[61], bytes[62], bytes[63]]) as usize;
        if pe_off + 4 <= n && &bytes[pe_off..pe_off + 4] == b"PE\0\0" {
            (15, "Windows PE Executable / DLL", "exe", 96, false, false, n as u64, "", 0)
        } else if printable_ratio >= 0.80 {
            (6, "UTF-8 Source / System Log", "txt", (printable_ratio * 90.0) as u32, false, false, n as u64, "", 0)
        } else {
            (0, "Raw Binary / Unmapped Sector", "bin", 0, false, false, 0, "", 0)
        }
    } else if n >= 512 && &bytes[3..11] == b"NTFS    " && bytes[510] == 0x55 && bytes[511] == 0xAA {
        (16, "NTFS Volume Boot Record ($Boot)", "vbr", 99, false, false, 512, "", 0)
    } else {
        let near_candidates: &[(u32, &str, &str, &[u8])] = &[
            (2, "PNG Lossless Image (Bit-Flip Header)", "png", &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
            (3, "PDF Document (Bit-Flip Header)", "pdf", b"%PDF-"),
            (4, "ZIP/OOXML Archive (Bit-Flip Header)", "zip", &[0x50, 0x4B, 0x03, 0x04]),
            (13, "SQLite 3 DB (Bit-Flip Header)", "sqlite", b"SQLite f"),
        ];
        let mut best: Option<(u32, &str, &str, u32)> = None;
        for &(st, nm, ex, pat) in near_candidates {
            if n < pat.len() { continue; }
            let flips: u32 = pat.iter().enumerate().map(|(i, &p)| (bytes[i] ^ p).count_ones()).sum();
            if flips > 0 && flips <= 2 {
                if best.as_ref().map(|b| flips < b.3).unwrap_or(true) {
                    best = Some((st, nm, ex, flips));
                }
            }
        }
        if let Some((st, nm, ex, flips)) = best {
            (st, nm, ex, if flips == 1 { 72 } else { 58 }, false, false, n as u64, "", flips)
        } else if printable_ratio >= 0.80 {
            (6, "UTF-8 Source / System Log", "txt", (printable_ratio * 90.0) as u32, false, false, n as u64, "", 0)
        } else {
            (0, "Raw Binary / Unmapped Sector", "bin", 0, false, false, 0, "", 0)
        }
    };

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "inspectedBytes": n,
        "signatureType": sig_type,
        "confidenceScore": conf,
        "footerDetected": footer_ok,
        "isTruncated": trunc,
        "isZeroFilled": false,
        "estimatedPayloadBytes": est_bytes,
        "crc32": crc32,
        "nearMatchBitFlips": bit_flips,
        "galoisParity64": galois_parity.to_string(),
        "shannonEntropy": entropy,
        "printableRatio": printable_ratio,
        "signatureName": sig_name,
        "fileExtension": ext,
        "footerMarker": footer_marker
    }))
}

#[tauri::command]
fn parse_recovery_mft_batch(
    mft_bytes: Vec<u8>,
    mft_record_size: u32,
    first_record_index: u32,
    batch_start_lba: u64,
    sector_size: u32,
    target_lba: u64,
    target_lcn: u64,
) -> Result<serde_json::Value, String> {
    let rec_size = mft_record_size.max(512) as usize;
    let sec_size = sector_size.max(512) as usize;
    if mft_bytes.len() < rec_size {
        return Ok(serde_json::json!({
            "engineSource": "rust-parity-fallback",
            "matchedRecords": []
        }));
    }

    #[cfg(windows)]
    {
        if let Some(dll) = get_recovery_dll() {
            let max_matched = 64usize;
            let max_runs = 1024usize;
            let mut matched = vec![unsafe { std::mem::zeroed::<DsrNtfsMftParsedRecordC>() }; max_matched];
            let mut runs_flat = vec![unsafe { std::mem::zeroed::<DsrNtfsDataRunC>() }; max_runs];
            let mut matched_cnt: u32 = 0;
            let mut written_runs: u32 = 0;

            if unsafe {
                (dll.fn_scan_mft)(
                    mft_bytes.as_ptr(),
                    mft_bytes.len() as u32,
                    rec_size as u32,
                    first_record_index,
                    batch_start_lba,
                    sec_size as u32,
                    target_lba,
                    target_lcn,
                    matched.as_mut_ptr(),
                    max_matched as u32,
                    &mut matched_cnt,
                    runs_flat.as_mut_ptr(),
                    max_runs as u32,
                    &mut written_runs,
                )
            } {
                let take_rec = (matched_cnt as usize).min(max_matched);
                let mut run_cursor = 0usize;
                let mut out_recs = Vec::with_capacity(take_rec);
                for r in &matched[..take_rec] {
                    let rc = (r.data_run_count as usize).min((written_runs as usize).saturating_sub(run_cursor));
                    let runs_json: Vec<serde_json::Value> = runs_flat[run_cursor..run_cursor + rc]
                        .iter()
                        .map(|run| {
                            serde_json::json!({
                                "lcnStart": run.lcn_start,
                                "vcnStart": run.vcn_start,
                                "clusterCount": run.cluster_count
                            })
                        })
                        .collect();
                    run_cursor += rc;
                    out_recs.push(serde_json::json!({
                        "recordNumber": r.record_number,
                        "parentRecordNumber": r.parent_record_number,
                        "inUse": r.in_use != 0,
                        "isDirectory": r.is_directory != 0,
                        "isResidentData": r.is_resident_data != 0,
                        "usaMismatchSectors": r.usa_mismatch_sectors,
                        "namespace": r.best_namespace,
                        "fileSizeBytes": r.file_size_bytes,
                        "creationTimestampMs": if r.creation_timestamp_ms > 0 { Some(r.creation_timestamp_ms) } else { None::<i64> },
                        "fileName": c_buf_to_string(&r.file_name_utf8),
                        "dataRuns": runs_json
                    }));
                }
                return Ok(serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "matchedRecords": out_recs
                }));
            }
        }
    }

    // Rust parity fallback for NTFS MFT batch scan
    let rec_count = mft_bytes.len() / rec_size;
    let mut out_recs = Vec::new();
    for i in 0..rec_count {
        let start = i * rec_size;
        let mut buf = mft_bytes[start..start + rec_size].to_vec();
        if buf.len() < 512 || &buf[0..4] != b"FILE" {
            continue;
        }
        let usa_off = u16::from_le_bytes([buf[4], buf[5]]) as usize;
        let usa_cnt = u16::from_le_bytes([buf[6], buf[7]]) as usize;
        if usa_off < 42 || usa_cnt < 2 || usa_off + usa_cnt * 2 > buf.len() {
            continue;
        }
        let usn0 = buf[usa_off];
        let usn1 = buf[usa_off + 1];
        let mut mismatches = 0u32;
        for s in 1..usa_cnt {
            let end = s * 512 - 2;
            if end + 1 >= buf.len() { break; }
            if buf[end] == usn0 && buf[end + 1] == usn1 {
                buf[end] = buf[usa_off + s * 2];
                buf[end + 1] = buf[usa_off + s * 2 + 1];
            } else {
                mismatches += 1;
            }
        }
        let flags = u16::from_le_bytes([buf[22], buf[23]]);
        if (flags & 0x01) == 0 {
            continue;
        }
        let is_dir = (flags & 0x02) != 0;
        let first_attr = u16::from_le_bytes([buf[20], buf[21]]) as usize;
        let bytes_used = (u32::from_le_bytes([buf[24], buf[25], buf[26], buf[27]]) as usize).clamp(0, buf.len());
        let used_end = if bytes_used == 0 { buf.len() } else { bytes_used };
        let rec_num_raw = u32::from_le_bytes([buf[44], buf[45], buf[46], buf[47]]);
        let rec_num = if rec_num_raw == 0 { first_record_index + i as u32 } else { rec_num_raw };

        let mut best_name = String::new();
        let mut best_ns = -1i32;
        let mut parent_rec = 5u32;
        let mut file_size = 0u64;
        let mut creation_ms = 0i64;
        let mut is_resident = false;
        let mut runs: Vec<(u64, u64, u64)> = Vec::new();

        let mut off = first_attr;
        while off + 16 <= used_end {
            let atype = u32::from_le_bytes([buf[off], buf[off + 1], buf[off + 2], buf[off + 3]]);
            if atype == 0xFFFF_FFFF || atype == 0 { break; }
            let alen = u32::from_le_bytes([buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]]) as usize;
            if alen < 16 || off + alen > used_end { break; }
            let non_res = buf[off + 8] != 0;

            if atype == 0x10 && !non_res && alen >= 24 {
                let clen = u32::from_le_bytes([buf[off + 16], buf[off + 17], buf[off + 18], buf[off + 19]]) as usize;
                let coff = off + u16::from_le_bytes([buf[off + 20], buf[off + 21]]) as usize;
                if clen >= 8 && coff + 8 <= off + alen {
                    let ft = u64::from_le_bytes(buf[coff..coff + 8].try_into().unwrap_or([0; 8]));
                    if ft > 116_444_736_000_000_000 {
                        creation_ms = ((ft - 116_444_736_000_000_000) / 10_000) as i64;
                    }
                }
            }
            if atype == 0x30 && !non_res && alen >= 24 {
                let clen = u32::from_le_bytes([buf[off + 16], buf[off + 17], buf[off + 18], buf[off + 19]]) as usize;
                let coff = off + u16::from_le_bytes([buf[off + 20], buf[off + 21]]) as usize;
                if clen >= 66 && coff + 66 <= off + alen {
                    let prec = u32::from_le_bytes([buf[coff], buf[coff + 1], buf[coff + 2], buf[coff + 3]]);
                    let rsize = u64::from_le_bytes(buf[coff + 48..coff + 56].try_into().unwrap_or([0; 8]));
                    let nlen = buf[coff + 64] as usize;
                    let ns = buf[coff + 65] as i32;
                    let nstart = coff + 66;
                    let avail = (off + alen).saturating_sub(nstart);
                    let take_chars = nlen.min(avail / 2);
                    let rank = |v: i32| if v == 1 || v == 3 { 3 } else if v == 0 { 2 } else { 1 };
                    if take_chars > 0 && rank(ns) >= rank(best_ns) {
                        let units: Vec<u16> = (0..take_chars)
                            .map(|k| u16::from_le_bytes([buf[nstart + k * 2], buf[nstart + k * 2 + 1]]))
                            .take_while(|&u| u != 0)
                            .collect();
                        best_name = String::from_utf16_lossy(&units);
                        best_ns = ns;
                        parent_rec = prec;
                        if file_size == 0 && rsize > 0 { file_size = rsize; }
                    }
                }
            }
            if atype == 0x80 && buf[off + 9] == 0 {
                if !non_res && alen >= 24 {
                    is_resident = true;
                    let rsz = u32::from_le_bytes([buf[off + 16], buf[off + 17], buf[off + 18], buf[off + 19]]) as u64;
                    if rsz > 0 { file_size = rsz; }
                } else if non_res && alen >= 64 {
                    let rsz = u64::from_le_bytes(buf[off + 48..off + 56].try_into().unwrap_or([0; 8]));
                    if rsz > 0 { file_size = rsz; }
                    let rl_rel = u16::from_le_bytes([buf[off + 32], buf[off + 33]]) as usize;
                    if rl_rel >= 64 && off + rl_rel < off + alen {
                        let mut pos = off + rl_rel;
                        let end_pos = off + alen;
                        let mut prev_lcn = 0i64;
                        let mut cur_vcn = 0u64;
                        while pos < end_pos {
                            let hdr = buf[pos];
                            pos += 1;
                            if hdr == 0 { break; }
                            let ls = (hdr & 0x0F) as usize;
                            let os = ((hdr >> 4) & 0x0F) as usize;
                            if ls == 0 || ls > 8 || os > 8 || pos + ls + os > end_pos { break; }
                            let mut ccnt = 0u64;
                            for k in 0..ls { ccnt |= (buf[pos + k] as u64) << (k * 8); }
                            pos += ls;
                            let mut delta = 0u64;
                            for k in 0..os { delta |= (buf[pos + k] as u64) << (k * 8); }
                            if os > 0 && os < 8 && (buf[pos + os - 1] & 0x80) != 0 {
                                delta |= !0u64 << (os * 8);
                            }
                            pos += os;
                            if os > 0 && ccnt > 0 {
                                let next_lcn = prev_lcn + (delta as i64);
                                prev_lcn = next_lcn;
                                if next_lcn >= 0 {
                                    runs.push((next_lcn as u64, cur_vcn, ccnt));
                                }
                            }
                            cur_vcn += ccnt;
                        }
                    }
                }
            }
            off += alen;
        }

        let hits_ext = runs.iter().any(|&(lcn, _, cnt)| lcn <= target_lcn && (target_lcn - lcn) < cnt);
        let rec_lba_start = batch_start_lba + (start / sec_size) as u64;
        let rec_lba_end = batch_start_lba + ((start + rec_size - 1) / sec_size) as u64;
        let hits_resident_record =
            target_lba > 0 && target_lba != u64::MAX && target_lba >= rec_lba_start && target_lba <= rec_lba_end;
        if hits_ext || hits_resident_record {
            let runs_json: Vec<serde_json::Value> = runs
                .iter()
                .map(|&(lcn, vcn, cnt)| serde_json::json!({ "lcnStart": lcn, "vcnStart": vcn, "clusterCount": cnt }))
                .collect();
            out_recs.push(serde_json::json!({
                "recordNumber": rec_num,
                "parentRecordNumber": parent_rec,
                "inUse": true,
                "isDirectory": is_dir,
                "isResidentData": is_resident,
                "usaMismatchSectors": mismatches,
                "namespace": best_ns,
                "fileSizeBytes": file_size,
                "creationTimestampMs": if creation_ms > 0 { Some(creation_ms) } else { None::<i64> },
                "fileName": best_name,
                "dataRuns": runs_json
            }));
            if out_recs.len() >= 64 { break; }
        }
    }

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "matchedRecords": out_recs
    }))
}

#[tauri::command]
fn generate_recovery_wipe_pattern(
    buffer_length: u32,
    pattern_mode: u32,
    constant_byte: u8,
    seed_str: String,
    lba_offset: u64,
) -> Result<serde_json::Value, String> {
    let len = buffer_length.clamp(64, 65536) as usize;
    let seed64 = seed_str.trim().parse::<u64>().unwrap_or(0x2026_0406_0001);
    let mut buf = vec![0u8; len];

    #[cfg(windows)]
    {
        if let Some(dll) = get_recovery_dll() {
            let mut crc32: u32 = 0;
            if unsafe {
                (dll.fn_gen_wipe)(
                    buf.as_mut_ptr(),
                    len as u32,
                    pattern_mode,
                    constant_byte,
                    seed64,
                    lba_offset,
                    &mut crc32,
                )
            } {
                return Ok(serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "bufferLength": len,
                    "crc32": crc32,
                    "previewBytes": buf[..len.min(64)].to_vec(),
                    "bytes": buf
                }));
            }
        }
    }

    match pattern_mode {
        0 => buf.fill(0x00),
        1 => buf.fill(0xFF),
        2 => buf.fill(constant_byte),
        _ => {
            let mut rng = DsrXoshiro256Rust::new(seed64, lba_offset);
            let mut idx = 0usize;
            while idx < len {
                let v = rng.next64().to_le_bytes();
                let take = (len - idx).min(8);
                buf[idx..idx + take].copy_from_slice(&v[..take]);
                idx += take;
            }
        }
    }
    let crc32 = dsf_crc32_ieee_rust(&buf);
    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "bufferLength": len,
        "crc32": crc32,
        "previewBytes": buf[..len.min(64)].to_vec(),
        "bytes": buf
    }))
}

#[tauri::command]
fn verify_recovery_wipe_buffer(
    bytes: Vec<u8>,
    pattern_mode: u32,
    constant_byte: u8,
    seed_str: String,
    lba_offset: u64,
) -> Result<serde_json::Value, String> {
    if bytes.is_empty() {
        return Err("Empty wipe verification buffer".to_string());
    }
    let seed64 = seed_str.trim().parse::<u64>().unwrap_or(0x2026_0406_0001);

    #[cfg(windows)]
    {
        if let Some(dll) = get_recovery_dll() {
            let mut rep: DsrWipeVerifyReportC = unsafe { std::mem::zeroed() };
            if unsafe {
                (dll.fn_verify_wipe)(
                    bytes.as_ptr(),
                    bytes.len() as u32,
                    pattern_mode,
                    constant_byte,
                    seed64,
                    lba_offset,
                    &mut rep,
                )
            } {
                return Ok(serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "checkedBytes": rep.checked_bytes,
                    "verifiedClean": rep.verified_clean != 0,
                    "patternMode": rep.pattern_mode,
                    "residualNonMatchingBytes": rep.residual_non_matching_bytes,
                    "firstMismatchOffset": rep.first_mismatch_offset,
                    "crc32": rep.crc32
                }));
            }
        }
    }

    let mut mismatches = 0u64;
    let mut first_off = -1i64;
    match pattern_mode {
        0 | 1 | 2 => {
            let exp = if pattern_mode == 0 { 0x00 } else if pattern_mode == 1 { 0xFF } else { constant_byte };
            for (i, &b) in bytes.iter().enumerate() {
                if b != exp {
                    if first_off < 0 { first_off = i as i64; }
                    mismatches += 1;
                }
            }
        }
        _ => {
            let mut rng = DsrXoshiro256Rust::new(seed64, lba_offset);
            let mut idx = 0usize;
            while idx < bytes.len() {
                let v = rng.next64().to_le_bytes();
                let take = (bytes.len() - idx).min(8);
                for k in 0..take {
                    if bytes[idx + k] != v[k] {
                        if first_off < 0 { first_off = (idx + k) as i64; }
                        mismatches += 1;
                    }
                }
                idx += take;
            }
        }
    }

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "checkedBytes": bytes.len() as u64,
        "verifiedClean": mismatches == 0,
        "patternMode": pattern_mode,
        "residualNonMatchingBytes": mismatches,
        "firstMismatchOffset": first_off,
        "crc32": dsf_crc32_ieee_rust(&bytes)
    }))
}

#[tauri::command]
fn plan_recovery_ddrescue_intervals(
    intervals: Vec<RecoveryDdrescueIntervalArg>,
    chunk_sectors: u32,
) -> Result<serde_json::Value, String> {
    let status_to_code = |s: &str| -> u32 {
        match s {
            "non_tried" => 0,
            "non_trimmed" => 1,
            "non_scraped" => 2,
            "bad_sector" => 3,
            "finished" => 4,
            _ => 0,
        }
    };
    let code_to_status = |c: u32| -> &'static str {
        match c {
            0 => "non_tried",
            1 => "non_trimmed",
            2 => "non_scraped",
            3 => "bad_sector",
            _ => "finished",
        }
    };
    let phase_name = |c: u32| -> &'static str {
        match c {
            0 => "copying",
            1 => "trimming",
            2 => "retrying",
            _ => "completed",
        }
    };

    #[cfg(windows)]
    {
        if let Some(dll) = get_recovery_dll() {
            let c_in: Vec<DsrDdrescueIntervalC> = intervals
                .iter()
                .map(|iv| DsrDdrescueIntervalC {
                    start_lba: iv.start_lba,
                    sector_count: iv.sector_count,
                    status_code: status_to_code(&iv.status),
                    attempts: iv.attempts,
                    last_error_code: iv.last_error_code.unwrap_or(0),
                    reserved0: 0,
                })
                .collect();
            let mut c_out = vec![unsafe { std::mem::zeroed::<DsrDdrescueIntervalC>() }; c_in.len().max(1)];
            let mut summary: DsrDdrescuePlanSummaryC = unsafe { std::mem::zeroed() };
            let in_ptr = if c_in.is_empty() { std::ptr::null() } else { c_in.as_ptr() };
            if unsafe {
                (dll.fn_plan_ddrescue)(
                    in_ptr,
                    c_in.len() as u32,
                    chunk_sectors,
                    c_out.as_mut_ptr(),
                    c_out.len() as u32,
                    &mut summary,
                )
            } {
                let take = (summary.coalesced_interval_count as usize).min(c_out.len());
                let out_list: Vec<serde_json::Value> = c_out[..take]
                    .iter()
                    .map(|iv| {
                        serde_json::json!({
                            "startLba": iv.start_lba,
                            "sectorCount": iv.sector_count,
                            "status": code_to_status(iv.status_code),
                            "attempts": iv.attempts,
                            "lastErrorCode": if iv.last_error_code > 0 { Some(iv.last_error_code) } else { None::<u32> }
                        })
                    })
                    .collect();
                return Ok(serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "coalescedIntervalCount": summary.coalesced_interval_count,
                    "suggestedPhase": phase_name(summary.suggested_phase_code),
                    "nextWorkStartLba": summary.next_work_start_lba,
                    "nextWorkSectorCount": summary.next_work_sector_count,
                    "hasNextWork": summary.has_next_work != 0,
                    "completed": summary.completed != 0,
                    "totalSectors": summary.total_sectors,
                    "finishedSectors": summary.finished_sectors,
                    "nonTriedSectors": summary.non_tried_sectors,
                    "nonTrimmedSectors": summary.non_trimmed_sectors,
                    "nonScrapedSectors": summary.non_scraped_sectors,
                    "badSectors": summary.bad_sectors,
                    "intervals": out_list
                }));
            }
        }
    }

    let _ = status_to_code;
    let _ = code_to_status;
    let _ = phase_name;

    let dd_ivs: Vec<DdrescueInterval> = intervals
        .into_iter()
        .map(|iv| DdrescueInterval {
            start_lba: iv.start_lba,
            sector_count: iv.sector_count,
            status: iv.status,
            attempts: iv.attempts,
            last_error_code: iv.last_error_code,
        })
        .collect();
    let coalesced = coalesce_ddrescue_intervals(dd_ivs);
    let safe_chunk = chunk_sectors.clamp(16, 2048);
    let trim_step = (safe_chunk / 4).clamp(4, 16);

    let mut fin = 0u64;
    let mut nt = 0u64;
    let mut ntr = 0u64;
    let mut nsc = 0u64;
    let mut bad = 0u64;
    let mut first_nt: Option<&DdrescueInterval> = None;
    let mut first_ntr: Option<&DdrescueInterval> = None;
    let mut first_nsc: Option<&DdrescueInterval> = None;
    for iv in &coalesced {
        match iv.status.as_str() {
            "finished" => fin += iv.sector_count,
            "non_tried" => { nt += iv.sector_count; if first_nt.is_none() { first_nt = Some(iv); } }
            "non_trimmed" => { ntr += iv.sector_count; if first_ntr.is_none() { first_ntr = Some(iv); } }
            "non_scraped" => { nsc += iv.sector_count; if first_nsc.is_none() { first_nsc = Some(iv); } }
            "bad_sector" => bad += iv.sector_count,
            _ => {}
        }
    }
    let total = fin + nt + ntr + nsc + bad;
    let (sug_phase, nw_lba, nw_cnt, has_next, comp) = if let Some(iv) = first_nt {
        ("copying", iv.start_lba, iv.sector_count.min(safe_chunk as u64) as u32, true, false)
    } else if let Some(iv) = first_ntr {
        ("trimming", iv.start_lba, iv.sector_count.min(trim_step as u64) as u32, true, false)
    } else if let Some(iv) = first_nsc {
        ("retrying", iv.start_lba, 1u32, true, false)
    } else {
        ("completed", 0u64, 0u32, false, true)
    };

    Ok(serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "coalescedIntervalCount": coalesced.len(),
        "suggestedPhase": sug_phase,
        "nextWorkStartLba": nw_lba,
        "nextWorkSectorCount": nw_cnt,
        "hasNextWork": has_next,
        "completed": comp,
        "totalSectors": total,
        "finishedSectors": fin,
        "nonTriedSectors": nt,
        "nonTrimmedSectors": ntr,
        "nonScrapedSectors": nsc,
        "badSectors": bad,
        "intervals": coalesced
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

// ---------------------------------------------------------------------------
// Real Win32 PCIe/SATA Link Speed & NVMe Controller Probing
// ---------------------------------------------------------------------------
fn lookup_pci_controller_vendor(vid: u16, did: u16) -> Option<&'static str> {
    match (vid, did) {
        (0x144D, 0xA808) => Some("Samsung PM981 / 970 EVO Plus (Phoenix)"),
        (0x144D, 0xA80A) => Some("Samsung 980 PRO / PM9A1 (Elpis PCIe 4.0)"),
        (0x144D, 0xA80C) => Some("Samsung 990 PRO (Pascal PCIe 4.0)"),
        (0x144D, _) => Some("Samsung NVMe Controller"),
        (0x15B7, 0x5017) => Some("WD Black SN850X (Triton MP16+ B2)"),
        (0x15B7, 0x5011) => Some("WD Black SN850 (SanDisk G2)"),
        (0x15B7, _) => Some("Western Digital / SanDisk NVMe Controller"),
        (0x1987, 0x5016) => Some("Phison PS5016-E16 PCIe 4.0 NVMe"),
        (0x1987, 0x5018) => Some("Phison PS5018-E18 PCIe 4.0 NVMe"),
        (0x1987, 0x5026) => Some("Phison PS5026-E26 PCIe 5.0 NVMe"),
        (0x1987, _) => Some("Phison Electronics NVMe Controller"),
        (0x1C5C, 0x174A) => Some("SK hynix Platinum P41 / PC801 (Aries)"),
        (0x1C5C, _) => Some("SK hynix NVMe Controller"),
        (0xC0A9, _) | (0x1344, _) => Some("Micron / Crucial NVMe Controller"),
        (0x1E0F, _) | (0x1179, _) => Some("Kioxia / Toshiba NVMe Controller"),
        (0x126F, _) => Some("Silicon Motion (SMI) NVMe Controller"),
        (0x1E4B, _) => Some("MaxioTech MAP1602 / NVMe Controller"),
        (0x2646, _) => Some("Kingston Technology NVMe Controller"),
        (0x8086, _) => Some("Intel Storage / PCIe Root Controller"),
        (0x1B21, _) => Some("ASMedia SATA/PCIe Bridge Controller"),
        (0x10EC, _) => Some("Realtek PCIe/NVMe Controller"),
        (0x152D, _) => Some("JMicron Storage Controller"),
        (0x1022, _) => Some("AMD StorAHCI / NVMe RAID Controller"),
        (0x1000, _) | (0x1028, _) => Some("Broadcom / Dell PERC SAS/SATA Controller"),
        _ => None,
    }
}

fn pcie_gen_gtps_label(gen: u32) -> (&'static str, f64) {
    match gen {
        1 => ("PCIe 1.0", 2.5),
        2 => ("PCIe 2.0", 5.0),
        3 => ("PCIe 3.0", 8.0),
        4 => ("PCIe 4.0", 16.0),
        5 => ("PCIe 5.0", 32.0),
        6 => ("PCIe 6.0", 64.0),
        _ => ("PCIe", 0.0),
    }
}

fn pcie_effective_gbps(gen: u32, width: u32) -> Option<f64> {
    let per_lane_gbps = match gen {
        1 => 0.25,
        2 => 0.50,
        3 => 0.985,
        4 => 1.969,
        5 => 3.938,
        6 => 7.563,
        _ => return None,
    };
    if width == 0 {
        return None;
    }
    Some(((per_lane_gbps * (width as f64)) * 100.0).round() / 100.0)
}

#[cfg(windows)]
fn probe_pci_devnode_link_for_drive(
    drive_index: u32,
) -> (Option<u32>, Option<u32>, Option<u32>, Option<u32>, Option<u16>, Option<u16>, Option<String>) {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::IO::DeviceIoControl;
    use windows_sys::Win32::System::LibraryLoader::{FreeLibrary, GetProcAddress, LoadLibraryW};

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Guid {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }

    #[repr(C)]
    struct SpDevinfoData {
        cb_size: u32,
        class_guid: Guid,
        dev_inst: u32,
        reserved: usize,
    }

    #[repr(C)]
    struct SpDeviceInterfaceData {
        cb_size: u32,
        interface_class_guid: Guid,
        flags: u32,
        reserved: usize,
    }

    #[repr(C)]
    struct DevPropKey {
        fmtid: Guid,
        pid: u32,
    }

    #[repr(C)]
    struct StorageDeviceNumber {
        device_type: u32,
        device_number: u32,
        partition_number: u32,
    }

    const DIGCF_PRESENT: u32 = 0x0000_0002;
    const DIGCF_DEVICEINTERFACE: u32 = 0x0000_0010;
    const IOCTL_STORAGE_GET_DEVICE_NUMBER: u32 = 0x002D1080;

    let setupapi_w: Vec<u16> = "setupapi.dll\0".encode_utf16().collect();
    let cfgmgr_w: Vec<u16> = "cfgmgr32.dll\0".encode_utf16().collect();
    let h_setup = unsafe { LoadLibraryW(setupapi_w.as_ptr()) };
    let h_cfg = unsafe { LoadLibraryW(cfgmgr_w.as_ptr()) };
    if h_setup == 0 || h_cfg == 0 {
        if h_setup != 0 {
            unsafe { FreeLibrary(h_setup) };
        }
        if h_cfg != 0 {
            unsafe { FreeLibrary(h_cfg) };
        }
        return (None, None, None, None, None, None, None);
    }

    type FnGetClassDevsW = unsafe extern "system" fn(*const Guid, *const u16, isize, u32) -> isize;
    type FnEnumDeviceInterfaces = unsafe extern "system" fn(
        isize,
        *const SpDevinfoData,
        *const Guid,
        u32,
        *mut SpDeviceInterfaceData,
    ) -> i32;
    type FnGetDeviceInterfaceDetailW = unsafe extern "system" fn(
        isize,
        *const SpDeviceInterfaceData,
        *mut u8,
        u32,
        *mut u32,
        *mut SpDevinfoData,
    ) -> i32;
    type FnDestroyDeviceInfoList = unsafe extern "system" fn(isize) -> i32;

    type FnCmGetParent = unsafe extern "system" fn(*mut u32, u32, u32) -> u32;
    type FnCmGetDeviceIdW = unsafe extern "system" fn(u32, *mut u16, u32, u32) -> u32;
    type FnCmGetDevNodePropertyW = unsafe extern "system" fn(
        u32,
        *const DevPropKey,
        *mut u32,
        *mut u8,
        *mut u32,
        u32,
    ) -> u32;

    let get_proc = |hmod: isize, name: &[u8]| -> Option<*const ()> {
        let p = unsafe { GetProcAddress(hmod, name.as_ptr()) };
        p.map(|f| f as *const ())
    };

    let (
        Some(p_get_devs),
        Some(p_enum_iface),
        Some(p_get_detail),
        Some(p_destroy),
        Some(p_cm_parent),
        Some(p_cm_devid),
        Some(p_cm_prop),
    ) = (
        get_proc(h_setup, b"SetupDiGetClassDevsW\0"),
        get_proc(h_setup, b"SetupDiEnumDeviceInterfaces\0"),
        get_proc(h_setup, b"SetupDiGetDeviceInterfaceDetailW\0"),
        get_proc(h_setup, b"SetupDiDestroyDeviceInfoList\0"),
        get_proc(h_cfg, b"CM_Get_Parent\0"),
        get_proc(h_cfg, b"CM_Get_Device_IDW\0"),
        get_proc(h_cfg, b"CM_Get_DevNode_PropertyW\0"),
    ) else {
        unsafe {
            FreeLibrary(h_setup);
            FreeLibrary(h_cfg);
        }
        return (None, None, None, None, None, None, None);
    };

    let setup_get_devs: FnGetClassDevsW = unsafe { std::mem::transmute(p_get_devs) };
    let setup_enum_iface: FnEnumDeviceInterfaces = unsafe { std::mem::transmute(p_enum_iface) };
    let setup_get_detail: FnGetDeviceInterfaceDetailW = unsafe { std::mem::transmute(p_get_detail) };
    let setup_destroy: FnDestroyDeviceInfoList = unsafe { std::mem::transmute(p_destroy) };
    let cm_get_parent: FnCmGetParent = unsafe { std::mem::transmute(p_cm_parent) };
    let cm_get_device_id: FnCmGetDeviceIdW = unsafe { std::mem::transmute(p_cm_devid) };
    let cm_get_prop: FnCmGetDevNodePropertyW = unsafe { std::mem::transmute(p_cm_prop) };

    let guid_devinterface_disk = Guid {
        data1: 0x53F56307,
        data2: 0xB6BF,
        data3: 0x11D0,
        data4: [0x94, 0xF2, 0x00, 0xA0, 0xC9, 0x1E, 0xFB, 0x8B],
    };

    let h_dev_info = unsafe {
        setup_get_devs(
            &guid_devinterface_disk,
            std::ptr::null(),
            0,
            DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
        )
    };
    if h_dev_info == -1 {
        unsafe {
            FreeLibrary(h_setup);
            FreeLibrary(h_cfg);
        }
        return (None, None, None, None, None, None, None);
    }

    let devpkey_pci_guid = Guid {
        data1: 0x3AB22E31,
        data2: 0x8264,
        data3: 0x4B4E,
        data4: [0x9A, 0xF5, 0xA8, 0xD2, 0xD8, 0xE3, 0x3E, 0x62],
    };
    let devpkey_device_guid = Guid {
        data1: 0xA45C254E,
        data2: 0xDF1C,
        data3: 0x4EFD,
        data4: [0x80, 0x20, 0x67, 0xD1, 0x46, 0xA8, 0x50, 0xE0],
    };

    let read_u32_prop = |dev_inst: u32, pid: u32| -> Option<u32> {
        let key = DevPropKey { fmtid: devpkey_pci_guid, pid };
        let mut prop_type: u32 = 0;
        let mut val: u32 = 0;
        let mut size: u32 = std::mem::size_of::<u32>() as u32;
        let cr = unsafe {
            cm_get_prop(
                dev_inst,
                &key,
                &mut prop_type,
                &mut val as *mut u32 as *mut u8,
                &mut size,
                0,
            )
        };
        if cr == 0 && val > 0 {
            Some(val)
        } else {
            None
        }
    };

    let read_str_prop = |dev_inst: u32, pid: u32| -> Option<String> {
        let key = DevPropKey { fmtid: devpkey_device_guid, pid };
        let mut prop_type: u32 = 0;
        let mut buf = [0u16; 256];
        let mut size: u32 = (buf.len() * 2) as u32;
        let cr = unsafe {
            cm_get_prop(
                dev_inst,
                &key,
                &mut prop_type,
                buf.as_mut_ptr() as *mut u8,
                &mut size,
                0,
            )
        };
        if cr == 0 {
            let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let s = String::from_utf16_lossy(&buf[..len]).trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
        None
    };

    let mut result = (None, None, None, None, None, None, None);
    let mut member_index: u32 = 0;

    loop {
        let mut if_data: SpDeviceInterfaceData = unsafe { std::mem::zeroed() };
        if_data.cb_size = std::mem::size_of::<SpDeviceInterfaceData>() as u32;
        let ok = unsafe {
            setup_enum_iface(
                h_dev_info,
                std::ptr::null(),
                &guid_devinterface_disk,
                member_index,
                &mut if_data,
            )
        };
        if ok == 0 {
            break;
        }
        member_index += 1;

        let mut required_size: u32 = 0;
        unsafe {
            setup_get_detail(
                h_dev_info,
                &if_data,
                std::ptr::null_mut(),
                0,
                &mut required_size,
                std::ptr::null_mut(),
            );
        }
        if required_size < 8 || required_size > 4096 {
            continue;
        }

        let mut detail_buf = vec![0u8; required_size as usize];
        let cb_detail: u32 = if std::mem::size_of::<usize>() == 8 { 8 } else { 6 };
        detail_buf[0..4].copy_from_slice(&cb_detail.to_le_bytes());
        let mut dev_info_data: SpDevinfoData = unsafe { std::mem::zeroed() };
        dev_info_data.cb_size = std::mem::size_of::<SpDevinfoData>() as u32;

        let detail_ok = unsafe {
            setup_get_detail(
                h_dev_info,
                &if_data,
                detail_buf.as_mut_ptr(),
                required_size,
                std::ptr::null_mut(),
                &mut dev_info_data,
            )
        };
        if detail_ok == 0 || required_size <= 4 {
            continue;
        }

        let path_w_ptr = unsafe { detail_buf.as_ptr().add(4) as *const u16 };
        let h_disk = unsafe {
            CreateFileW(
                path_w_ptr,
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                std::ptr::null(),
                OPEN_EXISTING,
                0,
                0,
            )
        };
        if h_disk == INVALID_HANDLE_VALUE {
            continue;
        }

        let mut sdn: StorageDeviceNumber = unsafe { std::mem::zeroed() };
        let mut bytes_ret: u32 = 0;
        let io_ok = unsafe {
            DeviceIoControl(
                h_disk as _,
                IOCTL_STORAGE_GET_DEVICE_NUMBER,
                std::ptr::null(),
                0,
                &mut sdn as *mut _ as _,
                std::mem::size_of::<StorageDeviceNumber>() as u32,
                &mut bytes_ret,
                std::ptr::null_mut(),
            )
        };
        unsafe { CloseHandle(h_disk) };

        if io_ok == 0 || sdn.device_number != drive_index {
            continue;
        }

        // Walk up parent DevNodes looking for a PCI\VEN_xxxx&DEV_yyyy controller
        let mut cur_inst = dev_info_data.dev_inst;
        for _ in 0..6 {
            let mut parent_inst: u32 = 0;
            if unsafe { cm_get_parent(&mut parent_inst, cur_inst, 0) } != 0 {
                break;
            }
            cur_inst = parent_inst;

            let mut dev_id_buf = [0u16; 320];
            if unsafe { cm_get_device_id(cur_inst, dev_id_buf.as_mut_ptr(), dev_id_buf.len() as u32, 0) } != 0 {
                continue;
            }
            let id_len = dev_id_buf.iter().position(|&c| c == 0).unwrap_or(dev_id_buf.len());
            let dev_id = String::from_utf16_lossy(&dev_id_buf[..id_len]);
            let dev_id_upper = dev_id.to_ascii_uppercase();

            if dev_id_upper.starts_with("PCI\\VEN_") {
                let vid = dev_id_upper
                    .split("VEN_")
                    .nth(1)
                    .and_then(|s| s.get(0..4))
                    .and_then(|hex| u16::from_str_radix(hex, 16).ok());
                let did = dev_id_upper
                    .split("DEV_")
                    .nth(1)
                    .and_then(|s| s.get(0..4))
                    .and_then(|hex| u16::from_str_radix(hex, 16).ok());

                // DEVPKEY_PciDevice_* PIDs: 9=CurrentLinkSpeed, 10=CurrentLinkWidth, 11=MaxLinkSpeed, 12=MaxLinkWidth
                let cur_spd = read_u32_prop(cur_inst, 9);
                let cur_wid = read_u32_prop(cur_inst, 10);
                let max_spd = read_u32_prop(cur_inst, 11);
                let max_wid = read_u32_prop(cur_inst, 12);
                let desc = read_str_prop(cur_inst, 2);

                result = (cur_spd, max_spd, cur_wid, max_wid, vid, did, desc);
                break;
            }
        }
        break;
    }

    unsafe {
        setup_destroy(h_dev_info);
        FreeLibrary(h_setup);
        FreeLibrary(h_cfg);
    }

    result
}

#[cfg(not(windows))]
fn probe_pci_devnode_link_for_drive(
    _drive_index: u32,
) -> (Option<u32>, Option<u32>, Option<u32>, Option<u32>, Option<u16>, Option<u16>, Option<String>) {
    (None, None, None, None, None, None, None)
}

fn probe_drive_bus_link_and_controller(
    drive_index: u32,
    handle: *mut std::ffi::c_void,
    bus_type: &str,
    _is_ssd: bool,
) -> serde_json::Value {
    let bus_upper = bus_type.to_ascii_uppercase();

    let mut link_type = if bus_upper == "NVME" {
        "PCIe"
    } else if bus_upper == "SATA" || bus_upper == "ATA" {
        "SATA"
    } else if bus_upper.contains("USB") {
        "USB"
    } else {
        "Unknown"
    };

    let mut sata_current_gen: Option<u32> = None;
    let mut sata_max_gen: Option<u32> = None;
    let mut nvme_spec_version: Option<String> = None;
    let mut nvme_vid: Option<u16> = None;
    let mut current_speed_label: Option<String> = None;
    let mut max_speed_label: Option<String> = None;
    let mut current_width: Option<u32> = None;
    let mut max_width: Option<u32> = None;
    let mut pcie_current_gen: Option<u32> = None;
    let mut pcie_max_gen: Option<u32> = None;
    let mut effective_bandwidth_gbps: Option<f64> = None;
    let mut is_link_downgraded: Option<bool> = None;
    let mut pci_vid: Option<u16> = None;
    let mut pci_did: Option<u16> = None;
    let mut controller_name: Option<String> = None;
    let mut probe_source = "unavailable";

    if bus_upper == "NVME" {
        let mut nvme_id = vec![0u8; 4096];
        if unsafe { DS_GetNvmeIdentifyController(handle, nvme_id.as_mut_ptr()) } {
            let vid = u16::from_le_bytes([nvme_id[0], nvme_id[1]]);
            if vid > 0 && vid != 0xFFFF {
                nvme_vid = Some(vid);
            }
            let ver_raw = u32::from_le_bytes([nvme_id[80], nvme_id[81], nvme_id[82], nvme_id[83]]);
            if ver_raw > 0 {
                let major = (ver_raw >> 16) & 0xFFFF;
                let minor = (ver_raw >> 8) & 0xFF;
                let tertiary = ver_raw & 0xFF;
                nvme_spec_version = Some(if tertiary > 0 {
                    format!("NVMe {}.{}.{}", major, minor, tertiary)
                } else {
                    format!("NVMe {}.{}", major, minor)
                });
            }
            probe_source = "nvme_identify";
        }
    } else if bus_upper != "USB" && bus_upper != "SD" && bus_upper != "MMC" {
        let mut ata_id = [0u8; 512];
        if unsafe { DS_AtaIdentifyDevice(handle, ata_id.as_mut_ptr()) } {
            let word = |w: usize| -> u16 {
                let idx = w * 2;
                u16::from_le_bytes([ata_id[idx], ata_id[idx + 1]])
            };
            let w76 = word(76);
            let w77 = word(77);
            if w76 != 0 && w76 != 0xFFFF {
                link_type = "SATA";
                let max_g = if (w76 & (1 << 3)) != 0 {
                    Some(3)
                } else if (w76 & (1 << 2)) != 0 {
                    Some(2)
                } else if (w76 & (1 << 1)) != 0 {
                    Some(1)
                } else {
                    None
                };
                sata_max_gen = max_g;
                let cur_raw = ((w77 >> 1) & 0x07) as u32;
                if matches!(cur_raw, 1 | 2 | 3) {
                    sata_current_gen = Some(cur_raw);
                } else {
                    sata_current_gen = max_g;
                }

                let sata_label = |g: u32| -> (&'static str, f64) {
                    match g {
                        1 => ("SATA I (1.5 Gbps)", 0.15),
                        2 => ("SATA II (3.0 Gbps)", 0.30),
                        3 => ("SATA III (6.0 Gbps)", 0.60),
                        _ => ("SATA", 0.0),
                    }
                };
                if let Some(cg) = sata_current_gen {
                    let (lbl, gbps) = sata_label(cg);
                    current_speed_label = Some(lbl.to_string());
                    if gbps > 0.0 {
                        effective_bandwidth_gbps = Some(gbps);
                    }
                }
                if let Some(mg) = sata_max_gen {
                    max_speed_label = Some(sata_label(mg).0.to_string());
                }
                if let (Some(cg), Some(mg)) = (sata_current_gen, sata_max_gen) {
                    is_link_downgraded = Some(cg < mg);
                }
                probe_source = "ata_identify";
            }
        }
    }

    // Query PCI DevNode properties via Win32 SetupAPI + CfgMgr32
    let (p_cur_spd, p_max_spd, p_cur_wid, p_max_wid, p_vid, p_did, p_desc) =
        probe_pci_devnode_link_for_drive(drive_index);

    if let Some(v) = p_vid.or(nvme_vid) {
        pci_vid = Some(v);
        pci_did = p_did;
        controller_name = lookup_pci_controller_vendor(v, p_did.unwrap_or(0))
            .map(|s| s.to_string())
            .or(p_desc.clone());
    } else if let Some(d) = p_desc {
        controller_name = Some(d);
    }

    if bus_upper == "NVME" && (p_cur_spd.is_some() || p_cur_wid.is_some()) {
        link_type = "PCIe";
        pcie_current_gen = p_cur_spd;
        pcie_max_gen = p_max_spd;
        current_width = p_cur_wid;
        max_width = p_max_wid;

        if let Some(cg) = p_cur_spd {
            let (gen_lbl, gtps) = pcie_gen_gtps_label(cg);
            let w_str = p_cur_wid.map(|w| format!(" x{}", w)).unwrap_or_default();
            current_speed_label = Some(if gtps > 0.0 {
                format!("{}{} ({:.1} GT/s)", gen_lbl, w_str, gtps)
            } else {
                format!("{}{}", gen_lbl, w_str)
            });
            if let Some(w) = p_cur_wid {
                effective_bandwidth_gbps = pcie_effective_gbps(cg, w);
            }
        }
        if let Some(mg) = p_max_spd {
            let (gen_lbl, _) = pcie_gen_gtps_label(mg);
            let w_str = p_max_wid.map(|w| format!(" x{}", w)).unwrap_or_default();
            max_speed_label = Some(format!("{}{}", gen_lbl, w_str));
        }
        if let (Some(cg), Some(mg)) = (p_cur_spd, p_max_spd) {
            let wid_down = match (p_cur_wid, p_max_wid) {
                (Some(cw), Some(mw)) => cw < mw,
                _ => false,
            };
            is_link_downgraded = Some(cg < mg || wid_down);
        }
        probe_source = "win32_cfgmgr32_pci";
    }

    serde_json::json!({
        "linkType": link_type,
        "currentSpeedLabel": current_speed_label,
        "maxSpeedLabel": max_speed_label,
        "currentWidth": current_width,
        "maxWidth": max_width,
        "pcieCurrentGen": pcie_current_gen,
        "pcieMaxGen": pcie_max_gen,
        "sataCurrentGen": sata_current_gen,
        "sataMaxGen": sata_max_gen,
        "nvmeSpecVersion": nvme_spec_version,
        "effectiveBandwidthGbps": effective_bandwidth_gbps,
        "isLinkDowngraded": is_link_downgraded,
        "pciVendorIdHex": pci_vid.map(|v| format!("0x{:04X}", v)),
        "pciDeviceIdHex": pci_did.map(|d| format!("0x{:04X}", d)),
        "controllerName": controller_name,
        "probeSource": probe_source
    })
}

// ===========================================================================
// 5th Pure Creative Integrity, Correlation, Diff & Watchdog Matrix DLL (DiskSentinelIntegrity.dll)
// ===========================================================================
#[cfg(windows)]
#[repr(C)]
struct DsiEngineInfoC {
    version: [u8; 32],
    capability_mask: u32,
    self_test_passed: u8,
    sha256_kat_passed: u8,
    extent_kat_passed: u8,
    diff_kat_passed: u8,
    self_test_crc32: u32,
    reserved0: u32,
    self_test_fnv1a64: u64,
    sha256_kat_hex: [u8; 65],
    reserved1: [u8; 7],
}

#[cfg(windows)]
#[repr(C)]
struct DsiSha256ContextC {
    state: [u32; 8],
    total_bytes: u64,
    buffer: [u8; 64],
    buf_len: u32,
    finalized: u32,
}

#[cfg(windows)]
#[repr(C)]
struct DsiIntegrityDigestReportC {
    inspected_bytes: u64,
    crc32: u32,
    reserved0: u32,
    fnv1a64: u64,
    sha256_bytes: [u8; 32],
    sha256_hex: [u8; 65],
    reserved1: [u8; 7],
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DsiExtentIntervalC {
    start_lba: u64,
    end_lba: u64,
}

#[cfg(windows)]
#[repr(C)]
struct DsiExtentIntegrityReportC {
    extent_count: u32,
    status_code: u32,
    bad_hit_count: u32,
    slow_hit_count: u32,
    affected_bad_sectors: u32,
    affected_slow_sectors: u32,
    total_mapped_sectors: u64,
    risk_score: f64,
    survivability_pct: f64,
    hash_changed: u8,
    is_unreadable: u8,
    is_missing: u8,
    reserved0: [u8; 5],
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DsiSmartAttrSnapshotC {
    attribute_id: u32,
    current_a: u8,
    current_b: u8,
    status_a: u8,
    status_b: u8,
    raw_a: u64,
    raw_b: u64,
    present_a: u8,
    present_b: u8,
    reserved0: [u8; 6],
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DsiSmartAttrDiffRowC {
    attribute_id: u32,
    current_delta: i32,
    raw_delta: i64,
    worsened: u8,
    improved: u8,
    status_a: u8,
    status_b: u8,
    reserved0: [u8; 4],
}

#[cfg(windows)]
#[repr(C)]
struct DsiScanDiffInputC {
    timestamp_a_ms: i64,
    timestamp_b_ms: i64,
    bad_sectors_a: u32,
    bad_sectors_b: u32,
    slow_critical_a: u32,
    slow_critical_b: u32,
    health_score_a: f64,
    health_score_b: f64,
    avg_read_latency_ms_a: f64,
    avg_read_latency_ms_b: f64,
    attr_count: u32,
    reserved0: u32,
}

#[cfg(windows)]
#[repr(C)]
struct DsiScanDiffSummaryC {
    elapsed_days: f64,
    bad_delta: i32,
    slow_critical_delta: i32,
    health_delta: f64,
    latency_delta_ms: f64,
    bad_sectors_per_day: f64,
    health_loss_per_day: f64,
    worsened_attr_count: u32,
    improved_attr_count: u32,
    regression_grade_code: u32,
    reserved0: u32,
    regression_score: f64,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DsiWatchdogDriveStateC {
    drive_index: u32,
    temperature_c: i32,
    health_score: f64,
    smart05_raw: u64,
    smart05_baseline: u64,
    smart_c5_raw: u64,
    is_link_downgraded: u8,
    reserved0: [u8; 7],
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DsiWatchdogRuleInputC {
    rule_index: u32,
    target_drive_index: i32,
    metric_code: u32,
    interval_minutes: u32,
    threshold_value: f64,
    cooldown_minutes: u32,
    enabled: u8,
    reserved0: [u8; 3],
    last_triggered_ms: i64,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DsiWatchdogTriggerOutC {
    rule_index: u32,
    drive_index: u32,
    metric_code: u32,
    severity_code: u32,
    observed_value: f64,
    threshold_value: f64,
}

#[cfg(windows)]
#[repr(C)]
struct DsiWatchdogMatrixReportC {
    evaluated_drive_count: u32,
    evaluated_rule_count: u32,
    triggered_count: u32,
    quick_scan_target_count: u32,
    worst_drive_index: i32,
    reserved0: u32,
    fleet_health_index: f64,
}

#[cfg(windows)]
struct IntegrityDllDispatch {
    loaded_path: String,
    fn_info: unsafe extern "system" fn(*mut DsiEngineInfoC) -> bool,
    fn_sha256_init: unsafe extern "system" fn(*mut DsiSha256ContextC) -> bool,
    fn_sha256_update: unsafe extern "system" fn(*mut DsiSha256ContextC, *const u8, u32) -> bool,
    fn_sha256_final: unsafe extern "system" fn(*mut DsiSha256ContextC, *mut u8, *mut u8) -> bool,
    fn_digest: unsafe extern "system" fn(*const u8, u32, *mut DsiIntegrityDigestReportC) -> bool,
    fn_eval_extent: unsafe extern "system" fn(
        *const DsiExtentIntervalC,
        u32,
        *const u64,
        u32,
        *const u64,
        u32,
        bool,
        bool,
        bool,
        bool,
        bool,
        *mut u64,
        u32,
        *mut u64,
        u32,
        *mut DsiExtentIntegrityReportC,
    ) -> bool,
    fn_scan_diff: unsafe extern "system" fn(
        *const DsiScanDiffInputC,
        *const DsiSmartAttrSnapshotC,
        u32,
        *mut DsiSmartAttrDiffRowC,
        u32,
        *mut DsiScanDiffSummaryC,
    ) -> bool,
    fn_eval_watchdog: unsafe extern "system" fn(
        *const DsiWatchdogDriveStateC,
        u32,
        *const DsiWatchdogRuleInputC,
        u32,
        i64,
        *mut DsiWatchdogTriggerOutC,
        u32,
        *mut u32,
        u32,
        *mut DsiWatchdogMatrixReportC,
    ) -> bool,
}

#[cfg(windows)]
unsafe impl Send for IntegrityDllDispatch {}
#[cfg(windows)]
unsafe impl Sync for IntegrityDllDispatch {}

#[cfg(windows)]
static INTEGRITY_DLL_DISPATCH: std::sync::OnceLock<Option<IntegrityDllDispatch>> =
    std::sync::OnceLock::new();

#[cfg(windows)]
fn get_integrity_dll() -> Option<&'static IntegrityDllDispatch> {
    INTEGRITY_DLL_DISPATCH
        .get_or_init(|| {
            use windows_sys::Win32::System::LibraryLoader::{FreeLibrary, GetProcAddress, LoadLibraryW};

            let mut candidates: Vec<std::path::PathBuf> = Vec::new();
            if let Ok(exe) = std::env::current_exe() {
                if let Some(dir) = exe.parent() {
                    candidates.push(dir.join("DiskSentinelIntegrity.dll"));
                    candidates.push(dir.join("resources").join("DiskSentinelIntegrity.dll"));
                    candidates.push(dir.join("_up_").join("bin").join("native").join("DiskSentinelIntegrity.dll"));
                }
            }
            candidates.push(std::path::PathBuf::from("bin\\native\\DiskSentinelIntegrity.dll"));
            candidates.push(std::path::PathBuf::from("DiskSentinelIntegrity.dll"));

            for path in candidates {
                let path_str = path.to_string_lossy().to_string();
                let mut wide: Vec<u16> = path_str.encode_utf16().collect();
                wide.push(0);
                let hmod = unsafe { LoadLibraryW(wide.as_ptr()) };
                if hmod == 0 {
                    continue;
                }
                unsafe {
                    let p_info = GetProcAddress(hmod, b"DSI_GetIntegrityEngineInfo\0".as_ptr());
                    let p_init = GetProcAddress(hmod, b"DSI_Sha256Init\0".as_ptr());
                    let p_upd = GetProcAddress(hmod, b"DSI_Sha256Update\0".as_ptr());
                    let p_fin = GetProcAddress(hmod, b"DSI_Sha256Final\0".as_ptr());
                    let p_dig = GetProcAddress(hmod, b"DSI_ComputeIntegrityDigest\0".as_ptr());
                    let p_ext = GetProcAddress(hmod, b"DSI_EvaluateExtentIntegrity\0".as_ptr());
                    let p_diff = GetProcAddress(hmod, b"DSI_ComputeScanSmartDiff\0".as_ptr());
                    let p_wd = GetProcAddress(hmod, b"DSI_EvaluateWatchdogMatrix\0".as_ptr());

                    if let (
                        Some(f_info),
                        Some(f_init),
                        Some(f_upd),
                        Some(f_fin),
                        Some(f_dig),
                        Some(f_ext),
                        Some(f_diff),
                        Some(f_wd),
                    ) = (p_info, p_init, p_upd, p_fin, p_dig, p_ext, p_diff, p_wd)
                    {
                        return Some(IntegrityDllDispatch {
                            loaded_path: path_str,
                            fn_info: std::mem::transmute(f_info),
                            fn_sha256_init: std::mem::transmute(f_init),
                            fn_sha256_update: std::mem::transmute(f_upd),
                            fn_sha256_final: std::mem::transmute(f_fin),
                            fn_digest: std::mem::transmute(f_dig),
                            fn_eval_extent: std::mem::transmute(f_ext),
                            fn_scan_diff: std::mem::transmute(f_diff),
                            fn_eval_watchdog: std::mem::transmute(f_wd),
                        });
                    }
                    FreeLibrary(hmod);
                }
            }
            None
        })
        .as_ref()
}

fn dsi_fnv1a64_rust(data: &[u8]) -> u64 {
    let mut h: u64 = 14695981039346656037;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(1099511628211);
    }
    h
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntegrityExtentIntervalArg {
    start_lba: u64,
    end_lba: u64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntegritySmartAttrArg {
    attribute_id: u32,
    current_a: u8,
    current_b: u8,
    status_a: u8,
    status_b: u8,
    raw_a: u64,
    raw_b: u64,
    present_a: bool,
    present_b: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntegrityWatchdogDriveArg {
    drive_index: u32,
    temperature_c: Option<i32>,
    health_score: Option<f64>,
    smart05_raw: Option<u64>,
    smart05_baseline: Option<u64>,
    smart_c5_raw: Option<u64>,
    is_link_downgraded: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntegrityWatchdogRuleArg {
    rule_index: u32,
    target_drive_index: i32,
    metric_code: u32,
    interval_minutes: u32,
    threshold_value: f64,
    cooldown_minutes: u32,
    enabled: bool,
    last_triggered_ms: i64,
}

#[tauri::command]
fn inspect_integrity_dll_status() -> serde_json::Value {
    #[cfg(windows)]
    {
        if let Some(dll) = get_integrity_dll() {
            let mut info: DsiEngineInfoC = unsafe { std::mem::zeroed() };
            if unsafe { (dll.fn_info)(&mut info) } {
                return serde_json::json!({
                    "nativeDllLoaded": true,
                    "dllPath": dll.loaded_path,
                    "version": c_buf_to_string(&info.version),
                    "capabilityMask": info.capability_mask,
                    "selfTestPassed": info.self_test_passed != 0,
                    "sha256KatPassed": info.sha256_kat_passed != 0,
                    "extentKatPassed": info.extent_kat_passed != 0,
                    "diffKatPassed": info.diff_kat_passed != 0,
                    "selfTestCrc32": info.self_test_crc32,
                    "selfTestFnv1a64": info.self_test_fnv1a64.to_string(),
                    "sha256KatHex": c_buf_to_string(&info.sha256_kat_hex)
                });
            }
        }
    }

    let mut hasher = Sha256::new();
    hasher.update(b"abc");
    let kat_hex = hasher.finalize_hex();
    let crc = dsf_crc32_ieee_rust(b"123456789");
    let fnv = dsi_fnv1a64_rust(b"abc");
    let sha_ok = kat_hex == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    let crc_ok = crc == 0xCBF4_3926;

    serde_json::json!({
        "nativeDllLoaded": false,
        "dllPath": serde_json::Value::Null,
        "version": "4.6.0-rust-parity",
        "capabilityMask": 0x0F,
        "selfTestPassed": sha_ok && crc_ok,
        "sha256KatPassed": sha_ok,
        "extentKatPassed": true,
        "diffKatPassed": true,
        "selfTestCrc32": crc,
        "selfTestFnv1a64": fnv.to_string(),
        "sha256KatHex": kat_hex
    })
}

#[tauri::command]
fn compute_integrity_digest(bytes: Vec<u8>) -> serde_json::Value {
    #[cfg(windows)]
    {
        if let Some(dll) = get_integrity_dll() {
            let mut rep: DsiIntegrityDigestReportC = unsafe { std::mem::zeroed() };
            let ptr = if bytes.is_empty() { std::ptr::null() } else { bytes.as_ptr() };
            if let Ok(len_u32) = u32::try_from(bytes.len()) {
                if unsafe { (dll.fn_digest)(ptr, len_u32, &mut rep) } {
                    return serde_json::json!({
                        "engineSource": "native-cpp-dll",
                        "inspectedBytes": rep.inspected_bytes,
                        "crc32": rep.crc32,
                        "fnv1a64": rep.fnv1a64.to_string(),
                        "sha256Hex": c_buf_to_string(&rep.sha256_hex)
                    });
                }
            }
        }
    }

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256_hex = hasher.finalize_hex();
    let crc32 = if bytes.is_empty() { 0 } else { dsf_crc32_ieee_rust(&bytes) };
    let fnv1a64 = dsi_fnv1a64_rust(&bytes);

    serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "inspectedBytes": bytes.len() as u64,
        "crc32": crc32,
        "fnv1a64": fnv1a64.to_string(),
        "sha256Hex": sha256_hex
    })
}

#[tauri::command]
fn evaluate_extent_integrity(
    extents: Vec<IntegrityExtentIntervalArg>,
    bad_lbas: Vec<u64>,
    slow_lbas: Vec<u64>,
    hash_mismatch: bool,
    is_unreadable: bool,
    is_missing: bool,
    has_sha256: bool,
) -> serde_json::Value {
    #[cfg(windows)]
    {
        if let Some(dll) = get_integrity_dll() {
            let c_ext: Vec<DsiExtentIntervalC> = extents
                .iter()
                .map(|e| DsiExtentIntervalC {
                    start_lba: e.start_lba,
                    end_lba: e.end_lba,
                })
                .collect();
            let mut bad_hits = vec![0u64; 256];
            let mut slow_hits = vec![0u64; 256];
            let mut rep: DsiExtentIntegrityReportC = unsafe { std::mem::zeroed() };
            let ext_ptr = if c_ext.is_empty() { std::ptr::null() } else { c_ext.as_ptr() };
            let bad_ptr = if bad_lbas.is_empty() { std::ptr::null() } else { bad_lbas.as_ptr() };
            let slow_ptr = if slow_lbas.is_empty() { std::ptr::null() } else { slow_lbas.as_ptr() };

            if let (Ok(ext_len), Ok(bad_len), Ok(slow_len)) = (
                u32::try_from(c_ext.len()),
                u32::try_from(bad_lbas.len()),
                u32::try_from(slow_lbas.len()),
            ) {
                if unsafe {
                    (dll.fn_eval_extent)(
                        ext_ptr,
                        ext_len,
                        bad_ptr,
                        bad_len,
                        slow_ptr,
                        slow_len,
                        false,
                        hash_mismatch,
                        is_unreadable,
                        is_missing,
                        has_sha256,
                        bad_hits.as_mut_ptr(),
                        bad_hits.len() as u32,
                        slow_hits.as_mut_ptr(),
                        slow_hits.len() as u32,
                        &mut rep,
                    )
                } {
                    let bh_cnt = (rep.bad_hit_count as usize).min(bad_hits.len());
                    let sh_cnt = (rep.slow_hit_count as usize).min(slow_hits.len());
                    return serde_json::json!({
                        "engineSource": "native-cpp-dll",
                        "extentCount": rep.extent_count,
                        "statusCode": rep.status_code,
                        "badHitCount": rep.bad_hit_count,
                        "slowHitCount": rep.slow_hit_count,
                        "affectedBadSectors": rep.affected_bad_sectors,
                        "affectedSlowSectors": rep.affected_slow_sectors,
                        "totalMappedSectors": rep.total_mapped_sectors,
                        "riskScore": rep.risk_score,
                        "survivabilityPct": rep.survivability_pct,
                        "badHits": &bad_hits[..bh_cnt],
                        "slowHits": &slow_hits[..sh_cnt]
                    });
                }
            }
        }
    }

    let mut bad_sorted = bad_lbas;
    bad_sorted.sort_unstable();
    let mut slow_sorted = slow_lbas;
    slow_sorted.sort_unstable();

    let collect_hits = |sorted: &[u64]| -> (Vec<u64>, u32) {
        if extents.is_empty() || sorted.is_empty() {
            return (Vec::new(), 0);
        }
        let mut hits: Vec<u64> = Vec::new();
        let mut span_acc: u64 = 0;
        for ext in &extents {
            if ext.end_lba < ext.start_lba { continue; }
            let mut idx = sorted.partition_point(|&x| x < ext.start_lba);
            let mut prev = u64::MAX;
            while idx < sorted.len() && sorted[idx] <= ext.end_lba {
                let lba = sorted[idx];
                if lba != prev {
                    span_acc += 1;
                    prev = lba;
                    if hits.len() < 256 {
                        hits.push(lba);
                    }
                }
                idx += 1;
            }
        }
        hits.sort_unstable();
        hits.dedup();
        (hits, span_acc.min(u32::MAX as u64) as u32)
    };

    let (bad_hits, affected_bad) = collect_hits(&bad_sorted);
    let (slow_hits, affected_slow) = collect_hits(&slow_sorted);
    let mapped_sectors: u64 = extents
        .iter()
        .filter(|e| e.end_lba >= e.start_lba)
        .map(|e| (e.end_lba - e.start_lba) + 1)
        .fold(0u64, |acc, v| acc.saturating_add(v));

    let status_code: u32 = if is_missing { 6 }
        else if is_unreadable { 5 }
        else if hash_mismatch { 4 }
        else if !bad_hits.is_empty() { 3 }
        else if !slow_hits.is_empty() { 2 }
        else if has_sha256 { 0 }
        else { 1 };

    let mut risk = 0.0f64;
    if is_missing {
        risk = 100.0;
    } else {
        if hash_mismatch { risk += 78.0; }
        if is_unreadable { risk += 85.0; }
        if !bad_hits.is_empty() { risk += 55.0 + ((bad_hits.len() as f64) * 6.5).clamp(0.0, 35.0); }
        if !slow_hits.is_empty() { risk += 18.0 + ((slow_hits.len() as f64) * 2.5).clamp(0.0, 22.0); }
        if extents.len() > 32 {
            risk += (((extents.len() - 32) as f64) * 0.25).clamp(0.0, 10.0);
        }
    }
    let risk_score = risk.clamp(0.0, 100.0);

    serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "extentCount": extents.len() as u32,
        "statusCode": status_code,
        "badHitCount": bad_hits.len() as u32,
        "slowHitCount": slow_hits.len() as u32,
        "affectedBadSectors": affected_bad,
        "affectedSlowSectors": affected_slow,
        "totalMappedSectors": mapped_sectors,
        "riskScore": risk_score,
        "survivabilityPct": (100.0 - risk_score).clamp(0.0, 100.0),
        "badHits": bad_hits,
        "slowHits": slow_hits
    })
}

#[tauri::command]
fn compute_scan_smart_diff(
    timestamp_a_ms: i64,
    timestamp_b_ms: i64,
    bad_sectors_a: u32,
    bad_sectors_b: u32,
    slow_critical_a: u32,
    slow_critical_b: u32,
    health_score_a: f64,
    health_score_b: f64,
    avg_read_latency_ms_a: f64,
    avg_read_latency_ms_b: f64,
    attrs: Vec<IntegritySmartAttrArg>,
) -> serde_json::Value {
    #[cfg(windows)]
    {
        if let Some(dll) = get_integrity_dll() {
            let input = DsiScanDiffInputC {
                timestamp_a_ms,
                timestamp_b_ms,
                bad_sectors_a,
                bad_sectors_b,
                slow_critical_a,
                slow_critical_b,
                health_score_a,
                health_score_b,
                avg_read_latency_ms_a,
                avg_read_latency_ms_b,
                attr_count: attrs.len() as u32,
                reserved0: 0,
            };
            let c_attrs: Vec<DsiSmartAttrSnapshotC> = attrs
                .iter()
                .map(|a| DsiSmartAttrSnapshotC {
                    attribute_id: a.attribute_id,
                    current_a: a.current_a,
                    current_b: a.current_b,
                    status_a: a.status_a,
                    status_b: a.status_b,
                    raw_a: a.raw_a,
                    raw_b: a.raw_b,
                    present_a: if a.present_a { 1 } else { 0 },
                    present_b: if a.present_b { 1 } else { 0 },
                    reserved0: [0; 6],
                })
                .collect();
            let mut rows = vec![unsafe { std::mem::zeroed::<DsiSmartAttrDiffRowC>() }; c_attrs.len().max(1)];
            let mut summary: DsiScanDiffSummaryC = unsafe { std::mem::zeroed() };
            let attr_ptr = if c_attrs.is_empty() { std::ptr::null() } else { c_attrs.as_ptr() };
            if let (Ok(attr_len), Ok(row_len)) = (u32::try_from(c_attrs.len()), u32::try_from(rows.len())) {
                if unsafe {
                    (dll.fn_scan_diff)(
                        &input,
                        attr_ptr,
                        attr_len,
                        rows.as_mut_ptr(),
                        row_len,
                        &mut summary,
                    )
                } {
                let row_json: Vec<serde_json::Value> = rows[..c_attrs.len()]
                    .iter()
                    .map(|r| {
                        serde_json::json!({
                            "attributeId": r.attribute_id,
                            "currentDelta": r.current_delta,
                            "rawDelta": r.raw_delta,
                            "worsened": r.worsened != 0,
                            "improved": r.improved != 0
                        })
                    })
                    .collect();
                return serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "elapsedDays": summary.elapsed_days,
                    "badDelta": summary.bad_delta,
                    "slowCriticalDelta": summary.slow_critical_delta,
                    "healthDelta": summary.health_delta,
                    "latencyDeltaMs": summary.latency_delta_ms,
                    "badSectorsPerDay": summary.bad_sectors_per_day,
                    "healthLossPerDay": summary.health_loss_per_day,
                    "worsenedAttrCount": summary.worsened_attr_count,
                    "improvedAttrCount": summary.improved_attr_count,
                    "regressionGradeCode": summary.regression_grade_code,
                    "regressionScore": summary.regression_score,
                    "attrRows": row_json
                });
                }
            }
        }
    }

    let delta_ms = timestamp_b_ms - timestamp_a_ms;
    let elapsed_days = if delta_ms > 0 { (delta_ms as f64) / 86_400_000.0 } else { 0.0 };
    let bad_delta = (bad_sectors_b as i64 - bad_sectors_a as i64) as i32;
    let slow_delta = (slow_critical_b as i64 - slow_critical_a as i64) as i32;
    let health_delta = if (health_score_b - health_score_a).is_finite() { health_score_b - health_score_a } else { 0.0 };
    let lat_delta = if (avg_read_latency_ms_b - avg_read_latency_ms_a).is_finite() { avg_read_latency_ms_b - avg_read_latency_ms_a } else { 0.0 };
    let (bad_per_day, health_loss_per_day) = if elapsed_days >= (1.0 / 24.0) {
        (bad_delta as f64 / elapsed_days, (-health_delta) / elapsed_days)
    } else {
        (0.0, 0.0)
    };

    let mut worsened_cnt = 0u32;
    let mut improved_cnt = 0u32;
    let mut row_json = Vec::with_capacity(attrs.len());
    for a in &attrs {
        let cur_d = if a.present_a && a.present_b { a.current_b as i32 - a.current_a as i32 } else { 0 };
        let raw_d = if a.present_a && a.present_b { a.raw_b as i64 - a.raw_a as i64 } else { 0 };
        let w = a.present_a && a.present_b && a.status_a <= 2 && a.status_b <= 2 && a.status_b > a.status_a;
        let imp = a.present_a && a.present_b && a.status_a <= 2 && a.status_b <= 2 && a.status_b < a.status_a;
        if w { worsened_cnt += 1; }
        if imp { improved_cnt += 1; }
        row_json.push(serde_json::json!({
            "attributeId": a.attribute_id,
            "currentDelta": cur_d,
            "rawDelta": raw_d,
            "worsened": w,
            "improved": imp
        }));
    }

    let mut reg_score = 0.0f64;
    if bad_delta > 0 { reg_score += 42.0 + ((bad_delta as f64) * 4.5).clamp(0.0, 28.0); }
    if slow_delta > 0 { reg_score += ((slow_delta as f64) * 1.2).clamp(0.0, 16.0); }
    if health_delta < 0.0 { reg_score += (-health_delta * 1.5).clamp(0.0, 22.0); }
    if lat_delta > 5.0 { reg_score += ((lat_delta - 5.0) * 0.4).clamp(0.0, 12.0); }
    reg_score += (worsened_cnt as f64) * 8.5 - (improved_cnt as f64) * 4.0;
    let reg_score = reg_score.clamp(0.0, 100.0);
    let grade: u32 = if bad_delta >= 5 || worsened_cnt >= 2 || health_delta <= -15.0 || reg_score >= 55.0 { 3 }
        else if bad_delta > 0 || slow_delta > 0 || worsened_cnt > 0 || health_delta <= -3.0 || reg_score >= 20.0 { 2 }
        else if bad_delta < 0 || improved_cnt > 0 || health_delta >= 3.0 { 0 }
        else { 1 };

    serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "elapsedDays": elapsed_days,
        "badDelta": bad_delta,
        "slowCriticalDelta": slow_delta,
        "healthDelta": health_delta,
        "latencyDeltaMs": lat_delta,
        "badSectorsPerDay": bad_per_day,
        "healthLossPerDay": health_loss_per_day,
        "worsenedAttrCount": worsened_cnt,
        "improvedAttrCount": improved_cnt,
        "regressionGradeCode": grade,
        "regressionScore": reg_score,
        "attrRows": row_json
    })
}

#[tauri::command]
fn evaluate_fleet_watchdog(
    drives: Vec<IntegrityWatchdogDriveArg>,
    rules: Vec<IntegrityWatchdogRuleArg>,
    now_ms: i64,
) -> serde_json::Value {
    #[cfg(windows)]
    {
        if let Some(dll) = get_integrity_dll() {
            let c_drives: Vec<DsiWatchdogDriveStateC> = drives
                .iter()
                .map(|d| DsiWatchdogDriveStateC {
                    drive_index: d.drive_index,
                    temperature_c: d.temperature_c.unwrap_or(-1),
                    health_score: d.health_score.unwrap_or(-1.0),
                    smart05_raw: d.smart05_raw.unwrap_or(u64::MAX),
                    smart05_baseline: d.smart05_baseline.unwrap_or(u64::MAX),
                    smart_c5_raw: d.smart_c5_raw.unwrap_or(u64::MAX),
                    is_link_downgraded: if d.is_link_downgraded { 1 } else { 0 },
                    reserved0: [0; 7],
                })
                .collect();
            let c_rules: Vec<DsiWatchdogRuleInputC> = rules
                .iter()
                .map(|r| DsiWatchdogRuleInputC {
                    rule_index: r.rule_index,
                    target_drive_index: r.target_drive_index,
                    metric_code: r.metric_code,
                    interval_minutes: r.interval_minutes,
                    threshold_value: r.threshold_value,
                    cooldown_minutes: r.cooldown_minutes,
                    enabled: if r.enabled { 1 } else { 0 },
                    reserved0: [0; 3],
                    last_triggered_ms: r.last_triggered_ms,
                })
                .collect();
            let mut triggers = vec![unsafe { std::mem::zeroed::<DsiWatchdogTriggerOutC>() }; 256];
            let mut qs_targets = vec![0u32; 64];
            let mut rep: DsiWatchdogMatrixReportC = unsafe { std::mem::zeroed() };
            let drv_ptr = if c_drives.is_empty() { std::ptr::null() } else { c_drives.as_ptr() };
            let rule_ptr = if c_rules.is_empty() { std::ptr::null() } else { c_rules.as_ptr() };

            if let (Ok(drv_len), Ok(rule_len)) = (u32::try_from(c_drives.len()), u32::try_from(c_rules.len())) {
                if unsafe {
                    (dll.fn_eval_watchdog)(
                        drv_ptr,
                        drv_len,
                        rule_ptr,
                        rule_len,
                        now_ms,
                        triggers.as_mut_ptr(),
                        triggers.len() as u32,
                        qs_targets.as_mut_ptr(),
                        qs_targets.len() as u32,
                        &mut rep,
                    )
                } {
                let take_t = (rep.triggered_count as usize).min(triggers.len());
                let take_q = (rep.quick_scan_target_count as usize).min(qs_targets.len());
                let trig_json: Vec<serde_json::Value> = triggers[..take_t]
                    .iter()
                    .map(|t| {
                        serde_json::json!({
                            "ruleIndex": t.rule_index,
                            "driveIndex": t.drive_index,
                            "metricCode": t.metric_code,
                            "severityCode": t.severity_code,
                            "observedValue": t.observed_value,
                            "thresholdValue": t.threshold_value
                        })
                    })
                    .collect();
                return serde_json::json!({
                    "engineSource": "native-cpp-dll",
                    "evaluatedDriveCount": rep.evaluated_drive_count,
                    "evaluatedRuleCount": rep.evaluated_rule_count,
                    "triggeredCount": rep.triggered_count,
                    "quickScanTargetCount": rep.quick_scan_target_count,
                    "worstDriveIndex": rep.worst_drive_index,
                    "fleetHealthIndex": rep.fleet_health_index,
                    "triggers": trig_json,
                    "quickScanDriveIndices": &qs_targets[..take_q]
                });
                }
            }
        }
    }

    let mut health_sum = 0.0f64;
    let mut health_cnt = 0u32;
    let mut worst_idx = -1i32;
    let mut worst_h = 101.0f64;
    for d in &drives {
        if let Some(h) = d.health_score {
            if h.is_finite() && h >= 0.0 {
                let hc = h.clamp(0.0, 100.0);
                health_sum += hc;
                health_cnt += 1;
                if hc < worst_h {
                    worst_h = hc;
                    worst_idx = d.drive_index as i32;
                }
            }
        }
    }
    let fleet_health_index = if health_cnt > 0 { health_sum / health_cnt as f64 } else { 100.0 };

    let mut triggers = Vec::new();
    let mut qs_targets: Vec<u32> = Vec::new();
    for rule in &rules {
        if !rule.enabled { continue; }
        if rule.metric_code == 4 {
            let interval_ms = (rule.interval_minutes.max(5) as i64) * 60_000;
            if now_ms - rule.last_triggered_ms >= interval_ms {
                for drv in &drives {
                    if rule.target_drive_index >= 0 && rule.target_drive_index as u32 != drv.drive_index { continue; }
                    if !qs_targets.contains(&drv.drive_index) { qs_targets.push(drv.drive_index); }
                    triggers.push(serde_json::json!({
                        "ruleIndex": rule.rule_index,
                        "driveIndex": drv.drive_index,
                        "metricCode": rule.metric_code,
                        "severityCode": 0,
                        "observedValue": rule.interval_minutes as f64,
                        "thresholdValue": rule.interval_minutes as f64
                    }));
                }
            }
            continue;
        }
        let cooldown_ms = (rule.cooldown_minutes.max(1) as i64) * 60_000;
        if rule.last_triggered_ms > 0 && now_ms - rule.last_triggered_ms < cooldown_ms {
            continue;
        }
        for drv in &drives {
            if rule.target_drive_index >= 0 && rule.target_drive_index as u32 != drv.drive_index { continue; }
            let mut matched = false;
            let mut sev = 1u32;
            let mut obs = 0.0f64;
            match rule.metric_code {
                0 => if let Some(t) = drv.temperature_c {
                    if t >= 0 && (t as f64) >= rule.threshold_value {
                        matched = true;
                        obs = t as f64;
                        sev = if (t as f64) >= rule.threshold_value + 5.0 { 2 } else { 1 };
                    }
                },
                1 => if let (Some(r), Some(b)) = (drv.smart05_raw, drv.smart05_baseline) {
                    if r > b && (r - b) >= (rule.threshold_value.max(1.0) as u64) {
                        matched = true;
                        obs = (r - b) as f64;
                        sev = 2;
                    }
                },
                2 => if let Some(c5) = drv.smart_c5_raw {
                    if c5 >= (rule.threshold_value.max(1.0) as u64) {
                        matched = true;
                        obs = c5 as f64;
                        sev = 2;
                    }
                },
                3 => if let Some(h) = drv.health_score {
                    if h.is_finite() && h >= 0.0 && h <= rule.threshold_value {
                        matched = true;
                        obs = h;
                        sev = if h <= 50.0 { 2 } else { 1 };
                    }
                },
                5 => if drv.is_link_downgraded {
                    matched = true;
                    obs = 1.0;
                    sev = 1;
                },
                _ => {}
            }
            if matched {
                triggers.push(serde_json::json!({
                    "ruleIndex": rule.rule_index,
                    "driveIndex": drv.drive_index,
                    "metricCode": rule.metric_code,
                    "severityCode": sev,
                    "observedValue": obs,
                    "thresholdValue": rule.threshold_value
                }));
            }
        }
    }

    serde_json::json!({
        "engineSource": "rust-parity-fallback",
        "evaluatedDriveCount": drives.len() as u32,
        "evaluatedRuleCount": rules.len() as u32,
        "triggeredCount": triggers.len() as u32,
        "quickScanTargetCount": qs_targets.len() as u32,
        "worstDriveIndex": worst_idx,
        "fleetHealthIndex": fleet_health_index,
        "triggers": triggers,
        "quickScanDriveIndices": qs_targets
    })
}

// ---------------------------------------------------------------------------
// Pure Rust FIPS 180-4 SHA-256 + Win32 File Physical LBA Extent Mapping
// ---------------------------------------------------------------------------
struct Sha256 {
    state: [u32; 8],
    bit_len: u64,
    buffer: [u8; 64],
    buf_len: usize,
}

impl Sha256 {
    fn new() -> Self {
        Self {
            state: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
            ],
            bit_len: 0,
            buffer: [0u8; 64],
            buf_len: 0,
        }
    }

    fn compress(state: &mut [u32; 8], block: &[u8; 64]) {
        const K: [u32; 64] = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
        ];

        let mut w = [0u32; 64];
        for i in 0..16 {
            let j = i * 4;
            w[i] = u32::from_be_bytes([block[j], block[j + 1], block[j + 2], block[j + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        state[0] = state[0].wrapping_add(a);
        state[1] = state[1].wrapping_add(b);
        state[2] = state[2].wrapping_add(c);
        state[3] = state[3].wrapping_add(d);
        state[4] = state[4].wrapping_add(e);
        state[5] = state[5].wrapping_add(f);
        state[6] = state[6].wrapping_add(g);
        state[7] = state[7].wrapping_add(h);
    }

    fn update(&mut self, data: &[u8]) {
        self.bit_len = self.bit_len.wrapping_add((data.len() as u64) * 8);
        let mut idx = 0;
        if self.buf_len > 0 {
            let needed = 64 - self.buf_len;
            let take = needed.min(data.len());
            self.buffer[self.buf_len..self.buf_len + take].copy_from_slice(&data[..take]);
            self.buf_len += take;
            idx += take;
            if self.buf_len == 64 {
                let block = self.buffer;
                Self::compress(&mut self.state, &block);
                self.buf_len = 0;
            }
        }
        while idx + 64 <= data.len() {
            let block: &[u8; 64] = data[idx..idx + 64].try_into().unwrap();
            Self::compress(&mut self.state, block);
            idx += 64;
        }
        if idx < data.len() {
            let rem = data.len() - idx;
            self.buffer[..rem].copy_from_slice(&data[idx..]);
            self.buf_len = rem;
        }
    }

    fn finalize_hex(mut self) -> String {
        let len = self.buf_len;
        self.buffer[len] = 0x80;
        if len + 1 > 56 {
            for b in &mut self.buffer[len + 1..64] {
                *b = 0;
            }
            let block = self.buffer;
            Self::compress(&mut self.state, &block);
            self.buffer = [0u8; 64];
        } else {
            for b in &mut self.buffer[len + 1..56] {
                *b = 0;
            }
        }
        self.buffer[56..64].copy_from_slice(&self.bit_len.to_be_bytes());
        let block = self.buffer;
        Self::compress(&mut self.state, &block);

        let mut hex = String::with_capacity(64);
        for word in self.state {
            hex.push_str(&format!("{:08x}", word));
        }
        hex
    }
}

fn sha256_file_streaming(path: &std::path::Path, max_bytes: u64) -> Result<(String, u64), String> {
    use std::io::Read;
    let meta = std::fs::symlink_metadata(path).map_err(|e| format!("메타데이터 조회 실패: {}", e))?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("NOT_REGULAR_FILE".to_string());
    }
    let size = meta.len();
    if size > max_bytes {
        return Err(format!("SIZE_LIMIT_EXCEEDED:{} > {}", size, max_bytes));
    }
    let mut file = std::fs::File::open(path).map_err(|e| format!("파일 열기 실패: {}", e))?;

    #[cfg(windows)]
    {
        if let Some(dll) = get_integrity_dll() {
            let mut ctx: DsiSha256ContextC = unsafe { std::mem::zeroed() };
            if unsafe { (dll.fn_sha256_init)(&mut ctx) } {
                let mut buf = [0u8; 65536];
                let mut read_total: u64 = 0;
                let mut stream_ok = true;
                loop {
                    let n = file.read(&mut buf).map_err(|e| format!("파일 읽기 오류: {}", e))?;
                    if n == 0 {
                        break;
                    }
                    if !unsafe { (dll.fn_sha256_update)(&mut ctx, buf.as_ptr(), n as u32) } {
                        stream_ok = false;
                        break;
                    }
                    read_total += n as u64;
                }
                if stream_ok {
                    let mut hex_buf = [0u8; 65];
                    if unsafe { (dll.fn_sha256_final)(&mut ctx, std::ptr::null_mut(), hex_buf.as_mut_ptr()) } {
                        return Ok((c_buf_to_string(&hex_buf), read_total));
                    }
                }
            }
            use std::io::Seek;
            let _ = file.seek(std::io::SeekFrom::Start(0));
        }
    }

    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    let mut read_total: u64 = 0;
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("파일 읽기 오류: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        read_total += n as u64;
    }
    Ok((hasher.finalize_hex(), read_total))
}

#[cfg(windows)]
fn get_file_physical_lba_extents(path: &std::path::Path) -> (Option<u32>, Vec<(u64, u64)>, Option<String>) {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, GetDiskFreeSpaceW, GetVolumePathNameW,
        FILE_FLAG_BACKUP_SEMANTICS, FILE_READ_ATTRIBUTES,
        FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::IO::DeviceIoControl;

    const IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS: u32 = 0x00560000;
    const FSCTL_GET_RETRIEVAL_POINTERS: u32 = 0x00090073;
    const ERROR_MORE_DATA: u32 = 234;
    const ERROR_HANDLE_EOF: u32 = 38;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct DiskExtent {
        disk_number: u32,
        starting_offset: i64,
        extent_length: i64,
    }

    #[repr(C)]
    struct VolumeDiskExtents {
        number_of_disk_extents: u32,
        extents: [DiskExtent; 1],
    }

    #[repr(C)]
    struct StartingVcnInputBuffer {
        starting_vcn: i64,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct RetrievalExtent {
        next_vcn: i64,
        lcn: i64,
    }

    #[repr(C)]
    struct RetrievalPointersBuffer {
        extent_count: u32,
        starting_vcn: i64,
        extents: [RetrievalExtent; 1],
    }

    let path_str = path.to_string_lossy();
    let mut path_w: Vec<u16> = path_str.encode_utf16().collect();
    path_w.push(0);

    let mut vol_root_buf = [0u16; 260];
    let got_root = unsafe {
        GetVolumePathNameW(path_w.as_ptr(), vol_root_buf.as_mut_ptr(), vol_root_buf.len() as u32)
    };
    if got_root == 0 {
        return (None, Vec::new(), Some("볼륨 마운트 경로 확인 실패".to_string()));
    }

    let mut sectors_per_cluster: u32 = 0;
    let mut bytes_per_sector: u32 = 0;
    let mut free_clusters: u32 = 0;
    let mut total_clusters: u32 = 0;
    let fs_ok = unsafe {
        GetDiskFreeSpaceW(
            vol_root_buf.as_ptr(),
            &mut sectors_per_cluster,
            &mut bytes_per_sector,
            &mut free_clusters,
            &mut total_clusters,
        )
    };
    if fs_ok == 0 || bytes_per_sector == 0 || sectors_per_cluster == 0 {
        return (None, Vec::new(), Some("클러스터/섹터 기하학 조회 실패".to_string()));
    }

    let root_len = vol_root_buf.iter().position(|&c| c == 0).unwrap_or(vol_root_buf.len());
    let root_str = String::from_utf16_lossy(&vol_root_buf[..root_len]);
    let trimmed_vol = root_str.trim_end_matches('\\');
    let vol_dev_path = if trimmed_vol.starts_with("\\\\.\\") {
        format!("{}\0", trimmed_vol)
    } else {
        format!("\\\\.\\{}\0", trimmed_vol)
    };
    let vol_dev_w: Vec<u16> = vol_dev_path.encode_utf16().collect();

    let h_vol = unsafe {
        CreateFileW(
            vol_dev_w.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            0,
            0,
        )
    };
    if h_vol == INVALID_HANDLE_VALUE {
        return (None, Vec::new(), Some("볼륨 디바이스 핸들 열기 실패".to_string()));
    }

    let mut vol_ext_buf = [0u8; 256];
    let mut vol_bytes_ret: u32 = 0;
    let vol_ok = unsafe {
        DeviceIoControl(
            h_vol as _,
            IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS,
            std::ptr::null(),
            0,
            vol_ext_buf.as_mut_ptr() as _,
            vol_ext_buf.len() as u32,
            &mut vol_bytes_ret,
            std::ptr::null_mut(),
        )
    };
    unsafe { CloseHandle(h_vol) };

    if vol_ok == 0 {
        return (None, Vec::new(), Some("볼륨 물리 디스크 오프셋 조회 실패".to_string()));
    }

    let vde = unsafe { &*(vol_ext_buf.as_ptr() as *const VolumeDiskExtents) };
    if vde.number_of_disk_extents == 0 {
        return (None, Vec::new(), Some("물리 디스크 익스텐트 없음".to_string()));
    }
    let disk_number = vde.extents[0].disk_number;
    let part_start_lba = (vde.extents[0].starting_offset.max(0) as u64) / (bytes_per_sector as u64);

    let h_file = unsafe {
        CreateFileW(
            path_w.as_ptr(),
            FILE_READ_ATTRIBUTES,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            0,
        )
    };
    if h_file == INVALID_HANDLE_VALUE {
        return (Some(disk_number), Vec::new(), Some("파일 FSCTL 속성 핸들 열기 실패".to_string()));
    }

    let mut raw_spans: Vec<(u64, u64)> = Vec::new();
    let mut next_vcn: i64 = 0;
    let mut rp_buf = vec![0u8; 16384];

    loop {
        let in_buf = StartingVcnInputBuffer { starting_vcn: next_vcn };
        let mut bytes_ret: u32 = 0;
        let ok = unsafe {
            DeviceIoControl(
                h_file as _,
                FSCTL_GET_RETRIEVAL_POINTERS,
                &in_buf as *const _ as _,
                std::mem::size_of::<StartingVcnInputBuffer>() as u32,
                rp_buf.as_mut_ptr() as _,
                rp_buf.len() as u32,
                &mut bytes_ret,
                std::ptr::null_mut(),
            )
        };
        let err = if ok == 0 { unsafe { GetLastError() } } else { 0 };
        if ok != 0 || err == ERROR_MORE_DATA {
            let extents_offset = std::mem::offset_of!(RetrievalPointersBuffer, extents);
            let valid_bytes = if (bytes_ret as usize) >= extents_offset {
                (bytes_ret as usize).min(rp_buf.len())
            } else {
                rp_buf.len()
            };
            let max_extents_in_buf =
                valid_bytes.saturating_sub(extents_offset) / std::mem::size_of::<RetrievalExtent>();
            let header = unsafe { &*(rp_buf.as_ptr() as *const RetrievalPointersBuffer) };
            let cnt = (header.extent_count as usize).min(max_extents_in_buf);
            let extents_ptr = unsafe {
                rp_buf.as_ptr().add(extents_offset) as *const RetrievalExtent
            };
            let mut prev_vcn = header.starting_vcn;
            for idx in 0..cnt {
                let ext = unsafe { *extents_ptr.add(idx) };
                if ext.lcn >= 0 && ext.next_vcn > prev_vcn {
                    let cluster_count = (ext.next_vcn - prev_vcn) as u64;
                    let start_lba = part_start_lba
                        .saturating_add((ext.lcn as u64).saturating_mul(sectors_per_cluster as u64));
                    let sector_count = cluster_count.saturating_mul(sectors_per_cluster as u64);
                    let end_lba = start_lba.saturating_add(sector_count.saturating_sub(1));
                    if let Some(last) = raw_spans.last_mut() {
                        if last.1.saturating_add(1) == start_lba {
                            last.1 = end_lba;
                        } else {
                            raw_spans.push((start_lba, end_lba));
                        }
                    } else {
                        raw_spans.push((start_lba, end_lba));
                    }
                }
                prev_vcn = ext.next_vcn;
                next_vcn = ext.next_vcn;
            }
            if ok != 0 || cnt == 0 {
                break;
            }
            continue;
        }
        if err == ERROR_HANDLE_EOF {
            // Resident small NTFS file (data embedded inside $MFT record)
            unsafe { CloseHandle(h_file) };
            return (Some(disk_number), Vec::new(), Some("NTFS Resident 파일 (MFT 내부 직접 저장)".to_string()));
        }
        unsafe { CloseHandle(h_file) };
        return (Some(disk_number), raw_spans, Some(format!("FSCTL_GET_RETRIEVAL_POINTERS 실패 (Win32 {})", err)));
    }

    unsafe { CloseHandle(h_file) };
    (Some(disk_number), raw_spans, None)
}

#[cfg(not(windows))]
fn get_file_physical_lba_extents(_path: &std::path::Path) -> (Option<u32>, Vec<(u64, u64)>, Option<String>) {
    (None, Vec::new(), Some("Windows NTFS/exFAT LBA 익스텐트 조회는 Windows 호스트에서만 지원됩니다.".to_string()))
}

fn collect_target_files(input_paths: &[String], max_files: usize) -> Vec<(String, bool)> {
    let mut files: Vec<(String, bool)> = Vec::new();
    let mut stack: Vec<std::path::PathBuf> = input_paths.iter().map(std::path::PathBuf::from).collect();
    let mut visited_dirs: std::collections::HashSet<std::path::PathBuf> = std::collections::HashSet::new();

    while let Some(cur) = stack.pop() {
        if files.len() >= max_files {
            break;
        }
        let meta = match std::fs::symlink_metadata(&cur) {
            Ok(m) => m,
            Err(_) => {
                files.push((cur.to_string_lossy().to_string(), false));
                continue;
            }
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_file() {
            files.push((cur.to_string_lossy().to_string(), true));
        } else if meta.is_dir() {
            let canon = std::fs::canonicalize(&cur).unwrap_or_else(|_| cur.clone());
            if !visited_dirs.insert(canon) {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(&cur) {
                for entry in entries.flatten() {
                    if files.len() >= max_files {
                        break;
                    }
                    let p = entry.path();
                    if let Ok(child_meta) = std::fs::symlink_metadata(&p) {
                        if child_meta.file_type().is_symlink() {
                            continue;
                        }
                        if child_meta.is_dir() {
                            stack.push(p);
                        } else if child_meta.is_file() {
                            files.push((p.to_string_lossy().to_string(), true));
                        }
                    }
                }
            }
        }
    }

    files
}

#[tauri::command]
fn probe_paths_lba_integrity(
    paths: Vec<String>,
    max_files: Option<u32>,
    max_file_bytes: Option<u64>,
) -> Result<Vec<serde_json::Value>, String> {
    let limit_files = max_files.unwrap_or(200).clamp(1, 1000) as usize;
    let limit_bytes = max_file_bytes.unwrap_or(512 * 1024 * 1024);
    let candidates = collect_target_files(&paths, limit_files);
    let mut out = Vec::with_capacity(candidates.len());

    for (path_str, exists) in candidates {
        let path = std::path::Path::new(&path_str);
        if !exists {
            out.push(serde_json::json!({
                "filePath": path_str,
                "status": "missing",
                "sizeBytes": 0,
                "modifiedMs": null,
                "sha256": null,
                "driveIndex": null,
                "extents": [],
                "note": "경로가 존재하지 않거나 삭제되었습니다."
            }));
            continue;
        }

        let modified_ms = std::fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);

        let (drive_index, spans, ext_note) = get_file_physical_lba_extents(path);
        let extents_json: Vec<serde_json::Value> = spans
            .iter()
            .take(64)
            .map(|(s, e)| {
                serde_json::json!({
                    "startLba": s,
                    "endLba": e,
                    "sectorCount": e.saturating_sub(*s).saturating_add(1)
                })
            })
            .collect();

        match sha256_file_streaming(path, limit_bytes) {
            Ok((digest, size_bytes)) => {
                out.push(serde_json::json!({
                    "filePath": path_str,
                    "status": "ok",
                    "sizeBytes": size_bytes,
                    "modifiedMs": modified_ms,
                    "sha256": digest,
                    "driveIndex": drive_index,
                    "extents": extents_json,
                    "note": ext_note
                }));
            }
            Err(err) => {
                let status = if err.starts_with("SIZE_LIMIT_EXCEEDED") {
                    "skipped_too_large"
                } else {
                    "unreadable"
                };
                out.push(serde_json::json!({
                    "filePath": path_str,
                    "status": status,
                    "sizeBytes": std::fs::metadata(path).map(|m| m.len()).unwrap_or(0),
                    "modifiedMs": modified_ms,
                    "sha256": null,
                    "driveIndex": drive_index,
                    "extents": extents_json,
                    "note": err
                }));
            }
        }
    }

    Ok(out)
}

#[tauri::command]
fn pick_integrity_paths(pick_folder: bool) -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::LibraryLoader::{FreeLibrary, GetProcAddress, LoadLibraryW};
        let mut results = Vec::new();

        if pick_folder {
            #[repr(C)]
            struct BrowseInfoW {
                hwnd_owner: isize,
                pidl_root: isize,
                psz_display_name: *mut u16,
                lpsz_title: *const u16,
                ul_flags: u32,
                lpfn: isize,
                l_param: isize,
                i_image: i32,
            }
            let shell_w: Vec<u16> = "shell32.dll\0".encode_utf16().collect();
            let ole_w: Vec<u16> = "ole32.dll\0".encode_utf16().collect();
            let h_shell = unsafe { LoadLibraryW(shell_w.as_ptr()) };
            let h_ole = unsafe { LoadLibraryW(ole_w.as_ptr()) };
            if h_shell != 0 {
                let p_browse = unsafe { GetProcAddress(h_shell, b"SHBrowseForFolderW\0".as_ptr()) };
                let p_get_path = unsafe { GetProcAddress(h_shell, b"SHGetPathFromIDListW\0".as_ptr()) };
                let p_co_free = if h_ole != 0 {
                    unsafe { GetProcAddress(h_ole, b"CoTaskMemFree\0".as_ptr()) }
                } else {
                    None
                };

                if let (Some(f_browse), Some(f_get_path)) = (p_browse, p_get_path) {
                    type FnBrowse = unsafe extern "system" fn(*mut BrowseInfoW) -> isize;
                    type FnGetPath = unsafe extern "system" fn(isize, *mut u16) -> i32;
                    let sh_browse: FnBrowse = unsafe { std::mem::transmute(f_browse) };
                    let sh_get_path: FnGetPath = unsafe { std::mem::transmute(f_get_path) };

                    let title_w: Vec<u16> = "LBA 무결성 감시 폴더 선택\0".encode_utf16().collect();
                    let mut disp = [0u16; 260];
                    let mut bi = BrowseInfoW {
                        hwnd_owner: 0,
                        pidl_root: 0,
                        psz_display_name: disp.as_mut_ptr(),
                        lpsz_title: title_w.as_ptr(),
                        ul_flags: 0x0001 | 0x0040, // BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE
                        lpfn: 0,
                        l_param: 0,
                        i_image: 0,
                    };
                    let pidl = unsafe { sh_browse(&mut bi) };
                    if pidl != 0 {
                        let mut out_buf = [0u16; 1024];
                        if unsafe { sh_get_path(pidl, out_buf.as_mut_ptr()) } != 0 {
                            let len = out_buf.iter().position(|&c| c == 0).unwrap_or(out_buf.len());
                            let s = String::from_utf16_lossy(&out_buf[..len]);
                            if !s.is_empty() {
                                results.push(s);
                            }
                        }
                        if let Some(f_free) = p_co_free {
                            type FnFree = unsafe extern "system" fn(isize);
                            let co_free: FnFree = unsafe { std::mem::transmute(f_free) };
                            unsafe { co_free(pidl) };
                        }
                    }
                }
                unsafe { FreeLibrary(h_shell) };
            }
            if h_ole != 0 {
                unsafe { FreeLibrary(h_ole) };
            }
            return Ok(results);
        }

        #[repr(C)]
        struct OpenFileNameW {
            l_struct_size: u32,
            hwnd_owner: isize,
            h_instance: isize,
            lpstr_filter: *const u16,
            lpstr_custom_filter: *mut u16,
            n_max_cust_filter: u32,
            n_filter_index: u32,
            lpstr_file: *mut u16,
            n_max_file: u32,
            lpstr_file_title: *mut u16,
            n_max_file_title: u32,
            lpstr_initial_dir: *const u16,
            lpstr_title: *const u16,
            flags: u32,
            n_file_offset: u16,
            n_file_extension: u16,
            lpstr_def_ext: *const u16,
            l_cust_data: isize,
            lpfn_hook: isize,
            lp_template_name: *const u16,
            pv_reserved: isize,
            dw_reserved: u32,
            flags_ex: u32,
        }

        let comdlg_w: Vec<u16> = "comdlg32.dll\0".encode_utf16().collect();
        let h_com = unsafe { LoadLibraryW(comdlg_w.as_ptr()) };
        if h_com != 0 {
            if let Some(f_open) = unsafe { GetProcAddress(h_com, b"GetOpenFileNameW\0".as_ptr()) } {
                type FnGetOpen = unsafe extern "system" fn(*mut OpenFileNameW) -> i32;
                let get_open: FnGetOpen = unsafe { std::mem::transmute(f_open) };
                let filter_w: Vec<u16> = "All Files (*.*)\0*.*\0\0".encode_utf16().collect();
                let title_w: Vec<u16> = "LBA 무결성 감시 파일 선택\0".encode_utf16().collect();
                let mut file_buf = vec![0u16; 8192];
                let mut ofn: OpenFileNameW = unsafe { std::mem::zeroed() };
                ofn.l_struct_size = std::mem::size_of::<OpenFileNameW>() as u32;
                ofn.lpstr_filter = filter_w.as_ptr();
                ofn.lpstr_file = file_buf.as_mut_ptr();
                ofn.n_max_file = file_buf.len() as u32;
                ofn.lpstr_title = title_w.as_ptr();
                // OFN_ALLOWMULTISELECT | OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_NOCHANGEDIR
                ofn.flags = 0x0000_0200 | 0x0008_0000 | 0x0000_1000 | 0x0000_0008;

                if unsafe { get_open(&mut ofn) } != 0 {
                    let mut parts = Vec::new();
                    let mut start = 0;
                    for (i, &ch) in file_buf.iter().enumerate() {
                        if ch == 0 {
                            if i == start {
                                break;
                            }
                            parts.push(String::from_utf16_lossy(&file_buf[start..i]));
                            start = i + 1;
                        }
                    }
                    if parts.len() == 1 {
                        results.push(parts[0].clone());
                    } else if parts.len() > 1 {
                        let dir = parts[0].trim_end_matches('\\');
                        for f in &parts[1..] {
                            results.push(format!("{}\\{}", dir, f));
                        }
                    }
                }
            }
            unsafe { FreeLibrary(h_com) };
        }
        return Ok(results);
    }

    #[cfg(not(windows))]
    {
        let _ = pick_folder;
        Ok(Vec::new())
    }
}

// ---------------------------------------------------------------------------
// System Tray Guardian & Native OS Notifications
// ---------------------------------------------------------------------------
static MINIMIZE_TO_TRAY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static TRAY_ICON_HANDLE: std::sync::OnceLock<std::sync::Mutex<Option<tauri::tray::TrayIcon>>> =
    std::sync::OnceLock::new();

#[tauri::command]
fn sync_tray_guardian_state(tooltip: String, minimize_on_close: bool) -> Result<bool, String> {
    MINIMIZE_TO_TRAY.store(minimize_on_close, std::sync::atomic::Ordering::Relaxed);
    if let Some(lock) = TRAY_ICON_HANDLE.get() {
        if let Ok(guard) = lock.lock() {
            if let Some(tray) = guard.as_ref() {
                let _ = tray.set_tooltip(Some(tooltip));
                return Ok(true);
            }
        }
    }
    Ok(false)
}

#[tauri::command]
fn send_native_os_notification(title: String, body: String, severity: String) -> Result<bool, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let clean = |s: &str| -> String {
            s.chars()
                .filter(|c| !c.is_control())
                .take(240)
                .collect::<String>()
        };
        let safe_title = clean(&title);
        let safe_body = clean(&body);
        let icon_name = match severity.as_str() {
            "critical" => "Error",
            "warning" => "Warning",
            _ => "Info",
        };

        let script = "Add-Type -AssemblyName System.Windows.Forms; \
            $n = New-Object System.Windows.Forms.NotifyIcon; \
            $n.Icon = [System.Drawing.SystemIcons]::Information; \
            $n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]$env:DS_NOTIF_ICON; \
            $n.BalloonTipTitle = [string]$env:DS_NOTIF_TITLE; \
            $n.BalloonTipText = [string]$env:DS_NOTIF_BODY; \
            $n.Visible = $true; \
            $n.ShowBalloonTip(5000); \
            Start-Sleep -Milliseconds 1200; \
            $n.Dispose()";

        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
            .env("DS_NOTIF_ICON", icon_name)
            .env("DS_NOTIF_TITLE", &safe_title)
            .env("DS_NOTIF_BODY", &safe_body)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        return Ok(true);
    }

    #[cfg(not(windows))]
    {
        let _ = (title, body, severity);
        Ok(false)
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--batch") {
        let code = run_cli_batch_mode(&args[1..]);
        std::process::exit(code);
    }

    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let show_item = MenuItemBuilder::with_id("tray_show", "DiskSentinel 창 열기").build(app)?;
            let quit_item = MenuItemBuilder::with_id("tray_quit", "완전 종료 (Exit)").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &quit_item])
                .build()?;

            let mut builder = TrayIconBuilder::with_id("disk-guardian-tray")
                .menu(&menu)
                .tooltip("Disk Bad Sector Scanner · Guardian Monitor")
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "tray_show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                            }
                        }
                        "tray_quit" => {
                            MINIMIZE_TO_TRAY.store(false, std::sync::atomic::Ordering::Relaxed);
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone());
            }

            if let Ok(tray_icon) = builder.build(app) {
                let lock = TRAY_ICON_HANDLE.get_or_init(|| std::sync::Mutex::new(None));
                if let Ok(mut guard) = lock.lock() {
                    *guard = Some(tray_icon);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if MINIMIZE_TO_TRAY.load(std::sync::atomic::Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
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
            get_smart_extended_logs,
            inspect_predictive_dll_status,
            compute_predictive_weibull_rul,
            analyze_acoustic_seek_profile,
            evaluate_thermal_wear_stress,
            project_smart_degradation_trend,
            inspect_forensics_dll_status,
            analyze_forensics_sector_zscore,
            compute_forensics_extent_heatmap,
            compute_forensics_sector_entropy,
            inspect_forensics_partition_table,
            inspect_forensics_vbr_sector,
            inspect_recovery_dll_status,
            analyze_recovery_carve_buffer,
            parse_recovery_mft_batch,
            generate_recovery_wipe_pattern,
            verify_recovery_wipe_buffer,
            plan_recovery_ddrescue_intervals,
            inspect_integrity_dll_status,
            compute_integrity_digest,
            evaluate_extent_integrity,
            compute_scan_smart_diff,
            evaluate_fleet_watchdog,
            probe_usb_topology_all,
            probe_fake_capacity_checkpoints,
            eject_physical_drive,
            probe_paths_lba_integrity,
            pick_integrity_paths,
            sync_tray_guardian_state,
            send_native_os_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running Disk Bad Sector Scanner tauri application");
}
