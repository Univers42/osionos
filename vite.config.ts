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
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const root = __dirname;

  const env = loadEnv(mode, root, '');
  return {
    root,
    cacheDir: path.resolve(tmpdir(), `track-binocle-osionos-vite-cache-${process.getuid?.() ?? 'user'}`),
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      __OBJECT_DATABASE_DISABLE_WASM__: JSON.stringify(
        env.VITE_OBJECT_DATABASE_DISABLE_WASM === 'true',
      ),
      'import.meta.env.VITE_API_URL': JSON.stringify(
        env.VITE_API_URL ?? '',
      ),
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
          find: '@',
          replacement: path.resolve(root, 'src'),
        },
      ],
    },
    build: {
      outDir: path.resolve(root, 'build'),
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
