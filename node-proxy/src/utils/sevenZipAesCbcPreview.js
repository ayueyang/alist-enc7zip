import childProcess from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import levelDB from './levelDB'
import { getSevenZipAesCbcPasswordHash } from './sevenZipAesCbcCache'
import { isSevenZipAesCbcEncType } from './sevenZipAesCbc'
import {
  cleanupPreviewCache,
  getGifNegativeCacheSeconds,
  getPreviewCacheDir,
  getPreviewJobLimit,
  getPreviewProfileOverrides,
  getPreviewQueueLimit,
  isPreviewAsyncEnabled,
  isPreviewDiskCacheEnabled,
} from './proxyCacheManager'

const PREVIEW_TABLE = 'sevenZipAesCbcPreview_'
const NEGATIVE_TABLE = 'sevenZipAesCbcPreviewNegative_'
const PREVIEW_META_SECONDS = 60 * 60 * 72
const DEFAULT_QUALITY = 'high'
const DEFAULT_DURATION_SECONDS = 6
const DURATION_SECONDS = [3, 6, 9]
const pendingJobs = new Map()
const previewQueue = []
let activePreviewJobs = 0

const QUALITY_PROFILES = {
  low: { fps: 4, width: 180, timeoutMs: 45000 },
  medium: { fps: 8, width: 180, timeoutMs: 60000 },
  high: { fps: 12, width: 180, timeoutMs: 90000 },
}

const PLACEHOLDER_GIF = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJAAABACwAAAAAAQABAAACAkQBADs=',
  'base64'
)

function normalizeFilePath(filePath = '') {
  const text = String(filePath || '')
  try {
    return decodeURIComponent(text)
  } catch (e) {
    return text
  }
}

function metaKey(key) {
  return PREVIEW_TABLE + key
}

function previewVariantKey(key, quality, durationSeconds) {
  return `${key}_${quality}_${durationSeconds}s`
}

function negativeKey(key, quality, durationSeconds) {
  return `${NEGATIVE_TABLE}${previewVariantKey(key, quality, durationSeconds)}`
}

function ensurePreviewDir() {
  const PREVIEW_DIR = getPreviewCacheDir()
  if (!fs.existsSync(PREVIEW_DIR)) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true })
  }
}

function getCachePath(key, quality, durationSeconds) {
  ensurePreviewDir()
  return path.join(getPreviewCacheDir(), `${key}-${quality}-${durationSeconds}s.gif`)
}

function getTempPath(cachePath) {
  return `${cachePath}.${process.pid}.${Date.now()}.tmp`
}

function encodeUrlPath(filePath) {
  return normalizeFilePath(filePath)
    .split('/')
    .map((item, index) => (index === 0 ? '' : encodeURIComponent(item)))
    .join('/')
}

function getModifiedValue(fileInfo = {}) {
  return fileInfo.modified || fileInfo.updated_at || fileInfo.time || fileInfo.last_modified || ''
}

function getSevenZipAesCbcPackageSize(fileInfo = {}) {
  const sevenZipAesCbcInfo = fileInfo.sevenZipAesCbcInfo || {}
  return Number(sevenZipAesCbcInfo.totalSize || sevenZipAesCbcInfo.packageSize || fileInfo.sevenZipAesCbcPackageSize || fileInfo.size) || 0
}

function getMaxPreviewJobs() {
  const maxJobs = Number(process.env.SEVEN_ZIP_AES_CBC_PREVIEW_JOBS)
  return Number.isFinite(maxJobs) && maxJobs > 0 ? maxJobs : getPreviewJobLimit()
}

function drainPreviewQueue() {
  while (activePreviewJobs < getMaxPreviewJobs() && previewQueue.length > 0) {
    const item = previewQueue.shift()
    activePreviewJobs++
    item
      .job()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        activePreviewJobs--
        drainPreviewQueue()
      })
  }
}

function enqueuePreviewJob(job) {
  return new Promise((resolve, reject) => {
    if (previewQueue.length >= getPreviewQueueLimit()) {
      reject(new Error('preview queue is full'))
      return
    }
    previewQueue.push({ job, resolve, reject })
    drainPreviewQueue()
  })
}

export function normalizeSevenZipAesCbcPreviewQuality(quality) {
  return QUALITY_PROFILES[quality] ? quality : DEFAULT_QUALITY
}

export function normalizeSevenZipAesCbcPreviewDurationSeconds(durationSeconds) {
  const duration = Number(durationSeconds)
  return DURATION_SECONDS.includes(duration) ? duration : DEFAULT_DURATION_SECONDS
}

export function getSevenZipAesCbcPreviewProfile(quality) {
  const normalizedQuality = normalizeSevenZipAesCbcPreviewQuality(quality)
  const baseProfile = QUALITY_PROFILES[normalizedQuality]
  const overrides = getPreviewProfileOverrides()
  return {
    ...baseProfile,
    width: overrides.width || baseProfile.width,
    timeoutMs: (overrides.timeoutMs && overrides.timeoutMs[normalizedQuality]) || baseProfile.timeoutMs,
  }
}

export function isSevenZipAesCbcPreviewCandidate(fileInfo, passwdInfo) {
  return !!(
    passwdInfo &&
    isSevenZipAesCbcEncType(passwdInfo.encType) &&
    passwdInfo.sevenZipAesCbcPreview !== false &&
    fileInfo &&
    !fileInfo.is_dir &&
    Number(fileInfo.type) === 2
  )
}

export async function prepareSevenZipAesCbcPreviewThumb(fileInfo, passwdInfo, options = {}) {
  if (!isSevenZipAesCbcPreviewCandidate(fileInfo, passwdInfo)) return null
  const quality = normalizeSevenZipAesCbcPreviewQuality(options.quality || passwdInfo.sevenZipAesCbcPreviewQuality)
  const durationSeconds = normalizeSevenZipAesCbcPreviewDurationSeconds(
    options.durationSeconds || passwdInfo.sevenZipAesCbcPreviewDurationSeconds
  )
  const virtualPath = normalizeFilePath(fileInfo.path)
  const packagePath = normalizeFilePath(fileInfo.sevenZipAesCbcPackagePath || fileInfo.path)
  const innerName = fileInfo.sevenZipAesCbcVirtualName || fileInfo.name
  const packageSize = getSevenZipAesCbcPackageSize(fileInfo)
  const plainSize = Number(fileInfo.plainSize || fileInfo.size) || 0
  const passwordHash = getSevenZipAesCbcPasswordHash(passwdInfo.password)
  const seed = [
    virtualPath,
    packagePath,
    packageSize,
    plainSize,
    getModifiedValue(fileInfo),
    innerName,
    passwordHash,
    quality,
    durationSeconds,
  ].join('\n')
  const key = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32)
  await levelDB.setExpire(
    metaKey(key),
    {
      key,
      virtualPath,
      packagePath,
      innerName,
      packageSize,
      plainSize,
      modified: getModifiedValue(fileInfo),
      sign: fileInfo.sign || '',
      passwordHash,
      quality,
      durationSeconds,
      createdAt: Date.now(),
    },
    PREVIEW_META_SECONDS
  )
  return `/7z-aes-cbc-preview/${key}.gif?quality=${quality}&duration=${durationSeconds}`
}

function findBinary(name, envName) {
  const envPath = process.env[envName]
  if (envPath && fs.existsSync(envPath)) return envPath
  const localPath = path.join(process.cwd(), 'bin', 'ffmpeg', 'bin', process.platform === 'win32' ? `${name}.exe` : name)
  if (fs.existsSync(localPath)) return localPath
  const command = process.platform === 'win32' ? 'where' : 'which'
  const result = childProcess.spawnSync(command, [name], { encoding: 'utf8' })
  if (result.status !== 0) return null
  const first = String(result.stdout || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean)
  return first || null
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, { windowsHide: true })
    const stderr = []
    const stdout = []
    let finished = false
    const timeout = setTimeout(() => {
      if (finished) return
      finished = true
      child.kill('SIGKILL')
      reject(new Error(`${path.basename(command)} timeout`))
    }, options.timeoutMs || 60000)

    child.stdout.on('data', (chunk) => {
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr.push(chunk)
    })
    child.on('error', (err) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      reject(err)
    })
    child.on('close', (code) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString())
        return
      }
      reject(new Error(Buffer.concat(stderr).toString().slice(0, 4000) || `${path.basename(command)} exited ${code}`))
    })
  })
}

async function probeDuration(ffprobePath, sourceUrl, timeoutMs) {
  try {
    const output = await runProcess(
      ffprobePath,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', sourceUrl],
      { timeoutMs }
    )
    const duration = Number(String(output || '').trim())
    return Number.isFinite(duration) && duration > 0 ? duration : 0
  } catch (e) {
    return 0
  }
}

export function getSevenZipAesCbcPreviewStartSecond(duration, clipSeconds) {
  const totalSeconds = Number(duration)
  const seconds = normalizeSevenZipAesCbcPreviewDurationSeconds(clipSeconds)
  if (!Number.isFinite(totalSeconds) || totalSeconds <= seconds) return 0
  return Math.max(0, Math.floor(totalSeconds / 2 - seconds / 2))
}

async function generatePreviewGif(meta, quality, durationSeconds, cachePath, options = {}) {
  const ffmpegPath = findBinary('ffmpeg', 'FFMPEG_PATH')
  const ffprobePath = findBinary('ffprobe', 'FFPROBE_PATH')
  if (!ffmpegPath || !ffprobePath) {
    throw new Error('ffmpeg/ffprobe not found')
  }
  const profile = getSevenZipAesCbcPreviewProfile(quality)
  const signedSourcePath = meta.packagePath || meta.virtualPath
  const sourceRoute = meta.sign
    ? `/p${encodeUrlPath(signedSourcePath)}?sign=${encodeURIComponent(meta.sign)}`
    : `/d${encodeUrlPath(meta.virtualPath)}`
  const sourceUrl = `${options.baseUrl}${sourceRoute}`
  const duration = await probeDuration(ffprobePath, sourceUrl, Math.min(20000, profile.timeoutMs))
  const tempPath = getTempPath(cachePath)
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    String(getSevenZipAesCbcPreviewStartSecond(duration, durationSeconds)),
    '-t',
    String(durationSeconds),
    '-i',
    sourceUrl,
    '-an',
    '-sn',
    '-vf',
    `fps=${profile.fps},scale=${profile.width}:-1:flags=lanczos`,
    '-loop',
    '0',
    '-f',
    'gif',
    tempPath,
  ]
  try {
    await runProcess(ffmpegPath, args, { timeoutMs: profile.timeoutMs })
    fs.renameSync(tempPath, cachePath)
    await cleanupPreviewCache()
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
    }
  }
}

async function cacheNegative(key, quality, durationSeconds, error) {
  await levelDB.setExpire(
    negativeKey(key, quality, durationSeconds),
    {
      key,
      quality,
      durationSeconds,
      error: error && error.message ? error.message : String(error || ''),
      updatedAt: Date.now(),
    },
    getGifNegativeCacheSeconds()
  )
}

export function getSevenZipAesCbcPreviewPlaceholderGif() {
  return PLACEHOLDER_GIF
}

export async function getSevenZipAesCbcPreviewGif(key, quality, options = {}) {
  if (!/^[a-f0-9]{32}$/.test(String(key || ''))) {
    return { body: PLACEHOLDER_GIF, placeholder: true, reason: 'invalid-preview-key' }
  }
  const normalizedQuality = normalizeSevenZipAesCbcPreviewQuality(quality)
  const durationSeconds = normalizeSevenZipAesCbcPreviewDurationSeconds(options.durationSeconds)
  const meta = await levelDB.getValue(metaKey(key))
  if (!meta) {
    return { body: PLACEHOLDER_GIF, placeholder: true, reason: 'missing-preview-meta' }
  }
  if (!isPreviewDiskCacheEnabled()) {
    return { body: PLACEHOLDER_GIF, placeholder: true, reason: 'preview-disk-cache-disabled' }
  }
  const cachePath = getCachePath(key, normalizedQuality, durationSeconds)
  if (fs.existsSync(cachePath)) {
    return { body: fs.readFileSync(cachePath), placeholder: false, cachePath }
  }
  const negative = await levelDB.getValue(negativeKey(key, normalizedQuality, durationSeconds))
  if (negative) {
    return { body: PLACEHOLDER_GIF, placeholder: true, reason: negative.error }
  }
  const jobKey = previewVariantKey(key, normalizedQuality, durationSeconds)
  if (!pendingJobs.has(jobKey)) {
    if (pendingJobs.size >= getPreviewQueueLimit()) {
      return { body: PLACEHOLDER_GIF, placeholder: true, reason: 'preview-queue-full' }
    }
    pendingJobs.set(
      jobKey,
      enqueuePreviewJob(() => generatePreviewGif(meta, normalizedQuality, durationSeconds, cachePath, options))
        .catch(async (e) => {
          await cacheNegative(key, normalizedQuality, durationSeconds, e)
          return e && e.message ? e.message : String(e || '')
        })
        .finally(() => {
          pendingJobs.delete(jobKey)
        })
    )
  }
  if (isPreviewAsyncEnabled() && !options.waitForReady) {
    return { body: PLACEHOLDER_GIF, placeholder: true, reason: 'preview-generating' }
  }
  const errorReason = await pendingJobs.get(jobKey)
  if (fs.existsSync(cachePath)) {
    return { body: fs.readFileSync(cachePath), placeholder: false, cachePath }
  }
  return { body: PLACEHOLDER_GIF, placeholder: true, reason: errorReason || 'preview-generation-failed' }
}

export function getSevenZipAesCbcPreviewRuntimeStats() {
  return {
    previewActiveJobs: activePreviewJobs,
    previewQueuedJobs: previewQueue.length,
    previewPendingJobs: pendingJobs.size,
  }
}
