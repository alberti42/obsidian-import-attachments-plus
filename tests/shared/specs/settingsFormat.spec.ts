// tests/shared/specs/settingsFormat.spec.ts
//
// Which shape a stored data.json is in. Getting this wrong runs the 1.3.0 migration
// over already-migrated settings, or skips it for settings that need it — either way
// the user's configuration is silently mangled, so it is worth pinning down.

import { suite, it, assert, assertEqual } from '../spec';

import { isSettingsLatestFormat, isSettingsFormat_1_3_0 } from 'types';
import { DEFAULT_SETTINGS } from 'default';

suite('settings formats', () => {

	it('isSettingsLatestFormat: accepts settings carrying the current compatibility', () => {
		assertEqual(isSettingsLatestFormat({ ...DEFAULT_SETTINGS }), true);
	});

	it('isSettingsLatestFormat: rejects an older compatibility value', () => {
		assertEqual(isSettingsLatestFormat({ ...DEFAULT_SETTINGS, compatibility: '1.3.0' }), false);
	});

	it('isSettingsLatestFormat: rejects non-objects', () => {
		assertEqual(isSettingsLatestFormat(null), false);
		assertEqual(isSettingsLatestFormat(undefined), false);
		assertEqual(isSettingsLatestFormat('1.4.0'), false);
	});

	it('isSettingsFormat_1_3_0: legacy settings have no compatibility key', () => {
		assertEqual(isSettingsFormat_1_3_0({ folderPath: 'attachments' }), true);
	});

	it('isSettingsFormat_1_3_0: current settings are not legacy', () => {
		assertEqual(isSettingsFormat_1_3_0({ ...DEFAULT_SETTINGS }), false);
	});

	it('the two guards are mutually exclusive for every shape we store', () => {
		const shapes: unknown[] = [
			{ ...DEFAULT_SETTINGS },
			{ ...DEFAULT_SETTINGS, compatibility: '1.3.0' },
			{ folderPath: 'attachments' },
			{},
		];
		for (const shape of shapes) {
			assertEqual(
				isSettingsLatestFormat(shape) && isSettingsFormat_1_3_0(shape),
				false,
				`both guards accepted ${JSON.stringify(shape)}`,
			);
		}
	});

	it('DEFAULT_SETTINGS declares a compatibility version', () => {
		// The migration branches key off this; an empty value would send every user
		// through the 1.3.0 conversion on load.
		assert(DEFAULT_SETTINGS.compatibility.length > 0, "expected a truthy value");
	});

});
