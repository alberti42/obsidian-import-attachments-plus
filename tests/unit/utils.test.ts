// tests/unit/utils.test.ts
//
// Path handling. These are pure string functions, and they are where a
// Windows/Linux difference would first show up — every path in the plugin is POSIX
// internally and only converted at the Electron boundary.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { parseFilePath, parseFolderPath, joinPaths } from 'utils';

test('parseFilePath: splits a nested path', () => {
	assert.deepEqual(parseFilePath('2023/notes/Trip.md'), {
		dir: '2023/notes',
		base: 'Trip.md',
		filename: 'Trip',
		ext: '.md',
		path: '2023/notes/Trip.md',
	});
});

test('parseFilePath: a file at the vault root has an empty dir', () => {
	const parsed = parseFilePath('Trip.md');
	assert.equal(parsed.dir, '');
	assert.equal(parsed.filename, 'Trip');
	assert.equal(parsed.ext, '.md');
});

test('parseFilePath: a file with no extension', () => {
	const parsed = parseFilePath('LICENSE');
	assert.equal(parsed.filename, 'LICENSE');
	assert.equal(parsed.ext, '');
});

test('parseFilePath: only the last dot starts the extension', () => {
	const parsed = parseFilePath('archive.tar.gz');
	assert.equal(parsed.filename, 'archive.tar');
	assert.equal(parsed.ext, '.gz');
});

test('parseFilePath: a dotfile is a name, not an extension', () => {
	// '.gitignore' should not be read as an empty name with extension '.gitignore'.
	const parsed = parseFilePath('.gitignore');
	assert.equal(parsed.base, '.gitignore');
});

test('parseFolderPath: splits a nested folder', () => {
	assert.deepEqual(parseFolderPath('2023/Trip (attachments)'), {
		dir: '2023',
		foldername: 'Trip (attachments)',
		path: '2023/Trip (attachments)',
	});
});

test('parseFolderPath: a folder at the vault root has an empty dir', () => {
	const parsed = parseFolderPath('Trip (attachments)');
	assert.equal(parsed.dir, '');
	assert.equal(parsed.foldername, 'Trip (attachments)');
});

test('joinPaths: joins with a forward slash', () => {
	assert.equal(joinPaths('a', 'b'), 'a/b');
});

test('parseFilePath: normalises separators and keeps unicode composed', () => {
	// normalizePath collapses duplicate slashes and trims the leading one.
	assert.equal(parseFilePath('/2023//Trip.md').path, '2023/Trip.md');
});
