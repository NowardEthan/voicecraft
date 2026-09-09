// Rooms feature — public surface.
// Components live in /components (existing SpaceCreator, etc). This barrel
// exposes the model that other features need to know about.
export {
  PURPOSES,
  PURPOSE_BY_KEY,
  DEFAULT_ROOM_NAMES,
  purposeOf,
  groupByPurpose,
} from './model/roomPurposes'

export {
  getRoomCover,
  setRoomCover,
  clearRoomCover,
  readFileAsDataUrl,
} from './model/roomCover'

// hooks
export { useRoomActions } from './hooks/useRoomActions'
