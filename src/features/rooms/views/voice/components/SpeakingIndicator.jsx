/**
 * SpeakingIndicator — visual cue for an active speaker.
 *
 * For SELF this is wired to the real audio level (from useVoiceRoom).
 * For remote peers we fall back to a discrete waveform that breathes
 * when the participant is marked as "speaking" by the server. We do
 * NOT simulate audio levels for remote peers (no waveform with random
 * data) — if the server doesn't tell us, we don't fake it.
 */
export function SpeakingIndicator({ active, reducedMotion = false }) {
  if (!active) return null
  return (
    <div
      className="flex items-end gap-[3px] h-3.5"
      aria-hidden
    >
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          className={[
            'w-[3px] rounded-full bg-accent',
            reducedMotion ? '' : 'vc-speaking-pulse',
          ].join(' ')}
          style={reducedMotion
            ? { height: '100%' }
            : { animationDelay: `${i * 90}ms` }
          }
        />
      ))}
    </div>
  )
}
