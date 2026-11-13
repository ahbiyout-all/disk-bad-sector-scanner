; =====================================================================
; Disk Bad Sector Scanner (디스크 배드섹터 검사기) - Inno Setup Configuration
; Author: AhBiYout (AhBiYout-all)
; Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
; Version: Dynamic Preprocessor ({#AppVersion})
; SPDX-License-Identifier: Apache-2.0
; =====================================================================

#ifndef AppVersion
#define AppVersion "4.6.0"
#endif

[Setup]
AppId={{8E4C7A21-5B94-4F18-9D32-6A1E9C4F0B7D}
AppName=Disk Bad Sector Scanner
AppVersion={#AppVersion}
AppVerName=Disk Bad Sector Scanner v{#AppVersion}
AppPublisher=AhBiYout
AppPublisherURL=https://github.com/AhBiYout-all
AppSupportURL=https://ahbiyoutvibe.blogspot.com/
AppUpdatesURL=https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases
DefaultDirName={autopf}\Disk Bad Sector Scanner
DisableDirPage=no
DefaultGroupName=Disk Bad Sector Scanner
AllowNoIcons=yes
LicenseFile=docs\LICENSE_KR.md
OutputDir=Output
OutputBaseFilename=DiskBadSectorScanner_Setup_v{#AppVersion}
UninstallDisplayName=Disk Bad Sector Scanner v{#AppVersion}
UninstallDisplayIcon={app}\DiskBadSectorScanner.exe
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany=AhBiYout
VersionInfoDescription=Disk Bad Sector Scanner Windows Installer
VersionInfoProductName=Disk Bad Sector Scanner
VersionInfoProductVersion={#AppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
CloseApplicationsFilter=*.exe,*.dll
RestartApplications=no
MinVersion=6.1sp1
PrivilegesRequired=admin

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Unpacked Multi-File Individual Installation (strictly runtime files only; no docs/portable/temp files)
Source: "dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "README*,LICENSE*,CHANGELOG*,WORKLOG*,PATCHNOTES*,*.md,*.txt,*.zip,*.7z,*.tar,*.gz,*.tmp,*.log,*.bak,*Portable*,*portable*,.gitignore,aistudio\*,*.bat,*.vbs"
; Primary native desktop executable host & core DLL
Source: "bin\native\DiskBadSectorScanner.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "bin\native\DiskSentinelNativeCore.dll"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\Disk Bad Sector Scanner"; Filename: "{app}\DiskBadSectorScanner.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Disk Bad Sector Scanner"; Filename: "{app}\DiskBadSectorScanner.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{group}\{cm:UninstallProgram,Disk Bad Sector Scanner}"; Filename: "{uninstallexe}"

[Run]
; Pre-clean stale duplicate rules silently before adding clean dual firewall rules (Base Name + Versioned Name)
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Disk Bad Sector Scanner"""; Flags: runhidden; StatusMsg: "Updating base firewall rule..."
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Disk Bad Sector Scanner v{#AppVersion}"""; Flags: runhidden; StatusMsg: "Updating versioned firewall rule..."
; Silently register firewall rules for base app name and version-appended app name across all installed executables
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Disk Bad Sector Scanner"" dir=in action=allow program=""{app}\DiskBadSectorScanner.exe"" enable=yes"; Flags: runhidden; Check: PrimaryExeExists; StatusMsg: "Registering firewall rule (Disk Bad Sector Scanner)..."
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Disk Bad Sector Scanner v{#AppVersion}"" dir=in action=allow program=""{app}\DiskBadSectorScanner.exe"" enable=yes"; Flags: runhidden; Check: PrimaryExeExists; StatusMsg: "Registering firewall rule (Disk Bad Sector Scanner v{#AppVersion})..."
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Disk Bad Sector Scanner (Outbound)"" dir=out action=allow program=""{app}\DiskBadSectorScanner.exe"" enable=yes"; Flags: runhidden; Check: PrimaryExeExists; StatusMsg: "Registering outbound firewall rule..."
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Disk Bad Sector Scanner v{#AppVersion} (Outbound)"" dir=out action=allow program=""{app}\DiskBadSectorScanner.exe"" enable=yes"; Flags: runhidden; Check: PrimaryExeExists; StatusMsg: "Registering versioned outbound firewall rule..."
; Launch application after installation (skipped in /SILENT or /VERYSILENT unattended installs)
Filename: "{app}\DiskBadSectorScanner.exe"; Description: "{cm:LaunchProgram,Disk Bad Sector Scanner}"; Flags: nowait postinstall skipifsilent; Check: PrimaryExeExists

[UninstallRun]
; Clean up all firewall rules on uninstall with unique RunOnceId identifiers
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Disk Bad Sector Scanner"""; Flags: runhidden; RunOnceId: "DelFirewallRuleStandardIn"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Disk Bad Sector Scanner v{#AppVersion}"""; Flags: runhidden; RunOnceId: "DelFirewallRuleVersionedIn"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Disk Bad Sector Scanner (Outbound)"""; Flags: runhidden; RunOnceId: "DelFirewallRuleStandardOut"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Disk Bad Sector Scanner v{#AppVersion} (Outbound)"""; Flags: runhidden; RunOnceId: "DelFirewallRuleVersionedOut"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""DiskSentinel Pro"""; Flags: runhidden; RunOnceId: "DelLegacyFirewallRule"

[Code]
var
  ExistingUninstallStr: String;
  ExistingVersionStr: String;
  ExistingInstallDir: String;

function PrimaryExeExists(): Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\DiskBadSectorScanner.exe'));
end;

procedure ForceCloseRunningApp();
var
  ResultCode: Integer;
begin
  // Forcefully terminate any running instances of current and legacy binaries prior to install/uninstall
  Exec('taskkill.exe', '/F /IM DiskBadSectorScanner.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM DiskSentinelPro.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(450);
end;

function CheckRegistryKey(RootKey: Integer; SubKey: String; var UninstPath: String; var DispVer: String; var InstDir: String): Boolean;
begin
  Result := RegKeyExists(RootKey, SubKey);
  if Result then
  begin
    RegQueryStringValue(RootKey, SubKey, 'UninstallString', UninstPath);
    RegQueryStringValue(RootKey, SubKey, 'DisplayVersion', DispVer);
    RegQueryStringValue(RootKey, SubKey, 'InstallLocation', InstDir);
  end;
end;

function DetectExistingInstallation(var UninstPath: String; var DispVer: String; var InstDir: String): Boolean;
var
  NewAppKey: String;
  LegacyAppKey: String;
begin
  Result := False;
  UninstPath := '';
  DispVer := '';
  InstDir := '';

  NewAppKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{8E4C7A21-5B94-4F18-9D32-6A1E9C4F0B7D}_is1';
  LegacyAppKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{C6A035D4-733E-4B02-86A5-927A7B056D0D}_is1';

  // 1. Check current AppId across 64/32 HKLM & HKCU
  if (IsWin64 and CheckRegistryKey(HKLM64, NewAppKey, UninstPath, DispVer, InstDir)) or
     CheckRegistryKey(HKLM32, NewAppKey, UninstPath, DispVer, InstDir) or
     (IsWin64 and CheckRegistryKey(HKCU64, NewAppKey, UninstPath, DispVer, InstDir)) or
     CheckRegistryKey(HKCU32, NewAppKey, UninstPath, DispVer, InstDir) then
  begin
    Result := True;
    Exit;
  end;

  // 2. Check legacy AppId across 64/32 HKLM & HKCU
  if (IsWin64 and CheckRegistryKey(HKLM64, LegacyAppKey, UninstPath, DispVer, InstDir)) or
     CheckRegistryKey(HKLM32, LegacyAppKey, UninstPath, DispVer, InstDir) or
     (IsWin64 and CheckRegistryKey(HKCU64, LegacyAppKey, UninstPath, DispVer, InstDir)) or
     CheckRegistryKey(HKCU32, LegacyAppKey, UninstPath, DispVer, InstDir) then
  begin
    Result := True;
    Exit;
  end;

  // 3. Fallback directory checks for unpacked manual or prior installs
  if FileExists(ExpandConstant('{autopf}\Disk Bad Sector Scanner\unins000.exe')) then
  begin
    UninstPath := ExpandConstant('{autopf}\Disk Bad Sector Scanner\unins000.exe');
    InstDir := ExpandConstant('{autopf}\Disk Bad Sector Scanner');
    Result := True;
    Exit;
  end;

  if FileExists(ExpandConstant('{autopf}\Disk Bad Sector Scanner\DiskBadSectorScanner.exe')) or
     FileExists(ExpandConstant('{autopf}\Disk Bad Sector Scanner\index.html')) then
  begin
    InstDir := ExpandConstant('{autopf}\Disk Bad Sector Scanner');
    Result := True;
    Exit;
  end;

  if FileExists(ExpandConstant('{autopf}\DiskSentinelPro\unins000.exe')) then
  begin
    UninstPath := ExpandConstant('{autopf}\DiskSentinelPro\unins000.exe');
    InstDir := ExpandConstant('{autopf}\DiskSentinelPro');
    Result := True;
    Exit;
  end;

  if FileExists(ExpandConstant('{autopf}\DiskSentinelPro\DiskSentinelPro.exe')) then
  begin
    InstDir := ExpandConstant('{autopf}\DiskSentinelPro');
    Result := True;
    Exit;
  end;
end;

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  UninstExec: String;
  PromptMsg: String;
  DialogRes: Integer;
  VerInfo: String;
begin
  Result := True;

  // Step 1: Force terminate running app instances before checking/upgrading
  ForceCloseRunningApp();

  // Step 2: Detect existing install and prompt uninstall vs overwrite (auto-handled in /SILENT or /VERYSILENT)
  if DetectExistingInstallation(ExistingUninstallStr, ExistingVersionStr, ExistingInstallDir) then
  begin
    if WizardSilent() then
    begin
      if ExistingUninstallStr <> '' then
      begin
        UninstExec := RemoveQuotes(ExistingUninstallStr);
        Exec(UninstExec, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Sleep(1000);
      end;
      Result := True;
      Exit;
    end;

    VerInfo := '';
    if ExistingVersionStr <> '' then
      VerInfo := ' (현재 설치된 버전: v' + ExistingVersionStr + ')';

    PromptMsg := '컴퓨터에 기존 Disk Bad Sector Scanner' + VerInfo + '가 이미 설치되어 있습니다.' + #13#10 +
                 '설치 경로: ' + ExistingInstallDir + #13#10#13#10 +
                 '기존 버전을 어떻게 처리하시겠습니까?' + #13#10#13#10 +
                 '[예 (Yes)]     : 기존 버전을 완전히 삭제(제거)한 후 최신 버전(v{#AppVersion})을 새로 설치합니다. (권장)' + #13#10 +
                 '[아니오 (No)]  : 기존 버전을 삭제하지 않고 새 버전 파일로 그대로 덮어씁니다.' + #13#10 +
                 '[취소 (Cancel)] : 설치를 중단하고 종료합니다.';

    DialogRes := MsgBox(PromptMsg, mbConfirmation, MB_YESNOCANCEL);

    if DialogRes = IDYES then
    begin
      if ExistingUninstallStr <> '' then
      begin
        UninstExec := RemoveQuotes(ExistingUninstallStr);
        if Exec(UninstExec, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
        begin
          Sleep(1000);
          Result := True;
        end
        else
        begin
          MsgBox('기존 버전 자동 제거 중 오류가 발생했습니다. 프로그램 추가/제거에서 수동 삭제 후 다시 시도해 주세요.', mbError, MB_OK);
          Result := False;
        end;
      end
      else
      begin
        if (ExistingInstallDir <> '') and DirExists(ExistingInstallDir) then
        begin
          DelTree(ExistingInstallDir, True, True, True);
        end;
        Result := True;
      end;
    end
    else if DialogRes = IDNO then
    begin
      Result := True;
    end
    else
    begin
      Result := False;
    end;
  end;
end;

function InitializeUninstall(): Boolean;
begin
  ForceCloseRunningApp();
  Result := True;
end;
