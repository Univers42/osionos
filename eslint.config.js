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
];
