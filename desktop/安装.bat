@echo off
chcp 65001 >nul
cd /d %~dp0
title alist-enc7zip 安装
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
