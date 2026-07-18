const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const prettier = require('eslint-plugin-prettier');

module.exports = [
  js.configs.recommended,
  {
    ignores: ['pnp-webassembly-nodes/**/*.js'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['cypress/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    rules: {
      'no-console': 'off',
      'no-underscore-dangle': 'off',
      'import/no-extraneous-dependencies': 'off',
      'react/jsx-props-no-spreading': 'off',
      // Execution-node contracts intentionally expose async methods even when
      // a specific implementation currently resolves synchronously.
      'require-await': 'off',
      'no-return-await': 'error',
      'no-useless-escape': 'off',
      'no-case-declarations': 'off',
      'no-prototype-builtins': 'off',
      'no-empty': 'off',
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  {
    files: ['cypress/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './cypress/tsconfig.json',
      },
    },
    rules: {
      'no-console': 'off',
      'no-underscore-dangle': 'off',
      'import/no-extraneous-dependencies': 'off',
      'react/jsx-props-no-spreading': 'off',
      'require-await': 'error',
      'no-return-await': 'error',
      'no-useless-escape': 'off',
      'no-case-declarations': 'off',
      'no-prototype-builtins': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
