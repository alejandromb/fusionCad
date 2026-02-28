import { defineProject } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineProject({
  test: {
    name: 'core-engine',
    root: __dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
