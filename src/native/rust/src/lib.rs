//! DiskSentinel Pro - Native Core Rust Engine
//! Pure Creative Low-Level Storage Engine with C ABI Compatibility
//! Author: AhBiYout (GitHub: AhBiYout-all)
//! Affiliation: CISNet (https://www.cisnet.co.kr)
//! Blog: https://ahbiyoutvibe.blogspot.com/
//! License: Apache-2.0

use std::ffi::c_void;
use std::time::Instant;

#[repr(u32)]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum DSSectorStatus {
    Good = 0,     // < 10ms (Healthy surface)
    Normal = 1,   // < 50ms (Acceptable)
    Slow = 2,     // < 150ms (Mild delay)
    Critical = 3, // < 500ms (Degraded / Head weak)
    Bad = 4,      // Uncorrectable / I/O Timeout / CRC error
    Aborted = 5,  // Operation aborted
}

#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSBlockResult {
    pub start_lba: u64,
    pub sector_count: u64,
    pub latency_ms: f64,
    pub status_code: u32,
    pub win32_error_code: u32,
    pub error_mnemonic: [u8; 32],
}

#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSSmartEntry {
    pub attribute_id: u32,
    pub attribute_name: [u8; 64],
    pub current_value: u8,
    pub worst_value: u8,
    pub threshold_value: u8,
    pub raw_value: u64,
    pub health_status: u32, // 0: Good, 1: Warning, 2: Critical
}

#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSDriveHealthReport {
    pub reliability_score: f64,       // 0.0 to 100.0%
    pub estimated_remaining_days: u32, // Days before expected failure
    pub total_power_on_hours: u32,      // Raw POH
    pub reallocated_sectors: u32,     // Attr 0x05
    pub pending_sectors: u32,         // Attr 0xC5
    pub uncorrectable_errors: u32,    // Attr 0xBB / 0xC6
    pub temperature_celsius: u32,     // Drive thermal sensor
    pub overall_grade: [u8; 16],      // "EXCELLENT", "GOOD", "WARNING", "CRITICAL"
}

// NVMe Deep Telemetry Health Information (Log Page 02h)
#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSNvmeHealthLog {
    pub critical_warning: u8,
    pub temperature_celsius: u16,
    pub available_spare: u8,
    pub available_spare_threshold: u8,
    pub percentage_used: u8,
    pub data_units_read_tb: f64,
    pub data_units_written_tb: f64,
    pub host_read_commands: u64,
    pub host_write_commands: u64,
    pub controller_busy_time_minutes: u64,
    pub power_cycles: u64,
    pub power_on_hours: u64,
    pub unsafe_shutdowns: u64,
    pub media_errors: u64,
    pub num_err_log_entries: u64,
    pub warning_temp_time_min: u32,
    pub critical_temp_time_min: u32,
}

// Multi-Drive Parallel Scan Target specification (Rayon)
#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSMultiDriveScanTarget {
    pub drive_index: u32,
    pub start_lba: u64,
    pub sector_count: u64,
    pub burst_step: u32,
}

// Multi-Drive Parallel Scan Summary result per drive
#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSMultiDriveScanSummary {
    pub drive_index: u32,
    pub total_sectors_scanned: u64,
    pub bad_sectors_found: u32,
    pub elapsed_ms: f64,
    pub avg_latency_ms: f64,
    pub is_completed: bool,
    pub status_code: u32,
}

// ---------------------------------------------------------------------------
// System Tray Lightweight Guardian Daemon Status Struct
// ---------------------------------------------------------------------------
#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSTrayGuardianStatus {
    pub is_monitoring_active: bool,
    pub poll_interval_sec: u32,
    pub monitored_drive_count: u32,
    pub highest_temp_celsius: u32,
    pub critical_alert_triggered: bool,
    pub warning_drive_index: u32,
    pub last_alert_code: u32, // 0: Normal, 1: High Temp (>55C), 2: Critical (>60C), 3: Reallocated Sectors increased, 4: Pending Sectors
    pub last_alert_message: [u8; 128],
}

// ---------------------------------------------------------------------------
// Bit Carving File Signature & ECC Parity Recovery Result Struct
// ---------------------------------------------------------------------------
#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSCarvedSectorResult {
    pub source_lba: u64,
    pub signature_type: u32, // 1: JPEG, 2: PNG, 3: PDF, 4: ZIP/DOCX, 5: MP4, 6: TEXT/LOG, 0: Raw/Unknown
    pub signature_name: [u8; 32],
    pub carved_size_bytes: u64,
    pub ecc_recovered_bits: u32,
    pub is_salvaged: bool,
    pub hex_preview: [u8; 64],
}


// ---------------------------------------------------------------------------
// Physical Drive Advanced Hardware Discovery Details
// ---------------------------------------------------------------------------
#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSPhysicalDriveDetail {
    pub drive_index: u32,
    pub device_path: [u8; 64],
    pub model: [u8; 64],
    pub serial_number: [u8; 64],
    pub firmware_rev: [u8; 32],
    pub bus_type: [u8; 32],
    pub total_capacity_bytes: u64,
    pub sector_size: u32,
    pub physical_sector_size: u32,
    pub is_ssd: bool,
    pub is_trim_supported: bool,
    pub is_write_cache_enabled: bool,
    pub temperature_celsius: u32,
    pub health_score: u32,
}

// Internal drive handle representation
pub struct DriveContext {
    pub drive_index: u32,
    pub sector_size: u32,
    #[cfg(windows)]
    pub raw_handle: *mut c_void,
}

#[cfg(windows)]
struct AlignedSectorBuffer {
    ptr: *mut u8,
    layout: std::alloc::Layout,
    len: usize,
}

#[cfg(windows)]
impl AlignedSectorBuffer {
    fn new(size: usize, align: usize) -> Option<Self> {
        let safe_size = size.max(1);
        let safe_align = align.max(4096).next_power_of_two();
        let layout = std::alloc::Layout::from_size_align(safe_size, safe_align).ok()?;
        let ptr = unsafe { std::alloc::alloc_zeroed(layout) };
        if ptr.is_null() {
            return None;
        }
        Some(Self {
            ptr,
            layout,
            len: safe_size,
        })
    }

    fn as_ptr(&self) -> *const u8 {
        self.ptr
    }

    fn as_mut_ptr(&mut self) -> *mut u8 {
        self.ptr
    }

    fn as_slice(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }
}

#[cfg(windows)]
impl Drop for AlignedSectorBuffer {
    fn drop(&mut self) {
        unsafe { std::alloc::dealloc(self.ptr, self.layout) };
    }
}

// ---------------------------------------------------------------------------
// 0. DS_GetDriveDetails (Fetch real hardware descriptors)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_GetDriveDetails(
    drive_handle: *mut c_void,
    out_detail: *mut DSPhysicalDriveDetail,
) -> bool {
    if drive_handle.is_null() || out_detail.is_null() {
        return false;
    }

    let detail = &mut *out_detail;
    let ctx = &*(drive_handle as *const DriveContext);
    
    detail.drive_index = ctx.drive_index;
    detail.sector_size = ctx.sector_size;
    detail.physical_sector_size = 4096;
    copy_str_to_fixed_bytes(&format!("\\\\.\\PhysicalDrive{}", ctx.drive_index), &mut detail.device_path);
    copy_str_to_fixed_bytes("Physical Storage Drive", &mut detail.model);
    copy_str_to_fixed_bytes("", &mut detail.serial_number);
    copy_str_to_fixed_bytes("N/A", &mut detail.firmware_rev);
    copy_str_to_fixed_bytes("Standard Storage", &mut detail.bus_type);

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Ioctl::{
            IOCTL_STORAGE_QUERY_PROPERTY, STORAGE_PROPERTY_QUERY,
            StorageDeviceProperty, StorageDeviceSeekPenaltyProperty, StorageDeviceTrimProperty,
            StorageDeviceTemperatureProperty, PropertyStandardQuery,
            STORAGE_DEVICE_DESCRIPTOR, DEVICE_SEEK_PENALTY_DESCRIPTOR, DEVICE_TRIM_DESCRIPTOR,
            STORAGE_TEMPERATURE_DATA_DESCRIPTOR,
            IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, DISK_GEOMETRY_EX,
            BusTypeNvme, BusTypeSata, BusTypeUsb, BusTypeScsi, BusTypeSas,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let h_device = ctx.raw_handle;
        if h_device.is_null() {
            return false;
        }

        // 1. Query Geometry for capacity
        let mut geom: DISK_GEOMETRY_EX = std::mem::zeroed();
        let mut bytes_returned: u32 = 0;
        let ok = DeviceIoControl(
            h_device as _,
            IOCTL_DISK_GET_DRIVE_GEOMETRY_EX,
            std::ptr::null(),
            0,
            &mut geom as *mut _ as _,
            std::mem::size_of::<DISK_GEOMETRY_EX>() as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        );
        if ok != 0 {
            detail.total_capacity_bytes = geom.DiskSize as u64;
            if geom.Geometry.BytesPerSector > 0 {
                detail.sector_size = geom.Geometry.BytesPerSector;
            }
        }

        // 2. Query Device Descriptor for Model/Serial/Bus
        let mut query: STORAGE_PROPERTY_QUERY = std::mem::zeroed();
        query.PropertyId = StorageDeviceProperty;
        query.QueryType = PropertyStandardQuery;

        let mut buffer = vec![0u8; 2048];
        let ok = DeviceIoControl(
            h_device as _,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &query as *const _ as _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            buffer.as_mut_ptr() as _,
            buffer.len() as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        );

        if ok != 0 && bytes_returned >= std::mem::size_of::<STORAGE_DEVICE_DESCRIPTOR>() as u32 {
            let desc = &*(buffer.as_ptr() as *const STORAGE_DEVICE_DESCRIPTOR);

            if desc.ProductIdOffset > 0 && (desc.ProductIdOffset as usize) < buffer.len() {
                let model_str = std::ffi::CStr::from_ptr(buffer.as_ptr().add(desc.ProductIdOffset as usize) as *const i8)
                    .to_string_lossy().trim().to_string();
                if !model_str.is_empty() {
                    copy_str_to_fixed_bytes(&model_str, &mut detail.model);
                }
            }
            if desc.SerialNumberOffset > 0 && (desc.SerialNumberOffset as usize) < buffer.len() {
                let serial_str = std::ffi::CStr::from_ptr(buffer.as_ptr().add(desc.SerialNumberOffset as usize) as *const i8)
                    .to_string_lossy().trim().to_string();
                copy_str_to_fixed_bytes(&serial_str, &mut detail.serial_number);
            }
            if desc.ProductRevisionOffset > 0 && (desc.ProductRevisionOffset as usize) < buffer.len() {
                let rev_str = std::ffi::CStr::from_ptr(buffer.as_ptr().add(desc.ProductRevisionOffset as usize) as *const i8)
                    .to_string_lossy().trim().to_string();
                if !rev_str.is_empty() {
                    copy_str_to_fixed_bytes(&rev_str, &mut detail.firmware_rev);
                }
            }

            match desc.BusType {
                BusTypeNvme => { copy_str_to_fixed_bytes("NVMe", &mut detail.bus_type); detail.is_ssd = true; },
                BusTypeSata => copy_str_to_fixed_bytes("SATA", &mut detail.bus_type),
                BusTypeUsb => copy_str_to_fixed_bytes("USB", &mut detail.bus_type),
                BusTypeScsi | BusTypeSas => copy_str_to_fixed_bytes("SCSI/SAS", &mut detail.bus_type),
                _ => copy_str_to_fixed_bytes("Standard Storage", &mut detail.bus_type),
            }
        }

        // 3. Query Seek Penalty (SSD vs HDD)
        let mut seek_query: STORAGE_PROPERTY_QUERY = std::mem::zeroed();
        seek_query.PropertyId = StorageDeviceSeekPenaltyProperty;
        seek_query.QueryType = PropertyStandardQuery;
        let mut seek_desc: DEVICE_SEEK_PENALTY_DESCRIPTOR = std::mem::zeroed();
        let mut seek_bytes: u32 = 0;
        if DeviceIoControl(
            h_device as _,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &seek_query as *const _ as _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            &mut seek_desc as *mut _ as _,
            std::mem::size_of::<DEVICE_SEEK_PENALTY_DESCRIPTOR>() as u32,
            &mut seek_bytes,
            std::ptr::null_mut(),
        ) != 0 {
            detail.is_ssd = seek_desc.IncursSeekPenalty == 0;
        }

        // 4. Query TRIM capability
        let mut trim_query: STORAGE_PROPERTY_QUERY = std::mem::zeroed();
        trim_query.PropertyId = StorageDeviceTrimProperty;
        trim_query.QueryType = PropertyStandardQuery;
        let mut trim_desc: DEVICE_TRIM_DESCRIPTOR = std::mem::zeroed();
        let mut trim_bytes: u32 = 0;
        if DeviceIoControl(
            h_device as _,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &trim_query as *const _ as _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            &mut trim_desc as *mut _ as _,
            std::mem::size_of::<DEVICE_TRIM_DESCRIPTOR>() as u32,
            &mut trim_bytes,
            std::ptr::null_mut(),
        ) != 0 {
            detail.is_trim_supported = trim_desc.TrimEnabled != 0;
        }

        // 5. Query Temperature Property if exposed by storage driver
        let mut temp_query: STORAGE_PROPERTY_QUERY = std::mem::zeroed();
        temp_query.PropertyId = StorageDeviceTemperatureProperty;
        temp_query.QueryType = PropertyStandardQuery;
        let mut temp_desc: STORAGE_TEMPERATURE_DATA_DESCRIPTOR = std::mem::zeroed();
        let mut temp_bytes: u32 = 0;
        if DeviceIoControl(
            h_device as _,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &temp_query as *const _ as _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            &mut temp_desc as *mut _ as _,
            std::mem::size_of::<STORAGE_TEMPERATURE_DATA_DESCRIPTOR>() as u32,
            &mut temp_bytes,
            std::ptr::null_mut(),
        ) != 0 && temp_desc.InfoCount > 0 {
            let t_c = temp_desc.TemperatureInfo[0].Temperature;
            if t_c > 0 && t_c < 150 {
                detail.temperature_celsius = t_c as u32;
            }
        }

        return true;
    }

    #[cfg(not(windows))]
    {
        false
    }
}

// ---------------------------------------------------------------------------
// 1. DS_OpenDriveDirect
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_OpenDriveDirect(
    drive_index: u32,
    out_sector_size: *mut u32,
) -> *mut c_void {
    if !out_sector_size.is_null() {
        *out_sector_size = 512; // Standard 512-byte sector default
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{INVALID_HANDLE_VALUE, GENERIC_READ, GENERIC_WRITE};
        use windows_sys::Win32::Storage::FileSystem::{
            CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_SHARE_DELETE, OPEN_EXISTING,
            FILE_FLAG_NO_BUFFERING, FILE_FLAG_WRITE_THROUGH
        };
        use windows_sys::Win32::System::Ioctl::{IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, DISK_GEOMETRY_EX};
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let path_str = format!("\\\\.\\PhysicalDrive{}\0", drive_index);
        let wide: Vec<u16> = path_str.encode_utf16().collect();

        let mut handle = CreateFileW(
            wide.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH,
            0,
        );

        if handle == INVALID_HANDLE_VALUE {
            // Fallback to Read-Only if write permission denied
            handle = CreateFileW(
                wide.as_ptr(),
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                std::ptr::null(),
                OPEN_EXISTING,
                FILE_FLAG_NO_BUFFERING,
                0,
            );
        }

        if handle == INVALID_HANDLE_VALUE {
            // Secondary Fallback to Query Access (0 desired access)
            handle = CreateFileW(
                wide.as_ptr(),
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                std::ptr::null(),
                OPEN_EXISTING,
                0,
                0,
            );
        }

        if handle == INVALID_HANDLE_VALUE {
            return std::ptr::null_mut();
        }

        let mut detected_sector_size = 512u32;
        let mut geom: DISK_GEOMETRY_EX = std::mem::zeroed();
        let mut geom_bytes: u32 = 0;
        let geom_ok = DeviceIoControl(
            handle as _,
            IOCTL_DISK_GET_DRIVE_GEOMETRY_EX,
            std::ptr::null(),
            0,
            &mut geom as *mut _ as _,
            std::mem::size_of::<DISK_GEOMETRY_EX>() as u32,
            &mut geom_bytes,
            std::ptr::null_mut(),
        );
        if geom_ok != 0 && geom.Geometry.BytesPerSector >= 512 {
            detected_sector_size = geom.Geometry.BytesPerSector;
        }

        if !out_sector_size.is_null() {
            *out_sector_size = detected_sector_size;
        }

        let ctx = Box::new(DriveContext {
            drive_index,
            sector_size: detected_sector_size,
            raw_handle: handle as *mut c_void,
        });
        Box::into_raw(ctx) as *mut c_void
    }

    #[cfg(not(windows))]
    {
        let ctx = Box::new(DriveContext {
            drive_index,
            sector_size: 512,
        });
        Box::into_raw(ctx) as *mut c_void
    }
}

// ---------------------------------------------------------------------------
// 2. DS_ScanLbaBlock
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_ScanLbaBlock(
    drive_handle: *mut c_void,
    lba: u64,
    count: u32,
    out_result: *mut DSBlockResult,
) -> bool {
    if drive_handle.is_null() || out_result.is_null() {
        return false;
    }

    let start = Instant::now();

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::Storage::FileSystem::{SetFilePointerEx, ReadFile, FILE_BEGIN};

        let ctx = &*(drive_handle as *const DriveContext);
        let sec_size = ctx.sector_size.max(512);
        let byte_offset = (lba as i64) * (sec_size as i64);
        let buffer_size = (count.max(1) as usize) * (sec_size as usize);
        let mut aligned_buf = match AlignedSectorBuffer::new(buffer_size, sec_size.max(4096) as usize) {
            Some(b) => b,
            None => return false,
        };
        let mut bytes_read: u32 = 0;

        let seek_ok = SetFilePointerEx(
            ctx.raw_handle as _,
            byte_offset,
            std::ptr::null_mut(),
            FILE_BEGIN,
        );

        let read_ok = if seek_ok != 0 {
            ReadFile(
                ctx.raw_handle as _,
                aligned_buf.as_mut_ptr(),
                buffer_size as u32,
                &mut bytes_read,
                std::ptr::null_mut(),
            )
        } else {
            0
        };

        let elapsed = start.elapsed();
        let latency_ms = elapsed.as_secs_f64() * 1000.0;

        let res = &mut *out_result;
        res.start_lba = lba;
        res.sector_count = count as u64;
        res.latency_ms = latency_ms;

        if read_ok != 0 && bytes_read == buffer_size as u32 {
            res.win32_error_code = 0;
            copy_str_to_fixed_bytes("NO_ERROR", &mut res.error_mnemonic);
            res.status_code = match latency_ms {
                ms if ms < 10.0 => DSSectorStatus::Good as u32,
                ms if ms < 50.0 => DSSectorStatus::Normal as u32,
                ms if ms < 150.0 => DSSectorStatus::Slow as u32,
                ms if ms < 500.0 => DSSectorStatus::Critical as u32,
                _ => DSSectorStatus::Bad as u32,
            };
            true
        } else {
            let err = GetLastError();
            res.win32_error_code = err;
            copy_str_to_fixed_bytes(&format!("WIN32_ERR_{}", err), &mut res.error_mnemonic);
            res.status_code = DSSectorStatus::Bad as u32;
            false
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (start, lba, count, out_result);
        false
    }
}

// ---------------------------------------------------------------------------
// 2.1. DS_ReadRawSector (Read raw bytes from physical sector with NO_BUFFERING alignment)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_ReadRawSector(
    drive_handle: *mut c_void,
    lba: u64,
    out_buffer: *mut u8,
    buffer_size: u32,
) -> bool {
    if drive_handle.is_null() || out_buffer.is_null() || buffer_size == 0 {
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::Storage::FileSystem::{SetFilePointerEx, ReadFile, FILE_BEGIN};

        let ctx = &*(drive_handle as *const DriveContext);
        let sec_size = ctx.sector_size.max(512) as usize;
        let byte_offset = (lba as i64) * (sec_size as i64);
        // FILE_FLAG_NO_BUFFERING requires both pointer alignment and sector-multiple read size
        let aligned_read_len = (buffer_size as usize).div_ceil(sec_size) * sec_size;
        let mut aligned_buf = match AlignedSectorBuffer::new(aligned_read_len, sec_size.max(4096)) {
            Some(b) => b,
            None => return false,
        };
        let mut bytes_read: u32 = 0;

        let seek_ok = SetFilePointerEx(
            ctx.raw_handle as _,
            byte_offset,
            std::ptr::null_mut(),
            FILE_BEGIN,
        );

        if seek_ok != 0 {
            let read_ok = ReadFile(
                ctx.raw_handle as _,
                aligned_buf.as_mut_ptr(),
                aligned_read_len as u32,
                &mut bytes_read,
                std::ptr::null_mut(),
            );
            if read_ok != 0 && bytes_read >= buffer_size {
                std::ptr::copy_nonoverlapping(aligned_buf.as_ptr(), out_buffer, buffer_size as usize);
                return true;
            }
        }
        false
    }

    #[cfg(not(windows))]
    {
        let _ = (lba, out_buffer, buffer_size);
        false
    }
}

// ---------------------------------------------------------------------------
// 3. DS_AdaptiveScanChunk (Adaptive Burst & Micro-LBA Seeker)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_AdaptiveScanChunk(
    drive_handle: *mut c_void,
    chunk_start_lba: u64,
    chunk_sector_count: u32,
    burst_step: u32,
    out_bad_results: *mut DSBlockResult,
    max_bad_results: u32,
    out_detected_bad_count: *mut u32,
) -> bool {
    if drive_handle.is_null() || out_detected_bad_count.is_null() {
        return false;
    }

    *out_detected_bad_count = 0;
    let step = if burst_step == 0 { 256 } else { burst_step };
    let mut current_lba = chunk_start_lba;
    let end_lba = chunk_start_lba + chunk_sector_count as u64;
    let mut detected = 0u32;

    let mut temp_result = DSBlockResult {
        start_lba: 0,
        sector_count: 0,
        latency_ms: 0.0,
        status_code: 0,
        win32_error_code: 0,
        error_mnemonic: [0; 32],
    };

    while current_lba < end_lba {
        let sectors_to_read = ((end_lba - current_lba) as u32).min(step);
        let ok = DS_ScanLbaBlock(drive_handle, current_lba, sectors_to_read, &mut temp_result);

        // If burst fails or is critical (> 500ms or BAD), subdivide into single sectors
        if !ok || temp_result.status_code >= (DSSectorStatus::Critical as u32) {
            for sub_lba in current_lba..(current_lba + sectors_to_read as u64) {
                let mut sub_result = temp_result;
                let sub_ok = DS_ScanLbaBlock(drive_handle, sub_lba, 1, &mut sub_result);
                if !sub_ok || sub_result.status_code >= (DSSectorStatus::Critical as u32) {
                    if !out_bad_results.is_null() && detected < max_bad_results {
                        *out_bad_results.add(detected as usize) = sub_result;
                    }
                    detected += 1;
                }
            }
        }

        current_lba += sectors_to_read as u64;
    }

    *out_detected_bad_count = detected;
    true
}

// ---------------------------------------------------------------------------
// 4. DS_GetSmartTelemetry (Real Win32 S.M.A.R.T. Implementation)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_GetSmartTelemetry(
    drive_handle: *mut c_void,
    out_entries: *mut DSSmartEntry,
    max_entries: i32,
) -> i32 {
    if drive_handle.is_null() || out_entries.is_null() || max_entries <= 0 {
        return 0;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Ioctl::{
            SMART_GET_VERSION, SMART_RCV_DRIVE_DATA, SMART_READ_ATTRIBUTE_VALUES,
            IOCTL_STORAGE_QUERY_PROPERTY, STORAGE_PROPERTY_QUERY,
            StorageDeviceTemperatureProperty, PropertyStandardQuery, STORAGE_TEMPERATURE_DATA_DESCRIPTOR,
            GETVERSIONINPARAMS, SENDCMDINPARAMS, SENDCMDOUTPARAMS,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        let h_device = ctx.raw_handle;
        if h_device.is_null() {
            return 0;
        }

        // 1. Get SMART version and capabilities
        let mut gvip: GETVERSIONINPARAMS = std::mem::zeroed();
        let mut bytes_returned: u32 = 0;
        let smart_ver_ok = DeviceIoControl(
            h_device as _,
            SMART_GET_VERSION,
            std::ptr::null(),
            0,
            &mut gvip as *mut _ as _,
            std::mem::size_of::<GETVERSIONINPARAMS>() as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        );

        if smart_ver_ok != 0 {
            // Read thresholds (ATA SMART subcommand 0xD1)
            let mut thresholds = [0u8; 256];
            let mut thresh_scip: SENDCMDINPARAMS = std::mem::zeroed();
            thresh_scip.cBufferSize = 512;
            thresh_scip.irDriveRegs.bFeaturesReg = 0xD1; // READ_THRESHOLDS
            thresh_scip.irDriveRegs.bSectorCountReg = 1;
            thresh_scip.irDriveRegs.bSectorNumberReg = 1;
            thresh_scip.irDriveRegs.bCylLowReg = 0x4F;
            thresh_scip.irDriveRegs.bCylHighReg = 0xC2;
            thresh_scip.irDriveRegs.bDriveHeadReg = 0xA0 | (((ctx.drive_index & 1) << 4) as u8);
            thresh_scip.irDriveRegs.bCommandReg = 0xB0;

            let thresh_out_size = std::mem::size_of::<SENDCMDOUTPARAMS>() + 512;
            let mut thresh_out_buf = vec![0u8; thresh_out_size];
            let mut thresh_bytes: u32 = 0;
            if DeviceIoControl(
                h_device as _,
                SMART_RCV_DRIVE_DATA,
                &thresh_scip as *const _ as _,
                std::mem::size_of::<SENDCMDINPARAMS>() as u32,
                thresh_out_buf.as_mut_ptr() as _,
                thresh_out_size as u32,
                &mut thresh_bytes,
                std::ptr::null_mut(),
            ) != 0 && thresh_bytes >= 528 {
                let p_tout = thresh_out_buf.as_ptr() as *const SENDCMDOUTPARAMS;
                let p_tdata = (*p_tout).bBuffer.as_ptr();
                for i in 0..30 {
                    let rec = p_tdata.add(2 + i * 12);
                    let id = *rec;
                    if id != 0 {
                        thresholds[id as usize] = *rec.add(1);
                    }
                }
            }

            // Request Attribute Values (0xD0)
            let mut scip: SENDCMDINPARAMS = std::mem::zeroed();
            scip.cBufferSize = 512;
            scip.irDriveRegs.bFeaturesReg = SMART_READ_ATTRIBUTE_VALUES;
            scip.irDriveRegs.bSectorCountReg = 1;
            scip.irDriveRegs.bSectorNumberReg = 1;
            scip.irDriveRegs.bCylLowReg = 0x4F;
            scip.irDriveRegs.bCylHighReg = 0xC2;
            scip.irDriveRegs.bDriveHeadReg = 0xA0 | (((ctx.drive_index & 1) << 4) as u8);
            scip.irDriveRegs.bCommandReg = 0xB0; // SMART_CMD

            let out_buffer_size = std::mem::size_of::<SENDCMDOUTPARAMS>() + 512;
            let mut out_buffer = vec![0u8; out_buffer_size];

            let ok = DeviceIoControl(
                h_device as _,
                SMART_RCV_DRIVE_DATA,
                &scip as *const _ as _,
                std::mem::size_of::<SENDCMDINPARAMS>() as u32,
                out_buffer.as_mut_ptr() as _,
                out_buffer_size as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            );

            if ok != 0 && bytes_returned >= 528 {
                let p_out = out_buffer.as_ptr() as *const SENDCMDOUTPARAMS;
                let p_data = (*p_out).bBuffer.as_ptr();

                let mut count = 0;
                for i in 0..30 {
                    if count >= max_entries { break; }
                    let attr_ptr = p_data.add(2 + i * 12);
                    let id = *attr_ptr;
                    if id == 0 { continue; }

                    let entry = &mut *out_entries.add(count as usize);
                    entry.attribute_id = id as u32;

                    let name = match id {
                        0x01 => "Read Error Rate",
                        0x03 => "Spin Up Time",
                        0x04 => "Start/Stop Count",
                        0x05 => "Reallocated Sectors Count",
                        0x07 => "Seek Error Rate",
                        0x09 => "Power-On Hours",
                        0x0A => "Spin Retry Count",
                        0x0C => "Power Cycle Count",
                        0xBB => "Reported Uncorrectable Errors",
                        0xBC => "Command Timeout",
                        0xBE => "Airflow Temperature",
                        0xC0 => "Unsafe Shutdown Count",
                        0xC1 => "Load Cycle Count",
                        0xC2 => "Temperature Celsius",
                        0xC4 => "Reallocation Event Count",
                        0xC5 => "Current Pending Sector Count",
                        0xC6 => "Offline Uncorrectable Sector Count",
                        0xC7 => "UltraDMA CRC Error Count",
                        0xE1 => "Host Writes (Total)",
                        0xE7 => "SSD Life Left",
                        0xF1 => "Total LBA Written",
                        0xF2 => "Total LBA Read",
                        _ => "Vendor Specific Attribute",
                    };
                    copy_str_to_fixed_bytes(name, &mut entry.attribute_name);

                    entry.current_value = *attr_ptr.add(3);
                    entry.worst_value = *attr_ptr.add(4);
                    entry.threshold_value = thresholds[id as usize];

                    let raw: [u8; 6] = [
                        *attr_ptr.add(5), *attr_ptr.add(6), *attr_ptr.add(7),
                        *attr_ptr.add(8), *attr_ptr.add(9), *attr_ptr.add(10)
                    ];
                    entry.raw_value = u64::from_le_bytes([raw[0], raw[1], raw[2], raw[3], raw[4], raw[5], 0, 0]);

                    entry.health_status = if entry.threshold_value > 0 && entry.current_value <= entry.threshold_value {
                        2 // Crossed manufacturer failure threshold
                    } else if (id == 0x05 || id == 0xC5 || id == 0xC6 || id == 0xBB) && entry.raw_value > 0 {
                        if entry.raw_value >= 8 { 2 } else { 1 }
                    } else if (id == 0xC2 || id == 0xBE) && (entry.raw_value & 0xFF) >= 60 {
                        2
                    } else if (id == 0xC2 || id == 0xBE) && (entry.raw_value & 0xFF) >= 52 {
                        1
                    } else {
                        0
                    };

                    count += 1;
                }
                if count > 0 {
                    return count;
                }
            }
        }

        // 2. For NVMe/USB UASP devices without ATA SMART, query StorageDeviceTemperatureProperty
        if max_entries >= 1 {
            let mut temp_query: STORAGE_PROPERTY_QUERY = std::mem::zeroed();
            temp_query.PropertyId = StorageDeviceTemperatureProperty;
            temp_query.QueryType = PropertyStandardQuery;
            let mut temp_desc: STORAGE_TEMPERATURE_DATA_DESCRIPTOR = std::mem::zeroed();
            let mut temp_bytes: u32 = 0;
            if DeviceIoControl(
                h_device as _,
                IOCTL_STORAGE_QUERY_PROPERTY,
                &temp_query as *const _ as _,
                std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
                &mut temp_desc as *mut _ as _,
                std::mem::size_of::<STORAGE_TEMPERATURE_DATA_DESCRIPTOR>() as u32,
                &mut temp_bytes,
                std::ptr::null_mut(),
            ) != 0 && temp_desc.InfoCount > 0 {
                let temp_c = temp_desc.TemperatureInfo[0].Temperature;
                if temp_c > -40 && temp_c < 150 {
                    let entry = &mut *out_entries.add(0);
                    entry.attribute_id = 0xC2;
                    copy_str_to_fixed_bytes("Temperature Celsius", &mut entry.attribute_name);
                    entry.current_value = if temp_c >= 0 && temp_c < 100 { (100 - temp_c) as u8 } else { 0 };
                    entry.worst_value = entry.current_value;
                    entry.threshold_value = 0;
                    entry.raw_value = if temp_c > 0 { temp_c as u64 } else { 0 };
                    entry.health_status = if temp_c >= 60 { 2 } else if temp_c >= 52 { 1 } else { 0 };
                    return 1;
                }
            }
        }
    }

    // No telemetry available on this interface/OS without kernel permissions
    0
}

// ---------------------------------------------------------------------------
// 5. DS_EvaluateDriveReliability (Weighted Reliability & Life Index)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_EvaluateDriveReliability(
    entries: *const DSSmartEntry,
    entry_count: i32,
    out_report: *mut DSDriveHealthReport,
) -> bool {
    if entries.is_null() || out_report.is_null() || entry_count <= 0 {
        return false;
    }

    let report = &mut *out_report;
    report.reliability_score = 100.0;
    report.total_power_on_hours = 0;
    report.reallocated_sectors = 0;
    report.pending_sectors = 0;
    report.uncorrectable_errors = 0;
    report.temperature_celsius = 0; // 0 = temperature sensor unavailable

    for i in 0..(entry_count as usize) {
        let e = &*entries.add(i);
        if e.threshold_value > 0 && e.current_value <= e.threshold_value {
            report.reliability_score -= 30.0;
        }
        match e.attribute_id {
            0x05 => {
                report.reallocated_sectors = e.raw_value as u32;
                report.reliability_score -= ((report.reallocated_sectors as f64) * 5.0).min(45.0);
            }
            0xC5 => {
                report.pending_sectors = e.raw_value as u32;
                report.reliability_score -= ((report.pending_sectors as f64) * 8.0).min(50.0);
            }
            0xBB | 0xC6 => {
                report.uncorrectable_errors += e.raw_value as u32;
                report.reliability_score -= ((e.raw_value as f64) * 10.0).min(40.0);
            }
            0x09 => {
                report.total_power_on_hours = e.raw_value as u32;
            }
            0xC2 | 0xBE => {
                let t = (e.raw_value as u32) & 0xFF;
                if t > 0 && t < 150 {
                    report.temperature_celsius = t;
                    if t > 55 {
                        report.reliability_score -= ((t - 55) as f64) * 2.0;
                    }
                }
            }
            _ => {}
        }
    }

    report.reliability_score = report.reliability_score.clamp(0.0, 100.0);

    let grade = match report.reliability_score {
        s if s >= 95.0 => "EXCELLENT",
        s if s >= 80.0 => "GOOD",
        s if s >= 50.0 => "WARNING",
        _ => "CRITICAL",
    };
    copy_str_to_fixed_bytes(grade, &mut report.overall_grade);

    report.estimated_remaining_days = if report.reliability_score < 20.0 {
        14
    } else if report.reliability_score < 50.0 {
        60
    } else {
        ((report.reliability_score / 100.0) * 1825.0) as u32 // Up to 5 years
    };

    true
}

// ---------------------------------------------------------------------------
// 6. DS_CalculateParityChecksum (Fast ECC Parity & CRC32 Generator)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_CalculateParityChecksum(
    buffer: *const u8,
    length: u32,
    out_crc32: *mut u32,
    out_ecc_parity: *mut u64,
) -> bool {
    if buffer.is_null() || length == 0 || out_crc32.is_null() || out_ecc_parity.is_null() {
        return false;
    }

    let slice = std::slice::from_raw_parts(buffer, length as usize);

    // Fast Bitwise Parity Accumulator
    let mut parity: u64 = 0;
    let chunks = slice.chunks_exact(8);
    let remainder = chunks.remainder();

    for chunk in chunks {
        let val = u64::from_le_bytes(chunk.try_into().unwrap());
        parity ^= val;
    }

    if !remainder.is_empty() {
        let mut rem_buf = [0u8; 8];
        rem_buf[..remainder.len()].copy_from_slice(remainder);
        parity ^= u64::from_le_bytes(rem_buf);
    }

    // Standard IEEE 802.3 CRC-32 (0xEDB88320)
    let mut crc: u32 = 0xFFFFFFFF;
    for &byte in slice {
        crc ^= byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB88320 & mask);
        }
    }

    *out_crc32 = !crc;
    *out_ecc_parity = parity;
    true
}

// ---------------------------------------------------------------------------
// 7. DS_AttemptSoftSectorRepair
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_AttemptSoftSectorRepair(
    drive_handle: *mut c_void,
    bad_lba: u64,
    count: u32,
    out_recovered_status: *mut u32,
) -> bool {
    if drive_handle.is_null() || out_recovered_status.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::Storage::FileSystem::{SetFilePointerEx, WriteFile, ReadFile, FILE_BEGIN};

        let ctx = &*(drive_handle as *const DriveContext);
        let sec_size = ctx.sector_size.max(512);
        let safe_count = count.max(1);
        let byte_offset = (bad_lba as i64) * (sec_size as i64);
        let total_bytes = safe_count * sec_size;
        let mut aligned_buf = match AlignedSectorBuffer::new(total_bytes as usize, sec_size.max(4096) as usize) {
            Some(b) => b,
            None => {
                *out_recovered_status = 0;
                return false;
            }
        };
        let mut bytes_written: u32 = 0;

        let seek_ok = SetFilePointerEx(
            ctx.raw_handle as _,
            byte_offset,
            std::ptr::null_mut(),
            FILE_BEGIN,
        );

        if seek_ok != 0 {
            let write_ok = WriteFile(
                ctx.raw_handle as _,
                aligned_buf.as_ptr(),
                total_bytes,
                &mut bytes_written,
                std::ptr::null_mut(),
            );
            if write_ok != 0 && bytes_written == total_bytes {
                // Verify zeros via read-back check
                let reseek_ok = SetFilePointerEx(
                    ctx.raw_handle as _,
                    byte_offset,
                    std::ptr::null_mut(),
                    FILE_BEGIN,
                );
                if reseek_ok != 0 {
                    let mut bytes_read: u32 = 0;
                    let read_ok = ReadFile(
                        ctx.raw_handle as _,
                        aligned_buf.as_mut_ptr(),
                        total_bytes,
                        &mut bytes_read,
                        std::ptr::null_mut(),
                    );
                    if read_ok != 0 && bytes_read == total_bytes && aligned_buf.as_slice().iter().all(|&b| b == 0) {
                        *out_recovered_status = 1; // 1 = Zero-fill & read-back verification succeeded
                        return true;
                    }
                }
            }
        }

        *out_recovered_status = 0; // Failed (Hard physical damage or read-only protection)
        false
    }

    #[cfg(not(windows))]
    {
        let _ = (bad_lba, count);
        *out_recovered_status = 0;
        false
    }
}

// ---------------------------------------------------------------------------
// 8. DS_CloseDrive
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_CloseDrive(drive_handle: *mut c_void) {
    if drive_handle.is_null() {
        return;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        let ctx = Box::from_raw(drive_handle as *mut DriveContext);
        if !ctx.raw_handle.is_null() {
            CloseHandle(ctx.raw_handle as _);
        }
    }

    #[cfg(not(windows))]
    {
        let _ = Box::from_raw(drive_handle as *mut DriveContext);
    }
}

// ---------------------------------------------------------------------------
// 9. DS_GetNvmeDeepTelemetry (NVMe Log Page 02h Deep Health & Wear Telemetry)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_GetNvmeDeepTelemetry(
    drive_handle: *mut c_void,
    out_log: *mut DSNvmeHealthLog,
) -> bool {
    if drive_handle.is_null() || out_log.is_null() {
        return false;
    }

    let log = &mut *out_log;
    *log = std::mem::zeroed();

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Ioctl::{
            IOCTL_STORAGE_QUERY_PROPERTY,
            STORAGE_PROPERTY_QUERY,
            STORAGE_PROTOCOL_SPECIFIC_DATA,
            STORAGE_PROTOCOL_DATA_DESCRIPTOR,
            StorageDeviceProtocolSpecificProperty,
            StorageAdapterProtocolSpecificProperty,
            PropertyStandardQuery,
            ProtocolTypeNvme,
            NVMeDataTypeLogPage,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }

        const LOG_PAGE_SIZE: usize = 512;
        let query_header_size = std::mem::size_of::<STORAGE_PROPERTY_QUERY>()
            + std::mem::size_of::<STORAGE_PROTOCOL_SPECIFIC_DATA>();
        let total_size = query_header_size + LOG_PAGE_SIZE;
        let mut buffer = vec![0u8; total_size];

        let query_offset = std::mem::offset_of!(STORAGE_PROPERTY_QUERY, AdditionalParameters);

        let try_property = |prop_id: i32, buf: &mut [u8]| -> bool {
            buf.fill(0);
            let q = &mut *(buf.as_mut_ptr() as *mut STORAGE_PROPERTY_QUERY);
            q.PropertyId = prop_id;
            q.QueryType = PropertyStandardQuery;

            let pdata = &mut *(buf.as_mut_ptr().add(query_offset) as *mut STORAGE_PROTOCOL_SPECIFIC_DATA);
            pdata.ProtocolType = ProtocolTypeNvme;
            pdata.DataType = NVMeDataTypeLogPage as u32;
            pdata.ProtocolDataRequestValue = 0x02; // Health Information Log Page
            pdata.ProtocolDataRequestSubValue = 0;
            pdata.ProtocolDataOffset = std::mem::size_of::<STORAGE_PROTOCOL_SPECIFIC_DATA>() as u32;
            pdata.ProtocolDataLength = LOG_PAGE_SIZE as u32;

            let mut bytes_returned: u32 = 0;
            let ok = DeviceIoControl(
                ctx.raw_handle as _,
                IOCTL_STORAGE_QUERY_PROPERTY,
                buf.as_ptr() as _,
                buf.len() as u32,
                buf.as_mut_ptr() as _,
                buf.len() as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            );
            ok != 0 && bytes_returned >= std::mem::size_of::<STORAGE_PROTOCOL_DATA_DESCRIPTOR>() as u32
        };

        let ok = try_property(StorageDeviceProtocolSpecificProperty, &mut buffer)
            || try_property(StorageAdapterProtocolSpecificProperty, &mut buffer);

        if ok {
            let desc = &*(buffer.as_ptr() as *const STORAGE_PROTOCOL_DATA_DESCRIPTOR);
            let data_offset = desc.ProtocolSpecificData.ProtocolDataOffset as usize;
            let data_len = desc.ProtocolSpecificData.ProtocolDataLength as usize;
            let base_ptr = (&desc.ProtocolSpecificData as *const STORAGE_PROTOCOL_SPECIFIC_DATA) as usize;
            let buf_start = buffer.as_ptr() as usize;
            let rel_start = (base_ptr - buf_start) + data_offset;

            if data_offset > 0 && data_len >= 200 && rel_start + 200 <= buffer.len() {
                let raw = &buffer[rel_start..rel_start + 200];
                log.critical_warning = raw[0];
                let temp_kelvin = u16::from_le_bytes([raw[1], raw[2]]);
                log.temperature_celsius = if temp_kelvin >= 273 { temp_kelvin - 273 } else { 0 };
                log.available_spare = raw[3];
                log.available_spare_threshold = raw[4];
                log.percentage_used = raw[5];

                let read_units = u64::from_le_bytes(raw[32..40].try_into().unwrap_or([0; 8]));
                let written_units = u64::from_le_bytes(raw[48..56].try_into().unwrap_or([0; 8]));
                log.data_units_read_tb = ((read_units as f64) * 512_000.0) / 1e12;
                log.data_units_written_tb = ((written_units as f64) * 512_000.0) / 1e12;

                log.host_read_commands = u64::from_le_bytes(raw[64..72].try_into().unwrap_or([0; 8]));
                log.host_write_commands = u64::from_le_bytes(raw[80..88].try_into().unwrap_or([0; 8]));
                log.controller_busy_time_minutes = u64::from_le_bytes(raw[96..104].try_into().unwrap_or([0; 8]));
                log.power_cycles = u64::from_le_bytes(raw[112..120].try_into().unwrap_or([0; 8]));
                log.power_on_hours = u64::from_le_bytes(raw[128..136].try_into().unwrap_or([0; 8]));
                log.unsafe_shutdowns = u64::from_le_bytes(raw[144..152].try_into().unwrap_or([0; 8]));
                log.media_errors = u64::from_le_bytes(raw[160..168].try_into().unwrap_or([0; 8]));
                log.num_err_log_entries = u64::from_le_bytes(raw[176..184].try_into().unwrap_or([0; 8]));
                log.warning_temp_time_min = u32::from_le_bytes(raw[192..196].try_into().unwrap_or([0; 4]));
                log.critical_temp_time_min = u32::from_le_bytes(raw[196..200].try_into().unwrap_or([0; 4]));
                return true;
            }
        }
        false
    }

    #[cfg(not(windows))]
    {
        false
    }
}

// ---------------------------------------------------------------------------
// 10. DS_CalculateAvx2ChecksumAndZeroCheck (SIMD AVX2 Accelerated Zero-Check & Checksum)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_CalculateAvx2ChecksumAndZeroCheck(
    buffer: *const u8,
    length: u32,
    out_is_all_zeros: *mut bool,
    out_crc32: *mut u32,
    out_avx_parity: *mut u64,
) -> bool {
    if buffer.is_null() || length == 0 || out_is_all_zeros.is_null() || out_crc32.is_null() || out_avx_parity.is_null() {
        return false;
    }

    let slice = std::slice::from_raw_parts(buffer, length as usize);

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        if std::is_x86_feature_detected!("avx2") {
            let (is_zero, parity, crc) = avx2_compute_inner(slice);
            *out_is_all_zeros = is_zero;
            *out_avx_parity = parity;
            *out_crc32 = crc;
            return true;
        }
    }

    // High performance 64-bit scalar fallback
    let mut parity: u64 = 0;
    let mut all_zeros = true;
    let chunks = slice.chunks_exact(8);
    let remainder = chunks.remainder();

    for chunk in chunks {
        let val = u64::from_le_bytes(chunk.try_into().unwrap());
        if val != 0 {
            all_zeros = false;
        }
        parity ^= val;
    }

    if !remainder.is_empty() {
        let mut rem_buf = [0u8; 8];
        rem_buf[..remainder.len()].copy_from_slice(remainder);
        let val = u64::from_le_bytes(rem_buf);
        if val != 0 {
            all_zeros = false;
        }
        parity ^= val;
    }

    // CRC32 IEEE 802.3
    let mut crc: u32 = 0xFFFFFFFF;
    for &byte in slice {
        crc ^= byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB88320 & mask);
        }
    }

    *out_is_all_zeros = all_zeros;
    *out_avx_parity = parity;
    *out_crc32 = !crc;
    true
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
#[target_feature(enable = "avx2")]
unsafe fn avx2_compute_inner(slice: &[u8]) -> (bool, u64, u32) {
    use std::arch::x86_64::*;

    let mut zero_acc = _mm256_setzero_si256();
    let mut parity_acc = _mm256_setzero_si256();

    let chunks32 = slice.chunks_exact(32);
    let rem = chunks32.remainder();

    for chunk in chunks32 {
        let v = _mm256_loadu_si256(chunk.as_ptr() as *const __m256i);
        zero_acc = _mm256_or_si256(zero_acc, v);
        parity_acc = _mm256_xor_si256(parity_acc, v);
    }

    let is_zero_32 = _mm256_testz_si256(zero_acc, zero_acc) != 0;

    let mut parity_arr = [0u64; 4];
    _mm256_storeu_si256(parity_arr.as_mut_ptr() as *mut __m256i, parity_acc);
    let mut parity: u64 = parity_arr[0] ^ parity_arr[1] ^ parity_arr[2] ^ parity_arr[3];

    let mut rem_is_zero = true;
    for &b in rem {
        if b != 0 {
            rem_is_zero = false;
            break;
        }
    }

    let rem_chunks8 = rem.chunks_exact(8);
    let rem_tail = rem_chunks8.remainder();
    for c in rem_chunks8 {
        parity ^= u64::from_le_bytes(c.try_into().unwrap());
    }
    if !rem_tail.is_empty() {
        let mut t = [0u8; 8];
        t[..rem_tail.len()].copy_from_slice(rem_tail);
        parity ^= u64::from_le_bytes(t);
    }

    let mut crc: u32 = 0xFFFFFFFF;
    for &byte in slice {
        crc ^= byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB88320 & mask);
        }
    }

    (is_zero_32 && rem_is_zero, parity, !crc)
}

// ---------------------------------------------------------------------------
// 11. DS_ScanMultipleDrivesParallel (Rayon Fearless Concurrency Multi-Drive Scanner)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_ScanMultipleDrivesParallel(
    targets: *const DSMultiDriveScanTarget,
    target_count: u32,
    out_summaries: *mut DSMultiDriveScanSummary,
    concurrency_limit: u32,
) -> bool {
    if targets.is_null() || out_summaries.is_null() || target_count == 0 {
        return false;
    }

    use rayon::prelude::*;

    let target_slice = std::slice::from_raw_parts(targets, target_count as usize);

    let pool = if concurrency_limit > 0 {
        rayon::ThreadPoolBuilder::new()
            .num_threads(concurrency_limit as usize)
            .build()
            .ok()
    } else {
        None
    };

    let run_scan = || -> Vec<DSMultiDriveScanSummary> {
        target_slice
            .par_iter()
            .map(|target| {
                let start_time = Instant::now();
                let mut sector_size: u32 = 512;
                let handle = DS_OpenDriveDirect(target.drive_index, &mut sector_size);

                let mut total_bad = 0u32;
                let mut total_scanned = 0u64;
                let mut status = 0u32;
                let mut completed = false;
                let step = target.burst_step.max(1);

                if !handle.is_null() {
                    let mut bad_chunk = [DSBlockResult {
                        start_lba: 0,
                        sector_count: 0,
                        latency_ms: 0.0,
                        status_code: 0,
                        win32_error_code: 0,
                        error_mnemonic: [0; 32],
                    }; 32];
                    let mut detected = 0u32;
                    let mut ok = true;
                    let mut remaining = target.sector_count;
                    let mut cur_lba = target.start_lba;

                    while remaining > 0 {
                        let chunk = remaining.min(u32::MAX as u64) as u32;
                        let mut chunk_bad = 0u32;
                        let space_left = 32u32.saturating_sub(detected);
                        let res_ptr = if space_left > 0 {
                            bad_chunk.as_mut_ptr().add(detected as usize)
                        } else {
                            std::ptr::null_mut()
                        };

                        if !DS_AdaptiveScanChunk(
                            handle,
                            cur_lba,
                            chunk,
                            step,
                            res_ptr,
                            space_left,
                            &mut chunk_bad,
                        ) {
                            ok = false;
                            break;
                        }
                        detected = detected.saturating_add(chunk_bad);
                        cur_lba = cur_lba.saturating_add(chunk as u64);
                        remaining -= chunk as u64;
                    }

                    total_bad = detected;
                    total_scanned = target.sector_count;
                    completed = ok;
                    status = if ok && detected == 0 { 0 } else if detected > 0 { 4 } else { 2 };

                    DS_CloseDrive(handle);
                } else {
                    status = 4; // Drive open error
                }

                let elapsed = start_time.elapsed().as_secs_f64() * 1000.0;
                let chunk_ops = (total_scanned.max(1)).div_ceil(step as u64).max(1);
                let avg_latency = elapsed / (chunk_ops as f64);

                DSMultiDriveScanSummary {
                    drive_index: target.drive_index,
                    total_sectors_scanned: total_scanned,
                    bad_sectors_found: total_bad,
                    elapsed_ms: elapsed,
                    avg_latency_ms: avg_latency,
                    is_completed: completed,
                    status_code: status,
                }
            })
            .collect()
    };

    let results = if let Some(p) = pool {
        p.install(run_scan)
    } else {
        run_scan()
    };

    for (idx, summary) in results.into_iter().enumerate() {
        *out_summaries.add(idx) = summary;
    }

    true
}

// ---------------------------------------------------------------------------
// 12. System Tray Lightweight Guardian Daemon Configuration & Check
// ---------------------------------------------------------------------------
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

static GUARDIAN_ACTIVE: AtomicBool = AtomicBool::new(true);
static GUARDIAN_INTERVAL_SEC: AtomicU32 = AtomicU32::new(10);
static GUARDIAN_TEMP_THRESHOLD: AtomicU32 = AtomicU32::new(55);
static GUARDIAN_ALERT_PENDING: AtomicBool = AtomicBool::new(true);

#[no_mangle]
pub unsafe extern "system" fn DS_ConfigureTrayGuardian(
    poll_interval_sec: u32,
    temp_threshold_c: u32,
    alert_on_pending_sector: bool,
) -> bool {
    let interval = if poll_interval_sec < 1 { 1 } else { poll_interval_sec };
    let threshold = if temp_threshold_c < 30 { 30 } else { temp_threshold_c };

    GUARDIAN_INTERVAL_SEC.store(interval, Ordering::Relaxed);
    GUARDIAN_TEMP_THRESHOLD.store(threshold, Ordering::Relaxed);
    GUARDIAN_ALERT_PENDING.store(alert_on_pending_sector, Ordering::Relaxed);
    GUARDIAN_ACTIVE.store(true, Ordering::Relaxed);
    true
}

#[no_mangle]
pub unsafe extern "system" fn DS_RunTrayGuardianCheck(
    out_status: *mut DSTrayGuardianStatus,
) -> bool {
    if out_status.is_null() {
        return false;
    }

    let status = &mut *out_status;
    let is_active = GUARDIAN_ACTIVE.load(Ordering::Relaxed);
    let interval = GUARDIAN_INTERVAL_SEC.load(Ordering::Relaxed);
    let temp_limit = GUARDIAN_TEMP_THRESHOLD.load(Ordering::Relaxed);
    let check_pending = GUARDIAN_ALERT_PENDING.load(Ordering::Relaxed);

    status.is_monitoring_active = is_active;
    status.poll_interval_sec = interval;
    status.monitored_drive_count = 0;
    status.highest_temp_celsius = 0;
    status.critical_alert_triggered = false;
    status.warning_drive_index = 0;
    status.last_alert_code = 0;
    copy_str_to_fixed_bytes("Probing physical drives...", &mut status.last_alert_message);

    let mut pending_drive_idx = 0u32;
    let mut pending_found = false;
    let mut reallocated_drive_idx = 0u32;
    let mut reallocated_found = false;

    #[cfg(windows)]
    {
        for drive_idx in 0u32..32u32 {
            let mut sector_size: u32 = 512;
            let h_drive = DS_OpenDriveDirect(drive_idx, &mut sector_size);
            if h_drive.is_null() {
                continue;
            }
            status.monitored_drive_count += 1;

            let mut nvme_log: DSNvmeHealthLog = std::mem::zeroed();
            if DS_GetNvmeDeepTelemetry(h_drive, &mut nvme_log) {
                let t = nvme_log.temperature_celsius as u32;
                if t > 0 && t < 150 && t > status.highest_temp_celsius {
                    status.highest_temp_celsius = t;
                    if t >= temp_limit {
                        status.warning_drive_index = drive_idx;
                    }
                }
                if check_pending && nvme_log.media_errors > 0 {
                    pending_found = true;
                    pending_drive_idx = drive_idx;
                }
            }

            let mut entries = [DSSmartEntry {
                attribute_id: 0,
                attribute_name: [0; 64],
                current_value: 0,
                worst_value: 0,
                threshold_value: 0,
                raw_value: 0,
                health_status: 0,
            }; 32];
            let count = DS_GetSmartTelemetry(h_drive, entries.as_mut_ptr(), 32);
            for i in 0..(count.max(0) as usize) {
                let id = entries[i].attribute_id;
                if id == 0xC2 || id == 0xBE || id == 0xE7 {
                    let cur_temp = (entries[i].raw_value & 0xFF) as u32;
                    if cur_temp > 0 && cur_temp < 150 && cur_temp > status.highest_temp_celsius {
                        status.highest_temp_celsius = cur_temp;
                        if cur_temp >= temp_limit {
                            status.warning_drive_index = drive_idx;
                        }
                    }
                }
                if check_pending && (id == 0xC5 || id == 0xC6 || id == 0xBB) && entries[i].raw_value > 0 {
                    pending_found = true;
                    pending_drive_idx = drive_idx;
                }
                if id == 0x05 && entries[i].raw_value > 0 {
                    reallocated_found = true;
                    reallocated_drive_idx = drive_idx;
                }
            }

            DS_CloseDrive(h_drive);
        }
    }

    if status.highest_temp_celsius >= temp_limit {
        status.critical_alert_triggered = true;
        status.last_alert_code = if status.highest_temp_celsius >= 60 { 2 } else { 1 };
        let msg = format!(
            "Thermal Warning: PhysicalDrive{} reached {} C (Threshold {} C)",
            status.warning_drive_index, status.highest_temp_celsius, temp_limit
        );
        copy_str_to_fixed_bytes(&msg, &mut status.last_alert_message);
    } else if pending_found {
        status.critical_alert_triggered = true;
        status.warning_drive_index = pending_drive_idx;
        status.last_alert_code = 4;
        let msg = format!(
            "S.M.A.R.T. Alert: Pending/Uncorrectable Sectors Detected on PhysicalDrive{}!",
            pending_drive_idx
        );
        copy_str_to_fixed_bytes(&msg, &mut status.last_alert_message);
    } else if reallocated_found {
        status.critical_alert_triggered = true;
        status.warning_drive_index = reallocated_drive_idx;
        status.last_alert_code = 3;
        let msg = format!(
            "S.M.A.R.T. Notice: Reallocated Sectors Detected on PhysicalDrive{}",
            reallocated_drive_idx
        );
        copy_str_to_fixed_bytes(&msg, &mut status.last_alert_message);
    } else if status.monitored_drive_count == 0 {
        copy_str_to_fixed_bytes(
            "No direct physical drive handles accessible (Windows native elevation required)",
            &mut status.last_alert_message,
        );
    } else if status.highest_temp_celsius == 0 {
        let msg = format!(
            "{} drive(s) monitored; hardware thermal sensor unavailable",
            status.monitored_drive_count
        );
        copy_str_to_fixed_bytes(&msg, &mut status.last_alert_message);
    } else {
        let msg = format!(
            "All {} monitored drives operational (Peak {} C)",
            status.monitored_drive_count, status.highest_temp_celsius
        );
        copy_str_to_fixed_bytes(&msg, &mut status.last_alert_message);
    }

    true
}

// ---------------------------------------------------------------------------
// 13. Bit Carving File Signature Analysis & ECC Parity Recovery Engine
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_ExecuteBitCarvingRecovery(
    drive_handle: *mut c_void,
    target_lba: u64,
    cluster_span: u32,
    out_result: *mut DSCarvedSectorResult,
) -> bool {
    if drive_handle.is_null() || out_result.is_null() {
        return false;
    }

    let result = &mut *out_result;
    result.source_lba = target_lba;
    result.signature_type = 0;
    result.carved_size_bytes = 0;
    result.ecc_recovered_bits = 0;
    result.is_salvaged = false;
    result.hex_preview.fill(0);
    copy_str_to_fixed_bytes("Unreadable / Unavailable Raw Sector", &mut result.signature_name);

    let ctx = &*(drive_handle as *const DriveContext);
    let sector_bytes = if ctx.sector_size > 0 { ctx.sector_size } else { 512 };
    let span = if cluster_span == 0 { 8 } else { cluster_span.min(64) };
    let buffer_size = (span as usize) * (sector_bytes as usize);
    let mut actual_bytes_read: u32 = 0;

    #[cfg(windows)]
    let mut aligned_raw_buffer = match AlignedSectorBuffer::new(buffer_size, sector_bytes.max(4096) as usize) {
        Some(b) => b,
        None => return false,
    };
    #[cfg(not(windows))]
    let aligned_raw_buffer = vec![0u8; buffer_size];

    #[cfg(windows)]
    {
        use windows_sys::Win32::Storage::FileSystem::{ReadFile, SetFilePointerEx, FILE_BEGIN};
        if !ctx.raw_handle.is_null() {
            let offset = (target_lba * (sector_bytes as u64)) as i64;
            let mut new_pos: i64 = 0;
            if SetFilePointerEx(ctx.raw_handle as _, offset, &mut new_pos, FILE_BEGIN) != 0 {
                let mut bytes_read: u32 = 0;
                let r = ReadFile(
                    ctx.raw_handle as _,
                    aligned_raw_buffer.as_mut_ptr() as _,
                    buffer_size as u32,
                    &mut bytes_read,
                    std::ptr::null_mut(),
                );
                if r != 0 && bytes_read > 0 {
                    actual_bytes_read = bytes_read;
                }
            }
        }
    }

    if actual_bytes_read == 0 {
        return false;
    }

    #[cfg(windows)]
    let valid_slice_all = aligned_raw_buffer.as_slice();
    #[cfg(not(windows))]
    let valid_slice_all = aligned_raw_buffer.as_slice();

    let valid_len = (actual_bytes_read as usize).min(valid_slice_all.len());
    let valid_slice = &valid_slice_all[..valid_len];

    let mut sig_found = 0u32;
    let mut sig_name = "Raw Binary / Unmapped Sector";
    let mut salvaged = false;

    if valid_len >= 4 && valid_slice[0] == 0xFF && valid_slice[1] == 0xD8 && valid_slice[2] == 0xFF {
        sig_found = 1;
        sig_name = "JPEG Image (EXIF/JFIF)";
        salvaged = true;
    } else if valid_len >= 4 && valid_slice[0..4] == [0x89, 0x50, 0x4E, 0x47] {
        sig_found = 2;
        sig_name = "PNG Lossless Image";
        salvaged = true;
    } else if valid_len >= 4 && &valid_slice[0..4] == b"%PDF" {
        sig_found = 3;
        sig_name = "PDF Portable Document";
        salvaged = true;
    } else if valid_len >= 4 && valid_slice[0..4] == [0x50, 0x4B, 0x03, 0x04] {
        sig_found = 4;
        sig_name = "ZIP / DOCX / XLSX Archive";
        salvaged = true;
    } else if valid_len >= 8 && &valid_slice[4..8] == b"ftyp" {
        sig_found = 5;
        sig_name = "MP4 / MOV Video Container";
        salvaged = true;
    } else {
        let inspect_len = valid_len.min(256);
        let ascii_count = valid_slice[..inspect_len]
            .iter()
            .filter(|&&b| (b >= 32 && b <= 126) || b == 10 || b == 13 || b == 9)
            .count();
        if inspect_len > 0 && ascii_count * 100 >= inspect_len * 80 {
            sig_found = 6;
            sig_name = "UTF-8 Source / System Log";
            salvaged = true;
        }
    }

    result.signature_type = sig_found;
    copy_str_to_fixed_bytes(sig_name, &mut result.signature_name);
    result.carved_size_bytes = actual_bytes_read as u64;
    result.ecc_recovered_bits = 0;
    result.is_salvaged = salvaged;

    let copy_len = valid_len.min(64);
    result.hex_preview[..copy_len].copy_from_slice(&valid_slice[..copy_len]);

    true
}

// ---------------------------------------------------------------------------
// 14. DS_VerifyLbaBlock (Hardware Surface Verification via IOCTL_DISK_VERIFY)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_VerifyLbaBlock(
    drive_handle: *mut c_void,
    lba: u64,
    count: u32,
    out_result: *mut DSBlockResult,
) -> bool {
    if drive_handle.is_null() || out_result.is_null() || count == 0 {
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{ERROR_ACCESS_DENIED, ERROR_INVALID_FUNCTION, ERROR_NOT_SUPPORTED, GetLastError};
        use windows_sys::Win32::System::IO::DeviceIoControl;

        const IOCTL_DISK_VERIFY_CODE: u32 = 0x00070014;

        #[repr(C)]
        struct VerifyInformation {
            starting_offset: i64,
            length: u32,
        }

        let ctx = &*(drive_handle as *const DriveContext);
        let sec_size = ctx.sector_size.max(512);
        let verify_info = VerifyInformation {
            starting_offset: (lba as i64) * (sec_size as i64),
            length: count.saturating_mul(sec_size),
        };

        let start = Instant::now();
        let mut bytes_returned: u32 = 0;
        let ok = DeviceIoControl(
            ctx.raw_handle as _,
            IOCTL_DISK_VERIFY_CODE,
            &verify_info as *const _ as _,
            std::mem::size_of::<VerifyInformation>() as u32,
            std::ptr::null_mut(),
            0,
            &mut bytes_returned,
            std::ptr::null_mut(),
        );
        let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

        if ok != 0 {
            let res = &mut *out_result;
            res.start_lba = lba;
            res.sector_count = count as u64;
            res.latency_ms = latency_ms;
            res.win32_error_code = 0;
            copy_str_to_fixed_bytes("VERIFY_OK", &mut res.error_mnemonic);
            res.status_code = match latency_ms {
                ms if ms < 10.0 => DSSectorStatus::Good as u32,
                ms if ms < 50.0 => DSSectorStatus::Normal as u32,
                ms if ms < 150.0 => DSSectorStatus::Slow as u32,
                _ => DSSectorStatus::Critical as u32,
            };
            return true;
        }

        let err = GetLastError();
        if err == ERROR_INVALID_FUNCTION || err == ERROR_NOT_SUPPORTED || err == ERROR_ACCESS_DENIED {
            return DS_ScanLbaBlock(drive_handle, lba, count, out_result);
        }

        let res = &mut *out_result;
        res.start_lba = lba;
        res.sector_count = count as u64;
        res.latency_ms = latency_ms;
        res.win32_error_code = err;
        copy_str_to_fixed_bytes(&format!("VERIFY_ERR_{}", err), &mut res.error_mnemonic);
        res.status_code = DSSectorStatus::Bad as u32;
        false
    }

    #[cfg(not(windows))]
    {
        let _ = (lba, count, out_result);
        false
    }
}

// ---------------------------------------------------------------------------
// 15. DS_StartSmartSelfTest & DS_GetSmartSelfTestStatus (ATA SMART Self-Test)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_StartSmartSelfTest(
    drive_handle: *mut c_void,
    test_type_code: u32,
) -> bool {
    if drive_handle.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Ioctl::{
            SMART_SEND_DRIVE_COMMAND, SENDCMDINPARAMS, SENDCMDOUTPARAMS,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }

        let mut scip: SENDCMDINPARAMS = std::mem::zeroed();
        scip.cBufferSize = 0;
        scip.irDriveRegs.bFeaturesReg = 0xD4; // EXECUTE_OFFLINE_DIAGS
        scip.irDriveRegs.bSectorCountReg = 1;
        scip.irDriveRegs.bSectorNumberReg = (test_type_code & 0xFF) as u8;
        scip.irDriveRegs.bCylLowReg = 0x4F;
        scip.irDriveRegs.bCylHighReg = 0xC2;
        scip.irDriveRegs.bDriveHeadReg = 0xA0 | (((ctx.drive_index & 1) << 4) as u8);
        scip.irDriveRegs.bCommandReg = 0xB0; // SMART_CMD

        let mut out_params: SENDCMDOUTPARAMS = std::mem::zeroed();
        let mut bytes_returned: u32 = 0;
        DeviceIoControl(
            ctx.raw_handle as _,
            SMART_SEND_DRIVE_COMMAND,
            &scip as *const _ as _,
            std::mem::size_of::<SENDCMDINPARAMS>() as u32,
            &mut out_params as *mut _ as _,
            std::mem::size_of::<SENDCMDOUTPARAMS>() as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        ) != 0
    }

    #[cfg(not(windows))]
    {
        let _ = test_type_code;
        false
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_GetSmartSelfTestStatus(
    drive_handle: *mut c_void,
    out_exec_code: *mut u32,
    out_progress_pct: *mut u32,
) -> bool {
    if drive_handle.is_null() || out_exec_code.is_null() || out_progress_pct.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Ioctl::{
            SMART_RCV_DRIVE_DATA, SMART_READ_ATTRIBUTE_VALUES, SENDCMDINPARAMS, SENDCMDOUTPARAMS,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }

        let mut scip: SENDCMDINPARAMS = std::mem::zeroed();
        scip.cBufferSize = 512;
        scip.irDriveRegs.bFeaturesReg = SMART_READ_ATTRIBUTE_VALUES;
        scip.irDriveRegs.bSectorCountReg = 1;
        scip.irDriveRegs.bSectorNumberReg = 1;
        scip.irDriveRegs.bCylLowReg = 0x4F;
        scip.irDriveRegs.bCylHighReg = 0xC2;
        scip.irDriveRegs.bDriveHeadReg = 0xA0 | (((ctx.drive_index & 1) << 4) as u8);
        scip.irDriveRegs.bCommandReg = 0xB0;

        let out_size = std::mem::size_of::<SENDCMDOUTPARAMS>() + 512;
        let mut out_buf = vec![0u8; out_size];
        let mut bytes_returned: u32 = 0;

        if DeviceIoControl(
            ctx.raw_handle as _,
            SMART_RCV_DRIVE_DATA,
            &scip as *const _ as _,
            std::mem::size_of::<SENDCMDINPARAMS>() as u32,
            out_buf.as_mut_ptr() as _,
            out_size as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        ) == 0 || bytes_returned < 528 {
            return false;
        }

        let p_out = out_buf.as_ptr() as *const SENDCMDOUTPARAMS;
        let exec_byte = *(*p_out).bBuffer.as_ptr().add(363);
        *out_exec_code = exec_byte as u32;

        let status_nibble = (exec_byte >> 4) & 0x0F;
        if status_nibble == 0x0F {
            let rem_pct = ((exec_byte & 0x0F) as u32) * 10;
            *out_progress_pct = if rem_pct <= 100 { 100 - rem_pct } else { 0 };
        } else if status_nibble == 0x00 {
            *out_progress_pct = 100;
        } else {
            *out_progress_pct = 0;
        }
        true
    }

    #[cfg(not(windows))]
    {
        *out_exec_code = 0;
        *out_progress_pct = 0;
        false
    }
}

// ---------------------------------------------------------------------------
// Helper: Copy string safely to fixed byte array
// ---------------------------------------------------------------------------
fn copy_str_to_fixed_bytes(src: &str, dst: &mut [u8]) {
    dst.fill(0);
    let bytes = src.as_bytes();
    let len = bytes.len().min(dst.len() - 1);
    dst[..len].copy_from_slice(&bytes[..len]);
}

