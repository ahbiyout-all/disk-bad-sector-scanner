//! DiskSentinel Pro - Native Windows Executable Host (DiskSentinelPro.exe)
//! Author: AhBiYout (CISNet)
//! Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
//! License: Apache-2.0

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const APP_VERSION: &str = "4.4.0";
const ENGINE_VERSION: &str = "4.5.0";

fn print_banner() {
    println!("===================================================================");
    println!("  DiskSentinel Pro v{} (Native Core Engine v{})", APP_VERSION, ENGINE_VERSION);
    println!("  High-Performance Direct Win32 I/O Surface Scanner & Telemetry");
    println!("  Developer: AhBiYout (https://github.com/AhBiYout-all)");
    println!("===================================================================");
}

fn print_help() {
    print_banner();
    println!("Usage:");
    println!("  DiskSentinelPro.exe [OPTIONS]");
    println!();
    println!("Options:");
    println!("  --gui               Launch interactive Desktop Application Window (Default)");
    println!("  --scan [DRIVE_IDX]  Perform direct surface block scan on storage drive index (default: 0)");
    println!("                      Example: DiskSentinelPro.exe --scan 0");
    println!("  --tray              Run background lightweight Guardian Daemon in system tray");
    println!("  -v, --version       Display application version and exit");
    println!("  -h, --help          Display this help message and exit");
    println!();
}

fn find_app_html() -> Option<PathBuf> {
    let exe_dir = env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let candidates = [
        exe_dir.join("index.html"),
        exe_dir.join("dist").join("index.html"),
        exe_dir.join("..").join("dist").join("index.html"),
        exe_dir.join("..").join("index.html"),
        PathBuf::from("index.html"),
        PathBuf::from("dist").join("index.html"),
    ];

    for candidate in &candidates {
        if candidate.exists() && candidate.is_file() {
            if let Ok(canon) = fs::canonicalize(candidate) {
                return Some(canon);
            }
            return Some(candidate.clone());
        }
    }
    None
}

#[cfg(windows)]
fn is_elevated() -> bool {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token: HANDLE = 0 as HANDLE;
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) != 0 {
            let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
            let mut ret_len: u32 = 0;
            let res = GetTokenInformation(
                token,
                TokenElevation,
                &mut elevation as *mut _ as *mut _,
                std::mem::size_of::<TOKEN_ELEVATION>() as u32,
                &mut ret_len,
            );
            CloseHandle(token);
            if res != 0 {
                return elevation.TokenIsElevated != 0;
            }
        }
    }
    false
}

#[cfg(not(windows))]
fn is_elevated() -> bool {
    false
}

fn launch_gui() {
    println!("[DiskSentinel Pro] Initializing Desktop Application Frame...");

    #[cfg(windows)]
    {
        if !is_elevated() {
            println!("[NOTICE] Application is running without Administrator privileges.");
            println!("         Direct I/O PhysicalDrive access requires Administrator elevation on Windows.");
        }
    }

    let html_path = match find_app_html() {
        Some(p) => p,
        None => {
            eprintln!("[ERROR] Could not locate 'index.html'.");
            eprintln!("        Please ensure DiskSentinelPro.exe is located in the same directory as index.html or dist/");
            return;
        }
    };

    let file_url = format!("file:///{}", html_path.to_string_lossy().replace('\\', "/"));
    println!("-> Loading UI from: {}", file_url);

    // Look for Microsoft Edge to launch in clean App Mode (standalone window without browser chrome)
    let edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ];

    let mut launched = false;
    for edge in &edge_paths {
        if Path::new(edge).exists() {
            println!("-> Launching native standalone application window via Edge App Mode...");
            let res = Command::new(edge)
                .arg(format!("--app={}", file_url))
                .arg("--window-size=1280,820")
                .spawn();
            if res.is_ok() {
                launched = true;
                break;
            }
        }
    }

    if !launched {
        // Fallback: system default browser
        println!("-> Launching in system default browser...");
        #[cfg(windows)]
        {
            let _ = Command::new("cmd")
                .args(["/c", "start", "", &file_url])
                .spawn();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("xdg-open").arg(&file_url).spawn();
        }
    }
}

fn run_cli_scan(drive_idx: u32) {
    print_banner();
    println!("[CLI SCAN MODE] Target: \\\\.\\PhysicalDrive{}", drive_idx);
    println!("Connecting to Native Engine Direct I/O pipeline...");

    let mut sector_size: u32 = 512;
    let handle = unsafe { disksentinel_core::DS_OpenDriveDirect(drive_idx, &mut sector_size) };

    if handle.is_null() {
        eprintln!("[ERROR] Failed to open physical drive PhysicalDrive{}", drive_idx);
        #[cfg(windows)]
        {
            if !is_elevated() {
                eprintln!("[HINT] You must run this command as Administrator for \\\\.\\PhysicalDrive access.");
            }
        }
        return;
    }

    println!("✓ Physical Drive handle acquired (Sector Size: {} bytes). Starting benchmark scan...", sector_size);
    
    let mut bad_count = 0;
    let mut total_latency = 0.0;
    let test_blocks = 20u64;

    for i in 0..test_blocks {
        let lba = i * 2048; // 1MB steps
        let mut result: disksentinel_core::DSBlockResult = unsafe { std::mem::zeroed() };
        let ok = unsafe { disksentinel_core::DS_ScanLbaBlock(handle, lba, 2048, &mut result) };
        if ok && result.status_code == 0 {
            total_latency += result.latency_ms;
            println!("  LBA {:10}..{:10} | {:>6.2} ms | Status: GOOD", lba, lba + 2047, result.latency_ms);
        } else {
            bad_count += 1;
            println!("  LBA {:10}..{:10} | {:>6.2} ms | Status: BAD / TIMEOUT (code {})", lba, lba + 2047, result.latency_ms, result.status_code);
        }
    }

    unsafe { disksentinel_core::DS_CloseDrive(handle) };
    println!("-------------------------------------------------------------------");
    println!("✓ Scan finished: {} blocks evaluated.", test_blocks);
    println!("  Average Latency : {:.2} ms", if test_blocks > 0 { total_latency / test_blocks as f64 } else { 0.0 });
    println!("  Bad Sectors     : {}", bad_count);
    println!("===================================================================");
}

fn run_tray_guardian() {
    print_banner();
    println!("[SYSTEM TRAY GUARDIAN] Daemon started.");
    println!("Monitoring disk thermals, S.M.A.R.T. health, and bad sector degradation in background.");
    println!("Press Ctrl+C to terminate daemon.");

    unsafe {
        disksentinel_core::DS_ConfigureTrayGuardian(10, 55, true);
    }

    let mut status: disksentinel_core::DSTrayGuardianStatus = unsafe { std::mem::zeroed() };
    loop {
        unsafe {
            disksentinel_core::DS_RunTrayGuardianCheck(&mut status);
        }
        let msg = String::from_utf8_lossy(&status.last_alert_message)
            .trim_matches(char::from(0))
            .to_string();
        println!("[Guardian Heartbeat] Monitored: {} drives | Max Temp: {}°C | Alert: {}", 
            status.monitored_drive_count, status.highest_temp_celsius, msg);
        std::thread::sleep(std::time::Duration::from_millis(5000));
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() > 1 {
        match args[1].as_str() {
            "-v" | "--version" => {
                println!("DiskSentinel Pro v{} (Native Core v{})", APP_VERSION, ENGINE_VERSION);
            }
            "-h" | "--help" => {
                print_help();
            }
            "--scan" => {
                let drive_idx = if args.len() > 2 {
                    args[2].parse::<u32>().unwrap_or(0)
                } else {
                    0
                };
                run_cli_scan(drive_idx);
            }
            "--tray" | "--guardian" => {
                run_tray_guardian();
            }
            "--gui" => {
                launch_gui();
            }
            other => {
                eprintln!("Unknown option: {}", other);
                print_help();
            }
        }
    } else {
        // Default action: Launch Desktop GUI
        launch_gui();
    }
}
