import { useEffect, useRef } from 'react'
import {
  Mic, Volume2, Play, Square, AudioLines, AudioWaveform, SlidersHorizontal,
} from 'lucide-react'
import { BrandAppIcon } from '../../../../shared/ui/BrandMark'
import { useMicTest, playOutputTestTone } from '../../hooks/useMicTest'

const DSP_OPTIONS = [
  {
    key: 'off',
    label: 'Natural',
    desc: 'Sua voz do jeito que é.',
    Icon: AudioLines,
  },
  {
    key: 'light',
    label: 'Suave',
    desc: 'Reduz ruídos e deixa mais leve.',
    Icon: AudioWaveform,
  },
  {
    key: 'strong',
    label: 'Forte',
    desc: 'Máxima clareza em ambientes difíceis.',
    Icon: SlidersHorizontal,
  },
]

function SelectField({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full h-11 px-3 rounded-xl bg-[#0d0e12] border border-white/[0.08] text-strong text-[13px] focus:outline-none focus:border-accent/60 transition-colors"
    >
      {children}
    </select>
  )
}

function FieldLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={14} strokeWidth={1.75} className="text-accent" />
      <p className="text-[12px] font-semibold text-strong">{children}</p>
    </div>
  )
}

function OutlineBtn({ onClick, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold text-accent border border-accent/40 bg-accent/[0.06] hover:bg-accent/15 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
    >
      {children}
    </button>
  )
}

function MicWaveform({ barsRef, active }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    let raf = 0
    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr)
        canvas.height = Math.floor(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const bars = barsRef.current
      const n = bars.length
      const gap = 3
      const barW = Math.max(2, (w - gap * (n - 1)) / n)
      const mid = h / 2
      for (let i = 0; i < n; i++) {
        const amp = active ? Math.max(0.06, bars[i]) : 0.06 + Math.sin(Date.now() / 500 + i) * 0.02
        const barH = Math.max(3, amp * (h * 0.9))
        const x = i * (barW + gap)
        const y = mid - barH / 2
        const grad = ctx.createLinearGradient(0, y, 0, y + barH)
        grad.addColorStop(0, 'rgba(255,63,108,0.35)')
        grad.addColorStop(0.5, '#ff3f6c')
        grad.addColorStop(1, 'rgba(255,63,108,0.35)')
        ctx.fillStyle = grad
        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barW, barH, Math.min(3, barW / 2))
        } else {
          ctx.rect(x, y, barW, barH)
        }
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [barsRef, active])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-10"
      aria-hidden
    />
  )
}

function dspLabel(key) {
  return DSP_OPTIONS.find((o) => o.key === key)?.label || 'Natural'
}

export default function AudioTab({ draft, setDraft, mics, speakers }) {
  const micTest = useMicTest({
    deviceId: draft.microphoneId || null,
    speakerId: draft.speakerId || null,
    volume: draft.outputVolume ?? 80,
  })
  const volume = Math.max(0, Math.min(100, Number(draft.outputVolume ?? 80)))

  const micReady = !micTest.error && (micTest.heardVoice || !micTest.testing)
  const micStatus = micTest.error
    ? micTest.error
    : micTest.testing
      ? (micTest.heardVoice
        ? 'Microfone funcionando — você deve se ouvir'
        : 'Fale algo — você deve se ouvir pelos fones/alto-falante')
      : 'Inicie o teste para se ouvir e conferir o nível'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
      <div className="space-y-5 min-w-0">
        <div>
          <FieldLabel icon={Mic}>Microfone</FieldLabel>
          <SelectField
            value={draft.microphoneId || ''}
            onChange={(e) => {
              micTest.stop()
              setDraft((d) => ({ ...d, microphoneId: e.target.value || null }))
            }}
          >
            <option value="">Padrão do sistema</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
            ))}
          </SelectField>

          <div className="mt-3 rounded-2xl border border-white/[0.07] bg-[#12141a]/80 p-3.5">
            <div className="flex items-center gap-3">
              <BrandAppIcon size={44} decorative className="shadow-[0_0_20px_rgba(255,63,108,0.25)]" />
              <div className="flex-1 min-w-0">
                <MicWaveform barsRef={micTest.barsRef} active={micTest.testing} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[12.5px] text-strong flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      micTest.error ? 'bg-[#ff6b7a]' : micTest.testing && micTest.heardVoice ? 'bg-emerald-400' : 'bg-white/25'
                    }`}
                  />
                  {micTest.testing && micTest.heardVoice ? 'Microfone funcionando' : 'Microfone'}
                </p>
                <p className="text-[11.5px] text-muted mt-0.5 leading-snug">{micStatus}</p>
              </div>
              <OutlineBtn onClick={micTest.toggle}>
                {micTest.testing ? <Square size={13} /> : <Play size={13} />}
                {micTest.testing ? 'Parar teste' : 'Iniciar teste'}
              </OutlineBtn>
            </div>
          </div>
        </div>

        <div>
          <FieldLabel icon={SlidersHorizontal}>Tratamento da voz</FieldLabel>
          <p className="text-[12px] text-muted mb-3 leading-snug">
            Ajusta como sua voz é processada durante a chamada.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {DSP_OPTIONS.map(({ key, label, desc, Icon }) => {
              const on = draft.dspLevel === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, dspLevel: key }))}
                  className={`relative text-left rounded-2xl border px-3 py-3 transition-all ${
                    on
                      ? 'border-accent bg-accent/[0.08] shadow-[0_0_0_1px_rgba(255,63,108,0.2)]'
                      : 'border-white/[0.08] bg-[#12141a]/60 hover:border-white/[0.14]'
                  }`}
                >
                  <span
                    className={`absolute top-2.5 right-2.5 w-3.5 h-3.5 rounded-full border ${
                      on ? 'border-accent bg-accent' : 'border-white/25'
                    }`}
                  />
                  <Icon size={18} strokeWidth={1.7} className={on ? 'text-accent' : 'text-muted'} />
                  <p className={`text-[13px] font-semibold mt-2 ${on ? 'text-accent' : 'text-strong'}`}>{label}</p>
                  <p className="text-[11px] text-muted mt-1 leading-snug">{desc}</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="space-y-5 min-w-0">
        <div>
          <FieldLabel icon={Volume2}>Saída de áudio</FieldLabel>
          <SelectField
            value={draft.speakerId || ''}
            onChange={(e) => setDraft((d) => ({ ...d, speakerId: e.target.value || null }))}
          >
            <option value="">Padrão do sistema</option>
            {speakers.map((s) => (
              <option key={s.deviceId} value={s.deviceId}>{s.label}</option>
            ))}
          </SelectField>
        </div>

        <div>
          <FieldLabel icon={Volume2}>Volume</FieldLabel>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setDraft((d) => ({ ...d, outputVolume: Number(e.target.value) }))}
              className="vc-volume-slider flex-1"
              style={{ '--vc-vol': `${volume}%` }}
              aria-label="Volume de saída"
            />
            <span className="text-[12.5px] font-semibold text-strong tabular-nums w-10 text-right">{volume}%</span>
          </div>
          <div className="mt-3">
            <OutlineBtn
              onClick={() => playOutputTestTone({
                speakerId: draft.speakerId || '',
                volume,
              })}
            >
              <Play size={13} />
              Reproduzir som
            </OutlineBtn>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#12141a]/80 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AudioLines size={14} className="text-accent" strokeWidth={1.75} />
            <p className="text-[12.5px] font-semibold text-strong">Prévia da chamada</p>
          </div>
          <ul className="space-y-2.5">
            <PreviewRow
              label="Microfone"
              ok={micReady && !micTest.error}
              value={micTest.error ? 'Erro' : 'Pronto'}
            />
            <PreviewRow label="Saída" ok value="Pronto" />
            <PreviewRow
              label="Processamento"
              ok
              value={`Ativo (${dspLabel(draft.dspLevel)})`}
            />
          </ul>
        </div>
      </div>
    </div>
  )
}

function PreviewRow({ label, ok, value }) {
  return (
    <li className="flex items-center justify-between gap-3 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-strong">
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-[#ff6b7a]'}`} />
        {value}
      </span>
    </li>
  )
}
