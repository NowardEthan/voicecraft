import { useEffect, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { AvatarCircle } from '../components/AccountSidebar'
import { AvatarCropModal } from '../components/AvatarCropModal'
import { slugHandle } from '../model/profile'
import { readFileAsDataUrl } from '../../spaces'

export function ProfileEdit({ profile, saving, error, onSave, onAvatar }) {
  const [draft, setDraft] = useState(profile)
  const [cropSrc, setCropSrc] = useState(null)
  const [photoError, setPhotoError] = useState('')

  useEffect(() => { setDraft(profile) }, [profile])

  const set = (key) => (e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    onSave({
      displayName: draft.displayName,
      handle: slugHandle(draft.handle),
      bio: draft.bio,
      about: draft.about,
      location: draft.location,
      statusText: draft.statusText,
    }, { activity: { kind: 'profile', label: 'Atualizou o perfil' } })
  }

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setCropSrc(dataUrl)
    } catch (err) {
      setPhotoError(err.message || 'Não foi possível abrir a foto.')
    }
  }

  const applyCrop = async (cropped) => {
    try {
      await onAvatar(cropped)
      setCropSrc(null)
    } catch (err) {
      setPhotoError(err.message || 'Não foi possível atualizar a foto.')
      throw err
    }
  }

  return (
    <>
      <form onSubmit={submit} className="max-w-[640px] mx-auto px-5 sm:px-8 py-6 space-y-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Editar perfil</h1>
          <p className="text-[13px] text-muted mt-1">Isso aparece para outras pessoas nos Spaces.</p>
        </div>

        <div className="flex items-center gap-4">
          <AvatarCircle src={profile.photoURL} name={draft.displayName} size={72} />
          <div className="min-w-0">
            <label className="h-9 px-3 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-white/[0.07]">
              <ImagePlus size={14} />
              Trocar foto
              <input type="file" accept="image/*" className="sr-only" onChange={pickPhoto} />
            </label>
            <p className="text-[11px] text-muted mt-1.5">
              Depois de escolher, você ajusta posição e zoom.
            </p>
          </div>
        </div>

        <Field label="Nome" value={draft.displayName} onChange={set('displayName')} max={40} />
        <Field label="Usuário" value={draft.handle} onChange={set('handle')} prefix="@" max={20} />
        <Field label="Bio" value={draft.bio} onChange={set('bio')} max={80} placeholder="Uma linha sobre você" />
        <Field label="Status" value={draft.statusText} onChange={set('statusText')} max={40} placeholder="Trabalhando em algo legal" />
        <Field label="Local" value={draft.location} onChange={set('location')} max={60} placeholder="Cidade, país" />
        <label className="block">
          <span className="block text-[12px] font-medium text-ink mb-1.5">Sobre mim</span>
          <textarea
            value={draft.about}
            onChange={set('about')}
            maxLength={600}
            rows={5}
            className="w-full px-3 py-2.5 rounded-xl bg-[#0d0e12] border border-white/[0.08] text-[13.5px] text-strong placeholder:text-muted resize-none focus:outline-none focus:border-accent"
            placeholder="Tecnologia, música, jogos… o que você gosta de criar junto."
          />
        </label>

        {(error || photoError) && <p className="text-[12.5px] text-danger">{error || photoError}</p>}

        <button
          type="submit"
          disabled={saving}
          className="h-11 px-5 rounded-full bg-accent text-on-accent text-[13.5px] font-semibold disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </form>

      <AvatarCropModal
        open={!!cropSrc}
        src={cropSrc}
        onCancel={() => setCropSrc(null)}
        onApply={applyCrop}
      />
    </>
  )
}

function Field({ label, value, onChange, max, prefix, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-ink mb-1.5">{label}</span>
      <span className="flex items-center h-11 px-3 rounded-xl bg-[#0d0e12] border border-white/[0.08] focus-within:border-accent">
        {prefix && <span className="text-muted mr-1">{prefix}</span>}
        <input
          value={value}
          onChange={onChange}
          maxLength={max}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-[13.5px] text-strong outline-none placeholder:text-muted"
        />
      </span>
    </label>
  )
}
