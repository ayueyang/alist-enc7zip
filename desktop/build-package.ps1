# alist-enc7zip 桌面版打包脚本
# 用法: powershell -ExecutionPolicy Bypass -File build-package.ps1
# 产出: dist\alist-enc7zip-desktop-v<version>.zip

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot = Split-Path -Parent $ScriptDir
$NodeProxyDir = Join-Path $RepoRoot 'node-proxy'
$Version = (Get-Content (Join-Path $NodeProxyDir 'package.json') | ConvertFrom-Json).version

Write-Host "[*] 打包 alist-enc7zip 桌面版 v$Version" -ForegroundColor Cyan

# 1. 构建 enc7zip webpack dist
Write-Host "[*] 构建 enc7zip dist..." -ForegroundColor Cyan
Push-Location $NodeProxyDir
if (-not (Test-Path 'node_modules')) {
    npm install --omit=dev
}
npm run webpack
Pop-Location
$distDir = Join-Path $NodeProxyDir 'dist'
if (-not (Test-Path (Join-Path $distDir 'index.js'))) {
    throw 'webpack 构建失败，未生成 dist/index.js'
}
Write-Host "[OK] dist 构建完成" -ForegroundColor Green

# 2. 下载 Node.js 18 LTS (win-x64)
$nodeVersion = 'v18.20.4'
$nodeUrl = "https://npmmirror.com/mirrors/node/$nodeVersion/node-$nodeVersion-win-x64.zip"
$nodeZip = Join-Path $ScriptDir 'node.zip'
$nodeExe = Join-Path $ScriptDir 'node\node.exe'

if (-not (Test-Path $nodeExe)) {
    Write-Host "[*] 下载 Node.js $nodeVersion (国内源 npmmirror)..." -ForegroundColor Cyan
    Invoke-WebRequest $nodeUrl -OutFile $nodeZip -UseBasicParsing
    Write-Host "[OK] 下载完成" -ForegroundColor Green

    Write-Host "[*] 解压并提取 node.exe..." -ForegroundColor Cyan
    $nodeExtract = Join-Path $ScriptDir 'node-extract'
    if (Test-Path $nodeExtract) { Remove-Item $nodeExtract -Recurse -Force }
    Expand-Archive $nodeZip -DestinationPath $nodeExtract -Force
    $extractedExe = Get-ChildItem $nodeExtract -Filter 'node.exe' -Recurse | Select-Object -First 1
    New-Item -ItemType Directory -Path (Join-Path $ScriptDir 'node') -Force | Out-Null
    Copy-Item $extractedExe.FullName $nodeExe -Force
    Remove-Item $nodeZip -Force
    Remove-Item $nodeExtract -Recurse -Force
    Write-Host "[OK] node.exe 就绪" -ForegroundColor Green
} else {
    Write-Host "[OK] node.exe 已存在，跳过下载" -ForegroundColor Green
}

# 3. 准备打包目录
$staging = Join-Path $ScriptDir 'staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

# 拷贝脚本
Copy-Item (Join-Path $ScriptDir 'install.bat') $staging
Copy-Item (Join-Path $ScriptDir 'install.ps1') $staging
Copy-Item (Join-Path $ScriptDir 'start.bat') $staging
Copy-Item (Join-Path $ScriptDir 'stop.bat') $staging
Copy-Item (Join-Path $ScriptDir 'README.txt') $staging

# 拷贝 node
New-Item -ItemType Directory -Path (Join-Path $staging 'node') | Out-Null
Copy-Item $nodeExe (Join-Path $staging 'node\node.exe')

# 拷贝 enc7zip dist
Copy-Item $distDir (Join-Path $staging 'enc7zip') -Recurse

# 4. 打包 zip
$distOut = Join-Path $ScriptDir 'dist'
if (-not (Test-Path $distOut)) { New-Item -ItemType Directory -Path $distOut | Out-Null }
$zipName = "alist-enc7zip-desktop-v$Version.zip"
$zipPath = Join-Path $distOut $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Write-Host "[*] 打包 $zipName..." -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
Remove-Item $staging -Recurse -Force

$size = (Get-Item $zipPath).Length / 1MB
Write-Host ""
Write-Host "[OK] 打包完成: $zipPath" -ForegroundColor Green
Write-Host "[OK] 大小: $([math]::Round($size, 1)) MB" -ForegroundColor Green
Write-Host ""
Write-Host "用户使用: 解压 zip → 双击 install.bat → 双击 start.bat" -ForegroundColor Cyan
