import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'node_modules/**',
        'dist/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
      watermarks: {
        statements: [70, 85],
        functions: [70, 85],
        branches: [60, 80],
        lines: [70, 85],
      },
    },
    pool: 'forks',
    singleFork: true,
    testTimeout: 30000,
  },
});
