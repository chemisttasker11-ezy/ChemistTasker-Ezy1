// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'

export default defineConfig(({ command }) => {
  const isDev = command === 'serve'
  const kioskBuild = process.env.VITE_KIOSK_BUILD === '1'
  const apiProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8000'
  const wsProxyTarget = process.env.VITE_DEV_WS_PROXY_TARGET || 'ws://127.0.0.1:8000'

  return {
    base: '/',
    plugins: [react()],
    resolve: {
      alias: [{ find: /^@chemisttasker\/shared-core$/, replacement: fileURLToPath(new URL('../shared-core/src/index.ts', import.meta.url)) }],
    },

    server: {
      port: 5173,
      host: 'localhost',
      strictPort: true,
      // The unified dev site is opened on Next.js :3000, while Vite owns HMR
      // on :5173. Point the client there directly instead of first attempting
      // an unsupported WebSocket upgrade through the Next.js rewrite.
      hmr: {
        host: 'localhost',
        clientPort: Number(process.env.VITE_DEV_HMR_PORT || 5173),
      },
      fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../shared-core', import.meta.url))] },
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
          ? { kiosk: resolve(__dirname, 'kiosk.html') }
          : { app: resolve(__dirname, 'index.html') },
        output: {
          assetFileNames: 'dashboard-assets/[name].[hash][extname]',
          chunkFileNames:  'js/[name].[hash].js',
          entryFileNames:  'js/[name].[hash].js',
        },
      },
    },
  }
})
