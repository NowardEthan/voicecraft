export const MAX_TEXT_CHARS = 8000
export const MAX_TEXT_UTF8_BYTES = 24 * 1024

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null

export function utf8ByteLength(value) {
  const input = String(value || '')
  if (textEncoder) return textEncoder.encode(input).byteLength
  return unescape(encodeURIComponent(input)).length
}

export function validateComposerText(value, {
  maxChars = MAX_TEXT_CHARS,
  maxUtf8Bytes = MAX_TEXT_UTF8_BYTES,
} = {}) {
  const text = String(value || '')
  const charCount = text.length
  const byteCount = utf8ByteLength(text)
  return {
    valid: charCount <= maxChars && byteCount <= maxUtf8Bytes,
    charCount,
    byteCount,
    maxChars,
    maxUtf8Bytes,
  }
}

/** Storage rules require strictly less than the configured byte limit. */
export function isAttachmentSizeAllowed(size, limit) {
  const bytes = Number(size)
  const boundary = Number(limit)
  return Number.isFinite(bytes) && bytes >= 0 && Number.isFinite(boundary) && boundary > 0 && bytes < boundary
}

export function roomOperationKey(accountUid, spaceId, roomId) {
  return `${spaceId || 'nospace'}:${roomId || 'room'}`
}
