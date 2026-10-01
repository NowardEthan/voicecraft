/** Stable identity resolution shared by chat actions and persistence. */
export function resolveMessageIdentity(message, fallbackId = null) {
  const id = message?.id || null
  const firestoreId = message?.firestoreId || null
  const fallback = fallbackId || null
  return {
    actionId: id || firestoreId || fallback,
    outboxId: id || fallback,
    persistenceId: firestoreId || id || fallback,
    aliases: [...new Set([id, firestoreId, fallback].filter(Boolean))],
  }
}

export function actionIdOf(message, fallbackId = null) {
  return resolveMessageIdentity(message, fallbackId).actionId
}
