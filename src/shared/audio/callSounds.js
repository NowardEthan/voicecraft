/**
 * Lightweight Discord-style call UI sounds via Web Audio (no asset files).
 * Respects settings.callSounds and output volume.
 */

let sharedCtx = null
let lastPlayAt = 0
let prefs = { enabled: true, volume: 80 }

/** Keep in sync from the voice hook so leaveCall can play without React. */
export function configureCallSounds(next = {}) {
  prefs = {
    enabled: next.enabled !== false,
    volume: Number(next.volume ?? prefs.volume ?? 80),
  }
}

function getCtx() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AC()
  }
  return sharedCtx
}

async function ensureRunning(ctx) {
  if (!ctx) return false
  if (ctx.state === 'suspended') {
    try { await ctx.resume() } catch { return false }
  }
  return ctx.state === 'running'
}

function tone(ctx, {
  freq = 440,
  freqEnd = null,
  type = 'sine',
  start = 0,
  duration = 0.12,
  gain = 0.08,
  attack = 0.008,
  release = 0.06,
}) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
  if (freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, freqEnd),
      ctx.currentTime + start + duration,
    )
  }
  const t0 = ctx.currentTime + start
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duration + release + 0.02)
}

const PATTERNS = {
  join: (ctx, vol) => {
    tone(ctx, { freq: 523.25, type: 'sine', start: 0, duration: 0.09, gain: 0.07 * vol })
    tone(ctx, { freq: 659.25, type: 'sine', start: 0.08, duration: 0.11, gain: 0.08 * vol })
    tone(ctx, { freq: 783.99, type: 'triangle', start: 0.16, duration: 0.16, gain: 0.06 * vol })
  },
  leave: (ctx, vol) => {
    tone(ctx, { freq: 659.25, type: 'sine', start: 0, duration: 0.1, gain: 0.07 * vol })
    tone(ctx, { freq: 523.25, type: 'sine', start: 0.09, duration: 0.12, gain: 0.06 * vol })
    tone(ctx, { freq: 392.0, type: 'triangle', start: 0.18, duration: 0.18, gain: 0.05 * vol, freqEnd: 280 })
  },
  peerJoin: (ctx, vol) => {
    tone(ctx, { freq: 587.33, type: 'sine', start: 0, duration: 0.08, gain: 0.055 * vol })
    tone(ctx, { freq: 880.0, type: 'sine', start: 0.07, duration: 0.12, gain: 0.06 * vol })
  },
  peerLeave: (ctx, vol) => {
    tone(ctx, { freq: 740.0, type: 'sine', start: 0, duration: 0.09, gain: 0.05 * vol })
    tone(ctx, { freq: 494.0, type: 'triangle', start: 0.08, duration: 0.14, gain: 0.045 * vol, freqEnd: 360 })
  },
  mute: (ctx, vol) => {
    tone(ctx, { freq: 420, type: 'sine', start: 0, duration: 0.07, gain: 0.045 * vol, freqEnd: 280 })
  },
  unmute: (ctx, vol) => {
    tone(ctx, { freq: 360, type: 'sine', start: 0, duration: 0.07, gain: 0.045 * vol, freqEnd: 520 })
  },
  deafen: (ctx, vol) => {
    tone(ctx, { freq: 300, type: 'triangle', start: 0, duration: 0.1, gain: 0.04 * vol, freqEnd: 160 })
  },
  undeafen: (ctx, vol) => {
    tone(ctx, { freq: 220, type: 'triangle', start: 0, duration: 0.1, gain: 0.04 * vol, freqEnd: 440 })
  },
  reconnect: (ctx, vol) => {
    tone(ctx, { freq: 480, type: 'sine', start: 0, duration: 0.06, gain: 0.04 * vol })
    tone(ctx, { freq: 480, type: 'sine', start: 0.12, duration: 0.06, gain: 0.035 * vol })
  },
  disconnect: (ctx, vol) => {
    tone(ctx, { freq: 500, type: 'sawtooth', start: 0, duration: 0.05, gain: 0.03 * vol })
    tone(ctx, { freq: 280, type: 'triangle', start: 0.06, duration: 0.16, gain: 0.04 * vol, freqEnd: 140 })
  },
  error: (ctx, vol) => {
    tone(ctx, { freq: 220, type: 'square', start: 0, duration: 0.08, gain: 0.035 * vol })
    tone(ctx, { freq: 180, type: 'square', start: 0.1, duration: 0.12, gain: 0.03 * vol })
  },
}

/**
 * @param {'join'|'leave'|'peerJoin'|'peerLeave'|'mute'|'unmute'|'deafen'|'undeafen'|'reconnect'|'disconnect'|'error'} name
 * @param {{ enabled?: boolean, volume?: number }} [opts]
 */
export async function playCallSound(name, opts = {}) {
  const enabled = opts.enabled !== undefined ? opts.enabled !== false : prefs.enabled
  if (!enabled) return
  const pattern = PATTERNS[name]
  if (!pattern) return

  const now = Date.now()
  if (now - lastPlayAt < 40 && name !== 'mute' && name !== 'unmute') return
  lastPlayAt = now

  const ctx = getCtx()
  if (!(await ensureRunning(ctx))) return

  const rawVol = opts.volume !== undefined ? opts.volume : prefs.volume
  const volume = Math.max(0, Math.min(1, (Number(rawVol ?? 80) / 100) * 0.9))
  if (volume <= 0.01) return

  try {
    pattern(ctx, volume)
  } catch (err) {
    console.warn('[callSounds]', name, err)
  }
}

export function unlockCallSounds() {
  const ctx = getCtx()
  if (!ctx) return
  ensureRunning(ctx).catch(() => {})
}
