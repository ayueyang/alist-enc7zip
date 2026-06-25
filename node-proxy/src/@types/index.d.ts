export {}
declare global {
  interface PasswdInfo {
    encPath: string
    enable: string
    password: string
    encType: string
    encFolder?: boolean
    encFolderShift?: number
    encName?: boolean
    encSuffix?: string
    zipInfoCache?: boolean
    zipInfoCacheDays?: number
    zipAutoCache?: boolean
    sevenZipAesCbcAutoCache?: boolean
    sevenZipAesCbcPreview?: boolean
    sevenZipAesCbcPreviewQuality?: string
    sevenZipAesCbcPreviewDurationSeconds?: number | string
  }
}
