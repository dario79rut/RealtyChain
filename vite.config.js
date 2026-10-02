import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = process.env.API_PORT || env.API_PORT || env.PORT || '4000'
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      open: true,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    define: {
      'process.env.NEXT_PUBLIC_ENABLE_TESTNETS': JSON.stringify(process.env.NEXT_PUBLIC_ENABLE_TESTNETS || 'false'),
    },
  }
})