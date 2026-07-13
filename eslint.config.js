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

export default [
  {
    ignores: [
      "src/shared/lib/markengine/**/*",
      "src/shared/lib/markengine/dist/**/*",
      "src/shared/lib/markengine/playground/public/dist/**/*",
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
    // Import firewall: @osionos/graph-engine core must stay decoupled and
    // framework-agnostic. Data comes in via GraphModel; React lives in src/react/.
    files: ["packages/graph-engine/src/core/**/*.{ts,tsx}"],
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
                "graph-engine core must be framework-agnostic. Keep React in packages/graph-engine/src/react/.",
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
];
