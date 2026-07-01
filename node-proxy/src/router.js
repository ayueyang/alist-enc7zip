'use strict'

import Router from 'koa-router'
import bodyparser from 'koa-bodyparser'
import crypto from 'crypto'
import fs from 'fs'
import { alistServer, webdavServer, port, initAlistConfig, version, writeRuntimeConfig } from './config'
import { getUserInfo, cacheUserToken, getUserByToken, updateUserInfo } from './dao/userDao'
import responseHandle from './middleware/responseHandle'
import { encodeFromFolder, decodeFromFolder } from './utils/commonUtil'
import { encryptFile, searchFile } from './utils/convertFile'
import {
  clearProxyCache,
  getProxyCacheConfig,
  getProxyCacheExportData,
  getProxyCacheStatus,
  importProxyCacheConfig,
  saveProxyCacheConfig,
} from './utils/proxyCacheManager'
import { getSevenZipAesCbcPreviewRuntimeStats, isSevenZipAesCbcPreviewAvailable, normalizeSevenZipAesCbcPreviewQuality, normalizeSevenZipAesCbcPreviewDurationSeconds } from './utils/sevenZipAesCbcPreview'
import { getSevenZipAesCbcProbeRuntimeStats } from './utils/sevenZipAesCbcCache'
import { getWinZipAesZipProbeRuntimeStats } from './utils/winZipAesZipCache'
import { isSevenZipAesCbcEncType } from './utils/sevenZipAesCbc'

// bodyparser解析body
const bodyparserMw = bodyparser({ enableTypes: ['json', 'form', 'text'] })

// 总路径，添加所有的子路由
const allRouter = new Router()
// 拦截全部
allRouter.all(/^\/enc-api\/*/, bodyparserMw, responseHandle, async (ctx, next) => {
  console.log('@@log request-url: ', ctx.req.url)
  await next()
})

// 白名单路由
allRouter.all('/enc-api/login', async (ctx, next) => {
  const { username, password } = ctx.request.body
  console.log(username, password)
  const userInfo = await getUserInfo(username)
  console.log(userInfo)
  if (userInfo && password === userInfo.password) {
    // 创建token
    const token = crypto.randomUUID()
    // 异步执行
    cacheUserToken(token, userInfo)
    userInfo.password = null
    ctx.body = { data: { userInfo, jwtToken: token } }
    return
  }
  ctx.body = { msg: 'passwword error', code: 500 }
})

// 拦截登录
allRouter.all(/^\/enc-api\/*/, async (ctx, next) => {
  // nginx不支持下划线headers
  const { authorizetoken: authorizeToken } = ctx.request.headers
  // 查询数据库是否有密码
  const userInfo = await getUserByToken(authorizeToken)
  if (userInfo == null) {
    ctx.body = { code: 401, msg: 'user unlogin' }
    return
  }
  ctx.userInfo = userInfo
  await next()
})

// 设置前缀
const router = new Router({ prefix: '/enc-api' })

// 用户信息
router.all('/getUserInfo', async (ctx, next) => {
  const userInfo = ctx.userInfo
  console.log('@@getUserInfo', userInfo)
  userInfo.password = null
  const data = {
    codes: [16, 9, 10, 11, 12, 13, 15],
    userInfo,
    menuList: [],
    roles: ['admin'],
    version,
  }
  ctx.body = { data }
})

// 更新用户信息
router.all('/updatePasswd', async (ctx, next) => {
  const { password, newpassword, username } = ctx.request.body
  if (newpassword.length < 7) {
    ctx.body = { msg: 'password too short, at less 8 digits', code: 500 }
    return
  }
  const userInfo = await getUserInfo(username)
  if (password !== userInfo.password) {
    ctx.body = { msg: 'password error', code: 500 }
    return
  }
  userInfo.password = newpassword
  updateUserInfo(userInfo)
  ctx.body = { msg: 'update success' }
})

router.all('/getAlistConfig', async (ctx, next) => {
  ctx.body = { data: alistServer._snapshot }
})

router.all('/saveAlistConfig', async (ctx, next) => {
  let alistConfig = ctx.request.body
  for (const index in alistConfig.passwdList) {
    const passwdInfo = alistConfig.passwdList[index]
    if (typeof passwdInfo.encPath === 'string') {
      passwdInfo.encPath = passwdInfo.encPath.split(',')
    }
  }
  const _snapshot = JSON.parse(JSON.stringify(alistConfig))
  // 写入到文件中，这里并不是真正的同步，，
  alistConfig = initAlistConfig(alistConfig)
  Object.assign(alistServer, alistConfig)
  alistServer._snapshot = _snapshot
  writeRuntimeConfig()
  ctx.body = { msg: 'save ok' }
})

router.all('/getWebdavonfig', async (ctx, next) => {
  ctx.body = { data: webdavServer }
})

router.all('/saveWebdavConfig', async (ctx, next) => {
  const config = ctx.request.body
  for (const index in config.passwdList) {
    const passwdInfo = config.passwdList[index]
    if (typeof passwdInfo.encPath === 'string') {
      passwdInfo.encPath = passwdInfo.encPath.split(',')
    }
  }
  config.id = crypto.randomUUID()
  webdavServer.push(config)
  writeRuntimeConfig()
  ctx.body = { data: webdavServer }
})

router.all('/updateWebdavConfig', async (ctx, next) => {
  const config = ctx.request.body
  for (const index in config.passwdList) {
    const passwdInfo = config.passwdList[index]
    if (typeof passwdInfo.encPath === 'string') {
      passwdInfo.encPath = passwdInfo.encPath.split(',')
    }
  }

  for (const index in webdavServer) {
    if (webdavServer[index].id === config.id) {
      webdavServer[index] = config
    }
  }
  writeRuntimeConfig()
  ctx.body = { data: webdavServer }
})

router.all('/delWebdavConfig', async (ctx, next) => {
  const { id } = ctx.request.body
  for (const index in webdavServer) {
    if (webdavServer[index].id === id) {
      webdavServer.splice(index, 1)
    }
  }
  writeRuntimeConfig()
  ctx.body = { data: webdavServer }
})

function getProxyCacheRuntimeStats() {
  const previewStats = getSevenZipAesCbcPreviewRuntimeStats()
  const sevenZipProbeStats = getSevenZipAesCbcProbeRuntimeStats()
  const winZipProbeStats = getWinZipAesZipProbeRuntimeStats()
  return {
    ...previewStats,
    sevenZipProbe: sevenZipProbeStats,
    winZipProbe: winZipProbeStats,
  }
}

router.all('/proxy-cache/status', async (ctx) => {
  const data = await getProxyCacheStatus(getProxyCacheRuntimeStats())
  data.ffmpegAvailable = isSevenZipAesCbcPreviewAvailable()
  ctx.body = { data }
})

router.all('/proxy-cache/config', async (ctx) => {
  if (ctx.method.toLocaleUpperCase() === 'GET') {
    ctx.body = { data: getProxyCacheConfig() }
    return
  }
  const { config, warnings } = saveProxyCacheConfig(ctx.request.body || {})
  ctx.body = { msg: warnings.length ? warnings.join('; ') : 'save ok', data: config }
})

router.all('/proxy-cache/clear', async (ctx) => {
  const type = (ctx.request.body && ctx.request.body.type) || 'all'
  if (!['preview', 'archiveInfo', 'negativeProbe', 'redirect', 'all'].includes(type)) {
    ctx.body = { code: 500, msg: 'invalid cache clear type' }
    return
  }
  const data = await clearProxyCache(type)
  ctx.body = { msg: 'clear ok', data }
})

router.all('/proxy-cache/export', async (ctx) => {
  const data = getProxyCacheExportData()
  ctx.set('content-type', 'application/json; charset=utf-8')
  ctx.set('content-disposition', 'attachment; filename="proxy-cache-config.json"')
  ctx.body = { data }
})

router.all('/proxy-cache/import', async (ctx) => {
  const payload = ctx.request.body || {}
  const { config, warnings } = importProxyCacheConfig(payload)
  ctx.body = { msg: warnings.length ? warnings.join('; ') : 'import ok', data: config }
})

// 7z AES-CBC 预览简易配置
function collectSevenZipAesCbcPreviewConfigs() {
  const configs = []
  const alistPasswdList = (alistServer && alistServer._snapshot && alistServer._snapshot.passwdList) || alistServer.passwdList || []
  for (const passwdInfo of alistPasswdList) {
    if (passwdInfo.enable && isSevenZipAesCbcEncType(passwdInfo.encType)) {
      configs.push({
        source: 'alist',
        describe: passwdInfo.describe || '',
        encPath: passwdInfo.encPath,
        preview: {
          enabled: passwdInfo.sevenZipAesCbcPreview === true,
          quality: normalizeSevenZipAesCbcPreviewQuality(passwdInfo.sevenZipAesCbcPreviewQuality),
          duration: normalizeSevenZipAesCbcPreviewDurationSeconds(passwdInfo.sevenZipAesCbcPreviewDurationSeconds),
        },
      })
    }
  }
  if (Array.isArray(webdavServer)) {
    for (const webdavConfig of webdavServer) {
      for (const passwdInfo of webdavConfig.passwdList || []) {
        if (passwdInfo.enable && isSevenZipAesCbcEncType(passwdInfo.encType)) {
          configs.push({
            source: 'webdav',
            name: webdavConfig.name || webdavConfig.describe || '',
            describe: passwdInfo.describe || '',
            encPath: passwdInfo.encPath,
            preview: {
              enabled: passwdInfo.sevenZipAesCbcPreview === true,
              quality: normalizeSevenZipAesCbcPreviewQuality(passwdInfo.sevenZipAesCbcPreviewQuality),
              duration: normalizeSevenZipAesCbcPreviewDurationSeconds(passwdInfo.sevenZipAesCbcPreviewDurationSeconds),
            },
          })
        }
      }
    }
  }
  return configs
}

function applySevenZipAesCbcPreviewConfig(index, preview) {
  const configs = collectSevenZipAesCbcPreviewConfigs()
  if (index < 0 || index >= configs.length) return false
  const target = configs[index]
  const nextPreview = {
    enabled: preview.enabled === true,
    quality: normalizeSevenZipAesCbcPreviewQuality(preview.quality),
    duration: normalizeSevenZipAesCbcPreviewDurationSeconds(preview.duration),
  }
  if (target.source === 'alist') {
    let count = 0
    for (const passwdInfo of alistServer.passwdList) {
      if (passwdInfo.enable && isSevenZipAesCbcEncType(passwdInfo.encType)) {
        if (count === index) {
          passwdInfo.sevenZipAesCbcPreview = nextPreview.enabled
          passwdInfo.sevenZipAesCbcPreviewQuality = nextPreview.quality
          passwdInfo.sevenZipAesCbcPreviewDurationSeconds = nextPreview.duration
          break
        }
        count++
      }
    }
    // 同步 snapshot
    if (alistServer._snapshot && alistServer._snapshot.passwdList) {
      count = 0
      for (const passwdInfo of alistServer._snapshot.passwdList) {
        if (passwdInfo.enable && isSevenZipAesCbcEncType(passwdInfo.encType)) {
          if (count === index) {
            passwdInfo.sevenZipAesCbcPreview = nextPreview.enabled
            passwdInfo.sevenZipAesCbcPreviewQuality = nextPreview.quality
            passwdInfo.sevenZipAesCbcPreviewDurationSeconds = nextPreview.duration
            break
          }
          count++
        }
      }
    }
  } else {
    let globalIndex = 0
    // 先数 alist 的数量
    for (const passwdInfo of (alistServer.passwdList || [])) {
      if (passwdInfo.enable && isSevenZipAesCbcEncType(passwdInfo.encType)) globalIndex++
    }
    for (const webdavConfig of webdavServer) {
      for (const passwdInfo of webdavConfig.passwdList || []) {
        if (passwdInfo.enable && isSevenZipAesCbcEncType(passwdInfo.encType)) {
          if (globalIndex === index) {
            passwdInfo.sevenZipAesCbcPreview = nextPreview.enabled
            passwdInfo.sevenZipAesCbcPreviewQuality = nextPreview.quality
            passwdInfo.sevenZipAesCbcPreviewDurationSeconds = nextPreview.duration
            break
          }
          globalIndex++
        }
      }
    }
  }
  writeRuntimeConfig()
  return true
}

router.all('/proxy-cache/7z-preview-config', async (ctx) => {
  if (ctx.method.toLocaleUpperCase() === 'GET') {
    ctx.body = { data: collectSevenZipAesCbcPreviewConfigs() }
    return
  }
  const body = ctx.request.body || {}
  const { index, preview } = body
  if (typeof index !== 'number' || !preview) {
    ctx.body = { code: 500, msg: 'missing index or preview' }
    return
  }
  const ok = applySevenZipAesCbcPreviewConfig(index, preview)
  if (!ok) {
    ctx.body = { code: 500, msg: 'invalid index' }
    return
  }
  ctx.body = { msg: 'save ok', data: collectSevenZipAesCbcPreviewConfigs() }
})

// get folder passwd encode
router.all('/encodeFoldName', async (ctx, next) => {
  const { password, encType, folderPasswd, folderEncType } = ctx.request.body
  const folderNameEnc = encodeFromFolder(password, encType, folderPasswd, folderEncType)
  ctx.body = { data: { folderNameEnc } }
  console.log('@@encodeFoldName', password, folderNameEnc)
})

router.all('/decodeFoldName', async (ctx, next) => {
  const { password, folderNameEnc, encType } = ctx.request.body
  const arr = folderNameEnc.split('_')
  if (arr.length < 2) {
    ctx.body = { msg: 'folderName not encdoe', code: 500 }
    return
  }
  const data = decodeFromFolder(password, encType, folderNameEnc)
  if (!data) {
    ctx.body = { msg: 'folderName is error', code: 500 }
    return
  }
  const { folderEncType, folderPasswd } = data
  ctx.body = { data: { folderEncType, folderPasswd } }
})

// encrypt or decrypt file
router.all('/encryptFile', async (ctx, next) => {
  const { folderPath, outPath, encType, password, operation, encName } = ctx.request.body
  if (!fs.existsSync(folderPath)) {
    ctx.body = { msg: 'encrypt file path not exists', code: 500 }
    return
  }
  const files = searchFile(folderPath)
  if (files.length > 10000) {
    ctx.body = { msg: 'too maney file, exceeding 10000', code: 500 }
    return
  }
  encryptFile(password, encType, operation, folderPath, outPath, encName)
  ctx.body = { msg: 'waiting operation' }
})

// 用这种方式代替前缀的功能，{ prefix: } 不能和正则联合使用
allRouter.use(router.routes(), router.allowedMethods())

// restRouter.all(/\/enc-api\/*/, router.routes(), restRouter.allowedMethods())
export default allRouter
