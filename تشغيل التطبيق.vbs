Option Explicit
Dim sh, fso, root, electron
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root

If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")

If Not fso.FileExists(root & "\apps\web\dist\index.html") Or Not fso.FileExists(root & "\apps\api\dist\main.js") Then
  MsgBox "يلزم البناء أولاً. سيتم تشغيل build-desktop.bat", 64, "Maktaba"
  sh.Run "cmd /c cd /d """ & root & """ && build-desktop.bat", 1, True
End If

If Not fso.FileExists(root & "\node_modules\electron\dist\electron.exe") Then
  MsgBox "تثبيت Electron...", 64, "Maktaba"
  sh.Run "cmd /c cd /d """ & root & """ && npm install", 1, True
End If

electron = root & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electron) Then
  MsgBox "Electron غير موجود. من PowerShell:" & vbCrLf & "npm install" & vbCrLf & ".\build-desktop.bat", 16, "Maktaba"
  WScript.Quit 1
End If

' تشغيل مباشر بدون cmd /c حتى لا تُقتل عملية الـ API
sh.CurrentDirectory = root
sh.Run """" & electron & """ .", 1, False
