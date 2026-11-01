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

// The desktop terminal page's own build (groot ADR 0038, ADR 0039): VS Code's terminal panel, served
// by the desktop shell at app://terminal/ from the renderer's terminal/ dir, never part of the app
// bundle, so the app's entry does not grow.
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

// A3 (devil amendment 2, T8): nothing on the page runs code on its own. The check reads the bundle's
// module ids, not its minified text, and fails the build when one comes from a banned override. It
// also fails when no module comes from the views override, so a renamed path cannot pass vacuously.
// The extensions override is not on the list: monaco-vscode-api's own initialize() imports and
// registers it on every page (services.js:113), before any override, for the built-in theme
// extensions. Its extension hosts stay off: no worker host without `enableWorkerExtensionHost`, no
// remote one without a remote agent. Banning its modules would fail every build of this library.
const BANNED_OVERRIDES = ['task', 'debug', 'extension-gallery', 'remote-agent', 'scm', 'search'];
const fromOverride = (name: string) => `/@codingame/monaco-vscode-${name}-service-override/`;

function noBannedOverrides(): Plugin {
  return {
    name: 'terminal-page-a3',
    apply: 'build',
    generateBundle(_options, bundle) {
      const moduleIds = Object.values(bundle).flatMap((output) => (output.type === 'chunk' ? output.moduleIds : []));
      const banned = moduleIds.filter((id) => BANNED_OVERRIDES.some((name) => id.includes(fromOverride(name))));
      if (banned.length > 0) this.error(`A3: the terminal page bundles a banned override:\n${banned.join('\n')}`);
      if (!moduleIds.some((id) => id.includes(fromOverride('views')))) {
        this.error('A3: no module of the views override in the bundle; the check would pass vacuously');
      }
      this.info(`A3: ${moduleIds.length} modules, 0 from the task, debug, extension-gallery, remote-agent, scm or search overrides`);
    },
  };
}

export default defineConfig({
  root: here('./src/terminal-client'),
  base: './',
  plugins: [vscodeCssAsString(), noBannedOverrides()],
  // assetsInlineLimit 0: VS Code fetch()es its theme and nls JSON, and the desktop's connect-src
  // refuses data: URLs, which is what Vite makes of any asset under 4 KiB by default.
  build: { outDir: here('./build/terminal'), emptyOutDir: true, target: 'esnext', chunkSizeWarningLimit: 16_000, assetsInlineLimit: 0 },
  worker: { format: 'es' },
  resolve: { alias: { '@xterm/addon-ligatures': here('./src/ide-client/ligaturesStub.ts') } },
  optimizeDeps: { include: ['@codingame/monaco-vscode-api', '@codingame/monaco-vscode-editor-api'] },
});
