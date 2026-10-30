' Launcher für den Autostart: kein Konsolenfenster.
' Findet sein eigenes Verzeichnis — läuft daher von jedem Ort.
Dim ordner, schale
schale = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("Wscript.Shell").CurrentDirectory = schale
CreateObject("Wscript.Shell").Run """" & schale & "\start.cmd""", 0, False