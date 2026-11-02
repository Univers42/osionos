/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vite.editor.config.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The page osionos-node serves at /editor/ (devil verdict 2026-11-01 editor on disk). F2 is enforced
// here, by module id: a local file must never reach the page store, the bridge, a language server
// or an AI feature, and the import that would do it stops the build.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

const BANNED = [
  '/src/store/', '/src/features/page-file/', '/features/ide/model/ideSyncEngine', '/features/ide/model/lspMonaco',
  '/features/ide/vfs/bridgeTransport', '/src/features/ai/', '/src/services/', '/src/shared/api/', '/src/entities/',
];

export function bannedEditorModules(moduleIds: readonly string[]): string[] {
  return moduleIds.filter((id) => BANNED.some((banned) => id.includes(banned)));
}

function editorBoundary(): Plugin {
  return {
    name: 'editor-page-f2',
    apply: 'build',
    generateBundle(_options, bundle) {
      const moduleIds = Object.values(bundle).flatMap((output) => (output.type === 'chunk' ? output.moduleIds : []));
      const banned = bannedEditorModules(moduleIds);
      if (banned.length > 0) this.error(`F2: the editor page bundles a banned module:\n${banned.join('\n')}`);
      if (!moduleIds.some((id) => id.includes('/features/ide/ui/WorkspaceExplorer'))) {
        this.error('F2: the explorer is not in the bundle; the check would pass vacuously');
      }
      this.info(`F2: ${moduleIds.length} modules, none banned`);
    },
  };
}

export default defineConfig({
  root: here('./src/editor-client'),
  base: './',
  plugins: [react(), tailwindcss(), editorBoundary()],
  build: { outDir: here('./build/editor'), emptyOutDir: true, target: 'esnext', chunkSizeWarningLimit: 16_000, assetsInlineLimit: 0 },
  resolve: {
    alias: [
      { find: /^@osionos\/ui$/, replacement: path.resolve(here('.'), 'packages/osionos-ui/src/index.ts') },
      { find: /^@osionos\/ui\//, replacement: `${path.resolve(here('.'), 'packages/osionos-ui/src')}/` },
      { find: '@', replacement: path.resolve(here('.'), 'src') },
    ],
  },
});
