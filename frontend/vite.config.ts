import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * The backend lives on a different origin in production (VITE_API_BASE), and
 * the first thing the app does after boot is call it. Without a preconnect the
 * browser only starts the DNS + TLS handshake once the bundle has parsed and
 * fired the first fetch, which sits directly on the critical path to LCP.
 * Emitted only when the API is cross-origin — self-hosted builds leave
 * VITE_API_BASE empty and talk to their own origin.
 */
function preconnectApiOrigin(apiBase: string): Plugin {
  return {
    name: 'vitralume:preconnect-api-origin',
    transformIndexHtml() {
      if (!apiBase) return []
      let origin: string
      try {
        origin = new URL(apiBase).origin
      } catch {
        return []
      }
      if (origin === 'null') return []
      return [
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: origin, crossorigin: '' },
          injectTo: 'head-prepend' as const,
        },
        {
          tag: 'link',
          attrs: { rel: 'dns-prefetch', href: origin },
          injectTo: 'head-prepend' as const,
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // loadEnv only reads .env files, so check the real environment too —
    // that's where Vercel puts VITE_API_BASE.
    preconnectApiOrigin(
      process.env.VITE_API_BASE ?? loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE ?? '',
    ),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Vitralume — Job Application Copilot',
        short_name: 'Vitralume',
        description:
          'Glass-clear insight into your job fit: suitability analysis, ATS optimizer, research matching, and truthfulness-guarded cover letters.',
        theme_color: '#0b0e14',
        background_color: '#0b0e14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Never cache API responses; always hit the network.
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    // Ships .map files alongside the bundle so production stack traces and
    // Lighthouse diagnostics point at real source lines.
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy all /api/* requests to the FastAPI backend during development
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
}))
