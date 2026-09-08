// The community-plugin scanner's own rules, run locally: `npm run lint:obsidian`.
//
// Separate from eslint.config.mjs on purpose. `npm run lint` must stay clean (CLAUDE.md), while
// this set reports findings the plugin keeps deliberately — so those are downgraded to warnings
// here and everything else is an error. The script therefore exits 0 today and fails only when
// something *new* appears, which is what makes it worth running before a release.
//
// The scan is not otherwise reproducible: eslint-plugin-obsidianmd is where the website's warnings
// come from, and Obsidian ships no scanner CLI.
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default tseslint.config(
    {
        ignores: [
            'node_modules/**', 'node_modules.nosync/**', 'dist/**', 'dist-tests/**',
            '**/*.d.ts', 'tests/**', 'esbuild.config.mjs', 'version-bump.mjs',
            'eslint.config.mjs', 'eslint.obsidian.config.mjs',
        ],
    },
    ...obsidianmd.configs.recommended,
    // The recommended set brings typescript-eslint's type-checked rules with it, which fill the
    // report with no-unsafe-* from `require('electron')` being `any`. TypeScript hygiene is
    // eslint.config.mjs's job; this script is about Obsidian's own rules, so turn them off here.
    tseslint.configs.disableTypeChecked,
    {
        files: ['src/**/*.ts'],
        plugins: { '@typescript-eslint': tseslint.plugin },
        languageOptions: { parser: tseslint.parser, parserOptions: { project: 'tsconfig.json' } },
        // Whether a disable directive is needed is judged by eslint.config.mjs, which enables the
        // rules it refers to. Here they would all read as unused.
        linterOptions: { reportUnusedDisableDirectives: 'off' },
        rules: {
            // TypeScript already resolves `process`, `require` and friends; this rule does not
            // know the Node globals and would flag every one of them.
            'no-undef': 'off',
            // Deliberate, and documented in obsidian_plugin_review.md:
            //   C03 — the console sites are the dev tracers and the console-capture feature
            //   C23 — createMockTFile fabricates a TFile for a path not in the vault yet
            // Warnings rather than off, so they stay visible without failing the run.
            'obsidianmd/rule-custom-message': 'warn',
            'obsidianmd/no-tfile-tfolder-cast': 'warn',
            // Misfires on proper nouns — 'File', 'OK', 'Momentjs'. The website's own subset does
            // not report these.
            'obsidianmd/ui/sentence-case': 'warn',
        },
    },
);
