import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dashboard on :5173; every /api call (including the live SSE stream) goes to the Express server on :4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
