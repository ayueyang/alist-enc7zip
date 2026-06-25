# alist-enc7zip 桌面版打包脚本（生成自解压 exe，内含完整项目）
# 用法: powershell -ExecutionPolicy Bypass -File build-package.ps1
# 产出: dist\alist-enc7zip-desktop-v<version>.exe
# 解压后: alist-enc7zip\ 文件夹下是完整项目根目录，含 安装.bat

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = Split-Path -Parent $ScriptDir
$NodeProxyDir = Join-Path $RepoRoot 'node-proxy'
$Version = (Get-Content (Join-Path $NodeProxyDir 'package.json') -Raw | ConvertFrom-Json).version

Write-Host ">>> 打包 alist-enc7zip 桌面版 v$Version（自解压 exe，内含完整项目）" -ForegroundColor Cyan

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

# 4. 准备打包目录（顶层文件夹 alist-enc7zip/）
Write-Host "`n>>> 准备打包目录..." -ForegroundColor Cyan
$staging = Join-Path $ScriptDir 'staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

$projectDir = Join-Path $staging 'alist-enc7zip'
New-Item -ItemType Directory -Path $projectDir | Out-Null

# 4a. 用 robocopy 拷贝整个项目源码（排除大目录和临时文件）
Write-Host "    拷贝项目源码（排除 .git/node_modules/cache/logs 等）..." -ForegroundColor White
$excludeDirs = @(
    '.git', 'node_modules', 'cache', 'logs', 'build', 'conf',
    'desktop', 'manager', 'docker-conf', 'test-videos',
    '.trae', '.vscode', '.idea', 'ts-out-dir'
)
$excludeFiles = @(
    '*.log', '*.bin', '*.tmp', 'token.txt', 'package-lock.json',
    'check_db.js', 'check_probe_detail.js', 'clear_cache.js',
    'test_api.js', 'test_api2.js', 'test_redirect.js',
    'webdavTest.js', 'btest.js', 'testAesCtr.html'
)
# robocopy 返回码 0-7 为成功，8+ 为失败
robocopy $RepoRoot $projectDir /E /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -gt 7) { throw "robocopy 失败: exit code $LASTEXITCODE" }
Write-Host '[OK] 项目源码拷贝完成' -ForegroundColor Green

# 4b. 拷贝桌面安装脚本到项目根目录
Write-Host "    拷贝安装脚本..." -ForegroundColor White
Copy-Item (Join-Path $ScriptDir '安装.bat')   $projectDir -Force
Copy-Item (Join-Path $ScriptDir 'install.ps1') $projectDir -Force
Copy-Item (Join-Path $ScriptDir 'start.bat')  $projectDir -Force
Copy-Item (Join-Path $ScriptDir 'start.ps1')  $projectDir -Force
Copy-Item (Join-Path $ScriptDir 'stop.bat')   $projectDir -Force
Copy-Item (Join-Path $ScriptDir 'README.txt') $projectDir -Force

# 4c. 拷贝 node.exe 到项目根目录的 node\
New-Item -ItemType Directory -Path (Join-Path $projectDir 'node') -Force | Out-Null
Copy-Item $nodeExe (Join-Path $projectDir 'node\node.exe') -Force
Write-Host '[OK] 文件就绪' -ForegroundColor Green

# 5. 生成 SFX 配置 config.txt（UTF-8 no BOM，支持中文 RunProgram）
# RunProgram 用相对路径 alist-enc7zip\安装.bat 指向解压后的项目根目录
$configTxt = Join-Path $ScriptDir 'config.txt'
$configContent = @"
;!@Install@!UTF-8!
Title="alist-enc7zip Desktop"
BeginPrompt="Extract and install alist-enc7zip?"
ExtractDialogText="Extracting, please wait..."
ExtractTitle="alist-enc7zip"
ExtractPath="yes"
RunProgram="alist-enc7zip\安装.bat"
;!@InstallEnd@!
"@
[System.IO.File]::WriteAllText($configTxt, $configContent, [System.Text.UTF8Encoding]::new($false))
Write-Host '[OK] SFX 配置生成' -ForegroundColor Green

# 6. 打包 archive.7z（打包 staging 下的 alist-enc7zip 文件夹）
Write-Host "`n>>> 打包 archive.7z..." -ForegroundColor Cyan
$archive = Join-Path $ScriptDir 'archive.7z'
if (Test-Path $archive) { Remove-Item $archive -Force }
& $sevenZr a $archive (Join-Path $staging 'alist-enc7zip') -mx=9 | Out-Null
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
Write-Host "用户使用: 双击 exe → 选目录 → 自动解压到 alist-enc7zip\ 文件夹 → 运行 安装.bat" -ForegroundColor Cyan
