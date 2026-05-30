import type { Plugin } from 'vite';

// NOTE: Changing this list (or the importmap JSON shape below) alters the inline
// <script type="importmap"> content in the built index.html. The production CSP in
// infra/nginx/nginx.conf and infra/docker/nginx/adminportal.conf pins this script via a
// sha256 hash — out-of-sync hashes make the browser block the importmap (blank page).
// After editing, rebuild and recompute the hash, then update both nginx configs:
//   node -e "const fs=require('fs'),c=require('crypto');const m=fs.readFileSync('dist/index.html','utf8').match(/<script type=\"importmap\">([\s\S]*?)<\/script>/);console.log('sha256-'+c.createHash('sha256').update(m[1]).digest('base64'))"
const SHARED_DEPS = [
  'react',
  'react-dom',
  'react-router-dom',
  '@tanstack/react-query',
  'zustand',
  'clsx',
  'tailwind-merge',
];

export function importmapPlugin(): Plugin {
  let isDev = false;

  return {
    name: 'vite-plugin-nodeadmin-importmap',
    configResolved(config) {
      isDev = config.command === 'serve';
    },
    transformIndexHtml(html) {
      const imports: Record<string, string> = {};

      for (const dep of SHARED_DEPS) {
        // In development, point to the Vite-transformed entry point.
        // In production, we assume they're served from a specific /shared/ folder
        // OR as bundled chunks. The plan says "Generated importmap JSON embedded in index.html".
        // Let's use a virtual path prefix.
        imports[dep] = isDev ? `/@node-admin-shared/${dep}` : `/shared/${dep}.js`;
      }

      const importmap = { imports };
      const script = `<script type="importmap">${JSON.stringify(importmap, null, 2)}</script>`;

      return html.replace('</head>', `  ${script}\n  </head>`);
    },
    configureServer(server) {
      // In development, handle the /@node-admin-shared/ redirection.
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/@node-admin-shared/')) {
          const dep = req.url.slice('/@node-admin-shared/'.length);
          if (SHARED_DEPS.includes(dep)) {
            // This is a bit tricky. We want to return the ESM of the dependency.
            // Vite handles this internally if we resolve the module path correctly.
            // For now, let's use a simpler approach: redirect to the module path.
            // In Vite 6, it might be something like /node_modules/.vite/deps/react.js?v=...
            // But if we just point to /@node-admin-shared/react, and the browser imports it,
            // we can serve the content of the dependency.
          }
        }
        next();
      });
    },
    resolveId(id) {
      if (id.startsWith('/@node-admin-shared/')) {
        const dep = id.slice('/@node-admin-shared/'.length);
        if (SHARED_DEPS.includes(dep)) {
          return this.resolve(dep);
        }
      }
      return null;
    },
  };
}
