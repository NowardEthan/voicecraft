import { MonitorUp } from 'lucide-react'

function ChoiceRow({ label, options, value, onChange }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-strong mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(({ key, label: optLabel }) => {
          const on = value === key
          return (
            <button
              key={String(key)}
              type="button"
              onClick={() => onChange(key)}
              className={`min-w-[4.5rem] px-3 py-2 rounded-xl text-[12.5px] font-medium transition-all ${
                on
                  ? 'bg-accent/15 text-accent ring-1 ring-accent/35'
                  : 'bg-[#12141a] text-ink border border-white/[0.08] hover:border-white/[0.14]'
              }`}
            >
              {optLabel}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function VideoTab({ draft, setDraft }) {
  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-start gap-2.5">
        <MonitorUp size={16} className="text-accent mt-0.5" strokeWidth={1.75} />
        <div>
          <p className="text-[13px] font-semibold text-strong">Compartilhamento de tela</p>
          <p className="text-[12px] text-muted mt-1 leading-snug">
            Defaults aplicados na próxima vez que você compartilhar a tela.
          </p>
        </div>
      </div>

      <ChoiceRow
        label="Resolução"
        value={draft.screenQuality}
        onChange={(key) => setDraft((d) => ({ ...d, screenQuality: key }))}
        options={[
          { key: '540p', label: 'Leve' },
          { key: '720p', label: 'HD' },
          { key: '1080p', label: 'Full HD' },
          { key: '1440p', label: '2K' },
        ]}
      />

      <ChoiceRow
        label="FPS"
        value={draft.screenFramerate}
        onChange={(key) => setDraft((d) => ({ ...d, screenFramerate: key }))}
        options={[
          { key: 10, label: '10' },
          { key: 15, label: '15' },
          { key: 24, label: '24' },
          { key: 30, label: '30' },
        ]}
      />

      <label className="flex items-start justify-between gap-4 cursor-pointer rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-3.5">
        <div>
          <p className="text-[13px] font-semibold text-strong">Incluir áudio do sistema</p>
          <p className="text-[11.5px] text-muted mt-1 leading-snug">
            Compartilha o som do PC junto com a tela (quando o sistema permitir).
          </p>
        </div>
        <Toggle
          on={!!draft.screenWithAudio}
          onChange={(v) => setDraft((d) => ({ ...d, screenWithAudio: v }))}
        />
      </label>

      <p className="text-[11.5px] text-muted leading-snug">
        Jogando e transmitindo: use <span className="text-strong">Leve ou HD + 15 fps</span>,
        compartilhe a <span className="text-strong">janela do jogo</span> (não a tela inteira)
        e deixe áudio do sistema desligado se só forem conversar no mic.
        GPU do app ajuda a UI — o encode da tela ainda pesa no CPU.
      </p>
    </div>
  )
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`w-10 h-5.5 rounded-full transition-colors relative shrink-0 ${
        on ? 'bg-accent' : 'bg-white/15'
      }`}
      style={{ height: 22, width: 40 }}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          on ? 'translate-x-[20px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
