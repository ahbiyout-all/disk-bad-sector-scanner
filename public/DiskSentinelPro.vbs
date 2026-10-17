' ===================================================================
' DiskSentinel Pro - Windows Silent Desktop Launcher (.vbs)
' Launches DiskSentinel Pro without showing a command prompt window
' ===================================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
indexPath = currentDir & "\index.html"

edgePath1 = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe")
edgePath2 = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")

fileUrl = "file:///" & Replace(indexPath, "\", "/")

If fso.FileExists(edgePath1) Then
    WshShell.Run """" & edgePath1 & """ --app=""" & fileUrl & """", 1, False
ElseIf fso.FileExists(edgePath2) Then
    WshShell.Run """" & edgePath2 & """ --app=""" & fileUrl & """", 1, False
Else
    WshShell.Run """" & indexPath & """", 1, False
End If
