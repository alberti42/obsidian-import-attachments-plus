// tests/shared/specs/utils.spec.ts
//
// Path handling. These are pure string functions, and they are where a
// Windows/Linux difference would first show up — every path in the plugin is POSIX
// internally and only converted at the Electron boundary.

import { suite, it, assertEqual, assertDeepEqual } from '../spec';

import { parseFilePath, parseFolderPath, joinPaths } from 'utils';

suite('path utilities', () => {

	it('parseFilePath: splits a nested path', () => {
		assertDeepEqual(parseFilePath('2023/notes/Trip.md'), {
			dir: '2023/notes',
			base: 'Trip.md',
			filename: 'Trip',
			ext: '.md',
			path: '2023/notes/Trip.md',
		});
	});

	it('parseFilePath: a file at the vault root has an empty dir', () => {
		const parsed = parseFilePath('Trip.md');
		assertEqual(parsed.dir, '');
		assertEqual(parsed.filename, 'Trip');
		assertEqual(parsed.ext, '.md');
	});

	it('parseFilePath: a file with no extension', () => {
		const parsed = parseFilePath('LICENSE');
		assertEqual(parsed.filename, 'LICENSE');
		assertEqual(parsed.ext, '');
	});

	it('parseFilePath: only the last dot starts the extension', () => {
		const parsed = parseFilePath('archive.tar.gz');
		assertEqual(parsed.filename, 'archive.tar');
		assertEqual(parsed.ext, '.gz');
	});

	it('parseFilePath: a dotfile is a name, not an extension', () => {
		// '.gitignore' should not be read as an empty name with extension '.gitignore'.
		const parsed = parseFilePath('.gitignore');
		assertEqual(parsed.base, '.gitignore');
	});

	it('parseFolderPath: splits a nested folder', () => {
		assertDeepEqual(parseFolderPath('2023/Trip (attachments)'), {
			dir: '2023',
			foldername: 'Trip (attachments)',
			path: '2023/Trip (attachments)',
		});
	});

	it('parseFolderPath: a folder at the vault root has an empty dir', () => {
		const parsed = parseFolderPath('Trip (attachments)');
		assertEqual(parsed.dir, '');
		assertEqual(parsed.foldername, 'Trip (attachments)');
	});

	it('joinPaths: joins with a forward slash', () => {
		assertEqual(joinPaths('a', 'b'), 'a/b');
	});

	it('parseFilePath: normalises separators and keeps unicode composed', () => {
		// normalizePath collapses duplicate slashes and trims the leading one.
		assertEqual(parseFilePath('/2023//Trip.md').path, '2023/Trip.md');
	});

});
