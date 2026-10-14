import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Redirect before Vite's base middleware rejects the bare /admin URL.
function adminEntryRedirect(): Plugin {
  const configure: NonNullable<Plugin['configureServer']> = (server) => {
    server.middlewares.use((req, res, next) => {
      const [pathname, query] = (req.url || '/').split('?');
      if ((req.method === 'GET' || req.method === 'HEAD') &&
          (pathname === '/admin' || pathname === '/')) {
        res.statusCode = 302;
        res.setHeader('Location', `/admin/${query ? `?${query}` : ''}`);
        res.end();
        return;
      }
      next();
    });
  };
  return {
    name: 'admin-entry-redirect',
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

export default defineConfig({
  base: '/admin/',
  plugins: [adminEntryRedirect(), react()],
  server: {
    host: '0.0.0.0',
    proxy: { '/admin-api': process.env.ADMIN_API_PROXY || 'http://localhost:4000' },
  },
});
