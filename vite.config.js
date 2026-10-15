import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, loadEnv } from 'vite'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'

function autoStartWhatsAppBot() {
  let hasChecked = false
  return {
    name: 'auto-start-whatsapp-bot',
    configureServer() {
      if (hasChecked) return
      hasChecked = true
      const req = http.get('http://localhost:4848/api/status', () => {
        // already running
      })
      req.on('error', () => {
        try {
          const child = spawn('node', ['index.js'], {
            cwd: path.resolve('whatsapp-bot'),
            stdio: 'ignore',
            detached: true,
          })
          child.unref()
        } catch {
          // ignore
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Allow deploying to a sub-path (e.g. GitHub Pages /classvault/) via VITE_BASE_PATH
  const base = env.VITE_BASE_PATH || '/'

  return {
    base,
    plugins: [
      vue(),
      tailwindcss(),
      autoStartWhatsAppBot(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        // Disable service worker in dev — avoids stale cache issues during development
        // To test PWA behavior, do `npm run build && npm run preview`
        devOptions: {
          enabled: false,
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        manifest: {
          name: 'ClassVault',
          short_name: 'ClassVault',
          description: 'Offline-first class notes vault for university students.',
          theme_color: '#4f46e5',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: base,
          start_url: base,
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    server: {
      proxy: {
        '/api/whatsapp': {
          target: 'http://localhost:4848',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/whatsapp/, '/api'),
        },
      },
    },
  }
})
