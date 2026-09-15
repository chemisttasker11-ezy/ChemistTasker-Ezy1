// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => {
  const isDev = command === 'serve'
  const apiProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:8000'
  const wsProxyTarget = process.env.VITE_DEV_WS_PROXY_TARGET || 'ws://localhost:8000'

  return {
    base: '/',
    plugins: [react()],

    server: {
      host: 'localhost',
      strictPort: true,
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
      outDir: 'dist',
      sourcemap: isDev,
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name].[hash][extname]',
          chunkFileNames:  'js/[name].[hash].js',
          entryFileNames:  'js/[name].[hash].js',
        },
      },
    },
  }
})
