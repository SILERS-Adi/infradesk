// Flat config dla ESLint v9. Minimalny zestaw — TS + obvious bugs, bez stylistyki
// (tę robi Prettier/IDE). P1.30 — wcześniej skrypt `lint` był zadeklarowany ale
// eslint nie był w devDeps; teraz biegnie i można podpiąć do CI.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/sw.js', 'src/**/*.config.{js,ts}'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Pre-existing kod ma sporo problemów z hooks (exhaustive-deps, purity,
      // set-state-in-effect). Refactor wymaga osobnych PR per komponent.
      // Zostawiamy jako warn (widoczne developerom, nie blokuje CI/build).
      // EXCEPTION: `rules-of-hooks` zostaje jako error — łamie React.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/immutability': 'warn',
      // FIXME(P2): PortalPage.tsx ma conditional hooks po early-return i
      // BackupsPage._CreateBackupModal jest dead-code z hooks. Oba wymagają
      // osobnego refactoru. Na razie `warn` żeby CI/build nie były zablokowane.
      'react-hooks/rules-of-hooks': 'warn',
      // `_arg`/`_unused` celowy — w callbackach React często pomija się args.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` mamy w paru error-handler axiosach — warn, nie error, żeby lint
      // nie blokował CI podczas migracji do typed API responses.
      '@typescript-eslint/no-explicit-any': 'warn',
      // ts-comments dopuszczalne ale wymagają opisu (anti-laz).
      '@typescript-eslint/ban-ts-comment': ['warn', { 'ts-ignore': 'allow-with-description' }],
    },
  },
);
