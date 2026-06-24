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

### 5. `node-proxy/src/encNameRouter.js` — 列表浏览/重命名逻辑

原代码在列表浏览时，只要 `encFolder=true` 就对所有匹配到的文件夹名调用 `convertShowName`（解密显示）。明文层的文件夹名解密失败后会变成 `orig_原名`，导致显示异常。

三处修复，统一用 `pathInfo[0]` 的层数与 `encFolderShift` 比较，明文层跳过解密/加密：

**`/api/fs/list`（列表浏览）**：

```js
// 改动前
if (passwdInfo && passwdInfo.encFolder) {
  fileInfo.name = convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
}

// 改动后
if (passwdInfo && passwdInfo.encFolder) {
  const shiftCount = Math.max(1, Number(passwdInfo.encFolderShift) || 1)
  const foldNames = pathInfo[0].split('/').filter(n => n)
  if (foldNames.length > shiftCount) {   // 当前文件夹深度 > 明文层数才解密
    fileInfo.name = convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
  }
}
```

**`/api/fs/dirs`（目录列表）**：同理，子项深度 = `foldNames.length + 1`，当 `foldNames.length >= shiftCount` 时子项在密文层，需要解密。

**`/api/fs/rename`（重命名）**：同理，`foldNames.length > shiftCount` 时才加密新文件夹名。

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
