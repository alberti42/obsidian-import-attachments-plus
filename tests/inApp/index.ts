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
	new Notice('Running plugin tests…');
	const results = await runAllTests(plugin);

	const failed = results.filter(r => !r.passed);
	for (const r of results) {
		const label = `${r.suite} › ${r.name}`;
		if (r.passed) {
			console.log(`%c PASS %c ${label} (${r.ms.toFixed(0)}ms)`, 'background:#2d7;color:#fff', '');
		} else {
			console.error(`FAIL  ${label}\n${r.error}`);
		}
	}

	new TestResultsModal(plugin, results).open();
	return failed.length === 0;
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
