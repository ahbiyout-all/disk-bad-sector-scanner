# DiskSentinel Pro - Security Clean Policy & Report

This document specifies the protocols used to ensure that no confidential data, API keys, personal credentials, or personal email addresses are leaked to the public repository.

### 🛡️ Core Rules & Policies

1. **No Personal Emails/Credentials in Git**:
   - All developer profiles are identified purely by their pseudonym (`AhBiYout` and `AhBiYout-all`).
   - No personal email addresses (e.g., Gmail, work-emails) should be hardcoded in configuration files, comments, or scripts. 

2. **Preventing Leakage of Unnecessary Files**:
   - A highly optimized `.gitignore` is deployed to filter out Node.js system dependencies (`node_modules`), build directories (`dist`, `dist-packages`), system config files (`.env`, `.env.local`), IDE files (`.vscode`, `.idea`), OS artifacts (`Thumbs.db`, `.DS_Store`), and log streams (`*.log`).

3. **Silent Firewall Rules & Installation Security**:
   - During Inno Setup installation, firewall inbound and outbound rule configurations are registered silently (`netsh advfirewall firewall add rule`).
   - Standard firewall profiles are added to restrict ports to local scope only unless explicitly requested by the user, protecting the local network from unauthorized external probes.

4. **Security Scan Checklist**:
   - [x] No personal API keys or OAuth tokens in code.
   - [x] No personal email addresses exposed.
   - [x] No system config artifacts in the public build directories.
   - [x] Multi-user safety checks completed on file systems.
