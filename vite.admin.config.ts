import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(import.meta.dirname, 'admin.html') },
  },
});
