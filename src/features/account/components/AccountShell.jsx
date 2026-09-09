import { useState } from 'react'
import { resetPassword } from '../../auth'
import { AccountSidebar } from './AccountSidebar'
import { ProfileHome } from '../views/ProfileHome'
import { ProfileEdit } from '../views/ProfileEdit'
import {
  ProfileAppearance,
  ProfileConnections,
  ProfileDevices,
  ProfilePrivacy,
  ProfileSecurity,
} from '../views/AccountPages'

export function AccountShell({
  profile,
  loading,
  saving,
  error,
  spaces,
  settings,
  onSave,
  onAvatar,
  onCover,
  onChangeSettings,
  onOpenSettings,
  onSignOut,
  page,
  onChangePage,
  onDisplayName,
  onPublishProfile,
}) {
  const [securityInfo, setSecurityInfo] = useState('')

  const publish = (next) => {
    if (!next) return
    if (next.displayName && onDisplayName) onDisplayName(next.displayName)
    onPublishProfile?.({
      displayName: next.displayName,
      photoURL: next.photoURL,
      handle: next.handle,
      bio: next.bio,
      statusText: next.statusText,
      cover: next.cover,
      coverFit: next.coverFit,
      bannerHue: next.bannerHue,
      cardThemeId: next.cardThemeId,
    })
  }

  const save = async (patch, extra) => {
    try {
      const next = await onSave(patch, extra)
      if (next) publish(next)
      return next
    } catch (err) {
      console.error('[AccountShell] save failed', err)
      throw err
    }
  }

  const handleAvatar = async (dataUrl) => {
    const next = await onAvatar(dataUrl)
    publish(next)
    return next
  }

  const handleCover = async (cover, fit) => {
    const next = await onCover(cover, fit)
    publish(next)
    return next
  }

  const handleReset = async () => {
    if (!profile.email) return
    setSecurityInfo('')
    try {
      await resetPassword(profile.email)
      setSecurityInfo('Enviamos um e-mail para redefinir a senha.')
    } catch (err) {
      setSecurityInfo(err.message || 'Não foi possível enviar o e-mail.')
    }
  }

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col md:flex-row bg-[#0b0c10] text-strong">
      <AccountSidebar
        profile={profile}
        page={page}
        onChangePage={onChangePage}
        onOpenSettings={onOpenSettings}
        onSignOut={onSignOut}
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-9 h-9 rounded-full border-2 border-white/10 border-t-accent animate-spin" />
          </div>
        ) : page === 'edit' ? (
          <ProfileEdit profile={profile} saving={saving} error={error} onSave={save} onAvatar={handleAvatar} />
        ) : page === 'look' ? (
          <ProfileAppearance profile={profile} saving={saving} onSave={save} onCover={handleCover} />
        ) : page === 'people' ? (
          <ProfileConnections profile={profile} />
        ) : page === 'privacy' ? (
          <ProfilePrivacy profile={profile} onSave={save} />
        ) : page === 'security' ? (
          <ProfileSecurity
            profile={profile}
            onResetPassword={handleReset}
            onSignOut={onSignOut}
            info={securityInfo}
          />
        ) : page === 'devices' ? (
          <ProfileDevices settings={settings} onChange={onChangeSettings} onOpenSettings={onOpenSettings} />
        ) : (
          <ProfileHome
            profile={profile}
            spaces={spaces}
            onEdit={() => onChangePage('edit')}
            onEditCover={() => onChangePage('look')}
          />
        )}
      </div>
    </div>
  )
}
