/**
 * BootSplash — Voice (by Aura Inc.) gate. Quick reveal, calm motion.
 * Stays minimal: only shows brand + status + thin progress. No long copy.
 */
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrandAppIcon } from '../shared/ui/BrandMark'
import { BOOT_PHASE_COPY } from '../shared/media/bootBootstrap'

const PHASE_ORDER = ['link', 'ready']

function phaseProgress(phase) {
  const i = PHASE_ORDER.indexOf(phase)
  if (i < 0) return 0.12
  return Math.min(0.95, 0.18 + (i + 1) / (PHASE_ORDER.length + 1))
}

const STATUS_COPY = {
  warm: 'Aquecendo o essencial…',
  link: 'Conectando…',
  ready: 'Pronto.',
}

export default function BootSplash({ phase = 'warm' }) {
  const label = STATUS_COPY[phase] || STATUS_COPY.warm
  const progress = phaseProgress(phase)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1800)
    return () => clearInterval(t)
  }, [])

  const whisper = useMemo(() => {
    const asides = [
      'Calibrando o silêncio…',
      'Arrumando as salas…',
      'Ajustando o volume do mundo…',
      'Luzes baixas, voz alta…',
    ]
    return asides[tick % asides.length]
  }, [tick])

  return (
    <motion.div
      className="absolute inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#071225' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      aria-busy
      aria-live="polite"
    >
      {/* Atmosphere — Voice Blue / Milk Blue on Deep Ink */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(10,102,255,0.20) 0%, transparent 58%), radial-gradient(ellipse 55% 45% at 50% 85%, rgba(87,190,255,0.10) 0%, transparent 62%)',
        }}
      />

      <motion.div
        className="relative flex flex-col items-center gap-5 px-6 max-w-md w-full"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative">
          <motion.div
            aria-hidden
            className="absolute -inset-6 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(87,190,255,0.22) 0%, transparent 70%)',
            }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.55, 0.8, 0.55] }}
            transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
          />
          <BrandAppIcon
            size={84}
            decorative
            className="vc-brand-loader__icon relative shadow-[0_22px_56px_-16px_rgba(10,102,255,0.55)]"
          />
        </div>

        <div className="text-center">
          <p
            className="text-[15.5px] font-semibold tracking-tight"
            style={{ color: '#f4f8ff' }}
          >
            Voice
          </p>
          <p
            className="mt-1 text-[10.5px] tracking-[0.22em] uppercase"
            style={{ color: 'rgba(87,190,255,0.85)' }}
          >
            by Aura Inc.
          </p>
          <AnimatePresence mode="wait">
            <motion.p
              key={phase}
              className="mt-3 text-[13px] leading-snug"
              style={{ color: 'rgba(244,248,255,0.78)' }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {label}
            </motion.p>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.p
              key={whisper}
              className="mt-1 text-[11px] italic"
              style={{ color: 'rgba(244,248,255,0.4)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              {whisper}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress */}
        <div className="w-full max-w-[200px] mt-1">
          <div
            className="h-[3px] rounded-full overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            <motion.div
              className="h-full rounded-full origin-left"
              style={{
                background: 'linear-gradient(90deg, #0A66FF, #57BEFF)',
              }}
              initial={{ scaleX: 0.06 }}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
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
