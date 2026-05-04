import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        privacyPolicy: resolve(root, 'privacy-policy/index.html'),
        support: resolve(root, 'support/index.html'),
      },
    },
  },
});
