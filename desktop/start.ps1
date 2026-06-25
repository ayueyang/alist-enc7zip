# alist-enc7zip 启动脚本（双击 start.bat 调用）
# 智能：已在运行则直接打开网页，未运行则启动后打开
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$NodeExe = Join-Path $ScriptDir 'node\node.exe'
$Enc7zipDir = Join-Path $ScriptDir 'node-proxy\dist'

function 写步($m) { Write-Host "`n>>> $m" -ForegroundColor Cyan }
function 写好($m) { Write-Host "[OK] $m" -ForegroundColor Green }
function 写警($m) { Write-Host "[!]  $m" -ForegroundColor Yellow }
function 写错($m) { Write-Host "[X]  $m" -ForegroundColor Red }

function 端口空闲($port) {
    try {
        $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        $l.Start(); $l.Stop(); return $true
    } catch { return $false }
}

function 检测enc7zip($port) {
    try {
        $r = Invoke-WebRequest "http://127.0.0.1:$port/public/index.html" -TimeoutSec 2 -UseBasicParsing
        return $r.StatusCode -eq 200
    } catch { return $false }
}

function 打开网页($port) {
    Start-Process "http://127.0.0.1:$port"
    Start-Sleep -Milliseconds 500
    Start-Process "http://127.0.0.1:$port/public/index.html"
}

# ============ 主流程 ============

Write-Host ''
Write-Host '======================================' -ForegroundColor Cyan
Write-Host '      alist-enc7zip 启动' -ForegroundColor Cyan
Write-Host '======================================' -ForegroundColor Cyan

$enc7zipPort = 5277

# 从 config.json 读取端口（如果存在）
$configFile = Join-Path $ScriptDir 'conf\config.json'
if (Test-Path $configFile) {
    try {
        $cfg = Get-Content $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cfg.port) { $enc7zipPort = $cfg.port }
    } catch {}
}

# 1. 检测是否已在运行
写步 "检测 enc7zip 是否已运行（端口 $enc7zipPort）"
if (-not (端口空闲 $enc7zipPort)) {
    if (检测enc7zip $enc7zipPort) {
        写好 'enc7zip 已在运行，直接打开网页'
        打开网页 $enc7zipPort
        Write-Host ''
        Write-Host 'enc7zip 已在运行，已为你打开网页。' -ForegroundColor Green
        Write-Host '如需停止，双击 stop.bat' -ForegroundColor White
        Read-Host "`n按回车键退出"
        exit 0
    } else {
        写警 "端口 $enc7zipPort 被其他程序占用，无法启动"
        Write-Host '  请先停止占用端口的程序，或双击 install.bat 重新配置端口' -ForegroundColor White
        Read-Host "`n按回车键退出"
        exit 1
    }
}

# 2. 检查文件
if (-not (Test-Path $NodeExe)) { 写错 '未找到 node\node.exe，压缩包不完整'; Read-Host '按回车退出'; exit 1 }
if (-not (Test-Path (Join-Path $Enc7zipDir 'index.js'))) { 写错 '未找到 node-proxy\dist\index.js，压缩包不完整'; Read-Host '按回车退出'; exit 1 }

# 3. 启动 enc7zip
写步 "启动 enc7zip（端口 $enc7zipPort）"
Write-Host '  服务启动中，请勿关闭此窗口...' -ForegroundColor White
Write-Host "  管理面板: http://127.0.0.1:$enc7zipPort/public/index.html (admin / admin123)" -ForegroundColor White
Write-Host "  代理入口: http://127.0.0.1:$enc7zipPort" -ForegroundColor White
Write-Host ''

# 后台启动 node.exe
$nodeProc = Start-Process $NodeExe -ArgumentList 'node-proxy\dist\index.js' -WorkingDirectory $ScriptDir -PassThru -WindowStyle Hidden

# 等待端口就绪，然后打开网页
$opened = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    if ($nodeProc.HasExited) {
        写错 "enc7zip 启动失败，进程已退出（退出代码: $($nodeProc.ExitCode)）"
        Write-Host "  请查看 logs\server.log 或重新运行 安装.bat" -ForegroundColor White
        Read-Host "`n按回车键退出"
        exit 1
    }
    if (-not $opened -and (检测enc7zip $enc7zipPort)) {
        写好 "enc7zip 已启动，打开网页"
        打开网页 $enc7zipPort
        $opened = $true
    }
}

if (-not $opened) {
    写警 "启动较慢，请稍候手动打开: http://127.0.0.1:$enc7zipPort"
}

# 等待 node 进程退出（保持窗口）
Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  enc7zip 运行中，保持此窗口不要关闭' -ForegroundColor Green
Write-Host '  关闭此窗口或按 Ctrl+C 可停止服务' -ForegroundColor White
Write-Host '========================================' -ForegroundColor Green
Write-Host ''

$nodeProc.WaitForExit()
