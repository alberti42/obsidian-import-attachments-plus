// tests/unit/settingsFormat.test.ts
//
// Which shape a stored data.json is in. Getting this wrong runs the 1.3.0 migration
// over already-migrated settings, or skips it for settings that need it — either way
// the user's configuration is silently mangled, so it is worth pinning down.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { isSettingsLatestFormat, isSettingsFormat_1_3_0 } from 'types';
import { DEFAULT_SETTINGS } from 'default';

test('isSettingsLatestFormat: accepts settings carrying the current compatibility', () => {
	assert.equal(isSettingsLatestFormat({ ...DEFAULT_SETTINGS }), true);
});

test('isSettingsLatestFormat: rejects an older compatibility value', () => {
	assert.equal(isSettingsLatestFormat({ ...DEFAULT_SETTINGS, compatibility: '1.3.0' }), false);
});

test('isSettingsLatestFormat: rejects non-objects', () => {
	assert.equal(isSettingsLatestFormat(null), false);
	assert.equal(isSettingsLatestFormat(undefined), false);
	assert.equal(isSettingsLatestFormat('1.4.0'), false);
});

test('isSettingsFormat_1_3_0: legacy settings have no compatibility key', () => {
	assert.equal(isSettingsFormat_1_3_0({ folderPath: 'attachments' }), true);
});

test('isSettingsFormat_1_3_0: current settings are not legacy', () => {
	assert.equal(isSettingsFormat_1_3_0({ ...DEFAULT_SETTINGS }), false);
});

test('the two guards are mutually exclusive for every shape we store', () => {
	const shapes: unknown[] = [
		{ ...DEFAULT_SETTINGS },
		{ ...DEFAULT_SETTINGS, compatibility: '1.3.0' },
		{ folderPath: 'attachments' },
		{},
	];
	for (const shape of shapes) {
		assert.equal(
			isSettingsLatestFormat(shape) && isSettingsFormat_1_3_0(shape),
			false,
			`both guards accepted ${JSON.stringify(shape)}`,
		);
	}
});

test('DEFAULT_SETTINGS declares a compatibility version', () => {
	// The migration branches key off this; an empty value would send every user
	// through the 1.3.0 conversion on load.
	assert.ok(DEFAULT_SETTINGS.compatibility.length > 0);
});
