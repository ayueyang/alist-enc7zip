@echo off
chcp 65001 >nul
cd /d %~dp0
title alist-enc7zip 启动
powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
