import { pathToRegexp } from 'path-to-regexp'
import FlowEnc from './flowEnc'
import path from 'path'

import MixBase64 from './mixBase64'
import Crcn from './crc6-8'
import { isWinZipAesEncType } from './winZipAesZip'

const crc6 = new Crcn(6)
const origPrefix = 'orig_'

function isBadText(str) {
  return /[脙脗锟铰€陇搂陆]/.test(str)
}

// check file name, return real name
export function convertRealName(password, encType, pathText, encSuffix) {
  const fileName = path.basename(pathText)
  if (isOrigName(fileName)) {
    return getOrigName(fileName)
  }

  const ext = isWinZipAesEncType(encType) ? '' : encSuffix || path.extname(fileName)
  const encName = encodeName(password, encType, decodeURIComponent(fileName))
  console.log('@@decodeURI(fileName)', decodeURIComponent(fileName))
  if (isWinZipAesEncType(encType)) {
    return encName + '.zip'
  }
  return encName + ext
}

// if file name has encrypt, return show name
export function convertShowName(password, encType, pathText) {
  const rawFileName = path.basename(decodeURIComponent(pathText))
  let fileName = rawFileName
  if (isWinZipAesEncType(encType) && fileName.toLowerCase().endsWith('.zip')) {
    fileName = fileName.slice(0, -4)
  }
  const ext = isWinZipAesEncType(encType) ? '' : path.extname(fileName)
  const encName = ext ? fileName.replace(ext, '') : fileName
  let showName = decodeName(password, encType, encName)
  if (showName === null) {
    showName = origPrefix + rawFileName
  }
  return showName
}

export function convertRealPath(passwdList, fpath) {
  let foldPath = fpath
  const { passwdInfo, pathInfo } = pathFindPasswd(passwdList, foldPath)
  if (passwdInfo && passwdInfo.encFolder) {
    const foldNames = pathInfo[0].split('/').filter(n => n)
    // encFolderShift: 前N层文件夹保持明文，默认1（兼容原作者行为）
    const shiftCount = Math.max(1, Number(passwdInfo.encFolderShift) || 1)
    for (let i = 0; i < shiftCount && foldNames.length > 0; i++) {
      foldNames.shift()
    }
    let encFoldPath = ''
    let realFoldPath = ''
    for (let name of foldNames) {
      const realFoldName = convertRealName(passwdInfo.password, passwdInfo.encType, name)
      encFoldPath += '/' + name
      realFoldPath += '/' + realFoldName
    }
    foldPath = foldPath.replace(encFoldPath, realFoldPath)
  }
  return foldPath
}

export function isOrigName(fileName) {
  return path.basename(fileName).indexOf(origPrefix) === 0
}

export function getOrigName(fileName) {
  return path.basename(fileName).replace(origPrefix, '')
}

export function isEncryptedZipName(password, encType, fileName) {
  if (!isWinZipAesEncType(encType)) return false
  if (!String(fileName || '').toLowerCase().endsWith('.zip')) return false
  const showName = convertShowName(password, encType, fileName)
  return !!showName && !isOrigName(showName) && convertRealName(password, encType, showName) === path.basename(fileName)
}

export function isRawZipName(password, encType, fileName) {
  return (
    isWinZipAesEncType(encType) &&
    String(fileName || '').toLowerCase().endsWith('.zip') &&
    !isEncryptedZipName(password, encType, fileName)
  )
}

export function getAListFileTypeByName(fileName = '') {
  const ext = path.extname(String(fileName).split('?')[0]).toLowerCase()
  if (['.mp4', '.mkv', '.avi', '.mov', '.rmvb', '.webm', '.flv', '.m3u8'].includes(ext)) return 2
  if (['.mp3', '.flac', '.ogg', '.m4a', '.wav', '.opus', '.wma'].includes(ext)) return 3
  if (['.txt', '.htm', '.html', '.xml', '.java', '.properties', '.sql', '.js', '.md', '.json', '.conf', '.ini', '.vue', '.php', '.py', '.bat', '.gitignore', '.yml', '.go', '.sh', '.c', '.cpp', '.h', '.hpp', '.tsx', '.vtt', '.srt', '.ass', '.rs', '.lrc'].includes(ext)) return 4
  if (['.jpg', '.tiff', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.ico', '.swf', '.webp'].includes(ext)) return 5
  return 0
}

export function pathExec(encPath, url) {
  for (const filePath of encPath) {
    const result = pathToRegexp(new RegExp(filePath)).exec(url)
    if (result) {
      return result
    }
  }
  return null
}

export function encodeName(password, encType, plainName) {
  const isBad = isBadText(plainName)
  if (isBad) {
    console.log('@isBadText', plainName)
  }
  const passwdOutward = FlowEnc.getPassWdOutward(password, encType)
  const mix64 = new MixBase64(passwdOutward)
  let encodeName = mix64.encode(plainName)
  const crc6Bit = crc6.checksum(Buffer.from(encodeName + passwdOutward))
  const crc6Check = MixBase64.getSourceChar(crc6Bit)
  encodeName += crc6Check
  return encodeName
}

export function decodeName(password, encType, encodeName) {
  const crc6Check = encodeName.substring(encodeName.length - 1)
  const passwdOutward = FlowEnc.getPassWdOutward(password, encType)
  const mix64 = new MixBase64(passwdOutward)
  const subEncName = encodeName.substring(0, encodeName.length - 1)
  const crc6Bit = crc6.checksum(Buffer.from(subEncName + passwdOutward))
  if (MixBase64.getSourceChar(crc6Bit) !== crc6Check) {
    return null
  }
  let decodeStr = null
  try {
    decodeStr = mix64.decode(subEncName).toString('utf8')
  } catch (e) {
    console.log('@@mix64 decode error', subEncName)
  }
  return decodeStr
}

export function encodeFromFolder(password, encType, folderPasswd, folderEncType) {
  const passwdInfo = folderEncType + '_' + folderPasswd
  return encodeName(password, encType, passwdInfo)
}

export const encodeFolderName = encodeFromFolder

export function decodeFromFolder(password, encType, encodeName) {
  const arr = encodeName.split('_')
  if (arr.length < 2) {
    return false
  }
  const folderEncName = arr[arr.length - 1]
  const decodeStr = decodeName(password, encType, folderEncName)
  if (!decodeStr) {
    return decodeStr
  }
  const folderEncType = decodeStr.substring(0, decodeStr.indexOf('_'))
  const folderPasswd = decodeStr.substring(decodeStr.indexOf('_') + 1)
  return { folderEncType, folderPasswd }
}

export const decodeFolderName = decodeFromFolder

export function pathFindPasswd(passwdList, url) {
  for (const passwdInfo of passwdList) {
    for (const filePath of passwdInfo.encPath) {
      const result = passwdInfo.enable ? pathToRegexp(new RegExp(filePath)).exec(url) : null
      if (result) {
        const newPasswdInfo = Object.assign({}, passwdInfo)
        if (!passwdInfo.encFolder) {
          const folders = url.split('/')
          for (const folderName of folders) {
            const data = decodeFromFolder(passwdInfo.password, passwdInfo.encType, decodeURIComponent(folderName))
            if (data) {
              newPasswdInfo.encType = data.folderEncType
              newPasswdInfo.password = data.folderPasswd
              return { passwdInfo: newPasswdInfo, pathInfo: result }
            }
          }
        }
        return { passwdInfo, pathInfo: result }
      }
    }
  }
  return {}
}
