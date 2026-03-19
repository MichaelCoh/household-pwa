import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  preview: {
    allowedHosts: ['macbook-pro.tail0c9afa.ts.net'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'הבית שלנו',
        short_name: 'הבית שלנו',
        description: 'ניהול הבית שלנו',
        theme_color: '#6C63FF',
        background_color: '#0f0f13',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        lang: 'he',
        dir: 'rtl',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Workaround: avoid terser/minify issues in some Node builds
        // (keeps SW generation stable; runtime behavior is unchanged for our app)
        mode: 'development',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /\/(rest|auth|realtime)\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 200, maxAgeSeconds: 86400 } }
          }
        ],
        importScripts: ['sw-push.js']
      }
    })
  ]
})
