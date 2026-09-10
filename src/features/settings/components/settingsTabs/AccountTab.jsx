import { LogOut } from 'lucide-react'

export default function AccountTab({ account, onSignOut }) {
  if (!account) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[#12141a]/50 px-5 py-8 text-center">
        <p className="text-[13px] text-muted">Nenhuma conta conectada neste dispositivo.</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-strong truncate">
            {account.displayName || 'Sua conta'}
          </p>
          <p className="text-[12.5px] text-muted truncate mt-0.5">
            {account.email || 'Conta conectada'}
          </p>
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
    </div>
  )
}
