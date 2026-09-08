import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Needed so appRender.test.jsx can transform JSX.
  plugins: [react()],
  test: {
    // jsdom, not node.
    //
    // The node environment can render a component to a string, which
    // proves it doesn't throw on mount -- but it cannot dispatch a click.
    // That gap shipped a real bug: the league chip's tap handler called
    // t.members.includes(...) on a team object that had no members, threw
    // inside the handler, and did nothing. React swallows handler errors,
    // so nothing surfaced. Every existing test passed.
    //
    // jsdom gives real DOM nodes and real event dispatch, so a test can
    // click the chip and assert what happened.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});
