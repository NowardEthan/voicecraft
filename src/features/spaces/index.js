// Spaces feature — public surface.
// Components live in /components (existing) and import from this barrel
// instead of reaching into utils/. New consumers should `import from
// '@/features/spaces'` (or relative equivalent) rather than touching
// model/ directly.
export {
  // model
  spaceTokens,
  colorFromId,
  initialsOf,
  greetingFor,
  hexToRgba,
  parseHex,
  relativeLuminance,
  onColorHex,
  identitySurfaceStyle,
  uiAccentHex,
  bannerGradient,
  bannerOverlay,
} from './model/spaceTokens'

export {
  getSpaceCover,
  setSpaceCover,
  clearSpaceCover,
  resolveSpaceCover,
  resolveSpaceCoverFit,
  normalizeCoverFit,
  DEFAULT_COVER_FIT,
  COVER_ZOOM_MIN,
  COVER_ZOOM_MAX,
  isDefaultCoverFit,
  coverImageStyle,
  readFileAsDataUrl,
  purgeHugeLocalCovers,
} from './model/spaceCover'

export {
  getVisibility,
  setVisibility,
  getNotify,
  setNotify,
  isSpaceVisible,
  isSpaceNotifyOn,
  markSpaceLeft,
  markSpaceJoined,
  hasLeftSpace,
  isSpaceInRail,
  syncMembershipFromServer,
} from './model/spacePreferences'

export {
  parseSpaceInvite,
  normalizeVisibility,
  getInviteOrigin,
  buildSpaceInviteUrl,
  formatInviteCode,
  buildInviteShareText,
} from './model/spaceInvite'

export {
  SpaceIcon,
  normalizeSpaceIcon,
  serializeSpaceIcon,
  isSpaceIconImage,
  ICON_STYLE_CONFIG,
  ICON_STYLES,
  FALLBACK_SPACE_ICON,
  registerSpaceIcons,
  ensureFullSpaceIcons,
  spaceIconsReady,
  searchSpaceIcons,
  categoryCounts,
  CATEGORY_ORDER,
  categoryLabel,
  getRecentIcons,
  pushRecentIcon,
  useDebouncedValue,
} from './model/spaceIcons'

// hooks
export { useCurrentSpace } from './hooks/useCurrentSpace'
export { useSpacesList } from './hooks/useSpacesList'
export { useSpaceFonts } from './hooks/useSpaceFonts'
export { default as SpaceEventsView } from './views/SpaceEventsView'
export {
  SPACE_PERMISSIONS,
  SPACE_PERMISSION_KEYS,
  canSpacePermission,
  fullPerms,
  emptyPerms,
} from './model/spaceRoles'
export {
  fieldFontStyle,
  normalizeTypography,
  normalizeSpaceFonts,
} from './model/spaceTypography'
