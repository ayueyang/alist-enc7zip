# alist-enc7zip

基于 [alist-encrypt](https://github.com/traceless/alist-encrypt) 的加密代理增强版。

一个 alist 透明加密代理：上传时加密、下载/播放时解密。加密后的文件存于网盘，云盘无法扫描识别内容，防止资源被删除。同时支持在线播放加密视频、浏览加密图片，WebDAV 客户端操作透明无感。

## 加密方式

### 流加密（适合在线播放）

- **AES-CTR** — 速度最快，推荐支持 AES 指令的 CPU
- **ChaCha20** — 不依赖 AES 指令，移动端友好
- **RC4** — 兼容性最强，轻量高效

### 标准压缩包加密（适合分享）

- **7z-AES-CBC** — 生成 7-Zip 标准 AES-256 加密的 `.7z` 压缩包
- **WinZip-AES-CTR** — 生成 WinZip 标准 AES-256 加密的 `.zip` 压缩包

这两种方式生成的文件是**标准压缩包格式**，普通人可以用 7-Zip、WinZip 等常见解压软件直接解压使用。同时通过代理也能在线播放包内视频。**利好文件分享**：接收方无需安装额外软件，用常见解压工具输入密码即可解压。

反过来，用 7-Zip 或 WinZip 软件制作的加密压缩包上传后，代理也能识别并在线播放（需对应 7z-AES-CBC / WinZip-AES-CTR 协议）。

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
  ghcr.io/ayueyang/alist-enc7zip:latest
```

首次启动可通过环境变量指定 alist 地址：

```bash
-e ALIST_HOST=192.168.1.100:5244
```

### Docker Compose

```yaml
services:
  alist-enc7zip:
    image: ghcr.io/ayueyang/alist-enc7zip:latest
    container_name: alist-enc7zip
    restart: unless-stopped
    ports:
      - "5277:5277"
    volumes:
      - ./conf:/app/conf
    environment:
      TZ: Asia/Shanghai
      ALIST_HOST: 192.168.1.100:5244
```

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
