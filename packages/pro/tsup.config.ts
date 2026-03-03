import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    resolve: ['@agent-e/engine'],
  },
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: ['@agent-e/engine'],
});
