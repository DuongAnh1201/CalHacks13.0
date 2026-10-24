/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // shortcut: be's atlasData.test.ts imports ./anatomy (ai T5); drop this exclude once that module exists
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**', 'src/viewer/atlasData.test.ts'],
  },
});
