import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@te/shared': resolvePath('./packages/shared/src/index.ts'),
      '@te/config': resolvePath('./packages/config/src/index.ts'),
      '@te/game-engine': resolvePath('./packages/game-engine/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
