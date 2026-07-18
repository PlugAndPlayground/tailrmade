const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tseslint,
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
      // Only focus on floating promises for this check
      '@typescript-eslint/no-floating-promises': 'error',

      // Turn off other rules to avoid noise
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'require-await': 'off',
      'no-empty': 'off',

      // Turn off all other rules by default
      'no-console': 'off',
      'no-debugger': 'off',
      'no-alert': 'off',
      'no-eval': 'off',
      'no-implied-eval': 'off',
      'no-new-func': 'off',
      'no-script-url': 'off',
      'no-void': 'off',
      'no-with': 'off',
    },
  },
];
