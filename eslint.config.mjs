// ESLint flat config (ESLint >= 9). Two traps are already paid for here:
//
//  - the former .eslintrc-style object exported from this file was silently ignored, so linting
//    was a no-op for a long time. Keep it in flat format.
//  - the file is `.mjs`, not `.js`, so it is ESM regardless of package.json having no
//    `"type": "module"`. After any change here, run `npm run lint` and check that it still
//    reports on **both** src and tests — 23 files at the time of writing (13 + 10).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['node_modules/**', 'node_modules.nosync/**', 'dist/**', 'coverage/**', '**/*.d.ts']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'tsconfig.json',
                sourceType: 'module'
            }
        },
        rules: {
            // The former `^I[A-Z]` interface-prefix requirement was violated by every
            // interface in the codebase; PascalCase is what the code actually follows.
            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                    // Legacy settings shapes carry a version suffix, e.g. `..._1_3_0`.
                    filter: { regex: '_\\d+(_\\d+)*$', match: false }
                }
            ],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { args: 'none', varsIgnorePattern: '^_+$' }
            ],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-namespace': 'off',
            '@typescript-eslint/no-use-before-define': 'off',
            // typescript-eslint v8 dropped its formatting rules; use the core rule.
            quotes: [
                'error',
                'single',
                { avoidEscape: true, allowTemplateLiterals: false }
            ],
            curly: ['error', 'all'],
            eqeqeq: 'error',
            'prefer-arrow-callback': 'error',
            // The only two type-aware rules enabled, and they earn it: every user-visible bug
            // the 1.6.3 review turned up was a promise nobody handled — a delete that trashed
            // the file and then silently skipped everything after it. They are free: `project`
            // above was already building the TypeScript program for naming-convention, so these
            // reuse it. Measured over two runs each, `npm run lint` is ~1.7 s either way.
            // Discard a promise deliberately with `void`; if its failure matters to the user,
            // route it through Utils.reportFailure.
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            // Also type-aware, and also free. Event callbacks are arrow-function class
            // properties, so passing `this.some_cb` to workspace.on() is safe *and* keeps the
            // stable identity that off() needs. The four legitimate exceptions are the
            // monkey-patch save/restore sites in patch*.ts, each disabled with its reason.
            '@typescript-eslint/unbound-method': 'error'
        }
    }
);
