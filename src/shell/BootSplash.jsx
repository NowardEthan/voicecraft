/**
 * BootSplash — branded gate with motion copy + progress while the realm warms.
 */
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrandAppIcon } from '../shared/ui/BrandMark'
import { BOOT_PHASE_COPY } from '../shared/media/bootBootstrap'

const PHASE_ORDER = [
  'portal',
  'link',
  'realms',
  'constellations',
  'companions',
  'tapestries',
  'chambers',
  'sigils',
  'doors',
  'ready',
]

function phaseProgress(phase) {
  const i = PHASE_ORDER.indexOf(phase)
  if (i < 0) return 0.08
  return Math.min(0.98, (i + 1) / PHASE_ORDER.length)
}

export default function BootSplash({ phase = 'portal' }) {
  const label = BOOT_PHASE_COPY[phase] || BOOT_PHASE_COPY.portal
  const progress = phaseProgress(phase)
  const [orbit, setOrbit] = useState(0)

  // Soft ambient cycle so the splash feels alive even between phase jumps.
  useEffect(() => {
    const t = setInterval(() => setOrbit((n) => n + 1), 2200)
    return () => clearInterval(t)
  }, [])

  const whisper = useMemo(() => {
    const asides = [
      'A lua escuta…',
      'O silêncio aquieta…',
      'As salas respiram…',
      'Um eco se ajeita…',
    ]
    return asides[orbit % asides.length]
  }, [orbit])

  return (
    <motion.div
      className="absolute inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden bg-[#07080c]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      aria-busy
      aria-live="polite"
    >
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 75% 55% at 50% 38%, rgba(59,130,246,0.22) 0%, transparent 58%), radial-gradient(ellipse 55% 45% at 50% 85%, rgba(139,92,246,0.14) 0%, transparent 62%)',
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute w-[420px] h-[420px] rounded-full border border-white/[0.04]"
        style={{ top: '18%', left: '50%', marginLeft: -210 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 48, ease: 'linear', repeat: Infinity }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute w-[280px] h-[280px] rounded-full border border-[#60a5fa]/10"
        style={{ top: '26%', left: '50%', marginLeft: -140 }}
        animate={{ rotate: -360 }}
        transition={{ duration: 32, ease: 'linear', repeat: Infinity }}
      />

      <motion.div
        className="relative flex flex-col items-center gap-5 px-6 max-w-md w-full"
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative">
          <motion.div
            aria-hidden
            className="absolute -inset-6 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(96,165,250,0.28) 0%, transparent 70%)',
            }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.9, 0.55] }}
            transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
          />
          <BrandAppIcon
            size={84}
            decorative
            className="vc-brand-loader__icon relative shadow-[0_22px_56px_-16px_rgba(59,130,246,0.6)]"
          />
        </div>

        <div className="text-center">
          <p className="text-[16px] font-semibold text-strong tracking-tight">VoiceCraft</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={phase}
              className="mt-2.5 text-[13.5px] text-[#c7d2fe] leading-snug min-h-[2.5rem] flex items-center justify-center"
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              {label}
            </motion.p>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.p
              key={whisper}
              className="mt-1 text-[11.5px] text-muted/80 italic"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              {whisper}
            </motion.p>
          </AnimatePresence>
          <p className="mt-3 text-[10.5px] text-muted/60 tracking-wide">
            Preparando tudo pra fluir sem travar…
          </p>
        </div>

        {/* Progress */}
        <div className="w-full max-w-[220px] mt-1">
          <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full origin-left"
              style={{
                background: 'linear-gradient(90deg, #3b82f6, #a78bfa, #60a5fa)',
              }}
              initial={{ scaleX: 0.06 }}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
            <span className="vc-boot-dot" />
            <span className="vc-boot-dot" style={{ animationDelay: '0.15s' }} />
            <span className="vc-boot-dot" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
