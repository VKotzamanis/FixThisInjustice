import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'dev-dist/**', 'coverage/**', 'legacy/**', 'node_modules/**', 'scripts/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks.configs.flat['recommended-latest'].plugins['react-hooks'],
    },
    rules: {
      // Master plan section 3: a swallowed storage failure is finding H3 / A42.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // Master plan section 3 and security constraint 12: toISOString on a civil
      // date is finding H4 / A8 / A10. Only src/domain/dates.ts may use it.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toISOString']",
          message:
            'toISOString() converts to UTC and silently shifts civil dates. Use src/domain/dates.ts.',
        },
      ],

      // Master plan section 3 and storage constraint: one key, one owner.
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'Storage is owned by src/store/persistence.ts. Go through the store.',
        },
      ],

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // The only module allowed to touch Web Storage.
    files: ['src/store/persistence.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // The only module allowed to call toISOString.
    files: ['src/domain/dates.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // eslint.config.js itself is JavaScript and is not in a TypeScript project.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
