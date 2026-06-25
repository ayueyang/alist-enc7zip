# alist-enc7zip 桌面版安装脚本（小白友好）
# 双击 install.bat 调用本脚本
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$NodeExe     = Join-Path $ScriptDir 'node\node.exe'
$Enc7zipDir  = Join-Path $ScriptDir 'enc7zip'
$ConfDir     = Join-Path $ScriptDir 'conf'
$OpenlistDir = Join-Path $ScriptDir 'openlist'
$Desktop     = [Environment]::GetFolderPath('Desktop')

# 国内下载源
$OpenlistUrl         = 'https://gh-proxy.com/https://github.com/OpenListTeam/OpenList/releases/latest/download/openlist-windows-amd64.zip'
$OpenlistUrlFallback = 'https://ghfast.top/https://github.com/OpenListTeam/OpenList/releases/latest/download/openlist-windows-amd64.zip'

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

function 检测alist($port) {
    try {
        $r = Invoke-WebRequest "http://127.0.0.1:$port/api/public/settings" -TimeoutSec 2 -UseBasicParsing
        return $r.StatusCode -eq 200
    } catch { return $false }
}

function 打开网页($port) {
    Start-Process "http://127.0.0.1:$port"
    Start-Sleep -Milliseconds 500
    Start-Process "http://127.0.0.1:$port/public/index.html"
}

function 创建快捷方式($port) {
    # 代理入口
    $proxyUrl = Join-Path $Desktop 'alist-enc7zip 代理.url'
    @"
[InternetShortcut]
URL=http://127.0.0.1:$port
IconIndex=0
"@ | Out-File $proxyUrl -Encoding default -Force

    # 管理面板
    $adminUrl = Join-Path $Desktop 'alist-enc7zip 管理.url'
    @"
[InternetShortcut]
URL=http://127.0.0.1:$port/public/index.html
IconIndex=0
"@ | Out-File $adminUrl -Encoding default -Force

    写好 "桌面快捷方式已创建:"
    Write-Host "    - alist-enc7zip 代理 (http://127.0.0.1:$port)" -ForegroundColor White
    Write-Host "    - alist-enc7zip 管理 (http://127.0.0.1:$port/public/index.html)" -ForegroundColor White
}

function 下载文件($url, $dest) {
    Write-Host "    下载: $url"
    try { Invoke-WebRequest $url -OutFile $dest -TimeoutSec 300 -UseBasicParsing; return $true }
    catch { return $false }
}

function 安装openlist {
    写步 '下载 openlist（国内源）'
    $zip = Join-Path $ScriptDir 'openlist.zip'
    $ok = 下载文件 $OpenlistUrl $zip
    if (-not $ok) {
        写警 '主源失败，尝试备用源...'
        $ok = 下载文件 $OpenlistUrlFallback $zip
    }
    if (-not $ok) { 写错 '下载失败，请手动下载 openlist-windows-amd64.zip 解压到 openlist\ 目录后重跑'; exit 1 }
    写好 '下载完成'

    写步 '解压 openlist'
    if (Test-Path $OpenlistDir) { Remove-Item $OpenlistDir -Recurse -Force }
    Expand-Archive $zip -DestinationPath $OpenlistDir -Force
    Remove-Item $zip -Force
    $exe = Get-ChildItem $OpenlistDir -Filter 'openlist.exe' -Recurse | Select-Object -First 1
    if (-not $exe) { 写错 '解压后未找到 openlist.exe'; exit 1 }
    写好 "解压完成"

    写步 '首次启动生成数据库（5 秒）'
    $dataDir = Join-Path $OpenlistDir 'data'
    $p = Start-Process $exe.FullName -ArgumentList 'server','-d',$dataDir -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $OpenlistDir 'startup.log')
    Start-Sleep -Seconds 5
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    写好 '数据库已生成'

    写步 '设置 admin 密码为 123456'
    & $exe.FullName admin set 123456 -d $dataDir 2>&1 | Out-Host
    写好 'openlist 账号: admin / 123456'

    # 生成 openlist 启停脚本
    @"
@echo off
chcp 65001 >nul
cd /d `%~dp0
title openlist
start "" openlist\openlist.exe server -d openlist\data
echo openlist 已后台启动（端口 5244，账号 admin / 123456）
"@ | Out-File (Join-Path $ScriptDir 'openlist-start.bat') -Encoding default -Force
    @"
@echo off
taskkill /IM openlist.exe /F 2>nul
echo openlist 已停止
"@ | Out-File (Join-Path $ScriptDir 'openlist-stop.bat') -Encoding default -Force

    写步 '启动 openlist'
    Start-Process $exe.FullName -ArgumentList 'server','-d',$dataDir -WindowStyle Hidden
    Start-Sleep -Seconds 2
    写好 'openlist 已启动: http://127.0.0.1:5244 (admin / 123456)'
    return 5244
}

function 启动enc7zip($port) {
    Write-Host ">>> 启动 alist-enc7zip（端口 $port）..." -ForegroundColor Cyan
    Start-Process $NodeExe -ArgumentList 'enc7zip\index.js' -WorkingDirectory $ScriptDir -WindowStyle Minimized
    # 等待端口就绪
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        if (检测enc7zip $port) { 写好 "enc7zip 已启动"; return $true }
    }
    写警 'enc7zip 启动较慢，请稍候或查看 start.bat 控制台输出'
    return $false
}

# ============ 主流程 ============

Write-Host ''
Write-Host '======================================' -ForegroundColor Cyan
Write-Host '      alist-enc7zip 桌面版安装' -ForegroundColor Cyan
Write-Host '======================================' -ForegroundColor Cyan

# 1. 检测文件完整性
写步 '检测程序文件'
if (-not (Test-Path $NodeExe))    { 写错 '未找到 node\node.exe，压缩包不完整'; exit 1 }
if (-not (Test-Path (Join-Path $Enc7zipDir 'index.js'))) { 写错 '未找到 enc7zip\index.js，压缩包不完整'; exit 1 }
写好 '程序文件就绪'

# 2. 检测 enc7zip 是否已运行
写步 '检测 alist-enc7zip 是否已运行'
$enc7zipPort = 5277
if (-not (端口空闲 $enc7zipPort)) {
    if (检测enc7zip $enc7zipPort) {
        写好 '检测到 enc7zip 已在运行，直接打开网页'
        创建快捷方式 $enc7zipPort
        打开网页 $enc7zipPort
        Write-Host ''
        Write-Host 'enc7zip 已在运行，无需重复安装。' -ForegroundColor Green
        Write-Host '桌面已创建快捷方式，双击即可打开。' -ForegroundColor Green
        Read-Host "`n按回车键退出"
        exit 0
    } else {
        写警 "端口 $enc7zipPort 被其他程序占用"
        $input = Read-Host "请输入新的 enc7zip 端口 [5278]"
        if ($input -match '^\d+$') { $enc7zipPort = [int]$input }
        else { $enc7zipPort = 5278 }
        if (-not (端口空闲 $enc7zipPort)) {
            写错 "端口 $enc7zipPort 也被占用，请手动关闭占用程序后重试"
            exit 1
        }
    }
} else {
    写好 '端口 5277 空闲，可用'
}

# 3. 检测 alist/openlist
写步 '检测 alist / openlist 服务（端口 5244）'
$alistPort = 5244
if (检测alist $alistPort) {
    写好 "已检测到 alist/openlist 运行在 $alistPort 端口"
} else {
    写警 '未检测到 alist/openlist 运行'
    Write-Host ''
    Write-Host '  openlist 是 alist 的社区维护 fork（推荐）' -ForegroundColor White
    $choice = Read-Host "是否自动下载并启动 openlist？[Y/n] (默认 Y)"
    if ($choice -ne 'n' -and $choice -ne 'N') {
        $alistPort = 安装openlist
    } else {
        写警 '跳过下载，请自行安装 alist 或 openlist'
        $input = Read-Host "请输入 alist/openlist 端口 [默认 5244]"
        if ($input -match '^\d+$') { $alistPort = [int]$input }
        if (检测alist $alistPort) { 写好 "已检测到服务在 $alistPort 端口" }
        else { 写警 "端口 $alistPort 未检测到服务，请先启动 alist/openlist" }
    }
}

# 4. 生成配置文件
写步 '生成配置文件 conf/config.json'
if (-not (Test-Path $ConfDir)) { New-Item -ItemType Directory -Path $ConfDir | Out-Null }

$config = [ordered]@{
    alistServer = [ordered]@{
        name       = 'alist'
        path       = '/*'
        describe   = 'alist 配置'
        serverHost = '127.0.0.1'
        serverPort = $alistPort
        https      = $false
        passwdList = @(
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
        version            = 1
        enableGifDiskCache = $true
        enablePreviewAsync = $true
    }
}

$configFile = Join-Path $ConfDir 'config.json'
$json = $config | ConvertTo-Json -Depth 10
$json = $json -replace '"webdavServer":\s*""', '"webdavServer": []'
[System.IO.File]::WriteAllText($configFile, $json, [System.Text.UTF8Encoding]::new($false))
写好 "配置已写入: $configFile"

# 5. 创建桌面快捷方式
写步 '创建桌面快捷方式'
创建快捷方式 $enc7zipPort

# 6. 启动 enc7zip
写步 '启动 alist-enc7zip'
启动enc7zip $enc7zipPort | Out-Null

# 7. 打开网页
写步 '打开网页'
打开网页 $enc7zipPort

# 8. 完成
Write-Host ''
Write-Host '==========================================' -ForegroundColor Green
Write-Host '  安装完成！' -ForegroundColor Green
Write-Host '==========================================' -ForegroundColor Green
Write-Host ''
Write-Host '  桌面已创建两个快捷方式:' -ForegroundColor White
Write-Host '    - alist-enc7zip 代理  (访问加密后的 alist)' -ForegroundColor White
Write-Host '    - alist-enc7zip 管理  (配置加密，账号 admin / admin123)' -ForegroundColor White
Write-Host ''
Write-Host "  代理地址: http://127.0.0.1:$enc7zipPort" -ForegroundColor White
Write-Host "  管理面板: http://127.0.0.1:$enc7zipPort/public/index.html" -ForegroundColor White
if (检测alist $alistPort) {
    Write-Host "  alist/openlist: http://127.0.0.1:$alistPort" -ForegroundColor White
}
Write-Host ''
Write-Host '  日常使用: 双击桌面快捷方式即可打开' -ForegroundColor White
Write-Host '  停止服务: 双击 stop.bat' -ForegroundColor White
Write-Host ''
Read-Host '按回车键退出'
