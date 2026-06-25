@echo off
chcp 65001 >nul
echo [*] 停止 alist-enc7zip...
taskkill /FI "WINDOWTITLE eq alist-enc7zip*" /F 2>nul
taskkill /IM node.exe /F 2>nul
echo [OK] 已停止
pause
