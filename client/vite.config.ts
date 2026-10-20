/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Local-first : en développement, le client (Vite) proxy l'API et le temps réel
// vers le serveur Node afin de rester sur une seule origine côté navigateur.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // écoute sur le LAN aussi en dev
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
      '/uploads': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
