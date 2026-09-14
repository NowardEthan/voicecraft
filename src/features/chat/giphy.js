/**
 * Giphy GIF + sticker helpers.
 * Set VITE_GIPHY_API_KEY in .env — https://developers.giphy.com/dashboard/
 */
const GIPHY_BASE = 'https://api.giphy.com/v1'

export function getGiphyApiKey() {
  return String(import.meta.env.VITE_GIPHY_API_KEY || '').trim()
}

export function hasGiphyKey() {
  return getGiphyApiKey().length > 0
}

function mapResult(item, variant = 'gif') {
  if (!item) return null
  const images = item.images || {}
  const isSticker = variant === 'sticker'

  const preview = isSticker
    ? (
      images.fixed_width_small?.url
      || images.fixed_width_small_still?.url
      || images.preview_gif?.url
      || images.fixed_width?.url
    )
    : (
      images.fixed_width_small?.url
      || images.preview_gif?.url
      || images.fixed_width?.url
      || images.downsized_small?.url
    )

  // Stickers: prefer animated webp / gif with transparency; avoid opaque stills.
  const url = isSticker
    ? (
      images.original?.webp
      || images.fixed_height?.webp
      || images.original?.url
      || images.downsized_medium?.url
      || images.fixed_height?.url
    )
    : (
      images.original?.url
      || images.downsized_medium?.url
      || images.downsized?.url
      || images.fixed_height?.url
    )

  if (!url) return null
  return {
    id: String(item.id),
    title: item.title || item.slug || (isSticker ? 'sticker' : 'GIF'),
    preview: preview || url,
    url,
    variant,
  }
}

async function giphyGet(path, params = {}) {
  const key = getGiphyApiKey()
  if (!key) throw new Error('Giphy API key ausente')
  const q = new URLSearchParams({
    api_key: key,
    rating: 'pg-13',
    lang: 'pt',
    limit: '24',
    ...params,
  })
  const res = await fetch(`${GIPHY_BASE}${path}?${q}`)
  if (!res.ok) throw new Error(`Giphy ${res.status}`)
  return res.json()
}

export async function fetchFeaturedGifs() {
  const data = await giphyGet('/gifs/trending')
  return (data.data || []).map((item) => mapResult(item, 'gif')).filter(Boolean)
}

export async function searchGifs(query) {
  const q = String(query || '').trim()
  if (!q) return fetchFeaturedGifs()
  const data = await giphyGet('/gifs/search', { q })
  return (data.data || []).map((item) => mapResult(item, 'gif')).filter(Boolean)
}

export async function fetchFeaturedStickers() {
  const data = await giphyGet('/stickers/trending')
  return (data.data || []).map((item) => mapResult(item, 'sticker')).filter(Boolean)
}

export async function searchStickers(query) {
  const q = String(query || '').trim()
  if (!q) return fetchFeaturedStickers()
  const data = await giphyGet('/stickers/search', { q })
  return (data.data || []).map((item) => mapResult(item, 'sticker')).filter(Boolean)
}
