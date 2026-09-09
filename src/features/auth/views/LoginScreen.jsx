/**
 * First screen — Google + e-mail, before the signaling session starts.
 * Layout follows the VoiceCraft + Lunar login mockup.
 */
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Mic2, Moon,
  MessageCircle, Users, Headphones, AudioLines, Gamepad2,
  Music, Heart, Shield, UserRound,
} from 'lucide-react'
import { EASE_OUT, EASE_SPRING_SOFT } from '../../../shared/motion/presets'
import {
  authErrorMessage,
  createAccountWithEmail,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  usesSystemBrowserGoogle,
} from '../model/authApi'

const FLOATING = [
  { Icon: MessageCircle, className: 'top-[12%] left-[8%]', size: 28, dur: 7.2, delay: 0.1 },
  { Icon: Users, className: 'top-[22%] left-[28%]', size: 26, dur: 8.4, delay: 0.4 },
  { Icon: Headphones, className: 'top-[38%] left-[6%]', size: 30, dur: 6.8, delay: 0.8 },
  { Icon: AudioLines, className: 'top-[18%] left-[48%]', size: 34, dur: 9.1, delay: 0.2 },
  { Icon: Mic2, className: 'bottom-[38%] left-[18%]', size: 36, dur: 7.6, delay: 0.6 },
  { Icon: Gamepad2, className: 'bottom-[28%] left-[40%]', size: 28, dur: 8.8, delay: 1.1 },
  { Icon: Music, className: 'top-[48%] left-[36%]', size: 24, dur: 6.4, delay: 0.3 },
  { Icon: Heart, className: 'bottom-[18%] left-[10%]', size: 22, dur: 7.0, delay: 0.9 },
  { Icon: Moon, className: 'bottom-[22%] left-[52%]', size: 26, dur: 9.6, delay: 0.5 },
]

function GoogleMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18Z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58Z" />
    </svg>
  )
}

function Field({
  id, label, type = 'text', value, onChange, placeholder, icon: Icon,
  autoComplete, trailing,
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-ink mb-1.5">{label}</span>
      <span className="flex items-center gap-2.5 h-11 px-3 rounded-xl bg-[#0d0e12] border border-white/[0.08] focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--space-accent-soft)] transition-colors">
        <Icon size={16} className="text-muted shrink-0" strokeWidth={1.8} />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="flex-1 min-w-0 bg-transparent text-[13.5px] text-strong placeholder:text-muted/70 outline-none"
        />
        {trailing}
      </span>
    </label>
  )
}

export default function LoginScreen() {
  const reduce = useReducedMotion()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const systemGoogle = usesSystemBrowserGoogle()

  const signingUp = mode === 'signup'

  const run = async (key, fn) => {
    setError('')
    setInfo('')
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setError(authErrorMessage(err))
      }
    } finally {
      setBusy(null)
    }
  }

  const submitEmail = (e) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Preencha e-mail e senha.')
      return
    }
    run('email', () => signingUp
      ? createAccountWithEmail({ email, password, keepSignedIn })
      : signInWithEmail({ email, password, keepSignedIn }))
  }

  const submitGoogle = () => {
    run('google', () => signInWithGoogle({ keepSignedIn }))
  }

  const forgot = () => {
    if (!email.trim()) {
      setError('Digite seu e-mail para recuperar a senha.')
      return
    }
    run('reset', async () => {
      await resetPassword(email)
      setInfo('Enviamos um link de recuperação para o seu e-mail.')
    })
  }

  const enter = (delay = 0, y = 16) => reduce
    ? { initial: false, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.55, delay, ease: EASE_OUT },
      }

  return (
    <div className="relative h-screen w-screen overflow-hidden text-strong bg-[#07080c]">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-[12%] -top-[20%] w-[70%] h-[80%] rounded-full bg-[#5a1028]/45 blur-[90px]"
          animate={reduce ? undefined : { scale: [1, 1.08, 1], opacity: [0.4, 0.58, 0.4] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute left-[8%] top-[28%] w-[48%] h-[58%] rounded-full bg-[#3a0c1c]/70 blur-[80px]"
          animate={reduce ? undefined : { scale: [1, 1.06, 0.98, 1], x: [0, 18, -8, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-[10%] -bottom-[20%] w-[50%] h-[60%] rounded-full bg-[#2a0814]/50 blur-[100px]"
          animate={reduce ? undefined : { scale: [1, 1.1, 1], opacity: [0.35, 0.5, 0.35] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {FLOATING.map(({ Icon, className, size, dur, delay }, i) => (
        <motion.div
          key={i}
          className={`pointer-events-none absolute text-accent hidden md:block ${className}`}
          initial={reduce ? false : { opacity: 0 }}
          animate={reduce ? { opacity: 0.18 } : {
            opacity: [0.12, 0.28, 0.12],
            y: [0, -12, 6, 0],
            x: [0, 8, -4, 0],
            rotate: [0, 6, -4, 0],
          }}
          transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon size={size} strokeWidth={1.4} />
        </motion.div>
      ))}

      <div className="relative z-10 h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-6 lg:gap-10 px-5 sm:px-10 lg:px-16 py-6 sm:py-8 lg:py-12">
        <section className="hidden lg:flex flex-col justify-between min-h-0 py-6">
          <motion.p {...enter(0.05)} className="text-[11px] font-semibold tracking-[0.22em] text-accent uppercase">
            VoiceCraft + Lunar
          </motion.p>
          <div className="max-w-[540px]">
            <motion.h1 {...enter(0.12, 22)} className="text-[44px] xl:text-[52px] font-bold leading-[1.05] tracking-tight">
              Sua voz. Seu espaço.{' '}
              <motion.span
                className="text-accent inline-block"
                animate={reduce ? undefined : { opacity: [1, 0.78, 1] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                Sua conta.
              </motion.span>
            </motion.h1>
            <motion.p {...enter(0.22)} className="mt-5 text-[16px] text-ink/85 max-w-[420px] leading-relaxed">
              Entre para continuar suas conversas de qualquer lugar.
            </motion.p>
          </div>
          <motion.ul
            {...enter(0.32)}
            className="flex items-center gap-6 text-[13px] text-ink/90"
          >
            <li className="flex items-center gap-2">
              <UserRound size={16} className="text-accent" strokeWidth={1.8} />
              Perfil único
            </li>
            <li className="w-px h-4 bg-white/15" aria-hidden />
            <li className="flex items-center gap-2">
              <AudioLines size={16} className="text-accent" strokeWidth={1.8} />
              Spaces sincronizados
            </li>
            <li className="w-px h-4 bg-white/15" aria-hidden />
            <li className="flex items-center gap-2">
              <Shield size={16} className="text-accent" strokeWidth={1.8} />
              Conexão segura
            </li>
          </motion.ul>
        </section>

        <section className="flex items-center justify-center min-h-0">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduce ? { duration: 0 } : { ...EASE_SPRING_SOFT, delay: 0.12 }}
            className="w-full max-w-[420px] rounded-[28px] border border-white/[0.08] bg-[#14161c]/80 backdrop-blur-2xl shadow-[0_30px_80px_-24px_rgba(0,0,0,0.75)] px-6 sm:px-8 py-7"
          >
            <div className="lg:hidden mb-5">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">VoiceCraft + Lunar</p>
              <h1 className="text-[26px] font-bold tracking-tight mt-1.5">
                Sua voz. Seu espaço. <span className="text-accent">Sua conta.</span>
              </h1>
            </div>

            <div className="flex items-center justify-center gap-3 mb-4">
              <motion.span
                className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-on-accent shadow-[0_8px_20px_-8px_var(--space-accent-glow-24)]"
                animate={reduce ? undefined : { y: [0, -3, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Mic2 size={18} />
              </motion.span>
              <span className="text-muted text-[15px] font-medium">+</span>
              <motion.span
                className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center ring-1 ring-accent/30"
                animate={reduce ? undefined : { y: [0, 3, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.35 }}
              >
                <Moon size={18} />
              </motion.span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
              >
                <h2 className="text-center text-[22px] font-semibold tracking-tight">
                  {signingUp ? 'Crie sua conta Lunar' : 'Acesse sua conta Lunar'}
                </h2>
                <p className="text-center text-[13px] text-muted mt-1.5 mb-5">
                  Use Google ou e-mail para entrar no VoiceCraft.
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="relative flex p-1 rounded-full bg-[#0d0e12] border border-white/[0.06] mb-5" role="tablist">
              {[
                { id: 'signin', label: 'Entrar' },
                { id: 'signup', label: 'Criar conta' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === tab.id}
                  onClick={() => { setMode(tab.id); setError(''); setInfo('') }}
                  className={[
                    'relative z-10 flex-1 h-9 rounded-full text-[13px] font-semibold transition-colors',
                    mode === tab.id ? 'text-on-accent' : 'text-muted hover:text-strong',
                  ].join(' ')}
                >
                  {mode === tab.id && (
                    <motion.span
                      layoutId={reduce ? undefined : 'login-tab'}
                      className="absolute inset-0 rounded-full bg-accent"
                      transition={EASE_SPRING_SOFT}
                    />
                  )}
                  <span className="relative">{tab.label}</span>
                </button>
              ))}
            </div>

            <form onSubmit={submitEmail} className="space-y-3.5">
              <Field
                id="login-email"
                label="E-mail"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="voce@exemplo.com"
                icon={Mail}
                autoComplete="email"
              />
              <Field
                id="login-password"
                label="Senha"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder={signingUp ? 'Mínimo 6 caracteres' : 'Sua senha'}
                icon={Lock}
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                trailing={(
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-muted hover:text-strong p-0.5"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              />

              <div className="flex items-center justify-between gap-3 pt-0.5">
                <label className="inline-flex items-center gap-2 text-[12.5px] text-ink cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className={[
                    'w-[16px] h-[16px] rounded-[4px] border flex items-center justify-center',
                    keepSignedIn ? 'bg-accent border-accent' : 'border-white/20 bg-transparent',
                  ].join(' ')}>
                    {keepSignedIn && (
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                        <path d="M1.5 5.2 3.8 7.5 8.5 2.5" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  Manter conectado
                </label>
                {!signingUp && (
                  <button
                    type="button"
                    onClick={forgot}
                    disabled={!!busy}
                    className="text-[12.5px] font-medium text-accent hover:opacity-80 disabled:opacity-50"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    key="err"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-[12.5px] text-danger"
                    role="alert"
                  >
                    {error}
                  </motion.p>
                )}
                {info && (
                  <motion.p
                    key="info"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-[12.5px] text-positive"
                    role="status"
                  >
                    {info}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.button
                type="submit"
                disabled={!!busy}
                whileHover={reduce || busy ? undefined : { scale: 1.015, y: -1 }}
                whileTap={reduce || busy ? undefined : { scale: 0.98 }}
                className="w-full h-12 rounded-full bg-accent text-on-accent text-[14.5px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 shadow-[0_10px_28px_-10px_var(--space-accent-glow-24)]"
              >
                {busy === 'email' ? 'Aguarde…' : signingUp ? 'Criar conta' : 'Entrar com e-mail'}
                {busy !== 'email' && <ArrowRight size={16} strokeWidth={2.2} />}
              </motion.button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <span className="flex-1 h-px bg-white/[0.08]" />
              <span className="text-[11.5px] text-muted">ou</span>
              <span className="flex-1 h-px bg-white/[0.08]" />
            </div>

            <motion.button
              type="button"
              onClick={submitGoogle}
              disabled={!!busy}
              whileHover={reduce || busy ? undefined : { scale: 1.015, y: -1 }}
              whileTap={reduce || busy ? undefined : { scale: 0.98 }}
              className="w-full h-11 rounded-full border border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.06] text-[13.5px] font-semibold text-strong inline-flex items-center justify-center gap-2.5 disabled:opacity-60"
            >
              {busy === 'google' ? (systemGoogle ? 'Esperando o navegador…' : 'Conectando…') : (
                <>
                  <GoogleMark />
                  Continuar com Google
                </>
              )}
            </motion.button>
            {systemGoogle && (
              <p className="text-center text-[11.5px] text-muted mt-2">
                Abre o navegador padrão do Windows para você entrar no Google.
              </p>
            )}

            <p className="text-center text-[12.5px] text-muted mt-5">
              {signingUp ? 'Já tem uma conta? ' : 'Ainda não tem uma conta Lunar? '}
              <button
                type="button"
                onClick={() => { setMode(signingUp ? 'signin' : 'signup'); setError(''); setInfo('') }}
                className="text-accent font-semibold hover:opacity-80"
              >
                {signingUp ? 'Entrar' : 'Criar conta'}
              </button>
            </p>
          </motion.div>
        </section>
      </div>

      <motion.p
        {...enter(0.4)}
        className="absolute bottom-4 inset-x-0 text-center text-[11px] text-muted/80 px-4"
      >
        Ao continuar, você concorda com os Termos e a Política de Privacidade.
      </motion.p>
    </div>
  )
}
