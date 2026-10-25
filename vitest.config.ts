import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    env: { APP_ENV: 'test', PUBLICATION_ENABLED: 'false', AUTO_PUBLICATION_ENABLED: 'false' },
  },
});
