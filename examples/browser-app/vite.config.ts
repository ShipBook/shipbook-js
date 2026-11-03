import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point to source files during development for better ES module support
      '@shipbook/browser': path.resolve(__dirname, '../../packages/browser/src/index.ts'),
      '@shipbook/client': path.resolve(__dirname, '../../packages/client/src/index.ts'),
      '@shipbook/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  server: {
    // the shop demo calls the node-app's shop-example backend; same origin, so no CORS setup for x-shipbook-session
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        shop: path.resolve(__dirname, 'shop.html'),
      },
    },
    commonjsOptions: {
      include: [/node_modules\//],
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['@shipbook/browser', '@shipbook/client', '@shipbook/core'],
  },
});
