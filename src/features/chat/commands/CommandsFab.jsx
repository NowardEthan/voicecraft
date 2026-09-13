import { Terminal } from 'lucide-react'

export default function CommandsFab({ open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Fechar comandos' : 'Abrir comandos'}
      title="Comandos do chat"
      className={[
        'absolute z-20 bottom-3 right-3',
        'w-11 h-11 rounded-full flex items-center justify-center',
        'border border-line shadow-lg transition-all duration-200',
        open
          ? 'bg-surface2 text-strong scale-95'
          : 'bg-surface1 text-ink hover:text-strong hover:bg-surface2 hover:scale-105',
      ].join(' ')}
    >
      <Terminal size={18} strokeWidth={1.9} />
    </button>
  )
}
