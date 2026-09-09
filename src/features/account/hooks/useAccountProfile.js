import { useCallback, useEffect, useState } from 'react'
import { loadProfile, persistProfileCover, saveProfile, uploadAvatar } from '../model/profileStore'
import { normalizeProfile } from '../model/profile'

export function useAccountProfile(authUser) {
  const uid = authUser?.uid || null
  const [profile, setProfile] = useState(() => normalizeProfile(uid, {}, authUser))
  const [loading, setLoading] = useState(!!uid)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!uid) {
      setProfile(normalizeProfile('', {}, authUser))
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    loadProfile(uid, authUser)
      .then((next) => { if (!cancelled) setProfile(next) })
      .catch((err) => { if (!cancelled) setError(err.message || 'Falha ao carregar o perfil.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [uid, authUser?.uid, authUser?.displayName, authUser?.photoURL, authUser?.email])

  const save = useCallback(async (patch, extra) => {
    if (!uid) return null
    setSaving(true)
    setError('')
    try {
      const merged = { ...profile, ...patch, uid }
      const next = await saveProfile(uid, merged, extra)
      setProfile(next)
      return next
    } catch (err) {
      setError(err.message || 'Não foi possível salvar.')
      throw err
    } finally {
      setSaving(false)
    }
  }, [uid, profile])

  const setAvatar = useCallback(async (dataUrl) => {
    if (!uid) return
    const photoURL = await uploadAvatar(uid, dataUrl)
    if (photoURL) return save({ photoURL }, { activity: { kind: 'profile', label: 'Atualizou a foto' } })
    return null
  }, [uid, save])

  const setCover = useCallback(async (cover, coverFit) => {
    if (!uid) return null
    const next = await persistProfileCover(uid, cover, coverFit)
    return save(next, cover
      ? { activity: { kind: 'profile', label: 'Atualizou a capa' } }
      : undefined)
  }, [uid, save])

  return { profile, loading, saving, error, save, setAvatar, setCover, setProfile }
}
