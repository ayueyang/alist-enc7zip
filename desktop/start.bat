@echo off
chcp 65001 >nul
cd /d %~dp0
title alist-enc7zip

if not exist "node\node.exe" (
    echo [X] 未找到 node\node.exe，请重新下载完整压缩包
    pause
    exit /b 1
)

if not exist "enc7zip\index.js" (
    echo [X] 未找到 enc7zip\index.js，请重新下载完整压缩包
    pause
    exit /b 1
)

if not exist "conf\config.json" (
    echo [!] 未检测到配置文件，首次使用请先双击 install.bat
    echo     或直接启动将使用默认配置（alist 端口 5244，enc7zip 端口 5277）
    echo.
)

echo [*] 启动 alist-enc7zip...
echo [*] 管理面板: http://127.0.0.1:5277/public/index.html (admin / admin123)
echo [*] 代理入口: http://127.0.0.1:5277
echo [*] 按 Ctrl+C 停止
echo.
node\node.exe enc7zip\index.js
pause
