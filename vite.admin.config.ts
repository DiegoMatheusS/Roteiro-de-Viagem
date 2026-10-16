import { copyFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'use-separated-admin-worker',
    // Vite first copies the public worker; only the admin output gets replaced.
    closeBundle() {
      copyFileSync(
        path.resolve(import.meta.dirname, 'admin-worker.js'),
        path.resolve(import.meta.dirname, 'dist-admin/_worker.js'),
      );
    },
  }],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(import.meta.dirname, 'admin-entry.html') },
  },
});
