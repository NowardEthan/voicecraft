/**
 * RoomEditorModal — create or edit a sala: type picker + name.
 */
import { useEffect, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { ModalShell } from '../../../shared/motion/ModalShell'
import { RoomTypeSelector } from '../../../components/space-creator/RoomTypeSelector'
import { RoomNameField } from '../../../components/space-creator/RoomNameField'
import { RoomTypeContext } from '../../../components/space-creator/RoomTypeContext'
import { DEFAULT_ROOM_NAMES, PURPOSE_BY_KEY, PURPOSES, purposeOf } from '../model/roomPurposes'

export default function RoomEditorModal({
  open,
  mode = 'create',
  room = null,
  submitting = false,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const isEdit = mode === 'edit' && room
  const [purposeKey, setPurposeKey] = useState('conversation')
  const [name, setName] = useState('')
  const [manuallyRenamed, setManuallyRenamed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    if (isEdit) {
      const purpose = purposeOf(room)
      setPurposeKey(purpose.key)
      setName(room.name || '')
      setManuallyRenamed(true)
    } else {
      setPurposeKey('conversation')
      setName(DEFAULT_ROOM_NAMES.conversation)
      setManuallyRenamed(false)
    }
    setConfirmDelete(false)
    setError(null)
  }, [open, isEdit, room])

  const selected = PURPOSE_BY_KEY[purposeKey] || PURPOSE_BY_KEY.conversation
  const originalPurpose = isEdit ? purposeOf(room).key : null
  const typeFlip = isEdit && (originalPurpose === 'voice') !== (purposeKey === 'voice')

  const handleSelectType = (next) => {
    setPurposeKey(next)
    if (!manuallyRenamed) {
      setName(DEFAULT_ROOM_NAMES[next] || '')
    }
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Dê um nome pra sala.')
      return
    }
    setError(null)
    try {
      if (isEdit) {
        await onUpdate?.(room, { name: trimmed, purpose: purposeKey })
      } else {
        await onCreate?.(purposeKey, trimmed)
      }
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Não deu pra salvar a sala.')
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    try {
      await onDelete?.(room)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Não deu pra excluir a sala.')
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy="room-editor-title"
      maxWidth="lg"
      panelClassName="rounded-[20px] overflow-hidden"
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col min-w-0 rounded-[20px] overflow-hidden bg-[#14161b] border border-white/[0.08]"
      >
        <header className="shrink-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 id="room-editor-title" className="text-[17px] font-semibold text-strong tracking-tight">
              {isEdit ? 'Editar sala' : 'Criar sala'}
            </h2>
            <p className="text-[12.5px] text-muted mt-0.5">
              {isEdit
                ? 'Altere o nome ou o tipo desta sala.'
                : 'Escolha o tipo e dê um nome.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>

        <div className="px-5 pb-4 space-y-4">
          <RoomTypeSelector
            types={PURPOSES}
            value={purposeKey}
            onChange={handleSelectType}
            compact
          />
          <RoomNameField
            value={name}
            placeholder={DEFAULT_ROOM_NAMES[purposeKey] || 'geral'}
            onChange={(value) => {
              setName(value)
              setManuallyRenamed(true)
            }}
          />
          {isEdit ? (
            <p className="text-[12px] text-muted leading-snug">
              {selected.contextDescription}
              {typeFlip
                ? purposeKey === 'voice'
                  ? ' Trocar para voz transforma esta sala numa chamada ao vivo.'
                  : ' Trocar para texto tira o áudio ao vivo desta sala.'
                : ''}
            </p>
          ) : (
            <RoomTypeContext type={selected} />
          )}
          {error && (
            <p className="text-[12px] text-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.06]">
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className={
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[12.5px] font-semibold transition-colors ' +
                (confirmDelete
                  ? 'bg-danger text-white'
                  : 'text-danger hover:bg-danger/15')
              }
            >
              <Trash2 size={13} strokeWidth={2} />
              {confirmDelete ? 'Excluir de vez?' : 'Excluir sala'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-[10px] text-[12.5px] font-medium text-ink hover:text-strong hover:bg-white/[0.06] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="h-9 px-4 rounded-[10px] text-[12.5px] font-semibold bg-accent text-strong hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar sala'}
            </button>
          </div>
        </footer>
      </form>
    </ModalShell>
  )
}
