import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    css: true,
    projects: [
      {
        test: {
          name: 'frontend',
          globals: true,
          environment: 'jsdom',
          setupFiles: './src/test/setup.ts',
          include: ['src/__tests__/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'backend',
          globals: true,
          environment: 'node',
          include: ['server/__tests__/**/*.test.ts'],
        },
      },
    ],
  },
})
