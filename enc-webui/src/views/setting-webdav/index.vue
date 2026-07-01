<template>
  <div class="scroll-y setting-page">
    <h3 class="page-title">Webdav服务配置</h3>
    <div class="section-label">自定义 WebDAV 路由</div>
    <el-dialog v-model="dialogFormVisible" title="配置信息" style="min-width: 320px">
      <div class="scroll-y">
        <el-form :model="configFormTemp" label-width="115px">
          <el-form-item prop="username" label="服务名称">
            <el-input v-model="configFormTemp.name" style="max-width: 260px" placeholder="webdav" />
          </el-form-item>
          <el-form-item prop="username" label="服务器">
            <el-input v-model="configFormTemp.serverHost" style="max-width: 260px" placeholder="127.0.0.1" />
            <span class="form-tip">上游 alist/webdav 的 ip 或域名</span>
          </el-form-item>
          <el-form-item prop="password" label="端口">
            <el-input v-model="configFormTemp.serverPort" style="max-width: 260px" placeholder="5244" />
            <span class="form-tip">上游 alist 端口（默认 5244）</span>
          </el-form-item>
          <el-form-item prop="password" label="主目录">
            <el-input v-model="configFormTemp.path" style="max-width: 260px" placeholder="^/webdav/*" />
            <span class="form-tip">修改后重启生效</span>
          </el-form-item>
          <el-form-item prop="enable" label="开启">
            <el-switch
              v-model="configFormTemp.enable"
              class="ml-2"
              style="margin-bottom: 5px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
            />
          </el-form-item>
          <el-form-item label="密码设置">
            <el-button type="success" @click="addPasswd">添加</el-button>
            <span class="form-tip">可添加多条，按 encPath 路径匹配生效</span>
          </el-form-item>
          <div v-for="(item, index) in configFormTemp.passwdList" :key="item.id" class="config-block">
            <div class="config-block-title">配置 {{ index + 1 }}</div>
            <el-form-item label="开启">
              <el-switch v-model="item.enable" class="ml-2" style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
              <el-button type="danger" :icon="Delete" size="small" @click="delPasswd(index)" style="margin-left: 16px">删除</el-button>
            </el-form-item>
            <el-form-item label="算法">
              <el-radio-group v-model="item.encType" size="small">
                <!-- <el-radio label="mix" border>MIX</el-radio> -->
                <el-radio label="rc4" border>RC4</el-radio>
                <el-radio label="aesctr" border>AES-CTR</el-radio>
                <el-radio label="chacha20" border>CHACHA20</el-radio>
                <el-radio label="winzip-aes-ctr" border>WinZip-AES-CTR</el-radio>
                <el-radio label="7z-aes-cbc" border>7z AES-CBC</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="item.password" style="max-width: 260px; margin-right: 10px" placeholder="12341234" />
            </el-form-item>
            <el-form-item label="文件名">
              <span class="inline-label">加密</span>
              <el-switch
                v-model="item.encName"
                class="ml-2"
                style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
              />
              <!-- 后缀
              <el-input v-model="item.encSuffix" style="max-width: 150px; margin-left: 10px" placeholder="默认原文件名后缀" /> -->
            </el-form-item>
            <el-form-item v-if="item.encType === 'winzip-aes-ctr'" label="WinZip探测">
              <span class="inline-label">自动识别ZIP</span>
              <el-switch
                v-model="item.zipAutoCache"
                class="ml-2"
                style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
              />
              <span class="form-tip" style="margin-left: 6px">列表页自动解析 WinZip-AES-CTR 压缩包</span>
            </el-form-item>
            <el-form-item v-if="item.encType === 'winzip-aes-ctr' || item.encType === '7z-aes-cbc'" label="压缩包信息">
              <span class="inline-label">缓存解析结果</span>
              <el-switch
                v-model="item.zipInfoCache"
                class="ml-2"
                style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
              />
              <el-input v-model="item.zipInfoCacheDays" style="max-width: 90px; margin-right: 8px" placeholder="30" />
              <span class="inline-label">天</span>
            </el-form-item>
            <el-form-item v-if="item.encType === '7z-aes-cbc'" label="第三方7z探测">
              <span class="inline-label">解析外部7z</span>
              <el-switch
                v-model="item.sevenZipAesCbcAutoCache"
                class="ml-2"
                style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
              />
              <span class="form-tip" style="margin-left: 6px">自己上传的 7z AES-CBC 包名会直接识别，普通 .7z 才后台探测</span>
            </el-form-item>
            <el-form-item v-if="item.encType === '7z-aes-cbc'" label="7z AES-CBC预览">
              <span class="inline-label">列表GIF</span>
              <el-switch
                v-model="item.sevenZipAesCbcPreview"
                class="ml-2"
                style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
              />
              <span class="inline-label" style="margin-left: 4px">画质</span>
              <el-radio-group v-model="item.sevenZipAesCbcPreviewQuality" size="small">
                <el-radio label="low" border>低 4帧/s</el-radio>
                <el-radio label="medium" border>中 8帧/s</el-radio>
                <el-radio label="high" border>高 12帧/s</el-radio>
              </el-radio-group>
              <span class="inline-label" style="margin-left: 10px">时长</span>
              <el-radio-group v-model="item.sevenZipAesCbcPreviewDurationSeconds" size="small" style="margin-left: 10px">
                <el-radio :label="3" border>3秒</el-radio>
                <el-radio :label="6" border>6秒</el-radio>
                <el-radio :label="9" border>9秒</el-radio>
              </el-radio-group>
              <span class="form-tip" style="margin-left: 10px">从视频中段按需生成</span>
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="item.describe" style="max-width: 260px; margin-right: 10px" placeholder="备注描述" />
            </el-form-item>
            <el-form-item label="路径">
              <el-input v-model="item.encPath" style="max-width: 350px; margin-right: 10px" placeholder="多个路径逗号，隔开" />
              <span class="form-tip" style="font-size: 13px">example: encrypt/*</span>
            </el-form-item>
            <el-form-item label="目录名加密">
              <el-radio-group v-model="item.encFolder" size="small">
                <el-radio :label="false" border>关闭（默认）</el-radio>
                <el-radio :label="true" border>开启</el-radio>
              </el-radio-group>
              <div class="help-text">
                <div>关闭：文件夹名保持明文，适合多层路径（如 会员/enc7zip/ChaCha20/*）。</div>
                <div>开启：encPath 前 N 层文件夹保持明文，其后所有文件夹名加密。需通过代理创建文件夹。</div>
              </div>
            </el-form-item>
            <el-form-item v-if="item.encFolder" label="明文层数">
              <el-input-number v-model="item.encFolderShift" :min="1" :max="10" size="small" />
              <div class="help-text">
                <div>填 1（默认）：encPath 第1层明文，第2层起全部加密。如 encPath=A/B/C/* → A明文，B+C密文。</div>
                <div>填 2：前2层明文，第3层起加密。如 encPath=A/B/C/* → A+B明文，C密文。</div>
                <div>填 N：前N层明文，第N+1层起加密。超过路径层数则全部明文（等于没加密）。</div>
              </div>
            </el-form-item>
          </div>
        </el-form>
        <span class="dialog-footer">
          <el-button @click="dialogFormVisible = false">取消</el-button>
          <el-button type="primary" @click="saveWebdavConfig()">保存</el-button>
        </span>
      </div>
    </el-dialog>
    <!-- 列表展示 -->
    <div class="card-list">
      <el-card v-for="config in configList" :key="config.id" class="webdav-card">
        <div class="card-header">
          <span class="card-title">{{ config.name }}</span>
          <el-switch
            v-model="config.enable"
            @click="updateWebdavConfig(config)"
            class="ml-2"
            style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
          />
        </div>
        <div class="card-row"><span class="card-label">服务</span>{{ config.serverHost }}</div>
        <div class="card-row"><span class="card-label">端口</span>{{ config.serverPort }}</div>
        <div class="card-row"><span class="card-label">路径</span>{{ config.path }}</div>
        <div class="card-row"><span class="card-label">描述</span>{{ config.describe }}</div>
        <div class="card-actions">
          <el-button type="danger" size="small" @click="delWebdavConfig(config.id)">删除</el-button>
          <el-button type="primary" size="small" @click="editConfig(config)">编辑</el-button>
        </div>
      </el-card>
    </div>
    <div class="add-row">
      <el-button type="success" @click="addConfig">添加配置</el-button>
      <span class="form-tip">新增后重启生效</span>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useConfigStore } from '@/store/config'
import { useBasicStore } from '@/store/basic'
import { delWebdavConfigReq, getWebdavConfigReq, saveWebdavConfigReq, updateWebdavConfigReq } from '@/api/user'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Check, Delete, Edit, Message, Search, Star, CirclePlus } from '@element-plus/icons-vue'

const dialogFormVisible = ref(false)
const configList = reactive([])

const configFormTemp = reactive({})
const configTemp = {
  name: 'webdav',
  path: '/webdav/*',
  describe: 'webdav服务',
  serverHost: '127.0.0.1',
  serverPort: '5244',
  https: false,
  enable: true,
  passwdList: [
    {
      id: Math.random(),
      password: '123456',
      encType: 'aesctr',
      enable: false,
      encName: false, // encrypt file name
      encFolder: false,
      encFolderShift: 1,
      zipInfoCache: true,
      zipInfoCacheDays: 30,
      zipAutoCache: false,
      sevenZipAesCbcAutoCache: false,
      sevenZipAesCbcPreview: false,
      sevenZipAesCbcPreviewQuality: 'high',
      sevenZipAesCbcPreviewDurationSeconds: 6,
      encSuffix: '', //
      describe: 'my video',
      encPath: '/aliyun/encrypt/*'
    }
  ]
}
Object.assign(configFormTemp, configTemp)

const refSearchForm = $ref()
// 添加密码配置
const addPasswd = () => {
  configFormTemp.passwdList.push({
    id: Math.random(),
    password: '123456',
    encType: 'aesctr',
    enable: true,
    encFolder: false,
    encFolderShift: 1,
    zipInfoCache: true,
    zipInfoCacheDays: 30,
    zipAutoCache: false,
    sevenZipAesCbcAutoCache: false,
    sevenZipAesCbcPreview: false,
    sevenZipAesCbcPreviewQuality: 'high',
    sevenZipAesCbcPreviewDurationSeconds: 6,
    describe: 'my video',
    encPath: '/dav/encrypt/*'
  })
}

const delPasswd = (index) => {
  configFormTemp.passwdList.splice(index, 1)
}

const editConfig = (config) => {
  dialogFormVisible.value = true
  Object.assign(configFormTemp, config)
}

const addConfig = () => {
  dialogFormVisible.value = true
  Object.assign(configFormTemp, configTemp)
}

const updateWebdavConfig = async (config) => {
  const result = await updateWebdavConfigReq(config)
  dialogFormVisible.value = false
  refreshConfigList(result)
  return
}

const saveWebdavConfig = async () => {
  let result = null
  if (configFormTemp.id) {
    result = await updateWebdavConfigReq(configFormTemp)
  } else {
    result = await saveWebdavConfigReq(configFormTemp)
  }
  dialogFormVisible.value = false
  refreshConfigList(result)
  return
}

const delWebdavConfig = async (id) => {
  ElMessageBox.confirm('Are you sure to delete?').then(async () => {
    const result = await delWebdavConfigReq({ id })
    refreshConfigList(result)
    dialogFormVisible.value = false
    ElMessage(result.msg)
  })
}

const refreshConfigList = async (result) => {
  const res = result || (await getWebdavConfigReq())
  configList.splice(0, configList.length)
  res.data.forEach((element) => {
    const passwdList = element.passwdList
    for (const passwdInfo of passwdList) {
      passwdInfo.id = Math.random()
      if (passwdInfo.zipInfoCache === undefined) passwdInfo.zipInfoCache = true
      if (!passwdInfo.zipInfoCacheDays) passwdInfo.zipInfoCacheDays = 30
      if (passwdInfo.zipAutoCache === undefined) passwdInfo.zipAutoCache = false
      if (passwdInfo.sevenZipAesCbcAutoCache === undefined) passwdInfo.sevenZipAesCbcAutoCache = false
      if (passwdInfo.sevenZipAesCbcPreview === undefined) passwdInfo.sevenZipAesCbcPreview = false
      if (!['low', 'medium', 'high'].includes(passwdInfo.sevenZipAesCbcPreviewQuality)) passwdInfo.sevenZipAesCbcPreviewQuality = 'high'
      if (![3, 6, 9, '3', '6', '9'].includes(passwdInfo.sevenZipAesCbcPreviewDurationSeconds)) passwdInfo.sevenZipAesCbcPreviewDurationSeconds = 6
      // passwdInfo.encPath = passwdInfo.encPath.reduce((a, b) => `${a},${b}`)
    }
    configList.push(element)
  })
}

onMounted(async () => {
  refreshConfigList()
})
</script>
<style lang="scss" scoped>
.setting-page {
  padding: 4px 8px;
}
.page-title {
  font-size: 22px;
  font-weight: 600;
  margin: 4px 0 12px;
  color: var(--enc-config-title-color, var(--el-text-color-primary));
  letter-spacing: 0.5px;
}
.section-label {
  font-weight: 600;
  font-size: 15px;
  margin: 20px 0 10px;
  color: var(--enc-config-title-color, var(--el-text-color-primary));
}
.config-block {
  padding: 14px 0 4px;
  margin-bottom: 4px;
  border-top: 1px solid var(--el-border-color-lighter, rgba(255, 255, 255, 0.09));
}
.config-block :deep(.el-form-item__content) {
  flex-wrap: wrap;
  row-gap: 8px;
  align-items: center;
}
.config-block :deep(.el-radio-group) {
  margin-right: 8px;
}
.config-block :deep(.el-button.is-circle) {
  margin-left: 8px;
}
.config-block-title {
  font-weight: 600;
  font-size: 14px;
  margin: 0 0 12px;
  color: var(--enc-config-title-color, var(--el-text-color-primary));
}
.form-tip {
  display: inline-block;
  font-size: 12px;
  line-height: 1.5;
  color: var(--enc-tip-color, var(--el-text-color-secondary));
  margin-left: 12px;
}
.inline-label {
  display: inline-block;
  font-size: 13px;
  line-height: 1.5;
  color: var(--enc-config-title-color, var(--el-text-color-primary));
  margin-right: 6px;
}
.help-text {
  font-size: 12px;
  line-height: 1.6;
  margin-top: 8px;
  color: var(--enc-tip-color, var(--el-text-color-secondary));
}
.card-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0;
}
.webdav-card {
  width: 260px;
  :deep(.el-card__body) {
    padding: 14px;
  }
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter, rgba(255, 255, 255, 0.09));
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--enc-config-title-color, var(--el-text-color-primary));
}
.card-row {
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}
.card-label {
  display: inline-block;
  width: 36px;
  color: var(--enc-tip-color, var(--el-text-color-secondary));
  margin-right: 6px;
}
.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.add-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
</style>
