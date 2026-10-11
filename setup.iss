; =====================================================================
; DiskSentinel Pro (디스크 배드섹터 검사기) - Inno Setup Configuration
; Author: AhBiYout-all
; Version: Dynamic Preprocessor ({#AppVersion})
; SPDX-License-Identifier: Apache-2.0
; =====================================================================

#ifndef AppVersion
#define AppVersion "4.4.0"
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

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Unpacked individual files from the Vite production build
Source: "dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\DiskSentinel Pro"; Filename: "{app}\index.html"
Name: "{autodesktop}\DiskSentinel Pro"; Filename: "{app}\index.html"; Tasks: desktopicon

[Run]
; Silently Register Firewall Inbound Rules on Install (Standard Name and Version-Appended Name)
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""DiskSentinel Pro"" dir=in action=allow program=""{app}\DiskSentinelPro.exe"" enable=yes"; Flags: runhidden; StatusMsg: "Registering standard firewall rule..."
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""DiskSentinel Pro v{#AppVersion}"" dir=in action=allow program=""{app}\DiskSentinelPro.exe"" enable=yes"; Flags: runhidden; StatusMsg: "Registering version-appended firewall rule..."

[UninstallRun]
; Clean up Firewall Rules on Uninstall with RunOnceId to eliminate installer warning
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""DiskSentinel Pro"""; Flags: runhidden; RunOnceId: "DelFirewallRuleStandard"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""DiskSentinel Pro v{#AppVersion}"""; Flags: runhidden; RunOnceId: "DelFirewallRuleVersioned"

[Code]
// Helper function to detect previous installations and prompt for uninstallation or overwrite
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  UninstallPath: String;
  PromptMsg: String;
begin
  Result := True;
  
  // Check if uninstaller registry key exists for the app id
  if RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{C6A035D4-733E-4B02-86A5-927A7B056D0D}_is1', 'UninstallString', UninstallPath) or
     RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{C6A035D4-733E-4B02-86A5-927A7B056D0D}_is1', 'UninstallString', UninstallPath) then
  begin
    PromptMsg := '기존 버전의 DiskSentinel Pro가 이미 컴퓨터에 설치되어 있습니다.' + #13#10#13#10 +
                 '기존 버전을 완전히 삭제하고 새 버전({#AppVersion})을 새로 덮어쓰시겠습니까?';
                 
    if MsgBox(PromptMsg, mbConfirmation, MB_YESNO) = IDYES then
    begin
      // Execute uninstaller silently
      if Exec(RemoveQuotes(UninstallPath), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
      begin
        // Wait a short duration to ensure file locks are released
        Sleep(1000);
        Result := True;
      end
      else
      begin
        MsgBox('기존 버전 삭제 중 오류가 발생하였습니다. 수동으로 삭제 후 다시 진행해주세요.', mbError, MB_OK);
        Result := False;
      end;
    end
    else
    begin
      // The user chose No. Continue with standard install/overwrite.
      Result := True;
    end;
  end;
end;
