' Maktaba — تشغيل بدون نافذة CMD
Option Explicit
Dim sh, fso, root, electron, args
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root

If Not fso.FileExists(root & "\apps\web\dist\index.html") Then
  sh.Run "cmd /c """ & root & "\build-desktop.bat""", 1, True
End If

If Not fso.FileExists(root & "\node_modules\electron\dist\electron.exe") Then
  sh.Run "cmd /c cd /d """ & root & """ && npm install", 1, True
End If

electron = root & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electron) Then
  MsgBox "تعذر العثور على Electron. شغّل build-desktop.bat أولاً.", 16, "Maktaba"
  WScript.Quit 1
End If

' 0 = نافذة مخفية للعملية المساعدة — نافذة التطبيق تظهر من Electron
sh.Run """" & electron & """ """ & root & """", 0, False
