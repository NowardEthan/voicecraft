const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  getHostname: () => ipcRenderer.invoke('get-hostname'),
  getDesktopSources: (opts) => ipcRenderer.invoke('desktop-capturer:get-sources', opts),

  // Settings store
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getGpuInfo: () => ipcRenderer.invoke('system:get-gpu-info'),
  getPerfSnapshot: () => ipcRenderer.invoke('system:perf-snapshot'),

  // File logging
  log: (level, msg) => ipcRenderer.invoke('app:log', level, msg),

  // Paths
  getPaths: () => ipcRenderer.invoke('app:get-paths'),

  /** Bypass CORS: download Storage image bytes via Electron main. */
  fetchStorageImage: (url, idToken) =>
    ipcRenderer.invoke('net:fetch-storage-image', { url, idToken }),

  // Custom title bar / frameless window
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximized: (cb) => {
      const handler = (_e, maximized) => cb(!!maximized)
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.removeListener('window:maximized', handler)
    },
  },

  startGoogleAuth: () => ipcRenderer.invoke('auth:google-start'),
  cancelGoogleAuth: () => ipcRenderer.invoke('auth:google-cancel'),
  onGoogleAuthResult: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('auth:google-result', handler)
    return () => ipcRenderer.removeListener('auth:google-result', handler)
  },

  // Auto-update (packaged builds only)
  updater: {
    getVersion: () => ipcRenderer.invoke('updater:get-version'),
    getStatus: () => ipcRenderer.invoke('updater:get-status'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    },
  },

  // LiveKit voice (token minted in main — secret never reaches the renderer)
  livekit: {
    getToken: (payload) => ipcRenderer.invoke('livekit:token', payload || {}),
  },

  // Audio service (C++ child process)
  audioService: {
    available: () => ipcRenderer.invoke('audio-service:available'),
    start: () => ipcRenderer.invoke('audio-service:start'),
    stop: () => ipcRenderer.invoke('audio-service:stop'),
    send: (cmd) => ipcRenderer.invoke('audio-service:send', cmd),
    listProcesses: () => ipcRenderer.invoke('audio-service:list-processes'),
    startLoopback: (payload) => ipcRenderer.invoke('audio-service:start-loopback', payload),
    stopLoopback: (payload) => ipcRenderer.invoke('audio-service:stop-loopback', payload),
    // Subscribe to PCM frames coming from the C++ service.
    onFrame: (cb) => {
      const handler = (_e, payload) => {
        let type = 'mic'
        let raw = payload
        if (payload && payload.payload) {
          type = payload.type || 'mic'
          raw = payload.payload
        }
        // raw is a Uint8Array (raw bytes from stdout)
        const u8 = raw instanceof Uint8Array
          ? raw
          : new Uint8Array(raw?.buffer || raw || [])
        const floats = new Float32Array(u8.buffer, u8.byteOffset, u8.byteLength / 4)
        floats.type = type
        const meta = { type, floats, sampleRate: 48000, channels: 1 }
        cb(floats, u8.byteLength / 4, meta)
      }
      ipcRenderer.on('audio:frame', handler)
      return () => ipcRenderer.removeListener('audio:frame', handler)
    },
    // Subscribe to status events from the service (ready, error, device-list, …)
    onStatus: (cb) => {
      const handler = (_e, msg) => cb(msg)
      ipcRenderer.on('audio:status', handler)
      return () => ipcRenderer.removeListener('audio:status', handler)
    },
  },
})
