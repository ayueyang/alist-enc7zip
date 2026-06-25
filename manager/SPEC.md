# enc7zip-manager 实现规格

> 本文档为 enc7zip-manager（整合管理软件）的完整实现规格，供独立实现会话使用。文档自包含，无需对话历史即可据此实现。

## 1. 项目背景

**alist-enc7zip**（本仓库主项目）是 Node.js 编写的 alist 透明加密代理：上传加密、下载/播放解密，支持流加密（AES-CTR/ChaCha20/RC4）和标准压缩包加密（7z-AES-CBC/WinZip-AES-CTR）。

**enc7zip-manager**（本文档目标）是独立的 Windows 桌面管理软件，给小白用户一键安装、启停、配置三个服务：
- **alist**（Go 网盘聚合服务，https://github.com/alist-org/alist）
- **openlist**（alist 社区 fork，https://github.com/OpenListTeam/OpenList）
- **alist-enc7zip**（本仓库 Node.js 加密代理）

管理软件本身**不依赖**这三个服务，仅做进程管理与配置文件编辑。三服务各自独立运行，管理软件与它们解耦。

## 2. 目标用户与核心诉求

- **用户**：萌新小白，不会命令行，不会改配置文件，希望双击 exe 就能用
- **核心诉求**：
  1. 一个 exe 内含三服务二进制，无需访问 GitHub 下载
  2. 漂亮的桌面软件 UI（不要网页、不要浏览器访问 http://localhost）
  3. 一键安装/启停/重启三服务
  4. 快捷配置账号、密码、端口
  5. 开机自启
  6. 一键打开对应服务的网页访问地址
  7. 加密配置（encFolder/encFolderShift 等）不在管理软件内做，提供"打开管理面板"按钮跳转到 enc-webui

## 3. 仓库与分支策略

- **分支**：`feature/enc7zip-manager`（从 main 切出，开发期间不污染 main）
- **目录**：本仓库 `manager/` 子目录，与 Node.js 主项目共存
- **CI 隔离**：`.github/workflows/manager.yml` 用 `paths: ['manager/**']` 过滤，`manager/` 变更才触发 Go 构建，不影响 Node.js 构建
- **最终合并**：开发完成后视情况合并到 main 或长期保留分支

## 4. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 语言 | **Go** | 与 alist/openlist 同语言；os/exec 子进程管理成熟；embed 打包二进制原生支持；编译单 exe 无运行时依赖 |
| 桌面框架 | **Wails v2** | Go 后端 + 前端渲染；双击 exe 出原生窗口不开浏览器；UI 用前端技术可做漂亮 |
| 前端框架 | **Vue3 + Naive UI** | Naive UI 比 Element Plus 现代美观；不复用 enc-webui 原 UI（用户嫌丑） |
| SQLite | **modernc.org/sqlite** | 纯 Go 实现，免 CGO，便于交叉编译 |
| bcrypt | **golang.org/x/crypto/bcrypt** | 生成 alist/openlist admin 密码 hash |
| 系统托盘 | Wails 内置或 `getlantern/systray` | 可选，托盘快捷启停 |

**平台**：Windows only（开机启动走注册表 `HKCU\...\Run`）

## 5. 架构设计

```
┌─────────────────────────────────────────────────────┐
│  enc7zip-manager.exe  (Go + Wails, ~10MB)           │
│  ┌─────────────────────────────────────────────┐    │
│  │  Wails 原生窗口 (Vue3 + Naive UI)           │    │
│  │  左侧导航 Tab + 右侧状态卡片                │    │
│  └─────────────────────────────────────────────┘    │
│                      │                              │
│  ┌───────────────────▼──────────────────────────┐   │
│  │  Go 后端 (internal/)                         │   │
│  │  ├── process/  子进程管理（启停/状态/日志）  │   │
│  │  ├── config/   配置生成器（config.json +     │   │
│  │  │             bcrypt + SQLite 直写）        │   │
│  │  ├── autostart/ 注册表开机启动              │   │
│  │  ├── bundle/   embed 释放二进制             │   │
│  │  └── port/     端口冲突检测 + 联动          │   │
│  └──────────────────────────────────────────────┘   │
│                      │                              │
│  go:embed ├── alist.exe           (~30MB)           │
│           ├── openlist.exe        (~30MB)           │
│           ├── node.exe            (~40MB)           │
│           └── enc7zip-dist/        (~5MB)            │
└─────────────────────────────────────────────────────┘
           │ 首次运行释放到 %APPDATA%/enc7zip-manager/
           ▼
   data/alist/      data/openlist/      data/enc7zip/
   (各自 config.json + data.db)
```

**总体积**：约 115MB 单 exe（含三服务二进制）。

## 6. UI 设计

### 6.1 设计原则

- **现代扁平卡片式**，柔和配色，留白充足
- **深色/浅色主题**切换（Naive UI 内置支持）
- **不复用 enc-webui 原 UI**（用户嫌丑），重新设计
- 配色避开 enc-webui 的蓝色，用**青绿色系**（#18a058 主色）或**紫色系**（#7c3aed 主色）

### 6.2 布局

```
┌──────────────────────────────────────────────────────────┐
│  enc7zip 管理器                              [─][□][×]  │
├────────┬─────────────────────────────────────────────────┤
│        │                                                 │
│ alist  │  ┌─────────────────────────────────────────┐   │
│ ▼ 运行 │  │  alist                                   │   │
│        │  │  ● 运行中   端口 5244   PID 12345        │   │
│ openlst│  └─────────────────────────────────────────┘   │
│  停止  │                                                 │
│        │  ┌─────────────────────────────────────────┐   │
│ enc7zip│  │  快捷操作                                │   │
│  运行  │  │  [启动]  [停止]  [重启]                 │   │
│        │  └─────────────────────────────────────────┘   │
│ ─────  │                                                 │
│        │  ┌─────────────────────────────────────────┐   │
│ 设置   │  │  端口配置                                │   │
│ 关于   │  │  端口 [ 5244      ]  [应用并重启]        │   │
│        │  └─────────────────────────────────────────┘   │
│        │                                                 │
│        │  ┌─────────────────────────────────────────┐   │
│        │  │  账号                                    │   │
│        │  │  用户名: admin                           │   │
│        │  │  密码:   [••••••••]  [修改]  [显示]      │   │
│        │  └─────────────────────────────────────────┘   │
│        │                                                 │
│        │  ┌─────────────────────────────────────────┐   │
│        │  │  其他                                    │   │
│        │  │  ☑ 开机自启                             │   │
│        │  │  [打开网页]  [打开数据目录]  [查看日志] │   │
│        │  └─────────────────────────────────────────┘   │
└────────┴─────────────────────────────────────────────────┘
```

### 6.3 三服务 Tab 差异

| 功能 | alist / openlist | alist-enc7zip |
|---|---|---|
| 端口配置 | 有（改 scheme.http_port） | 有（改 port） |
| 账号密码修改 | 有（bcrypt 写 SQLite） | 仅显示默认 admin/admin123，提示去 enc-webui 改 |
| **加密配置** | 无 | **"打开管理面板"按钮**，跳转 enc-webui（http://127.0.0.1:5277/public/index.html） |
| 数据目录 | data/<svc>/data/ | data/enc7zip/conf/ |
| 日志 | data/<svc>/data/log/ | data/enc7zip/conf/nedb/ + 控制台输出 |

### 6.4 交互细节

- 状态徽章：绿色圆点+运行中 / 灰色圆点+已停止 / 红色圆点+异常
- 按钮状态：运行中时"启动"禁用、"停止"启用；反之亦然
- 端口修改：输入框失焦校验数字+范围（1024-65535）+冲突检测，"应用并重启"按钮才提交
- 密码框：默认掩码，"显示"按钮切换明文
- "打开网页"：`rundll32 url.dll,FileProtocolHandler http://127.0.0.1:<port>`
- "打开数据目录"：`explorer <data-dir>`
- 顶部状态栏：三服务总览（3 个小圆点 + 端口）

## 7. 核心功能清单

| 功能 | 实现 |
|---|---|
| 一键安装 | 从 embed 释放 alist.exe/openlist.exe/node.exe/enc7zip-dist 到 `%APPDATA%/enc7zip-manager/`，生成默认配置 |
| 启停/重启 | os/exec 子进程，带优雅退出（taskkill /PID 或 Ctrl+C 信号） |
| 端口修改 | 改对应 config.json + 自动重启该服务 |
| 账号密码修改 | alist/openlist：bcrypt 写 SQLite；enc7zip：跳转 enc-webui |
| 开机自启 | 注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，管理程序自身开机启动后按上次状态拉起三服务 |
| 一键打开网页 | rundll32 调默认浏览器到对应端口 |
| 日志查看 | 弹窗或侧栏 tail 最后 200 行 |
| 数据目录 | explorer 打开 |
| 端口冲突检测 | net.Listen 试探 5244/5245/5277，被占则提示改端口 |

## 8. 快捷配置实现（核心难点）

### 8.1 alist / openlist（同构，fork 兼容）

**配置文件** `data/<svc>/data/config.json`：
```json
{
  "scheme": { "address": "0.0.0.0", "http_port": 5244, "https_port": -1 },
  "database": { "type": "sqlite3", "db_file": "data/data.db", "table_prefix": "alist_" },
  "jwt_secret": "<32位随机字符串>",
  "log": { "enable": true, "name": "log/log.txt", "level": "info" },
  "temp_dir": "data/temp"
}
```
（openlist 的 `table_prefix` 用 `x_`，二进制名 `openlist.exe`，命令 `openlist server`）

**admin 密码设置（关键）**：alist v3.25+ 密码是 bcrypt hash 存 SQLite `x_user` 表，**不能直接改 config.json**。管理软件方案：

```go
import "golang.org/x/crypto/bcrypt"
import _ "modernc.org/sqlite"

func SetAdminPassword(dbPath, username, newPassword string) error {
    hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 10)
    if err != nil {
        return err
    }
    db, err := sql.Open("sqlite", dbPath)
    if err != nil {
        return err
    }
    defer db.Close()
    _, err = db.Exec(
        "UPDATE x_user SET password=? WHERE username=?",
        string(hash), username,
    )
    return err
}
```

直接写 `data/data.db`，**免启停 alist**，下次登录即用新密码。

**端口冲突检测**：
```go
func IsPortAvailable(port int) bool {
    ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
    if err != nil {
        return false
    }
    ln.Close()
    return true
}
```

### 8.2 alist-enc7zip

**配置文件** `data/enc7zip/conf/config.json`：
```json
{
  "alistServer": {
    "serverHost": "127.0.0.1",
    "serverPort": 5244,
    "https": false,
    "passwdList": [{
      "password": "<用户输入的加密密码>",
      "encType": "aesctr",
      "enable": true,
      "encName": "<自动生成随机串>",
      "encPath": "encrypt_folder/*",
      "encFolder": false,
      "encFolderShift": 1
    }]
  },
  "webdavServer": { ... },
  "port": 5277,
  "proxyCache": { "enable": false }
}
```

**admin 密码**：存 NeDB `conf/nedb/datafile`（非 config.json）。管理软件**不逆向 NeDB**，只写 config.json，让 enc7zip 首启自建默认 admin（admin/admin123）。管理软件界面显示默认密码，用户首次登录 enc-webui 后自行修改。

**加密细节配置**（encFolder/encFolderShift/7z 预览等）：**不放进管理软件**，enc7zip Tab 放"打开管理面板"按钮：
```go
func OpenEncWebui(port int) {
    url := fmt.Sprintf("http://127.0.0.1:%d/public/index.html", port)
    exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}
```

### 8.3 配置联动

管理软件维护 `manager.json` 记录三服务端口与账号：
```json
{
  "alist": { "port": 5244, "admin_user": "admin", "admin_pwd_plain": "xxx", "installed": true, "autostart": true },
  "openlist": { "port": 5245, "admin_user": "admin", "admin_pwd_plain": "xxx", "installed": true, "autostart": false },
  "enc7zip": {
    "port": 5277,
    "admin_user": "admin",
    "admin_pwd_plain": "admin123",
    "alist_backend_port": 5244,
    "installed": true,
    "autostart": true
  }
}
```

**联动规则**：alist 端口变更 → 自动改 enc7zip 的 `alistServer.serverPort` + 重启 enc7zip，保持连接。enc7zip 不依赖管理软件 API，管理软件只编辑它的 config.json。

## 9. 打包构建

### 9.1 目录结构

```
manager/                          # 独立子目录
├── SPEC.md                       # 本文档
├── main.go                       # Wails 应用入口
├── app.go                        # Wails 后端方法绑定
├── internal/
│   ├── process/                  # 子进程管理
│   ├── config/                   # 配置生成器
│   ├── autostart/                # 注册表开机启动
│   ├── bundle/                  # embed 释放
│   └── port/                    # 端口冲突检测
├── frontend/                     # Vue3 + Naive UI 前端
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── embed/                        # .gitignore，构建前放二进制
│   ├── alist.exe
│   ├── openlist.exe
│   ├── node.exe
│   └── enc7zip-dist/            # 从 alist-enc7zip 拷贝 webpack 产物
├── go.mod
├── wails.json
└── Makefile
```

### 9.2 embed 嵌入

```go
//go:embed alist.exe
var alistBin []byte

//go:embed openlist.exe
var openlistBin []byte

//go:embed node.exe
var nodeBin []byte

//go:embed enc7zip-dist
var enc7zipDist embed.FS
```

### 9.3 构建命令

```makefile
# Makefile
build:
	wails build -ldflags="-s -w -H windowsgui"
	# -H windowsgui 避免黑色控制台弹窗

prepare-embed:
	# 1. 下载 alist 最新稳定版
	curl -L -o embed/alist.exe https://github.com/alist-org/alist/releases/latest/download/alist-windows-amd64.zip
	# 2. 下载 openlist 最新稳定版
	curl -L -o embed/openlist.exe https://github.com/OpenListTeam/OpenList/releases/latest/download/openlist-windows-amd64.zip
	# 3. Node 18 LTS win-x64
	curl -L -o embed/node.exe https://nodejs.org/dist/v18.20.4/node-v18.20.4-win-x64.zip
	# 4. enc7zip dist（从本仓库 node-proxy 构建）
	cd ../node-proxy && npm install && npm run webpack
	cp -r dist ../manager/embed/enc7zip-dist
```

### 9.4 版本锁定

构建时下载 alist/openlist 最新稳定版，记录版本号到 `embed/VERSION`：
```
alist=v3.x.y
openlist=vX.Y.Z
node=v18.20.4
enc7zip=<git-commit-hash>
```

## 10. 三服务配置机制调研参考

### 10.1 alist-enc7zip（本仓库）

- **配置文件**：`conf/config.json`（JSON），运行时由 `process.cwd()/conf/` 自动创建
- **关键代码**：`node-proxy/src/config.js`
  - 第 169 行：`port: 5277`
  - 第 253 行：`password: 'admin123'`（admin 默认密码，README 写 123456 是文档误差）
  - 第 282 行：`export const port = configData.port || 5277`
- **NeDB 缓存**：`conf/nedb/datafile`，存用户表、token、文件信息
- **加密配置**：`alistServer.passwdList[i]` 含 encType/password/encPath/encName/encFolder/encFolderShift
- **encType 可选**：`aesctr`、`chacha20`、`rc4`、`winzip-aes-ctr`、`7z-aes-cbc`
- **与 alist 对接**：仅需 `serverHost`、`serverPort`、`https`，不需要 alist admin token（代理透传客户端鉴权）
- **启动方式**：`node dist/index.js`（webpack 打包后）
- **首启行为**：无 config.json 时自动创建 conf/ 和默认配置（端口 5277、alist=127.0.0.1:5244、默认 aesctr 加密配置）
- **管理面板**：enc-webui（Vue3 + Element Plus），打包后在 `/public/`，访问 `http://127.0.0.1:5277/public/index.html`

### 10.2 alist

- **安装**：GitHub Releases 下载 `alist-windows-amd64.zip`，解压得单文件 `alist.exe`（Go 静态编译，无依赖）
- **配置文件**：`data/config.json`，关键字段 `scheme.http_port`(5244)、`database.type`(sqlite3)、`database.db_file`、`database.table_prefix`(alist_)、`jwt_secret`
- **数据库**：`data/data.db`（SQLite），表前缀 `alist_`，用户表 `x_user`
- **admin 密码**：v3.25+ 是 bcrypt hash 存 `x_user.password`，不能用 config.json 改，用 `alist admin set NEW_PWD` 或直接改 SQLite
- **命令行**：
  - `alist server` 启动服务
  - `alist admin set NEW_PWD` 设密码
  - `alist admin random` 随机密码
  - `-d <data-dir>` 指定数据目录
- **默认端口**：5244
- **文档**：https://alist.nn.ci/guide/install/manual

### 10.3 openlist

- **仓库**：https://github.com/OpenListTeam/OpenList （2025 年 alist 被收购后社区 fork）
- **与 alist 区别**：
  - 配置格式兼容，CLI 命令一致（`openlist server`、`openlist admin set`）
  - `table_prefix` 默认 `x_`（不是 `alist_`）
  - 二进制名 `openlist.exe`
  - config.json 扩展了 `meilisearch`、`s3`、`ftp`、`sftp`、`tasks` 字段
- **安装**：GitHub Releases 下载 `openlist-windows-amd64.zip`
- **默认端口**：5244（与 alist 冲突，整合时必须改一个，推荐 openlist 用 5245）
- **文档**：https://openlistteam.github.io/OpenList-Docs

### 10.4 整合可行性

- 三服务可共存：端口隔离（5244/5245/5277）+ data 目录隔离（`-d` 参数）
- alist/openlist 都是 Go 静态单文件，便于 embed 打包
- 内嵌 SQLite，零外部依赖
- enc7zip 需带 node.exe（~40MB）+ dist（~5MB）

## 11. 待确认/决策点

1. ~~技术选型~~ → 已定 Go + Wails + Vue3 + Naive UI
2. ~~alist/openlist 版本~~ → 最新稳定版，构建时下载固定版本
3. ~~平台~~ → Windows only
4. ~~加密配置~~ → 管理软件放"打开管理面板"按钮跳转 enc-webui
5. ~~仓库~~ → 本仓库 `feature/enc7zip-manager` 分支，`manager/` 子目录
6. **UI 主色**：青绿色（#18a058）还是紫色（#7c3aed）？实现时定
7. **系统托盘**：是否需要托盘图标（最小化到托盘）？建议有，方便后台运行
8. **三服务安装顺序**：建议 alist → enc7zip（依赖 alist 后端）→ openlist（独立）
9. **首次运行向导**：是否需要安装向导（欢迎页 → 选安装位置 → 一键安装三服务）？建议有，对小白友好

## 12. 工作量评估

| 模块 | 人天 |
|---|---|
| Wails + Vue3 + Naive UI 骨架 | 1.5 |
| 子进程管理（启停/状态/日志/PID 跟踪） | 1.5 |
| 配置生成器（config.json + bcrypt + SQLite 直写） | 1.5 |
| 端口冲突检测 + 联动 | 1 |
| 开机启动注册表 | 0.5 |
| embed 释放 + 版本锁定 | 0.5 |
| UI 实现（三 Tab + 状态卡片 + 交互） | 2 |
| 打包构建脚本（Makefile） | 0.5 |
| 测试 + 文档 | 1 |
| **合计** | **~9.5 人天** |

## 13. 开发流程建议

1. **阶段 1：骨架**
   - 建 `manager/` 目录结构
   - Wails + Vue3 + Naive UI 初始化
   - 三 Tab 静态页面 + 假数据
   - Go 后端空方法绑定

2. **阶段 2：子进程管理**
   - 实现启停 alist/openlist（`alist server -d <dir>`）
   - 实现启停 enc7zip（`node.exe dist/index.js`，工作目录设为 enc7zip 目录）
   - PID 跟踪 + 状态检测 + 优雅退出
   - 日志 tail

3. **阶段 3：配置生成**
   - embed 释放二进制
   - 生成三服务默认 config.json
   - bcrypt 写 SQLite（alist/openlist admin 密码）
   - 端口冲突检测 + 联动

4. **阶段 4：开机启动 + 打包**
   - 注册表读写
   - Makefile 构建脚本
   - 下载嵌入二进制
   - wails build 出 exe

5. **阶段 5：测试 + 文档**
   - 端到端测试：安装 → 启动 → 改端口 → 改密码 → 开机启动
   - 用户文档（README）

## 14. 关键代码参考位置

- alist-enc7zip 配置：`node-proxy/src/config.js`（file:///c:/Users/admin/Desktop/alist-enc7zip/node-proxy/src/config.js）
- enc-webui 管理面板入口：`enc-webui/src/views/setting-alist/index.vue`（file:///c:/Users/admin/Desktop/alist-enc7zip/enc-webui/src/views/setting-alist/index.vue）
- enc7zip 启动入口：`node-proxy/app.js`（file:///c:/Users/admin/Desktop/alist-enc7zip/node-proxy/app.js）
- enc7zip webpack 配置：`node-proxy/webpack.config.ts`（file:///c:/Users/admin/Desktop/alist-enc7zip/node-proxy/webpack.config.ts）
- 配置示例：`docker-conf/config.json`（file:///c:/Users/admin/Desktop/alist-enc7zip/docker-conf/config.json）

## 15. 注意事项

- **不修改 alist-enc7zip 主项目代码**：manager 只读取/编辑 conf/config.json，不改 enc7zip 源码
- **不污染 main 分支**：所有开发在 `feature/enc7zip-manager` 分支
- **CI 隔离**：`manager.yml` 用 `paths: ['manager/**']` 过滤
- **embed 二进制不入 git**：`manager/embed/` 加入 .gitignore，构建时下载
- **版本锁定**：每次发版记录 alist/openlist/node/enc7zip 版本到 `embed/VERSION`
- **小白友好**：所有错误用中文弹窗提示，不暴露技术细节
- **优雅退出**：管理软件关闭时优雅停止三服务（发 Ctrl+C 信号，超时后 taskkill）
- **端口默认值**：alist=5244，openlist=5245（避免与 alist 冲突），enc7zip=5277
