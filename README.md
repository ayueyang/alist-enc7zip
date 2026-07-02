# alist-enc7zip

基于 [alist-encrypt](https://github.com/traceless/alist-encrypt) 的加密代理增强版。

一个 alist 透明加密代理：上传时加密、下载/播放时解密。加密后的文件存于网盘，云盘无法扫描识别内容，防止资源被删除。同时支持在线播放加密视频、浏览加密图片，WebDAV 客户端操作透明无感。

## 加密方式

本项目支持两大类加密方式，均可在上传时自动加密、下载/播放时自动解密。

### 标准压缩包加密（推荐 · 适合在线播放与分享）

本项目核心增强功能，生成**标准压缩包格式**的加密文件：

- **7z-AES-CBC** — 7-Zip 标准 AES-256-CBC 加密的 `.7z` 压缩包
- **WinZip-AES-CTR** — WinZip 标准 AES-256-CTR 加密的 `.zip` 压缩包

**两大优势**：

1. **在线播放**：通过代理可直接播放压缩包内的视频，无需先解压下载；支持子目录浏览、GIF 缩略图预览（7z-AES-CBC）。
2. **文件分享**：生成的文件是标准压缩包，接收方**无需安装任何额外软件**，用 7-Zip、WinZip、Bandizip 等常见解压工具输入密码即可解压使用。

**双向兼容**：反过来，用 7-Zip 或 WinZip 软件制作的加密压缩包上传后，代理也能识别并在线播放（需对应 7z-AES-CBC / WinZip-AES-CTR 协议）。

### 流加密（原版继承 · 适合在线播放）

继承自原版 alist-encrypt，直接对文件流加密，不打包压缩：

- **AES-CTR** — 速度最快，推荐支持 AES 指令的 CPU
- **ChaCha20** — 不依赖 AES 指令，移动端友好
- **RC4** — 兼容性最强，轻量高效

流加密文件只能通过本代理访问，无法用常见解压软件打开，适合纯在线播放场景。

## 比原版多了什么

- **encFolderShift** — 支持多层明文目录路径，加密文件夹下可保留 N 层明文子目录，便于浏览管理
- **标准压缩包加密** — 7z-AES-CBC + WinZip-AES-CTR，标准格式可被常见解压软件打开
- **Docker 部署** — 容器化一键安装，支持 amd64/arm64
- **播放修复** — 子目录 PROPFIND/GET 路径转换、/redirect/ 重定向跟随、WinZip MIME 类型修正
- **Web UI 配置** — 可视化配置 encFolder/encFolderShift

## 安装

### Docker（推荐）

```bash
docker run -d \
  --name alist-enc7zip \
  -p 5277:5277 \
  -v alist-conf:/app/conf \
  ghcr.io/traceless/alist-enc7zip:latest
```

首次启动可通过环境变量指定 alist 地址：

```bash
-e ALIST_HOST=127.0.0.1:5244
```

### Docker Compose

```yaml
services:
  alist-enc7zip:
    image: ghcr.io/traceless/alist-enc7zip:latest
    container_name: alist-enc7zip
    restart: unless-stopped
    ports:
      - "5277:5277"
    volumes:
      - ./conf:/app/conf
    environment:
      TZ: Asia/Shanghai
      ALIST_HOST: 127.0.0.1:5244
```

### 桌面可执行文件（不推荐）

从 [GitHub Release](https://github.com/ayueyang/alist-enc7zip/releases) 下载对应平台的独立可执行文件，**无需安装 Node.js**，解压即用。

| 平台 | 文件 | 架构 |
|---|---|---|
| Windows x64 | `alist-encrypt-win.exe.zip` | Intel/AMD 64 位 |
| Linux x64 | `alist-encrypt-linux.zip` | Intel/AMD 64 位 |
| macOS x64 | `alist-encrypt-macos.zip` | Intel 64 位（Apple Silicon 需 Rosetta） |

解压后直接运行：

```bash
# Windows
alist-encrypt-win.exe
# Linux / macOS
chmod +x alist-encrypt-linux && ./alist-encrypt-linux
```

**不推荐原因**：

1. **不含 ffmpeg**：桌面可执行文件不内置 ffmpeg，7z-AES-CBC GIF 预览功能不可用，需自行安装并配置 `FFMPEG_PATH` / `FFPROBE_PATH` 环境变量。
2. **更新麻烦**：每次升级需重新下载整个压缩包替换。
3. **平台覆盖有限**：仅 3 个 x64 桌面平台，无 ARM、无移动端。

**推荐使用 Docker 部署**：镜像内置 ffmpeg，多架构支持（amd64 + arm64），更新只需 `docker pull` 拉取最新镜像。

### 源码运行

需要 Node.js 18+：

```bash
cd node-proxy
npm install --omit=dev
npm run serve
```

## 使用

1. 打开 `http://127.0.0.1:5277/public/index.html` 进入配置页面（账号 `admin`，密码默认 `123456`）
2. 添加加密配置：选择加密类型、设置密码、填写加密路径（支持通配符，如 `movie_encrypt/*`）
3. 如需保留多层明文子目录，设置 `encFolderShift` 为对应的层数
4. 访问 `http://127.0.0.1:5277` 即可使用 alist 服务，加密/解密自动完成

加密路径支持通配符，例如 `movie_encrypt/*` 表示该目录下所有文件都加密。

## 7z-AES-CBC GIF 预览

对 7z-AES-CBC 加密包内的视频文件，列表页可生成 6 秒 GIF 缩略图预览。**默认关闭**，如需启用请在页面顶部菜单手动开启（可切换画质与时长）。

### 依赖

GIF 生成依赖 **ffmpeg + ffprobe**：

- **Docker 部署**：镜像已内置，无需额外安装。
- **源码部署**：请自行安装 ffmpeg（需同时包含 ffprobe），或将可执行文件路径通过环境变量指定：

  - Windows：`winget install ffmpeg` 或 `choco install ffmpeg`（安装后需确保在系统 PATH 中）
  - macOS：`brew install ffmpeg`
  - Linux：`apt install ffmpeg` / `yum install ffmpeg` / `apk add ffmpeg`

```bash
# 环境变量示例（Windows / Linux 通用，用于指定自定义路径）
FFMPEG_PATH=/usr/local/bin/ffmpeg
FFPROBE_PATH=/usr/local/bin/ffprobe
```

若未检测到 ffmpeg，启动日志会输出 WARN，预览图请求返回 404，列表页自动回退显示原文件类型图标，不影响其他功能。安装 ffmpeg 后需重启 node-proxy 进程才能生效（检测结果在进程内缓存）。

### 缓存

- 生成的 GIF 缓存在 `cache/7z-aes-cbc-preview/` 目录，元数据存于 LevelDB。
- 生成失败会在负缓存（默认 10 分钟）内跳过重复探测，避免频繁请求压垮后端。
- 可在 WebUI「代理缓存」页查看运行状态与清理缓存。
