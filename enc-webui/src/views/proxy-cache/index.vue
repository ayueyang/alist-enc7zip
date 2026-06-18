<template>
  <div class="proxy-cache-page scroll-y">
    <div class="page-head">
      <h3>代理缓存管理</h3>
      <div class="head-actions">
        <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
        <el-button type="success" :icon="Download" @click="exportConfig">导出配置</el-button>
        <el-upload :show-file-list="false" :auto-upload="false" accept="application/json,.json" :on-change="importConfig">
          <el-button type="warning" :icon="Upload">导入配置</el-button>
        </el-upload>
      </div>
    </div>

    <el-alert
      class="mb-16px"
      type="info"
      :closable="false"
      title="这里只管理本机代理缓存，不会删除网盘文件。导入导出只包含 proxyCache 配置，不包含 AList/WebDAV 密码。"
    />

    <el-row :gutter="16" class="mb-16px">
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="never">
          <div class="stat-title">GIF 缓存</div>
          <div class="stat-main">{{ formatBytes(status.preview.totalBytes) }}</div>
          <div class="stat-sub">{{ status.preview.fileCount || 0 }} 个文件</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="never">
          <div class="stat-title">预览队列</div>
          <div class="stat-main">{{ status.preview.activeJobs || 0 }} / {{ status.preview.queuedJobs || 0 }}</div>
          <div class="stat-sub">运行 / 等待</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="never">
          <div class="stat-title">解析缓存</div>
          <div class="stat-main">{{ archiveInfoTotal }}</div>
          <div class="stat-sub">ZIP + 7z AES-CBC</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="never">
          <div class="stat-title">Redirect 临时缓存</div>
          <div class="stat-main">{{ status.redirect.total || 0 }}</div>
          <div class="stat-sub">旧结构 {{ status.redirect.legacy || 0 }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mb-16px">
      <template #header>
        <div class="section-head">
          <span>缓存参数</span>
          <el-button type="primary" :icon="Check" @click="saveConfig">保存配置</el-button>
        </div>
      </template>
      <el-form label-width="190px" :model="form">
        <el-divider content-position="left">GIF 预览缓存</el-divider>
        <el-row :gutter="12">
          <el-col :xs="24" :lg="12">
            <el-form-item label="GIF 缓存最大大小">
              <el-input-number v-model="form.gifCacheMaxSizeMb" :min="16" :max="1048576" :step="128" />
              <span class="unit">MB</span>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-form-item label="GIF 缓存最大文件数">
              <el-input-number v-model="form.gifCacheMaxFiles" :min="1" :max="1000000" :step="100" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-form-item label="GIF 缓存保留天数">
              <el-input-number v-model="form.gifCacheMaxAgeDays" :min="1" :max="3650" />
              <span class="unit">天</span>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-form-item label="GIF 宽度">
              <el-input-number v-model="form.gifWidth" :min="64" :max="1920" :step="20" />
              <span class="unit">px</span>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">生成队列</el-divider>
        <el-row :gutter="12">
          <el-col :xs="24" :lg="12">
            <el-form-item label="GIF 生成并发数">
              <el-input-number v-model="form.gifPreviewJobs" :min="1" :max="16" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-form-item label="GIF 等待队列上限">
              <el-input-number v-model="form.gifPreviewQueueLimit" :min="1" :max="10000" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="8">
            <el-form-item label="低画质超时">
              <el-input-number v-model="form.gifTimeoutLowSeconds" :min="5" :max="3600" />
              <span class="unit">秒</span>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="8">
            <el-form-item label="中画质超时">
              <el-input-number v-model="form.gifTimeoutMediumSeconds" :min="5" :max="3600" />
              <span class="unit">秒</span>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="8">
            <el-form-item label="高画质超时">
              <el-input-number v-model="form.gifTimeoutHighSeconds" :min="5" :max="3600" />
              <span class="unit">秒</span>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">TTL 与自动清理</el-divider>
        <el-row :gutter="12">
          <el-col :xs="24" :lg="12">
            <el-form-item label="GIF 负缓存 TTL">
              <el-input-number v-model="form.gifNegativeCacheTtlMinutes" :min="1" :max="10080" />
              <span class="unit">分钟</span>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-form-item label="7z/ZIP 探测负缓存 TTL">
              <el-input-number v-model="form.archiveProbeNegativeCacheTtlMinutes" :min="1" :max="10080" />
              <span class="unit">分钟</span>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-form-item label="Redirect 播放缓存 TTL">
              <el-input-number v-model="form.redirectCacheTtlHours" :min="1" :max="720" />
              <span class="unit">小时</span>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-form-item label="自动清理间隔">
              <el-input-number v-model="form.cacheCleanupIntervalMinutes" :min="1" :max="1440" />
              <span class="unit">分钟</span>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">开关</el-divider>
        <el-row :gutter="12">
          <el-col :xs="24" :lg="8">
            <el-form-item label="启动时自动清理">
              <el-switch v-model="form.cleanupOnStartup" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="8">
            <el-form-item label="启用 GIF 磁盘缓存">
              <el-switch v-model="form.enableGifDiskCache" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="8">
            <el-form-item label="启用预览异步生成">
              <el-switch v-model="form.enablePreviewAsync" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="section-head">
          <span>清理缓存</span>
          <el-button type="danger" :icon="Delete" @click="confirmClear('all')">一键清理全部代理缓存</el-button>
        </div>
      </template>
      <el-table :data="cacheRows" border>
        <el-table-column prop="name" label="缓存类型" width="180" />
        <el-table-column prop="detail" label="当前状态" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button type="danger" size="small" @click="confirmClear(row.type)">清理</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Delete, Download, Refresh, Upload } from '@element-plus/icons-vue'
import {
  clearProxyCacheReq,
  exportProxyCacheConfigReq,
  getProxyCacheStatusReq,
  importProxyCacheConfigReq,
  saveProxyCacheConfigReq
} from '@/api/user'

const form = reactive({})
const status = reactive({
  preview: {},
  archiveInfo: {},
  negativeProbe: {},
  redirect: {}
})

const archiveInfoTotal = computed(() => {
  return Number(status.archiveInfo.zipInfo || 0) + Number(status.archiveInfo.sevenZipAesCbcInfo || 0)
})

const cacheRows = computed(() => [
  {
    type: 'preview',
    name: 'GIF 预览缓存',
    detail: `${formatBytes(status.preview.totalBytes)} / ${status.preview.fileCount || 0} 个文件，负缓存 ${status.preview.negativeCount || 0}`
  },
  {
    type: 'archiveInfo',
    name: '解析缓存',
    detail: `ZIP ${status.archiveInfo.zipInfo || 0}，7z AES-CBC ${status.archiveInfo.sevenZipAesCbcInfo || 0}，轻量映射 ${status.archiveInfo.managedSevenZipAesCbc || 0}`
  },
  {
    type: 'negativeProbe',
    name: '探测负缓存',
    detail: `7z AES-CBC ${status.negativeProbe.sevenZipAesCbc || 0}，WinZip AES ${status.negativeProbe.winZipAes || 0}`
  },
  {
    type: 'redirect',
    name: 'Redirect 临时缓存',
    detail: `当前结构 ${status.redirect.current || 0}，旧结构 ${status.redirect.legacy || 0}`
  }
])

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`
  return `${value} B`
}

async function loadAll() {
  const res = await getProxyCacheStatusReq()
  Object.assign(status.preview, res.data.preview || {})
  Object.assign(status.archiveInfo, res.data.archiveInfo || {})
  Object.assign(status.negativeProbe, res.data.negativeProbe || {})
  Object.assign(status.redirect, res.data.redirect || {})
  Object.assign(form, res.data.config || {})
}

async function saveConfig() {
  const res = await saveProxyCacheConfigReq(form)
  Object.assign(form, res.data || {})
  ElMessage.success(res.msg || '保存成功')
  await loadAll()
}

async function confirmClear(type) {
  try {
    await ElMessageBox.confirm('只会清理本机代理缓存，不会删除网盘文件。确认继续？', '清理缓存', {
      type: 'warning',
      confirmButtonText: '确认清理',
      cancelButtonText: '取消'
    })
    await clearProxyCacheReq(type)
    ElMessage.success('清理完成')
    await loadAll()
  } catch (e) {}
}

async function exportConfig() {
  const res = await exportProxyCacheConfigReq()
  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'proxy-cache-config.json'
  link.click()
  URL.revokeObjectURL(url)
}

function importConfig(file) {
  const rawFile = file.raw
  if (!rawFile) return
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const payload = JSON.parse(String(reader.result || '{}'))
      const res = await importProxyCacheConfigReq(payload)
      Object.assign(form, res.data || {})
      ElMessage.success(res.msg || '导入成功')
      await loadAll()
    } catch (e) {
      ElMessage.error(`导入失败：${e || '配置格式或数值不正确'}`)
    }
  }
  reader.readAsText(rawFile)
}

onMounted(loadAll)
</script>

<style scoped>
.proxy-cache-page {
  padding: 18px;
  --pc-title-color: #606266;
  --pc-main-color: #303133;
  --pc-sub-color: #909399;
  --pc-unit-color: #606266;
}

.page-head,
.section-head,
.head-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.head-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.mb-16px {
  margin-bottom: 16px;
}

.page-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.stat-title {
  color: var(--pc-title-color);
  font-size: 13px;
}

.stat-main {
  margin-top: 8px;
  color: var(--pc-main-color);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
}

.stat-sub {
  margin-top: 4px;
  color: var(--pc-sub-color);
  font-size: 12px;
}

.unit {
  margin-left: 8px;
  color: var(--pc-unit-color);
}

:deep(.el-input-number) {
  width: 180px;
}
</style>

<!-- 非 scoped：确保暗色模式 CSS 变量覆盖能穿透到所有子组件 -->
<style>
html.dark .proxy-cache-page {
  --pc-title-color: #cfd3dc;
  --pc-main-color: #ffffff;
  --pc-sub-color: #a8abb2;
  --pc-unit-color: #cfd3dc;

  --el-text-color-primary: #ffffff;
  --el-text-color-regular: #cfd3dc;
  --el-text-color-secondary: #a8abb2;
  --el-text-color-placeholder: #8d9095;

  --el-bg-color: #263445;
  --el-bg-color-overlay: #1d2b3a;
  --el-fill-color: #1d2b3a;
  --el-fill-color-light: #2a3a4d;
  --el-fill-color-lighter: #2a3a4d;
  --el-fill-color-blank: #1d2b3a;

  --el-border-color: #4a5a6e;
  --el-border-color-light: #4a5a6e;
  --el-border-color-lighter: #3a4a5e;
  --el-border-color-extra-light: #2a3a4d;

  --el-input-bg-color: #1d2b3a;
  --el-input-text-color: #cfd3dc;
  --el-input-border-color: #4a5a6e;
  --el-input-placeholder-color: #8d9095;

  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: #1d2b3a;
  --el-table-border-color: #4a5a6e;
  --el-table-text-color: #cfd3dc;
  --el-table-header-text-color: #e5eaf3;
  --el-table-row-hover-bg-color: #2a3a4d;

  --el-card-bg-color: #263445;

  --el-disabled-bg-color: #1d2b3a;
  --el-disabled-text-color: #6c7a8a;
  --el-disabled-border-color: #3a4a5e;

  --el-divider-border-color: #3a4a5e;

  --el-switch-off-color: #4a5a6e;

  --el-alert-info-bg-color: #1a2a3a;
  --el-alert-info-title-color: #cfd3dc;
}

html.dark .proxy-cache-page .el-card {
  background-color: var(--el-card-bg-color);
  border-color: var(--el-border-color-light);
  color: var(--el-text-color-regular);
}

html.dark .proxy-cache-page .el-form-item__label {
  color: var(--el-text-color-regular);
}

html.dark .proxy-cache-page .el-divider__text {
  background-color: #263445;
  color: var(--el-text-color-regular);
}

html.dark .proxy-cache-page .el-alert {
  border-color: #3a4a5e;
}

html.dark .proxy-cache-page .el-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: #1d2b3a;
  color: var(--el-text-color-regular);
}

html.dark .proxy-cache-page .el-input-number .el-input__wrapper {
  background-color: #1d2b3a;
  box-shadow: 0 0 0 1px #4a5a6e inset;
}

html.dark .proxy-cache-page .el-input-number .el-input__inner {
  color: #cfd3dc;
}

html.dark .proxy-cache-page .el-switch__label {
  color: var(--el-text-color-regular);
}

html.dark .proxy-cache-page .el-switch__label.is-active {
  color: var(--el-text-color-primary);
}
</style>
