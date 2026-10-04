import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Portable Desktop: بدون PWA حتى لا يتخزّن الكاش القديم
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    sourcemap: false,
  },
});
