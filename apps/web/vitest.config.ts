import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// We don't ship RTL/jsdom — component smoke tests use react-dom/server
// renderToStaticMarkup in a node environment and assert on HTML output.
// @vitejs/plugin-react handles JSX transform in the dependency graph of any
// .tsx component that a test imports (vite's default oxc transformer does
// not transform JSX).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    include: ['lib/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}'],
  },
});
