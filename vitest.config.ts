import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit-node',
          environment: 'node',
          include: ['src/server/**/*.test.ts', 'src/shared/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'unit-client',
          environment: 'jsdom',
          include: ['src/client/**/*.test.{ts,tsx}'],
          // The local copy of the data is IndexedDB, which jsdom does not provide.
          setupFiles: ['fake-indexeddb/auto'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // Integration tests share one PostgreSQL database.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
