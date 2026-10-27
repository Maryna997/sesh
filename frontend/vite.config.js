import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The frontend calls the API with relative paths (/api/v1/...). In
// development, Vite forwards those requests to the Express backend, so the
// browser only talks to one origin and the HttpOnly session cookie is
// first-party. The browser's Origin header (http://localhost:5173) is kept,
// which is what the backend's CLIENT_URL check expects.
//
// API_PROXY_TARGET can point the proxy at another backend address. It is
// not a VITE_ variable, so it is never exposed to browser code.
const apiProxy = {
  '/api': {
    target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
})
