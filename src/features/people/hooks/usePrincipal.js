import { useCallback, useEffect, useState } from 'react'
import {
  claimPrincipalAccount,
  getCachedPrincipalUid,
  isPrincipalUid,
  loadPrincipalUid,
  subscribePrincipalUid,
} from '../model/userTagsStore'
import { looksLikePrincipalProfile } from '../model/userTags'
import { flashToast } from '../../../shared/utils/toast'

export function usePrincipal(currentUserId, profile) {
  const [principalUid, setPrincipalUid] = useState(() => getCachedPrincipalUid())
  const [ready, setReady] = useState(!!getCachedPrincipalUid())

  useEffect(() => {
    let alive = true
    loadPrincipalUid().then((uid) => {
      if (!alive) return
      setPrincipalUid(uid)
      setReady(true)
    }).catch(() => {
      if (alive) setReady(true)
    })
    const off = subscribePrincipalUid((uid) => {
      if (alive) setPrincipalUid(uid)
    })
    return () => {
      alive = false
      off?.()
    }
  }, [])

  const isPrincipal = isPrincipalUid(currentUserId) || (!!currentUserId && currentUserId === principalUid)
  const canClaim = ready
    && !principalUid
    && !!currentUserId
    && looksLikePrincipalProfile(profile)

  const claim = useCallback(async () => {
    try {
      const uid = await claimPrincipalAccount(profile)
      setPrincipalUid(uid)
      return uid
    } catch (err) {
      flashToast(err?.message || 'Não deu pra ativar')
      throw err
    }
  }, [profile])

  return { principalUid, isPrincipal, canClaim, claim, ready }
}
