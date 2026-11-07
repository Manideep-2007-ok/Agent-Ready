import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dashboard on :5173; every /api call (including the live SSE stream) goes to the Express server on :4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 127.0.0.1, not localhost: the server listens on IPv4 loopback only, and 'localhost' can resolve to ::1.
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
});
