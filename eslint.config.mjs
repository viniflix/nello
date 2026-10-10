import globals from 'globals';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import imports from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';
import { javascriptRules, typescriptRules } from './build/eslint-rules.mjs';

export default [
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
    },
    plugins: { react, 'react-hooks': hooks, 'jsx-a11y': a11y, import: imports },
    settings: { react: { version: 'detect' } },
    rules: javascriptRules,
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: typescriptRules,
  },
  {
    files: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}', 'src/__tests__/**/*.{js,jsx,ts,tsx}'],
    languageOptions: { globals: { ...globals.jest, vi: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/infrastructure/observability/safeLogger.js'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/lib/database.types.ts'],
    rules: { 'no-unused-vars': 'off', '@typescript-eslint/no-unused-vars': 'warn' },
  },
];
