import { Upload } from 'lucide-react'
import { fontCatalog } from '../model/spaceTypography'

export function FontFieldSelect({
  label,
  value,
  onChange,
  customFonts = [],
  previewText = '',
}) {
  const catalog = fontCatalog(customFonts)
  const current = catalog.find((f) => f.id === value) || catalog[0]

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10.5px] font-medium text-muted">{label}</span>
        {previewText ? (
          <span
            className="text-[11px] text-strong/80 truncate max-w-[55%]"
            style={{ fontFamily: current?.family }}
            title={previewText}
          >
            {previewText}
          </span>
        ) : null}
      </div>
      <select
        value={value || 'default'}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full h-9 px-2.5 rounded-lg text-[12.5px] bg-[#0d0e12] border border-white/[0.08] text-strong focus:outline-none focus:border-accent/50"
        style={{ fontFamily: current?.family }}
      >
        {catalog.map((f) => (
          <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
            {f.label}{f.builtin ? '' : ' · custom'}
          </option>
        ))}
      </select>
    </div>
  )
}

export function FontUploadRow({ onUpload, busy = false }) {
  return (
    <label className="mt-3 flex items-center gap-2 h-9 px-3 rounded-xl border border-dashed border-white/20 text-[12px] text-muted hover:text-strong hover:border-white/35 cursor-pointer transition-colors">
      <Upload size={13} />
      <span>{busy ? 'Enviando fonte…' : 'Enviar fonte (TTF, OTF, WOFF, WOFF2)'}</span>
      <input
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onUpload?.(file)
        }}
      />
    </label>
  )
}
