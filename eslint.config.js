import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Master plan section 3 and security constraint 12: toISOString on a civil
// date is finding H4 / A8 / A10. Only src/domain/dates.ts may use it.
const noToISOString = {
  selector: "CallExpression[callee.property.name='toISOString']",
  message:
    'toISOString() converts to UTC and silently shifts civil dates. Use src/domain/dates.ts.',
};

// Master plan section 3 and storage constraint: one key, one owner.
// no-restricted-globals only matches the bare `localStorage` identifier, so
// `window.localStorage` and `globalThis.localStorage` walk straight past it.
// These two selectors close that bypass; only src/store/persistence.ts is
// exempt. Both rules are restated (never switched off wholesale) in the
// overrides below, so lifting one ban never lifts the other.
const storageMessage = 'Storage is owned by src/store/persistence.ts. Go through the store.';
const noQualifiedLocalStorage = [
  {
    selector: "MemberExpression[object.name='window'][property.name='localStorage']",
    message: storageMessage,
  },
  {
    selector: "MemberExpression[object.name='globalThis'][property.name='localStorage']",
    message: storageMessage,
  },
];

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

      'no-restricted-syntax': ['error', noToISOString, ...noQualifiedLocalStorage],

      'no-restricted-globals': ['error', { name: 'localStorage', message: storageMessage }],

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // The only module allowed to touch Web Storage. The toISOString ban is
    // restated so lifting the storage ban does not also lift that one.
    files: ['src/store/persistence.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': ['error', noToISOString],
    },
  },
  {
    // The only module allowed to call toISOString. The storage selectors are
    // restated so lifting the date ban does not also lift the storage ban.
    files: ['src/domain/dates.ts'],
    rules: { 'no-restricted-syntax': ['error', ...noQualifiedLocalStorage] },
  },
  {
    // eslint.config.js itself is JavaScript and is not in a TypeScript project.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
