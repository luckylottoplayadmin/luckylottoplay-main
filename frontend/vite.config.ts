import { defineConfig } from 'vite' // trigger restart
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react/') || id.includes('react-dom/') || id.includes('react-router-dom')) {
              return 'vendor-core';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('@tanstack')) {
              return 'vendor-query';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('@tiptap')) {
              return 'vendor-editor';
            }
            if (id.includes('zod') || id.includes('axios') || id.includes('date-fns') || id.includes('dayjs')) {
              return 'vendor-utils';
            }
          }
        },
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
})
