// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig(({ command }) => {
  const isDev = command === 'serve'
  const kioskBuild = process.env.VITE_KIOSK_BUILD === '1'
  const apiProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8000'
  const wsProxyTarget = process.env.VITE_DEV_WS_PROXY_TARGET || 'ws://127.0.0.1:8000'

  return {
    base: '/',
    plugins: [react()],
    // Shared web UI lives alongside Next. Use this app's React/MUI contexts in Vite too.
    resolve: {
      dedupe: ['react', 'react-dom', '@mui/material', '@mui/system', '@mui/private-theming', '@mui/icons-material', '@mui/x-date-pickers', 'dayjs', '@emotion/react', '@emotion/styled'],
      alias: isDev ? [
        { find: /^@chemisttasker\/shared-core$/, replacement: resolve(import.meta.dirname, '../shared-core/dist/index.js') },
        { find: '@chemisttasker/shared-core/skills_registry.json', replacement: resolve(import.meta.dirname, '../shared-core/skills_registry.json') },
      ] : [],
    },
    // shared-core is rebuilt and repacked locally during consolidation work.
    // Serving it through Vite's normal module pipeline prevents an older
    // optimized bundle from surviving with a stale named-export surface.
    optimizeDeps: {
      exclude: ['@chemisttasker/shared-core'],
    },
    server: {
      fs: { allow: [resolve(import.meta.dirname, '..')] },
      port: 5173,
      host: 'localhost',
      strictPort: true,
      watch: {
        ignored: ['**/landing_next/**', '**/.next/**', '**/dist/**', '**/dist-kiosk/**'],
      },
      // The unified dev site is opened on Next.js :3000, while Vite owns HMR
      // on :5173. Point the client there directly instead of first attempting
      // an unsupported WebSocket upgrade through the Next.js rewrite.
      hmr: {
        host: 'localhost',
        clientPort: Number(process.env.VITE_DEV_HMR_PORT || 5173),
      },
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: wsProxyTarget,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
        '/media': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    build: {
      outDir: kioskBuild ? 'dist-kiosk' : 'dist',
      sourcemap: isDev,
      rollupOptions: {
        input: kioskBuild
          ? { kiosk: resolve(import.meta.dirname, 'kiosk.html') }
          : { app: resolve(import.meta.dirname, 'index.html') },
        output: {
          assetFileNames: 'dashboard-assets/[name].[hash][extname]',
          chunkFileNames:  'js/[name].[hash].js',
          entryFileNames:  'js/[name].[hash].js',
        },
      },
    },
  }
})
