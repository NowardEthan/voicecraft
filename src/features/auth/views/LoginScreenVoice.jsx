/**
 * Voice (by Aura Inc.) — first screen, login / sign up.
 *
 * Visual: Voice Brand Kit 2026 — Deep Ink base, soft Voice Blue / Milk Blue
 * ambient glow, calm type, no neon / warm tones. Co-branding Aura Inc.
 * kept understated.
 *
 * Functional: re-uses the same Firebase auth pipeline as LoginScreen.jsx
 * (e-mail + Google, password reset, keep-signed-in, system-browser fallback).
 */
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Mic2, AudioLines, Shield,
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

const VOICE_DEEP_INK = '#071225'
const VOICE_GRAPHITE = '#0E1A2F'
const VOICE_GRAPHITE_ALPHA = 'rgba(14, 26, 47, 0.80)'
const VOICE_BLUE = '#0A66FF'
const VOICE_MILK = '#57BEFF'
const VOICE_MIST = '#F4F8FF'
const VOICE_BORDER = '#162846'

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

function VoiceSymbol({ size = 28, className = '' }) {
  const px = typeof size === 'number' ? `${size}px` : size
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/voice/voice-symbol-white.png`}
      alt=""
      role="presentation"
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      draggable={false}
      className={`shrink-0 object-contain select-none ${className}`}
      style={{ width: px, height: px }}
    />
  )
}

function AuraMark({ size = 22, className = '' }) {
  const px = typeof size === 'number' ? `${size}px` : size
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/aura/aura-symbol-blue-transparent-1024.png`}
      alt="Aura Inc."
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      draggable={false}
      className={`shrink-0 object-contain select-none opacity-90 ${className}`}
      style={{ width: px, height: px }}
    />
  )
}

function Field({
  id, label, type = 'text', value, onChange, placeholder, icon: Icon,
  autoComplete, trailing,
}) {
  return (
    <label htmlFor={id} className="block">
      <span
        className="block text-[12px] font-medium mb-1.5"
        style={{ color: VOICE_MIST }}
      >
        {label}
      </span>
      <span
        className="flex items-center gap-2.5 h-11 px-3 rounded-xl border focus-within:shadow-[0_0_0_3px_rgba(10,102,255,0.25)] transition-colors"
        style={{
          backgroundColor: VOICE_DEEP_INK,
          borderColor: 'rgba(255,255,255,0.10)',
        }}
      >
        <Icon size={16} style={{ color: VOICE_MILK }} className="shrink-0" strokeWidth={1.8} />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="flex-1 min-w-0 bg-transparent text-[13.5px] outline-none"
          style={{ color: VOICE_MIST }}
        />
        {trailing}
      </span>
      <style>{`
        #${id}:focus + * { }
        label:has(#${id}:focus) > span:nth-of-type(2) {
          border-color: ${VOICE_BLUE} !important;
        }
      `}</style>
    </label>
  )
}

export default function LoginScreenVoice() {
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
    run('Google', () => signInWithGoogle({ keepSignedIn }))
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
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: VOICE_DEEP_INK, color: VOICE_MIST }}
    >
      {/* Ambient Voice Blue / Milk Blue glow on Deep Ink */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-[14%] -top-[24%] w-[72%] h-[80%] rounded-full blur-[110px]"
          style={{ backgroundColor: 'rgba(10,102,255,0.32)' }}
          animate={reduce ? undefined : { scale: [1, 1.08, 1], opacity: [0.55, 0.85, 0.55] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute left-[6%] top-[34%] w-[44%] h-[55%] rounded-full blur-[100px]"
          style={{ backgroundColor: 'rgba(87,190,255,0.22)' }}
          animate={reduce ? undefined : { scale: [1, 1.06, 0.98, 1], x: [0, 16, -8, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-[12%] -bottom-[20%] w-[52%] h-[60%] rounded-full blur-[120px]"
          style={{ backgroundColor: 'rgba(10,102,255,0.18)' }}
          animate={reduce ? undefined : { scale: [1, 1.1, 1], opacity: [0.45, 0.7, 0.45] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="relative z-10 h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-6 lg:gap-10 px-5 sm:px-10 lg:px-16 py-6 sm:py-8 lg:py-12">
        {/* Hero */}
        <section className="hidden lg:flex flex-col justify-between min-h-0 py-6">
          <motion.div {...enter(0.05)} className="flex items-center gap-3">
            <VoiceSymbol
              size={30}
              className="drop-shadow-[0_0_18px_rgba(87,190,255,0.35)]"
            />
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-semibold tracking-[0.22em] uppercase"
                style={{ color: VOICE_MILK }}
              >
                Voice
              </span>
              <span className="w-1 h-1 rounded-full bg-white/30" aria-hidden />
              <span
                className="text-[10px] font-medium tracking-[0.22em] uppercase"
                style={{ color: 'rgba(244,248,255,0.55)' }}
              >
                by Aura Inc.
              </span>
            </div>
          </motion.div>

          <div className="max-w-[540px]">
            <motion.h1
              {...enter(0.12, 22)}
              className="text-[44px] xl:text-[52px] font-semibold leading-[1.05] tracking-tight"
              style={{ color: VOICE_MIST }}
            >
              Sua voz.{' '}
              <span style={{ color: VOICE_MILK }}>Seu espaço.</span>
              <br />
              <motion.span
                className="inline-block"
                animate={reduce ? undefined : { opacity: [1, 0.78, 1] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{ color: VOICE_MIST }}
              >
                Sem atrito.
              </motion.span>
            </motion.h1>
            <motion.p
              {...enter(0.22)}
              className="mt-5 text-[15.5px] max-w-[440px] leading-relaxed"
              style={{ color: 'rgba(244,248,255,0.72)' }}
            >
              Comunicação cristalina em tempo real, Spaces colaborativos e controle total do áudio no Windows.
            </motion.p>
          </div>

          <motion.ul
            {...enter(0.32)}
            className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]"
            style={{ color: 'rgba(244,248,255,0.78)' }}
          >
            <li className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(87,190,255,0.12)', color: VOICE_MILK }}
              >
                <Mic2 size={14} strokeWidth={1.8} />
              </span>
              Identidade Voice
            </li>
            <li className="w-px h-4 bg-white/15" aria-hidden />
            <li className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(87,190,255,0.12)', color: VOICE_MILK }}
              >
                <AudioLines size={14} strokeWidth={1.8} />
              </span>
              Spaces em tempo real
            </li>
            <li className="w-px h-4 bg-white/15" aria-hidden />
            <li className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(87,190,255,0.12)', color: VOICE_MILK }}
              >
                <Shield size={14} strokeWidth={1.8} />
              </span>
              Áudio de baixa latência
            </li>
          </motion.ul>
        </section>

        {/* Card */}
        <section className="flex items-center justify-center min-h-0">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduce ? { duration: 0 } : { ...EASE_SPRING_SOFT, delay: 0.12 }}
            className="w-full max-w-[420px] rounded-[24px] border shadow-[0_30px_80px_-24px_rgba(0,0,0,0.75)] backdrop-blur-2xl px-6 sm:px-8 py-7"
            style={{
              backgroundColor: VOICE_GRAPHITE_ALPHA,
              borderColor: VOICE_BORDER,
            }}
          >
            {/* Mobile-only hero */}
            <div className="lg:hidden mb-5">
              <div className="flex items-center gap-2.5 mb-3">
                <VoiceSymbol size={24} />
                <p
                  className="text-[11px] font-semibold tracking-[0.22em] uppercase"
                  style={{ color: VOICE_MILK }}
                >
                  Voice · by Aura Inc.
                </p>
              </div>
              <h1
                className="text-[26px] font-semibold tracking-tight"
                style={{ color: VOICE_MIST }}
              >
                Sua voz. <span style={{ color: VOICE_MILK }}>Seu espaço.</span> Sem atrito.
              </h1>
            </div>

            {/* Card header */}
            <div className="flex items-center gap-3 mb-5">
              <VoiceSymbol
                size={36}
                className="rounded-xl"
              />
              <div className="flex flex-col">
                <span
                  className="text-[15px] font-semibold leading-tight"
                  style={{ color: VOICE_MIST }}
                >
                  Voice
                </span>
                <span
                  className="text-[11px] leading-tight"
                  style={{ color: 'rgba(244,248,255,0.55)' }}
                >
                  por Aura Inc.
                </span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
              >
                <h2
                  className="text-[22px] font-semibold tracking-tight"
                  style={{ color: VOICE_MIST }}
                >
                  {signingUp ? 'Crie sua conta Voice' : 'Acesse sua conta Voice'}
                </h2>
                <p
                  className="text-[13px] mt-1.5 mb-5"
                  style={{ color: 'rgba(244,248,255,0.55)' }}
                >
                  Use Google ou e-mail para entrar no Voice.
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Tabs */}
            <div
              className="relative flex p-1 rounded-xl border mb-5"
              style={{ backgroundColor: VOICE_DEEP_INK, borderColor: VOICE_BORDER }}
              role="tablist"
            >
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
                    'relative z-10 flex-1 h-10 rounded-lg text-[13px] font-semibold transition-colors',
                    mode === tab.id
                      ? 'text-white'
                      : 'hover:text-white',
                  ].join(' ')}
                  style={{ color: mode === tab.id ? '#fff' : 'rgba(244,248,255,0.55)' }}
                >
                  {mode === tab.id && (
                    <motion.span
                      layoutId={reduce ? undefined : 'voice-login-tab'}
                      className="absolute inset-0 rounded-lg"
                      style={{ backgroundColor: VOICE_BLUE }}
                      transition={EASE_SPRING_SOFT}
                    />
                  )}
                  <span className="relative">{tab.label}</span>
                </button>
              ))}
            </div>

            <form onSubmit={submitEmail} className="space-y-3.5">
              <Field
                id="voice-login-email"
                label="E-mail"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="voce@email.com"
                icon={Mail}
                autoComplete="email"
              />
              <Field
                id="voice-login-password"
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
                    className="p-0.5"
                    style={{ color: 'rgba(244,248,255,0.55)' }}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              />

              <div className="flex items-center justify-between gap-3 pt-0.5">
                <label
                  className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer select-none"
                  style={{ color: 'rgba(244,248,255,0.78)' }}
                >
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    className="w-[16px] h-[16px] rounded-[4px] border flex items-center justify-center"
                    style={{
                      backgroundColor: keepSignedIn ? VOICE_BLUE : 'transparent',
                      borderColor: keepSignedIn ? VOICE_BLUE : 'rgba(255,255,255,0.20)',
                    }}
                  >
                    {keepSignedIn && (
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                        <path
                          d="M1.5 5.2 3.8 7.5 8.5 2.5"
                          fill="none"
                          stroke="white"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
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
                    className="text-[12.5px] font-medium hover:opacity-80 disabled:opacity-50"
                    style={{ color: VOICE_MILK }}
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
                    className="text-[12.5px]"
                    style={{ color: '#ff7884' }}
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
                    className="text-[12.5px]"
                    style={{ color: '#7dd3fc' }}
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
                className="w-full h-12 rounded-xl text-[14.5px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                style={{
                  backgroundColor: VOICE_BLUE,
                  color: '#fff',
                  boxShadow: '0 12px 32px -14px rgba(10,102,255,0.55)',
                }}
              >
                {busy === 'email' ? 'Aguarde…' : signingUp ? 'Criar conta no Voice' : 'Entrar no Voice'}
                {busy !== 'email' && <ArrowRight size={16} strokeWidth={2.2} />}
              </motion.button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <span className="flex-1 h-px" style={{ backgroundColor: VOICE_BORDER }} />
              <span
                className="text-[11.5px]"
                style={{ color: 'rgba(244,248,255,0.45)' }}
              >
                ou
              </span>
              <span className="flex-1 h-px" style={{ backgroundColor: VOICE_BORDER }} />
            </div>

            <motion.button
              type="button"
              onClick={submitGoogle}
              disabled={!!busy}
              whileHover={reduce || busy ? undefined : { scale: 1.015, y: -1 }}
              whileTap={reduce || busy ? undefined : { scale: 0.98 }}
              className="w-full h-11 rounded-xl border text-[13.5px] font-semibold inline-flex items-center justify-center gap-2.5 disabled:opacity-60"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderColor: VOICE_BORDER,
                color: VOICE_MIST,
              }}
            >
              {busy === 'Google' ? (systemGoogle ? 'Esperando o navegador…' : 'Conectando…') : (
                <>
                  <GoogleMark />
                  Continuar com Google
                </>
              )}
            </motion.button>
            {systemGoogle && (
              <p
                className="text-center text-[11.5px] mt-2"
                style={{ color: 'rgba(244,248,255,0.45)' }}
              >
                Abre o navegador padrão do Windows para você entrar com sua conta Google.
              </p>
            )}

            <p
              className="text-center text-[12.5px] mt-5"
              style={{ color: 'rgba(244,248,255,0.55)' }}
            >
              {signingUp ? 'Já tem uma conta? ' : 'Ainda não tem uma conta Voice? '}
              <button
                type="button"
                onClick={() => { setMode(signingUp ? 'signin' : 'signup'); setError(''); setInfo('') }}
                className="font-semibold hover:opacity-80"
                style={{ color: VOICE_MILK }}
              >
                {signingUp ? 'Entrar' : 'Criar conta'}
              </button>
            </p>
          </motion.div>
        </section>
      </div>

      {/* Footer */}
      <motion.div
        {...enter(0.4)}
        className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-2 text-[11px] px-4"
        style={{ color: 'rgba(244,248,255,0.40)' }}
      >
        <AuraMark size={14} className="opacity-70" />
        <span>Voice é um produto da Aura Inc. · 2026</span>
      </motion.div>
    </div>
  )
}
