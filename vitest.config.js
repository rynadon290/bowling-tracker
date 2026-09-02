import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // these test pure domain logic, not rendered components
    include: ['src/**/*.test.js'],
  },
});
