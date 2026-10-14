/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   eslint.config.js                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import js from "@eslint/js";
import ts from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

// Style-literal guards. Each pattern lives in one named constant and is spliced
// into an esquery selector, which cannot hold a "/" inside a regex: write it \x2f.
// A class-token pattern opens with (^|[\s:!]) so only whole tokens match, with
// or without a variant prefix.
//
// Ponytail: every pattern matches string TEXT, not a class list. A class name
// built by concatenation ("sha" + "dow-md") or from a variable escapes it, and a
// non-colour string such as "#abc", or prose holding the lowercase word "shadow",
// is flagged. A string that is only "rounded" inside a type position is skipped.
// The escape hatch is HEX_ALLOWLIST below, or an eslint-disable with an issue link.
const PX_FONT_SIZE = String.raw`(^|[\s:!])text-\[[0-9.]+px\]`;
const STOCK_SHADOW = String.raw`(^|[\s:!])shadow(-(sm|md|lg|xl|2xl))?(\x2f[0-9]+)?($|[\s!])`;
const BARE_ROUNDED = String.raw`(^|[\s:!])rounded($|[\s!])`;
const HEX_COLOR = String.raw`(?<![\w&])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w])`;
const RAMP_TOKEN = String.raw`--osio-(n-[0-9]+|a-[a-z]+)`;

/** One restricted-syntax entry per string kind: plain literals and template text. */
const bannedText = (pattern, message) => [
  { selector: `:not(TSLiteralType) > Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
];

const CLASS_RULES = [
  ...bannedText(PX_FONT_SIZE, "Literal px font size in a class. Use text-3xs (10), text-2xs (11), text-xs (12), text-sm (14) or text-display."),
  ...bannedText(STOCK_SHADOW, "Stock Tailwind shadow. Use shadow-osio-e1 .. shadow-osio-e5 (sm/bare = e1, md = e2, lg = e3, xl = e4, 2xl = e5)."),
  ...bannedText(BARE_ROUNDED, "Bare rounded class. Use rounded-xs/sm/md/lg (radius tokens), osio-chip for tags, or osio-surface-overlay for panels."),
  ...bannedText(RAMP_TOKEN, "Ramp token in a component. Use a semantic token (--osio-bg-*, --osio-fg-*, --osio-accent-*); ramps are for src/app/styles only."),
];
const HEX_RULE = bannedText(HEX_COLOR, "Raw hex colour. Use a semantic --osio-* token, or add the file to HEX_ALLOWLIST with its reason.");

// Files whose hex values are data, not styling: a brand colour, a catalog entry,
// or a place that needs a concrete colour (canvas, xterm, <input type=color>, an
// exported document that cannot read the app's tokens).
const HEX_ALLOWLIST = [
  "src/features/settings/connections/connectionsCatalog.tsx", // third-party brand colours
  "src/features/settings/mcp/mcpCatalog.tsx", // third-party brand colours
  "src/features/ide/model/ideLanguages.ts", // per-language brand colours
  "src/shared/ui/assets/uiCollectionAssets.ts", // colours baked into inline SVG assets
  "src/features/page-export/model/exportTheme.ts", // the exported HTML cannot read app tokens
  "src/features/page-export/model/exportHtml.ts", // same: the exported document ships its own colours
  "src/shared/config/*.generated.ts", // emitted by scripts/build-tokens.mjs
  "packages/osionos-ui/src/molecules/IconPicker/ColorSwatches.tsx", // the swatches ARE the user-selectable colours
  "src/features/auth/ui/Portal.tsx", // the product logo's brand blue
  "src/data/seedUserPages.ts", // seed page content that quotes CSS as text
  "src/entities/block/ui/CodeBlockReadOnly.tsx", // macOS window-control dots: fixed by the platform, not themed
  "src/features/block-editor/model/blockColors.ts", // contrast maths needs concrete text colours
  "src/features/block-editor/model/inlineIconInsert.ts", // an SVG data URI cannot read page tokens
  "src/features/block-editor/ui/BlockContextMenu.tsx", // <input type=color> accepts only #rrggbb
  "src/features/block-editor/ui/canvas/layout.constants.ts", // canvas card tint catalog
  "src/features/block-editor/ui/canvas/view/CanvasInspector.tsx", // canvas card tint catalog
  "src/features/block-editor/ui/canvas/view/CanvasToolbarExtras.tsx", // canvas card tint catalog
  "src/widgets/database-view/model/databaseViewShowcase.ts", // showcase tint catalog
  "src/widgets/page-renderer/ui/MainContent.tsx", // the home dashboard's cover gradient hues
  "src/shared/debug/PageDebugOverlay.tsx", // debug-only overlay, not product UI
  "src/shared/lib/color/resolveCssColor.ts", // canvas probe: needs concrete sentinel colours
  "src/features/ide/ui/IdeTerminal.tsx", // xterm's theme object takes a concrete colour
  "src/widgets/draw-canvas/model/useResolvedDrawChrome.ts", // drawing ink is stored data, not theme
  "src/widgets/draw-canvas/ui/DrawInspector.tsx", // drawing ink swatches are stored data, not theme
  "src/widgets/draw-canvas/ui/DrawInspectorControls.tsx", // drawing ink is stored data, not theme
];

export default [
  {
    ignores: [
      "packages/markdown-engine/**/*",
      "src/shared/notion-database-sys/**/*",
      "src/shared/notion-database-sys/packages/**/*",
      "src/shared/notion-database-sys/playground/**/*",
      "src/shared/notion-database-sys/vendor/**/*",
      "dist",
      "build",
      "node_modules",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // No necesario en React 17+
      // TypeScript already validates component props at compile time, so the
      // runtime-era prop-types rule is redundant noise (and can't read
      // forwardRef<T, Props> generics, producing false positives).
      "react/prop-types": "off",
      "@typescript-eslint/no-explicit-any": "warn", // Evitar 'any' según GEMINI.md
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ], // Regla de prefijo '_'
    },
    settings: {
      react: { version: "detect" },
    },
  },
  {
    // Import firewall: @osionos/legacy-graph-engine core must stay decoupled and
    // framework-agnostic. Data comes in via GraphModel; React lives in src/react/.
    files: ["packages/legacy-graph-engine/src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*"],
              message:
                "graph-engine core must not import host-app code (@/...). Pass data in via GraphModel.",
            },
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "graph-engine core must be framework-agnostic. Keep React in packages/legacy-graph-engine/src/react/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Import firewall: @osionos/draw-engine core stays decoupled and
    // framework-agnostic. Scene data comes in via the engine facade; React lives
    // in packages/draw-engine/src/react/.
    files: ["packages/draw-engine/src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*"],
              message:
                "draw-engine core must not import host-app code (@/...). Pass data in via the engine facade.",
            },
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "draw-engine core must be framework-agnostic. Keep React in packages/draw-engine/src/react/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Package-owned node tooling (token-contract checks and the like). These run
    // under plain node, not in the browser bundle, so they need node globals.
    files: ["packages/*/scripts/**/*.{mjs,cjs,js}"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
  {
    // Import firewall: @osionos/ui is a standalone repo consumed by alias. An
    // "@/..." import resolves fine HERE and breaks the moment the package is
    // built on its own, so it must fail in this repo, where it is introduced.
    files: ["packages/osionos-ui/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*"],
              message:
                "@osionos/ui must not import host-app code (@/...). Move the shared piece into the package, or take it as a prop.",
            },
          ],
        },
      ],
    },
  },
  {
    // Import firewall: @osionos/http-gate is transport-only. It must resolve
    // nothing from the app, and React must stay behind the ./react entry so the
    // root barrel stays loadable by node --experimental-strip-types.
    files: ["packages/http-gate/src/**/*.ts"],
    ignores: ["packages/http-gate/src/react.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*"],
              message:
                "@osionos/http-gate must not import host-app code (@/...). Take configuration as an argument instead.",
            },
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "Keep React in packages/http-gate/src/react.ts — the root entry must stay type-strippable.",
            },
          ],
        },
      ],
    },
  },
  {
    // Style-literal guards for component code. Allowlisted files drop only the hex rule.
    files: ["src/**/*.{ts,tsx}", "packages/osionos-ui/src/**/*.{ts,tsx}"],
    ignores: HEX_ALLOWLIST,
    rules: { "no-restricted-syntax": ["error", ...CLASS_RULES, ...HEX_RULE] },
  },
  {
    files: HEX_ALLOWLIST,
    rules: { "no-restricted-syntax": ["error", ...CLASS_RULES] },
  },
];
