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

// The same ban for the per-tab store. sessionStorage has exactly two sanctioned
// writers: src/store/sessionMirror.ts owns the session slice's mirror, and
// src/ui/components/ReadinessNotice.tsx owns the per-tab dismissal of the
// physician-consult notice. Nothing else, tests included: a test that named the
// global would be indistinguishable from application code doing the same thing,
// which is the argument src/store/testStorage.ts already makes for localStorage.
// Seed and read a raw key through installFakeStorage()'s returned Map instead.
const sessionStorageMessage =
  'sessionStorage is owned by src/store/sessionMirror.ts (and the readiness notice). Go through the store.';
const noQualifiedSessionStorage = [
  {
    selector: "MemberExpression[object.name='window'][property.name='sessionStorage']",
    message: sessionStorageMessage,
  },
  {
    selector: "MemberExpression[object.name='globalThis'][property.name='sessionStorage']",
    message: sessionStorageMessage,
  },
];

/** The bare-identifier bans, restated wherever an override lifts one of them. */
const restrictedGlobals = [
  { name: 'localStorage', message: storageMessage },
  { name: 'sessionStorage', message: sessionStorageMessage },
];

export default tseslint.config(
  {
    ignores: ['dist/**', 'dev-dist/**', 'coverage/**', 'node_modules/**'],
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

      'no-restricted-syntax': [
        'error',
        noToISOString,
        ...noQualifiedLocalStorage,
        ...noQualifiedSessionStorage,
      ],

      'no-restricted-globals': ['error', ...restrictedGlobals],

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // The only module allowed to touch localStorage. Every other ban is restated
    // so lifting this one does not also lift them: persistence.ts owns the
    // document's key, not the per-tab mirror.
    files: ['src/store/persistence.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'sessionStorage', message: sessionStorageMessage }],
      'no-restricted-syntax': ['error', noToISOString, ...noQualifiedSessionStorage],
    },
  },
  {
    // The only two modules allowed to touch sessionStorage (P4 polish, item 5).
    // The localStorage ban and the date ban are restated for the same reason.
    files: ['src/store/sessionMirror.ts', 'src/ui/components/ReadinessNotice.tsx'],
    rules: {
      'no-restricted-globals': ['error', { name: 'localStorage', message: storageMessage }],
      'no-restricted-syntax': ['error', noToISOString, ...noQualifiedLocalStorage],
    },
  },
  {
    // The only module allowed to call toISOString. The storage selectors are
    // restated so lifting the date ban does not also lift the storage bans.
    files: ['src/domain/dates.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...noQualifiedLocalStorage, ...noQualifiedSessionStorage],
    },
  },
  {
    // eslint.config.js itself is JavaScript and is not in a TypeScript project.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Node-run build/codegen scripts: no browser globals, no TS project.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
);
