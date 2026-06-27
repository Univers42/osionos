/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vite.config.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:26 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:26 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

// Dependency-free bundle analyzer: with ANALYZE=1, emit a per-chunk module-size
// breakdown to build/stats-chunks.json so we can see what inflates the warm
// entry chunk. Inert (and excluded from the served bundle) without the flag.
function bundleAnalyzer() {
  return {
    name: 'osionos-bundle-analyzer',
    apply: 'build' as const,
    generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName?: string; code?: string; modules?: Record<string, { renderedLength: number }> }>) {
      if (!process.env.ANALYZE) return;
      const chunks = Object.values(bundle)
        .filter((c) => c.type === 'chunk')
        .map((c) => {
          const mods = Object.entries(c.modules ?? {})
            .map(([id, m]) => ({ id: id.replace(process.cwd(), ''), bytes: m.renderedLength }))
            .sort((a, b) => b.bytes - a.bytes);
          return { name: c.fileName ?? '?', size: c.code?.length ?? 0, mods: mods.slice(0, 25) };
        })
        .sort((a, b) => b.size - a.size);
      writeFileSync(path.resolve(__dirname, 'build/stats-chunks.json'), JSON.stringify(chunks, null, 2));
    },
  };
}

export default defineConfig(({ mode }) => {
  const root = __dirname;

  const env = loadEnv(mode, root, '');
  return {
    root,
    cacheDir: path.resolve(tmpdir(), `track-binocle-osionos-vite-cache-${process.getuid?.() ?? 'user'}`),
    plugins: [
      react(),
      tailwindcss(),
      bundleAnalyzer(),
    ],
    define: {
      __OBJECT_DATABASE_DISABLE_WASM__: JSON.stringify(
        env.VITE_OBJECT_DATABASE_DISABLE_WASM === 'true',
      ),
      'import.meta.env.VITE_API_URL': JSON.stringify(
        env.VITE_API_URL ?? '',
      ),
      'import.meta.env.VITE_AUTH_MODE': JSON.stringify(env.VITE_AUTH_MODE ?? ''),
      'import.meta.env.VITE_REQUIRE_BRIDGE_SESSION': JSON.stringify(env.VITE_REQUIRE_BRIDGE_SESSION ?? ''),
      'import.meta.env.VITE_ALLOW_OFFLINE_MODE': JSON.stringify(env.VITE_ALLOW_OFFLINE_MODE ?? ''),
      'import.meta.env.VITE_BAAS_URL': JSON.stringify(env.VITE_BAAS_URL ?? ''),
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: [
        {
          find: /^@notion-db\/object-database$/,
          replacement: path.resolve(root, 'src/shared/notion-database-sys/src/component/index.ts'),
        },
        {
          find: /^@notion-db\/object-database\/theme\.css$/,
          replacement: path.resolve(root, 'src/shared/notion-database-sys/src/index.css'),
        },
        {
          find: /^@notion-db\/object-database\/styles\.css$/,
          replacement: path.resolve(root, 'src/shared/notion-database-sys/src/index.css'),
        },
        {
          find: /^@notion-db\/contract-types$/,
          replacement: path.resolve(root, 'src/shared/notion-database-sys/packages/contract-types/src/index.ts'),
        },
        {
          find: /^@osionos\/graph-engine$/,
          replacement: path.resolve(root, 'packages/graph-engine/src/index.ts'),
        },
        {
          find: /^@osionos\/graph-engine\//,
          replacement: `${path.resolve(root, 'packages/graph-engine/src')}/`,
        },
        {
          find: '@',
          replacement: path.resolve(root, 'src'),
        },
      ],
    },
    build: {
      outDir: path.resolve(root, 'build'),
      // No sourceMappingURL comments in the served prod bundle: Dockerfile.prod
      // strips the .map files, so a reference makes the browser fetch them and
      // get the SPA index.html fallback ("JSON.parse: unexpected character").
      sourcemap: false,
      rollupOptions: {
        output: {
          // Split the big, stable vendors into their own chunks so they cache
          // across deploys and download in parallel with the app entry instead
          // of inflating it. react-dom dominates; keep the React runtime together.
          manualChunks(id) {
            // Peel the large NDS icon registries (~125KB of app data) out of the
            // warm entry so they download in parallel instead of inflating it.
            if (/notion-database-sys[/\\].*[/\\]iconRegistry[AB]?\.ts$/.test(id)) return 'vendor-icon-registry';
            if (!id.includes('node_modules')) return undefined;
            if (/[/\\](react|react-dom|scheduler|use-sync-external-store)[/\\]/.test(id)) return 'vendor-react';
            if (/[/\\](motion|framer-motion|motion-dom)[/\\]/.test(id)) return 'vendor-motion';
            if (id.includes('@univers42')) return 'vendor-ui-collection';
            if (/[/\\]date-fns[/\\]/.test(id)) return 'vendor-date-fns';
            if (/[/\\]@tanstack[/\\]/.test(id)) return 'vendor-tanstack';
            return undefined;
          },
        },
      },
    },
    optimizeDeps: {
      entries: ['index.html'],
    },
    server: {
      port: 3001,
      host: '0.0.0.0',
      allowedHosts: ['localhost', '127.0.0.1', 'playground'],
      watch: {
        usePolling: true,
      },
    },
  };
});
