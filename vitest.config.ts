import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@agent-e/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  server: {
    deps: {
      // ws and other Node-native packages need to be externalized
      external: ['ws'],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts'],
    server: {
      deps: {
        external: ['ws'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**'],
    },
  },
});
