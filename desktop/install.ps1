# alist-enc7zip 桌面安装脚本
# 双击 install.bat 调用本脚本
# 用法: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$NodeExe = Join-Path $ScriptDir 'node\node.exe'
$Enc7zipDir = Join-Path $ScriptDir 'enc7zip'
$ConfDir = Join-Path $ScriptDir 'conf'
$OpenlistDir = Join-Path $ScriptDir 'openlist'

function Write-Step($msg) { Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[!]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[X]  $msg" -ForegroundColor Red }

# 国内源（gh-proxy.com 是通用 GitHub 代理）
$OpenlistUrl = 'https://gh-proxy.com/https://github.com/OpenListTeam/OpenList/releases/latest/download/openlist-windows-amd64.zip'
$OpenlistUrlFallback = 'https://ghfast.top/https://github.com/OpenListTeam/OpenList/releases/latest/download/openlist-windows-amd64.zip'

function Test-AlistRunning($port) {
    try {
        $r = Invoke-WebRequest "http://127.0.0.1:$port/api/public/settings" -TimeoutSec 2 -UseBasicParsing
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Test-PortFree($port) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

function Download-File($url, $dest) {
    Write-Host "    下载: $url"
    try {
        Invoke-WebRequest $url -OutFile $dest -TimeoutSec 300 -UseBasicParsing
        return $true
    } catch {
        return $false
    }
}

function Install-Openlist {
    Write-Step '下载 openlist（国内源）'
    $zip = Join-Path $ScriptDir 'openlist.zip'
    $ok = Download-File $OpenlistUrl $zip
    if (-not $ok) {
        Write-Warn "主源失败，尝试备用源..."
        $ok = Download-File $OpenlistUrlFallback $zip
    }
    if (-not $ok) {
        Write-Err '下载失败，请手动下载 openlist-windows-amd64.zip 解压到 openlist\ 目录后重跑本脚本'
        exit 1
    }
    Write-Ok '下载完成'

    Write-Step '解压 openlist'
    if (Test-Path $OpenlistDir) { Remove-Item $OpenlistDir -Recurse -Force }
    Expand-Archive $zip -DestinationPath $OpenlistDir -Force
    Remove-Item $zip -Force
    $openlistExe = Get-ChildItem $OpenlistDir -Filter 'openlist.exe' -Recurse | Select-Object -First 1
    if (-not $openlistExe) {
        Write-Err '解压后未找到 openlist.exe'
        exit 1
    }
    Write-Ok "解压完成: $($openlistExe.FullName)"

    Write-Step '首次启动生成数据库（5 秒）'
    $dataDir = Join-Path $OpenlistDir 'data'
    $p = Start-Process $openlistExe.FullName -ArgumentList 'server', '-d', $dataDir -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $OpenlistDir 'startup.log')
    Start-Sleep -Seconds 5
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Write-Ok '数据库已生成'

    Write-Step '设置 admin 密码为 123456'
    & $openlistExe.FullName admin set 123456 -d $dataDir 2>&1 | Out-Host
    Write-Ok '密码已设置: admin / 123456'

    # 生成 openlist 启动/停止脚本
    $startBat = Join-Path $ScriptDir 'openlist-start.bat'
    $stopBat = Join-Path $ScriptDir 'openlist-stop.bat'
    $relExe = Resolve-Path $openlistExe.FullName -Relative
    @"
@echo off
cd /d `%~dp0
title openlist
start "" openlist\openlist.exe server -d openlist\data
echo openlist 已后台启动（端口 5244）
"@ | Out-File $startBat -Encoding default

    @"
@echo off
taskkill /IM openlist.exe /F 2>nul
echo openlist 已停止
pause
"@ | Out-File $stopBat -Encoding default

    # 后台启动 openlist
    Write-Step '启动 openlist'
    Start-Process $openlistExe.FullName -ArgumentList 'server', '-d', $dataDir -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Write-Ok 'openlist 已启动: http://127.0.0.1:5244 (admin / 123456)'

    return 5244
}

# ============ 主流程 ============

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  alist-enc7zip 桌面安装' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

# 1. 检测 node
Write-Step '检测 Node.js 运行时'
if (Test-Path $NodeExe) {
    $ver = & $NodeExe --version
    Write-Ok "内嵌 Node: $ver"
} else {
    Write-Err "未找到 node\node.exe，请重新下载完整压缩包"
    exit 1
}

# 2. 检测 enc7zip dist
Write-Step '检测 enc7zip 程序文件'
$enc7zipIndex = Join-Path $Enc7zipDir 'index.js'
if (-not (Test-Path $enc7zipIndex)) {
    Write-Err "未找到 enc7zip\index.js，请重新下载完整压缩包"
    exit 1
}
Write-Ok 'enc7zip 程序文件就绪'

# 3. 检测 alist/openlist
Write-Step '检测 alist/openlist 服务（端口 5244）'
$alistPort = 5244
$alistRunning = Test-AlistRunning $alistPort

if ($alistRunning) {
    Write-Ok "已检测到 alist/openlist 运行在 5244 端口"
} else {
    Write-Warn '未检测到 alist/openlist 运行'
    Write-Host ''
    Write-Host '  openlist 是 alist 的社区维护 fork，推荐使用' -ForegroundColor White
    $choice = Read-Host "是否自动下载并启动 openlist？[Y/n] (默认 Y)"
    if ($choice -ne 'n' -and $choice -ne 'N') {
        $alistPort = Install-Openlist
        $alistRunning = $true
    } else {
        Write-Warn '跳过下载。请确保你已自行安装 alist 或 openlist'
        $input = Read-Host "请输入 alist/openlist 端口 [默认 5244]"
        if ($input -match '^\d+$') { $alistPort = [int]$input }
        $alistRunning = Test-AlistRunning $alistPort
        if ($alistRunning) {
            Write-Ok "已检测到服务在 $alistPort 端口"
        } else {
            Write-Warn "端口 $alistPort 未检测到服务，请确认 alist/openlist 已启动"
        }
    }
}

# 4. 询问 enc7zip 端口
Write-Step '配置 alist-enc7zip 端口'
$enc7zipPort = 5277
$input = Read-Host "请输入 alist-enc7zip 监听端口 [默认 5277]"
if ($input -match '^\d+$') { $enc7zipPort = [int]$input }
if (-not (Test-PortFree $enc7zipPort)) {
    Write-Warn "端口 $enc7zipPort 被占用，尝试 5278/5279..."
    foreach ($try in 5278,5279,5280) {
        if (Test-PortFree $try) { $enc7zipPort = $try; break }
    }
}
Write-Ok "enc7zip 端口: $enc7zipPort"

# 5. 生成 conf/config.json
Write-Step '生成配置文件 conf/config.json'
if (-not (Test-Path $ConfDir)) { New-Item -ItemType Directory -Path $ConfDir | Out-Null }

$config = [ordered]@{
    alistServer = [ordered]@{
        name        = 'alist'
        path        = '/*'
        describe    = 'alist 配置'
        serverHost  = '127.0.0.1'
        serverPort  = $alistPort
        https       = $false
        passwdList  = @(
            [ordered]@{
                password                             = '123456'
                describe                             = '默认加密配置（请到管理面板修改）'
                encType                              = 'aesctr'
                enable                               = $true
                encName                              = $true
                zipInfoCache                         = $true
                zipInfoCacheDays                     = 30
                zipAutoCache                         = $false
                sevenZipAesCbcAutoCache              = $false
                sevenZipAesCbcPreview                = $true
                sevenZipAesCbcPreviewQuality         = 'high'
                sevenZipAesCbcPreviewDurationSeconds = 6
                encSuffix                            = ''
                encPath                              = @('encrypt_folder/*')
                encFolder                            = $false
                encFolderShift                       = 1
            }
        )
    }
    webdavServer = @()
    port         = $enc7zipPort
    proxyCache   = [ordered]@{
        version             = 1
        enableGifDiskCache  = $true
        enablePreviewAsync  = $true
    }
}

$configFile = Join-Path $ConfDir 'config.json'
$json = $config | ConvertTo-Json -Depth 10
# ConvertTo-Json 会把 @() 输出为 ""，需修正 webdavServer 为 []
$json = $json -replace '"webdavServer":\s*""', '"webdavServer": []'
[System.IO.File]::WriteAllText($configFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Ok "配置已写入: $configFile"

# 6. 完成
Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  安装完成！' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''
Write-Host '  启动方式: 双击 start.bat' -ForegroundColor White
Write-Host "  enc7zip 地址: http://127.0.0.1:$enc7zipPort" -ForegroundColor White
Write-Host "  管理面板: http://127.0.0.1:$enc7zipPort/public/index.html (admin / admin123)" -ForegroundColor White
if ($alistRunning) {
    Write-Host "  alist/openlist: http://127.0.0.1:$alistPort" -ForegroundColor White
}
Write-Host ''
Write-Host '  首次使用:' -ForegroundColor White
Write-Host '    1. 双击 start.bat 启动 enc7zip' -ForegroundColor White
Write-Host '    2. 浏览器打开管理面板配置加密（账号 admin 密码 admin123）' -ForegroundColor White
Write-Host '    3. 访问 http://127.0.0.1:'"$enc7zipPort"' 即 alist 的加密代理入口' -ForegroundColor White
Write-Host ''
pause
