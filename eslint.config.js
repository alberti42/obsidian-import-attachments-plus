// ESLint flat config (ESLint >= 9). The former .eslintrc-style object exported from this
// same filename was silently ignored, so linting was a no-op; keep this file in flat format.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
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
            'prefer-arrow-callback': 'error'
        }
    }
);
