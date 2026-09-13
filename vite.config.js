import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'
import { resolveLiveKitEmbed } from './scripts/resolve-livekit-embed.mjs'

const livekitEmbed = resolveLiveKitEmbed()
if (livekitEmbed.source !== 'none') {
  console.log(`[vite] LiveKit credentials embedded from ${livekitEmbed.source}`)
} else {
  console.warn('[vite] LiveKit credentials missing — packaged voice calls will need AppData keys')
}

const livekitDefine = {
  __VC_LIVEKIT_URL__: JSON.stringify(livekitEmbed.url || ''),
  __VC_LIVEKIT_API_KEY__: JSON.stringify(livekitEmbed.apiKey || ''),
  __VC_LIVEKIT_API_SECRET__: JSON.stringify(livekitEmbed.apiSecret || ''),
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.js',
        vite: {
          define: livekitDefine,
          build: {
            sourcemap: true,
            outDir: 'dist-electron',
            rollupOptions: {
              // Keep native/runtime packages out of the main bundle.
              external: ['electron-updater', 'livekit-server-sdk'],
            },
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
    proxy: {
      // Same-origin proxy so canvas crop can load Storage images in the
      // browser without bucket CORS (forwards Authorization if set).
      '/__fb_storage': {
        target: 'https://firebasestorage.googleapis.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/__fb_storage/, ''),
      },
    },
  },
})
