const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  getHostname: () => ipcRenderer.invoke('get-hostname'),
  getDesktopSources: (opts) => ipcRenderer.invoke('desktop-capturer:get-sources', opts),

  // Settings store
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getGpuInfo: () => ipcRenderer.invoke('system:get-gpu-info'),

  // File logging
  log: (level, msg) => ipcRenderer.invoke('app:log', level, msg),

  // Paths
  getPaths: () => ipcRenderer.invoke('app:get-paths'),

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

  // Audio service (C++ child process)
  audioService: {
    available: () => ipcRenderer.invoke('audio-service:available'),
    start: () => ipcRenderer.invoke('audio-service:start'),
    stop: () => ipcRenderer.invoke('audio-service:stop'),
    send: (cmd) => ipcRenderer.invoke('audio-service:send', cmd),
    // Subscribe to PCM frames coming from the C++ service.
    onFrame: (cb) => {
      const handler = (_e, payload) => {
        // payload is a Uint8Array (raw bytes from stdout)
        const u8 = payload instanceof Uint8Array
          ? payload
          : new Uint8Array(payload.buffer || payload)
        const floats = new Float32Array(u8.buffer, u8.byteOffset, u8.byteLength / 4)
        cb(floats, u8.byteLength / 4)
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
