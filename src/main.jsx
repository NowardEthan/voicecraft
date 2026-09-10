import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './shell/App.jsx'
import { registerSpaceIcons } from './features/spaces/model/spaceIcons.jsx'
import { purgeHugeLocalCovers } from './features/spaces/model/spaceCover.js'
import './index.css'

// Register the local Phosphor collection once, before any SpaceIcon
// tries to render. No network — purely offline.
registerSpaceIcons()
try { purgeHugeLocalCovers() } catch {}

// No StrictMode: it double-mounts effects and tears down LiveKit/WebRTC
// mid-call (User-Initiated Abort + reconnect storms).
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
