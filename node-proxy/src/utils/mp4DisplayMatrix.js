import { Transform } from 'stream'

const MP4_ROTATION_SCAN_LIMIT = 4 * 1024 * 1024
const TKHD_MATRIX_LENGTH = 36
const MATRIX_IDENTITY = Buffer.from([
  0x00, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x40, 0x00, 0x00, 0x00,
])

function readAtomSize(buffer, offset) {
  if (offset + 8 > buffer.length) return null
  const size32 = buffer.readUInt32BE(offset)
  if (size32 === 1) {
    if (offset + 16 > buffer.length) return null
    const size64 = buffer.readBigUInt64BE(offset + 8)
    if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return { headerSize: 16, size: Number(size64) }
  }
  if (size32 === 0) return { headerSize: 8, size: buffer.length - offset }
  return { headerSize: 8, size: size32 }
}

function isContainerAtom(type) {
  return ['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'udta', 'meta'].includes(type)
}

function patchTkhdMatrix(buffer, atomStart, atomEnd) {
  const version = buffer[atomStart + 8]
  const matrixOffset = atomStart + (version === 1 ? 60 : 48)
  if (matrixOffset + TKHD_MATRIX_LENGTH > atomEnd || matrixOffset + TKHD_MATRIX_LENGTH > buffer.length) return 0
  if (buffer.subarray(matrixOffset, matrixOffset + TKHD_MATRIX_LENGTH).equals(MATRIX_IDENTITY)) return 0
  MATRIX_IDENTITY.copy(buffer, matrixOffset)
  return 1
}

export function patchMp4DisplayMatrix(buffer, start = 0, end = buffer.length) {
  let patched = 0
  let offset = start
  while (offset + 8 <= end && offset + 8 <= buffer.length) {
    const atom = readAtomSize(buffer, offset)
    if (!atom || atom.size < atom.headerSize) break
    const atomEnd = Math.min(offset + atom.size, end, buffer.length)
    if (atomEnd - offset < atom.headerSize) break
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'tkhd') {
      patched += patchTkhdMatrix(buffer, offset, atomEnd)
    } else if (isContainerAtom(type)) {
      const childStart = type === 'meta' ? offset + atom.headerSize + 4 : offset + atom.headerSize
      patched += patchMp4DisplayMatrix(buffer, childStart, atomEnd)
    }
    offset += atom.size
  }
  return patched
}

export function createMp4DisplayMatrixPatchTransform(plainRange) {
  const rangeStart = Number((plainRange && plainRange.start) || 0)
  if (rangeStart > 0) return null
  const rangeEnd = plainRange && plainRange.hasRange ? Number(plainRange.end) : NaN
  const expectedLength = Number.isFinite(rangeEnd) && rangeEnd >= rangeStart ? rangeEnd - rangeStart + 1 : 0
  let buffered = Buffer.alloc(0)
  let flushed = false

  function flushBuffered(stream) {
    if (flushed) return
    flushed = true
    if (buffered.length > 0) {
      patchMp4DisplayMatrix(buffered)
      stream.push(buffered)
      buffered = Buffer.alloc(0)
    }
  }

  return new Transform({
    transform(chunk, encoding, callback) {
      if (flushed) {
        this.push(chunk)
        callback()
        return
      }
      buffered = Buffer.concat([buffered, chunk])
      if ((expectedLength > 0 && buffered.length >= expectedLength) || buffered.length >= MP4_ROTATION_SCAN_LIMIT) {
        flushBuffered(this)
      }
      callback()
    },
    flush(callback) {
      flushBuffered(this)
      callback()
    },
  })
}
