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

	/**
	 * Resolve once the metadata cache has finished everything it had queued, or after
	 * `timeoutMs` if it was already idle — the event only fires when there was work to
	 * do, so waiting for it unconditionally would hang.
	 */
	untilResolved(timeoutMs?: number): Promise<void>;
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
export async function runAllTests(plugin: ImportAttachments, perTestTimeoutMs = 20000): Promise<TestResult[]> {
	const app = plugin.app;
	const results: TestResult[] = [];

	console.log(`[plugin tests] starting — ${registered.length} test(s) registered`);
	if (registered.length === 0) {
		console.warn('[plugin tests] nothing registered. Suites register by being imported — '
			+ 'check that tests/inApp/index.ts imports your suite file.');
		return results;
	}

	for (const [index, entry] of registered.entries()) {
		const scratch = `_plugin-tests/run-${index}`;
		const label = `${entry.suite} › ${entry.name}`;
		const started = performance.now();
		console.log(`[plugin tests] ${index + 1}/${registered.length} running: ${label}`);

		try {
			await ensureFolder(app, '_plugin-tests');
			await ensureFolder(app, scratch);

			// A hung test must not take the whole run down with it, silently.
			await Promise.race([
				Promise.resolve(entry.fn(makeContext(app, plugin, scratch))),
				rejectAfter(perTestTimeoutMs, `test exceeded ${perTestTimeoutMs}ms`),
			]);

			const ms = performance.now() - started;
			results.push({ suite: entry.suite, name: entry.name, passed: true, ms });
			console.log(`[plugin tests]   PASS (${ms.toFixed(0)}ms)`);
		} catch (error) {
			const ms = performance.now() - started;
			const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
			results.push({ suite: entry.suite, name: entry.name, passed: false, error: message, ms });
			console.error(`[plugin tests]   FAIL (${ms.toFixed(0)}ms)\n${message}`);
		} finally {
			await removeFolder(app, scratch);
		}
	}

	await removeFolder(app, '_plugin-tests');

	const passed = results.filter(r => r.passed).length;
	console.log(`[plugin tests] finished — ${passed} passed, ${results.length - passed} failed`);
	console.table(results.map(r => ({
		suite: r.suite,
		test: r.name,
		result: r.passed ? 'pass' : 'FAIL',
		ms: Math.round(r.ms),
	})));

	return results;
}

function rejectAfter(ms: number, message: string): Promise<never> {
	return new Promise((_resolve, reject) => window.setTimeout(() => reject(new Error(message)), ms));
}

function makeContext(app: App, plugin: ImportAttachments, scratch: string): TestContext {
	// 'resolved' only fires when the cache had something queued. If it is already idle
	// the event never comes, so this must not wait for it unconditionally — an earlier
	// version did, and the whole run hung with no output at all.
	const untilResolved = (timeoutMs = 2000) => new Promise<void>(resolve => {
		let done = false;
		const finish = () => {
			if (done) { return; }
			done = true;
			app.metadataCache.offref(ref);
			window.clearTimeout(timer);
			resolve();
		};
		const ref = app.metadataCache.on('resolved', finish);
		const timer = window.setTimeout(finish, timeoutMs);
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
			const path = `${scratch}/${relativePath}`;
			await ensureParents(app, path);
			// Subscribe before creating: the cache can finish resolving before a
			// listener added afterwards exists, and the wait then costs the full
			// timeout for nothing.
			const resolved = untilResolved();
			const file = await app.vault.create(path, content);
			await resolved;
			return file;
		},
		attachment: async (relativePath: string, bytes = TINY_PNG) => {
			const path = `${scratch}/${relativePath}`;
			await ensureParents(app, path);
			const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
			return await app.vault.createBinary(path, buffer);
		},
		rewrite: async (file: TFile, content: string) => {
			const resolved = untilResolved();
			await app.vault.modify(file, content);
			await resolved;
		},
	};
}

const sleep = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

async function ensureFolder(app: App, path: string) {
	if (app.vault.getAbstractFileByPath(path) === null) {
		await app.vault.createFolder(path);
	}
}

/**
 * Create every folder leading up to a file. vault.create/createBinary do not do this
 * themselves — they fail with ENOENT — so a fixture like
 * "Big note (attachments)/diagram.png" needs its folder made first.
 */
async function ensureParents(app: App, filePath: string) {
	const segments = filePath.split('/').slice(0, -1);
	for (let i = 1; i <= segments.length; i++) {
		await ensureFolder(app, segments.slice(0, i).join('/'));
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
