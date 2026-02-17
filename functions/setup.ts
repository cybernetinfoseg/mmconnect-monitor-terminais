[Setup]
AppName=Base44 Monitoring Agent
AppVersion=1.0
DefaultDirName={pf}\Base44Agent
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=Base44AgentSetup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin

[Files]
Source: "dist\agent.exe"; DestDir: "{app}"
Source: "service_install.bat"; DestDir: "{app}"

[Run]
Filename: "{app}\agent.exe"; Description: "Configurar API na primeira execução"; Flags: nowait postinstall
Filename: "{app}\service_install.bat"; Flags: runhidden waituntilterminated