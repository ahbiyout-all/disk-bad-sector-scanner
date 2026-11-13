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

4. **Security Scan Checklist**:
   - [x] No personal API keys or OAuth tokens in code.
   - [x] No personal email addresses exposed across source, docs, or workflows.
   - [x] Local push script (`git-push-auto.bat`) excluded from GitHub uploads.
   - [x] Release assets restricted strictly to verified Windows Installer (`.exe`) binaries.
