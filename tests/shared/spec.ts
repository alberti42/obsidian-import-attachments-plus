// tests/shared/spec.ts
//
// One vocabulary for writing tests, and a registry both runners replay.
//
// A test that needs nothing but the code under test is written with `it` and runs in
// *both* places: headlessly under `node --test` for speed and CI, and again inside
// Obsidian. Running it in both is not redundant — headlessly it exercises
// tests/shims/obsidian.ts, and in Obsidian it exercises the real thing, so a shim that
// has drifted from Obsidian's actual behaviour shows up as the same spec passing in one
// environment and failing in the other. Hand-written fakes are otherwise invisible.
//
// A test that needs a live vault is written with `itInVault` (see ../inApp/harness.ts)
// and only runs inside Obsidian, because there is nothing honest to run it against
// outside.

export type PureTestFn = () => void | Promise<void>;

export type PureSpec = { suite: string; name: string; fn: PureTestFn };

const specs: PureSpec[] = [];
let currentSuite = '(none)';

/** Group the tests declared inside `body`. Works for both kinds of test. */
export function suite(name: string, body: () => void) {
	const previous = currentSuite;
	currentSuite = name;
	try {
		body();
	} finally {
		currentSuite = previous;
	}
}

/** A test needing nothing from Obsidian. Runs headlessly and in the app. */
export function it(name: string, fn: PureTestFn) {
	specs.push({ suite: currentSuite, name, fn });
}

/** Everything registered so far, for a runner to replay. */
export function pureSpecs(): readonly PureSpec[] {
	return specs;
}

/** The suite currently being declared, so other registries can tag their entries. */
export function currentSuiteName(): string {
	return currentSuite;
}

/* ------------------------------------------------------------------ assertions */

export function assert(condition: boolean, message: string): asserts condition {
	if (!condition) { throw new Error(message); }
}

export function assertEqual<T>(actual: T, expected: T, message?: string) {
	if (actual !== expected) {
		throw new Error(`${message ?? 'not equal'}\n  expected: ${format(expected)}\n  actual:   ${format(actual)}`);
	}
}

export function assertDeepEqual(actual: unknown, expected: unknown, message?: string) {
	const a = JSON.stringify(actual);
	const b = JSON.stringify(expected);
	if (a !== b) {
		throw new Error(`${message ?? 'not deeply equal'}\n  expected: ${b}\n  actual:   ${a}`);
	}
}

export function assertThrows(fn: () => unknown, message?: string) {
	try {
		fn();
	} catch {
		return;
	}
	throw new Error(message ?? 'expected the call to throw');
}

function format(value: unknown): string {
	return typeof value === 'string' ? JSON.stringify(value) : String(value);
}
