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

// The same ban for the per-tab store. sessionStorage has exactly one sanctioned
// writer: src/store/sessionMirror.ts owns the session slice's mirror.
// Nothing else, tests included: a test that named the
// global would be indistinguishable from application code doing the same thing,
// which is the argument src/store/testStorage.ts already makes for localStorage.
// Seed and read a raw key through installFakeStorage()'s returned Map instead.
const sessionStorageMessage =
  'sessionStorage is owned by src/store/sessionMirror.ts. Go through the store.';
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

// Spec R13: IndexedDB has two owners. The record engine (src/store/db/) and the motivation clip
// store (src/domain/motivation/assets.ts). The bare global, its qualified forms and the `idb`
// wrapper are banned everywhere else; test files may open a database to seed or inspect one.
const indexedDbMessage =
  'IndexedDB is owned by src/store/db/ (records) and src/domain/motivation/assets.ts (the clip). Go through the store.';
const noQualifiedIndexedDb = [
  {
    selector: "MemberExpression[object.name='window'][property.name='indexedDB']",
    message: indexedDbMessage,
  },
  {
    selector: "MemberExpression[object.name='globalThis'][property.name='indexedDB']",
    message: indexedDbMessage,
  },
];
const noIdbImport = ['error', { paths: [{ name: 'idb', message: indexedDbMessage }] }];

/** The bare-identifier bans, restated wherever an override lifts one of them. */
const restrictedGlobals = [
  { name: 'localStorage', message: storageMessage },
  { name: 'sessionStorage', message: sessionStorageMessage },
  { name: 'indexedDB', message: indexedDbMessage },
];

export default tseslint.config(
  {
    /*
     * `.claude/**` holds the agent worktrees, which are FULL COPIES of this tree. Without it,
     * `npm run lint` at the repo root lints every worktree as well as the real source, and the
     * copies fail in a way the real tree does not: their `worker/` has no `node_modules` (CI runs
     * `npm ci --prefix worker`, a local worktree does not), so the type-aware rules resolve every
     * worker import to `any` and emit 24 `no-unsafe-*` errors per worktree. Measured 2026-09-09:
     * two worktrees produced 48 phantom errors while `eslint ./src ./scripts` and `eslint worker/`
     * were both clean. CI never saw them because it checks out a tree with no worktrees in it.
     */
    ignores: ['dist/**', 'dev-dist/**', 'coverage/**', 'node_modules/**', '.claude/**'],
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
        ...noQualifiedIndexedDb,
      ],

      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-restricted-imports': noIdbImport,

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
      'no-restricted-globals': [
        'error',
        { name: 'sessionStorage', message: sessionStorageMessage },
        { name: 'indexedDB', message: indexedDbMessage },
      ],
      'no-restricted-syntax': ['error', noToISOString, ...noQualifiedSessionStorage, ...noQualifiedIndexedDb],
    },
  },
  {
    // The only module allowed to touch sessionStorage.
    // The localStorage ban and the date ban are restated for the same reason.
    files: ['src/store/sessionMirror.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: storageMessage },
        { name: 'indexedDB', message: indexedDbMessage },
      ],
      'no-restricted-syntax': ['error', noToISOString, ...noQualifiedLocalStorage, ...noQualifiedIndexedDb],
    },
  },
  {
    // The only module allowed to call toISOString. The storage selectors are
    // restated so lifting the date ban does not also lift the storage bans.
    files: ['src/domain/dates.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...noQualifiedLocalStorage,
        ...noQualifiedSessionStorage,
        ...noQualifiedIndexedDb,
      ],
    },
  },
  {
    // Spec R13: the two IndexedDB owners, and test files (which swap in a fake-indexeddb
    // factory and may open a database to seed or inspect it). Only the IndexedDB ban is lifted;
    // the Web Storage and date bans are restated.
    files: [
      'src/store/db/**/*.ts',
      'src/domain/motivation/assets.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: storageMessage },
        { name: 'sessionStorage', message: sessionStorageMessage },
      ],
      'no-restricted-syntax': [
        'error',
        noToISOString,
        ...noQualifiedLocalStorage,
        ...noQualifiedSessionStorage,
      ],
      'no-restricted-imports': 'off',
    },
  },
  {
    // e2e/ drives the built app from outside. Its page.evaluate callbacks run in the browser
    // under test and seed or read fti.v3 there; that is a harness, not application code, so the
    // storage bans are lifted for it alone. The toISOString ban stays.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': ['error', noToISOString],
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
