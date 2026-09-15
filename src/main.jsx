import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './shell/App.jsx'
import { registerSpaceIcons } from './features/spaces/model/spaceIcons.jsx'
import { purgeHugeLocalCovers } from './features/spaces/model/spaceCover.js'
import { initTelemetry } from './shared/perf/telemetry.js'
import './index.css'

// Telemetria: marca o instante em que o renderer começa a executar.
try {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark('voice:renderer-start')
  }
} catch {}

initTelemetry()

// Register the local Phosphor collection once, before any SpaceIcon
// tries to render. No network — purely offline.
registerSpaceIcons()
try { purgeHugeLocalCovers() } catch {}

// No StrictMode: it double-mounts effects and tears down LiveKit/WebRTC
// mid-call (User-Initiated Abort + reconnect storms).
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
