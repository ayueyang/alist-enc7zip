# alist-enc7zip 桌面版打包脚本（生成自解压 exe）
# 用法: powershell -ExecutionPolicy Bypass -File build-package.ps1
# 产出: dist\alist-enc7zip-desktop-v<version>.exe

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = Split-Path -Parent $ScriptDir
$NodeProxyDir = Join-Path $RepoRoot 'node-proxy'
$Version = (Get-Content (Join-Path $NodeProxyDir 'package.json') -Raw | ConvertFrom-Json).version

Write-Host ">>> 打包 alist-enc7zip 桌面版 v$Version（自解压 exe）" -ForegroundColor Cyan

# 1. 构建 enc7zip webpack dist
Write-Host "`n>>> 构建 enc7zip dist..." -ForegroundColor Cyan
Push-Location $NodeProxyDir
if (-not (Test-Path 'node_modules')) { npm install --omit=dev }
npm run webpack
Pop-Location
$distDir = Join-Path $NodeProxyDir 'dist'
if (-not (Test-Path (Join-Path $distDir 'index.js'))) { throw 'webpack 构建失败' }
Write-Host '[OK] dist 构建完成' -ForegroundColor Green

# 2. 下载 Node.js 18 LTS (win-x64) - 国内源
$nodeVersion = 'v18.20.4'
$nodeUrl = "https://npmmirror.com/mirrors/node/$nodeVersion/node-$nodeVersion-win-x64.zip"
$nodeExe = Join-Path $ScriptDir 'node\node.exe'

if (-not (Test-Path $nodeExe)) {
    Write-Host "`n>>> 下载 Node.js $nodeVersion (npmmirror)..." -ForegroundColor Cyan
    $nodeZip = Join-Path $ScriptDir 'node.zip'
    Invoke-WebRequest $nodeUrl -OutFile $nodeZip -UseBasicParsing
    $nodeExtract = Join-Path $ScriptDir 'node-extract'
    if (Test-Path $nodeExtract) { Remove-Item $nodeExtract -Recurse -Force }
    Expand-Archive $nodeZip -DestinationPath $nodeExtract -Force
    $extractedExe = Get-ChildItem $nodeExtract -Filter 'node.exe' -Recurse | Select-Object -First 1
    New-Item -ItemType Directory -Path (Join-Path $ScriptDir 'node') -Force | Out-Null
    Copy-Item $extractedExe.FullName $nodeExe -Force
    Remove-Item $nodeZip, $nodeExtract -Recurse -Force
    Write-Host '[OK] node.exe 就绪' -ForegroundColor Green
} else {
    Write-Host '[OK] node.exe 已存在，跳过下载' -ForegroundColor Green
}

# 3. 下载 7z 工具（用于生成自解压 exe）
$toolDir = Join-Path $ScriptDir '7z-tool'
if (-not (Test-Path $toolDir)) { New-Item -ItemType Directory -Path $toolDir | Out-Null }
$sevenZr = Join-Path $toolDir '7zr.exe'
$sfxModule = Join-Path $toolDir '7zSD.sfx'

if (-not (Test-Path $sevenZr)) {
    Write-Host "`n>>> 下载 7zr.exe..." -ForegroundColor Cyan
    Invoke-WebRequest 'https://www.7-zip.org/a/7zr.exe' -OutFile $sevenZr -UseBasicParsing
    Write-Host '[OK] 7zr.exe 就绪' -ForegroundColor Green
}

if (-not (Test-Path $sfxModule)) {
    Write-Host ">>> 下载 7z SFX 模块..." -ForegroundColor Cyan
    $extraZip = Join-Path $toolDir '7z-extra.7z'
    Invoke-WebRequest 'https://www.7-zip.org/a/7z2405-extra.7z' -OutFile $extraZip -UseBasicParsing
    & $sevenZr x $extraZip "-o$toolDir" -y | Out-Null
    Remove-Item $extraZip -Force
    if (-not (Test-Path $sfxModule)) { throw '未找到 7zSD.sfx 模块' }
    Write-Host '[OK] 7zSD.sfx 就绪' -ForegroundColor Green
}

# 4. 准备打包目录
Write-Host "`n>>> 准备打包目录..." -ForegroundColor Cyan
$staging = Join-Path $ScriptDir 'staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

Copy-Item (Join-Path $ScriptDir 'install.bat') $staging
Copy-Item (Join-Path $ScriptDir 'install.ps1') $staging
Copy-Item (Join-Path $ScriptDir 'start.bat') $staging
Copy-Item (Join-Path $ScriptDir 'start.ps1') $staging
Copy-Item (Join-Path $ScriptDir 'stop.bat') $staging
Copy-Item (Join-Path $ScriptDir 'README.txt') $staging

New-Item -ItemType Directory -Path (Join-Path $staging 'node') | Out-Null
Copy-Item $nodeExe (Join-Path $staging 'node\node.exe')

Copy-Item $distDir (Join-Path $staging 'enc7zip') -Recurse
Write-Host '[OK] 文件就绪' -ForegroundColor Green

# 5. 生成 SFX 配置 config.txt（ASCII，避免 BOM 问题）
$configTxt = Join-Path $ScriptDir 'config.txt'
$configContent = @"
;!@Install@!UTF-8!
Title="alist-enc7zip Desktop"
BeginPrompt="Install alist-enc7zip? (will extract and run install.bat)"
ExtractDialogText="Extracting, please wait..."
ExtractTitle="alist-enc7zip"
ExtractPath="yes"
RunProgram="install.bat"
;!@InstallEnd@!
"@
[System.IO.File]::WriteAllText($configTxt, $configContent, [System.Text.Encoding]::ASCII)
Write-Host '[OK] SFX 配置生成' -ForegroundColor Green

# 6. 打包 archive.7z
Write-Host "`n>>> 打包 archive.7z..." -ForegroundColor Cyan
$archive = Join-Path $ScriptDir 'archive.7z'
if (Test-Path $archive) { Remove-Item $archive -Force }
& $sevenZr a $archive (Join-Path $staging '*') -mx=9 | Out-Null
if (-not (Test-Path $archive)) { throw '7z 打包失败' }
Write-Host '[OK] archive.7z 打包完成' -ForegroundColor Green

# 7. 组装自解压 exe: 7zSD.sfx + config.txt + archive.7z
Write-Host "`n>>> 组装自解压 exe..." -ForegroundColor Cyan
$distOut = Join-Path $ScriptDir 'dist'
if (-not (Test-Path $distOut)) { New-Item -ItemType Directory -Path $distOut | Out-Null }
$outputExe = Join-Path $distOut "alist-enc7zip-desktop-v$Version.exe"
if (Test-Path $outputExe) { Remove-Item $outputExe -Force }

$sfx = [System.IO.File]::ReadAllBytes($sfxModule)
$cfg = [System.IO.File]::ReadAllBytes($configTxt)
$arc = [System.IO.File]::ReadAllBytes($archive)
$combined = New-Object byte[] ($sfx.Length + $cfg.Length + $arc.Length)
[System.Array]::Copy($sfx, 0, $combined, 0, $sfx.Length)
[System.Array]::Copy($cfg, 0, $combined, $sfx.Length, $cfg.Length)
[System.Array]::Copy($arc, 0, $combined, $sfx.Length + $cfg.Length, $arc.Length)
[System.IO.File]::WriteAllBytes($outputExe, $combined)

# 清理临时
Remove-Item $staging, $archive, $configTxt -Recurse -Force -ErrorAction SilentlyContinue

$size = (Get-Item $outputExe).Length / 1MB
Write-Host ""
Write-Host "[OK] 打包完成: $outputExe" -ForegroundColor Green
Write-Host "[OK] 大小: $([math]::Round($size, 1)) MB" -ForegroundColor Green
Write-Host ""
Write-Host "用户使用: 双击 exe → 选目录 → 自动运行 install.bat → 桌面生成快捷方式" -ForegroundColor Cyan
