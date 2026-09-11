/**
 * Upload / delete custom fonts for a Space (Firebase Storage).
 */
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../../../shared/firebase/app'

const MAX_FONT_BYTES = 4 * 1024 * 1024
const ALLOWED = new Set([
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-ttf',
  'application/x-font-otf',
  'application/octet-stream',
])

function extOf(name = '') {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return (m?.[1] || 'ttf').toLowerCase()
}

function formatFromExt(ext) {
  if (ext === 'woff2') return 'woff2'
  if (ext === 'woff') return 'woff'
  if (ext === 'otf') return 'opentype'
  return 'truetype'
}

function contentTypeFor(ext, fileType) {
  if (ext === 'woff2') return 'font/woff2'
  if (ext === 'woff') return 'font/woff'
  if (ext === 'otf') return 'font/otf'
  if (ext === 'ttf') return 'font/ttf'
  return fileType || 'application/octet-stream'
}

export async function uploadSpaceFont(spaceId, file, { family } = {}) {
  if (!spaceId) throw new Error('Space inválido')
  if (!file) throw new Error('Nenhum arquivo selecionado')
  if (file.size > MAX_FONT_BYTES) {
    throw new Error('Fonte grande demais (máx. 4 MB)')
  }
  const ext = extOf(file.name)
  if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
    throw new Error('Use TTF, OTF, WOFF ou WOFF2')
  }
  if (file.type && !ALLOWED.has(file.type) && !file.type.startsWith('font/')) {
    // Some browsers send empty or odd MIME — still allow by extension.
  }

  const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const path = `voicecraft/space-fonts/${spaceId}/${id}.${ext}`
  const fileRef = ref(storage, path)
  const contentType = contentTypeFor(ext, file.type)
  await uploadBytes(fileRef, file, { contentType })
  const url = await getDownloadURL(fileRef)
  const label = String(family || file.name.replace(/\.[^.]+$/, '') || 'Custom')
    .trim()
    .slice(0, 40)

  return {
    id,
    family: label,
    label,
    url,
    path,
    format: formatFromExt(ext),
    createdAt: Date.now(),
  }
}

export async function deleteSpaceFontFile(spaceId, font) {
  if (!font) return
  try {
    if (typeof font.path === 'string' && font.path.startsWith('voicecraft/')) {
      await deleteObject(ref(storage, font.path))
      return
    }
    const decoded = decodeURIComponent(String(font.url || ''))
    const idx = decoded.indexOf('/o/')
    if (idx < 0) return
    const rest = decoded.slice(idx + 3).split('?')[0]
    if (!rest.startsWith('voicecraft/space-fonts/')) return
    await deleteObject(ref(storage, rest))
  } catch {
    // already gone
  }
}
