/**
 * PermissionDeniedState — shown when the browser blocked the mic
 * permission. The user can still see the room but cannot speak.
 * Offers an "Abrir configurações" link as a recovery path.
 */
import { ShieldOff, Settings as SettingsIcon } from 'lucide-react'

export function PermissionDeniedState({ onOpenSettings }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div
        role="alert"
        className="
          max-w-md w-full rounded-[16px] border border-warning/30
          bg-[#1a1411]/85 backdrop-blur
          p-6 flex flex-col items-center text-center gap-3
          shadow-[0_18px_44px_-16px_rgba(0,0,0,0.6)]
        "
      >
        <div
          className="w-12 h-12 rounded-full bg-warning/15 text-warning flex items-center justify-center"
          aria-hidden
        >
          <ShieldOff size={20} strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-strong">
            O acesso ao microfone foi bloqueado
          </p>
          <p className="text-[12.5px] text-muted mt-1.5 leading-snug">
            Você ainda pode ouvir a sala, mas não falar. Para habilitar,
            abra as configurações do navegador e autorize o microfone
            para este site.
          </p>
        </div>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="
              inline-flex items-center gap-2 h-9 px-4 rounded-pill
              bg-white/[0.06] hover:bg-white/[0.10]
              border border-white/[0.10] text-strong text-[12.5px] font-medium
              transition-colors duration-150
            "
          >
            <SettingsIcon size={13} strokeWidth={1.8} />
            Abrir configurações
          </button>
        )}
      </div>
    </div>
  )
}
