// ESLint flat config for pulse

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const importPlugin = require('eslint-plugin-import');
const boundariesPlugin = require('eslint-plugin-boundaries');
const unusedImports = require('eslint-plugin-unused-imports');
const reactHooks = require('eslint-plugin-react-hooks');

// Custom project-specific rules
const pulse = {
  rules: {
    'file-naming': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Enforce naming conventions for services (*.service.ts) and utils (*.util.ts) under features/',
        },
        schema: [],
      },
      create(context) {
        const filename = context.getFilename();

        // Only enforce within this repo (skip virtual ESLint filenames)
        if (!filename.includes('/features/')) {
          return {};
        }

        // Test files live under services/ and utils/ but are not service/util
        // modules — they cannot (and must not) be renamed to *.service.ts /
        // *.util.ts, so the naming convention does not apply to them.
        if (
          /(^|\/)__tests__\//.test(filename) ||
          /\.(test|spec)\.[jt]sx?$/.test(filename)
        ) {
          return {};
        }

        const isService = filename.includes('/services/');
        const isUtil = filename.includes('/utils/');

        // Accept the project's recognized typed-module suffixes (they each
        // communicate the module's role). Genuine offenders — plain `.ts`
        // files or camelCase names like `fooService.ts` — still flag.
        //   services/: *.service.ts, *.storage.ts (persistence modules)
        //   utils/:    *.util.ts, *.util.tsx (JSX helpers), *.model.ts
        const serviceOk = /\.(service|storage)\.ts$/.test(filename);
        const utilOk = /\.(util\.tsx?|model\.ts)$/.test(filename);

        if (isService && !serviceOk) {
          context.report({
            loc: { line: 1, column: 0 },
            message:
              'Service files under features/*/services/ must use a typed suffix: *.service.ts (or *.storage.ts).',
          });
        }

        if (isUtil && !utilOk) {
          context.report({
            loc: { line: 1, column: 0 },
            message:
              'Utility files under features/*/utils/ must use a typed suffix: *.util.ts / *.util.tsx (or *.model.ts).',
          });
        }

        return {};
      },
    },
  },
};

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    // Global ignores — exclude build artifacts, caches, and third-party code.
    // Use **/dist and **/build so nested build outputs (analytics/dist,
    // tools/db-audit/dist) are excluded too, not just the repo-root dist.
    ignores: [
      'node_modules/**',
      '**/dist/**',
      '**/build/**',
      'dist-test-bundle/**',
      '.expo/**',
      '.metro-cache/**',
      'playwright-report/**',
      'data-analytics/**',
      'apps/web/**',
      'packages/*/node_modules/**',
      // Non-shipping scratch/reference material — already excluded from tsconfig,
      // imported by nothing in app/features/lib/components.
      '_reference/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      'unused-imports': unusedImports,
      'react-hooks': reactHooks,
      pulse,
    },
    rules: {
      // Basic recommended TypeScript rules
      ...tsPlugin.configs.recommended.rules,

      // Delegate unused detection to unused-imports: it auto-fixes dead imports
      // and honors the _-prefix convention for intentionally-unused vars/args.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['error', {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Metro resolves static asset requires (fonts, images, JSON, Lottie) — this
      // is the idiomatic RN pattern, not a CommonJS smell. Allow require() only for
      // those asset targets; genuine module requires still flag.
      '@typescript-eslint/no-require-imports': ['error', {
        allow: ['\\.(png|jpg|jpeg|gif|webp|svg|ttf|otf|woff2?|mp4|lottie|json)$'],
      }],

      // React Hooks safety net, registered so inline disable-directives resolve and
      // new code is checked. Both are `warn` (not error) for now: the codebase has
      // pre-existing findings (deps arrays + apparent conditional-hook patterns,
      // some of which are v7 false positives around _use*-prefixed helpers) that
      // must be triaged individually before this can be promoted to `error`.
      // TODO(hardening): triage react-hooks findings, then flip rules-of-hooks to error.
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',

      // Enforce feature-level file naming for services and utils
      'pulse/file-naming': 'error',

      // Enforce architectural dependency direction:
      // app -> features -> lib
      // - features cannot import from app
      // - lib cannot import from app or features
      // - features domains cannot import from other feature domains
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // features -> app (disallow)
            {
              target: './app',
              from: './features',
            },
            // lib -> app (disallow)
            {
              target: './app',
              from: './lib',
            },
            // lib -> features (disallow)
            {
              target: './features',
              from: './lib',
            },
            // Cross-feature imports (each feature folder blocked from importing others)
            {
              target: './features/clients',
              from: './features',
            },
            {
              target: './features/suppliers',
              from: './features',
            },
            {
              target: './features/vehicles',
              from: './features',
            },
            {
              target: './features/trips',
              from: './features',
            },
            {
              target: './features/finance',
              from: './features',
            },
            {
              target: './features/drivers',
              from: './features',
            },
            {
              target: './features/indents',
              from: './features',
            },
            {
              target: './features/organization',
              from: './features',
            },
            {
              target: './features/auth',
              from: './features',
            },
          ],
        },
      ],
    },
  },
  // Architecture boundary enforcement
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries: boundariesPlugin },
    settings: {
      'boundaries/elements': [
        { type: 'app',       pattern: 'app/**/*' },
        { type: 'feature',   pattern: 'features/**/*' },
        { type: 'lib',       pattern: 'lib/**/*' },
        { type: 'ui',        pattern: 'components/**/*' },
        { type: 'context',   pattern: 'contexts/**/*' },
        { type: 'constants', pattern: 'constants/**/*' },
        { type: 'types',     pattern: 'types/**/*' },
      ],
      'boundaries/ignore': ['**/*.d.ts'],
    },
    rules: {
      // lib must not import from features (prevents inverted dependencies)
      'boundaries/dependencies': ['warn', {
        default: 'allow',
        rules: [
          {
            from: ['lib'],
            disallow: ['feature'],
            message: 'lib/ must not import from features/ — move shared logic to lib/ or invert the dep.',
          },
          {
            from: ['ui'],
            disallow: ['feature'],
            message: 'Shared components/ must not import from features/ — pass data via props instead.',
          },
        ],
      }],
    },
  },
  // Ban feature barrel imports from app/, contexts/, components/.
  // Import from a specific sub-path (e.g. '@/features/finance/services/finance.service').
  // Barrel imports drag screen/tab components into callers' bundles.
  // Uses regex (not glob group) because ESLint v9 uses gitignore-style matching
  // which treats 'a/b' as a directory pattern matching 'a/b/...'.
  {
    files: ['app/**/*.{ts,tsx}', 'contexts/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/features/[^/]+$',
              message: "Import from the specific sub-path (e.g. '@/features/finance/services/finance.service'), not the barrel index.",
            },
          ],
        },
      ],
    },
  },
  // Config, build, and Node script files legitimately use CommonJS require().
  // NOTE: bare '*.js' only matches repo-root files in flat config, so nested
  // Node/tooling dirs (tools/, polyfills/, jest __mocks__) are listed explicitly.
  {
    files: [
      '*.js',
      '*.cjs',
      '**/*.config.js',
      'metro.config.js',
      'scripts/**/*.{js,ts}',
      'tools/**/*.{js,cjs,ts}',
      'polyfills/**/*.{js,cjs}',
      '**/__mocks__/**/*.{js,ts}',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Map implementation registry — the one sanctioned place for deferred module
  // loading. Expo Go and standalone builds share a platform and a bundle, so no
  // platform extension can split them; each map stack throws at import time in
  // the other environment, so selection must be a lazy runtime require. Confined
  // to these loader files instead of inline disables at call sites.
  // See lib/maps/mapEnvironment.ts for the full rationale.
  {
    files: ['lib/maps/*Implementation.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Supabase Edge Functions run on Deno, where the `/// <reference .../>` type
  // directive is the idiomatic way to load ambient types — not a code smell.
  {
    files: ['supabase/functions/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
  // Jest hoists `jest.mock()` factories above the import block, so a factory
  // cannot close over an ESM import — `require()` inside it is the documented
  // pattern, not a lapse. Same for pulling a module in mid-test to observe a
  // fresh module registry.
  {
    files: [
      '**/__tests__/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

