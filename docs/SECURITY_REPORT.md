# Disk Bad Sector Scanner - Security Clean Policy & Report

This document specifies the protocols used to ensure that no confidential data, API keys, personal credentials, or personal email addresses are leaked to the public repository.

### 🛡️ Core Rules & Policies

1. **No Personal Emails/Credentials in Git**:
   - All developer profiles are identified purely by their pseudonym (`AhBiYout` and `AhBiYout-all`).
   - No personal email addresses (e.g., Gmail, Naver, work emails) may ever be hardcoded in configuration files, comments, workflows, or scripts.

2. **Preventing Leakage of Unnecessary Files**:
   - Strict `.gitignore` filters out `node_modules/`, build outputs (`dist/`, `dist-packages/`, `Output/`, `bin/`, `target/`), local push automation scripts (`git-push-auto.bat`, `git-push.bat`), environment files (`.env*` except `.env.example`), IDE caches, and logs (`*.log`).
   - `git-push-auto.bat` runs an automated regex pre-commit audit blocking any personal emails before staging.

3. **Silent Firewall Rules & Installer Hygiene**:
   - During Inno Setup installation, firewall inbound and outbound rules are registered silently (`netsh advfirewall firewall add rule`) for both the base app name (`Disk Bad Sector Scanner`) and versioned name (`Disk Bad Sector Scanner v<version>`).
   - Installer staging strips documentation, portable archives, `.gitignore`, and internal staging artifacts so only runtime executables and web assets are installed.

4. **Native IPC, Win32 IOCTL, Process & Export Hardening (v4.6.2 Audit)**:
   - **Process Parameterization & Window Isolation**: `send_native_os_notification` passes notification icon, title, and body strictly through dedicated environment variables (`DS_NOTIF_ICON`, `DS_NOTIF_TITLE`, `DS_NOTIF_BODY`) to a static PowerShell script with `CREATE_NO_WINDOW (0x08000000)`, eliminating shell/script interpolation and stripping control characters.
   - **Kernel IOCTL Bounds & Handle Hygiene**: `get_file_physical_lba_extents` validates returned extent counts against `rp_buf` capacity before pointer arithmetic and explicitly closes file handles (`CloseHandle`) across all branches including `ERROR_HANDLE_EOF`.
   - **Symlink & NTFS Junction Loop Protection**: `collect_target_files` inspects entries via `symlink_metadata` to skip reparse points/symlinks and maintains a canonicalized visited directory set.
   - **Path Boundary & CSV Export Neutralization**: Watch-root matching normalizes directory separators and trailing slashes to prevent sibling-prefix collisions, while CSV reports neutralize leading formula characters (`=`, `+`, `-`, `@`, `\t`, `\r`).
   - **Dependency Surface Minimization**: Unused runtime `express` / `@types/express` packages removed from `package.json`.

5. **Security Scan Checklist**:
   - [x] No personal API keys or OAuth tokens in code.
   - [x] No personal email addresses exposed across source, docs, or workflows.
   - [x] Local push script (`git-push-auto.bat`) excluded from GitHub uploads.
   - [x] Release assets restricted strictly to verified Windows Installer (`.exe`) binaries.
   - [x] Native OS notifications isolated from command-string interpolation and console popups.
   - [x] Kernel retrieval-pointer reads bounds-checked and file handles closed on all paths.
   - [x] CSV export fields sanitized against formula prefix injection.
