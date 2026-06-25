@echo off
chcp 65001 >nul
title 停止 alist-enc7zip
echo >>> 停止 alist-enc7zip...
taskkill /FI "WINDOWTITLE eq alist-enc7zip*" /F 2>nul
taskkill /IM node.exe /F 2>nul
echo [OK] 已停止 enc7zip
echo.
echo 是否同时停止 openlist？
choice /C YN /M "Y=停止 N=不停止"
if errorlevel 2 goto done
taskkill /IM openlist.exe /F 2>nul
echo [OK] 已停止 openlist
:done
echo.
pause
