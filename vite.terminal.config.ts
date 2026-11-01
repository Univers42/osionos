/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vite.terminal.config.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The desktop terminal page's own build (groot ADR 0038): VS Code's terminal, served by the desktop
// shell at app://osionos/terminal/, never part of the app bundle, so the app's entry does not grow.
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The library ships its CSS as modules it injects itself; Vite must hand them over as strings.
function vscodeCssAsString(): Plugin {
  return {
    name: 'vscode-css-as-string',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, options);
      if (resolved?.id.match(/node_modules\/.*@codingame\/monaco-vscode.*\.css$/)) return { ...resolved, id: `${resolved.id}?inline` };
      return undefined;
    },
  };
}

export default defineConfig({
  root: here('./src/terminal-client'),
  base: './',
  plugins: [vscodeCssAsString()],
  // assetsInlineLimit 0: VS Code fetch()es its theme and nls JSON, and the desktop's connect-src
  // refuses data: URLs, which is what Vite makes of any asset under 4 KiB by default.
  build: { outDir: here('./build/terminal'), emptyOutDir: true, target: 'esnext', chunkSizeWarningLimit: 16_000, assetsInlineLimit: 0 },
  worker: { format: 'es' },
  resolve: { alias: { '@xterm/addon-ligatures': here('./src/ide-client/ligaturesStub.ts') } },
  optimizeDeps: { include: ['@codingame/monaco-vscode-api', '@codingame/monaco-vscode-editor-api'] },
});
