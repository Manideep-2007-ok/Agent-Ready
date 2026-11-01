import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dashboard on :5173; every /api call (including the live SSE stream) goes to the Express server on :4000.
// Tailwind powers the Magic UI / shadcn components in src/components/ui ('@' = src). Vite compiles their .tsx directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
