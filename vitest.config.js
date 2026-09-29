import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// A zone away from UTC (with daylight saving), so the local-time tests mean something on any machine.
process.env.TZ = 'America/New_York';

export default defineConfig({
  define: { __ZCF_VERSION__: JSON.stringify(pkg.version) },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    restoreMocks: true,
  },
});
