import fs from 'fs'
import path from 'path'
import levelDB from './levelDB'
import { fileInfoTable } from '../dao/fileDao'
import { defaultProxyCacheConfig, normalizeProxyCacheConfig, proxyCache, updateProxyCacheConfig } from '../config'

const PREVIEW_META_PREFIX = 'sevenZipAesCbcPreview_'
const PREVIEW_NEGATIVE_PREFIX = 'sevenZipAesCbcPreviewNegative_'
const SEVEN_ZIP_PROBE_PREFIX = 'sevenZipAesCbcProbe_'
const WINZIP_PROBE_PREFIX = 'winZipAesZipProbe_'
const REDIRECT_CACHE_VERSION = 2
const PREVIEW_DIR = path.join(process.cwd(), 'cache', '7z-aes-cbc-preview')
let cleanupTimer = null

function ensurePreviewDir() {
  if (!fs.existsSync(PREVIEW_DIR)) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true })
  }
}

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return true
  } catch (e) {
    return false
  }
}

function getPreviewFiles() {
  ensurePreviewDir()
  const now = Date.now()
  return fs
    .readdirSync(PREVIEW_DIR)
    .map((name) => {
      const filePath = path.join(PREVIEW_DIR, name)
      try {
        const stat = fs.statSync(filePath)
        if (!stat.isFile()) return null
        return {
          name,
          path: filePath,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          ageMs: now - stat.mtimeMs,
        }
      } catch (e) {
        return null
      }
    })
    .filter(Boolean)
}

export function getProxyCacheConfig() {
  return proxyCache
}

export function getRedirectCacheSeconds() {
  return Number(proxyCache.redirectCacheTtlHours || 72) * 60 * 60
}

export function getArchiveProbeNegativeCacheSeconds() {
  return Number(proxyCache.archiveProbeNegativeCacheTtlMinutes || 10) * 60
}

export function getGifNegativeCacheSeconds() {
  return Number(proxyCache.gifNegativeCacheTtlMinutes || 10) * 60
}

export function getPreviewCacheDir() {
  ensurePreviewDir()
  return PREVIEW_DIR
}

export function getPreviewLimits() {
  return {
    maxBytes: Number(proxyCache.gifCacheMaxSizeMb || 2048) * 1024 * 1024,
    maxFiles: Number(proxyCache.gifCacheMaxFiles || 10000),
    maxAgeMs: Number(proxyCache.gifCacheMaxAgeDays || 30) * 24 * 60 * 60 * 1000,
  }
}

export function getPreviewProfileOverrides() {
  return {
    width: Number(proxyCache.gifWidth || 180),
    timeoutMs: {
      low: Number(proxyCache.gifTimeoutLowSeconds || 45) * 1000,
      medium: Number(proxyCache.gifTimeoutMediumSeconds || 60) * 1000,
      high: Number(proxyCache.gifTimeoutHighSeconds || 90) * 1000,
    },
  }
}

export function isPreviewDiskCacheEnabled() {
  return proxyCache.enableGifDiskCache !== false
}

export function isPreviewAsyncEnabled() {
  return proxyCache.enablePreviewAsync !== false
}

export function getPreviewQueueLimit() {
  return Number(proxyCache.gifPreviewQueueLimit || 32)
}

export function getPreviewJobLimit() {
  return Number(proxyCache.gifPreviewJobs || 1)
}

export function startProxyCacheCleanupTimer(logger = console, options = {}) {
  stopProxyCacheCleanupTimer()
  if (options.startup !== false && proxyCache.cleanupOnStartup !== false) {
    cleanupPreviewCache().catch((e) => logger.warn('proxy cache startup cleanup failed', e && e.message))
  }
  const intervalMs = Math.max(1, Number(proxyCache.cacheCleanupIntervalMinutes || 30)) * 60 * 1000
  cleanupTimer = setInterval(() => {
    cleanupPreviewCache().catch((e) => logger.warn('proxy cache scheduled cleanup failed', e && e.message))
  }, intervalMs)
  if (cleanupTimer.unref) cleanupTimer.unref()
  return cleanupTimer
}

export function stopProxyCacheCleanupTimer() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
}

export function buildRedirectCacheData(data = {}) {
  return {
    version: REDIRECT_CACHE_VERSION,
    redirectUrl: data.redirectUrl,
    fileSize: data.fileSize,
    virtualName: data.virtualName,
    zipInfo: data.zipInfo,
    sevenZipAesCbcInfo: data.sevenZipAesCbcInfo,
    sourcePath: data.sourcePath,
    isWebdav: !!data.isWebdav,
    webdavConfigId: data.webdavConfigId || '',
    createdAt: Date.now(),
  }
}

export function isRedirectCacheData(value) {
  return !!(value && value.version === REDIRECT_CACHE_VERSION && value.redirectUrl && value.sourcePath)
}

export function resolveRedirectPasswdInfo(data, alistServer, webdavServer, pathFindPasswd) {
  if (!isRedirectCacheData(data)) return null
  if (data.isWebdav) {
    const webdavConfig =
      (webdavServer || []).find((item) => item.id === data.webdavConfigId) ||
      (webdavServer || []).find((item) => {
        try {
          return new RegExp(item.path).test(data.sourcePath)
        } catch (e) {
          return false
        }
      })
    if (!webdavConfig) return null
    return pathFindPasswd(webdavConfig.passwdList || [], data.sourcePath).passwdInfo || null
  }
  return pathFindPasswd((alistServer && alistServer.passwdList) || [], data.sourcePath).passwdInfo || null
}

function summarizeEntries(entries) {
  const now = Date.now()
  const active = entries.filter((item) => item.expire < 0 || item.expire > now)
  return {
    count: active.length,
    expired: entries.length - active.length,
  }
}

async function getArchiveInfoStats() {
  const entries = await levelDB.getEntriesByPrefix(fileInfoTable)
  let zipInfo = 0
  let sevenZipAesCbcInfo = 0
  let managedSevenZipAesCbc = 0
  for (const item of entries) {
    const value = item.value || {}
    if (value.zipInfo) zipInfo++
    if (value.sevenZipAesCbcInfo) sevenZipAesCbcInfo++
    if (value.externalSevenZipAesCbc && value.sevenZipAesCbcPackageName && !value.sevenZipAesCbcInfo) {
      managedSevenZipAesCbc++
    }
  }
  return {
    totalFileInfo: entries.length,
    zipInfo,
    sevenZipAesCbcInfo,
    managedSevenZipAesCbc,
  }
}

async function getRedirectStats() {
  const entries = await levelDB.getAllEntries()
  let current = 0
  let legacy = 0
  for (const item of entries) {
    const value = item.value || {}
    if (!value.redirectUrl) continue
    if (value.version === REDIRECT_CACHE_VERSION) {
      current++
    } else {
      legacy++
    }
  }
  return { current, legacy, total: current + legacy }
}

export function getPreviewDiskStats() {
  const files = getPreviewFiles()
  return {
    dir: PREVIEW_DIR,
    fileCount: files.length,
    totalBytes: files.reduce((sum, item) => sum + item.size, 0),
  }
}

export async function getProxyCacheStatus(runtimeStats = {}) {
  const previewMeta = summarizeEntries(await levelDB.getEntriesByPrefix(PREVIEW_META_PREFIX))
  const previewNegative = summarizeEntries(await levelDB.getEntriesByPrefix(PREVIEW_NEGATIVE_PREFIX))
  const sevenZipNegative = summarizeEntries(await levelDB.getEntriesByPrefix(SEVEN_ZIP_PROBE_PREFIX))
  const winZipNegative = summarizeEntries(await levelDB.getEntriesByPrefix(WINZIP_PROBE_PREFIX))
  return {
    config: proxyCache,
    preview: {
      ...getPreviewDiskStats(),
      metaCount: previewMeta.count,
      metaExpired: previewMeta.expired,
      negativeCount: previewNegative.count,
      negativeExpired: previewNegative.expired,
      activeJobs: runtimeStats.previewActiveJobs || 0,
      queuedJobs: runtimeStats.previewQueuedJobs || 0,
      pendingJobs: runtimeStats.previewPendingJobs || 0,
    },
    archiveInfo: await getArchiveInfoStats(),
    negativeProbe: {
      sevenZipAesCbc: sevenZipNegative.count,
      winZipAes: winZipNegative.count,
      expired: sevenZipNegative.expired + winZipNegative.expired,
    },
    redirect: await getRedirectStats(),
  }
}

export async function cleanupPreviewCache(options = {}) {
  const limits = getPreviewLimits()
  let files = getPreviewFiles()
  let removed = 0
  const now = Date.now()
  for (const file of files) {
    if (file.name.endsWith('.tmp') || now - file.mtimeMs > limits.maxAgeMs) {
      if (safeUnlink(file.path)) removed++
    }
  }
  files = getPreviewFiles().sort((a, b) => a.mtimeMs - b.mtimeMs)
  let totalBytes = files.reduce((sum, item) => sum + item.size, 0)
  while (files.length > limits.maxFiles || totalBytes > limits.maxBytes) {
    const file = files.shift()
    if (!file) break
    if (safeUnlink(file.path)) {
      removed++
      totalBytes -= file.size
    }
  }
  if (options.clearAll) {
    for (const file of getPreviewFiles()) {
      if (safeUnlink(file.path)) removed++
    }
  }
  return { removed, ...getPreviewDiskStats() }
}

export async function clearProxyCache(type) {
  const result = {}
  if (type === 'preview' || type === 'all') {
    result.previewFiles = await cleanupPreviewCache({ clearAll: true })
    result.previewMeta = await levelDB.removeByPrefix(PREVIEW_META_PREFIX)
    result.previewNegative = await levelDB.removeByPrefix(PREVIEW_NEGATIVE_PREFIX)
  }
  if (type === 'archiveInfo' || type === 'all') {
    const entries = await levelDB.getEntriesByPrefix(fileInfoTable)
    const keys = entries
      .filter((item) => {
        const value = item.value || {}
        return value.zipInfo || value.sevenZipAesCbcInfo || value.externalSevenZipAesCbc || value.externalZip
      })
      .map((item) => item.key)
    result.archiveInfo = await levelDB.removeByKeys(keys)
  }
  if (type === 'negativeProbe' || type === 'all') {
    result.sevenZipNegative = await levelDB.removeByPrefix(SEVEN_ZIP_PROBE_PREFIX)
    result.winZipNegative = await levelDB.removeByPrefix(WINZIP_PROBE_PREFIX)
  }
  if (type === 'redirect' || type === 'all') {
    const entries = await levelDB.getAllEntries()
    const keys = entries.filter((item) => item.value && item.value.redirectUrl).map((item) => item.key)
    result.redirect = await levelDB.removeByKeys(keys)
  }
  return result
}

export function saveProxyCacheConfig(nextConfig) {
  const result = updateProxyCacheConfig(nextConfig)
  startProxyCacheCleanupTimer(console, { startup: false })
  return result
}

export function getProxyCacheExportData() {
  return {
    exportedAt: new Date().toISOString(),
    proxyCache,
  }
}

export function importProxyCacheConfig(payload) {
  const source = payload && payload.proxyCache ? payload.proxyCache : payload
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('proxyCache config must be an object')
  }
  const allowedKeys = Object.keys(defaultProxyCacheConfig)
  const missingKeys = allowedKeys.filter((key) => source[key] === undefined)
  if (missingKeys.length > 0) {
    throw new Error(`proxyCache config missing fields: ${missingKeys.join(', ')}`)
  }
  const unknownKeys = Object.keys(source).filter((key) => !allowedKeys.includes(key))
  if (unknownKeys.length > 0) {
    throw new Error(`proxyCache config has unknown fields: ${unknownKeys.join(', ')}`)
  }
  const normalized = normalizeProxyCacheConfig(source, { strict: true })
  if (normalized.errors.length > 0) {
    throw new Error(normalized.errors.join('; '))
  }
  const result = updateProxyCacheConfig(normalized.config)
  startProxyCacheCleanupTimer(console, { startup: false })
  return result
}

export function getProxyCacheDefaults() {
  return {
    gifCacheMaxSizeMb: 2048,
    gifCacheMaxFiles: 10000,
    gifCacheMaxAgeDays: 30,
    gifPreviewJobs: 1,
    gifPreviewQueueLimit: 32,
    gifTimeoutLowSeconds: 45,
    gifTimeoutMediumSeconds: 60,
    gifTimeoutHighSeconds: 90,
    gifWidth: 180,
    gifNegativeCacheTtlMinutes: 10,
    archiveProbeNegativeCacheTtlMinutes: 10,
    redirectCacheTtlHours: 72,
    cacheCleanupIntervalMinutes: 30,
    cleanupOnStartup: true,
    enableGifDiskCache: true,
    enablePreviewAsync: true,
  }
}
