import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/** Redirect /get → /get/ so SPA fallback does not serve the home page. */
function directorySlashRedirect() {
  return {
    name: 'directory-slash-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url || '/';
        const q = raw.indexOf('?');
        const path = q === -1 ? raw : raw.slice(0, q);
        const query = q === -1 ? '' : raw.slice(q);
        if (path.length > 1 && !path.endsWith('/') && !path.split('/').pop().includes('.')) {
          if (existsSync(resolve(root, path.slice(1), 'index.html'))) {
            res.statusCode = 302;
            res.setHeader('Location', `${path}/${query}`);
            res.end();
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [directorySlashRedirect()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        privacyPolicy: resolve(root, 'privacy-policy/index.html'),
        support: resolve(root, 'support/index.html'),
        verein: resolve(root, 'verein/index.html'),
        get: resolve(root, 'get/index.html'),
        app: resolve(root, 'app/index.html'),
      },
    },
  },
});
