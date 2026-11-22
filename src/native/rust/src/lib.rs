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

// Memory-Mapped File Access Mode
#[repr(u32)]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum DSMappedAccessMode {
    ReadOnly = 0,
    ReadWrite = 1,
}

// Zero-Copy Memory-Mapped Sector Window Descriptor
#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSMappedSectorWindow {
    pub view_ptr: *mut c_void,
    pub internal_base_ptr: *mut c_void,
    pub file_offset_bytes: u64,
    pub mapped_length_bytes: u32,
    pub sector_size: u32,
    pub is_section_mapped: u8,
    pub is_read_only: u8,
    pub reserved: [u8; 6],
}

// Real Win32 USB Host/Hub Topology & Transport Descriptor Metadata (naturally aligned, exact match with C #pragma pack(8))
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct DSUsbTopologyInfo {
    pub drive_index: u32,
    pub usb_generation_code: u32,
    pub negotiated_speed_mbps: u32,
    pub transport_code: u32,
    pub vendor_id: u16,
    pub product_id: u16,
    pub bcd_usb: u16,
    pub port_number: u8,
    pub probe_succeeded: u8,
    pub usb_version_label: [u8; 32],
    pub transport_label: [u8; 32],
    pub driver_service: [u8; 32],
    pub bridge_chipset: [u8; 64],
    pub pnp_device_id: [u8; 160],
}

// Compile-time Slicing-by-8 IEEE 802.3 CRC32 lookup tables (0xEDB88320)
const fn generate_crc32_slice8_table() -> [[u32; 256]; 8] {
    let mut tables = [[0u32; 256]; 8];
    let mut i = 0u32;
    while i < 256 {
        let mut c = i;
        let mut k = 0;
        while k < 8 {
            c = if (c & 1) != 0 {
                (c >> 1) ^ 0xEDB8_8320
            } else {
                c >> 1
            };
            k += 1;
        }
        tables[0][i as usize] = c;
        i += 1;
    }
    let mut t = 1usize;
    while t < 8 {
        let mut j = 0usize;
        while j < 256 {
            let prev = tables[t - 1][j];
            tables[t][j] = (prev >> 8) ^ tables[0][(prev & 0xFF) as usize];
            j += 1;
        }
        t += 1;
    }
    tables
}

static DS_CRC32_SLICE8: [[u32; 256]; 8] = generate_crc32_slice8_table();

#[inline(always)]
fn crc32_slice8_step8(crc: u32, chunk: &[u8]) -> u32 {
    let lo = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]) ^ crc;
    let hi = u32::from_le_bytes([chunk[4], chunk[5], chunk[6], chunk[7]]);
    DS_CRC32_SLICE8[7][(lo & 0xFF) as usize]
        ^ DS_CRC32_SLICE8[6][((lo >> 8) & 0xFF) as usize]
        ^ DS_CRC32_SLICE8[5][((lo >> 16) & 0xFF) as usize]
        ^ DS_CRC32_SLICE8[4][((lo >> 24) & 0xFF) as usize]
        ^ DS_CRC32_SLICE8[3][(hi & 0xFF) as usize]
        ^ DS_CRC32_SLICE8[2][((hi >> 8) & 0xFF) as usize]
        ^ DS_CRC32_SLICE8[1][((hi >> 16) & 0xFF) as usize]
        ^ DS_CRC32_SLICE8[0][((hi >> 24) & 0xFF) as usize]
}

#[inline(always)]
fn crc32_slice8_update(mut crc: u32, data: &[u8]) -> u32 {
    let chunks = data.chunks_exact(8);
    let rem = chunks.remainder();
    for c in chunks {
        crc = crc32_slice8_step8(crc, c);
    }
    for &byte in rem {
        crc = DS_CRC32_SLICE8[0][((crc ^ byte as u32) & 0xFF) as usize] ^ (crc >> 8);
    }
    crc
}

#[inline]
fn is_fatal_handle_error(code: u32) -> bool {
    matches!(code, 5 | 6 | 21 | 55 | 433 | 1167)
}

// Internal drive handle representation
pub struct DriveContext {
    pub drive_index: u32,
    pub sector_size: u32,
    pub max_transfer_bytes: u32,
    #[cfg(windows)]
    pub raw_handle: *mut c_void,
    #[cfg(windows)]
    dma_scratch: std::sync::Mutex<Option<AlignedSectorBuffer>>,
    last_byte_offset: std::sync::atomic::AtomicU64,
    offset_valid: std::sync::atomic::AtomicBool,
}

#[cfg(windows)]
struct AlignedSectorBuffer {
    ptr: *mut u8,
    layout: Option<std::alloc::Layout>,
    is_virtual_alloc: bool,
    len: usize,
}

#[cfg(windows)]
unsafe impl Send for AlignedSectorBuffer {}

#[cfg(windows)]
impl AlignedSectorBuffer {
    fn new(size: usize, align: usize) -> Option<Self> {
        let safe_size = size.max(1);
        if safe_size >= 65536 {
            use windows_sys::Win32::System::Memory::{
                VirtualAlloc, MEM_COMMIT, MEM_RESERVE, PAGE_READWRITE,
            };
            let vptr = unsafe {
                VirtualAlloc(
                    std::ptr::null(),
                    safe_size,
                    MEM_COMMIT | MEM_RESERVE,
                    PAGE_READWRITE,
                )
            } as *mut u8;
            if !vptr.is_null() {
                return Some(Self {
                    ptr: vptr,
                    layout: None,
                    is_virtual_alloc: true,
                    len: safe_size,
                });
            }
        }
        let safe_align = align.max(4096).next_power_of_two();
        let layout = std::alloc::Layout::from_size_align(safe_size, safe_align).ok()?;
        let ptr = unsafe { std::alloc::alloc_zeroed(layout) };
        if ptr.is_null() {
            return None;
        }
        Some(Self {
            ptr,
            layout: Some(layout),
            is_virtual_alloc: false,
            len: safe_size,
        })
    }

    fn new_unzeroed(size: usize, align: usize) -> Option<Self> {
        let safe_size = size.max(1);
        if safe_size >= 65536 {
            use windows_sys::Win32::System::Memory::{
                VirtualAlloc, MEM_COMMIT, MEM_RESERVE, PAGE_READWRITE,
            };
            let vptr = unsafe {
                VirtualAlloc(
                    std::ptr::null(),
                    safe_size,
                    MEM_COMMIT | MEM_RESERVE,
                    PAGE_READWRITE,
                )
            } as *mut u8;
            if !vptr.is_null() {
                return Some(Self {
                    ptr: vptr,
                    layout: None,
                    is_virtual_alloc: true,
                    len: safe_size,
                });
            }
        }
        let safe_align = align.max(4096).next_power_of_two();
        let layout = std::alloc::Layout::from_size_align(safe_size, safe_align).ok()?;
        let ptr = unsafe { std::alloc::alloc(layout) };
        if ptr.is_null() {
            return None;
        }
        Some(Self {
            ptr,
            layout: Some(layout),
            is_virtual_alloc: false,
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
        if self.ptr.is_null() {
            return;
        }
        if self.is_virtual_alloc {
            use windows_sys::Win32::System::Memory::{VirtualFree, MEM_RELEASE};
            unsafe {
                VirtualFree(self.ptr as *mut c_void, 0, MEM_RELEASE);
            }
        } else if let Some(layout) = self.layout {
            unsafe { std::alloc::dealloc(self.ptr, layout) };
        }
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
    detail.sector_size = ctx.sector_size.max(512);
    detail.physical_sector_size = detail.sector_size;
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
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let h_device = ctx.raw_handle;
        if h_device.is_null() {
            return false;
        }

        // 1. Query Geometry for capacity (with IOCTL_DISK_GET_LENGTH_INFO fallback)
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
            if geom.DiskSize > 0 {
                detail.total_capacity_bytes = geom.DiskSize as u64;
            }
            if geom.Geometry.BytesPerSector > 0 {
                detail.sector_size = geom.Geometry.BytesPerSector;
                detail.physical_sector_size = geom.Geometry.BytesPerSector;
            }
        }
        if detail.total_capacity_bytes == 0 {
            const IOCTL_DISK_GET_LENGTH_INFO_RAW: u32 = 0x0007_405C;
            let mut disk_len_bytes: i64 = 0;
            let mut len_ret: u32 = 0;
            if DeviceIoControl(
                h_device as _,
                IOCTL_DISK_GET_LENGTH_INFO_RAW,
                std::ptr::null(),
                0,
                &mut disk_len_bytes as *mut _ as _,
                std::mem::size_of::<i64>() as u32,
                &mut len_ret,
                std::ptr::null_mut(),
            ) != 0 && disk_len_bytes > 0
            {
                detail.total_capacity_bytes = disk_len_bytes as u64;
            }
        }

        // 1.1. Query StorageAccessAlignmentProperty (PropertyId = 6) for real physical sector size (4Kn/512e)
        let mut align_query: STORAGE_PROPERTY_QUERY = std::mem::zeroed();
        align_query.PropertyId = 6;
        align_query.QueryType = PropertyStandardQuery;
        let mut align_buf = [0u8; 32];
        let mut align_bytes: u32 = 0;
        if DeviceIoControl(
            h_device as _,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &align_query as *const _ as _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            align_buf.as_mut_ptr() as _,
            align_buf.len() as u32,
            &mut align_bytes,
            std::ptr::null_mut(),
        ) != 0 && align_bytes >= 24
        {
            let log_sec = u32::from_le_bytes([align_buf[16], align_buf[17], align_buf[18], align_buf[19]]);
            let phys_sec = u32::from_le_bytes([align_buf[20], align_buf[21], align_buf[22], align_buf[23]]);
            if log_sec >= 512 && log_sec.is_power_of_two() {
                detail.sector_size = log_sec;
            }
            if phys_sec >= 512 && phys_sec.is_power_of_two() {
                detail.physical_sector_size = phys_sec;
            }
        }

        // 1.2. Query StorageDeviceWriteCacheProperty (PropertyId = 4)
        let mut wc_query: STORAGE_PROPERTY_QUERY = std::mem::zeroed();
        wc_query.PropertyId = 4;
        wc_query.QueryType = PropertyStandardQuery;
        let mut wc_buf = [0u8; 32];
        let mut wc_bytes: u32 = 0;
        if DeviceIoControl(
            h_device as _,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &wc_query as *const _ as _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            wc_buf.as_mut_ptr() as _,
            wc_buf.len() as u32,
            &mut wc_bytes,
            std::ptr::null_mut(),
        ) != 0 && wc_bytes >= 16
        {
            let wc_enabled = u32::from_le_bytes([wc_buf[12], wc_buf[13], wc_buf[14], wc_buf[15]]);
            detail.is_write_cache_enabled = wc_enabled == 2;
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
            let valid_len = (bytes_returned as usize).min(buffer.len());
            if valid_len > 0 {
                buffer[valid_len - 1] = 0;
            }
            let desc = &*(buffer.as_ptr() as *const STORAGE_DEVICE_DESCRIPTOR);

            let vendor_str = if desc.VendorIdOffset > 0 && (desc.VendorIdOffset as usize) < valid_len {
                std::ffi::CStr::from_ptr(buffer.as_ptr().add(desc.VendorIdOffset as usize) as *const i8)
                    .to_string_lossy().trim().to_string()
            } else {
                String::new()
            };
            let product_str = if desc.ProductIdOffset > 0 && (desc.ProductIdOffset as usize) < valid_len {
                std::ffi::CStr::from_ptr(buffer.as_ptr().add(desc.ProductIdOffset as usize) as *const i8)
                    .to_string_lossy().trim().to_string()
            } else {
                String::new()
            };

            let combined_model = if !vendor_str.is_empty() && !product_str.is_empty() {
                if product_str.to_lowercase().starts_with(&vendor_str.to_lowercase()) {
                    product_str
                } else {
                    format!("{} {}", vendor_str, product_str)
                }
            } else if !product_str.is_empty() {
                product_str
            } else {
                vendor_str
            };

            if !combined_model.is_empty() {
                copy_str_to_fixed_bytes(&combined_model, &mut detail.model);
            }
            if desc.SerialNumberOffset > 0 && (desc.SerialNumberOffset as usize) < valid_len {
                let serial_str = std::ffi::CStr::from_ptr(buffer.as_ptr().add(desc.SerialNumberOffset as usize) as *const i8)
                    .to_string_lossy().trim().to_string();
                copy_str_to_fixed_bytes(&serial_str, &mut detail.serial_number);
            }
            if desc.ProductRevisionOffset > 0 && (desc.ProductRevisionOffset as usize) < valid_len {
                let rev_str = std::ffi::CStr::from_ptr(buffer.as_ptr().add(desc.ProductRevisionOffset as usize) as *const i8)
                    .to_string_lossy().trim().to_string();
                if !rev_str.is_empty() {
                    copy_str_to_fixed_bytes(&rev_str, &mut detail.firmware_rev);
                }
            }

            match desc.BusType as i32 {
                17 => { copy_str_to_fixed_bytes("NVMe", &mut detail.bus_type); detail.is_ssd = true; },
                11 => copy_str_to_fixed_bytes("SATA", &mut detail.bus_type),
                7 => copy_str_to_fixed_bytes("USB", &mut detail.bus_type),
                8 => copy_str_to_fixed_bytes("RAID", &mut detail.bus_type),
                3 => copy_str_to_fixed_bytes("ATA", &mut detail.bus_type),
                1 | 10 => copy_str_to_fixed_bytes("SCSI/SAS", &mut detail.bus_type),
                12 => { copy_str_to_fixed_bytes("SD", &mut detail.bus_type); detail.is_ssd = true; },
                13 => { copy_str_to_fixed_bytes("MMC", &mut detail.bus_type); detail.is_ssd = true; },
                16 => copy_str_to_fixed_bytes("Storage Spaces", &mut detail.bus_type),
                18 => { copy_str_to_fixed_bytes("SCM", &mut detail.bus_type); detail.is_ssd = true; },
                19 => { copy_str_to_fixed_bytes("UFS", &mut detail.bus_type); detail.is_ssd = true; },
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
        use windows_sys::Win32::System::Ioctl::{
            IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, DISK_GEOMETRY_EX,
            IOCTL_STORAGE_QUERY_PROPERTY, STORAGE_PROPERTY_QUERY,
            StorageAdapterProperty, PropertyStandardQuery, STORAGE_ADAPTER_DESCRIPTOR,
        };
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

        // Query StorageAdapterProperty to scale DMA window up to hardware MaximumTransferLength (1MB..4MB)
        let mut optimal_burst_bytes = 2u32 * 1024 * 1024;
        let mut adapter_query: STORAGE_PROPERTY_QUERY = std::mem::zeroed();
        adapter_query.PropertyId = StorageAdapterProperty;
        adapter_query.QueryType = PropertyStandardQuery;
        let mut adapter_desc: STORAGE_ADAPTER_DESCRIPTOR = std::mem::zeroed();
        let mut adapter_bytes: u32 = 0;
        if DeviceIoControl(
            handle as _,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &adapter_query as *const _ as _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            &mut adapter_desc as *mut _ as _,
            std::mem::size_of::<STORAGE_ADAPTER_DESCRIPTOR>() as u32,
            &mut adapter_bytes,
            std::ptr::null_mut(),
        ) != 0 && adapter_bytes >= 16 && adapter_desc.MaximumTransferLength >= 512 * 1024 {
            let aligned_max = (adapter_desc.MaximumTransferLength / detected_sector_size) * detected_sector_size;
            let clamped = aligned_max.clamp(1024 * 1024, 4 * 1024 * 1024);
            if clamped >= 1024 * 1024 {
                optimal_burst_bytes = clamped;
            }
        }

        if !out_sector_size.is_null() {
            *out_sector_size = detected_sector_size;
        }

        // Lazy DMA scratch allocation on first DS_ScanLbaBlock (avoids wasting 2-4MB on metadata/SMART-only handles)
        let ctx = Box::new(DriveContext {
            drive_index,
            sector_size: detected_sector_size,
            max_transfer_bytes: optimal_burst_bytes,
            raw_handle: handle as *mut c_void,
            dma_scratch: std::sync::Mutex::new(None),
            last_byte_offset: std::sync::atomic::AtomicU64::new(0),
            offset_valid: std::sync::atomic::AtomicBool::new(false),
        });
        Box::into_raw(ctx) as *mut c_void
    }

    #[cfg(not(windows))]
    {
        let ctx = Box::new(DriveContext {
            drive_index,
            sector_size: 512,
            max_transfer_bytes: 2 * 1024 * 1024,
            last_byte_offset: std::sync::atomic::AtomicU64::new(0),
            offset_valid: std::sync::atomic::AtomicBool::new(false),
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
        let safe_count = count.max(1);
        let byte_offset_u64 = match lba.checked_mul(sec_size as u64) {
            Some(off) if i64::try_from(off).is_ok() => off,
            _ => {
                let res = &mut *out_result;
                res.start_lba = lba;
                res.sector_count = safe_count as u64;
                res.latency_ms = 0.0;
                res.win32_error_code = 87;
                copy_str_to_fixed_bytes("ERROR_INVALID_PARAMETER", &mut res.error_mnemonic);
                res.status_code = DSSectorStatus::Bad as u32;
                return false;
            }
        };
        let total_bytes = (safe_count as u64).saturating_mul(sec_size as u64);
        let max_chunk = (ctx.max_transfer_bytes.max(sec_size) as usize).min(total_bytes as usize);
        let align = sec_size.max(4096) as usize;

        // Reuse VirtualAlloc DMA buffer when available; avoid zero-init overhead
        let mut scratch_guard = ctx.dma_scratch.lock().ok();
        let mut fallback_buf: Option<AlignedSectorBuffer> = None;
        let dma_buf_ptr: *mut u8 = if let Some(ref mut guard) = scratch_guard {
            let needs_alloc = match guard.as_ref() {
                Some(b) => b.len < max_chunk,
                None => true,
            };
            if needs_alloc {
                **guard = AlignedSectorBuffer::new_unzeroed(max_chunk.max(ctx.max_transfer_bytes as usize), align);
            }
            match guard.as_mut() {
                Some(b) => b.as_mut_ptr(),
                None => return false,
            }
        } else {
            fallback_buf = AlignedSectorBuffer::new_unzeroed(max_chunk, align);
            match fallback_buf.as_mut() {
                Some(b) => b.as_mut_ptr(),
                None => return false,
            }
        };

        // Skip redundant SetFilePointerEx syscall when reading sequentially from previous position
        let is_sequential = ctx.offset_valid.load(Ordering::Relaxed)
            && ctx.last_byte_offset.load(Ordering::Relaxed) == byte_offset_u64;
        let seek_ok = if is_sequential {
            1
        } else {
            SetFilePointerEx(
                ctx.raw_handle as _,
                byte_offset_u64 as i64,
                std::ptr::null_mut(),
                FILE_BEGIN,
            )
        };

        let mut remaining = total_bytes;
        let mut cursor = byte_offset_u64;
        let mut read_ok = if seek_ok != 0 { 1 } else { 0 };
        let mut last_err: u32 = 0;

        if seek_ok == 0 {
            ctx.offset_valid.store(false, Ordering::Relaxed);
            last_err = GetLastError();
        } else {
            while remaining > 0 {
                let chunk_bytes = remaining.min(ctx.max_transfer_bytes.max(sec_size) as u64) as u32;
                let mut bytes_read: u32 = 0;
                let ok = ReadFile(
                    ctx.raw_handle as _,
                    dma_buf_ptr,
                    chunk_bytes,
                    &mut bytes_read,
                    std::ptr::null_mut(),
                );
                if ok == 0 || bytes_read != chunk_bytes {
                    read_ok = 0;
                    last_err = if ok == 0 { GetLastError() } else { 38 };
                    ctx.offset_valid.store(false, Ordering::Relaxed);
                    break;
                }
                cursor = cursor.saturating_add(chunk_bytes as u64);
                remaining -= chunk_bytes as u64;
            }
            if read_ok != 0 {
                ctx.last_byte_offset.store(cursor, Ordering::Relaxed);
                ctx.offset_valid.store(true, Ordering::Relaxed);
            }
        }
        drop(fallback_buf);
        drop(scratch_guard);

        let elapsed = start.elapsed();
        let latency_ms = elapsed.as_secs_f64() * 1000.0;

        let res = &mut *out_result;
        res.start_lba = lba;
        res.sector_count = safe_count as u64;
        res.latency_ms = latency_ms;

        if seek_ok != 0 && read_ok != 0 {
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
            res.win32_error_code = last_err;
            copy_str_to_fixed_bytes(&format!("WIN32_ERR_{}", last_err), &mut res.error_mnemonic);
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
// 2.0b. DS_ScanLbaBlockWithPolicy (Policy-Tuned Thresholds & USB Retry Backoff)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_ScanLbaBlockWithPolicy(
    drive_handle: *mut c_void,
    lba: u64,
    count: u32,
    slow_threshold_ms: u32,
    critical_threshold_ms: u32,
    max_retries: u32,
    retry_delay_ms: u32,
    out_result: *mut DSBlockResult,
) -> bool {
    if drive_handle.is_null() || out_result.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        use std::sync::atomic::Ordering;
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::Storage::FileSystem::{SetFilePointerEx, ReadFile, FILE_BEGIN};

        let ctx = &*(drive_handle as *const DriveContext);
        let sec_size = ctx.sector_size.max(512);
        let safe_count = count.max(1);
        let byte_offset_u64 = match lba.checked_mul(sec_size as u64) {
            Some(off) if i64::try_from(off).is_ok() => off,
            _ => {
                let res = &mut *out_result;
                res.start_lba = lba;
                res.sector_count = safe_count as u64;
                res.latency_ms = 0.0;
                res.win32_error_code = 87;
                copy_str_to_fixed_bytes("ERROR_INVALID_PARAMETER", &mut res.error_mnemonic);
                res.status_code = DSSectorStatus::Bad as u32;
                return false;
            }
        };

        let total_bytes = (safe_count as u64).saturating_mul(sec_size as u64);
        let max_chunk = (ctx.max_transfer_bytes.max(sec_size) as usize).min(total_bytes as usize);
        let align = sec_size.max(4096) as usize;

        let mut scratch_guard = ctx.dma_scratch.lock().ok();
        let mut fallback_buf: Option<AlignedSectorBuffer> = None;
        let dma_buf_ptr: *mut u8 = if let Some(ref mut guard) = scratch_guard {
            let needs_alloc = match guard.as_ref() {
                Some(b) => b.len < max_chunk,
                None => true,
            };
            if needs_alloc {
                **guard = AlignedSectorBuffer::new_unzeroed(max_chunk.max(ctx.max_transfer_bytes as usize), align);
            }
            match guard.as_mut() {
                Some(b) => b.as_mut_ptr(),
                None => return false,
            }
        } else {
            fallback_buf = AlignedSectorBuffer::new_unzeroed(max_chunk, align);
            match fallback_buf.as_mut() {
                Some(b) => b.as_mut_ptr(),
                None => return false,
            }
        };

        let safe_retries = max_retries.min(5);
        let safe_delay_ms = retry_delay_ms.min(2000) as u64;
        let slow_limit = if slow_threshold_ms > 0 { slow_threshold_ms as f64 } else { 50.0 };
        let crit_limit = if critical_threshold_ms > slow_threshold_ms {
            critical_threshold_ms as f64
        } else {
            slow_limit * 3.0
        };

        let start = Instant::now();
        let mut read_ok = false;
        let mut last_err: u32 = 0;

        for attempt in 0..=safe_retries {
            if attempt > 0 {
                ctx.offset_valid.store(false, Ordering::Relaxed);
                if safe_delay_ms > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(safe_delay_ms));
                }
            }

            let is_sequential = ctx.offset_valid.load(Ordering::Relaxed)
                && ctx.last_byte_offset.load(Ordering::Relaxed) == byte_offset_u64;
            let seek_ok = if is_sequential {
                1
            } else {
                SetFilePointerEx(
                    ctx.raw_handle as _,
                    byte_offset_u64 as i64,
                    std::ptr::null_mut(),
                    FILE_BEGIN,
                )
            };

            if seek_ok == 0 {
                ctx.offset_valid.store(false, Ordering::Relaxed);
                last_err = GetLastError();
                read_ok = false;
            } else {
                let mut remaining = total_bytes;
                let mut cursor = byte_offset_u64;
                read_ok = true;
                last_err = 0;

                while remaining > 0 {
                    let chunk_bytes = remaining.min(ctx.max_transfer_bytes.max(sec_size) as u64) as u32;
                    let mut bytes_read: u32 = 0;
                    let ok = ReadFile(
                        ctx.raw_handle as _,
                        dma_buf_ptr,
                        chunk_bytes,
                        &mut bytes_read,
                        std::ptr::null_mut(),
                    );
                    if ok == 0 || bytes_read != chunk_bytes {
                        read_ok = false;
                        last_err = if ok == 0 { GetLastError() } else { 38 };
                        ctx.offset_valid.store(false, Ordering::Relaxed);
                        break;
                    }
                    cursor = cursor.saturating_add(chunk_bytes as u64);
                    remaining -= chunk_bytes as u64;
                }

                if read_ok {
                    ctx.last_byte_offset.store(cursor, Ordering::Relaxed);
                    ctx.offset_valid.store(true, Ordering::Relaxed);
                    break;
                }
            }

            let is_transient_usb = matches!(last_err, 21 | 31 | 121 | 170 | 433 | 1117 | 1167);
            if !is_transient_usb {
                break;
            }
        }

        drop(fallback_buf);
        drop(scratch_guard);

        let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
        let res = &mut *out_result;
        res.start_lba = lba;
        res.sector_count = safe_count as u64;
        res.latency_ms = latency_ms;

        if read_ok {
            res.win32_error_code = 0;
            res.status_code = if latency_ms < slow_limit * 0.35 {
                copy_str_to_fixed_bytes("OK", &mut res.error_mnemonic);
                DSSectorStatus::Good as u32
            } else if latency_ms < slow_limit {
                copy_str_to_fixed_bytes("OK", &mut res.error_mnemonic);
                DSSectorStatus::Normal as u32
            } else if latency_ms < crit_limit {
                copy_str_to_fixed_bytes("SLOW", &mut res.error_mnemonic);
                DSSectorStatus::Slow as u32
            } else {
                copy_str_to_fixed_bytes("CRITICAL_LATENCY", &mut res.error_mnemonic);
                DSSectorStatus::Critical as u32
            };
            true
        } else {
            res.win32_error_code = last_err;
            let mnemonic = match last_err {
                23 => "CRC (Data Error)",
                27 => "IDNF (Sector Not Found)",
                121 => "USB_TIMEOUT",
                5 => "ACCESS_DENIED",
                _ => "UNC (Uncorrectable Error)",
            };
            copy_str_to_fixed_bytes(mnemonic, &mut res.error_mnemonic);
            res.status_code = DSSectorStatus::Bad as u32;
            false
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (
            lba,
            count,
            slow_threshold_ms,
            critical_threshold_ms,
            max_retries,
            retry_delay_ms,
            out_result,
        );
        false
    }
}

// ---------------------------------------------------------------------------
// 2.1. DS_ReadRawSector (Direct Zero-Copy fast path when caller buffer is sector-aligned)
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
        let byte_offset = match lba.checked_mul(sec_size as u64).and_then(|v| i64::try_from(v).ok()) {
            Some(off) => off,
            None => return false,
        };
        ctx.offset_valid.store(false, Ordering::Relaxed);

        let seek_ok = SetFilePointerEx(
            ctx.raw_handle as _,
            byte_offset,
            std::ptr::null_mut(),
            FILE_BEGIN,
        );
        if seek_ok == 0 {
            return false;
        }

        // Zero-Copy fast path: if caller buffer is page/sector-aligned & sector-multiple, DMA straight into out_buffer
        let align = sec_size.max(4096);
        let is_ptr_aligned = ((out_buffer as usize) & (align - 1)) == 0;
        let is_len_multiple = (buffer_size as usize) % sec_size == 0;
        if is_ptr_aligned && is_len_multiple {
            let mut bytes_read: u32 = 0;
            let read_ok = ReadFile(
                ctx.raw_handle as _,
                out_buffer,
                buffer_size,
                &mut bytes_read,
                std::ptr::null_mut(),
            );
            if read_ok != 0 && bytes_read == buffer_size {
                return true;
            }
        }

        // Aligned DMA fallback via pre-allocated unzeroed buffer
        let aligned_read_len = (buffer_size as usize).div_ceil(sec_size) * sec_size;
        let mut aligned_buf = match AlignedSectorBuffer::new_unzeroed(aligned_read_len, align) {
            Some(b) => b,
            None => return false,
        };
        let mut bytes_read: u32 = 0;
        let _ = SetFilePointerEx(ctx.raw_handle as _, byte_offset, std::ptr::null_mut(), FILE_BEGIN);
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
        false
    }

    #[cfg(not(windows))]
    {
        let _ = (lba, out_buffer, buffer_size);
        false
    }
}

// ---------------------------------------------------------------------------
// 3. DS_AdaptiveScanChunk (Adaptive Burst & O(log K) Binary Subdivision Seeker)
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

        if !ok && is_fatal_handle_error(temp_result.win32_error_code) {
            if !out_bad_results.is_null() && detected < max_bad_results {
                *out_bad_results.add(detected as usize) = temp_result;
            }
            *out_detected_bad_count = detected.saturating_add(1);
            return false;
        }

        if ok && temp_result.status_code < (DSSectorStatus::Critical as u32) {
            current_lba += sectors_to_read as u64;
            continue;
        }

        // Iterative LIFO binary subdivision down to 1-sector resolution (O(log K) syscalls)
        let mut stack: [(u64, u32); 64] = [(0, 0); 64];
        let mut sp = 0usize;
        if sectors_to_read > 4 {
            let half = sectors_to_read >> 1;
            stack[sp] = (current_lba + half as u64, sectors_to_read - half);
            sp += 1;
            stack[sp] = (current_lba, half);
            sp += 1;
        } else {
            stack[sp] = (current_lba, sectors_to_read);
            sp += 1;
        }

        while sp > 0 {
            sp -= 1;
            let (sub_start, sub_count) = stack[sp];
            if sub_count <= 4 {
                for k in 0..sub_count {
                    let mut sub_result = temp_result;
                    let sub_ok = DS_ScanLbaBlock(drive_handle, sub_start + k as u64, 1, &mut sub_result);
                    if !sub_ok && is_fatal_handle_error(sub_result.win32_error_code) {
                        if !out_bad_results.is_null() && detected < max_bad_results {
                            *out_bad_results.add(detected as usize) = sub_result;
                        }
                        *out_detected_bad_count = detected.saturating_add(1);
                        return false;
                    }
                    if !sub_ok || sub_result.status_code >= (DSSectorStatus::Critical as u32) {
                        if !out_bad_results.is_null() && detected < max_bad_results {
                            *out_bad_results.add(detected as usize) = sub_result;
                        }
                        detected += 1;
                    }
                }
            } else {
                let mut sub_res = temp_result;
                let sub_ok = DS_ScanLbaBlock(drive_handle, sub_start, sub_count, &mut sub_res);
                if !sub_ok && is_fatal_handle_error(sub_res.win32_error_code) {
                    if !out_bad_results.is_null() && detected < max_bad_results {
                        *out_bad_results.add(detected as usize) = sub_res;
                    }
                    *out_detected_bad_count = detected.saturating_add(1);
                    return false;
                }
                if sub_ok && sub_res.status_code < (DSSectorStatus::Critical as u32) {
                    continue; // Healthy half skipped in 1 syscall
                }
                if sp + 2 <= stack.len() {
                    let half = sub_count >> 1;
                    stack[sp] = (sub_start + half as u64, sub_count - half);
                    sp += 1;
                    stack[sp] = (sub_start, half);
                    sp += 1;
                } else {
                    for k in 0..sub_count {
                        let mut sub_result = temp_result;
                        let s_ok = DS_ScanLbaBlock(drive_handle, sub_start + k as u64, 1, &mut sub_result);
                        if !s_ok && is_fatal_handle_error(sub_result.win32_error_code) {
                            if !out_bad_results.is_null() && detected < max_bad_results {
                                *out_bad_results.add(detected as usize) = sub_result;
                            }
                            *out_detected_bad_count = detected.saturating_add(1);
                            return false;
                        }
                        if !s_ok || sub_result.status_code >= (DSSectorStatus::Critical as u32) {
                            if !out_bad_results.is_null() && detected < max_bad_results {
                                *out_bad_results.add(detected as usize) = sub_result;
                            }
                            detected += 1;
                        }
                    }
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
            SMART_GET_VERSION, SMART_RCV_DRIVE_DATA,
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
            // Read thresholds (ATA SMART subcommand 0xD1) using 0xA0 primary (AHCI/USB-SATA compliant)
            let mut thresholds = [0u8; 256];
            let mut thresh_scip: SENDCMDINPARAMS = std::mem::zeroed();
            thresh_scip.cBufferSize = 512;
            thresh_scip.irDriveRegs.bFeaturesReg = 0xD1; // READ_THRESHOLDS
            thresh_scip.irDriveRegs.bSectorCountReg = 1;
            thresh_scip.irDriveRegs.bSectorNumberReg = 1;
            thresh_scip.irDriveRegs.bCylLowReg = 0x4F;
            thresh_scip.irDriveRegs.bCylHighReg = 0xC2;
            thresh_scip.irDriveRegs.bDriveHeadReg = 0xA0;
            thresh_scip.irDriveRegs.bCommandReg = 0xB0;

            let thresh_out_size = std::mem::size_of::<SENDCMDOUTPARAMS>() + 512;
            let mut thresh_out_buf = vec![0u8; thresh_out_size];
            let mut thresh_bytes: u32 = 0;
            let mut thresh_ok = DeviceIoControl(
                h_device as _,
                SMART_RCV_DRIVE_DATA,
                &thresh_scip as *const _ as _,
                std::mem::size_of::<SENDCMDINPARAMS>() as u32,
                thresh_out_buf.as_mut_ptr() as _,
                thresh_out_size as u32,
                &mut thresh_bytes,
                std::ptr::null_mut(),
            );
            if (thresh_ok == 0 || thresh_bytes < 528) && (ctx.drive_index & 1) != 0 {
                thresh_out_buf.fill(0);
                thresh_bytes = 0;
                thresh_scip.irDriveRegs.bDriveHeadReg = 0xB0;
                thresh_ok = DeviceIoControl(
                    h_device as _,
                    SMART_RCV_DRIVE_DATA,
                    &thresh_scip as *const _ as _,
                    std::mem::size_of::<SENDCMDINPARAMS>() as u32,
                    thresh_out_buf.as_mut_ptr() as _,
                    thresh_out_size as u32,
                    &mut thresh_bytes,
                    std::ptr::null_mut(),
                );
            }
            if thresh_ok != 0 && thresh_bytes >= 528 {
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

            // Request Attribute Values (ATA SMART subcommand 0xD0 = READ_ATTRIBUTES)
            let mut scip: SENDCMDINPARAMS = std::mem::zeroed();
            scip.cBufferSize = 512;
            scip.irDriveRegs.bFeaturesReg = 0xD0; // READ_ATTRIBUTES
            scip.irDriveRegs.bSectorCountReg = 1;
            scip.irDriveRegs.bSectorNumberReg = 1;
            scip.irDriveRegs.bCylLowReg = 0x4F;
            scip.irDriveRegs.bCylHighReg = 0xC2;
            scip.irDriveRegs.bDriveHeadReg = 0xA0;
            scip.irDriveRegs.bCommandReg = 0xB0; // SMART_CMD

            let out_buffer_size = std::mem::size_of::<SENDCMDOUTPARAMS>() + 512;
            let mut out_buffer = vec![0u8; out_buffer_size];

            let mut ok = DeviceIoControl(
                h_device as _,
                SMART_RCV_DRIVE_DATA,
                &scip as *const _ as _,
                std::mem::size_of::<SENDCMDINPARAMS>() as u32,
                out_buffer.as_mut_ptr() as _,
                out_buffer_size as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            );
            if (ok == 0 || bytes_returned < 528) && (ctx.drive_index & 1) != 0 {
                out_buffer.fill(0);
                bytes_returned = 0;
                scip.irDriveRegs.bDriveHeadReg = 0xB0;
                ok = DeviceIoControl(
                    h_device as _,
                    SMART_RCV_DRIVE_DATA,
                    &scip as *const _ as _,
                    std::mem::size_of::<SENDCMDINPARAMS>() as u32,
                    out_buffer.as_mut_ptr() as _,
                    out_buffer_size as u32,
                    &mut bytes_returned,
                    std::ptr::null_mut(),
                );
            }

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

    let mut valid_temp_c: u32 = 0;

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
                if t > 0 && t < 150 && (e.attribute_id == 0xC2 || valid_temp_c == 0) {
                    valid_temp_c = t;
                }
            }
            _ => {}
        }
    }

    report.temperature_celsius = valid_temp_c;
    if valid_temp_c > 55 {
        report.reliability_score -= ((valid_temp_c - 55) as f64) * 2.0;
    }

    report.reliability_score = report.reliability_score.clamp(0.0, 100.0);

    let grade = match report.reliability_score {
        s if s >= 95.0 => "EXCELLENT",
        s if s >= 80.0 => "GOOD",
        s if s >= 50.0 => "WARNING",
        _ => "CRITICAL",
    };
    copy_str_to_fixed_bytes(grade, &mut report.overall_grade);

    let norm_score = report.reliability_score / 100.0;
    let base_days = 10.0 + (1815.0 * norm_score.powf(2.2));
    let thermal_factor = if report.temperature_celsius > 55 {
        (1.0 - ((report.temperature_celsius - 55) as f64) * 0.03).max(0.35)
    } else {
        1.0
    };
    let poh_aging_factor = if report.total_power_on_hours > 35_000 {
        (1.0 - ((report.total_power_on_hours - 35_000) as f64) / 120_000.0).max(0.55)
    } else {
        1.0
    };
    let active_fault_factor = if report.pending_sectors > 0 || report.uncorrectable_errors > 0 {
        let active_faults = (report.pending_sectors + report.uncorrectable_errors) as f64;
        (1.0 / (1.0 + active_faults * 0.35)).max(0.15)
    } else {
        1.0
    };
    let computed_days = (base_days * thermal_factor * poh_aging_factor * active_fault_factor).round() as i32;
    report.estimated_remaining_days = computed_days.clamp(1, 3650) as u32;

    true
}

// ---------------------------------------------------------------------------
// 6. DS_CalculateParityChecksum (Fast ECC Parity & 256-entry LUT CRC32)
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

    let mut parity: u64 = 0;
    let mut crc: u32 = 0xFFFFFFFF;
    let chunks = slice.chunks_exact(8);
    let remainder = chunks.remainder();

    for chunk in chunks {
        let val = u64::from_le_bytes(chunk.try_into().unwrap());
        parity ^= val;
        crc = crc32_slice8_step8(crc, chunk);
    }

    if !remainder.is_empty() {
        let mut rem_buf = [0u8; 8];
        rem_buf[..remainder.len()].copy_from_slice(remainder);
        parity ^= u64::from_le_bytes(rem_buf);
        crc = crc32_slice8_update(crc, remainder);
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
        ctx.offset_valid.store(false, Ordering::Relaxed);
        let sec_size = ctx.sector_size.max(512);
        let safe_count = count.max(1);
        let start_offset = match bad_lba.checked_mul(sec_size as u64).and_then(|v| i64::try_from(v).ok()) {
            Some(off) => off,
            None => {
                *out_recovered_status = 0;
                return false;
            }
        };
        let total_bytes_u64 = match (safe_count as u64).checked_mul(sec_size as u64) {
            Some(b) if (start_offset as u64).checked_add(b).and_then(|end| i64::try_from(end).ok()).is_some() => b,
            _ => {
                *out_recovered_status = 0;
                return false;
            }
        };

        let max_batch_bytes = ctx.max_transfer_bytes.max(sec_size).min(4 * 1024 * 1024);
        let buf_alloc_size = total_bytes_u64.min(max_batch_bytes as u64) as usize;
        let mut aligned_buf = match AlignedSectorBuffer::new(buf_alloc_size, sec_size.max(4096) as usize) {
            Some(b) => b,
            None => {
                *out_recovered_status = 0;
                return false;
            }
        };

        let mut remaining = total_bytes_u64;
        let mut cur_offset = start_offset;
        let mut all_ok = true;

        while remaining > 0 {
            let batch_bytes = remaining.min(buf_alloc_size as u64) as u32;
            // Zero DMA buffer prior to WriteFile
            std::ptr::write_bytes(aligned_buf.as_mut_ptr(), 0x00, batch_bytes as usize);

            let seek_ok = SetFilePointerEx(
                ctx.raw_handle as _,
                cur_offset,
                std::ptr::null_mut(),
                FILE_BEGIN,
            );
            if seek_ok == 0 {
                all_ok = false;
                break;
            }

            let mut bytes_written: u32 = 0;
            let write_ok = WriteFile(
                ctx.raw_handle as _,
                aligned_buf.as_ptr(),
                batch_bytes,
                &mut bytes_written,
                std::ptr::null_mut(),
            );
            if write_ok == 0 || bytes_written != batch_bytes {
                all_ok = false;
                break;
            }

            // Poison buffer with 0xA5 sentinel before ReadFile so cached zeros never give false pass
            std::ptr::write_bytes(aligned_buf.as_mut_ptr(), 0xA5, batch_bytes as usize);

            let reseek_ok = SetFilePointerEx(
                ctx.raw_handle as _,
                cur_offset,
                std::ptr::null_mut(),
                FILE_BEGIN,
            );
            if reseek_ok == 0 {
                all_ok = false;
                break;
            }

            let mut bytes_read: u32 = 0;
            let read_ok = ReadFile(
                ctx.raw_handle as _,
                aligned_buf.as_mut_ptr(),
                batch_bytes,
                &mut bytes_read,
                std::ptr::null_mut(),
            );
            let read_slice = &aligned_buf.as_slice()[..batch_bytes as usize];
            if read_ok == 0 || bytes_read != batch_bytes || !read_slice.iter().all(|&b| b == 0) {
                all_ok = false;
                break;
            }

            cur_offset = match cur_offset.checked_add(batch_bytes as i64) {
                Some(next) => next,
                None => {
                    all_ok = false;
                    break;
                }
            };
            remaining -= batch_bytes as u64;
        }

        if all_ok {
            *out_recovered_status = 1; // 1 = Zero-fill & read-back verification succeeded
            return true;
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

    // Single-pass 64-bit fused Zero-Check + Parity + 256-entry LUT CRC32 fallback
    let mut parity: u64 = 0;
    let mut zero_acc: u64 = 0;
    let mut crc: u32 = 0xFFFFFFFF;
    let chunks = slice.chunks_exact(8);
    let remainder = chunks.remainder();

    for chunk in chunks {
        let val = u64::from_le_bytes(chunk.try_into().unwrap());
        zero_acc |= val;
        parity ^= val;
        crc = crc32_slice8_step8(crc, chunk);
    }

    if !remainder.is_empty() {
        let mut rem_buf = [0u8; 8];
        rem_buf[..remainder.len()].copy_from_slice(remainder);
        let val = u64::from_le_bytes(rem_buf);
        zero_acc |= val;
        parity ^= val;
        crc = crc32_slice8_update(crc, remainder);
    }

    *out_is_all_zeros = zero_acc == 0;
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

    // Slicing-by-8 IEEE 802.3 CRC32 LUT
    let crc = crc32_slice8_update(0xFFFFFFFF, slice);

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
                let status: u32;
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
            for i in 0..(count.max(0) as usize).min(entries.len()) {
                let id = entries[i].attribute_id;
                if id == 0xC2 || id == 0xBE {
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
            ctx.offset_valid.store(false, Ordering::Relaxed);
            if let Some(offset) = target_lba.checked_mul(sector_bytes as u64).and_then(|v| i64::try_from(v).ok()) {
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
        let starting_offset = match lba.checked_mul(sec_size as u64).and_then(|v| i64::try_from(v).ok()) {
            Some(off) => off,
            None => {
                let res = &mut *out_result;
                res.start_lba = lba;
                res.sector_count = count as u64;
                res.latency_ms = 0.0;
                res.win32_error_code = 87;
                copy_str_to_fixed_bytes("VERIFY_ERR_INVALID_LBA", &mut res.error_mnemonic);
                res.status_code = DSSectorStatus::Bad as u32;
                return false;
            }
        };
        let verify_info = VerifyInformation {
            starting_offset,
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
        scip.irDriveRegs.bDriveHeadReg = 0xA0;
        scip.irDriveRegs.bCommandReg = 0xB0; // SMART_CMD

        let mut out_params: SENDCMDOUTPARAMS = std::mem::zeroed();
        let mut bytes_returned: u32 = 0;
        let mut ok = DeviceIoControl(
            ctx.raw_handle as _,
            SMART_SEND_DRIVE_COMMAND,
            &scip as *const _ as _,
            std::mem::size_of::<SENDCMDINPARAMS>() as u32,
            &mut out_params as *mut _ as _,
            std::mem::size_of::<SENDCMDOUTPARAMS>() as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        );
        if ok == 0 && (ctx.drive_index & 1) != 0 {
            out_params = std::mem::zeroed();
            bytes_returned = 0;
            scip.irDriveRegs.bDriveHeadReg = 0xB0;
            ok = DeviceIoControl(
                ctx.raw_handle as _,
                SMART_SEND_DRIVE_COMMAND,
                &scip as *const _ as _,
                std::mem::size_of::<SENDCMDINPARAMS>() as u32,
                &mut out_params as *mut _ as _,
                std::mem::size_of::<SENDCMDOUTPARAMS>() as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            );
        }
        ok != 0
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
            SMART_RCV_DRIVE_DATA, SENDCMDINPARAMS, SENDCMDOUTPARAMS,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }

        let mut scip: SENDCMDINPARAMS = std::mem::zeroed();
        scip.cBufferSize = 512;
        scip.irDriveRegs.bFeaturesReg = 0xD0; // READ_ATTRIBUTES
        scip.irDriveRegs.bSectorCountReg = 1;
        scip.irDriveRegs.bSectorNumberReg = 1;
        scip.irDriveRegs.bCylLowReg = 0x4F;
        scip.irDriveRegs.bCylHighReg = 0xC2;
        scip.irDriveRegs.bDriveHeadReg = 0xA0;
        scip.irDriveRegs.bCommandReg = 0xB0;

        let out_size = std::mem::size_of::<SENDCMDOUTPARAMS>() + 512;
        let mut out_vec_or_buf = vec![0u8; out_size];
        let mut bytes_returned: u32 = 0;

        let mut ok = DeviceIoControl(
            ctx.raw_handle as _,
            SMART_RCV_DRIVE_DATA,
            &scip as *const _ as _,
            std::mem::size_of::<SENDCMDINPARAMS>() as u32,
            out_vec_or_buf.as_mut_ptr() as _,
            out_size as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        );
        if (ok == 0 || bytes_returned < 528) && (ctx.drive_index & 1) != 0 {
            out_vec_or_buf.fill(0);
            bytes_returned = 0;
            scip.irDriveRegs.bDriveHeadReg = 0xB0;
            ok = DeviceIoControl(
                ctx.raw_handle as _,
                SMART_RCV_DRIVE_DATA,
                &scip as *const _ as _,
                std::mem::size_of::<SENDCMDINPARAMS>() as u32,
                out_vec_or_buf.as_mut_ptr() as _,
                out_size as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            );
        }
        if ok == 0 || bytes_returned < 528 {
            return false;
        }
        let out_buf = out_vec_or_buf;

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
// 16. ATA Pass-Through & NVMe Identify / Features / Power / S.M.A.R.T. Logs
// ---------------------------------------------------------------------------
#[cfg(windows)]
#[repr(C)]
struct DSAtaPassThroughEx {
    length: u16,
    ata_flags: u16,
    path_id: u8,
    target_id: u8,
    lun: u8,
    reserved_as_uchar: u8,
    data_transfer_length: u32,
    time_out_value: u32,
    reserved_as_ulong: u32,
    data_buffer_offset: usize,
    previous_task_file: [u8; 8],
    current_task_file: [u8; 8],
}

#[cfg(windows)]
#[repr(C)]
struct DSAtaPassThroughExWithBuf {
    apt: DSAtaPassThroughEx,
    data: [u8; 512],
}

#[cfg(windows)]
const DS_IOCTL_ATA_PASS_THROUGH: u32 = 0x0004_D02C;
#[cfg(windows)]
const DS_ATA_FLAGS_DRDY_REQUIRED: u16 = 0x01;
#[cfg(windows)]
const DS_ATA_FLAGS_DATA_IN: u16 = 0x02;

#[cfg(windows)]
unsafe fn ds_exec_ata_passthrough(
    h_device: *mut c_void,
    ata_flags: u16,
    task_file: [u8; 8],
    transfer_len: u32,
    out_task_file: Option<&mut [u8; 8]>,
    out_data: Option<&mut [u8; 512]>,
) -> bool {
    use windows_sys::Win32::System::IO::DeviceIoControl;

    if h_device.is_null() {
        return false;
    }

    let mut req: DSAtaPassThroughExWithBuf = std::mem::zeroed();
    req.apt.length = std::mem::size_of::<DSAtaPassThroughEx>() as u16;
    req.apt.ata_flags = ata_flags;
    req.apt.data_transfer_length = transfer_len;
    req.apt.time_out_value = 10;
    req.apt.data_buffer_offset = if transfer_len > 0 {
        std::mem::offset_of!(DSAtaPassThroughExWithBuf, data)
    } else {
        0
    };
    req.apt.current_task_file = task_file;

    let total_size = if transfer_len > 0 {
        std::mem::size_of::<DSAtaPassThroughExWithBuf>() as u32
    } else {
        std::mem::size_of::<DSAtaPassThroughEx>() as u32
    };

    let mut bytes_returned: u32 = 0;
    let ok = DeviceIoControl(
        h_device as _,
        DS_IOCTL_ATA_PASS_THROUGH,
        &req as *const _ as _,
        total_size,
        &mut req as *mut _ as _,
        total_size,
        &mut bytes_returned,
        std::ptr::null_mut(),
    );

    if ok == 0 {
        return false;
    }

    // Check ATA Status register (task_file[6]) bit 0 (ERR)
    if (req.apt.current_task_file[6] & 0x01) != 0 {
        return false;
    }

    if let Some(tf_out) = out_task_file {
        *tf_out = req.apt.current_task_file;
    }
    if let Some(buf_out) = out_data {
        *buf_out = req.data;
    }
    true
}

#[no_mangle]
pub unsafe extern "system" fn DS_AtaIdentifyDevice(
    drive_handle: *mut c_void,
    out_512_buf: *mut u8,
) -> bool {
    if drive_handle.is_null() || out_512_buf.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Ioctl::{
            SMART_RCV_DRIVE_DATA, SENDCMDINPARAMS, SENDCMDOUTPARAMS,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }

        // 1. Primary: IOCTL_ATA_PASS_THROUGH with IDENTIFY DEVICE (0xEC)
        let mut data_buf = [0u8; 512];
        let tf = [0, 0, 0, 0, 0, 0xA0, 0xEC, 0];
        if ds_exec_ata_passthrough(
            ctx.raw_handle,
            DS_ATA_FLAGS_DRDY_REQUIRED | DS_ATA_FLAGS_DATA_IN,
            tf,
            512,
            None,
            Some(&mut data_buf),
        ) {
            std::ptr::copy_nonoverlapping(data_buf.as_ptr(), out_512_buf, 512);
            return true;
        }

        // 2. Fallback: SMART_RCV_DRIVE_DATA with ID_CMD (0xEC)
        let mut scip: SENDCMDINPARAMS = std::mem::zeroed();
        scip.cBufferSize = 512;
        scip.irDriveRegs.bSectorCountReg = 1;
        scip.irDriveRegs.bSectorNumberReg = 1;
        scip.irDriveRegs.bDriveHeadReg = 0xA0;
        scip.irDriveRegs.bCommandReg = 0xEC; // ID_CMD

        let out_size = std::mem::size_of::<SENDCMDOUTPARAMS>() + 512;
        let mut out_vec = vec![0u8; out_size];
        let mut bytes_returned: u32 = 0;

        let mut ok = DeviceIoControl(
            ctx.raw_handle as _,
            SMART_RCV_DRIVE_DATA,
            &scip as *const _ as _,
            std::mem::size_of::<SENDCMDINPARAMS>() as u32,
            out_vec.as_mut_ptr() as _,
            out_size as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        );
        if (ok == 0 || bytes_returned < 528) && (ctx.drive_index & 1) != 0 {
            out_vec.fill(0);
            bytes_returned = 0;
            scip.irDriveRegs.bDriveHeadReg = 0xB0;
            ok = DeviceIoControl(
                ctx.raw_handle as _,
                SMART_RCV_DRIVE_DATA,
                &scip as *const _ as _,
                std::mem::size_of::<SENDCMDINPARAMS>() as u32,
                out_vec.as_mut_ptr() as _,
                out_size as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            );
        }
        if ok != 0 && bytes_returned >= 528 {
            let p_out = out_vec.as_ptr() as *const SENDCMDOUTPARAMS;
            std::ptr::copy_nonoverlapping((*p_out).bBuffer.as_ptr(), out_512_buf, 512);
            return true;
        }

        false
    }

    #[cfg(not(windows))]
    {
        false
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_GetNvmeIdentifyController(
    drive_handle: *mut c_void,
    out_4096_buf: *mut u8,
) -> bool {
    if drive_handle.is_null() || out_4096_buf.is_null() {
        return false;
    }

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
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }

        const IDENTIFY_SIZE: usize = 4096;
        let query_header_size = std::mem::size_of::<STORAGE_PROPERTY_QUERY>()
            + std::mem::size_of::<STORAGE_PROTOCOL_SPECIFIC_DATA>();
        let total_size = query_header_size + IDENTIFY_SIZE;
        let mut buffer = vec![0u8; total_size];
        let query_offset = std::mem::offset_of!(STORAGE_PROPERTY_QUERY, AdditionalParameters);

        let try_prop = |prop_id: i32, buf: &mut [u8]| -> bool {
            buf.fill(0);
            let q = &mut *(buf.as_mut_ptr() as *mut STORAGE_PROPERTY_QUERY);
            q.PropertyId = prop_id;
            q.QueryType = PropertyStandardQuery;

            let pdata = &mut *(buf.as_mut_ptr().add(query_offset) as *mut STORAGE_PROTOCOL_SPECIFIC_DATA);
            pdata.ProtocolType = ProtocolTypeNvme;
            pdata.DataType = 1; // NVMeDataTypeIdentify
            pdata.ProtocolDataRequestValue = 1; // CNS = 01h (Identify Controller)
            pdata.ProtocolDataRequestSubValue = 0;
            pdata.ProtocolDataOffset = std::mem::size_of::<STORAGE_PROTOCOL_SPECIFIC_DATA>() as u32;
            pdata.ProtocolDataLength = IDENTIFY_SIZE as u32;

            let mut bytes_returned: u32 = 0;
            DeviceIoControl(
                ctx.raw_handle as _,
                IOCTL_STORAGE_QUERY_PROPERTY,
                buf.as_ptr() as _,
                buf.len() as u32,
                buf.as_mut_ptr() as _,
                buf.len() as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            ) != 0 && bytes_returned >= std::mem::size_of::<STORAGE_PROTOCOL_DATA_DESCRIPTOR>() as u32
        };

        if try_prop(StorageDeviceProtocolSpecificProperty, &mut buffer)
            || try_prop(StorageAdapterProtocolSpecificProperty, &mut buffer)
        {
            let desc = &*(buffer.as_ptr() as *const STORAGE_PROTOCOL_DATA_DESCRIPTOR);
            let data_offset = desc.ProtocolSpecificData.ProtocolDataOffset as usize;
            let data_len = desc.ProtocolSpecificData.ProtocolDataLength as usize;
            let base_ptr = (&desc.ProtocolSpecificData as *const STORAGE_PROTOCOL_SPECIFIC_DATA) as usize;
            let buf_start = buffer.as_ptr() as usize;
            let rel_start = (base_ptr - buf_start) + data_offset;

            if data_offset > 0 && data_len >= 512 && rel_start + data_len.min(IDENTIFY_SIZE) <= buffer.len() {
                let copy_len = data_len.min(IDENTIFY_SIZE);
                std::ptr::copy_nonoverlapping(buffer[rel_start..].as_ptr(), out_4096_buf, copy_len);
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

#[no_mangle]
pub unsafe extern "system" fn DS_AtaCheckPowerMode(
    drive_handle: *mut c_void,
    out_sector_count: *mut u8,
) -> bool {
    if drive_handle.is_null() || out_sector_count.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }
        let mut tf_out = [0u8; 8];
        let tf = [0, 0, 0, 0, 0, 0xA0, 0xE5, 0]; // CHECK POWER MODE (0xE5)
        if ds_exec_ata_passthrough(
            ctx.raw_handle,
            DS_ATA_FLAGS_DRDY_REQUIRED,
            tf,
            0,
            Some(&mut tf_out),
            None,
        ) {
            *out_sector_count = tf_out[1];
            return true;
        }
        false
    }

    #[cfg(not(windows))]
    {
        *out_sector_count = 0;
        false
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_AtaSetFeature(
    drive_handle: *mut c_void,
    feature_subcmd: u8,
    sector_count_val: u8,
) -> bool {
    if drive_handle.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }
        let tf = [feature_subcmd, sector_count_val, 0, 0, 0, 0xA0, 0xEF, 0]; // SET FEATURES (0xEF)
        ds_exec_ata_passthrough(
            ctx.raw_handle,
            DS_ATA_FLAGS_DRDY_REQUIRED,
            tf,
            0,
            None,
            None,
        )
    }

    #[cfg(not(windows))]
    {
        let _ = (feature_subcmd, sector_count_val);
        false
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_AtaPowerCommand(
    drive_handle: *mut c_void,
    ata_cmd: u8,
    sector_count_val: u8,
) -> bool {
    if drive_handle.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }
        let tf = [0, sector_count_val, 0, 0, 0, 0xA0, ata_cmd, 0];
        ds_exec_ata_passthrough(
            ctx.raw_handle,
            DS_ATA_FLAGS_DRDY_REQUIRED,
            tf,
            0,
            None,
            None,
        )
    }

    #[cfg(not(windows))]
    {
        let _ = (ata_cmd, sector_count_val);
        false
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_GetSmartLogPage(
    drive_handle: *mut c_void,
    log_address: u8,
    out_512_buf: *mut u8,
) -> bool {
    if drive_handle.is_null() || out_512_buf.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Ioctl::{
            SMART_RCV_DRIVE_DATA, SENDCMDINPARAMS, SENDCMDOUTPARAMS,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }

        // 1. Primary: SMART_RCV_DRIVE_DATA with SMART_READ_LOG (0xD5)
        let mut scip: SENDCMDINPARAMS = std::mem::zeroed();
        scip.cBufferSize = 512;
        scip.irDriveRegs.bFeaturesReg = 0xD5; // SMART READ LOG
        scip.irDriveRegs.bSectorCountReg = 1;
        scip.irDriveRegs.bSectorNumberReg = log_address;
        scip.irDriveRegs.bCylLowReg = 0x4F;
        scip.irDriveRegs.bCylHighReg = 0xC2;
        scip.irDriveRegs.bDriveHeadReg = 0xA0;
        scip.irDriveRegs.bCommandReg = 0xB0;

        let out_size = std::mem::size_of::<SENDCMDOUTPARAMS>() + 512;
        let mut out_vec = vec![0u8; out_size];
        let mut bytes_returned: u32 = 0;

        if DeviceIoControl(
            ctx.raw_handle as _,
            SMART_RCV_DRIVE_DATA,
            &scip as *const _ as _,
            std::mem::size_of::<SENDCMDINPARAMS>() as u32,
            out_vec.as_mut_ptr() as _,
            out_size as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        ) != 0 && bytes_returned >= 528 {
            let p_out = out_vec.as_ptr() as *const SENDCMDOUTPARAMS;
            std::ptr::copy_nonoverlapping((*p_out).bBuffer.as_ptr(), out_512_buf, 512);
            return true;
        }

        // 2. Fallback: IOCTL_ATA_PASS_THROUGH SMART READ LOG (0xB0 / 0xD5)
        let mut data_buf = [0u8; 512];
        let tf = [0xD5, 1, log_address, 0x4F, 0xC2, 0xA0, 0xB0, 0];
        if ds_exec_ata_passthrough(
            ctx.raw_handle,
            DS_ATA_FLAGS_DRDY_REQUIRED | DS_ATA_FLAGS_DATA_IN,
            tf,
            512,
            None,
            Some(&mut data_buf),
        ) {
            std::ptr::copy_nonoverlapping(data_buf.as_ptr(), out_512_buf, 512);
            return true;
        }

        false
    }

    #[cfg(not(windows))]
    {
        let _ = log_address;
        false
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_GetNvmeErrorLogPage(
    drive_handle: *mut c_void,
    out_512_buf: *mut u8,
) -> bool {
    if drive_handle.is_null() || out_512_buf.is_null() {
        return false;
    }

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

        const LOG_SIZE: usize = 512;
        let query_header_size = std::mem::size_of::<STORAGE_PROPERTY_QUERY>()
            + std::mem::size_of::<STORAGE_PROTOCOL_SPECIFIC_DATA>();
        let total_size = query_header_size + LOG_SIZE;
        let mut buffer = vec![0u8; total_size];
        let query_offset = std::mem::offset_of!(STORAGE_PROPERTY_QUERY, AdditionalParameters);

        let try_prop = |prop_id: i32, buf: &mut [u8]| -> bool {
            buf.fill(0);
            let q = &mut *(buf.as_mut_ptr() as *mut STORAGE_PROPERTY_QUERY);
            q.PropertyId = prop_id;
            q.QueryType = PropertyStandardQuery;

            let pdata = &mut *(buf.as_mut_ptr().add(query_offset) as *mut STORAGE_PROTOCOL_SPECIFIC_DATA);
            pdata.ProtocolType = ProtocolTypeNvme;
            pdata.DataType = NVMeDataTypeLogPage as u32;
            pdata.ProtocolDataRequestValue = 0x01; // Error Information Log Page
            pdata.ProtocolDataRequestSubValue = 0;
            pdata.ProtocolDataOffset = std::mem::size_of::<STORAGE_PROTOCOL_SPECIFIC_DATA>() as u32;
            pdata.ProtocolDataLength = LOG_SIZE as u32;

            let mut bytes_returned: u32 = 0;
            DeviceIoControl(
                ctx.raw_handle as _,
                IOCTL_STORAGE_QUERY_PROPERTY,
                buf.as_ptr() as _,
                buf.len() as u32,
                buf.as_mut_ptr() as _,
                buf.len() as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            ) != 0 && bytes_returned >= std::mem::size_of::<STORAGE_PROTOCOL_DATA_DESCRIPTOR>() as u32
        };

        if try_prop(StorageDeviceProtocolSpecificProperty, &mut buffer)
            || try_prop(StorageAdapterProtocolSpecificProperty, &mut buffer)
        {
            let desc = &*(buffer.as_ptr() as *const STORAGE_PROTOCOL_DATA_DESCRIPTOR);
            let data_offset = desc.ProtocolSpecificData.ProtocolDataOffset as usize;
            let data_len = desc.ProtocolSpecificData.ProtocolDataLength as usize;
            let base_ptr = (&desc.ProtocolSpecificData as *const STORAGE_PROTOCOL_SPECIFIC_DATA) as usize;
            let buf_start = buffer.as_ptr() as usize;
            let rel_start = (base_ptr - buf_start) + data_offset;

            if data_offset > 0 && data_len >= 64 && rel_start + data_len.min(LOG_SIZE) <= buffer.len() {
                let copy_len = data_len.min(LOG_SIZE);
                std::ptr::copy_nonoverlapping(buffer[rel_start..].as_ptr(), out_512_buf, copy_len);
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
// 19. DS_RunLbaBenchmarkProbe (Real Win32 Direct Sequential & 4K Random IOPS)
// ---------------------------------------------------------------------------
#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSLbaBenchmarkResult {
    pub start_lba: u64,
    pub block_bytes: u32,
    pub iterations: u32,
    pub throughput_mb_sec: f64,
    pub iops: f64,
    pub avg_latency_ms: f64,
    pub min_latency_ms: f64,
    pub p99_latency_ms: f64,
    pub status_code: u32,
    pub win32_error_code: u32,
}

#[no_mangle]
pub unsafe extern "system" fn DS_RunLbaBenchmarkProbe(
    drive_handle: *mut c_void,
    start_lba: u64,
    block_bytes: u32,
    mode: u32, // 0: sequential zone burst read, 1: random 4K read within zone window
    iterations: u32,
    out_result: *mut DSLbaBenchmarkResult,
) -> bool {
    if drive_handle.is_null() || out_result.is_null() {
        return false;
    }

    let res = &mut *out_result;
    *res = std::mem::zeroed();
    res.start_lba = start_lba;

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::Storage::FileSystem::{SetFilePointerEx, ReadFile, FILE_BEGIN};
        use windows_sys::Win32::System::Ioctl::{IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, DISK_GEOMETRY_EX};
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            return false;
        }

        let sec_size = ctx.sector_size.max(512) as u64;
        let mut total_sectors: u64 = 0;
        let mut geom: DISK_GEOMETRY_EX = std::mem::zeroed();
        let mut geom_bytes: u32 = 0;
        if DeviceIoControl(
            ctx.raw_handle as _,
            IOCTL_DISK_GET_DRIVE_GEOMETRY_EX,
            std::ptr::null(),
            0,
            &mut geom as *mut _ as _,
            std::mem::size_of::<DISK_GEOMETRY_EX>() as u32,
            &mut geom_bytes,
            std::ptr::null_mut(),
        ) != 0 && geom.DiskSize > 0 {
            total_sectors = (geom.DiskSize as u64) / sec_size;
        }

        let req_bytes = if mode == 1 {
            4096u32.max(ctx.sector_size)
        } else {
            block_bytes.clamp(ctx.sector_size.max(512), 4 * 1024 * 1024)
        };
        let aligned_len = ((req_bytes as usize).div_ceil(sec_size as usize)) * (sec_size as usize);
        let sectors_per_io = (aligned_len as u64) / sec_size;
        let safe_iters = iterations.clamp(1, 256);

        let mut aligned_buf = match AlignedSectorBuffer::new(aligned_len, (sec_size as usize).max(4096)) {
            Some(b) => b,
            None => return false,
        };

        let max_valid_start = if total_sectors > sectors_per_io {
            total_sectors - sectors_per_io
        } else {
            start_lba
        };
        let base_lba = start_lba.min(max_valid_start);
        // Zone window for random 4K reads (~32 MB window capped at disk end)
        let window_sectors = (32u64 * 1024 * 1024 / sec_size).max(sectors_per_io);

        let mut latencies: Vec<f64> = Vec::with_capacity(safe_iters as usize);
        let mut total_bytes_transferred: u64 = 0;
        let mut last_err: u32 = 0;
        let mut lcg_state: u64 = base_lba ^ 0x9E37_79B9_7F4A_7C15;

        for iter in 0..safe_iters {
            let io_lba = if mode == 1 {
                lcg_state = lcg_state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                let span_avail = max_valid_start.saturating_sub(base_lba).min(window_sectors);
                let offset_sectors = if span_avail > 0 {
                    // Keep 4K alignment for realistic 4K IOPS probing
                    let raw_off = (lcg_state >> 16) % (span_avail + 1);
                    (raw_off / sectors_per_io.max(1)) * sectors_per_io.max(1)
                } else {
                    0
                };
                base_lba.saturating_add(offset_sectors).min(max_valid_start)
            } else {
                base_lba
                    .saturating_add((iter as u64).saturating_mul(sectors_per_io))
                    .min(max_valid_start)
            };

            let byte_offset = match io_lba.checked_mul(sec_size).and_then(|v| i64::try_from(v).ok()) {
                Some(off) => off,
                None => {
                    res.win32_error_code = 87;
                    res.status_code = DSSectorStatus::Bad as u32;
                    return false;
                }
            };

            let t0 = Instant::now();
            ctx.offset_valid.store(false, Ordering::Relaxed);
            let seek_ok = SetFilePointerEx(
                ctx.raw_handle as _,
                byte_offset,
                std::ptr::null_mut(),
                FILE_BEGIN,
            );

            let mut bytes_read: u32 = 0;
            let read_ok = if seek_ok != 0 {
                ReadFile(
                    ctx.raw_handle as _,
                    aligned_buf.as_mut_ptr(),
                    aligned_len as u32,
                    &mut bytes_read,
                    std::ptr::null_mut(),
                )
            } else {
                0
            };
            let elapsed_ms = (t0.elapsed().as_secs_f64() * 1000.0).max(0.001);

            if read_ok == 0 || bytes_read == 0 {
                last_err = GetLastError();
                res.win32_error_code = last_err;
                res.status_code = DSSectorStatus::Bad as u32;
                return false;
            }

            total_bytes_transferred = total_bytes_transferred.saturating_add(bytes_read as u64);
            latencies.push(elapsed_ms);
        }

        latencies.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let sum_ms: f64 = latencies.iter().sum();
        let avg_ms = sum_ms / (latencies.len().max(1) as f64);
        let min_ms = latencies.first().copied().unwrap_or(avg_ms);
        let p99_idx = ((latencies.len() as f64) * 0.99).floor() as usize;
        let p99_ms = latencies.get(p99_idx.min(latencies.len().saturating_sub(1))).copied().unwrap_or(avg_ms);

        let total_sec = (sum_ms / 1000.0).max(0.000_001);
        let throughput_mb_sec = ((total_bytes_transferred as f64) / (1024.0 * 1024.0)) / total_sec;
        let iops = (latencies.len() as f64) / total_sec;

        res.block_bytes = aligned_len as u32;
        res.iterations = latencies.len() as u32;
        res.throughput_mb_sec = throughput_mb_sec;
        res.iops = iops;
        res.avg_latency_ms = avg_ms;
        res.min_latency_ms = min_ms;
        res.p99_latency_ms = p99_ms;
        res.win32_error_code = last_err;
        res.status_code = if avg_ms >= 500.0 {
            DSSectorStatus::Critical as u32
        } else if avg_ms >= 150.0 {
            DSSectorStatus::Slow as u32
        } else if avg_ms >= 50.0 {
            DSSectorStatus::Normal as u32
        } else {
            DSSectorStatus::Good as u32
        };

        true
    }

    #[cfg(not(windows))]
    {
        let _ = (block_bytes, mode, iterations);
        false
    }
}

// ---------------------------------------------------------------------------
// 20. DS_CopyLbaRangeChunk (ddrescue-style Multi-Pass LBA Chunk Copy to File)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_CopyLbaRangeChunk(
    drive_handle: *mut c_void,
    start_lba: u64,
    sector_count: u32,
    dest_path_ptr: *const u8,
    dest_path_len: u32,
    dest_byte_offset: u64,
    write_zeros_on_input: bool,
    out_bytes_written: *mut u64,
    out_status_code: *mut u32,
    out_win32_error: *mut u32,
) -> bool {
    if !out_bytes_written.is_null() {
        *out_bytes_written = 0;
    }
    if !out_status_code.is_null() {
        *out_status_code = DSSectorStatus::Bad as u32;
    }
    if !out_win32_error.is_null() {
        *out_win32_error = 0;
    }

    if dest_path_ptr.is_null() || dest_path_len == 0 || sector_count == 0 {
        if !out_win32_error.is_null() {
            *out_win32_error = 87; // ERROR_INVALID_PARAMETER
        }
        return false;
    }

    let path_slice = std::slice::from_raw_parts(dest_path_ptr, dest_path_len as usize);
    let dest_path = match std::str::from_utf8(path_slice) {
        Ok(s) => s,
        Err(_) => {
            if !out_win32_error.is_null() {
                *out_win32_error = 87;
            }
            return false;
        }
    };

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, GENERIC_READ, GENERIC_WRITE, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::Storage::FileSystem::{
            CreateFileW, GetFileSizeEx, ReadFile, SetEndOfFile, SetFilePointerEx,
            FILE_ATTRIBUTE_NORMAL, FILE_BEGIN, FILE_FLAG_SEQUENTIAL_SCAN,
            FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_ALWAYS,
        };
        use windows_sys::Win32::System::Memory::{
            CreateFileMappingW, MapViewOfFile, UnmapViewOfFile, FILE_MAP_WRITE, PAGE_READWRITE,
        };
        use windows_sys::Win32::System::SystemInformation::{GetSystemInfo, SYSTEM_INFO};

        let sec_size = if !drive_handle.is_null() {
            let ctx = &*(drive_handle as *const DriveContext);
            ctx.sector_size.max(512) as usize
        } else {
            512usize
        };
        let clamped_sectors = (sector_count as usize).min((4 * 1024 * 1024) / sec_size).max(1);
        let op_len = clamped_sectors.saturating_mul(sec_size);
        let required_end = match dest_byte_offset.checked_add(op_len as u64) {
            Some(end) if i64::try_from(end).is_ok() => end,
            _ => {
                if !out_win32_error.is_null() {
                    *out_win32_error = 87;
                }
                return false;
            }
        };

        // Try Zero-Copy CreateFileMappingW + MapViewOfFile direct target window
        let mut wide: Vec<u16> = dest_path.encode_utf16().collect();
        wide.push(0);
        let h_dest = CreateFileW(
            wide.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_ALWAYS,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN,
            0,
        );
        if h_dest != INVALID_HANDLE_VALUE {
            let mut cur_size: i64 = 0;
            let mut size_ok = GetFileSizeEx(h_dest, &mut cur_size) != 0;
            let cur_size_u64 = cur_size.max(0) as u64;
            if size_ok && required_end > cur_size_u64 {
                if SetFilePointerEx(h_dest, required_end as i64, std::ptr::null_mut(), FILE_BEGIN) == 0
                    || SetEndOfFile(h_dest) == 0
                {
                    size_ok = false;
                }
            }
            let map_total = required_end.max(cur_size_u64);
            let h_map = if size_ok && map_total > 0 {
                CreateFileMappingW(
                    h_dest,
                    std::ptr::null(),
                    PAGE_READWRITE,
                    (map_total >> 32) as u32,
                    (map_total & 0xFFFF_FFFF) as u32,
                    std::ptr::null(),
                )
            } else {
                0
            };

            if h_map != 0 {
                let mut sys_info: SYSTEM_INFO = std::mem::zeroed();
                GetSystemInfo(&mut sys_info);
                let gran = (sys_info.dwAllocationGranularity as u64).max(4096);
                let aligned_off = dest_byte_offset & !(gran - 1);
                let delta = (dest_byte_offset - aligned_off) as usize;
                let map_len = delta + op_len;

                let mapped = MapViewOfFile(
                    h_map,
                    FILE_MAP_WRITE,
                    (aligned_off >> 32) as u32,
                    (aligned_off & 0xFFFF_FFFF) as u32,
                    map_len,
                );
                if !mapped.Value.is_null() {
                    let dst_ptr = (mapped.Value as *mut u8).add(delta);
                    if write_zeros_on_input {
                        std::ptr::write_bytes(dst_ptr, 0, op_len);
                        UnmapViewOfFile(mapped);
                        CloseHandle(h_map);
                        CloseHandle(h_dest);
                        if !out_bytes_written.is_null() {
                            *out_bytes_written = op_len as u64;
                        }
                        if !out_status_code.is_null() {
                            *out_status_code = DSSectorStatus::Good as u32;
                        }
                        return true;
                    }

                    if !drive_handle.is_null() {
                        let ctx = &*(drive_handle as *const DriveContext);
                        if !ctx.raw_handle.is_null() {
                            let byte_offset = match start_lba.checked_mul(sec_size as u64).and_then(|v| i64::try_from(v).ok()) {
                                Some(off) => off,
                                None => {
                                    UnmapViewOfFile(mapped);
                                    CloseHandle(h_map);
                                    CloseHandle(h_dest);
                                    if !out_win32_error.is_null() {
                                        *out_win32_error = 87;
                                    }
                                    return false;
                                }
                            };
                            ctx.offset_valid.store(false, Ordering::Relaxed);
                            if SetFilePointerEx(ctx.raw_handle as _, byte_offset, std::ptr::null_mut(), FILE_BEGIN) == 0 {
                                let err = GetLastError();
                                UnmapViewOfFile(mapped);
                                CloseHandle(h_map);
                                CloseHandle(h_dest);
                                if !out_win32_error.is_null() {
                                    *out_win32_error = err;
                                }
                                return false;
                            }

                            // Attempt Direct DMA ReadFile straight into MapViewOfFile destination pages
                            let align = sec_size.max(4096);
                            let mut bytes_read: u32 = 0;
                            let mut dma_done = false;
                            if ((dst_ptr as usize) & (align - 1)) == 0 {
                                let r = ReadFile(
                                    ctx.raw_handle as _,
                                    dst_ptr,
                                    op_len as u32,
                                    &mut bytes_read,
                                    std::ptr::null_mut(),
                                );
                                if r != 0 && bytes_read > 0 {
                                    dma_done = true;
                                } else {
                                    let err = GetLastError();
                                    if err != 87 && err != 998 {
                                        UnmapViewOfFile(mapped);
                                        CloseHandle(h_map);
                                        CloseHandle(h_dest);
                                        if !out_win32_error.is_null() {
                                            *out_win32_error = err;
                                        }
                                        return false;
                                    }
                                    // Re-seek before VirtualAlloc DMA fallback
                                    let _ = SetFilePointerEx(ctx.raw_handle as _, byte_offset, std::ptr::null_mut(), FILE_BEGIN);
                                }
                            }

                            if !dma_done {
                                let mut scratch = match AlignedSectorBuffer::new_unzeroed(op_len, align) {
                                    Some(b) => b,
                                    None => {
                                        UnmapViewOfFile(mapped);
                                        CloseHandle(h_map);
                                        CloseHandle(h_dest);
                                        return false;
                                    }
                                };
                                let r = ReadFile(
                                    ctx.raw_handle as _,
                                    scratch.as_mut_ptr(),
                                    op_len as u32,
                                    &mut bytes_read,
                                    std::ptr::null_mut(),
                                );
                                if r == 0 || bytes_read == 0 {
                                    let err = GetLastError();
                                    UnmapViewOfFile(mapped);
                                    CloseHandle(h_map);
                                    CloseHandle(h_dest);
                                    if !out_win32_error.is_null() {
                                        *out_win32_error = err;
                                    }
                                    return false;
                                }
                                let valid = (bytes_read as usize).min(op_len);
                                std::ptr::copy_nonoverlapping(scratch.as_ptr(), dst_ptr, valid);
                                bytes_read = valid as u32;
                            }

                            UnmapViewOfFile(mapped);
                            CloseHandle(h_map);
                            CloseHandle(h_dest);
                            if !out_bytes_written.is_null() {
                                *out_bytes_written = bytes_read as u64;
                            }
                            if !out_status_code.is_null() {
                                *out_status_code = DSSectorStatus::Good as u32;
                            }
                            return true;
                        }
                    }
                    UnmapViewOfFile(mapped);
                }
                CloseHandle(h_map);
            }
            CloseHandle(h_dest);
        }
    }

    use std::io::{Seek, SeekFrom, Write};

    let write_buf_to_file = |data: &[u8]| -> Result<u64, u32> {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(dest_path)
            .map_err(|e| e.raw_os_error().unwrap_or(5) as u32)?;
        file.seek(SeekFrom::Start(dest_byte_offset))
            .map_err(|e| e.raw_os_error().unwrap_or(29) as u32)?;
        file.write_all(data)
            .map_err(|e| e.raw_os_error().unwrap_or(29) as u32)?;
        Ok(data.len() as u64)
    };

    if write_zeros_on_input {
        let sec_size = if !drive_handle.is_null() {
            let ctx = &*(drive_handle as *const DriveContext);
            ctx.sector_size.max(512) as usize
        } else {
            512usize
        };
        let total_len = (sector_count as usize).saturating_mul(sec_size).min(4 * 1024 * 1024);
        let zeros = vec![0u8; total_len];
        return match write_buf_to_file(&zeros) {
            Ok(written) => {
                if !out_bytes_written.is_null() {
                    *out_bytes_written = written;
                }
                if !out_status_code.is_null() {
                    *out_status_code = DSSectorStatus::Good as u32;
                }
                true
            }
            Err(err_code) => {
                if !out_win32_error.is_null() {
                    *out_win32_error = err_code;
                }
                false
            }
        };
    }

    if drive_handle.is_null() {
        if !out_win32_error.is_null() {
            *out_win32_error = 6; // ERROR_INVALID_HANDLE
        }
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::Storage::FileSystem::{ReadFile, SetFilePointerEx, FILE_BEGIN};

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            if !out_win32_error.is_null() {
                *out_win32_error = 6;
            }
            return false;
        }

        let sec_size = ctx.sector_size.max(512) as usize;
        let clamped_sectors = (sector_count as usize).min((4 * 1024 * 1024) / sec_size).max(1);
        let read_len = clamped_sectors.saturating_mul(sec_size);

        let byte_offset = match start_lba.checked_mul(sec_size as u64).and_then(|v| i64::try_from(v).ok()) {
            Some(off) => off,
            None => {
                if !out_win32_error.is_null() {
                    *out_win32_error = 87;
                }
                return false;
            }
        };

        let mut aligned_buf = match AlignedSectorBuffer::new_unzeroed(read_len, sec_size.max(4096)) {
            Some(b) => b,
            None => return false,
        };

        ctx.offset_valid.store(false, Ordering::Relaxed);
        let seek_ok = SetFilePointerEx(
            ctx.raw_handle as _,
            byte_offset,
            std::ptr::null_mut(),
            FILE_BEGIN,
        );
        if seek_ok == 0 {
            if !out_win32_error.is_null() {
                *out_win32_error = GetLastError();
            }
            return false;
        }

        let mut bytes_read: u32 = 0;
        let read_ok = ReadFile(
            ctx.raw_handle as _,
            aligned_buf.as_mut_ptr(),
            read_len as u32,
            &mut bytes_read,
            std::ptr::null_mut(),
        );
        if read_ok == 0 || bytes_read == 0 {
            if !out_win32_error.is_null() {
                *out_win32_error = GetLastError();
            }
            return false;
        }

        let valid_len = (bytes_read as usize).min(read_len);
        match write_buf_to_file(&aligned_buf.as_slice()[..valid_len]) {
            Ok(written) => {
                if !out_bytes_written.is_null() {
                    *out_bytes_written = written;
                }
                if !out_status_code.is_null() {
                    *out_status_code = DSSectorStatus::Good as u32;
                }
                true
            }
            Err(err_code) => {
                if !out_win32_error.is_null() {
                    *out_win32_error = err_code;
                }
                false
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (start_lba, write_buf_to_file);
        if !out_win32_error.is_null() {
            *out_win32_error = 50; // ERROR_NOT_SUPPORTED
        }
        false
    }
}

// ---------------------------------------------------------------------------
// 21. DSSanitizeCapabilities, DS_InspectSanitizeCapabilities, DS_ExecuteSanitizeAction
// ---------------------------------------------------------------------------
#[repr(C, packed(8))]
#[derive(Debug, Copy, Clone)]
pub struct DSSanitizeCapabilities {
    pub protocol_code: u32, // 0: UNSUPPORTED, 1: ATA, 2: NVMe
    pub trim_supported: bool,
    pub ata_security_supported: bool,
    pub ata_security_enabled: bool,
    pub ata_security_locked: bool,
    pub ata_security_frozen: bool,
    pub ata_security_count_expired: bool,
    pub ata_enhanced_erase_supported: bool,
    pub ata_erase_time_min: u32,
    pub ata_enhanced_erase_time_min: u32,
    pub nvme_format_supported: bool,
    pub nvme_crypto_erase_supported: bool,
    pub nvme_sanitize_block_erase: bool,
    pub nvme_sanitize_crypto_erase: bool,
    pub nvme_sanitize_overwrite: bool,
    pub nvme_oacs_raw: u16,
    pub nvme_fna_raw: u8,
    pub nvme_sanicap_raw: u32,
}

#[no_mangle]
pub unsafe extern "system" fn DS_InspectSanitizeCapabilities(
    drive_handle: *mut c_void,
    out_caps: *mut DSSanitizeCapabilities,
) -> bool {
    if drive_handle.is_null() || out_caps.is_null() {
        return false;
    }

    let caps = &mut *out_caps;
    *caps = std::mem::zeroed();

    #[cfg(windows)]
    {
        let mut detail: DSPhysicalDriveDetail = std::mem::zeroed();
        DS_GetDriveDetails(drive_handle, &mut detail);
        caps.trim_supported = detail.is_trim_supported;

        let bus = String::from_utf8_lossy(&detail.bus_type)
            .trim_matches(char::from(0))
            .to_string();

        if bus == "NVMe" {
            let mut nvme_id = [0u8; 4096];
            if DS_GetNvmeIdentifyController(drive_handle, nvme_id.as_mut_ptr()) {
                caps.protocol_code = 2; // NVMe
                let oacs = u16::from_le_bytes([nvme_id[256], nvme_id[257]]);
                let sanicap = u32::from_le_bytes([nvme_id[328], nvme_id[329], nvme_id[330], nvme_id[331]]);
                let fna = nvme_id[524];

                caps.nvme_oacs_raw = oacs;
                caps.nvme_fna_raw = fna;
                caps.nvme_sanicap_raw = sanicap;
                caps.nvme_format_supported = (oacs & (1 << 1)) != 0;
                caps.nvme_crypto_erase_supported = (fna & (1 << 2)) != 0;
                caps.nvme_sanitize_crypto_erase = (sanicap & (1 << 0)) != 0;
                caps.nvme_sanitize_block_erase = (sanicap & (1 << 1)) != 0;
                caps.nvme_sanitize_overwrite = (sanicap & (1 << 2)) != 0;
                return true;
            }
        }

        let mut ata_id = [0u8; 512];
        if DS_AtaIdentifyDevice(drive_handle, ata_id.as_mut_ptr()) {
            caps.protocol_code = 1; // ATA
            let word = |w: usize| -> u16 {
                let idx = w * 2;
                u16::from_le_bytes([ata_id[idx], ata_id[idx + 1]])
            };
            let w89 = word(89);
            let w90 = word(90);
            let w128 = word(128);

            caps.ata_security_supported = (w128 & (1 << 0)) != 0;
            caps.ata_security_enabled = (w128 & (1 << 1)) != 0;
            caps.ata_security_locked = (w128 & (1 << 2)) != 0;
            caps.ata_security_frozen = (w128 & (1 << 3)) != 0;
            caps.ata_security_count_expired = (w128 & (1 << 4)) != 0;
            caps.ata_enhanced_erase_supported = (w128 & (1 << 5)) != 0;
            caps.ata_erase_time_min = ((w89 & 0xFF) as u32) * 2;
            caps.ata_enhanced_erase_time_min = ((w90 & 0xFF) as u32) * 2;
            return true;
        }

        false
    }

    #[cfg(not(windows))]
    {
        false
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_ExecuteSanitizeAction(
    drive_handle: *mut c_void,
    action_code: u32, // 1: NVMe Format (User Erase), 2: NVMe Format (Crypto Erase), 3: ATA Security Erase Prepare+Unit
    out_win32_error: *mut u32,
) -> bool {
    if !out_win32_error.is_null() {
        *out_win32_error = 0;
    }
    if drive_handle.is_null() {
        if !out_win32_error.is_null() {
            *out_win32_error = 6;
        }
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            if !out_win32_error.is_null() {
                *out_win32_error = 6;
            }
            return false;
        }

        match action_code {
            1 | 2 => {
                // NVMe Format NVM Admin Command (Opcode 0x80) via IOCTL_STORAGE_PROTOCOL_COMMAND (0x002D1400)
                const IOCTL_STORAGE_PROTOCOL_COMMAND_CODE: u32 = 0x002D_1400;
                const STORAGE_PROTOCOL_COMMAND_FLAG_ADAPTER_REQUEST: u32 = 0x8000_0000;

                #[repr(C)]
                struct NvmeStorageProtocolCmd {
                    version: u32,
                    length: u32,
                    protocol_type: u32, // 3 = ProtocolTypeNvme
                    flags: u32,
                    return_status: u32,
                    error_code: u32,
                    command_length: u32,
                    error_info_length: u32,
                    data_to_device_transfer_length: u32,
                    data_from_device_transfer_length: u32,
                    time_out_value: u32,
                    error_info_offset: u32,
                    data_to_device_buffer_offset: u32,
                    data_from_device_buffer_offset: u32,
                    command_specific: u32,
                    reserved0: u32,
                    fixed_protocol_return_data: u32,
                    reserved1: [u32; 3],
                    command: [u8; 64],
                }

                let mut req: NvmeStorageProtocolCmd = std::mem::zeroed();
                req.version = 1;
                req.length = std::mem::size_of::<NvmeStorageProtocolCmd>() as u32;
                req.protocol_type = 3; // ProtocolTypeNvme
                req.flags = STORAGE_PROTOCOL_COMMAND_FLAG_ADAPTER_REQUEST;
                req.command_length = 64;
                req.time_out_value = 60;
                req.command_specific = 1; // STORAGE_PROTOCOL_SPECIFIC_NVME_ADMIN_COMMAND

                // NVMe Admin Command 64-byte SQE:
                // CDW0[0] = 0x80 (Format NVM)
                // CDW1[4..8] = NSID (0xFFFFFFFF for all namespaces or 1)
                // CDW10[40..44]: SES bits [11:9] -> 1 = User Data Erase, 2 = Cryptographic Erase
                req.command[0] = 0x80;
                req.command[4..8].copy_from_slice(&1u32.to_le_bytes());
                let ses: u32 = if action_code == 2 { 2 << 9 } else { 1 << 9 };
                req.command[40..44].copy_from_slice(&ses.to_le_bytes());

                let mut bytes_ret: u32 = 0;
                let ok = DeviceIoControl(
                    ctx.raw_handle as _,
                    IOCTL_STORAGE_PROTOCOL_COMMAND_CODE,
                    &req as *const _ as _,
                    std::mem::size_of::<NvmeStorageProtocolCmd>() as u32,
                    &mut req as *mut _ as _,
                    std::mem::size_of::<NvmeStorageProtocolCmd>() as u32,
                    &mut bytes_ret,
                    std::ptr::null_mut(),
                );
                if ok == 0 {
                    if !out_win32_error.is_null() {
                        *out_win32_error = GetLastError();
                    }
                    return false;
                }
                if req.return_status != 0 {
                    if !out_win32_error.is_null() {
                        *out_win32_error = req.error_code;
                    }
                    return false;
                }
                true
            }
            3 => {
                // ATA SECURITY ERASE PREPARE (0xF3) followed by SECURITY ERASE UNIT (0xF4) with empty 32-byte user password
                let prepare_tf = [0, 0, 0, 0, 0, 0xA0, 0xF3, 0];
                if !ds_exec_ata_passthrough(
                    ctx.raw_handle,
                    DS_ATA_FLAGS_DRDY_REQUIRED,
                    prepare_tf,
                    0,
                    None,
                    None,
                ) {
                    if !out_win32_error.is_null() {
                        *out_win32_error = GetLastError();
                    }
                    return false;
                }

                // Build SECURITY ERASE UNIT (0xF4) 512-byte parameter block (DATA_OUT = 0x04)
                const DS_ATA_FLAGS_DATA_OUT: u16 = 0x04;
                let mut req: DSAtaPassThroughExWithBuf = std::mem::zeroed();
                req.apt.length = std::mem::size_of::<DSAtaPassThroughEx>() as u16;
                req.apt.ata_flags = DS_ATA_FLAGS_DRDY_REQUIRED | DS_ATA_FLAGS_DATA_OUT;
                req.apt.data_transfer_length = 512;
                req.apt.time_out_value = 3600;
                req.apt.data_buffer_offset = std::mem::offset_of!(DSAtaPassThroughExWithBuf, data);
                req.apt.current_task_file = [0, 0, 0, 0, 0, 0xA0, 0xF4, 0];
                // req.data stays zeroed (User Password identifier = 0, empty 32-byte password)

                let total_size = std::mem::size_of::<DSAtaPassThroughExWithBuf>() as u32;
                let mut bytes_returned: u32 = 0;
                let ok = DeviceIoControl(
                    ctx.raw_handle as _,
                    DS_IOCTL_ATA_PASS_THROUGH,
                    &req as *const _ as _,
                    total_size,
                    &mut req as *mut _ as _,
                    total_size,
                    &mut bytes_returned,
                    std::ptr::null_mut(),
                );
                if ok == 0 || (req.apt.current_task_file[6] & 0x01) != 0 {
                    if !out_win32_error.is_null() {
                        *out_win32_error = GetLastError();
                    }
                    return false;
                }
                true
            }
            _ => {
                if !out_win32_error.is_null() {
                    *out_win32_error = 87;
                }
                false
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = action_code;
        if !out_win32_error.is_null() {
            *out_win32_error = 50;
        }
        false
    }
}

// ---------------------------------------------------------------------------
// 22. DS_ReadRawSectorWithError (Zero-reopen, thread-local aligned read for ddrescue)
// ---------------------------------------------------------------------------
#[no_mangle]
pub unsafe extern "system" fn DS_ReadRawSectorWithError(
    drive_handle: *mut c_void,
    lba: u64,
    out_buffer: *mut u8,
    buffer_size: u32,
    out_bytes_read: *mut u32,
    out_win32_error: *mut u32,
) -> bool {
    if !out_bytes_read.is_null() {
        *out_bytes_read = 0;
    }
    if !out_win32_error.is_null() {
        *out_win32_error = 0;
    }
    if drive_handle.is_null() || out_buffer.is_null() || buffer_size == 0 {
        if !out_win32_error.is_null() {
            *out_win32_error = 87;
        }
        return false;
    }

    #[cfg(windows)]
    {
        use std::cell::RefCell;
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::Storage::FileSystem::{ReadFile, SetFilePointerEx, FILE_BEGIN};

        thread_local! {
            static ALIGNED_SCRATCH: RefCell<Option<AlignedSectorBuffer>> = const { RefCell::new(None) };
        }

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            if !out_win32_error.is_null() {
                *out_win32_error = 6;
            }
            return false;
        }

        let sec_size = ctx.sector_size.max(512) as usize;
        let byte_offset = match lba.checked_mul(sec_size as u64).and_then(|v| i64::try_from(v).ok()) {
            Some(off) => off,
            None => {
                if !out_win32_error.is_null() {
                    *out_win32_error = 87;
                }
                return false;
            }
        };

        let aligned_read_len = (buffer_size as usize).div_ceil(sec_size) * sec_size;
        let align = sec_size.max(4096);
        ctx.offset_valid.store(false, Ordering::Relaxed);

        // Zero-Copy fast path: when caller out_buffer is aligned & sector-multiple, DMA straight into out_buffer
        let is_ptr_aligned = ((out_buffer as usize) & (align - 1)) == 0;
        let is_len_multiple = (buffer_size as usize) % sec_size == 0;
        if is_ptr_aligned && is_len_multiple {
            if SetFilePointerEx(ctx.raw_handle as _, byte_offset, std::ptr::null_mut(), FILE_BEGIN) != 0 {
                let mut bytes_read: u32 = 0;
                let read_ok = ReadFile(
                    ctx.raw_handle as _,
                    out_buffer,
                    buffer_size,
                    &mut bytes_read,
                    std::ptr::null_mut(),
                );
                if read_ok != 0 && bytes_read == buffer_size {
                    if !out_bytes_read.is_null() {
                        *out_bytes_read = buffer_size;
                    }
                    return true;
                }
            }
        }

        ALIGNED_SCRATCH.with(|cell| {
            let mut slot = cell.borrow_mut();
            let needs_realloc = match slot.as_ref() {
                Some(buf) => buf.len < aligned_read_len,
                None => true,
            };
            if needs_realloc {
                *slot = AlignedSectorBuffer::new_unzeroed(aligned_read_len, align);
            }
            let Some(aligned_buf) = slot.as_mut() else {
                if !out_win32_error.is_null() {
                    *out_win32_error = 8; // ERROR_NOT_ENOUGH_MEMORY
                }
                return false;
            };

            let seek_ok = SetFilePointerEx(
                ctx.raw_handle as _,
                byte_offset,
                std::ptr::null_mut(),
                FILE_BEGIN,
            );
            if seek_ok == 0 {
                if !out_win32_error.is_null() {
                    *out_win32_error = GetLastError();
                }
                return false;
            }

            let mut bytes_read: u32 = 0;
            let read_ok = ReadFile(
                ctx.raw_handle as _,
                aligned_buf.as_mut_ptr(),
                aligned_read_len as u32,
                &mut bytes_read,
                std::ptr::null_mut(),
            );
            if read_ok == 0 || bytes_read < buffer_size {
                if !out_win32_error.is_null() {
                    *out_win32_error = if read_ok == 0 { GetLastError() } else { 38 }; // ERROR_HANDLE_EOF
                }
                return false;
            }

            std::ptr::copy_nonoverlapping(aligned_buf.as_ptr(), out_buffer, buffer_size as usize);
            if !out_bytes_read.is_null() {
                *out_bytes_read = buffer_size;
            }
            true
        })
    }

    #[cfg(not(windows))]
    {
        let _ = (lba, out_buffer, buffer_size);
        if !out_win32_error.is_null() {
            *out_win32_error = 50;
        }
        false
    }
}

// ---------------------------------------------------------------------------
// 23. Zero-Copy Memory-Mapped Target Exports (#20-#25 matching C ABI)
// ---------------------------------------------------------------------------
#[cfg(windows)]
struct DSMappedTargetContext {
    h_file: isize,
    h_mapping: isize,
    file_size_bytes: u64,
    sector_size: u32,
    allocation_granularity: u32,
    is_read_only: bool,
}

#[cfg(not(windows))]
struct DSMappedTargetContext {
    file: std::fs::File,
    file_size_bytes: u64,
    sector_size: u32,
    is_read_only: bool,
}

#[cfg(not(windows))]
struct PosixWindowBacking {
    data: Vec<u8>,
    file_offset: u64,
    len: usize,
    is_read_only: bool,
    target_ptr: *mut DSMappedTargetContext,
}

#[no_mangle]
pub unsafe extern "system" fn DS_OpenMappedTarget(
    utf8_path: *const std::ffi::c_char,
    sector_size: u32,
    access_mode: u32,
    initial_size_bytes: u64,
) -> *mut c_void {
    if utf8_path.is_null() {
        return std::ptr::null_mut();
    }
    let c_str = std::ffi::CStr::from_ptr(utf8_path);
    let path_str = match c_str.to_str() {
        Ok(s) if !s.is_empty() => s,
        _ => return std::ptr::null_mut(),
    };
    let safe_sec = if sector_size >= 512 && sector_size.is_power_of_two() {
        sector_size
    } else {
        512
    };
    let read_only = access_mode == DSMappedAccessMode::ReadOnly as u32;

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::Storage::FileSystem::{
            CreateFileW, GetFileSizeEx, SetEndOfFile, SetFilePointerEx,
            FILE_ATTRIBUTE_NORMAL, FILE_BEGIN, FILE_FLAG_SEQUENTIAL_SCAN,
            FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_ALWAYS, OPEN_EXISTING,
        };
        use windows_sys::Win32::System::Memory::{CreateFileMappingW, PAGE_READONLY, PAGE_READWRITE};
        use windows_sys::Win32::System::SystemInformation::{GetSystemInfo, SYSTEM_INFO};

        let mut wide: Vec<u16> = path_str.encode_utf16().collect();
        wide.push(0);
        let desired_access = if read_only { GENERIC_READ } else { GENERIC_READ | GENERIC_WRITE };
        let disp = if read_only { OPEN_EXISTING } else { OPEN_ALWAYS };
        let h_file = CreateFileW(
            wide.as_ptr(),
            desired_access,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            disp,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN,
            0,
        );
        if h_file == INVALID_HANDLE_VALUE {
            return std::ptr::null_mut();
        }

        let mut file_size: i64 = 0;
        if GetFileSizeEx(h_file, &mut file_size) == 0 {
            CloseHandle(h_file);
            return std::ptr::null_mut();
        }
        let mut effective_size = file_size.max(0) as u64;
        if !read_only && initial_size_bytes > effective_size {
            if i64::try_from(initial_size_bytes).is_err()
                || SetFilePointerEx(h_file, initial_size_bytes as i64, std::ptr::null_mut(), FILE_BEGIN) == 0
                || SetEndOfFile(h_file) == 0
            {
                CloseHandle(h_file);
                return std::ptr::null_mut();
            }
            effective_size = initial_size_bytes;
        }
        if effective_size == 0 {
            CloseHandle(h_file);
            return std::ptr::null_mut();
        }

        let fl_protect = if read_only { PAGE_READONLY } else { PAGE_READWRITE };
        let h_mapping = CreateFileMappingW(
            h_file,
            std::ptr::null(),
            fl_protect,
            (effective_size >> 32) as u32,
            (effective_size & 0xFFFF_FFFF) as u32,
            std::ptr::null(),
        );
        if h_mapping == 0 {
            CloseHandle(h_file);
            return std::ptr::null_mut();
        }

        let mut sys_info: SYSTEM_INFO = std::mem::zeroed();
        GetSystemInfo(&mut sys_info);
        let gran = (sys_info.dwAllocationGranularity).max(4096);

        let ctx = Box::new(DSMappedTargetContext {
            h_file,
            h_mapping,
            file_size_bytes: effective_size,
            sector_size: safe_sec,
            allocation_granularity: gran,
            is_read_only: read_only,
        });
        Box::into_raw(ctx) as *mut c_void
    }

    #[cfg(not(windows))]
    {
        let file = match std::fs::OpenOptions::new()
            .read(true)
            .write(!read_only)
            .create(!read_only)
            .open(path_str)
        {
            Ok(f) => f,
            Err(_) => return std::ptr::null_mut(),
        };
        let mut effective_size = match file.metadata() {
            Ok(m) => m.len(),
            Err(_) => return std::ptr::null_mut(),
        };
        if !read_only && initial_size_bytes > effective_size {
            if file.set_len(initial_size_bytes).is_err() {
                return std::ptr::null_mut();
            }
            effective_size = initial_size_bytes;
        }
        if effective_size == 0 {
            return std::ptr::null_mut();
        }
        let ctx = Box::new(DSMappedTargetContext {
            file,
            file_size_bytes: effective_size,
            sector_size: safe_sec,
            is_read_only: read_only,
        });
        Box::into_raw(ctx) as *mut c_void
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_MapSectorWindow(
    h_mapped: *mut c_void,
    start_lba: u64,
    sector_count: u32,
    out_window: *mut DSMappedSectorWindow,
) -> bool {
    if h_mapped.is_null() || out_window.is_null() || sector_count == 0 {
        return false;
    }
    *out_window = std::mem::zeroed();

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Memory::{MapViewOfFile, FILE_MAP_READ, FILE_MAP_WRITE};

        let ctx = &*(h_mapped as *const DSMappedTargetContext);
        let req_offset = match start_lba.checked_mul(ctx.sector_size as u64) {
            Some(off) if off < ctx.file_size_bytes => off,
            _ => return false,
        };
        let mut req_bytes = (sector_count as u64).saturating_mul(ctx.sector_size as u64);
        let avail = ctx.file_size_bytes - req_offset;
        if req_bytes > avail {
            req_bytes = avail;
        }
        if req_bytes > 0x4000_0000 {
            req_bytes = 0x4000_0000;
        }

        let gran_mask = (ctx.allocation_granularity as u64) - 1;
        let aligned_offset = req_offset & !gran_mask;
        let delta = (req_offset - aligned_offset) as usize;
        let map_bytes = delta + (req_bytes as usize);
        let access = if ctx.is_read_only { FILE_MAP_READ } else { FILE_MAP_WRITE };

        let mapped = MapViewOfFile(
            ctx.h_mapping,
            access,
            (aligned_offset >> 32) as u32,
            (aligned_offset & 0xFFFF_FFFF) as u32,
            map_bytes,
        );
        if mapped.Value.is_null() {
            return false;
        }

        let win = &mut *out_window;
        win.internal_base_ptr = mapped.Value;
        win.view_ptr = (mapped.Value as *mut u8).add(delta) as *mut c_void;
        win.file_offset_bytes = req_offset;
        win.mapped_length_bytes = req_bytes as u32;
        win.sector_size = ctx.sector_size;
        win.is_section_mapped = 1;
        win.is_read_only = if ctx.is_read_only { 1 } else { 0 };
        true
    }

    #[cfg(not(windows))]
    {
        use std::io::{Read, Seek, SeekFrom};

        let ctx_ptr = h_mapped as *mut DSMappedTargetContext;
        let ctx = &mut *ctx_ptr;
        let req_offset = match start_lba.checked_mul(ctx.sector_size as u64) {
            Some(off) if off < ctx.file_size_bytes => off,
            _ => return false,
        };
        let req_bytes = (sector_count as u64)
            .saturating_mul(ctx.sector_size as u64)
            .min(ctx.file_size_bytes - req_offset)
            .min(64 * 1024 * 1024) as usize;

        if ctx.file.seek(SeekFrom::Start(req_offset)).is_err() {
            return false;
        }
        let mut data = vec![0u8; req_bytes];
        if ctx.file.read_exact(&mut data).is_err() {
            return false;
        }

        let mut backing = Box::new(PosixWindowBacking {
            data,
            file_offset: req_offset,
            len: req_bytes,
            is_read_only: ctx.is_read_only,
            target_ptr: ctx_ptr,
        });
        let data_ptr = backing.data.as_mut_ptr() as *mut c_void;
        let backing_ptr = Box::into_raw(backing) as *mut c_void;

        let win = &mut *out_window;
        win.view_ptr = data_ptr;
        win.internal_base_ptr = backing_ptr;
        win.file_offset_bytes = req_offset;
        win.mapped_length_bytes = req_bytes as u32;
        win.sector_size = ctx.sector_size;
        win.is_section_mapped = 0;
        win.is_read_only = if ctx.is_read_only { 1 } else { 0 };
        true
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_UnmapSectorWindow(window: *mut DSMappedSectorWindow) -> bool {
    if window.is_null() || (*window).internal_base_ptr.is_null() {
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Memory::{UnmapViewOfFile, MEMORY_MAPPED_VIEW_ADDRESS};
        let addr = MEMORY_MAPPED_VIEW_ADDRESS {
            Value: (*window).internal_base_ptr,
        };
        let ok = UnmapViewOfFile(addr) != 0;
        *window = std::mem::zeroed();
        ok
    }

    #[cfg(not(windows))]
    {
        use std::io::{Seek, SeekFrom, Write};
        let backing = Box::from_raw((*window).internal_base_ptr as *mut PosixWindowBacking);
        let mut ok = true;
        if !backing.is_read_only && !backing.target_ptr.is_null() {
            let ctx = &mut *backing.target_ptr;
            if ctx.file.seek(SeekFrom::Start(backing.file_offset)).is_err()
                || ctx.file.write_all(&backing.data[..backing.len]).is_err()
            {
                ok = false;
            }
        }
        *window = std::mem::zeroed();
        ok
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_CloseMappedTarget(h_mapped: *mut c_void) {
    if h_mapped.is_null() {
        return;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::Storage::FileSystem::FlushFileBuffers;

        let ctx = Box::from_raw(h_mapped as *mut DSMappedTargetContext);
        if ctx.h_mapping != 0 {
            CloseHandle(ctx.h_mapping);
        }
        if ctx.h_file != 0 {
            if !ctx.is_read_only {
                FlushFileBuffers(ctx.h_file);
            }
            CloseHandle(ctx.h_file);
        }
    }

    #[cfg(not(windows))]
    {
        let ctx = Box::from_raw(h_mapped as *mut DSMappedTargetContext);
        if !ctx.is_read_only {
            let _ = ctx.file.sync_all();
        }
    }
}

#[no_mangle]
pub unsafe extern "system" fn DS_ScanMappedLbaRange(
    h_mapped: *mut c_void,
    start_lba: u64,
    sector_count: u64,
    window_sectors: u32,
    out_crc32: *mut u32,
    out_parity: *mut u64,
    out_zero_sectors: *mut u64,
) -> bool {
    if h_mapped.is_null() || sector_count == 0 {
        return false;
    }
    let ctx = &*(h_mapped as *const DSMappedTargetContext);
    let sec_size = ctx.sector_size as usize;
    let win_secs = if window_sectors == 0 {
        ((16 * 1024 * 1024) / sec_size).max(1) as u32
    } else {
        window_sectors
    };

    let mut crc: u32 = 0xFFFFFFFF;
    let mut parity: u64 = 0;
    let mut zero_sectors: u64 = 0;
    let mut remaining = sector_count;
    let mut cur_lba = start_lba;

    while remaining > 0 {
        let batch = remaining.min(win_secs as u64) as u32;
        let mut win: DSMappedSectorWindow = std::mem::zeroed();
        if !DS_MapSectorWindow(h_mapped, cur_lba, batch, &mut win) {
            return false;
        }
        let slice = std::slice::from_raw_parts(win.view_ptr as *const u8, win.mapped_length_bytes as usize);
        let full_secs = slice.len() / sec_size;
        for sec in slice.chunks_exact(sec_size) {
            let mut zero_acc: u64 = 0;
            let chunks = sec.chunks_exact(8);
            let rem = chunks.remainder();
            for c in chunks {
                let w = u64::from_le_bytes(c.try_into().unwrap());
                zero_acc |= w;
                parity ^= w;
                crc = crc32_slice8_step8(crc, c);
            }
            for (idx, &b) in rem.iter().enumerate() {
                zero_acc |= b as u64;
                parity ^= (b as u64) << ((idx & 7) * 8);
                crc = DS_CRC32_SLICE8[0][((crc ^ b as u32) & 0xFF) as usize] ^ (crc >> 8);
            }
            if zero_acc == 0 {
                zero_sectors += 1;
            }
        }
        DS_UnmapSectorWindow(&mut win);
        if full_secs == 0 {
            break;
        }
        cur_lba += full_secs as u64;
        remaining -= full_secs as u64;
    }

    if !out_crc32.is_null() {
        *out_crc32 = !crc;
    }
    if !out_parity.is_null() {
        *out_parity = parity;
    }
    if !out_zero_sectors.is_null() {
        *out_zero_sectors = zero_sectors;
    }
    true
}

#[no_mangle]
pub unsafe extern "system" fn DS_CopyLbaRangeToMappedFile(
    drive_handle: *mut c_void,
    start_lba: u64,
    total_sectors: u64,
    dest_utf8_path: *const std::ffi::c_char,
    dest_start_lba: u64,
    chunk_sectors: u32,
    out_bytes_copied: *mut u64,
    out_win32_error: *mut u32,
) -> bool {
    if !out_bytes_copied.is_null() {
        *out_bytes_copied = 0;
    }
    if !out_win32_error.is_null() {
        *out_win32_error = 0;
    }
    if drive_handle.is_null() || total_sectors == 0 || dest_utf8_path.is_null() {
        if !out_win32_error.is_null() {
            *out_win32_error = 87;
        }
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::Storage::FileSystem::{ReadFile, SetFilePointerEx, FILE_BEGIN};

        let ctx = &*(drive_handle as *const DriveContext);
        if ctx.raw_handle.is_null() {
            if !out_win32_error.is_null() {
                *out_win32_error = 6;
            }
            return false;
        }

        let sec_size = ctx.sector_size.max(512) as u64;
        let total_dest_end = match dest_start_lba
            .checked_add(total_sectors)
            .and_then(|s| s.checked_mul(sec_size))
        {
            Some(v) if i64::try_from(v).is_ok() => v,
            _ => {
                if !out_win32_error.is_null() {
                    *out_win32_error = 87;
                }
                return false;
            }
        };

        let h_mapped = DS_OpenMappedTarget(
            dest_utf8_path,
            sec_size as u32,
            DSMappedAccessMode::ReadWrite as u32,
            total_dest_end,
        );
        if h_mapped.is_null() {
            if !out_win32_error.is_null() {
                *out_win32_error = GetLastError();
            }
            return false;
        }

        let default_secs = ((16 * 1024 * 1024) / sec_size).max(1) as u32;
        let step_secs = if chunk_sectors > 0 { chunk_sectors } else { default_secs };
        let mut remaining = total_sectors;
        let mut src_lba = start_lba;
        let mut dst_lba = dest_start_lba;
        let mut copied_bytes: u64 = 0;
        let mut all_ok = true;

        while remaining > 0 {
            let batch = remaining.min(step_secs as u64) as u32;
            let mut win: DSMappedSectorWindow = std::mem::zeroed();
            if !DS_MapSectorWindow(h_mapped, dst_lba, batch, &mut win) {
                if !out_win32_error.is_null() {
                    *out_win32_error = GetLastError();
                }
                all_ok = false;
                break;
            }

            let mut src_byte_offset = match src_lba.checked_mul(sec_size).and_then(|v| i64::try_from(v).ok().map(|_| v)) {
                Some(off) => off,
                None => {
                    ctx.offset_valid.store(false, Ordering::Relaxed);
                    if !out_win32_error.is_null() {
                        *out_win32_error = 87;
                    }
                    DS_UnmapSectorWindow(&mut win);
                    all_ok = false;
                    break;
                }
            };
            let is_seq = ctx.offset_valid.load(Ordering::Relaxed)
                && ctx.last_byte_offset.load(Ordering::Relaxed) == src_byte_offset;
            if !is_seq
                && SetFilePointerEx(
                    ctx.raw_handle as _,
                    src_byte_offset as i64,
                    std::ptr::null_mut(),
                    FILE_BEGIN,
                ) == 0
            {
                ctx.offset_valid.store(false, Ordering::Relaxed);
                if !out_win32_error.is_null() {
                    *out_win32_error = GetLastError();
                }
                DS_UnmapSectorWindow(&mut win);
                all_ok = false;
                break;
            }

            let mut bytes_left = win.mapped_length_bytes;
            let mut dst_ptr = win.view_ptr as *mut u8;
            let mut view_aligned = ((dst_ptr as usize) & ((sec_size as usize) - 1)) == 0;
            let mut chunk_ok = true;

            if view_aligned {
                while bytes_left > 0 {
                    let io_chunk = bytes_left.min(0x0400_0000);
                    let mut bytes_read: u32 = 0;
                    if ReadFile(
                        ctx.raw_handle as _,
                        dst_ptr,
                        io_chunk,
                        &mut bytes_read,
                        std::ptr::null_mut(),
                    ) == 0
                        || bytes_read != io_chunk
                    {
                        let err = GetLastError();
                        ctx.offset_valid.store(false, Ordering::Relaxed);
                        if err == 87 || err == 998 {
                            view_aligned = false;
                            break;
                        }
                        if !out_win32_error.is_null() {
                            *out_win32_error = err;
                        }
                        chunk_ok = false;
                        break;
                    }
                    dst_ptr = dst_ptr.add(bytes_read as usize);
                    bytes_left -= bytes_read;
                    src_byte_offset += bytes_read as u64;
                    ctx.last_byte_offset.store(src_byte_offset, Ordering::Relaxed);
                    ctx.offset_valid.store(true, Ordering::Relaxed);
                }
            }

            if chunk_ok && !view_aligned {
                if SetFilePointerEx(
                    ctx.raw_handle as _,
                    src_byte_offset as i64,
                    std::ptr::null_mut(),
                    FILE_BEGIN,
                ) == 0
                {
                    ctx.offset_valid.store(false, Ordering::Relaxed);
                    if !out_win32_error.is_null() {
                        *out_win32_error = GetLastError();
                    }
                    chunk_ok = false;
                } else {
                    let mut fallback = AlignedSectorBuffer::new_unzeroed(
                        ctx.max_transfer_bytes.max(sec_size as u32) as usize,
                        (sec_size as usize).max(4096),
                    );
                    if let Some(ref mut buf) = fallback {
                        while bytes_left > 0 {
                            let io_chunk = bytes_left.min(buf.len as u32);
                            let mut bytes_read: u32 = 0;
                            if ReadFile(
                                ctx.raw_handle as _,
                                buf.as_mut_ptr(),
                                io_chunk,
                                &mut bytes_read,
                                std::ptr::null_mut(),
                            ) == 0
                                || bytes_read != io_chunk
                            {
                                ctx.offset_valid.store(false, Ordering::Relaxed);
                                if !out_win32_error.is_null() {
                                    *out_win32_error = GetLastError();
                                }
                                chunk_ok = false;
                                break;
                            }
                            std::ptr::copy_nonoverlapping(buf.as_ptr(), dst_ptr, bytes_read as usize);
                            dst_ptr = dst_ptr.add(bytes_read as usize);
                            bytes_left -= bytes_read;
                            src_byte_offset += bytes_read as u64;
                            ctx.last_byte_offset.store(src_byte_offset, Ordering::Relaxed);
                            ctx.offset_valid.store(true, Ordering::Relaxed);
                        }
                    } else {
                        chunk_ok = false;
                    }
                }
            }

            copied_bytes += (win.mapped_length_bytes - bytes_left) as u64;
            DS_UnmapSectorWindow(&mut win);
            if !chunk_ok {
                all_ok = false;
                break;
            }
            src_lba += batch as u64;
            dst_lba += batch as u64;
            remaining -= batch as u64;
        }

        DS_CloseMappedTarget(h_mapped);
        if !out_bytes_copied.is_null() {
            *out_bytes_copied = copied_bytes;
        }
        all_ok
    }

    #[cfg(not(windows))]
    {
        let _ = (start_lba, dest_start_lba, chunk_sectors);
        if !out_win32_error.is_null() {
            *out_win32_error = 50;
        }
        false
    }
}

// ---------------------------------------------------------------------------
// 26. DS_ProbeUsbTopology (Win32 PnP Device Tree + USB Hub Descriptor Probe)
// ---------------------------------------------------------------------------
#[cfg(windows)]
fn lookup_usb_bridge_chipset(vid: u16) -> &'static str {
    match vid {
        0x174C => "ASMedia ASM236x / ASM1153E",
        0x152D => "JMicron JMS583 / JMS578",
        0x0BDA => "Realtek RTL9210B / RTS5329",
        0x1058 => "Western Digital USB Bridge",
        0x0BC2 => "Seagate External USB Controller",
        0x0781 => "SanDisk USB Flash Controller",
        0x0951 => "Kingston USB Flash Controller",
        0x04E8 => "Samsung Portable SSD Controller",
        0x05E3 => "Genesys Logic GL3227 Card Reader",
        0x2109 => "VIA Labs VL716 / VL822",
        0x8087 => "Intel Thunderbolt / USB4 Controller",
        _ => "",
    }
}

#[cfg(windows)]
fn parse_vid_pid_from_pnp(id: &str) -> (u16, u16) {
    let upper = id.to_ascii_uppercase();
    let parse_tag = |tag: &str| -> u16 {
        if let Some(pos) = upper.find(tag) {
            let tail = &upper[pos + tag.len()..];
            if tail.len() >= 4 {
                if let Ok(v) = u16::from_str_radix(&tail[..4], 16) {
                    return v;
                }
            }
        }
        0
    };
    (parse_tag("VID_"), parse_tag("PID_"))
}

#[no_mangle]
pub unsafe extern "system" fn DS_ProbeUsbTopology(
    drive_index: u32,
    out_info: *mut DSUsbTopologyInfo,
) -> bool {
    if out_info.is_null() {
        return false;
    }
    *out_info = std::mem::zeroed();
    (*out_info).drive_index = drive_index;

    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE, GENERIC_WRITE};
        use windows_sys::Win32::Storage::FileSystem::{
            CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        #[link(name = "kernel32")]
        extern "system" {
            fn LoadLibraryA(lp_lib_file_name: *const u8) -> *mut c_void;
            fn GetProcAddress(h_module: *mut c_void, lp_proc_name: *const u8) -> *mut c_void;
            fn FreeLibrary(h_lib_module: *mut c_void) -> i32;
        }

        type PfnRegOpenKeyExW = unsafe extern "system" fn(*mut c_void, *const u16, u32, u32, *mut *mut c_void) -> i32;
        type PfnRegQueryValueExW = unsafe extern "system" fn(*mut c_void, *const u16, *mut u32, *mut u32, *mut u8, *mut u32) -> i32;
        type PfnRegCloseKey = unsafe extern "system" fn(*mut c_void) -> i32;

        let h_advapi = LoadLibraryA(b"advapi32.dll\0".as_ptr());
        if h_advapi.is_null() {
            return false;
        }
        let p_reg_open = GetProcAddress(h_advapi, b"RegOpenKeyExW\0".as_ptr());
        let p_reg_query = GetProcAddress(h_advapi, b"RegQueryValueExW\0".as_ptr());
        let p_reg_close = GetProcAddress(h_advapi, b"RegCloseKey\0".as_ptr());

        let mut pnp_w = [0u16; 260];
        let mut got_pnp = false;

        if !p_reg_open.is_null() && !p_reg_query.is_null() && !p_reg_close.is_null() {
            let reg_open: PfnRegOpenKeyExW = std::mem::transmute(p_reg_open);
            let reg_query: PfnRegQueryValueExW = std::mem::transmute(p_reg_query);
            let reg_close: PfnRegCloseKey = std::mem::transmute(p_reg_close);

            let subkey: Vec<u16> = "SYSTEM\\CurrentControlSet\\Services\\Disk\\Enum\0"
                .encode_utf16()
                .collect();
            let mut h_enum: *mut c_void = std::ptr::null_mut();
            let hklm = 0x8000_0002usize as *mut c_void;
            if reg_open(hklm, subkey.as_ptr(), 0, 0x20019 /* KEY_READ */, &mut h_enum) == 0 {
                let val_name: Vec<u16> = format!("{}\0", drive_index).encode_utf16().collect();
                let mut val_type: u32 = 0;
                let mut byte_len: u32 = ((pnp_w.len() - 1) * 2) as u32;
                if reg_query(
                    h_enum,
                    val_name.as_ptr(),
                    std::ptr::null_mut(),
                    &mut val_type,
                    pnp_w.as_mut_ptr() as *mut u8,
                    &mut byte_len,
                ) == 0 && pnp_w[0] != 0
                {
                    got_pnp = true;
                }
                reg_close(h_enum);
            }
        }
        FreeLibrary(h_advapi);

        if !got_pnp {
            return false;
        }

        let end_pnp = pnp_w.iter().position(|&c| c == 0).unwrap_or(pnp_w.len());
        let pnp_str = String::from_utf16_lossy(&pnp_w[..end_pnp]);
        copy_str_to_fixed_bytes(&pnp_str, &mut (*out_info).pnp_device_id);
        (*out_info).probe_succeeded = 1;

        type PfnCmLocateDevNodeW = unsafe extern "system" fn(*mut u32, *const u16, u32) -> u32;
        type PfnCmGetParent = unsafe extern "system" fn(*mut u32, u32, u32) -> u32;
        type PfnCmGetDeviceIdW = unsafe extern "system" fn(u32, *mut u16, u32, u32) -> u32;
        type PfnCmGetDevNodeRegPropW = unsafe extern "system" fn(u32, u32, *mut u32, *mut u8, *mut u32, u32) -> u32;

        let mut has_uasp = false;
        let mut has_bot = false;
        let mut has_usb4 = false;
        let mut has_nvme = false;
        let mut has_sdio = false;
        let mut has_usb3_ancestor = false;

        let h_cfg = LoadLibraryA(b"cfgmgr32.dll\0".as_ptr());
        if !h_cfg.is_null() {
            let p_loc = GetProcAddress(h_cfg, b"CM_Locate_DevNodeW\0".as_ptr());
            let p_par = GetProcAddress(h_cfg, b"CM_Get_Parent\0".as_ptr());
            let p_id = GetProcAddress(h_cfg, b"CM_Get_Device_IDW\0".as_ptr());
            let p_prop = GetProcAddress(h_cfg, b"CM_Get_DevNode_Registry_PropertyW\0".as_ptr());

            if !p_loc.is_null() && !p_par.is_null() && !p_id.is_null() {
                let cm_locate: PfnCmLocateDevNodeW = std::mem::transmute(p_loc);
                let cm_parent: PfnCmGetParent = std::mem::transmute(p_par);
                let cm_devid: PfnCmGetDeviceIdW = std::mem::transmute(p_id);

                let mut cur_node: u32 = 0;
                if cm_locate(&mut cur_node, pnp_w.as_ptr(), 0) == 0 {
                    for depth in 0..8 {
                        let mut node_w = [0u16; 260];
                        if cm_devid(cur_node, node_w.as_mut_ptr(), 259, 0) == 0 {
                            let n_end = node_w.iter().position(|&c| c == 0).unwrap_or(node_w.len());
                            let n_str = String::from_utf16_lossy(&node_w[..n_end]);
                            let n_upper = n_str.to_ascii_uppercase();
                            if n_upper.contains("USB4") || n_upper.contains("THUNDERBOLT") {
                                has_usb4 = true;
                            }
                            if n_upper.contains("ROOT_HUB30") || n_upper.contains("XHCI") {
                                has_usb3_ancestor = true;
                            }
                            if n_upper.contains("USB\\VID_") && (*out_info).vendor_id == 0 {
                                let (vid, pid) = parse_vid_pid_from_pnp(&n_str);
                                if vid != 0 {
                                    (*out_info).vendor_id = vid;
                                    (*out_info).product_id = pid;
                                }
                            }
                        }

                        if !p_prop.is_null() {
                            let cm_prop: PfnCmGetDevNodeRegPropW = std::mem::transmute(p_prop);
                            let mut svc_w = [0u16; 64];
                            let mut p_type: u32 = 0;
                            let mut p_len: u32 = ((svc_w.len() - 1) * 2) as u32;
                            if cm_prop(
                                cur_node,
                                5, // CM_DRP_SERVICE
                                &mut p_type,
                                svc_w.as_mut_ptr() as *mut u8,
                                &mut p_len,
                                0,
                            ) == 0 && svc_w[0] != 0
                            {
                                let s_end = svc_w.iter().position(|&c| c == 0).unwrap_or(svc_w.len());
                                let svc_str = String::from_utf16_lossy(&svc_w[..s_end]);
                                let svc_lower = svc_str.to_ascii_lowercase();
                                if svc_lower.contains("uaspstor") {
                                    has_uasp = true;
                                    copy_str_to_fixed_bytes(&svc_str, &mut (*out_info).driver_service);
                                } else if svc_lower.contains("usbstor") {
                                    has_bot = true;
                                    if (*out_info).driver_service[0] == 0 {
                                        copy_str_to_fixed_bytes(&svc_str, &mut (*out_info).driver_service);
                                    }
                                } else if svc_lower.contains("stornvme") {
                                    has_nvme = true;
                                    if (*out_info).driver_service[0] == 0 {
                                        copy_str_to_fixed_bytes(&svc_str, &mut (*out_info).driver_service);
                                    }
                                } else if svc_lower.contains("sdbus") || svc_lower.contains("sdstor") {
                                    has_sdio = true;
                                    if depth == 1 && (*out_info).driver_service[0] == 0 {
                                        copy_str_to_fixed_bytes(&svc_str, &mut (*out_info).driver_service);
                                    }
                                }
                            }
                        }

                        let mut parent: u32 = 0;
                        if cm_parent(&mut parent, cur_node, 0) != 0 || parent == 0 {
                            break;
                        }
                        cur_node = parent;
                    }
                }
            }
            FreeLibrary(h_cfg);
        }

        if (*out_info).vendor_id != 0 {
            let chip = lookup_usb_bridge_chipset((*out_info).vendor_id);
            if !chip.is_empty() {
                copy_str_to_fixed_bytes(chip, &mut (*out_info).bridge_chipset);
            }
        }

        if has_usb4 && has_nvme {
            (*out_info).transport_code = 3;
            copy_str_to_fixed_bytes("PCIe Tunnel (USB4/TB)", &mut (*out_info).transport_label);
            if (*out_info).driver_service[0] == 0 {
                copy_str_to_fixed_bytes("stornvme", &mut (*out_info).driver_service);
            }
            (*out_info).usb_generation_code = 40;
            (*out_info).negotiated_speed_mbps = 40000;
            (*out_info).bcd_usb = 0x0400;
            copy_str_to_fixed_bytes("USB4 / Thunderbolt 4 (40 Gbps)", &mut (*out_info).usb_version_label);
            return true;
        }

        if has_uasp {
            (*out_info).transport_code = 2;
            copy_str_to_fixed_bytes("UASP (UASPStor)", &mut (*out_info).transport_label);
        } else if has_bot {
            (*out_info).transport_code = 1;
            copy_str_to_fixed_bytes("BOT (USBSTOR)", &mut (*out_info).transport_label);
        } else if has_sdio {
            (*out_info).transport_code = 4;
            copy_str_to_fixed_bytes("SDIO (SD/MMC)", &mut (*out_info).transport_label);
        } else if has_nvme {
            (*out_info).transport_code = 3;
            copy_str_to_fixed_bytes("NVMe PCIe Direct", &mut (*out_info).transport_label);
        }

        if (*out_info).vendor_id != 0 {
            #[repr(C)]
            struct Guid {
                data1: u32,
                data2: u16,
                data3: u16,
                data4: [u8; 8],
            }
            #[repr(C)]
            struct SpDeviceInterfaceData {
                cb_size: u32,
                interface_class_guid: Guid,
                flags: u32,
                reserved: usize,
            }
            type PfnSetupDiGetClassDevsW = unsafe extern "system" fn(*const Guid, *const u16, *mut c_void, u32) -> *mut c_void;
            type PfnSetupDiEnumDeviceInterfaces = unsafe extern "system" fn(*mut c_void, *mut c_void, *const Guid, u32, *mut SpDeviceInterfaceData) -> i32;
            type PfnSetupDiGetDeviceInterfaceDetailW = unsafe extern "system" fn(*mut c_void, *mut SpDeviceInterfaceData, *mut u8, u32, *mut u32, *mut c_void) -> i32;
            type PfnSetupDiDestroyDeviceInfoList = unsafe extern "system" fn(*mut c_void) -> i32;

            const HUB_GUID: Guid = Guid {
                data1: 0xF18A_0E88,
                data2: 0xC30C,
                data3: 0x11D0,
                data4: [0x88, 0x15, 0x00, 0xA0, 0xC9, 0x06, 0xBE, 0xD8],
            };

            let h_setup = LoadLibraryA(b"setupapi.dll\0".as_ptr());
            if !h_setup.is_null() {
                let p_devs = GetProcAddress(h_setup, b"SetupDiGetClassDevsW\0".as_ptr());
                let p_enum = GetProcAddress(h_setup, b"SetupDiEnumDeviceInterfaces\0".as_ptr());
                let p_detail = GetProcAddress(h_setup, b"SetupDiGetDeviceInterfaceDetailW\0".as_ptr());
                let p_destroy = GetProcAddress(h_setup, b"SetupDiDestroyDeviceInfoList\0".as_ptr());

                if !p_devs.is_null() && !p_enum.is_null() && !p_detail.is_null() && !p_destroy.is_null() {
                    let get_devs: PfnSetupDiGetClassDevsW = std::mem::transmute(p_devs);
                    let enum_if: PfnSetupDiEnumDeviceInterfaces = std::mem::transmute(p_enum);
                    let get_detail: PfnSetupDiGetDeviceInterfaceDetailW = std::mem::transmute(p_detail);
                    let destroy: PfnSetupDiDestroyDeviceInfoList = std::mem::transmute(p_destroy);

                    let h_info = get_devs(&HUB_GUID, std::ptr::null(), std::ptr::null_mut(), 0x12);
                    if h_info != (-1isize as *mut c_void) && !h_info.is_null() {
                        let mut found_port = false;
                        for hub_idx in 0..32u32 {
                            if found_port {
                                break;
                            }
                            let mut if_data: SpDeviceInterfaceData = std::mem::zeroed();
                            if_data.cb_size = std::mem::size_of::<SpDeviceInterfaceData>() as u32;
                            if enum_if(h_info, std::ptr::null_mut(), &HUB_GUID, hub_idx, &mut if_data) == 0 {
                                break;
                            }

                            let mut detail_buf = [0u8; 1024];
                            let cb_detail: u32 = if std::mem::size_of::<usize>() == 8 { 8 } else { 6 };
                            detail_buf[..4].copy_from_slice(&cb_detail.to_le_bytes());
                            let mut req_sz: u32 = 0;
                            if get_detail(
                                h_info,
                                &mut if_data,
                                detail_buf.as_mut_ptr(),
                                detail_buf.len() as u32,
                                &mut req_sz,
                                std::ptr::null_mut(),
                            ) == 0
                            {
                                continue;
                            }
                            let path_ptr = detail_buf.as_ptr().add(4) as *const u16;
                            let mut h_hub = CreateFileW(
                                path_ptr,
                                GENERIC_WRITE,
                                FILE_SHARE_READ | FILE_SHARE_WRITE,
                                std::ptr::null(),
                                OPEN_EXISTING,
                                0,
                                0,
                            );
                            if h_hub == INVALID_HANDLE_VALUE {
                                h_hub = CreateFileW(
                                    path_ptr,
                                    0,
                                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                                    std::ptr::null(),
                                    OPEN_EXISTING,
                                    0,
                                    0,
                                );
                            }
                            if h_hub == INVALID_HANDLE_VALUE {
                                continue;
                            }

                            let mut node_info = [0u8; 128];
                            let mut node_ret: u32 = 0;
                            let mut num_ports: u8 = 16;
                            if DeviceIoControl(
                                h_hub as _,
                                0x0022_0408, // IOCTL_USB_GET_NODE_INFORMATION
                                node_info.as_mut_ptr() as _,
                                node_info.len() as u32,
                                node_info.as_mut_ptr() as _,
                                node_info.len() as u32,
                                &mut node_ret,
                                std::ptr::null_mut(),
                            ) != 0 && node_ret >= 8 && node_info[6] > 0
                            {
                                num_ports = node_info[6].min(64);
                            }

                            for port in 1..=num_ports {
                                let mut conn_ex = [0u8; 512];
                                conn_ex[..4].copy_from_slice(&(port as u32).to_le_bytes());
                                let mut ex_ret: u32 = 0;
                                if DeviceIoControl(
                                    h_hub as _,
                                    0x0022_0448, // IOCTL_USB_GET_NODE_CONNECTION_INFORMATION_EX
                                    conn_ex.as_mut_ptr() as _,
                                    conn_ex.len() as u32,
                                    conn_ex.as_mut_ptr() as _,
                                    conn_ex.len() as u32,
                                    &mut ex_ret,
                                    std::ptr::null_mut(),
                                ) == 0 || ex_ret < 35
                                {
                                    continue;
                                }
                                let bcd_usb = u16::from_le_bytes([conn_ex[6], conn_ex[7]]);
                                let vid = u16::from_le_bytes([conn_ex[12], conn_ex[13]]);
                                let pid = u16::from_le_bytes([conn_ex[14], conn_ex[15]]);
                                let speed_byte = conn_ex[23];
                                let is_hub = conn_ex[24];
                                let conn_status = u32::from_le_bytes([conn_ex[31], conn_ex[32], conn_ex[33], conn_ex[34]]);

                                if conn_status == 1 && is_hub == 0 && vid == (*out_info).vendor_id && pid == (*out_info).product_id {
                                    (*out_info).bcd_usb = bcd_usb;
                                    (*out_info).port_number = port;

                                    let mut v2_buf = [port as u32, 16u32, 0x0Fu32, 0u32];
                                    let mut v2_ret: u32 = 0;
                                    let mut v2_flags: u32 = 0;
                                    if DeviceIoControl(
                                        h_hub as _,
                                        0x0022_045C, // IOCTL_USB_GET_NODE_CONNECTION_INFORMATION_EX_V2
                                        v2_buf.as_mut_ptr() as _,
                                        16,
                                        v2_buf.as_mut_ptr() as _,
                                        16,
                                        &mut v2_ret,
                                        std::ptr::null_mut(),
                                    ) != 0 && v2_ret >= 16
                                    {
                                        v2_flags = v2_buf[3];
                                    }

                                    let (gen_code, speed_mbps, label) = if (v2_flags & 0x04) != 0 || bcd_usb >= 0x0320 {
                                        if bcd_usb >= 0x0320 {
                                            (32, 20000, "USB 3.2 Gen2x2 (20 Gbps)")
                                        } else {
                                            (31, 10000, "USB 3.2 Gen2 (10 Gbps)")
                                        }
                                    } else if (v2_flags & 0x01) != 0 || speed_byte >= 3 {
                                        if bcd_usb >= 0x0310 {
                                            (31, 10000, "USB 3.2 Gen2 (10 Gbps)")
                                        } else {
                                            (30, 5000, "USB 3.0 / 3.2 Gen1 (5 Gbps)")
                                        }
                                    } else if speed_byte == 2 {
                                        (20, 480, "USB 2.0 High-Speed (480 Mbps)")
                                    } else {
                                        (11, 12, "USB 1.1 Full-Speed (12 Mbps)")
                                    };
                                    (*out_info).usb_generation_code = gen_code;
                                    (*out_info).negotiated_speed_mbps = speed_mbps;
                                    copy_str_to_fixed_bytes(label, &mut (*out_info).usb_version_label);
                                    found_port = true;
                                    break;
                                }
                            }
                            CloseHandle(h_hub);
                        }
                        destroy(h_info);
                    }
                }
                FreeLibrary(h_setup);
            }
        }

        if (*out_info).usb_generation_code == 0 && (has_uasp || has_bot || (*out_info).vendor_id != 0) {
            if has_uasp || has_usb3_ancestor {
                (*out_info).usb_generation_code = 30;
                (*out_info).negotiated_speed_mbps = 5000;
                if (*out_info).bcd_usb == 0 {
                    (*out_info).bcd_usb = 0x0300;
                }
                copy_str_to_fixed_bytes("USB 3.0 / 3.2 Gen1 (5 Gbps)", &mut (*out_info).usb_version_label);
            } else {
                (*out_info).usb_generation_code = 20;
                (*out_info).negotiated_speed_mbps = 480;
                if (*out_info).bcd_usb == 0 {
                    (*out_info).bcd_usb = 0x0200;
                }
                copy_str_to_fixed_bytes("USB 2.0 High-Speed (480 Mbps)", &mut (*out_info).usb_version_label);
            }
        }

        true
    }

    #[cfg(not(windows))]
    {
        false
    }
}

// ---------------------------------------------------------------------------
// Helper: Copy string safely to fixed byte array
// ---------------------------------------------------------------------------
fn copy_str_to_fixed_bytes(src: &str, dst: &mut [u8]) {
    dst.fill(0);
    if dst.is_empty() {
        return;
    }
    let bytes = src.as_bytes();
    let len = bytes.len().min(dst.len().saturating_sub(1));
    dst[..len].copy_from_slice(&bytes[..len]);
}

#[derive(Debug, Clone, Default)]
pub struct DSExtendedDriveCaps {
    pub partition_style: String,
    pub alignment_status: String,
    pub misaligned_partitions: u32,
    pub volatile_write_cache: Option<bool>,
    pub write_cache_flush_supported: Option<bool>,
    pub read_look_ahead_supported: Option<bool>,
    pub ncq_supported: Option<bool>,
    pub queue_depth: Option<u32>,
    pub apm_aam_supported: Option<bool>,
    pub rotational_speed_rpm: Option<u32>,
    pub warning_temp_threshold_c: Option<u32>,
}

/// Probes real partition layout (MBR/GPT + 4K starting offset alignment),
/// write-cache descriptor, temperature threshold, and ATA/NVMe Identify capability words.
pub unsafe fn ds_probe_extended_drive_caps(
    drive_handle: *mut c_void,
    bus: &str,
    phys_sector_size: u32,
) -> DSExtendedDriveCaps {
    let mut caps = DSExtendedDriveCaps {
        partition_style: "Unknown".to_string(),
        alignment_status: "N/A".to_string(),
        ..Default::default()
    };

    if drive_handle.is_null() {
        return caps;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::System::IO::DeviceIoControl;
        use windows_sys::Win32::System::Ioctl::{
            IOCTL_STORAGE_QUERY_PROPERTY, PropertyStandardQuery, STORAGE_PROPERTY_QUERY,
            STORAGE_TEMPERATURE_DATA_DESCRIPTOR, StorageDeviceTemperatureProperty,
        };

        let ctx = &*(drive_handle as *const DriveContext);
        let h_device = ctx.raw_handle;
        let align_unit = (phys_sector_size.max(4096)) as u64;

        // 1. IOCTL_DISK_GET_DRIVE_LAYOUT_EX (0x0007_0050) for true PartitionStyle and StartingOffset 4K alignment
        const IOCTL_DISK_GET_DRIVE_LAYOUT_EX_RAW: u32 = 0x0007_0050;
        let mut layout_buf = vec![0u8; 16384];
        let mut layout_ret: u32 = 0;
        let layout_ok = DeviceIoControl(
            h_device as _,
            IOCTL_DISK_GET_DRIVE_LAYOUT_EX_RAW,
            std::ptr::null(),
            0,
            layout_buf.as_mut_ptr() as _,
            layout_buf.len() as u32,
            &mut layout_ret,
            std::ptr::null_mut(),
        );

        let mut parsed_layout = false;
        if layout_ok != 0 && layout_ret >= 48 {
            let style = u32::from_le_bytes([layout_buf[0], layout_buf[1], layout_buf[2], layout_buf[3]]);
            let part_count = u32::from_le_bytes([layout_buf[4], layout_buf[5], layout_buf[6], layout_buf[7]]) as usize;
            caps.partition_style = match style {
                0 => "MBR (Master Boot Record)".to_string(),
                1 => "GPT (GUID Partition Table)".to_string(),
                _ => "Unknown".to_string(),
            };
            parsed_layout = true;

            let max_entries = ((layout_ret as usize).saturating_sub(48)) / 144;
            let entries = part_count.min(max_entries);
            let mut active_parts = 0u32;
            let mut misaligned = 0u32;

            for idx in 0..entries {
                let base = 48 + idx * 144;
                if base + 28 > layout_buf.len() {
                    break;
                }
                let starting_offset = i64::from_le_bytes(layout_buf[base + 8..base + 16].try_into().unwrap_or([0; 8]));
                let part_length = i64::from_le_bytes(layout_buf[base + 16..base + 24].try_into().unwrap_or([0; 8]));
                let part_num = u32::from_le_bytes(layout_buf[base + 24..base + 28].try_into().unwrap_or([0; 4]));
                if part_length > 0 && part_num > 0 && starting_offset >= 0 {
                    active_parts += 1;
                    if (starting_offset as u64) % align_unit != 0 {
                        misaligned += 1;
                    }
                }
            }

            caps.misaligned_partitions = misaligned;
            caps.alignment_status = if active_parts == 0 {
                "N/A".to_string()
            } else if misaligned > 0 {
                "Misaligned".to_string()
            } else {
                "Aligned (4K sector boundary)".to_string()
            };
        }

        // 1b. Raw LBA 0 fallback for MBR/GPT inspection when GET_DRIVE_LAYOUT_EX fails
        if !parsed_layout {
            let sec_bytes = ctx.sector_size.max(512);
            let mut mbr_buf = vec![0u8; sec_bytes as usize];
            let mut bytes_read = 0u32;
            let mut w32_err = 0u32;
            if DS_ReadRawSectorWithError(
                drive_handle,
                0,
                mbr_buf.as_mut_ptr(),
                sec_bytes,
                &mut bytes_read,
                &mut w32_err,
            ) && bytes_read >= 512
                && mbr_buf[510] == 0x55
                && mbr_buf[511] == 0xAA
            {
                let mut is_gpt = false;
                let mut active_parts = 0u32;
                let mut misaligned = 0u32;
                for p in 0..4 {
                    let off = 446 + p * 16;
                    let p_type = mbr_buf[off + 4];
                    if p_type == 0xEE {
                        is_gpt = true;
                    }
                    if p_type != 0 && p_type != 0xEE {
                        let start_lba = u32::from_le_bytes([
                            mbr_buf[off + 8],
                            mbr_buf[off + 9],
                            mbr_buf[off + 10],
                            mbr_buf[off + 11],
                        ]) as u64;
                        let count_lba = u32::from_le_bytes([
                            mbr_buf[off + 12],
                            mbr_buf[off + 13],
                            mbr_buf[off + 14],
                            mbr_buf[off + 15],
                        ]) as u64;
                        if count_lba > 0 {
                            active_parts += 1;
                            if (start_lba.saturating_mul(sec_bytes as u64)) % align_unit != 0 {
                                misaligned += 1;
                            }
                        }
                    }
                }
                if is_gpt {
                    caps.partition_style = "GPT (GUID Partition Table)".to_string();
                } else if active_parts > 0 {
                    caps.partition_style = "MBR (Master Boot Record)".to_string();
                    caps.misaligned_partitions = misaligned;
                    caps.alignment_status = if misaligned > 0 {
                        "Misaligned".to_string()
                    } else {
                        "Aligned (4K sector boundary)".to_string()
                    };
                }
            }
        }

        // 2. StorageDeviceWriteCacheProperty (PropertyId = 4) distinguishing supported vs unknown
        let mut wc_query: STORAGE_PROPERTY_QUERY = std::mem::zeroed();
        wc_query.PropertyId = 4;
        wc_query.QueryType = PropertyStandardQuery;
        let mut wc_buf = [0u8; 32];
        let mut wc_bytes: u32 = 0;
        if DeviceIoControl(
            h_device as _,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &wc_query as *const _ as _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            wc_buf.as_mut_ptr() as _,
            wc_buf.len() as u32,
            &mut wc_bytes,
            std::ptr::null_mut(),
        ) != 0 && wc_bytes >= 16
        {
            let wc_state = u32::from_le_bytes([wc_buf[12], wc_buf[13], wc_buf[14], wc_buf[15]]);
            if wc_state == 1 {
                caps.volatile_write_cache = Some(false);
            } else if wc_state == 2 {
                caps.volatile_write_cache = Some(true);
            }
        }

        // 3. StorageDeviceTemperatureProperty OverThreshold
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
        ) != 0 && temp_desc.InfoCount > 0
        {
            let warn_t = temp_desc.TemperatureInfo[0].OverThreshold;
            if warn_t > 20 && warn_t < 150 {
                caps.warning_temp_threshold_c = Some(warn_t as u32);
            }
        }

        // 4. Protocol-specific Identify capabilities (real firmware bits only)
        if bus.eq_ignore_ascii_case("NVMe") {
            let mut nvme_id = vec![0u8; 4096];
            if DS_GetNvmeIdentifyController(drive_handle, nvme_id.as_mut_ptr()) {
                let wctemp_k = u16::from_le_bytes([nvme_id[266], nvme_id[267]]);
                if wctemp_k > 273 && wctemp_k < 423 {
                    caps.warning_temp_threshold_c = Some((wctemp_k - 273) as u32);
                }
                let vwc = nvme_id[525];
                if caps.volatile_write_cache.is_none() {
                    caps.volatile_write_cache = Some((vwc & 0x01) != 0);
                }
                caps.write_cache_flush_supported = Some(true);
            }
        } else {
            let mut ata_id = [0u8; 512];
            if DS_AtaIdentifyDevice(drive_handle, ata_id.as_mut_ptr()) {
                let w = |idx: usize| -> u16 { u16::from_le_bytes([ata_id[idx * 2], ata_id[idx * 2 + 1]]) };
                let w75 = w(75);
                let w76 = w(76);
                let w82 = w(82);
                let w83 = w(83);
                let w85 = w(85);
                let w217 = w(217);

                let ncq = (w76 & (1 << 8)) != 0;
                caps.ncq_supported = Some(ncq);
                caps.queue_depth = Some(if ncq { ((w75 & 0x1F) as u32) + 1 } else { 1 });
                caps.volatile_write_cache = Some((w85 & (1 << 5)) != 0);
                caps.write_cache_flush_supported = Some((w83 & (1 << 12)) != 0 || (w83 & (1 << 13)) != 0);
                caps.read_look_ahead_supported = Some((w82 & (1 << 6)) != 0);
                caps.apm_aam_supported = Some((w83 & (1 << 3)) != 0 || (w83 & (1 << 9)) != 0);
                if w217 == 1 {
                    caps.rotational_speed_rpm = Some(0);
                } else if w217 > 1024 && w217 != 0xFFFF {
                    caps.rotational_speed_rpm = Some(w217 as u32);
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (drive_handle, bus, phys_sector_size);
    }

    caps
}

/// Safely flushes, locks, dismounts volumes on `drive_index`, issues `IOCTL_STORAGE_EJECT_MEDIA`,
/// and requests PnP safe device eject via `CM_Request_Device_EjectW`.
pub fn ds_eject_physical_drive_win32(drive_index: u32, volume_letters: &[String]) -> (bool, String, u32) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{
            CloseHandle, GetLastError, GENERIC_READ, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE,
        };
        use windows_sys::Win32::Storage::FileSystem::{
            CreateFileW, FlushFileBuffers, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
        };
        use windows_sys::Win32::System::IO::DeviceIoControl;

        const FSCTL_LOCK_VOLUME: u32 = 0x0009_0018;
        const FSCTL_DISMOUNT_VOLUME: u32 = 0x0009_0020;
        const FSCTL_UNLOCK_VOLUME: u32 = 0x0009_001C;
        const IOCTL_STORAGE_EJECT_MEDIA: u32 = 0x002D_4808;

        #[link(name = "kernel32")]
        extern "system" {
            fn LoadLibraryA(lp_lib_file_name: *const u8) -> *mut c_void;
            fn GetProcAddress(h_module: *mut c_void, lp_proc_name: *const u8) -> *mut c_void;
            fn FreeLibrary(h_lib_module: *mut c_void) -> i32;
        }

        let mut locked_vol_handles: Vec<(String, HANDLE)> = Vec::new();

        for letter in volume_letters {
            let trimmed = letter.trim().trim_end_matches('\\');
            if trimmed.is_empty() {
                continue;
            }
            let vol_path = format!("\\\\.\\{}\0", trimmed);
            let wide: Vec<u16> = vol_path.encode_utf16().collect();
            let h_vol = unsafe {
                CreateFileW(
                    wide.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    0,
                    0,
                )
            };
            if h_vol == INVALID_HANDLE_VALUE {
                let err = unsafe { GetLastError() };
                for (_, prev_h) in locked_vol_handles {
                    unsafe { CloseHandle(prev_h) };
                }
                return (
                    false,
                    format!(
                        "볼륨 {} 핸들 열기 실패 (Win32 오류 코드 {}). 관리자 권한 및 열려 있는 파일 사용 여부를 확인하세요.",
                        trimmed, err
                    ),
                    err,
                );
            }

            unsafe { FlushFileBuffers(h_vol) };

            let mut locked = false;
            let mut lock_err = 0u32;
            for _ in 0..3 {
                let mut ret = 0u32;
                if unsafe {
                    DeviceIoControl(
                        h_vol as _,
                        FSCTL_LOCK_VOLUME,
                        std::ptr::null(),
                        0,
                        std::ptr::null_mut(),
                        0,
                        &mut ret,
                        std::ptr::null_mut(),
                    )
                } != 0
                {
                    locked = true;
                    break;
                }
                lock_err = unsafe { GetLastError() };
                std::thread::sleep(std::time::Duration::from_millis(80));
            }

            if !locked {
                unsafe { CloseHandle(h_vol) };
                for (_, prev_h) in locked_vol_handles {
                    let mut ur = 0u32;
                    unsafe {
                        DeviceIoControl(prev_h as _, FSCTL_UNLOCK_VOLUME, std::ptr::null(), 0, std::ptr::null_mut(), 0, &mut ur, std::ptr::null_mut());
                        CloseHandle(prev_h);
                    }
                }
                return (
                    false,
                    format!(
                        "볼륨 {}이(가) 다른 프로세스에서 사용 중이어서 잠글 수 없습니다 (Win32 오류 {}). 열린 창이나 파일을 닫고 다시 시도하세요.",
                        trimmed, lock_err
                    ),
                    lock_err,
                );
            }

            let mut dm_ret = 0u32;
            unsafe {
                DeviceIoControl(
                    h_vol as _,
                    FSCTL_DISMOUNT_VOLUME,
                    std::ptr::null(),
                    0,
                    std::ptr::null_mut(),
                    0,
                    &mut dm_ret,
                    std::ptr::null_mut(),
                );
            }
            locked_vol_handles.push((trimmed.to_string(), h_vol));
        }

        // Release volume locks right after dismount so PnP eject does not deadlock on open handles,
        // or try IOCTL_STORAGE_EJECT_MEDIA on the physical drive first.
        let mut media_eject_ok = false;
        let mut media_eject_err = 0u32;
        let phys_path = format!("\\\\.\\PhysicalDrive{}\0", drive_index);
        let phys_wide: Vec<u16> = phys_path.encode_utf16().collect();
        let h_phys = unsafe {
            CreateFileW(
                phys_wide.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                std::ptr::null(),
                OPEN_EXISTING,
                0,
                0,
            )
        };
        if h_phys != INVALID_HANDLE_VALUE {
            let mut eject_ret = 0u32;
            if unsafe {
                DeviceIoControl(
                    h_phys as _,
                    IOCTL_STORAGE_EJECT_MEDIA,
                    std::ptr::null(),
                    0,
                    std::ptr::null_mut(),
                    0,
                    &mut eject_ret,
                    std::ptr::null_mut(),
                )
            } != 0
            {
                media_eject_ok = true;
            } else {
                media_eject_err = unsafe { GetLastError() };
            }
            unsafe { CloseHandle(h_phys) };
        } else {
            media_eject_err = unsafe { GetLastError() };
        }

        for (_, h_vol) in locked_vol_handles {
            unsafe { CloseHandle(h_vol) };
        }

        // Attempt PnP Safe Removal via cfgmgr32 CM_Request_Device_EjectW on parent USB/removable node
        let mut pnp_eject_ok = false;
        let mut veto_reason = String::new();
        unsafe {
            type PfnRegOpenKeyExW = unsafe extern "system" fn(*mut c_void, *const u16, u32, u32, *mut *mut c_void) -> i32;
            type PfnRegQueryValueExW = unsafe extern "system" fn(*mut c_void, *const u16, *mut u32, *mut u32, *mut u8, *mut u32) -> i32;
            type PfnRegCloseKey = unsafe extern "system" fn(*mut c_void) -> i32;

            let h_advapi = LoadLibraryA(b"advapi32.dll\0".as_ptr());
            let mut pnp_w = [0u16; 260];
            let mut got_pnp = false;

            if !h_advapi.is_null() {
                let p_open = GetProcAddress(h_advapi, b"RegOpenKeyExW\0".as_ptr());
                let p_query = GetProcAddress(h_advapi, b"RegQueryValueExW\0".as_ptr());
                let p_close = GetProcAddress(h_advapi, b"RegCloseKey\0".as_ptr());
                if !p_open.is_null() && !p_query.is_null() && !p_close.is_null() {
                    let reg_open: PfnRegOpenKeyExW = std::mem::transmute(p_open);
                    let reg_query: PfnRegQueryValueExW = std::mem::transmute(p_query);
                    let reg_close: PfnRegCloseKey = std::mem::transmute(p_close);
                    let subkey: Vec<u16> = "SYSTEM\\CurrentControlSet\\Services\\Disk\\Enum\0".encode_utf16().collect();
                    let mut h_enum: *mut c_void = std::ptr::null_mut();
                    let hklm = 0x8000_0002usize as *mut c_void;
                    if reg_open(hklm, subkey.as_ptr(), 0, 0x20019, &mut h_enum) == 0 {
                        let val_name: Vec<u16> = format!("{}\0", drive_index).encode_utf16().collect();
                        let mut val_type = 0u32;
                        let mut byte_len = ((pnp_w.len() - 1) * 2) as u32;
                        if reg_query(h_enum, val_name.as_ptr(), std::ptr::null_mut(), &mut val_type, pnp_w.as_mut_ptr() as *mut u8, &mut byte_len) == 0 && pnp_w[0] != 0 {
                            got_pnp = true;
                        }
                        reg_close(h_enum);
                    }
                }
                FreeLibrary(h_advapi);
            }

            if got_pnp {
                type PfnCmLocateDevNodeW = unsafe extern "system" fn(*mut u32, *const u16, u32) -> u32;
                type PfnCmGetParent = unsafe extern "system" fn(*mut u32, u32, u32) -> u32;
                type PfnCmGetDevNodeStatus = unsafe extern "system" fn(*mut u32, *mut u32, u32, u32) -> u32;
                type PfnCmRequestDeviceEjectW = unsafe extern "system" fn(u32, *mut u32, *mut u16, u32, u32) -> u32;

                const CM_CAP_REMOVABLE: u32 = 0x0000_0004;
                let h_cfg = LoadLibraryA(b"cfgmgr32.dll\0".as_ptr());
                if !h_cfg.is_null() {
                    let p_loc = GetProcAddress(h_cfg, b"CM_Locate_DevNodeW\0".as_ptr());
                    let p_par = GetProcAddress(h_cfg, b"CM_Get_Parent\0".as_ptr());
                    let p_stat = GetProcAddress(h_cfg, b"CM_Get_DevNode_Status\0".as_ptr());
                    let p_eject = GetProcAddress(h_cfg, b"CM_Request_Device_EjectW\0".as_ptr());

                    if !p_loc.is_null() && !p_par.is_null() && !p_eject.is_null() {
                        let cm_locate: PfnCmLocateDevNodeW = std::mem::transmute(p_loc);
                        let cm_parent: PfnCmGetParent = std::mem::transmute(p_par);
                        let cm_eject: PfnCmRequestDeviceEjectW = std::mem::transmute(p_eject);

                        let mut cur_node = 0u32;
                        if cm_locate(&mut cur_node, pnp_w.as_ptr(), 0) == 0 {
                            let mut target_node = cur_node;
                            // Walk up 1..2 levels (Disk -> USBSTOR/UASPStor -> USB Device node) to find removable container node
                            let mut probe = cur_node;
                            for _ in 0..3 {
                                if !p_stat.is_null() {
                                    let cm_stat: PfnCmGetDevNodeStatus = std::mem::transmute(p_stat);
                                    let mut status = 0u32;
                                    let mut problem = 0u32;
                                    if cm_stat(&mut status, &mut problem, probe, 0) == 0 {
                                        if (status & CM_CAP_REMOVABLE) != 0 {
                                            target_node = probe;
                                        }
                                    }
                                }
                                let mut parent = 0u32;
                                if cm_parent(&mut parent, probe, 0) != 0 || parent == 0 {
                                    break;
                                }
                                probe = parent;
                            }

                            let mut veto_type = 0u32;
                            let mut veto_buf = [0u16; 260];
                            let cr = cm_eject(target_node, &mut veto_type, veto_buf.as_mut_ptr(), veto_buf.len() as u32, 0);
                            if cr == 0 && veto_type == 0 {
                                pnp_eject_ok = true;
                            } else {
                                let v_end = veto_buf.iter().position(|&c| c == 0).unwrap_or(veto_buf.len());
                                let v_str = String::from_utf16_lossy(&veto_buf[..v_end]);
                                veto_reason = format!("Windows PnP 안전 제거 거부 (CR={}, Veto={}, '{}')", cr, veto_type, v_str);
                            }
                        }
                    }
                    FreeLibrary(h_cfg);
                }
            }
        }

        if pnp_eject_ok || media_eject_ok {
            let vol_label = if volume_letters.is_empty() {
                format!("PhysicalDrive{}", drive_index)
            } else {
                volume_letters.join(", ")
            };
            return (
                true,
                format!(
                    "[{}] 하드웨어 캐시 플러시, 볼륨 잠금 해제(FSCTL_DISMOUNT_VOLUME) 및 {} 안전 제거 완료",
                    vol_label,
                    if pnp_eject_ok { "Windows PnP 장치 분리" } else { "스토리지 미디어 배출" }
                ),
                0,
            );
        }

        let err_msg = if !veto_reason.is_empty() {
            veto_reason
        } else {
            format!("하드웨어 안전 제거 실패 (Win32 오류 코드 {})", media_eject_err)
        };
        (false, err_msg, media_eject_err)
    }

    #[cfg(not(windows))]
    {
        let _ = (drive_index, volume_letters);
        (
            false,
            "하드웨어 안전 제거(FSCTL_LOCK_VOLUME / CM_Request_Device_EjectW)는 Windows 데스크톱 환경에서만 지원됩니다.".to_string(),
            50,
        )
    }
}

