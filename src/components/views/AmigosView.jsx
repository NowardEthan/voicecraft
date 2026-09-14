/**
 * AmigosView — Friends tab.
 * Drives the Friends feature end-to-end: list of friends, pending
 * requests, search-and-add. Uses the live useFriends hook (Firestore).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  Phone,
  PhoneOff,
  Search,
  UserPlus,
  X,
} from 'lucide-react'
import { PersonRichCard } from '../../features/people/components/PersonRichCard'
import { useFriends } from '../../features/people/hooks/useFriends'
import { getSharedSignaling } from '../../shared/connection/useSignaling'
import { flashToast } from '../../shared/utils/toast'
import { pageVariants, sectionVariants, staggerContainer, staggerItem } from './home/homeMotion'

const TABS = [
  { id: 'todos', label: 'Todos' },
  { id: 'online', label: 'Online' },
  { id: 'pendentes', label: 'Pendentes' },
  { id: 'bloqueados', label: 'Bloqueados' },
]

export default function AmigosView({ onOpenFriend }) {
  const { friends, incoming, outgoing, actions } = useFriends()
  const [tab, setTab] = useState('todos')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const onlineFriends = useMemo(() => friends.filter((f) => f.online), [friends])
  const offlineFriends = useMemo(() => friends.filter((f) => !f.online), [friends])

  const counts = {
    online: onlineFriends.length,
    todos: friends.length + incoming.length,
    pendentes: incoming.length,
    bloqueados: 0,
  }

  const matchQ = (f) => {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return (
      (f.name || '').toLowerCase().includes(q) ||
      (f.handle || '').toLowerCase().includes(q)
    )
  }

  const filteredFriends = useMemo(() => friends.filter(matchQ), [friends, query])
  const filteredOnline = useMemo(() => onlineFriends.filter(matchQ), [onlineFriends, query])
  const filteredOffline = useMemo(() => offlineFriends.filter(matchQ), [offlineFriends, query])

  const handleAccept = useCallback(async (id) => actions.accept(id), [actions])
  const handleIgnore = useCallback(async (id) => actions.ignore(id), [actions])
  const handleRemove = useCallback(async (id) => actions.remove(id), [actions])

  return (
    <motion.div
      key="amigos"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas"
    >
      <div className="max-w-[1100px] mx-auto w-full px-4 sm:px-6 lg:px-10 pt-7 sm:pt-9 pb-12">
        {/* Header */}
        <motion.header variants={sectionVariants} className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] sm:text-[32px] font-bold text-strong tracking-tight">Amigos</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              Conecte-se, jogue, fale e crie momentos juntos no VoiceCraft.
            </p>
          </div>
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill text-[13px] font-semibold text-on-color bg-[#3b82f6] hover:opacity-90"
            >
              <UserPlus size={15} strokeWidth={2.2} />
              Adicionar amigo
            </button>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar amigos..."
                className="w-full sm:w-[260px] h-10 pl-9 pr-3 rounded-pill bg-white/[0.04] border border-white/[0.07] text-[13px] text-strong placeholder:text-muted focus:outline-none focus:border-[#3b82f6]/45"
              />
            </div>
          </div>
        </motion.header>

        {/* Tabs */}
        <motion.nav variants={sectionVariants} className="mt-5 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-white/[0.07]">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  'shrink-0 inline-flex items-center gap-1.5 h-10 px-3 text-[13px] font-semibold border-b-2 transition-colors ' +
                  (active
                    ? 'text-[#60a5fa] border-[#3b82f6]'
                    : 'text-muted border-transparent hover:text-strong')
                }
              >
                {t.label}
                <span
                  className={
                    'min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[10.5px] font-bold ' +
                    (active
                      ? 'bg-[#3b82f6]/18 text-[#60a5fa]'
                      : 'bg-white/[0.06] text-muted')
                  }
                >
                  {counts[t.id] ?? 0}
                </span>
              </button>
            )
          })}
        </motion.nav>

        {/* Content */}
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mt-5 space-y-6">
          {incoming.length > 0 && (tab === 'pendentes' || tab === 'todos') && (
            <motion.section variants={sectionVariants}>
              <PendingSection
                list={incoming}
                onAccept={handleAccept}
                onIgnore={handleIgnore}
              />
            </motion.section>
          )}

          {(tab === 'online' || tab === 'todos') && (
            <>
              <motion.section variants={sectionVariants}>
                <SectionHeader
                  title={`Online agora (${filteredOnline.length})`}
                  empty={filteredOnline.length === 0 ? 'Nenhum amigo online agora.' : null}
                >
                  {filteredOnline.map((f) => (
                    <FriendRow
                      key={f.id || f.otherUserId}
                      friend={f}
                      online
                      onOpen={onOpenFriend}
                      onRemove={handleRemove}
                    />
                  ))}
                </SectionHeader>
              </motion.section>

              <motion.section variants={sectionVariants}>
                <SectionHeader
                  title={`Offline (${filteredOffline.length})`}
                  empty={filteredOffline.length === 0 ? 'Sem amigos offline no momento.' : null}
                >
                  {filteredOffline.map((f) => (
                    <FriendRow
                      key={f.id || f.otherUserId}
                      friend={f}
                      online={false}
                      onOpen={onOpenFriend}
                      onRemove={handleRemove}
                    />
                  ))}
                </SectionHeader>
              </motion.section>
            </>
          )}

          {tab === 'todos' && friends.length === 0 && incoming.length === 0 && (
            <EmptyFriendsState onAdd={() => setSearchOpen(true)} />
          )}

          {tab === 'bloqueados' && (
            <motion.section variants={sectionVariants}>
              <div className="rounded-[16px] border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center">
                <p className="text-[13.5px] font-semibold text-strong">Sem bloqueios ainda</p>
                <p className="text-[12px] text-muted mt-1">
                  Você pode bloquear alguém a partir do perfil.
                </p>
              </div>
            </motion.section>
          )}

          {tab === 'pendentes' && incoming.length === 0 && (
            <motion.section variants={sectionVariants}>
              <div className="rounded-[16px] border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center">
                <p className="text-[13.5px] font-semibold text-strong">Sem pedidos pendentes</p>
                <p className="text-[12px] text-muted mt-1">
                  Quando alguém te adicionar como amigo, aparece aqui.
                </p>
              </div>
            </motion.section>
          )}
        </motion.div>

        {/* Sent requests (collapsed) */}
        {outgoing.length > 0 && (
          <motion.section variants={sectionVariants} className="mt-8">
            <h2 className="text-[14.5px] font-semibold text-strong mb-3">
              Pedidos enviados ({outgoing.length})
            </h2>
            <motion.ul variants={staggerContainer} className="space-y-2">
              {outgoing.map((r) => (
                <motion.li key={r.id || r.otherUserId} variants={staggerItem}>
                  <PersonRichCard
                    person={r}
                    variant="row"
                    showHandle
                    showStatus={false}
                    trailing={
                      <button
                        type="button"
                        onClick={() => handleRemove(r.id)}
                        className="h-8 px-3 rounded-pill text-[12px] font-semibold border border-white/[0.08] text-muted hover:text-strong hover:bg-white/[0.05]"
                      >
                        Cancelar
                      </button>
                    }
                  />
                </motion.li>
              ))}
            </motion.ul>
          </motion.section>
        )}
      </div>

      <AnimatePresence>
        {searchOpen && (
          <AddFriendDialog
            onClose={() => setSearchOpen(false)}
            onSend={actions.send}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function SectionHeader({ title, empty, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-0.5">
        <h2 className="text-[14.5px] font-semibold text-strong">{title}</h2>
      </div>
      {empty ? (
        <p className="text-[13px] text-muted py-6 text-center">{empty}</p>
      ) : (
        <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
          {children}
        </motion.ul>
      )}
    </div>
  )
}

function PendingSection({ list, onAccept, onIgnore }) {
  if (!list?.length) return null
  return (
    <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14.5px] font-semibold text-strong">
          Solicitações pendentes ({list.length})
        </h2>
      </div>
      <ul className="space-y-2">
        {list.map((p) => (
          <motion.li key={p.id || p.otherUserId} variants={staggerItem}>
            <PersonRichCard
              person={p}
              variant="row"
              showHandle
              showStatus={false}
              trailing={
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAccept(p.id)}
                    className="h-8 px-3 rounded-pill text-[12px] font-semibold bg-[#3b82f6] text-on-color hover:opacity-90"
                  >
                    Aceitar
                  </button>
                  <button
                    type="button"
                    onClick={() => onIgnore(p.id)}
                    className="h-8 px-3 rounded-pill text-[12px] font-semibold border border-white/[0.08] text-muted hover:text-strong hover:bg-white/[0.05]"
                  >
                    Ignorar
                  </button>
                </div>
              }
            />
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

function FriendRow({ friend, online, onOpen, onRemove }) {
  const person = online
    ? friend
    : {
        ...friend,
        online: false,
        appOnline: false,
        spaceOnline: false,
        presenceKind: 'offline',
        status: null,
        location: null,
      }
  return (
    <motion.li variants={staggerItem} className="mb-2">
      <PersonRichCard
        person={person}
        variant="row"
        onClick={() => onOpen?.(friend)}
        trailing={
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <IconBtn label="Mensagem">
              <MessageCircle size={14} />
            </IconBtn>
            <IconBtn label="Chamar">
              {online && friend.status?.kind === 'call' ? (
                <PhoneOff size={14} />
              ) : (
                <Phone size={14} />
              )}
            </IconBtn>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove?.(friend.id) }}
              className="h-8 px-2.5 rounded-lg text-[11.5px] font-semibold border border-white/[0.08] text-muted hover:text-danger hover:bg-danger/10"
            >
              Remover
            </button>
          </div>
        }
      />
    </motion.li>
  )
}

function EmptyFriendsState({ onAdd }) {
  return (
    <motion.section variants={sectionVariants}>
      <div className="rounded-[20px] border border-dashed border-white/[0.08] bg-white/[0.02] px-6 py-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-white/[0.05] flex items-center justify-center mb-3">
          <UserPlus size={20} className="text-muted" />
        </div>
        <p className="text-[15px] font-semibold text-strong">Sua lista de amigos tá vazia</p>
        <p className="text-[12.5px] text-muted mt-1.5 max-w-sm mx-auto leading-relaxed">
          Busque alguém por nome ou @handle e manda o primeiro convite.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-pill text-[13px] font-semibold text-on-color bg-[#3b82f6] hover:opacity-90"
        >
          <UserPlus size={15} strokeWidth={2.2} />
          Adicionar amigo
        </button>
      </div>
    </motion.section>
  )
}

function AddFriendDialog({ onClose, onSend }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(null)
  const [sentOk, setSentOk] = useState(null)
  const [sendError, setSendError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!term.trim()) {
      setResults([])
      return undefined
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const sig = getSharedSignaling()
        const list = await sig?.searchUsers?.(term)
        if (!cancelled) setResults(list || [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [term])

  const handleSend = async (uid) => {
    if (!uid || sending) return
    setSending(uid)
    setSentOk(null)
    setSendError(null)
    try {
      await onSend?.(uid)
      setSentOk(uid)
      flashToast?.('Pedido de amizade enviado')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[FriendRequest] send failed', err)
      const msg = err?.message || String(err) || 'Falha ao enviar pedido'
      setSendError({ uid, message: msg })
      flashToast?.('Erro ao enviar pedido: ' + msg)
    } finally {
      setSending(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[8vh] px-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -8, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-[520px] rounded-[18px] bg-[#12141a] border border-white/[0.08] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.07]">
          <h2 className="text-[15px] font-semibold text-strong">Adicionar amigo</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-muted hover:text-strong hover:bg-white/[0.06] flex items-center justify-center"
          >
            <X size={15} />
          </button>
        </div>
        <div className="p-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              type="search"
              value={term}
              onChange={(e) => { setTerm(e.target.value); setSendError(null); setSentOk(null) }}
              placeholder="Buscar por nome ou @handle…"
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-strong placeholder:text-muted focus:outline-none focus:border-[#3b82f6]/45"
            />
          </div>
          <div className="mt-4 max-h-[420px] overflow-y-auto">
            {!term.trim() && (
              <p className="text-[12.5px] text-muted text-center py-6">
                Comece digitando pra ver quem tá por aí.
              </p>
            )}
            {term.trim() && searching && (
              <p className="text-[12.5px] text-muted text-center py-6">Buscando…</p>
            )}
            {term.trim() && !searching && results.length === 0 && (
              <p className="text-[12.5px] text-muted text-center py-6">Ninguém encontrado.</p>
            )}
            <ul className="space-y-2">
              {results.map((r) => {
                const errForRow = sendError?.uid === r.uid
                return (
                  <li key={r.uid}>
                    <PersonRichCard
                      person={r}
                      variant="row"
                      showHandle
                      showStatus={false}
                      onClick={() => handleSend(r.uid)}
                      trailing={
                        <div className="flex flex-col items-end gap-1">
                          <button
                            type="button"
                            disabled={sending === r.uid || sentOk === r.uid}
                            onClick={(e) => { e.stopPropagation(); handleSend(r.uid) }}
                            className={
                              'h-8 px-3 rounded-pill text-[12px] font-semibold ' +
                              (sentOk === r.uid
                                ? 'bg-positive/15 text-positive border border-positive/35'
                                : errForRow
                                  ? 'bg-danger/15 text-danger border border-danger/35'
                                  : 'bg-[#3b82f6] text-on-color hover:opacity-90 disabled:opacity-50')
                            }
                          >
                            {sentOk === r.uid ? 'Enviado ✓' : sending === r.uid ? 'Enviando…' : 'Adicionar'}
                          </button>
                          {errForRow && (
                            <span className="text-[10.5px] text-danger max-w-[200px] text-right leading-snug">
                              {sendError.message}
                            </span>
                          )}
                        </div>
                      }
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function IconBtn({ children, label }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="w-8 h-8 rounded-lg border border-white/[0.06] bg-white/[0.03] text-muted hover:text-strong hover:bg-white/[0.06] flex items-center justify-center"
    >
      {children}
    </button>
  )
}
