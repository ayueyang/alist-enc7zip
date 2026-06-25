# 新增 encFolderShift 配置项：支持多层明文路径

## 问题背景

原作者的 `encFolder` 功能（文件夹名加密）在 `convertRealPath` 中使用 `foldNames.shift()` 只移除第一个文件夹名，导致 encPath 匹配路径中**第一个文件夹之后的所有文件夹名都被加密**。

这意味着只支持两层路径结构：

- `根/加密文件夹/*` → 根明文，加密文件夹加密 ✅
- `根/中间层/加密文件夹/*` → 根明文，**中间层和加密文件夹都被加密** ❌

实际使用中，网盘挂载通常是多层结构（如 `会员/enc7zip/ChaCha20/`），用户希望前两层保持明文，只加密最后一层文件夹名。原实现无法满足此需求。

## 解决方案

新增 `encFolderShift` 配置项，控制 encPath 匹配路径中前 N 层文件夹保持明文：

- **默认值 `1`**：完全兼容原作者行为（只移除第一个文件夹名）
- 设为 `2`：前 2 层明文，第 3 层开始加密
- 设为 `N`：前 N 层明文，第 N+1 层开始加密

## 代码改动

### 1. `node-proxy/src/utils/commonUtil.js` — `convertRealPath` 函数

重写路径转换逻辑，支持多层明文 + encPath 之外子路径加密：

- **matchedPart**（encPath 匹配范围内）：前 shiftCount 层明文，其余加密
- **remaining**（encPath 之外的子路径）：全部加密

```js
// 改动前：只处理 pathInfo[0] 内的文件夹名，shift 1次，不处理子路径
const foldNames = pathInfo[0].split('/')
foldNames.shift()
// ... foldPath.replace(encFoldPath, realFoldPath)

// 改动后：拆分 matchedPart 和 remaining，分别处理
const matchedPart = pathInfo[0]
const prefix = foldPath.substring(0, matchIndex)
const remaining = foldPath.substring(matchIndex + matchedPart.length)
// matchedPart 内：前 shiftCount 层明文，其余加密
// remaining 内：全部加密（如 A/B/C/* 下的新建文件夹名）
```

关键修复：
- 加 `.filter(n => n)` 过滤空字符串，避免尾部斜杠导致路径错误（如 `/M会员/...`）
- 处理 encPath 之外的子路径（如 `A/B/C/*` 下的 `测试文件夹名`），原作者不处理这部分

### 2. `node-proxy/src/config.js` — `initPasswdConfig` 函数

为旧配置自动补全默认值，确保向后兼容：

```js
if (passwdInfo.encFolderShift === undefined) {
  passwdInfo.encFolderShift = 1
}
```

### 3. `enc-webui/src/views/setting-alist/index.vue` — UI

- 默认配置和新增配置均加 `encFolderShift: 1`
- `encFolder` 开启时显示"明文层数"输入框（`el-input-number`，min=1 max=10）
- 输入框下方有详细说明：填1/2/N 分别对应什么效果

### 4. `enc-webui/src/views/setting-webdav/index.vue` — UI

- 新增 `encFolder` 单选按钮（原 webdav 页面无此选项）
- 默认配置和新增配置均加 `encFolder: false` 和 `encFolderShift: 1`
- `encFolder` 开启时显示"明文层数"输入框，含详细说明

两个页面的"明文层数"说明文字一致：

```html
<el-form-item v-if="item.encFolder" label="明文层数">
  <el-input-number v-model="item.encFolderShift" :min="1" :max="10" size="small" />
  <div style="font-size: 12px; color: gray; margin-top: 4px; line-height: 1.6">
    <div>填 1（默认）：encPath 第1层明文，第2层起全部加密。如 encPath=A/B/C/* → A明文，B+C密文。</div>
    <div>填 2：前2层明文，第3层起加密。如 encPath=A/B/C/* → A+B明文，C密文。</div>
    <div>填 N：前N层明文，第N+1层起加密。超过路径层数则全部明文（等于没加密）。</div>
  </div>
</el-form-item>
```

### 5. `node-proxy/src/encNameRouter.js` — 列表/目录/重命名逻辑

原代码在列表浏览时，只要 `encFolder=true` 就对所有匹配到的文件夹名调用 `convertShowName`（解密显示）。明文层的文件夹名解密失败后会变成 `orig_原名`，导致显示异常。

三处修复，统一用**显示路径的完整深度**与 `encFolderShift` 比较，明文层跳过解密/加密：

> ⚠️ 关键：必须用完整路径深度，不能用 `pathInfo[0]` 的层数。`pathInfo[0]` 只包含 encPath 正则匹配部分，不含子路径。例如 `encPath=会员/enc7zip/*` 匹配 `/会员/enc7zip/7z-AES-CBC/7RmyJMis7tcN7yID7cE77f36q` 时，`pathInfo[0]` 仅是 `会员/enc7zip/`（深度 2），而实际路径深度是 4。若 `shiftCount=2`，用 `pathInfo[0]` 判断会误判为明文层（2 > 2 = false）而不解密，导致用户看到密文目录名，点击后 `convertRealPath` 二次加密 → "object not found"。

**`/api/fs/list`（列表浏览）**：

```js
// 改动前
if (passwdInfo && passwdInfo.encFolder) {
  fileInfo.name = convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
}

// 改动后
if (passwdInfo && passwdInfo.encFolder) {
  const shiftCount = Math.max(1, Number(passwdInfo.encFolderShift) || 1)
  // 用完整路径深度判断密文层，pathInfo[0] 只含 encPath 匹配部分会误判
  const pathNames = decodeURI(fileInfo.path).split('/').filter(n => n)
  if (pathNames.length > shiftCount) {   // 完整路径深度 > 明文层数才解密
    fileInfo.name = convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
  }
}
```

**`/api/fs/dirs`（目录列表）**：用显示路径前缀匹配 encPath（完整正则匹配在多层 encPath 中间层浏览时会失败），子项深度 = `showDirNames.length + 1`，当 `showDirNames.length >= shiftCount` 时子项在密文层，需要解密。

**`/api/fs/rename`（重命名）**：同理，用 `filePath` 的完整路径深度判断，`pathNames.length > shiftCount` 时才加密新文件夹名。

### 6. `node-proxy/src/encNameRouter.js` — 删除/复制/移动逻辑

删除、复制、移动操作会调用 `convertRealName`/`getEncryptedFileName` 把传入的"显示名"转成"存储名"。明文层的文件夹名本身就是明文，再加密一次会导致找不到文件而操作失败。

**关键修复 A：pathFindPasswd 必须用显示路径匹配 encPath**

原代码用 `dir`（`convertRealPath` 转换后的加密路径）匹配 `encPath`（显示名模式）。原作者的典型 `encPath=会员/*` 只匹配第一层明文 `会员/`，加密路径 `/会员/加密名/` 中的 `会员/` 部分仍能匹配，所以不报错。

但多层 `encPath=会员/enc7zip/7z-AES-CBC/*` 要求正则匹配 `会员/enc7zip/7z-AES-CBC` 这段显示名，而加密路径中是 `会员/enc7zip/加密名`，`7z-AES-CBC ≠ 加密名`，**正则匹配失败**，`passwdInfo` 为空，所有 names 都不加密，操作直接失败。

```js
// 改动前（remove / copyOrMoveFile）
const dir = convertRealPath(ctx.req.webdavConfig.passwdList, showDir)
const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, dir + '/')  // 加密路径无法匹配多层 encPath

// 改动后：用显示路径匹配
const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, showDir + '/')
```

**关键修复 B：isPlainLayer 用完整路径深度判断**

原 `isPlainLayer` 用 `pathInfo[0]` 的层数（encPath 匹配部分），但当 `showDir` 有子路径时（如 `A/B/C/子文件夹`），`pathInfo[0]` 只到 `A/B/C/`（3层），不含子路径。若 `shiftCount=4`，`3 < 4 = true` 误判为明文层，但子项实际在第5层（密文层）。

```js
// 改动前
const foldNames = pathInfo ? pathInfo[0].split('/').filter(n => n) : []
const isPlainLayer = passwdInfo.encFolder && foldNames.length < shiftCount

// 改动后：用显示路径的完整深度
const showDirNames = showDir.split('/').filter(n => n)
const isPlainLayer = passwdInfo.encFolder && showDirNames.length < shiftCount
```

**明文层文件夹跳过加密**：命中明文层时通过 `getCachedFileInfoByPath` 查缓存确认是目录，则跳过加密直接用原名。

> 说明：明文层判断依赖文件缓存来区分文件还是文件夹。文件名本身仍需按 `encName` 加密（文件名加密与文件夹名加密是独立配置），只有文件夹名在明文层时才跳过。若缓存未命中，会走加密分支，极端情况下可能操作失败，重新浏览一次建立缓存即可。

### 7. `node-proxy/src/@types/index.d.ts` — 类型声明

补充 `encFolderShift?: number` 类型声明。

### 8. `node-proxy/src/encNameRouter.js` — `getRequestRealName` 7z-AES-CBC 缓存未命中回退

**问题**：移动 7z-AES-CBC 文件后，新路径无缓存。播放时 `getRequestRealName` 在缓存未命中且文件名不是 `.7z` 时，直接返回明文文件名，导致 alist 找不到文件 → "object not found"。

**修复**：缓存未命中时用 `getSevenZipAesCbcManagedPackageName` 计算确定性的 `.7z` 包名，与上传（`/api/fs/put`）和移动（`getSevenZipAesCbcRequestPackageName`）的逻辑保持一致。

```js
// 改动前
if (isSevenZipAesCbcEncType(passwdInfo.encType)) {
  if (fileInfo) return getSevenZipAesCbcCachedPackageName(fileInfo, fileName)
  if (isSevenZipAesCbcFileName(fileName)) return fileName
  return fileName  // ❌ 返回明文名，alist 找不到
}

// 改动后
if (isSevenZipAesCbcEncType(passwdInfo.encType)) {
  if (fileInfo) return getSevenZipAesCbcCachedPackageName(fileInfo, fileName)
  if (isSevenZipAesCbcFileName(fileName)) return fileName
  return getSevenZipAesCbcManagedPackageName(passwdInfo.password, fileName)  // ✅ 计算确定性 .7z 包名
}
```

影响范围：`/api/fs/get`（获取文件信息）和 `handleDownload`（下载/播放），两者都调用 `getRequestRealName`。

### 9. `node-proxy/app.js` — `proxyHandle` 7z-AES-CBC 候选文件缓存未命中时跳过解密的回归修复

**问题**：第 8 节的修复让文件能被找到了（不再 "object not found"），但引入了新回归——下载的文件不解密，直接透传原始 `.7z` 加密数据。

**根因**：`handleDownload`（encNameRouter.js）将 URL 转换为 `.7z` 包路径后调用 `next()` 进入 `proxyHandle`（app.js）。`proxyHandle` 用 `.7z` 包路径查缓存，缓存未命中（移动后新路径无缓存）→ `fileInfo=null` → `request.fileSize` 保持 0 → 第 612 行 `if (request.fileSize === 0) return httpProxy(...)` 提前返回，跳过所有解密逻辑。

**关键发现**：`parseSevenZipAesCbcInfoFromRemote` 内部的 `getRemoteSize` 能自己通过 HEAD 请求获取远程文件大小（当 `candidateSize=0` 时）。所以即使缓存未命中、`fileSize=0`，只要不提前跳过，7z-AES-CBC 解密逻辑完全能自行获取大小并完成解密。

**修复 A**：`fileSize=0` 检查增加 `!request.isExternalSevenZipAesCbcCandidate` 条件，候选文件不跳过：

```js
// 改动前
if (request.fileSize === 0) {
  return await httpProxy(request, response)
}

// 改动后
if (request.fileSize === 0 && !request.isExternalSevenZipAesCbcCandidate) {
  return await httpProxy(request, response)
}
```

**修复 B**：`prepareExternalSevenZipAesCbcInfo` 从远程解析成功后，回填 `request.fileSize`，避免后续 `prepareSevenZipAesCbcDecrypt` 重复请求远程获取大小：

```js
fileInfo = externalFileInfo
request.isExternalSevenZipAesCbc = true
request.sevenZipAesCbcVirtualName = externalFileInfo.sevenZipAesCbcInfo.innerName
// 新增：回填 fileSize
if (externalFileInfo.size && request.fileSize === 0) {
  request.fileSize = externalFileInfo.size * 1
}
```

**效果**：移动 7z-AES-CBC 文件后，即使新路径无缓存，下载/播放也能正确解密（首次会有一次 HEAD 请求获取文件大小的开销，之后 `cacheExternalSevenZipAesCbcInfo` 会缓存 `sevenZipAesCbcInfo`，后续播放直接命中缓存）。

### 10. `node-proxy/app.js` — `proxyHandle` 上传型 WinZip 文件 /d/ 链路 Content-Type 修复

**问题**：上传型 WinZip 文件（`externalZip=false`）通过 /d/ 链路下载时，HEAD 和 GET 响应的 `Content-Type` 为 `application/octet-stream`（应为 `video/mp4`），`Content-Disposition` 文件名为加密 `.zip` 包名（应为明文文件名）。/redirect/ 链路不受影响。

**根因**：`proxyHandle` 中，`request.zipVirtualName` 仅在 `fileInfo.externalZip === true`（外部 .zip 文件）时从 `fileInfo.zipInfo.innerName` 设置。上传型 WinZip 文件 `externalZip=false`，`request.zipVirtualName` 未设置。随后 `prepareWinZipAesDecrypt` 的 fallback 退化为 `path.basename(request.url)`，取得加密 `.zip` 包名。`applyWinZipAesResponseHeaders` / `applyWinZipAesHeadResponse` 用该加密名查 MIME，`getMimeByName` 去掉 `.zip` 后无扩展名 → 返回 `application/octet-stream`。

**修复**：`fileInfo.externalZip === false` 但 `fileInfo.zipVirtualName` 存在时（上传型 WinZip 文件缓存中有明文文件名），提前设置 `request.zipVirtualName`：

```js
// 改动前
if (fileInfo.externalZip) {
  request.isExternalZip = true
  request.zipVirtualName = fileInfo.zipInfo && fileInfo.zipInfo.innerName
}

// 改动后
if (fileInfo.externalZip) {
  request.isExternalZip = true
  request.zipVirtualName = fileInfo.zipInfo && fileInfo.zipInfo.innerName
} else if (fileInfo.zipVirtualName) {
  request.zipVirtualName = fileInfo.zipVirtualName
}
```

**影响范围**：仅影响上传型 WinZip 文件（`winzip-aes-ctr` 加密类型）的 /d/ 链路。`fileInfo.zipVirtualName` 字段仅对 WinZip 文件存在，aesctr/chacha20/rc4 流加密和 7z-AES-CBC 包加密的缓存中无此字段，不受影响。

**验证**：修复后 5 种加密类型全链路测试全部通过（见测试要点第 10 条）。

## 兼容性

| 场景 | 行为 |
|------|------|
| 旧配置（无 encFolderShift 字段） | `initPasswdConfig` 自动补全为 1，等同原作者行为 |
| `encFolderShift` 值为 0 或非法值 | `Math.max(1, ...)` 兜底为 1 |
| `encFolder: false` | 不受影响，shift 逻辑不执行 |
| shift 次数超过路径层数 | `foldNames.length > 0` 保护，不会越界 |

**零破坏性变更**：不填 `encFolderShift` = 默认 1 = 原作者行为。

## 使用示例

| encPath | encFolder | encFolderShift | 会员 | enc7zip | ChaCha20 |
|---------|-----------|----------------|------|---------|----------|
| `会员/encrypt/*` | true | 1（默认） | 明文 | — | — |
| `会员/enc7zip/ChaCha20/*` | true | 1（默认） | 明文 | **密文** | **密文** |
| `会员/enc7zip/ChaCha20/*` | true | 2 | 明文 | 明文 | **密文** |
| `会员/enc7zip/ChaCha20/*` | true | 3 | 明文 | 明文 | 明文（无加密层） |

### 典型场景：三层路径，只加密最后一层

```
网盘结构: 会员/enc7zip/ChaCha20/
期望:     会员明文 / enc7zip明文 / ChaCha20密文

配置:
  encPath: 会员/enc7zip/ChaCha20/*
  encFolder: true
  encFolderShift: 2
```

## 测试要点

1. **默认兼容**：不填 `encFolderShift`，`会员/encrypt/*` 行为与原版一致（encrypt 被加密）
2. **多层明文**：`encFolderShift=2`，`A/B/C/*`，只有 C 被加密
3. **创建文件夹**：通过代理在 `A/B/` 下创建文件夹，第 3 层名字被加密，前 2 层明文
4. **浏览列表**：`encFolderShift=2` 时，前 2 层文件夹名明文，第 3 层解密显示
5. **旧配置迁移**：删除 config.json 中的 `encFolderShift` 字段，重启后自动补全为 1
6. **删除**：在明文层删除文件夹（先浏览建立缓存），能正确删除不报错
7. **复制/移动**：在明文层复制/移动文件夹到密文层，源用原名、目标用加密名；密文层之间复制/移动正常
8. **深层密文目录浏览（回归测试）**：`encPath=会员/enc7zip/*` + `encFolderShift=2`，浏览 `/会员/enc7zip/7z-AES-CBC/` 时，第 4 层的子目录名必须被解密显示；点击该子目录能正常进入，不出现 "object not found"（验证用完整路径深度而非 `pathInfo[0]` 判断密文层）
9. **移动后播放（7z-AES-CBC 缓存未命中）**：移动 7z-AES-CBC 文件到新路径后，新路径无缓存。播放时 `/api/fs/get` 和 `/d/` 下载能正确计算 `.7z` 包名（`getSevenZipAesCbcManagedPackageName`），不出现 "object not found"

10. **5 种加密类型全链路回归测试**：对 `7z-AES-CBC`、`aesctr`、`chacha20`、`rc4`、`winzip-aes-ctr` 分别运行 11 阶段播放全链路测试（/d/、/redirect/、/dav/、数据一致性、编码兼容性、Range 边界）。重点关注 /d/ 链路 HEAD 的 `Content-Type` 和 `Content-Disposition` 是否正确（修复前 WinZip /d/ 返回 `application/octet-stream` + 加密 .zip 文件名）。注意：并行测试可能导致 redirect 缓存（levelDB）污染，建议隔离测试或串行测试。

## 已知限制

1. **WebDAV 不支持 encFolder**：`encDavHandle.js`（WebDAV 处理器）原本就不处理 `encFolder`（文件夹名加密），本次改动保持一致，未涉及 WebDAV 部分。`encFolderShift` 仅对 `/api/fs/*` 路由（alist Web UI / API）生效。

2. **`/api/fs/get` 未缓存明文层文件夹**：当 `encFolder=true` 且通过 `/api/fs/get` 直接访问一个**未被列表浏览过**（无缓存）的明文层文件夹时，可能因文件夹名被错误加密而请求失败。实际使用中通常先浏览列表（建立缓存）再操作，触发概率低，且不影响数据安全。重新浏览一次即可恢复。

3. **删除/复制/移动依赖缓存**：明文层文件夹的删除/复制/移动判断依赖文件缓存（`getCachedFileInfoByPath`）来区分文件还是文件夹。若缓存未命中，会走加密分支，极端情况下可能操作失败，重新浏览一次建立缓存即可。

4. **7z-AES-CBC 缓存未命中时首次播放有额外开销**：移动 7z-AES-CBC 文件后，新路径无缓存。首次播放时 `proxyHandle` 会通过 `parseSevenZipAesCbcInfoFromRemote` → `getRemoteSize` 发一次 HEAD 请求获取文件大小，再读取 `.7z` 头部解析解密信息，之后 `cacheExternalSevenZipAesCbcInfo` 会缓存 `sevenZipAesCbcInfo`，后续播放直接命中缓存无额外开销。`encDavHandle.js` 的 `getRequestRealName` 有同样的缓存未命中回退问题，但 WebDAV 不在本次 encFolder 改动范围内。
