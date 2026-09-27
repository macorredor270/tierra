import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
