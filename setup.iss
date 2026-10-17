; =====================================================================
; DiskSentinel Pro (디스크 배드섹터 검사기) - Inno Setup Configuration
; Author: AhBiYout-all
; Version: Dynamic Preprocessor ({#AppVersion})
; SPDX-License-Identifier: Apache-2.0
; =====================================================================

#ifndef AppVersion
#define AppVersion "4.5.0"
#endif

[Setup]
AppId={{C6A035D4-733E-4B02-86A5-927A7B056D0D}
AppName=DiskSentinel Pro
AppVersion={#AppVersion}
AppVerName=DiskSentinel Pro v{#AppVersion}
AppPublisher=AhBiYout-all
AppPublisherURL=https://github.com/AhBiYout-all
AppSupportURL=https://ahbiyoutvibe.blogspot.com/
AppUpdatesURL=https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases
DefaultDirName={autopf}\DiskSentinelPro
DisableDirPage=no
DefaultGroupName=DiskSentinel Pro
AllowNoIcons=yes
; Output Setup Executable with Version Suffix
OutputBaseFilename=DiskSentinel_Setup_v{#AppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
; Unpacked Multi-File Install Mode (individual files unpacked in installation folder)
MinVersion=6.1sp1
PrivilegesRequired=admin

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Unpacked individual files from the Vite production build
; Exclude portable archives, temporary files, and portable-only documents from installer
Source: "dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "README-PORTABLE.txt,*.zip,*.tmp,*.log,*Portable*"
; Ensure native binaries are included if placed in bin\native or dist
Source: "bin\native\DiskSentinelPro.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "bin\native\DiskSentinelNativeCore.dll"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\DiskSentinel Pro"; Filename: "{app}\DiskSentinelPro.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\DiskSentinel Pro"; Filename: "{app}\DiskSentinelPro.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{group}\DiskSentinel Pro (웹 브라우저 열기)"; Filename: "{app}\index.html"
Name: "{group}\{cm:UninstallProgram,DiskSentinel Pro}"; Filename: "{uninstallexe}"

[Run]
; Silently Register Firewall Inbound Rules on Install (Standard Name and Version-Appended Name)
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""DiskSentinel Pro"" dir=in action=allow program=""{app}\DiskSentinelPro.exe"" enable=yes"; Flags: runhidden; StatusMsg: "Registering standard firewall rule..."
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""DiskSentinel Pro v{#AppVersion}"" dir=in action=allow program=""{app}\DiskSentinelPro.exe"" enable=yes"; Flags: runhidden; StatusMsg: "Registering version-appended firewall rule..."
Filename: "{app}\DiskSentinelPro.exe"; Description: "{cm:LaunchProgram,DiskSentinel Pro}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Clean up Firewall Rules on Uninstall with RunOnceId to eliminate installer warning
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""DiskSentinel Pro"""; Flags: runhidden; RunOnceId: "DelFirewallRuleStandard"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""DiskSentinel Pro v{#AppVersion}"""; Flags: runhidden; RunOnceId: "DelFirewallRuleVersioned"

[Code]
// Robust pre-installation check logic to detect existing installations (32-bit & 64-bit hives)
// and prompt user for clean uninstall, in-place overwrite, or cancel before proceeding.
var
  ExistingUninstallStr: String;
  ExistingVersionStr: String;
  ExistingInstallDir: String;

function DetectExistingInstallation(var UninstPath: String; var DispVer: String; var InstDir: String): Boolean;
var
  AppKey: String;
begin
  Result := False;
  UninstPath := '';
  DispVer := '';
  InstDir := '';
  AppKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{C6A035D4-733E-4B02-86A5-927A7B056D0D}_is1';

  // 1. Check 64-bit HKLM
  if IsWin64 and RegKeyExists(HKLM64, AppKey) then
  begin
    RegQueryStringValue(HKLM64, AppKey, 'UninstallString', UninstPath);
    RegQueryStringValue(HKLM64, AppKey, 'DisplayVersion', DispVer);
    RegQueryStringValue(HKLM64, AppKey, 'InstallLocation', InstDir);
    Result := True;
    Exit;
  end;

  // 2. Check 32-bit HKLM
  if RegKeyExists(HKLM32, AppKey) then
  begin
    RegQueryStringValue(HKLM32, AppKey, 'UninstallString', UninstPath);
    RegQueryStringValue(HKLM32, AppKey, 'DisplayVersion', DispVer);
    RegQueryStringValue(HKLM32, AppKey, 'InstallLocation', InstDir);
    Result := True;
    Exit;
  end;

  // 3. Check 64-bit HKCU
  if IsWin64 and RegKeyExists(HKCU64, AppKey) then
  begin
    RegQueryStringValue(HKCU64, AppKey, 'UninstallString', UninstPath);
    RegQueryStringValue(HKCU64, AppKey, 'DisplayVersion', DispVer);
    RegQueryStringValue(HKCU64, AppKey, 'InstallLocation', InstDir);
    Result := True;
    Exit;
  end;

  // 4. Check 32-bit HKCU
  if RegKeyExists(HKCU32, AppKey) then
  begin
    RegQueryStringValue(HKCU32, AppKey, 'UninstallString', UninstPath);
    RegQueryStringValue(HKCU32, AppKey, 'DisplayVersion', DispVer);
    RegQueryStringValue(HKCU32, AppKey, 'InstallLocation', InstDir);
    Result := True;
    Exit;
  end;

  // 5. Secondary check: Default installation directory contains existing binaries
  if FileExists(ExpandConstant('{autopf}\DiskSentinelPro\unins000.exe')) then
  begin
    UninstPath := ExpandConstant('{autopf}\DiskSentinelPro\unins000.exe');
    InstDir := ExpandConstant('{autopf}\DiskSentinelPro');
    Result := True;
    Exit;
  end;

  if FileExists(ExpandConstant('{autopf}\DiskSentinelPro\DiskSentinelPro.exe')) or
     FileExists(ExpandConstant('{autopf}\DiskSentinelPro\index.html')) then
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

  if DetectExistingInstallation(ExistingUninstallStr, ExistingVersionStr, ExistingInstallDir) then
  begin
    // Unattended / Silent mode (/SILENT or /VERYSILENT):
    // Bypass GUI prompt and perform automated silent clean upgrade
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

    // Interactive GUI mode: Prompt user with 3 clear choices
    VerInfo := '';
    if ExistingVersionStr <> '' then
      VerInfo := ' (현재 설치된 버전: v' + ExistingVersionStr + ')';

    PromptMsg := '컴퓨터에 기존 DiskSentinel Pro' + VerInfo + '가 이미 설치되어 있습니다.' + #13#10 +
                 '설치 디렉터리: ' + ExistingInstallDir + #13#10#13#10 +
                 '기존 버전을 어떻게 처리하시겠습니까?' + #13#10#13#10 +
                 '[예 (Yes)]    : 기존 버전을 완전히 삭제(제거)한 후 최신 버전(v{#AppVersion})을 새로 깨끗하게 설치합니다. (권장)' + #13#10 +
                 '[아니오 (No)] : 기존 버전을 삭제하지 않고 새 버전 파일로 그대로 덮어씁니다.' + #13#10 +
                 '[취소 (Cancel)]: 설치를 중단하고 종료합니다.';

    DialogRes := MsgBox(PromptMsg, mbConfirmation, MB_YESNOCANCEL);

    if DialogRes = IDYES then
    begin
      // User selected Clean Uninstall & Reinstall
      if ExistingUninstallStr <> '' then
      begin
        UninstExec := RemoveQuotes(ExistingUninstallStr);
        if Exec(UninstExec, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
        begin
          Sleep(1200);
          Result := True;
        end
        else
        begin
          MsgBox('기존 버전 자동 제거 중 오류가 발생했습니다. 제어판에서 수동 제거 후 다시 진행해 주십시오.', mbError, MB_OK);
          Result := False;
        end;
      end
      else
      begin
        // If uninstaller executable is missing, clean out previous installation files
        if (ExistingInstallDir <> '') and DirExists(ExistingInstallDir) then
        begin
          DelTree(ExistingInstallDir, True, True, True);
        end;
        Result := True;
      end;
    end
    else if DialogRes = IDNO then
    begin
      // User selected in-place Overwrite
      Result := True;
    end
    else
    begin
      // User selected Cancel
      Result := False;
    end;
  end;
end;
