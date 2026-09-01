import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    /*
     * CSS is stubbed by default, which is what every other stylesheet here
     * wants: no test asserts a computed style. crt.css is the exception. Its
     * prefers-reduced-motion rule is a guarantee the app makes and jsdom cannot
     * evaluate a media query, so the rule is asserted in the injected
     * stylesheet text instead. Scoped to that one file so nothing else pays
     * the transform cost.
     */
    css: { include: [/crt\.css$/] },
  },
});
