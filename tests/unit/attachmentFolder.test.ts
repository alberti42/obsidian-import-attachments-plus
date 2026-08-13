// tests/unit/attachmentFolder.test.ts
//
// matchAttachmentFolder decides which folders the plugin may hide, delete once empty,
// and move attachments out of. A false positive here deletes a folder that is not
// ours, so this is the most consequential logic in the plugin.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { attachmentFolderOfNote, compileAttachmentFolderMatcher } from 'attachmentFolder';
import { AttachmentFolderLocationType } from 'types';
import { parseFilePath } from 'utils';

const SUBFOLDER = AttachmentFolderLocationType.SUBFOLDER;
const FOLDER = AttachmentFolderLocationType.FOLDER;
const CURRENT = AttachmentFolderLocationType.CURRENT;
const ROOT = AttachmentFolderLocationType.ROOT;

const settings = (attachmentFolderLocation: AttachmentFolderLocationType, attachmentFolderPath: string) =>
	({ attachmentFolderLocation, attachmentFolderPath });

/** Pretend these notes exist in the vault (paths given without extension). */
const notes = (...paths: string[]) => (candidate: string) =>
	paths.some(p => candidate === p);

test('attachmentFolderOfNote: SUBFOLDER puts the folder beside the note', () => {
	const s = settings(SUBFOLDER, '${notename} (attachments)');
	assert.equal(
		attachmentFolderOfNote(s, parseFilePath('2023/Trip.md')),
		'2023/Trip (attachments)',
	);
});

test('attachmentFolderOfNote: SUBFOLDER at the vault root has no leading slash', () => {
	const s = settings(SUBFOLDER, '${notename} (attachments)');
	assert.equal(
		attachmentFolderOfNote(s, parseFilePath('Trip.md')),
		'Trip (attachments)',
	);
});

test('attachmentFolderOfNote: FOLDER is absolute, not relative to the note', () => {
	const s = settings(FOLDER, 'Media/${notename}');
	assert.equal(
		attachmentFolderOfNote(s, parseFilePath('2023/Trip.md')),
		'Media/Trip',
	);
});

test('attachmentFolderOfNote: CURRENT is the note\'s own directory', () => {
	const s = settings(CURRENT, 'ignored');
	assert.equal(attachmentFolderOfNote(s, parseFilePath('2023/Trip.md')), '2023');
});

test('attachmentFolderOfNote: ROOT is the vault root', () => {
	const s = settings(ROOT, 'ignored');
	assert.equal(attachmentFolderOfNote(s, parseFilePath('2023/Trip.md')), '');
});

test('attachmentFolderOfNote: canvas notes resolve like markdown notes', () => {
	const s = settings(SUBFOLDER, '${notename} (attachments)');
	assert.equal(
		attachmentFolderOfNote(s, parseFilePath('Board.canvas')),
		'Board (attachments)',
	);
});

test('matcher: SUBFOLDER accepts a folder whose note exists', () => {
	const match = compileAttachmentFolderMatcher(
		settings(SUBFOLDER, '${notename} (attachments)'),
		notes('2023/Trip'),
	);
	assert.equal(match('2023/Trip (attachments)'), true);
});

test('matcher: SUBFOLDER rejects a look-alike folder with no matching note', () => {
	// The whole point of the existence check: a folder that fits the pattern but has
	// no note beside it is somebody else's folder, and must never be touched.
	const match = compileAttachmentFolderMatcher(
		settings(SUBFOLDER, '${notename} (attachments)'),
		notes('2023/Trip'),
	);
	assert.equal(match('2023/Holiday (attachments)'), false);
});

test('matcher: SUBFOLDER rejects an unrelated folder', () => {
	const match = compileAttachmentFolderMatcher(
		settings(SUBFOLDER, '${notename} (attachments)'),
		notes('2023/Trip'),
	);
	assert.equal(match('assets'), false);
	assert.equal(match('2023/Trip'), false);
});

test('matcher: SUBFOLDER accepts a canvas note\'s folder', () => {
	const match = compileAttachmentFolderMatcher(
		settings(SUBFOLDER, '${notename} (attachments)'),
		notes('Board'),
	);
	assert.equal(match('Board (attachments)'), true);
});

test('matcher: a shared FOLDER matches only itself', () => {
	const match = compileAttachmentFolderMatcher(
		settings(FOLDER, 'Media'),
		notes(),
	);
	assert.equal(match('Media'), true);
	assert.equal(match('Media/nested'), false);
	assert.equal(match('Other'), false);
});

test('matcher: ROOT and CURRENT never claim any folder', () => {
	// Every note shares one folder in these modes, so no folder belongs to a note and
	// treating any of them as an attachment folder would put unrelated files at risk.
	for (const location of [ROOT, CURRENT]) {
		const match = compileAttachmentFolderMatcher(settings(location, 'anything'), notes('Trip'));
		assert.equal(match(''), false);
		assert.equal(match('Trip (attachments)'), false);
		assert.equal(match('anything'), false);
	}
});

test('matcher: regex metacharacters in the pattern are escaped', () => {
	// A pattern like "[${notename}]" must match literally, not as a character class.
	const match = compileAttachmentFolderMatcher(
		settings(SUBFOLDER, '[${notename}]'),
		notes('Trip'),
	);
	assert.equal(match('[Trip]'), true);
	assert.equal(match('T'), false);
});

test('matcher: FOLDER with ${notename} accepts the note it is named after', () => {
	// The configuration nobody has ever tested by hand.
	const match = compileAttachmentFolderMatcher(
		settings(FOLDER, 'Media/${notename}'),
		notes('Trip'),
	);
	assert.equal(match('Media/Trip'), true);
});
