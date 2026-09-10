import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'

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
              // Keep native/runtime package out of the main bundle.
              external: ['electron-updater'],
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
  },
})
