import { useState } from 'react'
import { Copy, LogOut, Shield } from 'lucide-react'
import { flashToast } from '../../../../shared/utils/toast'

export default function AccountTab({
  account,
  onSignOut,
  profile = null,
  isPrincipal = false,
  canClaimPrincipal = false,
  onClaimPrincipal = null,
}) {
  const [claiming, setClaiming] = useState(false)

  if (!account) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[#12141a]/50 px-5 py-8 text-center">
        <p className="text-[13px] text-muted">Nenhuma conta conectada neste dispositivo.</p>
      </div>
    )
  }

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(account.uid || '')
      flashToast('ID copiado')
    } catch {
      flashToast('Não deu pra copiar')
    }
  }

  const claim = async () => {
    if (!onClaimPrincipal || claiming) return
    setClaiming(true)
    try {
      await onClaimPrincipal()
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-strong truncate">
            {account.displayName || profile?.displayName || 'Sua conta'}
          </p>
          <p className="text-[12.5px] text-muted truncate mt-0.5">
            {account.email || 'Conta conectada'}
          </p>
          {account.uid && (
            <button
              type="button"
              onClick={copyUid}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-strong"
              title="Copiar UID"
            >
              <Copy size={11} />
              <span className="font-mono truncate max-w-[220px]">{account.uid}</span>
            </button>
          )}
        </div>
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold text-ink bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] inline-flex items-center gap-1.5 shrink-0"
          >
            <LogOut size={14} strokeWidth={1.75} />
            Sair
          </button>
        )}
      </div>

      {(isPrincipal || canClaimPrincipal) && (
        <div className="rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-4 space-y-2">
          <p className="text-[13px] font-semibold text-strong inline-flex items-center gap-2">
            <Shield size={14} className="text-accent" />
            Conta principal
          </p>
          {isPrincipal ? (
            <p className="text-[12.5px] text-muted leading-snug">
              Você pode atribuir tags especiais (Staff, VIP, Amigo…) no perfil de qualquer pessoa.
              Abra o card dela e use “Gerenciar tags”.
            </p>
          ) : (
            <>
              <p className="text-[12.5px] text-muted leading-snug">
                Ative uma vez nesta conta Ethan Noward para liberar a gestão de tags no app.
              </p>
              <button
                type="button"
                disabled={claiming || !onClaimPrincipal}
                onClick={claim}
                className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold bg-accent text-strong hover:opacity-90 disabled:opacity-50"
              >
                {claiming ? 'Ativando…' : 'Ativar conta principal'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
