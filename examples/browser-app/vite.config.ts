import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point to source files during development for better ES module support
      '@shipbook/browser': path.resolve(__dirname, '../../packages/browser/src/index.ts'),
      '@shipbook/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  build: {
    commonjsOptions: {
      include: [/node_modules\//],
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['@shipbook/browser', '@shipbook/core'],
  },
});
