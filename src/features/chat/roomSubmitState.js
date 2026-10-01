export const ROOM_SUBMIT_RECOVERY_ERROR = 'Nao foi possivel enviar. O conteudo foi restaurado nesta sala.'

export function beginRoomSubmit(pendingOperations, recoveryByRoom, roomKey, operationId, snapshot) {
  pendingOperations.set(roomKey, operationId)
  recoveryByRoom.set(roomKey, { ...snapshot, operationId })
  return operationId
}

export function settleRoomSubmit(pendingOperations, recoveryByRoom, roomKey, operationId, succeeded) {
  const ownsPending = pendingOperations.get(roomKey) === operationId
  if (ownsPending) pendingOperations.delete(roomKey)

  const snapshot = recoveryByRoom.get(roomKey)
  const ownsRecovery = snapshot?.operationId === operationId
  if (succeeded) {
    if (ownsRecovery) recoveryByRoom.delete(roomKey)
    return { ownsPending, recovery: null }
  }
  if (!ownsRecovery) return { ownsPending, recovery: null }

  const recovery = { ...snapshot, error: ROOM_SUBMIT_RECOVERY_ERROR }
  recoveryByRoom.set(roomKey, recovery)
  return { ownsPending, recovery }
}

export function takeRoomRecovery(pendingOperations, recoveryByRoom, roomKey) {
  if (pendingOperations.has(roomKey)) return null
  const recovery = recoveryByRoom.get(roomKey) || null
  if (recovery) recoveryByRoom.delete(roomKey)
  return recovery
}
