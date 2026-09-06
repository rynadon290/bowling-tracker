import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Needed so appRender.test.jsx can transform JSX.
  plugins: [react()],
  test: {
    environment: 'node',
    // Most tests cover pure domain logic, but appRender.test.jsx renders the
    // whole component tree -- that's the only thing that catches a prop
    // referencing an undefined identifier, which compiles fine and then
    // black-screens at runtime.
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});
