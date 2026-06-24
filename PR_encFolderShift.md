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

将写死的单次 `shift()` 改为按 `encFolderShift` 循环 shift：

```js
// 改动前
const foldNames = pathInfo[0].split('/')
foldNames.shift()

// 改动后
const foldNames = pathInfo[0].split('/')
const shiftCount = Math.max(1, Number(passwdInfo.encFolderShift) || 1)
for (let i = 0; i < shiftCount && foldNames.length > 0; i++) {
  foldNames.shift()
}
```

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

```html
<el-form-item v-if="item.encFolder" label="明文层数">
  <el-input-number v-model="item.encFolderShift" :min="1" :max="10" size="small" />
  <span style="font-size: 12px; color: gray; margin-left: 10px">
    encPath 前几层文件夹保持明文，默认1（仅第一层明文）
  </span>
</el-form-item>
```

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
