// Rooms feature — public surface.
// Components live in /components (existing SpaceCreator, etc). This barrel
// exposes the model that other features need to know about.
export {
  PURPOSES,
  CREATE_PURPOSES,
  PURPOSE_BY_KEY,
  DEFAULT_ROOM_NAMES,
  purposeOf,
  normalizePurposeKey,
  groupByPurpose,
} from './model/roomPurposes'

export {
  getRoomCover,
  setRoomCover,
  clearRoomCover,
  readFileAsDataUrl,
} from './model/roomCover'

export {
  ROOM_NAME_STYLES,
  ROOM_EMOJI_PRESETS,
  resolveRoomNameStyle,
  normalizeRoomEmoji,
} from './model/roomCosmetics'

// hooks
export { useRoomActions } from './hooks/useRoomActions'
