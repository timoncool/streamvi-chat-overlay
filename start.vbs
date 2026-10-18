Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Then
  MsgBox "Electron не установлен. Выполни: npm install", 16, "StreamVi Chat Overlay"
  WScript.Quit 1
End If
sh.Run """" & exe & """ """ & dir & """", 0, False
