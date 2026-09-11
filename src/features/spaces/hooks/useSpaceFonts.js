import { useEffect } from 'react'
import { ensureSpaceFontFaces, normalizeSpaceFonts } from '../model/spaceTypography'

/** Keep custom @font-face rules loaded for the active Space. */
export function useSpaceFonts(space) {
  const fonts = space?.fonts
  useEffect(() => {
    ensureSpaceFontFaces(normalizeSpaceFonts(fonts))
  }, [fonts])
}
