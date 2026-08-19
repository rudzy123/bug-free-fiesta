import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcRoot = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': srcRoot,
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
  },
});
