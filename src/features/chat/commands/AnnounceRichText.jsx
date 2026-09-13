import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Type, Palette, Minus, Plus,
} from 'lucide-react'
import { htmlToPlainText } from '../announceSchema.js'

const FONTS = [
  { id: 'inherit', label: 'Padrão' },
  { id: 'Georgia, serif', label: 'Georgia' },
  { id: 'Arial, sans-serif', label: 'Arial' },
  { id: '"Trebuchet MS", sans-serif', label: 'Trebuchet' },
  { id: '"Courier New", monospace', label: 'Mono' },
]

const SIZES = [
  { id: '2', label: 'P' },
  { id: '3', label: 'M' },
  { id: '4', label: 'G' },
  { id: '5', label: 'GG' },
]

/**
 * Lightweight Word-like rich text editor (contentEditable + execCommand).
 * Optional editorApiRef: { insertText, insertHtml, focus }
 */
const AnnounceRichText = forwardRef(function AnnounceRichText({
  valueHtml = '',
  onChange,
  placeholder = 'Escreva o anúncio…',
  editorApiRef = null,
  minHeightClass = 'min-h-[120px] max-h-[220px]',
}, ref) {
  const localRef = useRef(null)
  const lastHtml = useRef('')
  const setRefs = (node) => {
    localRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  useEffect(() => {
    const el = localRef.current
    if (!el) return
    if (valueHtml !== lastHtml.current && document.activeElement !== el) {
      el.innerHTML = valueHtml || ''
      lastHtml.current = valueHtml || ''
      const text = htmlToPlainText(valueHtml)
      el.dataset.empty = text ? '0' : '1'
    }
  }, [valueHtml])

  const emit = () => {
    const el = localRef.current
    if (!el) return
    const html = el.innerHTML
    lastHtml.current = html
    const text = htmlToPlainText(html)
    const isEmpty = !text
    el.dataset.empty = isEmpty ? '1' : '0'
    onChange?.({ html: isEmpty ? '' : html, text })
  }

  const run = (cmd, val = null) => {
    localRef.current?.focus()
    try {
      document.execCommand(cmd, false, val)
    } catch { /* ignore */ }
    emit()
  }

  const insertHtml = (html) => {
    const el = localRef.current
    if (!el || !html) return
    el.focus()
    try {
      const ok = document.execCommand('insertHTML', false, html)
      if (!ok) {
        // Fallback for browsers that block insertHTML
        const sel = window.getSelection()
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0)
          range.deleteContents()
          const tmp = document.createElement('div')
          tmp.innerHTML = html
          const frag = document.createDocumentFragment()
          let node
          while ((node = tmp.firstChild)) frag.appendChild(node)
          range.insertNode(frag)
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
        } else {
          el.innerHTML = `${el.innerHTML}${html}`
        }
      }
    } catch {
      el.innerHTML = `${el.innerHTML}${html}`
    }
    emit()
  }

  const insertText = (text) => {
    const el = localRef.current
    if (!el || text == null) return
    el.focus()
    try {
      if (!document.execCommand('insertText', false, text)) {
        insertHtml(String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;'))
        return
      }
    } catch {
      insertHtml(String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;'))
      return
    }
    emit()
  }

  useImperativeHandle(editorApiRef, () => ({
    insertHtml,
    insertText,
    focus: () => localRef.current?.focus(),
  }), [])

  return (
    <div className="rounded-xl border border-line overflow-hidden bg-[#161920]">
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1.5 border-b border-white/10 bg-[#1a1e28]">
        <ToolBtn title="Negrito" onClick={() => run('bold')}><Bold size={13} /></ToolBtn>
        <ToolBtn title="Itálico" onClick={() => run('italic')}><Italic size={13} /></ToolBtn>
        <ToolBtn title="Sublinhado" onClick={() => run('underline')}><Underline size={13} /></ToolBtn>
        <Sep />
        <ToolBtn title="Esquerda" onClick={() => run('justifyLeft')}><AlignLeft size={13} /></ToolBtn>
        <ToolBtn title="Centro" onClick={() => run('justifyCenter')}><AlignCenter size={13} /></ToolBtn>
        <ToolBtn title="Direita" onClick={() => run('justifyRight')}><AlignRight size={13} /></ToolBtn>
        <Sep />
        <label className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-muted hover:bg-white/5" title="Fonte">
          <Type size={12} />
          <select
            className="bg-transparent text-[11px] text-ink outline-none max-w-[88px]"
            defaultValue="inherit"
            onChange={(e) => run('fontName', e.target.value)}
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-muted hover:bg-white/5" title="Tamanho">
          <select
            className="bg-transparent text-[11px] text-ink outline-none"
            defaultValue="3"
            onChange={(e) => run('fontSize', e.target.value)}
          >
            {SIZES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-muted hover:bg-white/5 cursor-pointer" title="Cor do texto">
          <Palette size={12} />
          <input
            type="color"
            defaultValue="#f6f7f9"
            className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer"
            onChange={(e) => run('foreColor', e.target.value)}
          />
        </label>
        <Sep />
        <ToolBtn title="Diminuir indent" onClick={() => run('outdent')}><Minus size={13} /></ToolBtn>
        <ToolBtn title="Aumentar indent" onClick={() => run('indent')}><Plus size={13} /></ToolBtn>
      </div>

      <div
        ref={setRefs}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        className={`announce-rte ${minHeightClass} overflow-y-auto px-3 py-2.5 text-[13px] text-ink outline-none`}
        style={{ lineHeight: 1.55 }}
        data-empty="1"
        onInput={emit}
        onBlur={emit}
      />
    </div>
  )
})

export default AnnounceRichText

function ToolBtn({ children, onClick, title }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-white/5"
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span className="w-px h-4 bg-white/10 mx-0.5" />
}
