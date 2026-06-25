'use strict'

import Router from 'koa-router'
import bodyparser from 'koa-bodyparser'
import {
  encodeName,
  pathFindPasswd,
  convertShowName,
  convertRealName,
  convertRealPath,
  getAListFileTypeByName,
  getOrigName,
  isEncryptedZipName,
  isOrigName,
} from './utils/commonUtil'
import path from 'path'
import { httpClient, httpProxy } from './utils/httpClient'
import FlowEnc from './utils/flowEnc'
import { logger } from './common/logger'
import { getFileInfo, removeFileInfo } from './dao/fileDao'
import WinZipAesZip, { isWinZipAesEncType } from './utils/winZipAesZip'
import { enqueueExternalWinZipAesZipProbe } from './utils/winZipAesZipCache'
import SevenZipAesCbc, {
  isSevenZipAesCbcEncType,
} from './utils/sevenZipAesCbc'
import {
  cacheGeneratedSevenZipAesCbcInfo,
  cacheSevenZipAesCbcManagedNameFileInfo,
  enqueueExternalSevenZipAesCbcProbe,
  getSevenZipAesCbcCachedFileInfoByVirtualPath,
  getSevenZipAesCbcManagedPackageName,
  getSevenZipAesCbcManagedVirtualName,
  getSevenZipAesCbcUploadCachePaths,
  isSevenZipAesCbcFileName,
  isSevenZipAesCbcTypedVirtualName,
  isUsableSevenZipAesCbcInfoCache,
} from './utils/sevenZipAesCbcCache'
import { prepareSevenZipAesCbcPreviewThumb } from './utils/sevenZipAesCbcPreview'

// bodyparser解析body
const bodyparserMw = bodyparser({ enableTypes: ['json', 'form', 'text'] })

const encNameRouter = new Router()
const origPrefix = 'orig_'

function getEncryptedFileName(passwdInfo, fileName) {
  const baseName = path.basename(fileName)
  if (isWinZipAesEncType(passwdInfo.encType)) {
    return convertRealName(passwdInfo.password, passwdInfo.encType, baseName)
  }
  const ext = passwdInfo.encSuffix || path.extname(baseName)
  const encName = encodeName(passwdInfo.password, passwdInfo.encType, baseName)
  return encName + ext
}

function getZipPreviewName(fileInfo) {
  return fileInfo.showName || fileInfo.name
}

async function getCachedFileInfoByPath(filePath) {
  return (await getFileInfo(encodeURIComponent(filePath))) || (await getFileInfo(filePath))
}

async function getCachedSevenZipAesCbcFileInfoByPath(filePath, passwdInfo) {
  return (
    (await getSevenZipAesCbcCachedFileInfoByVirtualPath(filePath, passwdInfo.password)) ||
    (await getCachedFileInfoByPath(filePath))
  )
}

function getSevenZipAesCbcCachedPackageName(fileInfo, fallbackName) {
  return (
    (fileInfo &&
      (fileInfo.sevenZipAesCbcPackageName ||
        path.basename(fileInfo.sevenZipAesCbcPackagePath || '') ||
        (isSevenZipAesCbcFileName(fileInfo.name) ? fileInfo.name : ''))) ||
    fallbackName
  )
}

async function getSevenZipAesCbcRequestPackageName(dir, name, passwdInfo) {
  const cachedFileInfo = await getCachedSevenZipAesCbcFileInfoByPath(joinUrlPath(dir, name), passwdInfo)
  if (cachedFileInfo) return getSevenZipAesCbcCachedPackageName(cachedFileInfo, name)
  if (isSevenZipAesCbcFileName(name)) return name
  return getSevenZipAesCbcManagedPackageName(passwdInfo.password, name)
}

function isRawZipName(passwdInfo, fileName) {
  return (
    isWinZipAesEncType(passwdInfo.encType) &&
    String(fileName || '').toLowerCase().endsWith('.zip') &&
    !isEncryptedZipName(passwdInfo.password, passwdInfo.encType, fileName)
  )
}

function isRawSevenZipAesCbcName(passwdInfo, fileName) {
  return isSevenZipAesCbcEncType(passwdInfo.encType) && isSevenZipAesCbcFileName(fileName)
}

function getRequestRealName(passwdInfo, fileName, fileInfo) {
  if (isSevenZipAesCbcEncType(passwdInfo.encType)) {
    if (fileInfo) return getSevenZipAesCbcCachedPackageName(fileInfo, fileName)
    if (isSevenZipAesCbcFileName(fileName)) return fileName
    // 缓存未命中时（如移动后新路径无缓存），用密码+文件名计算确定性的 .7z 包名
    // 与 getSevenZipAesCbcRequestPackageName 的回退逻辑保持一致
    return getSevenZipAesCbcManagedPackageName(passwdInfo.password, fileName)
  }
  if (fileInfo && (fileInfo.externalZip || fileInfo.externalSevenZipAesCbc)) {
    return fileInfo.name || fileName
  }
  if (isRawZipName(passwdInfo, fileName) || isRawSevenZipAesCbcName(passwdInfo, fileName)) {
    return fileName
  }
  return isOrigName(fileName) ? getOrigName(fileName) : convertRealName(passwdInfo.password, passwdInfo.encType, fileName)
}

function getShowName(passwdInfo, rawName, fileInfo) {
  if (isSevenZipAesCbcEncType(passwdInfo.encType)) {
    if (fileInfo && fileInfo.externalSevenZipAesCbc && fileInfo.sevenZipAesCbcInfo) {
      return fileInfo.sevenZipAesCbcInfo.innerName || fileInfo.sevenZipAesCbcVirtualName || rawName
    }
    return rawName
  }
  if (fileInfo && (fileInfo.externalZip || fileInfo.externalSevenZipAesCbc)) {
    return rawName
  }
  if (isRawZipName(passwdInfo, rawName) || isRawSevenZipAesCbcName(passwdInfo, rawName)) {
    return rawName
  }
  return convertShowName(passwdInfo.password, passwdInfo.encType, rawName)
}

function getExternalZipRenameTarget(fileInfo, name) {
  if (!fileInfo || !fileInfo.externalZip) return name
  if (path.extname(name).toLowerCase() !== '.zip') return name
  const zipInfo = fileInfo.zipInfo || {}
  const innerExt = path.extname(zipInfo.innerName || '')
  return innerExt ? path.basename(name, '.zip') + innerExt : name
}

function joinUrlPath(dir, name) {
  return `${String(dir || '').replace(/\/$/, '')}/${name}`
}

function appendUrlSign(urlValue, sign) {
  if (!sign || String(urlValue || '').indexOf('sign=') >= 0) return urlValue
  return `${urlValue}${String(urlValue).indexOf('?') >= 0 ? '&' : '?'}sign=${encodeURIComponent(sign)}`
}

const cacheFileInfoList = async (ctx, next) => {
  const { path: foldPath } = ctx.request.body || {}
  if (foldPath) {
    const realfoldPath = convertRealPath(ctx.req.webdavConfig.passwdList, foldPath)
    ctx.request.body.path = realfoldPath
    ctx.req.reqBody = JSON.stringify(ctx.request.body)
    logger.info('@@fs/reqBody', realfoldPath, ctx.req.reqBody)
  }
  delete ctx.req.headers['content-length']
  await next()
}

function getSevenZipAesCbcProbeUrl(fileInfo, request) {
  if (fileInfo.sign) {
    return `${request.serverAddr}/p${encodeURI(fileInfo.path)}?sign=${encodeURIComponent(fileInfo.sign)}`
  }
  return request.serverAddr + fileInfo.path
}

function prepareWinZipAesListFileInfo(fileInfo, request, passwdInfo) {
  if (!isWinZipAesEncType(passwdInfo.encType) || fileInfo.is_dir || !String(fileInfo.name || '').toLowerCase().endsWith('.zip')) {
    return fileInfo
  }
  const isManaged = isEncryptedZipName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
  if (isManaged) {
    fileInfo.name = convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
    fileInfo.type = getAListFileTypeByName(fileInfo.name)
    return fileInfo
  }
  if (passwdInfo.zipAutoCache) {
    enqueueExternalWinZipAesZipProbe({
      fileInfo,
      urlAddr: request.serverAddr + fileInfo.path,
      headers: request.headers,
      passwdInfo,
    })
  }
  return fileInfo
}

async function prepareSevenZipAesCbcListFileInfo(fileInfo, request, passwdInfo) {
  if (!isSevenZipAesCbcEncType(passwdInfo.encType) || fileInfo.is_dir || !isSevenZipAesCbcFileName(fileInfo.name)) {
    return fileInfo
  }
  const packagePath = fileInfo.path
  const cachedFileInfo = await getCachedFileInfoByPath(fileInfo.path)
  logger.debug('@@prepare7z name=', fileInfo.name, 'cached=', !!cachedFileInfo, 'usableCache=', cachedFileInfo ? isUsableSevenZipAesCbcInfoCache(cachedFileInfo, fileInfo.size, passwdInfo.password) : false)
  if (isUsableSevenZipAesCbcInfoCache(cachedFileInfo, fileInfo.size, passwdInfo.password)) {
    const sevenZipAesCbcInnerName = cachedFileInfo.sevenZipAesCbcInfo.innerName
    const sevenZipAesCbcPackagePath = cachedFileInfo.sevenZipAesCbcPackagePath || fileInfo.path
    fileInfo.plainSize = cachedFileInfo.plainSize
    fileInfo.sevenZipAesCbcInfo = cachedFileInfo.sevenZipAesCbcInfo
    fileInfo.externalSevenZipAesCbc = cachedFileInfo.externalSevenZipAesCbc
    fileInfo.sevenZipAesCbcVirtualName = sevenZipAesCbcInnerName
    fileInfo.sevenZipAesCbcPackageName = cachedFileInfo.sevenZipAesCbcPackageName || fileInfo.name
    fileInfo.sevenZipAesCbcPackagePath = sevenZipAesCbcPackagePath
    fileInfo.name = sevenZipAesCbcInnerName
    fileInfo.path = joinUrlPath(path.dirname(sevenZipAesCbcPackagePath), sevenZipAesCbcInnerName)
    fileInfo.size = cachedFileInfo.plainSize || fileInfo.size
    fileInfo.type = getAListFileTypeByName(sevenZipAesCbcInnerName)
    return fileInfo
  }
  const managedVirtualName = getSevenZipAesCbcManagedVirtualName(passwdInfo.password, fileInfo.name)
  logger.debug('@@prepare7z managedVirtualName=', managedVirtualName, 'typed=', managedVirtualName ? isSevenZipAesCbcTypedVirtualName(managedVirtualName) : false, 'autoCache=', passwdInfo.sevenZipAesCbcAutoCache, 'origType=', fileInfo.type)
  if (managedVirtualName && isSevenZipAesCbcTypedVirtualName(managedVirtualName)) {
    fileInfo.externalSevenZipAesCbc = true
    fileInfo.sevenZipAesCbcVirtualName = managedVirtualName
    fileInfo.sevenZipAesCbcPackageName = path.basename(packagePath)
    fileInfo.sevenZipAesCbcPackagePath = packagePath
    await cacheSevenZipAesCbcManagedNameFileInfo(fileInfo, managedVirtualName, passwdInfo.password)
    fileInfo.name = managedVirtualName
    fileInfo.path = joinUrlPath(path.dirname(packagePath), managedVirtualName)
    fileInfo.type = getAListFileTypeByName(managedVirtualName)
    return fileInfo
  }
  if (passwdInfo.sevenZipAesCbcAutoCache) {
    enqueueExternalSevenZipAesCbcProbe({
      fileInfo,
      urlAddr: getSevenZipAesCbcProbeUrl(fileInfo, request),
      headers: request.headers,
      passwdInfo,
    })
  }
  return fileInfo
}

encNameRouter.all('/api/fs/list', bodyparserMw, cacheFileInfoList, async (ctx, next) => {
  console.log('@@encrypt file name ', ctx.req.url)
  await next()
  const result = ctx.body
  const { passwdList } = ctx.req.webdavConfig
  if (result.code === 200 && result.data) {
    const content = result.data.content
    if (!content) {
      return
    }
    for (let i = 0; i < content.length; i++) {
      const fileInfo = content[i]
      if (fileInfo.is_dir) {
        const { passwdInfo } = pathFindPasswd(passwdList, decodeURI(fileInfo.path))
        if (passwdInfo && passwdInfo.encFolder) {
          const shiftCount = Math.max(1, Number(passwdInfo.encFolderShift) || 1)
          // 用完整路径深度判断是否在密文层，pathInfo[0] 只含 encPath 匹配部分会导致深度计算错误
          const pathNames = decodeURI(fileInfo.path).split('/').filter(n => n)
          if (pathNames.length > shiftCount) {
            fileInfo.name = convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
          }
        }
        continue
      }
      //  Check path if the file name needs to be encrypted
      const { passwdInfo } = pathFindPasswd(passwdList, decodeURI(fileInfo.path))
      if (passwdInfo && passwdInfo.encName) {
        prepareWinZipAesListFileInfo(fileInfo, ctx.req, passwdInfo)
        await prepareSevenZipAesCbcListFileInfo(fileInfo, ctx.req, passwdInfo)
        const sevenZipAesCbcPreviewThumb = await prepareSevenZipAesCbcPreviewThumb(fileInfo, passwdInfo)
        if (sevenZipAesCbcPreviewThumb) {
          fileInfo.thumb = sevenZipAesCbcPreviewThumb
        } else if (fileInfo.externalSevenZipAesCbc && Number(fileInfo.type) === 5) {
          // 7z AES-CBC 图片文件：设置 thumb 为虚拟路径的下载 URL
          fileInfo.thumb = appendUrlSign(`/d${fileInfo.path}`, fileInfo.sign)
        }
        if (!isWinZipAesEncType(passwdInfo.encType) && !isSevenZipAesCbcEncType(passwdInfo.encType)) {
          fileInfo.name = convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
        }
      }
    }

    const coverNameMap = {} //根据不含后缀的视频文件名找到对应的含后缀的封面文件名
    const omitNames = [] //用于隐藏封面文件
    const { path } = JSON.parse(ctx.req.reqBody)
    result.data.content.forEach((fileInfo) => {
      if (fileInfo.is_dir) {
        return
      }
      if (fileInfo.type === 4) {
        coverNameMap[fileInfo.name.split('.')[0]] = fileInfo.name
      }
    })
    result.data.content.forEach((fileInfo) => {
      if (fileInfo.is_dir) {
        return
      }
      const coverName = coverNameMap[getZipPreviewName(fileInfo).split('.')[0]]
      if (fileInfo.type === 2 && coverName) {
        omitNames.push(coverName)
        fileInfo.thumb = `/d${path}/${coverName}`
      }
    })
    //不展示封面文件，也许可以添加个配置让用户选择是否展示封面源文件
    result.data.content = result.data.content.filter((fileInfo) => !omitNames.includes(fileInfo.name))
  }
})

// 处理网页上传文件
encNameRouter.put('/api/fs/put', async (ctx, next) => {
  const request = ctx.req
  const { headers, webdavConfig } = request
  const contentLength = headers['content-length'] || 0
  request.fileSize = contentLength * 1

  const uploadEncPath = headers['file-path'] ? decodeURIComponent(headers['file-path']) : '/-'
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, uploadEncPath)
  if (passwdInfo) {
    const fileName = path.basename(uploadEncPath)
    const uploadPath = joinUrlPath(convertRealPath(ctx.req.webdavConfig.passwdList, path.dirname(uploadEncPath)), fileName)
    let realName = fileName
    let filePath = uploadPath
    let packageSize = request.fileSize
    // you can custom Suffix
    if (isSevenZipAesCbcEncType(passwdInfo.encType) || passwdInfo.encName) {
      realName = isSevenZipAesCbcEncType(passwdInfo.encType)
        ? getSevenZipAesCbcManagedPackageName(passwdInfo.password, fileName)
        : getEncryptedFileName(passwdInfo, fileName)
      filePath = path.dirname(uploadPath) + '/' + realName
      logger.debug('@@encfileName', fileName, uploadPath, filePath)
      headers['file-path'] = encodeURIComponent(filePath)
    }
    if (isWinZipAesEncType(passwdInfo.encType)) {
      packageSize = WinZipAesZip.packageSize(request.fileSize, { originalName: fileName })
      headers['content-length'] = String(packageSize)
    } else if (isSevenZipAesCbcEncType(passwdInfo.encType)) {
      packageSize = SevenZipAesCbc.packageSize(request.fileSize, { originalName: fileName })
      headers['content-length'] = String(packageSize)
    }
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize, { originalName: fileName })
    if (isSevenZipAesCbcEncType(passwdInfo.encType)) {
      for (const cachePath of getSevenZipAesCbcUploadCachePaths(filePath)) {
        await cacheGeneratedSevenZipAesCbcInfo({
          password: passwdInfo.password,
          filePath: cachePath,
          realName: path.basename(cachePath),
          originalName: fileName,
          plainSize: request.fileSize,
          packageSize,
          iv: flowEnc.encryptFlow.iv,
          passwdInfo,
        })
      }
    }
    return await httpProxy(ctx.req, ctx.res, flowEnc.encryptTransform())
  }
  return await httpProxy(ctx.req, ctx.res)
})

// remove
encNameRouter.all('/api/fs/remove', bodyparserMw, async (ctx, next) => {
  const { dir: showDir, names } = ctx.request.body
  const { webdavConfig } = ctx.req
  const dir = convertRealPath(ctx.req.webdavConfig.passwdList, showDir)
  // 用显示路径匹配 encPath（加密路径中的密文文件夹名无法匹配 encPath 显示名模式）
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, showDir + '/')
  // maybe a folder，remove anyway the name
  let fileNames = Object.assign([], names)
  if (passwdInfo && passwdInfo.encName && isSevenZipAesCbcEncType(passwdInfo.encType)) {
    fileNames = []
    for (const name of names) {
      fileNames.push(await getSevenZipAesCbcRequestPackageName(dir, name, passwdInfo))
    }
  } else if (passwdInfo && passwdInfo.encName && !isSevenZipAesCbcEncType(passwdInfo.encType)) {
    fileNames = Object.assign([], names)
    const shiftCount = Math.max(1, Number(passwdInfo.encFolderShift) || 1)
    // 用显示路径的完整深度判断明文层（pathInfo[0] 只含 encPath 匹配部分，不含子路径）
    const showDirNames = showDir.split('/').filter(n => n)
    const isPlainLayer = passwdInfo.encFolder && showDirNames.length < shiftCount
    for (const name of names) {
      if (isRawZipName(passwdInfo, name) || isRawSevenZipAesCbcName(passwdInfo, name)) {
        continue
      }
      // 明文层的文件夹名是明文，不需要加密
      if (isPlainLayer) {
        const cachedFileInfo = await getCachedFileInfoByPath(joinUrlPath(dir, name))
        if (cachedFileInfo && cachedFileInfo.is_dir) {
          continue
        }
      }
      // is not enc name
      const realName = convertRealName(passwdInfo.password, passwdInfo.encType, name)
      fileNames.push(realName)
    }
  }
  const reqBody = { dir, names: fileNames }
  logger.info('@@reqBody remove', reqBody)
  ctx.req.reqBody = JSON.stringify(reqBody)
  // reset content-length length
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  ctx.body = respBody
  let parsedBody = null
  try {
    parsedBody = typeof respBody === 'string' ? JSON.parse(respBody) : respBody
  } catch (e) {}
  if (!parsedBody || parsedBody.code === 200) {
    const cachePaths = []
    for (let i = 0; i < names.length; i++) {
      const showName = names[i]
      const realName = fileNames[i] || showName
      cachePaths.push(joinUrlPath(showDir, showName))
      cachePaths.push(joinUrlPath(dir, showName))
      cachePaths.push(joinUrlPath(dir, realName))
      if (showName !== realName) {
        cachePaths.push(joinUrlPath(showDir, realName))
      }
    }
    await removeFileInfo(cachePaths)
  }
})

// 处理目录加密
encNameRouter.all('/api/fs/dirs', bodyparserMw, async (ctx, next) => {
  const { path: foldPath } = ctx.request.body
  const realfoldPath = convertRealPath(ctx.req.webdavConfig.passwdList, foldPath)
  ctx.request.body.path = realfoldPath
  ctx.req.reqBody = JSON.stringify(ctx.request.body)
  logger.info('@@fs/dirs', ctx.req.reqBody)
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  const result = JSON.parse(respBody)
  ctx.body = result
  // 用显示路径前缀匹配 encPath（完整匹配在多层 encPath 中间层浏览时会失败）
  // 例如 encPath=会员/enc7zip/ChaCha20/*，用户浏览 /会员/enc7zip/ 时完整匹配失败
  const { passwdList } = ctx.req.webdavConfig
  const showDirNames = foldPath.split('/').filter(n => n)
  if (result.data && result.data.length > 0) {
    outer: for (const passwdInfo of passwdList) {
      if (!passwdInfo.enable || !passwdInfo.encFolder) continue
      for (const encPath of passwdInfo.encPath) {
        // encPath 格式如 "会员/enc7zip/ChaCha20/*"，去掉 /* 得到前缀
        const encPathNames = encPath.replace(/\/\*$/, '').split('/').filter(n => n)
        // 检查 foldPath 是否是 encPath 前缀路径（showDirNames 前 N 项等于 encPathNames）
        const checkLen = Math.min(showDirNames.length, encPathNames.length)
        let isPrefix = true
        for (let i = 0; i < checkLen; i++) {
          if (showDirNames[i] !== encPathNames[i]) { isPrefix = false; break }
        }
        if (!isPrefix) continue
        // 子项深度 = showDirNames.length + 1，在密文层 ⟺ 子项深度 > shiftCount ⟺ showDirNames.length >= shiftCount
        const shiftCount = Math.max(1, Number(passwdInfo.encFolderShift) || 1)
        if (showDirNames.length >= shiftCount) {
          for (const nameObj of result.data) {
            nameObj.name = convertShowName(passwdInfo.password, passwdInfo.encType, nameObj.name)
          }
        }
        break outer
      }
    }
  }
  logger.info('@@fs/dirs', realfoldPath)
})

encNameRouter.all('/api/fs/mkdir', bodyparserMw, async (ctx, next) => {
  const { path: foldPath } = ctx.request.body
  const realfoldPath = convertRealPath(ctx.req.webdavConfig.passwdList, foldPath)
  ctx.request.body.path = realfoldPath
  ctx.req.reqBody = JSON.stringify(ctx.request.body)
  logger.info('@@fs/mkdirs', ctx.req.reqBody)
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  ctx.body = JSON.parse(respBody)
  logger.info('@@fs/mkdir', realfoldPath)
})

const copyOrMoveFile = async (ctx, next) => {
  const { dst_dir: dstShowDir, src_dir: srcShowDir, names } = ctx.request.body
  const { webdavConfig } = ctx.req
  const dstDir = convertRealPath(ctx.req.webdavConfig.passwdList, dstShowDir)
  const srcDir = convertRealPath(ctx.req.webdavConfig.passwdList, srcShowDir)
  // 用显示路径匹配 encPath（加密路径中的密文文件夹名无法匹配 encPath 显示名模式）
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, srcShowDir + '/')
  let fileNames = []
  if (passwdInfo && passwdInfo.encName && isSevenZipAesCbcEncType(passwdInfo.encType)) {
    logger.info('@@move 7z AES-CBC name', passwdInfo.encName)
    for (const name of names) {
      fileNames.push(await getSevenZipAesCbcRequestPackageName(srcDir, name, passwdInfo))
    }
  } else if (passwdInfo && passwdInfo.encName && !isSevenZipAesCbcEncType(passwdInfo.encType)) {
    logger.info('@@move encName', passwdInfo.encName)
    const shiftCount = Math.max(1, Number(passwdInfo.encFolderShift) || 1)
    // 用显示路径的完整深度判断明文层（pathInfo[0] 只含 encPath 匹配部分，不含子路径）
    const srcShowDirNames = srcShowDir.split('/').filter(n => n)
    const isPlainLayer = passwdInfo.encFolder && srcShowDirNames.length < shiftCount
    for (const name of names) {
      // is not enc name
      if (name.indexOf(origPrefix) === 0) {
        const origName = name.replace(origPrefix, '')
        fileNames.push(origName)
        break
      }
      const cachedFileInfo = await getCachedFileInfoByPath(joinUrlPath(srcDir, name))
      if (
        (cachedFileInfo && (cachedFileInfo.externalZip || cachedFileInfo.externalSevenZipAesCbc)) ||
        isRawZipName(passwdInfo, name) ||
        isRawSevenZipAesCbcName(passwdInfo, name)
      ) {
        fileNames.push(name)
        continue
      }
      // 明文层的文件夹名是明文，不需要加密
      if (isPlainLayer && cachedFileInfo && cachedFileInfo.is_dir) {
        fileNames.push(name)
        continue
      }
      const newFileName = getEncryptedFileName(passwdInfo, name)
      fileNames.push(newFileName)
    }
  } else {
    fileNames = Object.assign([], names)
  }
  const reqBody = { dst_dir: dstDir, src_dir: srcDir, names: fileNames }
  ctx.req.reqBody = JSON.stringify(reqBody)
  logger.info('@@move reqBody', ctx.req.reqBody)
  // reset content-length length
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  ctx.body = respBody
}

encNameRouter.all('/api/fs/move', bodyparserMw, copyOrMoveFile)
encNameRouter.all('/api/fs/copy', bodyparserMw, copyOrMoveFile)
encNameRouter.all('/api/fs/recursive_move', bodyparserMw, copyOrMoveFile)

encNameRouter.all('/api/fs/get', bodyparserMw, async (ctx, next) => {
  const { path: filePath } = ctx.request.body
  const { webdavConfig } = ctx.req
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  logger.debug('@@encNameRouter /api/fs/get', filePath, 'passwdInfo:', !!passwdInfo, 'encName:', passwdInfo?.encName)
  let fileInfo = null
  if (passwdInfo && passwdInfo.encName) {
    ctx.req.encVirtualPath = filePath
    // reset content-length length
    delete ctx.req.headers['content-length']
    // check fileName is not enc
    const fileName = path.basename(filePath)
    // 先转换文件夹路径为密文路径，再用密文路径查找缓存
    // list 缓存 key 是 convertRealPath(密文文件夹) + '/' + 明文文件名，get 必须用相同 key 才能命中
    const folderRealPath = convertRealPath(ctx.req.webdavConfig.passwdList, path.dirname(filePath))
    const realFilePath = joinUrlPath(folderRealPath, fileName)
    // getCachedSevenZipAesCbcFileInfoByPath 内部已通过 getSevenZipAesCbcCachedFileInfoByVirtualPath
    // 用明文名计算 managed package name 并查找密文包路径缓存，无需额外拼接 .7z 后缀查找
    fileInfo = isSevenZipAesCbcEncType(passwdInfo.encType)
      ? await getCachedSevenZipAesCbcFileInfoByPath(realFilePath, passwdInfo)
      : await getCachedFileInfoByPath(realFilePath)
    if (fileInfo && fileInfo.is_dir) {
      await next()
      return
    }
    if (isWinZipAesEncType(passwdInfo.encType)) {
      ctx.req.isExternalZip = !!(fileInfo && fileInfo.externalZip)
      ctx.req.isExternalZipCandidate = !ctx.req.isExternalZip && isRawZipName(passwdInfo, fileName)
      if (ctx.req.isExternalZip && fileInfo.zipInfo) {
        ctx.req.zipVirtualName = fileInfo.zipInfo.innerName
        ctx.req.cachedExternalZipInfo = fileInfo.zipInfo
      }
    }
    if (isSevenZipAesCbcEncType(passwdInfo.encType)) {
      ctx.req.isExternalSevenZipAesCbc = !!(
        fileInfo &&
        fileInfo.externalSevenZipAesCbc &&
        isUsableSevenZipAesCbcInfoCache(fileInfo, fileInfo.size, passwdInfo.password)
      )
      ctx.req.isExternalSevenZipAesCbcCandidate =
        !ctx.req.isExternalSevenZipAesCbc && isSevenZipAesCbcFileName(fileName)
      if (ctx.req.isExternalSevenZipAesCbc && fileInfo.sevenZipAesCbcInfo) {
        ctx.req.sevenZipAesCbcVirtualName = fileInfo.sevenZipAesCbcInfo.innerName
        ctx.req.cachedExternalSevenZipAesCbcInfo = fileInfo.sevenZipAesCbcInfo
      }
    }
    //  Check if it is a directory
    const realName = getRequestRealName(passwdInfo, fileName, fileInfo)
    const fpath = folderRealPath + '/' + realName
    logger.debug('@@getFilePath', fpath)
    ctx.request.body.path = fpath
  }
  await next()
  if (passwdInfo && passwdInfo.encName) {
    if (!ctx.body || !ctx.body.data) {
      const folderRealPath = convertRealPath(ctx.req.webdavConfig.passwdList, path.dirname(filePath))
      const realName = getRequestRealName(passwdInfo, path.basename(filePath), fileInfo)
      await removeFileInfo([filePath, joinUrlPath(folderRealPath, realName)])
      return
    }
    // 缓存未命中时，用明文名（双重确认+扩展名定类型）判断，文本解密优先于下载探测
    // 双重确认：passwdInfo.encType=7z-aes-cbc 确认加密区，明文名非.7z 确认是虚拟名（managed name）
    // 扩展名定类型：用明文名扩展名判断文件类型（.mp4→视频），探测永远只是兜底
    if (!fileInfo && isSevenZipAesCbcEncType(passwdInfo.encType) && !isSevenZipAesCbcFileName(path.basename(filePath))) {
      const plainName = path.basename(filePath)
      ctx.body.data.name = plainName
      ctx.body.data.type = getAListFileTypeByName(plainName)
      return
    }
    // return showName
    const showName = getShowName(passwdInfo, ctx.body.data.name, fileInfo)
    ctx.body.data.name = showName
    if (fileInfo && fileInfo.externalZip && fileInfo.zipInfo) {
      ctx.body.data.type = getAListFileTypeByName(fileInfo.zipInfo.innerName)
    } else if (fileInfo && fileInfo.externalSevenZipAesCbc && fileInfo.sevenZipAesCbcInfo) {
      ctx.body.data.type = getAListFileTypeByName(fileInfo.sevenZipAesCbcInfo.innerName)
    } else if (!ctx.req.isExternalZipCandidate && !ctx.req.isExternalSevenZipAesCbcCandidate) {
      ctx.body.data.type = getAListFileTypeByName(showName)
    }
  }
})

// 拦截 alist 归档预览 API，对加密文件做明文→密文路径转换
encNameRouter.all(/\/api\/fs\/archive\/*/, bodyparserMw, async (ctx, next) => {
  const { path: filePath } = ctx.request.body
  logger.debug('@@encNameRouter /api/fs/archive', JSON.stringify(filePath))
  if (!filePath) {
    await next()
    return
  }
  const { webdavConfig } = ctx.req
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  logger.debug('@@archive passwdInfo matched:', !!passwdInfo, passwdInfo ? `encName=${passwdInfo.encName} encPath=${JSON.stringify(passwdInfo.encPath)}` : '')
  if (passwdInfo && passwdInfo.encName) {
    delete ctx.req.headers['content-length']
    const fileName = path.basename(filePath)
    // getCachedSevenZipAesCbcFileInfoByPath 内部已覆盖 managed package path 兜底查找
    let fileInfo = isSevenZipAesCbcEncType(passwdInfo.encType)
      ? await getCachedSevenZipAesCbcFileInfoByPath(filePath, passwdInfo)
      : await getCachedFileInfoByPath(filePath)
    const folderRealPath = convertRealPath(ctx.req.webdavConfig.passwdList, path.dirname(filePath))
    const realName = getRequestRealName(passwdInfo, fileName, fileInfo)
    ctx.request.body.path = folderRealPath + '/' + realName
    ctx.req.reqBody = JSON.stringify(ctx.request.body)
    logger.debug('@@archive path converted:', folderRealPath + '/' + realName)
  }
  await next()
})

encNameRouter.all('/api/fs/rename', bodyparserMw, async (ctx, next) => {
  const { path: filePath, name } = ctx.request.body
  const { webdavConfig } = ctx.req
  const { passwdInfo, pathInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  const reqBody = { path: filePath, name }
  ctx.req.reqBody = reqBody
  // reset content-length length
  delete ctx.req.headers['content-length']

  let fileInfo =
    passwdInfo && isSevenZipAesCbcEncType(passwdInfo.encType)
      ? await getCachedSevenZipAesCbcFileInfoByPath(filePath, passwdInfo)
      : await getCachedFileInfoByPath(filePath)
  if (fileInfo == null && passwdInfo && passwdInfo.encName) {
    // mabay a file
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, filePath)
    const realFilePath = path.dirname(filePath) + '/' + realName
    fileInfo = await getCachedFileInfoByPath(realFilePath)
  }
  if (passwdInfo && passwdInfo.encFolder && fileInfo && fileInfo.is_dir) {
    const shiftCount = Math.max(1, Number(passwdInfo.encFolderShift) || 1)
    // 用显示路径的完整深度判断明文层（pathInfo[0] 只含 encPath 匹配部分，不含子路径）
    const pathNames = filePath.split('/').filter(n => n)
    if (pathNames.length > shiftCount) {
      reqBody.name = convertRealName(passwdInfo.password, passwdInfo.encType, name)
    }
  }
  if (passwdInfo && passwdInfo.encName && fileInfo && !fileInfo.is_dir && isSevenZipAesCbcEncType(passwdInfo.encType)) {
    const realName = getSevenZipAesCbcCachedPackageName(fileInfo, path.basename(filePath))
    const fpath = path.dirname(filePath) + '/' + realName
    reqBody.path = fpath
    reqBody.name = getSevenZipAesCbcManagedPackageName(passwdInfo.password, name)
  } else if (passwdInfo && passwdInfo.encName && fileInfo && !fileInfo.is_dir && !isSevenZipAesCbcEncType(passwdInfo.encType)) {
    // reset content-length length
    // you can custom Suffix
    const realName = fileInfo.externalZip
      ? fileInfo.name
      : convertRealName(passwdInfo.password, passwdInfo.encType, filePath)
    const fpath = path.dirname(filePath) + '/' + realName
    reqBody.path = fpath
    reqBody.name = getEncryptedFileName(passwdInfo, getExternalZipRenameTarget(fileInfo, name))
  }
  ctx.req.reqBody = reqBody
  logger.debug('@@rename', reqBody)
  const respBody = await httpClient(ctx.req)
  ctx.body = respBody
})
// 替换字符，http://alist.com/p/enc123.txt?sign=12.. 替换 http://alist.com/p/realname.txt?sign=12..
const regexPath = /\/([^\\/]*?)(\?|$)/
const handleDownload = async (ctx, next) => {
  const request = ctx.req
  const { webdavConfig } = ctx.req
  let filePath = ctx.req.url.split('?')[0]
  // 如果是alist的话，那么必然有这个文件的size缓存（进过list就会被缓存起来）
  request.fileSize = 0
  // 这里需要处理掉/p 路径
  if (filePath.indexOf('/d/') === 0) {
    filePath = filePath.replace('/d/', '/')
  }
  // 这个不需要处理
  if (filePath.indexOf('/p/') === 0) {
    filePath = filePath.replace('/p/', '/')
  }
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, decodeURIComponent(filePath))
  if (passwdInfo && passwdInfo.encName) {
    // reset content-length length
    delete ctx.req.headers['content-length']
    // Check whether the file name refers to an encrypted file or a directory
    const fileName = decodeURIComponent(path.basename(filePath))
    // getCachedSevenZipAesCbcFileInfoByPath 内部已覆盖 managed package path 兜底查找
    let fileInfo = isSevenZipAesCbcEncType(passwdInfo.encType)
      ? await getCachedSevenZipAesCbcFileInfoByPath(filePath, passwdInfo)
      : await getCachedFileInfoByPath(filePath)
    if (fileInfo && fileInfo.externalSevenZipAesCbc) {
      request.isExternalSevenZipAesCbc = true
      request.sevenZipAesCbcVirtualName =
        (fileInfo.sevenZipAesCbcInfo && fileInfo.sevenZipAesCbcInfo.innerName) ||
        fileInfo.sevenZipAesCbcVirtualName ||
        fileName
      request.cachedExternalSevenZipAesCbcInfo = fileInfo.sevenZipAesCbcInfo
    }
    const realName = getRequestRealName(passwdInfo, fileName, fileInfo)
    // /d/ 链路 filePath 来自 ctx.req.url（URL编码），需先 decode 再 convertRealPath，最后 encode 回去
    const folderRealPath = encodeURI(convertRealPath(ctx.req.webdavConfig.passwdList, decodeURIComponent(path.dirname(filePath))))
    // Replace the real-name before downloading
    ctx.req.url = ctx.req.url.replace(path.dirname(filePath), folderRealPath).replace(regexPath, `/${realName}$2`)
    ctx.req.urlAddr = ctx.req.urlAddr.replace(path.dirname(filePath), folderRealPath).replace(regexPath, `/${realName}$2`)
    if (fileInfo && fileInfo.sign) {
      ctx.req.url = appendUrlSign(ctx.req.url, fileInfo.sign)
      ctx.req.urlAddr = appendUrlSign(ctx.req.urlAddr, fileInfo.sign)
    }
    logger.debug('@@download-fileName', ctx.req.url, fileName, realName)
    await next()
    return
  }
  await next()
}

encNameRouter.get(/^\/d\/*/, bodyparserMw, handleDownload)
encNameRouter.get(/\/p\/*/, bodyparserMw, handleDownload)

// restRouter.all(/\/enc-api\/*/, router.routes(), restRouter.allowedMethods())
export default encNameRouter
