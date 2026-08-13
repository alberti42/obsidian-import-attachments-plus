// tests/inApp/harness.ts
//
// A very small test runner that executes inside Obsidian, so that behaviour depending
// on the real API — monkey patches, the file explorer's DOM, and above all the timing
// of the metadata cache — can be tested without pretending to reimplement any of it.
//
// Deliberately dependency-free and about a hundred lines: the value is in the helpers
// below (`untilResolved`, the scratch folder), not in the runner.

import { App, TFile, TFolder } from 'obsidian';
import ImportAttachments from 'main';

export type TestContext = {
	app: App;
	plugin: ImportAttachments;
	/** Vault-relative folder that this run owns and deletes afterwards. */
	scratch: string;

	/** Create a note under the scratch folder and wait for it to be indexed. */
	note(relativePath: string, content?: string): Promise<TFile>;
	/** Create a binary attachment under the scratch folder (a 1x1 PNG by default). */
	attachment(relativePath: string, bytes?: Uint8Array): Promise<TFile>;
	/** Overwrite a note's content and wait for the cache to catch up. */
	rewrite(file: TFile, content: string): Promise<void>;

	/** Resolve once the metadata cache has finished everything it had queued. */
	untilResolved(): Promise<void>;
	/** Poll until `predicate` holds, or fail after `timeoutMs`. */
	until(predicate: () => boolean, description: string, timeoutMs?: number): Promise<void>;

	exists(path: string): boolean;
	folder(path: string): TFolder | null;
};

type TestFn = (t: TestContext) => Promise<void> | void;
type Registered = { suite: string; name: string; fn: TestFn };

const registered: Registered[] = [];
let currentSuite = '(none)';

export function suite(name: string, body: () => void) {
	const previous = currentSuite;
	currentSuite = name;
	body();
	currentSuite = previous;
}

export function it(name: string, fn: TestFn) {
	registered.push({ suite: currentSuite, name, fn });
}

/* ------------------------------------------------------------------ assertions */

export function assert(condition: boolean, message: string): asserts condition {
	if (!condition) { throw new Error(message); }
}

export function assertEqual<T>(actual: T, expected: T, message?: string) {
	if (actual !== expected) {
		throw new Error(`${message ?? 'not equal'}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
	}
}

/* --------------------------------------------------------------------- results */

export type TestResult = { suite: string; name: string; passed: boolean; error?: string; ms: number };

// A 1x1 transparent PNG, so attachments in tests are real image files.
const TINY_PNG = Uint8Array.from(atob(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
), c => c.charCodeAt(0));

/**
 * Run every registered test. Each test gets its own scratch folder, created before it
 * and removed afterwards even if it fails, so a run leaves the vault as it found it.
 */
export async function runAllTests(plugin: ImportAttachments): Promise<TestResult[]> {
	const app = plugin.app;
	const results: TestResult[] = [];

	for (const [index, entry] of registered.entries()) {
		const scratch = `_plugin-tests/run-${index}`;
		const started = performance.now();

		try {
			await ensureFolder(app, '_plugin-tests');
			await ensureFolder(app, scratch);

			await entry.fn(makeContext(app, plugin, scratch));
			results.push({ suite: entry.suite, name: entry.name, passed: true, ms: performance.now() - started });
		} catch (error) {
			results.push({
				suite: entry.suite,
				name: entry.name,
				passed: false,
				error: error instanceof Error ? (error.stack ?? error.message) : String(error),
				ms: performance.now() - started,
			});
		} finally {
			await removeFolder(app, scratch);
		}
	}

	await removeFolder(app, '_plugin-tests');
	return results;
}

function makeContext(app: App, plugin: ImportAttachments, scratch: string): TestContext {
	const untilResolved = () => new Promise<void>(resolve => {
		const ref = app.metadataCache.on('resolved', () => {
			app.metadataCache.offref(ref);
			resolve();
		});
	});

	const until = async (predicate: () => boolean, description: string, timeoutMs = 5000) => {
		const deadline = performance.now() + timeoutMs;
		while (performance.now() < deadline) {
			if (predicate()) { return; }
			await sleep(50);
		}
		throw new Error(`timed out after ${timeoutMs}ms waiting for: ${description}`);
	};

	return {
		app,
		plugin,
		scratch,
		untilResolved,
		until,
		exists: (path: string) => app.vault.getAbstractFileByPath(path) !== null,
		folder: (path: string) => {
			const f = app.vault.getAbstractFileByPath(path);
			return f instanceof TFolder ? f : null;
		},
		note: async (relativePath: string, content = '') => {
			const file = await app.vault.create(`${scratch}/${relativePath}`, content);
			await untilResolved();
			return file;
		},
		attachment: async (relativePath: string, bytes = TINY_PNG) => {
			const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
			return await app.vault.createBinary(`${scratch}/${relativePath}`, buffer);
		},
		rewrite: async (file: TFile, content: string) => {
			await app.vault.modify(file, content);
			await untilResolved();
		},
	};
}

const sleep = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

async function ensureFolder(app: App, path: string) {
	if (app.vault.getAbstractFileByPath(path) === null) {
		await app.vault.createFolder(path);
	}
}

async function removeFolder(app: App, path: string) {
	const folder = app.vault.getAbstractFileByPath(path);
	if (folder instanceof TFolder) {
		// Delete outright rather than trash: these are throwaway fixtures and nobody
		// wants a test run filling up their .trash.
		await app.vault.delete(folder, true);
	}
}
