/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vite.ide.config.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE page's own build (ADR-006): served by osionos-node on the IDE origin, never part of the
// app bundle, so the app's entry does not grow with VS Code's client (C12).
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
  root: here('./src/ide-client'),
  base: '/',
  plugins: [vscodeCssAsString()],
  build: { outDir: here('./dist-ide'), emptyOutDir: true, target: 'esnext', chunkSizeWarningLimit: 16_000 },
  worker: { format: 'es' },
  resolve: { alias: { '@xterm/addon-ligatures': here('./src/ide-client/ligaturesStub.ts') } },
  optimizeDeps: { include: ['@codingame/monaco-vscode-api', '@codingame/monaco-vscode-editor-api'] },
});
