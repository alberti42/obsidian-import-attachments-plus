// tests/inApp/index.ts
//
// Entry point for the in-Obsidian suite. Everything here is compiled in only when
// esbuild is run with the `withTests` mode (`npm run dev:test`), which sets
// INCLUDE_TESTS; in every other build the import is dead and tree-shaken away.

import { Modal, Notice } from 'obsidian';
import ImportAttachments from 'main';
import { runAllTests, TestResult } from './harness';

// Importing a suite is what registers it. Add new files here.
import './suites/strayAttachments';

export async function runPluginTests(plugin: ImportAttachments) {
	new Notice('Running plugin tests — see the developer console');

	let results: TestResult[];
	try {
		results = await runAllTests(plugin);
	} catch (error) {
		// Without this, a throw inside the harness itself disappears into the command
		// callback's rejected promise and the user sees nothing at all.
		console.error('[plugin tests] the run itself failed', error);
		new Notice('Plugin tests could not run — see the developer console');
		return false;
	}

	const failed = results.filter(r => !r.passed).length;
	new Notice(failed === 0
		? `Plugin tests: ${results.length} passed`
		: `Plugin tests: ${failed} of ${results.length} FAILED`);

	new TestResultsModal(plugin, results).open();
	return failed === 0;
}

class TestResultsModal extends Modal {
	constructor(private plugin: ImportAttachments, private results: TestResult[]) {
		super(plugin.app);
	}

	onOpen() {
		const { contentEl } = this;
		const passed = this.results.filter(r => r.passed).length;
		const failed = this.results.length - passed;

		contentEl.createEl('h4', { text: `Plugin tests — ${passed} passed, ${failed} failed` });
		if (failed > 0) {
			contentEl.createEl('p', { text: 'Full stack traces are in the developer console.' });
		}

		const list = contentEl.createEl('ul');
		for (const r of this.results) {
			const li = list.createEl('li', { text: `${r.passed ? '✓' : '✗'} ${r.suite} › ${r.name}` });
			if (!r.passed) {
				li.createEl('pre', { text: r.error ?? '' });
			}
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
