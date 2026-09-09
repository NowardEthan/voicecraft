/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // VoiceCraft Design System v1.0 — exact tokens (DESIGN_SYSTEM §2.1).
        // Backgrounds / surfaces / borders / text scale.
        canvas:    'var(--vc-bg-canvas)',
        rail:      'var(--vc-bg-rail)',
        panel:     'var(--vc-bg-panel)',
        surface1:  'var(--vc-surface-1)',
        surface2:  'var(--vc-surface-2)',
        line:      'var(--vc-border)',
        strong:    'var(--vc-text-strong)',
        ink:       'var(--vc-text)',
        muted:     'var(--vc-text-muted)',
        positive:  'var(--vc-positive)',
        warning:   'var(--vc-warning)',
        danger:    'var(--vc-danger)',
        // Space accent (default before a Space is selected).
        accent:    'var(--space-accent)',
        'accent-soft': 'var(--space-accent-soft)',
        'on-accent': 'var(--space-on-accent)',
        'on-color': 'var(--space-on-color)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      borderRadius: {
        // Spec radii (DESIGN_SYSTEM §2.3).
        'input':  '12px',
        'card':   '16px',
        'modal':  '20px',
        'pill':   '999px',
      },
      boxShadow: {
        // Focus ring (DESIGN_SYSTEM §9.1)
        'focus-ring': 'var(--focus-ring)',
        // Glow for "speaking" — 24% opacity ceiling on --space-accent.
        'glow-accent': '0 0 0 2px var(--space-accent), 0 0 24px var(--space-accent-glow-24)',
      },
      keyframes: {
        // Reduced-motion friendly speaking waveform (DESIGN_SYSTEM §5.2)
        'vc-wave': {
          '0%, 100%': { transform: 'scaleY(0.25)' },
          '50%':      { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'vc-wave': 'vc-wave 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
