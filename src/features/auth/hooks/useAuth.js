import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../../../shared/firebase/app'
import { isSignedIn } from '../model/authApi'

/**
 * Session gate. Anonymous leftovers from the old flow are signed out
 * so the login screen is the first thing a visitor sees.
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const off = onAuthStateChanged(auth, async (next) => {
      if (next && !isSignedIn(next)) {
        try { await signOut(auth) } catch { /* fall through to logged-out */ }
        setUser(null)
        setReady(true)
        return
      }
      setUser(next)
      setReady(true)
    })
    return off
  }, [])

  return {
    ready,
    user,
    signedIn: isSignedIn(user),
  }
}
