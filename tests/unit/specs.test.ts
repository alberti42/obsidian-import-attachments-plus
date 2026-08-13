// tests/unit/specs.test.ts
//
// The headless runner: replays every pure spec into Node's test runner. The specs
// themselves know nothing about node:test, which is what lets the same files run
// unchanged inside Obsidian.
//
// There is nothing to edit here when adding a test — register it in
// tests/shared/specs/index.ts instead.

import { test } from 'node:test';

import '../shared/specs/index';
import { pureSpecs } from '../shared/spec';

for (const spec of pureSpecs()) {
	test(`${spec.suite} › ${spec.name}`, async () => {
		await spec.fn();
	});
}
