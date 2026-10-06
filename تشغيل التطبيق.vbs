Option Explicit
Dim sh, fso, root, electron, logFile, rc
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root
logFile = root & "\data\launch-log.txt"

If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")

Sub Log(msg)
  Dim ts
  Set ts = fso.OpenTextFile(logFile, 8, True)
  ts.WriteLine Now & " - " & msg
  ts.Close
End Sub

Log "start root=" & root

If Not fso.FileExists(root & "\apps\web\dist\index.html") Then
  Log "missing web dist - running build-desktop.bat"
  MsgBox "الواجهة غير مبنية. سيتم البناء الآن (قد يستغرق دقائق).", 64, "Maktaba"
  rc = sh.Run("cmd /c cd /d """ & root & """ && build-desktop.bat", 1, True)
  Log "build exit=" & rc
End If

If Not fso.FileExists(root & "\apps\web\dist\index.html") Then
  MsgBox "فشل البناء. شغّل build-desktop.bat يدويًا من PowerShell:" & vbCrLf & ".\build-desktop.bat", 16, "Maktaba"
  WScript.Quit 1
End If

If Not fso.FileExists(root & "\apps\api\dist\main.js") Then
  Log "missing api dist - running build"
  MsgBox "سيتم بناء الخادم المحلي...", 64, "Maktaba"
  sh.Run "cmd /c cd /d """ & root & """ && build-desktop.bat", 1, True
End If

If Not fso.FileExists(root & "\node_modules\electron\dist\electron.exe") Then
  Log "installing electron"
  MsgBox "تثبيت Electron...", 64, "Maktaba"
  sh.Run "cmd /c cd /d """ & root & """ && npm install", 1, True
End If

electron = root & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electron) Then
  MsgBox "Electron غير موجود." & vbCrLf & "من PowerShell:" & vbCrLf & "cd " & root & vbCrLf & "npm install" & vbCrLf & ".\build-desktop.bat", 16, "Maktaba"
  WScript.Quit 1
End If

' قتل عمليات قديمة قد تمنع القفل
sh.Run "cmd /c taskkill /IM electron.exe /F >nul 2>&1", 0, True

Log "launching electron"
' تشغيل من مجلد المشروع: electron .
rc = sh.Run("cmd /c cd /d """ & root & """ && """ & electron & """ .", 0, False)
Log "Run returned " & rc
