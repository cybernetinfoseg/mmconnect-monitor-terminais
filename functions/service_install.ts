@echo off
set SERVICE_NAME=Base44Agent
set EXE_PATH="%ProgramFiles%\Base44Agent\agent.exe"

sc stop %SERVICE_NAME% >nul 2>&1
sc delete %SERVICE_NAME% >nul 2>&1

sc create %SERVICE_NAME% binPath= %EXE_PATH% start= auto >nul
sc description %SERVICE_NAME% "Base44 Monitoring Agent" >nul

exit