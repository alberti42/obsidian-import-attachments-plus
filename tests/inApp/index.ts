// tests/inApp/index.ts
//
// Entry point for the in-Obsidian suite. Everything here is compiled in only when
// esbuild is run with the `withTests` mode (`npm run dev:test`), which sets
// INCLUDE_TESTS; in every other build the import is dead and tree-shaken away.

import { Modal, Notice } from 'obsidian';
import ImportAttachments from 'main';
import { runAllTests, TestResult } from './harness';

// Importing is what registers. Pure specs come from the shared list, so they run here
// against the real Obsidian as well as headlessly against the shim; vault-only suites
// are listed individually below.
import '../shared/specs/index';
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

// This modal exists only in a dev:test build, so its styling lives here with it rather
// than in styles.css, which would ship the rules to users who can never open it.
const MODAL_STYLES = `
.plugin-tests-modal-el {
	width: 75vw;
	max-width: 75vw;
}
.plugin-tests-report {
	user-select: text;
	-webkit-user-select: text;
	cursor: auto;
	max-height: 60vh;
	overflow-y: auto;
}
.plugin-tests-report pre {
	user-select: text;
	-webkit-user-select: text;
	white-space: pre-wrap;
	overflow-x: auto;
	font-size: var(--font-ui-smaller);
	background: var(--background-primary-alt);
	padding: 0.5rem;
	border-radius: var(--radius-s);
}
.plugin-tests-report li { margin-bottom: 0.35rem; }
.plugin-tests-buttons {
	display: flex;
	gap: 0.5rem;
	justify-content: flex-end;
	padding-top: 0.75rem;
}
`;

const STYLE_ELEMENT_ID = 'plugin-tests-styles';

class TestResultsModal extends Modal {
	constructor(private plugin: ImportAttachments, private results: TestResult[]) {
		super(plugin.app);
	}

	/** Plain text, so a failing run can be pasted into an issue or a message. */
	private asText(): string {
		const passed = this.results.filter(r => r.passed).length;
		const lines = [
			`Plugin tests — ${passed} passed, ${this.results.length - passed} failed`,
			'',
		];
		for (const r of this.results) {
			lines.push(`${r.passed ? 'PASS' : 'FAIL'}  ${r.suite} › ${r.name}  (${Math.round(r.ms)}ms)`);
			if (!r.passed && r.error) {
				lines.push(r.error.split('\n').map(l => `      ${l}`).join('\n'));
			}
		}
		return lines.join('\n');
	}

	onOpen() {
		const { contentEl, modalEl } = this;

		if (!document.getElementById(STYLE_ELEMENT_ID)) {
			const style = document.head.createEl('style', { attr: { id: STYLE_ELEMENT_ID } });
			style.textContent = MODAL_STYLES;
		}
		modalEl.addClass('plugin-tests-modal-el');

		const passed = this.results.filter(r => r.passed).length;
		const failed = this.results.length - passed;

		contentEl.createEl('h4', { text: `Plugin tests — ${passed} passed, ${failed} failed` });

		const report = contentEl.createDiv({ cls: 'plugin-tests-report' });
		const list = report.createEl('ul');
		for (const r of this.results) {
			const li = list.createEl('li', {
				text: `${r.passed ? '✓' : '✗'} ${r.suite} › ${r.name} (${Math.round(r.ms)}ms)`,
			});
			if (!r.passed) {
				li.createEl('pre', { text: r.error ?? '' });
			}
		}

		const buttons = contentEl.createDiv({ cls: 'plugin-tests-buttons' });
		const copy = buttons.createEl('button', { text: 'Copy report', cls: 'mod-cta' });
		copy.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(this.asText());
				copy.setText('Copied');
				window.setTimeout(() => copy.setText('Copy report'), 1500);
			} catch (error) {
				console.error('[plugin tests] could not write to the clipboard', error);
				new Notice('Could not copy — the report is in the developer console');
				console.log(this.asText());
			}
		});
		buttons.createEl('button', { text: 'Close' })
			.addEventListener('click', () => this.close());
	}

	onClose() {
		this.contentEl.empty();
		document.getElementById(STYLE_ELEMENT_ID)?.remove();
	}
}
