# VoiceCraft Design System — Implementation Notes

This file tracks how the **[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)** is being applied to the codebase. It's the bridge between spec and code.

---

## Tokens mapping (DESIGN_SYSTEM §2 ↔ code)

All tokens are defined in two places:

1. **CSS variables** in [`src/index.css`](src/index.css) at `:root` (DESIGN_SYSTEM §9.1) — single source of truth.
2. **Tailwind bridge** in [`tailwind.config.cjs`](tailwind.config.cjs) — `colors.canvas`, `colors.rail`, `colors.panel`, `colors.surface1`, `colors.surface2`, `colors.line`, `colors.strong`, `colors.ink`, `colors.muted`, `colors.positive`, `colors.warning`, `colors.danger`, `colors.accent`, `colors.accent-soft` map to `var(--vc-…)` / `var(--space-…)`. Plus radii: `rounded-input` (12), `rounded-card` (16), `rounded-modal` (20), `rounded-pill` (999).

| Spec token | Tailwind class | Where used |
|---|---|---|
| `--vc-bg-canvas`  | `bg-canvas` | Main area + page bg |
| `--vc-bg-rail`    | `bg-rail` | GlobalRail |
| `--vc-bg-panel`   | `bg-panel` | SpacePanel + SelfControls |
| `--vc-surface-1`  | `bg-surface1` | Cards, inputs, modals |
| `--vc-surface-2`  | `bg-surface2` | Hover, elevated rows |
| `--vc-border`     | `border-line` | All borders |
| `--vc-text-strong`| `text-strong` | Titles, primary content |
| `--vc-text`       | `text-ink`    | Body text |
| `--vc-text-muted` | `text-muted`  | Metadata |
| `--vc-positive`   | `bg-positive` / `text-positive` | Online indicators |
| `--vc-warning`    | `bg-warning` / `text-warning` | Warnings, creator badge |
| `--vc-danger`     | `bg-danger` / `text-danger` | Leave, delete, error |
| `--space-accent`  | `bg-accent` / `text-accent` / `border-accent` | Identity of active Space |
| `--space-accent-soft` | `bg-accent-soft` | Selection, tinted backgrounds |
| `--space-accent-glow-24` | inline | Speaking glow (DESIGN_SYSTEM §5.2) |

The `tailwind.config.cjs` no longer carries the legacy `warm.*` / `amber.*` palette — those were warm-toned and did not match the spec.

---

## Structural map (DESIGN_SYSTEM §3 ↔ code)

```
AppShell (src/App.jsx)
├── GlobalRail           → src/components/SpacesRail.jsx (kept filename; spec-aligned)
├── SpacePanel           → src/components/layout/SpaceContextPanel.jsx (kept filename; 296 px)
│   ├── SpaceIdentity     → top of SpacePanel (avatar + name + 2-line description + meta)
│   ├── SpaceNavigation   → tabs (Visão geral / Salas / Pessoas)
│   ├── OverviewView      → src/components/views/SpaceOverview.jsx (cards §7.2)
│   ├── RoomList          → src/components/views/RoomsList.jsx (kept filename; no #)
│   ├── PeopleDirectory   → src/components/views/PeopleList.jsx (kept filename; search + filters)
│   └── SelfControls      → footer (mic / audio / identity row — DESIGN_SYSTEM §B)
└── MainRoute
    ├── SpaceOverview    → tab content (already inside SpacePanel)
    ├── ConversationRoom → src/components/views/TextRoomView.jsx (kept filename;
    │                       default export is `ConversationRoom` per §6 — normativa B)
    │   ├── ConversationHeader
    │   ├── ConversationSearch → src/components/views/ConversationSearch.jsx
    │   ├── MessageTimeline
    │   │   └── EmojiReactions → src/components/ui/EmojiReactions.jsx
    │   └── MessageComposer → replyTo banner added (DESIGN_SYSTEM §D)
    ├── VoiceRoom        → src/components/views/VoiceRoomView.jsx (DESIGN_SYSTEM §5)
    │   ├── ParticipantGrid (XL cards, 2px ring + 24% glow on speaking)
    │   ├── CallControlDock → mic / audio / share / more / leave
    │   └── DevicePopover  → microphone picker
    └── PeopleDirectory  → tab content (already inside SpacePanel)
```

Modals (mounted at App level):
- `InviteModal` (`src/components/ui/InviteModal.jsx`) — shareable link, copy button, focus trap, Escape closes.
- `ProfilePopover` (`src/components/people/ProfilePopover.jsx`) — hero gradient, avatar XL, focus trap, Escape closes.

---

## Active iteration status

### Iter 1 (Fundamentos) — ✅ done
- Created `layout/SpaceContextPanel.jsx` with tabs (Visão geral / Salas / Pessoas).
- Created `views/SpaceOverview.jsx`, `views/RoomsList.jsx`, `views/PeopleList.jsx`.
- Deleted legacy `ChannelSidebar`, `SpaceHomeView`, `Sidebar`, `RoomModal`.
- App.jsx rewritten to use the new three-region layout.

### Iter 2 (Conversa) — ✅ done
- Created `views/TextRoomView.jsx`, `views/Composer.jsx`, `views/MessageList.jsx`, `views/MessageBubble.jsx`.
- Rewrote `hooks/useChat.js` to be scoped per Sala (roomKey) and persisted to localStorage per Sala.

### Iter 3 (Voz) — ✅ done
- VoiceRoomView with cards, dock, screenshot/screen share, mic + audio controls.
- PersonCard + ProfilePopover.
- PeopleList with search.

### Iter 4 (Pessoas + Polimento) — ✅ done (this iteration)
- **Tokens:** Tailwind palette swapped to spec (`canvas`, `rail`, `panel`, `surface1`, `surface2`, `line`, `strong`, `ink`, `muted`, `positive`, `warning`, `danger`, `accent`, `accent-soft`).
- **CSS tokens:** Spec exact values in `:root` (DESIGN_SYSTEM §9.1) — including `--space-accent-glow-24` for the speaking state.
- **Focus rings:** 2 px outline + 2 px offset via `:focus-visible` on every interactive element.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` kills pulses + transitions (DESIGN_SYSTEM §8.2).
- **Aria-live:** App-level `role="status" aria-live="polite"` region announces VoiceRoom connection state changes.
- **SpacePanel:** width 296 px (within 272–320 px band), SelfControls pinned to the bottom, settings popover has a "Convidar pro Space" entry that opens the InviteModal.
- **SpaceOverview:** cards per §7.2 — icon + name (no `#`), description (1 line), people (avatars stacked + text) when active, state (ao vivo / vazia / mensagens novas), dominant CTA.
- **RoomList / PeopleList:** no `#` anywhere. PeopleList now has filter chips (Online / Todos / Com função).
- **ConversationRoom:** adds ConversationSearch (functional filter), EmojiReactions on every message (counts + "mine" state, never color-only), reply chip + Composer reply banner, context menu (copy / edit / delete for own messages). Auto-scroll behavior per §6.3. "X mensagens novas ↓" pill functional.
- **VoiceRoom:** XL participant cards (112 px), 2 px ring + 24% glow on speaking, 5-bar SVG waveform (suppressed under reduced motion), "Falando agora" text reinforced, CallControlDock with mic / audio / share / more / leave. Mic button has a chevron that opens a DevicePopover (microphone picker).
- **ProfilePopover:** focus trap, hero gradient using --space-accent, XL avatar with warm ring, role badge (creator) when applicable, "Convidar pro Space" + "Copiar ID" actions (both real — first triggers InviteModal, second uses navigator.clipboard).
- **InviteModal:** focus trap, Escape closes, builds URL from `window.location.origin`, copy button with "Copiado!" feedback state.

---

## Decisions against the spec

| Decision | Choice | Reason |
|---|---|---|
| File rename (`RoomList.jsx` etc.) | Kept old filenames | Avoid breaking other importers + lazy() references in App.jsx. The component **function names** are `RoomList` and `PeopleDirectory`; the file paths stayed `RoomsList.jsx` / `PeopleList.jsx`. |
| GlobalRail (was SpacesRail) | Kept filename `SpacesRail.jsx` | Same reason. |
| ConversationRoom (was TextRoomView) | Same file; default export is renamed | App.jsx imports as `ConversationRoom` so the semantic matches the spec. |
| SelfControls mic/audio toggle | Disabled placeholder | VoiceRoom dock is the authoritative control surface (WebRTC track lives there). Toggling from the panel while not in a call would be a no-op and risk confusing the user. |
| Reactions persistence | Local-only (per-client) | Reactions aren't part of the signaling protocol yet. The UI is fully functional on the local side; we'll add a piggyback on the data channel later. |
| Reply wire | `msg.replyToId` round-tripped over the data channel | Same protocol — peers see the reply chip on incoming messages with `replyToId`. |
| `prefers-reduced-motion` | Global CSS rule + `useReducedMotion` hook | Both work: the CSS rule kills every pulse/transition; the hook lets components conditionally render the static state. |
| `#` for sala names | Forbidden; not present anywhere | Verified via `grep`. The remaining `#` strings in the codebase are CSS hex codes — required for color literals — not sala name prefixes. |

---

## A11y status

- **Focus rings:** 2 px outline + 2 px offset on every interactive element via `:focus-visible` in `src/index.css`.
- **Focus trap:** `src/hooks/useFocusTrap.js` (used by ProfilePopover + InviteModal). Wraps modal contents, cycles Tab inside, restores focus on close.
- **ARIA-live:** App-level `sr-only` region announces "Conectando" / "Conectado" / "Aguardando peer" / "Erro de conexão" — driven by `VoiceRoomView`'s `onStatusChange` callback.
- **Escape closes:** all overlays (modals, popovers, lightbox, search) honor Escape via keydown listeners.
- **aria-pressed** on toggle buttons (mic, audio, search, filter chips, reaction emoji when "mine").

---

## Build + run quick reference

```bash
# Build (verified)
npx vite build
# → 1886 modules transformed, built in ~3s

# Run dev with two windows (for end-to-end testing)
npm run dev:multi
```

See `/tmp/devmulti-iter4.log` for the most recent runtime evidence.
