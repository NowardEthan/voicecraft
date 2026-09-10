import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'
import fs from 'fs'

function copyLiveKitTokenHelper() {
  return {
    name: 'copy-livekit-token-helper',
    writeBundle() {
      const src = path.resolve(__dirname, 'electron/livekitToken.js')
      const destDir = path.resolve(__dirname, 'dist-electron')
      const dest = path.join(destDir, 'livekitToken.js')
      try {
        fs.mkdirSync(destDir, { recursive: true })
        fs.copyFileSync(src, dest)
      } catch (err) {
        console.warn('[vite] failed to copy livekitToken.js', err?.message || err)
      }
    },
    closeBundle() {
      const src = path.resolve(__dirname, 'electron/livekitToken.js')
      const dest = path.resolve(__dirname, 'dist-electron/livekitToken.js')
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
      } catch (err) {
        console.warn('[vite] failed to copy livekitToken.js', err?.message || err)
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.js',
        vite: {
          build: {
            sourcemap: true,
            outDir: 'dist-electron',
            rollupOptions: {
              // Keep native/runtime packages out of the main bundle.
              external: ['electron-updater', 'livekit-server-sdk'],
            },
            plugins: [copyLiveKitTokenHelper()],
          },
        },
      },
      preload: {
        input: 'electron/preload.js',
        vite: {
          build: {
            sourcemap: 'inline',
            outDir: 'dist-electron',
          },
        },
      },
      // Renderer-side: allow require() in the renderer if any code needs it.
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('framer-motion')) return 'framer-motion'
          if (id.includes('@iconify') || id.includes('iconify-json')) return 'iconify'
          if (id.includes('react-dom') || id.includes('/react/') || id.endsWith('\\react\\index.js')) {
            return 'react-vendor'
          }
          return undefined
        },
      },
    },
  },
  server: {
    port: 5183,
    host: '0.0.0.0',
    strictPort: false,
  },
})
