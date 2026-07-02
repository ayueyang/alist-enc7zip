<template>
  <div class="scroll-y setting-page">
    <h3 class="page-title">Alist服务配置</h3>
    <div v-lang class="section-label">服务地址</div>
    <!--条件搜索-->
    <el-form ref="refSearchForm" :label-position="labelPosition" label-width="115px" :model="alistConfigForm">
      <el-form-item prop="username" label="服务器">
        <el-input v-model="alistConfigForm.serverHost" style="max-width: 260px" placeholder="127.0.0.1" />
        <span class="form-tip">alist的ip或者域名地址</span>
      </el-form-item>
      <el-form-item prop="password" label="端口">
        <el-input v-model="alistConfigForm.serverPort" style="max-width: 260px" placeholder="5244" />
      </el-form-item>
      <el-form-item prop="https" label="https">
        <el-switch v-model="alistConfigForm.https" class="ml-2" style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
        <span class="form-tip">默认http</span>
      </el-form-item>

      <el-form-item label="密码设置">
        <el-button type="success" @click="addPasswd">添加</el-button>
      </el-form-item>
      <div v-for="(item, index) in alistConfigForm.passwdList" :key="item.id" class="config-block">
        <div class="config-block-title">配置 {{ index + 1 }}</div>
        <el-form-item label="开启">
          <el-switch v-model="item.enable" class="ml-2" style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
          <el-button type="danger" :icon="Delete" size="small" @click="delPasswd(index)" style="margin-left: 16px">删除</el-button>
        </el-form-item>
        <el-form-item label="算法">
          <el-radio-group v-model="item.encType" size="small">
            <!-- <el-radio label="mix" border>MIX</el-radio> -->
            <el-radio label="aesctr" border>AES-CTR</el-radio>
            <el-radio label="chacha20" border>CHACHA20</el-radio>
            <el-radio label="rc4" border>RC4</el-radio>
            <el-radio label="winzip-aes-ctr" border>WinZip-AES-CTR</el-radio>
            <el-radio label="7z-aes-cbc" border>7z AES-CBC</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="item.password" style="max-width: 260px; margin-right: 10px" placeholder="12341234" />
        </el-form-item>
        <el-form-item label="文件名">
          <span class="inline-label">加密</span>
          <el-switch v-model="item.encName" class="ml-2" style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
          <!-- 后缀
          <el-input v-model="item.encSuffix" style="max-width: 150px; margin-left: 10px" placeholder="默认原文件名后缀" /> -->
        </el-form-item>
        <el-form-item v-if="item.encType === 'winzip-aes-ctr'" label="WinZip探测">
          <span class="inline-label">自动识别ZIP</span>
          <el-switch v-model="item.zipAutoCache" class="ml-2" style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
          <span class="form-tip" style="margin-left: 6px">列表页自动解析 WinZip-AES-CTR 压缩包</span>
        </el-form-item>
        <el-form-item v-if="item.encType === 'winzip-aes-ctr' || item.encType === '7z-aes-cbc'" label="压缩包信息">
          <span class="inline-label">缓存解析结果</span>
          <el-switch v-model="item.zipInfoCache" class="ml-2" style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
          <el-input v-model="item.zipInfoCacheDays" style="max-width: 90px; margin-right: 8px" placeholder="30" />
          <span class="inline-label">天</span>
        </el-form-item>
        <el-form-item v-if="item.encType === '7z-aes-cbc'" label="第三方7z探测">
          <span class="inline-label">解析外部7z</span>
          <el-switch v-model="item.sevenZipAesCbcAutoCache" class="ml-2" style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
          <span class="form-tip" style="margin-left: 6px">自己上传的 7z AES-CBC（AES-256-CBC）包名会直接识别，普通 .7z 才后台探测</span>
        </el-form-item>
        <el-form-item v-if="item.encType === '7z-aes-cbc'" label="7z AES-CBC（AES-256）预览">
          <span class="inline-label">列表GIF</span>
          <el-switch v-model="item.sevenZipAesCbcPreview" class="ml-2" style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
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
          <el-input v-model="item.encPath" style="max-width: 350px; margin-right: 10px" placeholder="多个目录用逗号，隔开" />
          <span class="form-tip" style="font-size: 13px">example: encrypt/*</span>
        </el-form-item>
        <el-form-item label="目录名加密">
          <el-radio-group v-model="item.encFolder" size="small">
            <el-radio :label="false" border>关闭（默认）</el-radio>
            <el-radio :label="true" border>开启</el-radio>
          </el-radio-group>
          <div class="help-text">
            <div>关闭：文件夹名保持明文，适合多层路径（如 会员/enc7zip/ChaCha20/*）。可用"子密码"功能为文件夹生成带密码的名称。</div>
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
        <el-form-item label="子密码:">
          <span class="inline-label">根据文件夹的名字自动识别文件夹的秘钥</span>
          <el-button type="success" size="small" style="margin-left: 10px" @click="checkFoldName(item)">获取</el-button>
        </el-form-item>
      </div>
      <el-form-item>
        <el-button type="primary" @click="saveAlistConfig">保存</el-button>
      </el-form-item>
      <el-dialog v-model="dialogFolderFormVisible" title="获取文件夹密文" style="min-width: 320px">
        <el-tabs v-model="activeName" class="demo-tabs" @tab-click="handleClick">
          <el-tab-pane label="加密名字" name="encode">
            <el-form :model="folderForm">
              <el-form-item prop="username" label="文件夹名称">
                <el-input v-model="folderForm.folderName" style="max-width: 260px" placeholder="folder name" />
              </el-form-item>
              <el-form-item prop="username" label="算法类型">
                <el-radio-group v-model="folderForm.folderEncType" style="margin: 0 15px" size="small">
                  <!-- <el-radio label="mix" border>MIX</el-radio> -->
                  <el-radio label="aesctr" border>AES-CTR</el-radio>
                  <el-radio label="chacha20" border>CHACHA20</el-radio>
                  <el-radio label="rc4" border>RC4</el-radio>
                  <el-radio label="7z-aes-cbc" border>7Z-AES-CBC</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item prop="username" label="文件夹密码">
                <el-input v-model="folderForm.folderPasswd" style="max-width: 260px" placeholder="123456" />
              </el-form-item>
              <el-form-item prop="username" label="加密结果">
                {{ folderForm.folderNameEnc }}
              </el-form-item>
              <el-button type="success" @click="encodeFoldName">查询</el-button>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="解密名字" name="decode">
            <el-form :model="folderForm">
              <el-form-item prop="username" label="文件夹名称">
                <el-input v-model="folderForm.folderNameEnc" style="max-width: 260px" placeholder="folder name" />
              </el-form-item>
              <el-form-item prop="username" label="算法类型">
                {{ folderForm.folderEncType }}
              </el-form-item>
              <el-form-item prop="username" label="文件夹密码">
                {{ folderForm.folderPasswd }}
              </el-form-item>
              <el-button type="success" @click="decodeFoldName">解密</el-button>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </el-dialog>
    </el-form>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useConfigStore } from '@/store/config'
import { useBasicStore } from '@/store/basic'
import { getAlistConfigReq, saveAlistConfigReq, encodeFoldNameReq, decodeFoldNameReq } from '@/api/user'

import { Check, Delete, Edit, Message, Search, Star, CirclePlus, Folder } from '@element-plus/icons-vue'
import { random } from 'lodash'

const labelPosition = ref('right')
const dialogFolderFormVisible = ref(false)
const activeName = ref('encode')

const basicStore = useBasicStore()
const { settings, userInfo } = basicStore

const { setLanguage } = useConfigStore()
const route = useRoute()
const changeLanguage = (langParam) => {
  setLanguage(langParam)
}
const folderForm = reactive({
  folderName: 'my video',
  encType: 'aesctr',
  folderPasswd: '123456', // 文件夹密码
  folderNameEnc: '',
  folderEncType: 'aesctr',
  password: '' // base password
})

const alistConfigForm = reactive({
  name: '',
  path: '/*',
  describe: '',
  serverHost: '127.0.0.1',
  serverPort: '5244',
  https: false,
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
      encPath: '333'
    }
  ]
})
const refSearchForm = $ref()
// 添加密码配置
const addPasswd = () => {
  alistConfigForm.passwdList.push({
    id: Math.random(),
    password: '123456',
    encType: 'aesctr',
    enable: true,
    encName: true,
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
    encPath: '/aliyun/encrypt/*'
  })
}

const delPasswd = (index) => {
  alistConfigForm.passwdList.splice(index, 1)
}
const checkFoldName = (item) => {
  dialogFolderFormVisible.value = true
  folderForm.password = item.password
  folderForm.encType = item.encType
}

const encodeFoldName = async () => {
  const res = await encodeFoldNameReq(folderForm)
  folderForm.folderNameEnc = `${folderForm.folderName}_${res.data.folderNameEnc}`
}

const decodeFoldName = async () => {
  const res = await decodeFoldNameReq(folderForm)
  folderForm.folderPasswd = res.data.folderPasswd
  folderForm.folderEncType = res.data.folderEncType
}

const saveAlistConfig = () => {
  saveAlistConfigReq(alistConfigForm).then(res =>{
    ElMessage.success(res.msg)
  })
}
onMounted(async () => {
  const res = await getAlistConfigReq()
  for (const passwdInfo of res.data.passwdList) {
    passwdInfo.id = Math.random()
    if (passwdInfo.zipInfoCache === undefined) passwdInfo.zipInfoCache = true
    if (!passwdInfo.zipInfoCacheDays) passwdInfo.zipInfoCacheDays = 30
    if (passwdInfo.zipAutoCache === undefined) passwdInfo.zipAutoCache = false
    if (passwdInfo.sevenZipAesCbcAutoCache === undefined) passwdInfo.sevenZipAesCbcAutoCache = false
    if (passwdInfo.sevenZipAesCbcPreview === undefined) passwdInfo.sevenZipAesCbcPreview = false
    if (!['low', 'medium', 'high'].includes(passwdInfo.sevenZipAesCbcPreviewQuality)) passwdInfo.sevenZipAesCbcPreviewQuality = 'high'
    if (![3, 6, 9, '3', '6', '9'].includes(passwdInfo.sevenZipAesCbcPreviewDurationSeconds)) passwdInfo.sevenZipAesCbcPreviewDurationSeconds = 6
    passwdInfo.encPath = passwdInfo.encPath.reduce((a, b) => `${a},${b}`)
  }
  Object.assign(alistConfigForm, res.data)
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
</style>
