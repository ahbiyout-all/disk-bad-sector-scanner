/**
 * @file DiskSentinelLauncher.cpp
 * @brief Native Win32 Desktop Host & Launcher for DiskSentinel Pro
 * @author AhBiYout (CISNet)
 * @details Compiles via MSVC (cl.exe) or MinGW (g++.exe) into DiskSentinelPro.exe
 *          Provides seamless desktop app window (Edge App Mode), UAC elevation checks,
 *          and direct execution options.
 * @license Apache-2.0
 */

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <iostream>
#include <string>
#include <vector>

#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "advapi32.lib")

#define APP_VERSION "4.5.0"
#define NATIVE_CORE_VERSION "4.5.0"

bool IsRunningAsAdmin() {
    BOOL isAdmin = FALSE;
    PSID adminGroup = NULL;
    SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;

    if (AllocateAndInitializeSid(&ntAuthority, 2, SECURITY_BUILTIN_DOMAIN_RID,
                                 DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &adminGroup)) {
        CheckTokenMembership(NULL, adminGroup, &isAdmin);
        FreeSid(adminGroup);
    }
    return isAdmin == TRUE;
}

std::wstring GetCurrentExecutableDir() {
    wchar_t buffer[MAX_PATH];
    GetModuleFileNameW(NULL, buffer, MAX_PATH);
    std::wstring path(buffer);
    size_t pos = path.find_last_of(L"\\/");
    return (pos != std::wstring::npos) ? path.substr(0, pos) : L".";
}

bool FileExistsW(const std::wstring& path) {
    DWORD dwAttrib = GetFileAttributesW(path.c_str());
    return (dwAttrib != INVALID_FILE_ATTRIBUTES && !(dwAttrib & FILE_ATTRIBUTE_DIRECTORY));
}

std::wstring FindHtmlEntry() {
    std::wstring exeDir = GetCurrentExecutableDir();
    std::vector<std::wstring> candidates = {
        exeDir + L"\\index.html",
        exeDir + L"\\dist\\index.html",
        exeDir + L"\\..\\dist\\index.html",
        exeDir + L"\\..\\index.html",
        L"index.html",
        L"dist\\index.html"
    };

    for (const auto& cand : candidates) {
        if (FileExistsW(cand)) {
            wchar_t fullPath[MAX_PATH];
            if (GetFullPathNameW(cand.c_str(), MAX_PATH, fullPath, NULL) > 0) {
                return std::wstring(fullPath);
            }
            return cand;
        }
    }
    return L"";
}

void LaunchDesktopWindow() {
    std::wstring htmlPath = FindHtmlEntry();
    if (htmlPath.empty()) {
        MessageBoxW(NULL,
            L"Could not locate 'index.html'.\nPlease make sure DiskSentinelPro.exe is placed alongside the dist files.",
            L"DiskSentinel Pro - File Not Found", MB_ICONERROR | MB_OK);
        return;
    }

    // Convert backslashes for file:/// URL
    std::wstring fileUrl = L"file:///";
    for (wchar_t ch : htmlPath) {
        fileUrl += (ch == L'\\') ? L'/' : ch;
    }

    // Attempt to locate Microsoft Edge for dedicated Application Frame (no browser tabs/URL bar)
    std::vector<std::wstring> edgePaths = {
        L"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        L"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    };

    bool edgeLaunched = false;
    for (const auto& edge : edgePaths) {
        if (FileExistsW(edge)) {
            std::wstring args = L"--app=\"" + fileUrl + L"\" --window-size=1280,820";
            HINSTANCE hInst = ShellExecuteW(NULL, L"open", edge.c_str(), args.c_str(), NULL, SW_SHOWNORMAL);
            if ((INT_PTR)hInst > 32) {
                edgeLaunched = true;
                break;
            }
        }
    }

    if (!edgeLaunched) {
        // Fallback: Open in system default browser
        ShellExecuteW(NULL, L"open", htmlPath.c_str(), NULL, NULL, SW_SHOWNORMAL);
    }
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, PWSTR pCmdLine, int nCmdShow) {
    (void)hInstance;
    (void)hPrevInstance;
    (void)nCmdShow;

    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);

    if (argc > 1) {
        std::wstring firstArg = argv[1];
        if (firstArg == L"-v" || firstArg == L"--version") {
            MessageBoxW(NULL, L"DiskSentinel Pro v" APP_VERSION L"\nNative Core Engine v" NATIVE_CORE_VERSION,
                        L"DiskSentinel Pro Version", MB_OK | MB_ICONINFORMATION);
            LocalFree(argv);
            return 0;
        }
    }
    LocalFree(argv);

    LaunchDesktopWindow();
    return 0;
}

int main(int argc, char* argv[]) {
    // Console entry point for CLI callers
    if (argc > 1) {
        std::string arg = argv[1];
        if (arg == "-v" || arg == "--version") {
            std::cout << "DiskSentinel Pro v" APP_VERSION " (Native Core Engine v" NATIVE_CORE_VERSION ")\n";
            return 0;
        }
        if (arg == "-h" || arg == "--help") {
            std::cout << "DiskSentinel Pro Native Host Runner\n"
                      << "Usage: DiskSentinelPro.exe [OPTIONS]\n"
                      << "  --gui       Launch desktop application frame (Default)\n"
                      << "  --version   Show version info\n";
            return 0;
        }
    }
    LaunchDesktopWindow();
    return 0;
}
