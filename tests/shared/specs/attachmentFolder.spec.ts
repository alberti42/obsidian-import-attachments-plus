// tests/shared/specs/attachmentFolder.spec.ts
//
// matchAttachmentFolder decides which folders the plugin may hide, delete once empty,
// and move attachments out of. A false positive here deletes a folder that is not
// ours, so this is the most consequential logic in the plugin.

import { suite, it, assertEqual } from '../spec';

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

suite('attachment folder resolution', () => {

	it('attachmentFolderOfNote: SUBFOLDER puts the folder beside the note', () => {
		const s = settings(SUBFOLDER, '${notename} (attachments)');
		assertEqual(
			attachmentFolderOfNote(s, parseFilePath('2023/Trip.md')),
			'2023/Trip (attachments)',
		);
	});

	it('attachmentFolderOfNote: SUBFOLDER at the vault root has no leading slash', () => {
		const s = settings(SUBFOLDER, '${notename} (attachments)');
		assertEqual(
			attachmentFolderOfNote(s, parseFilePath('Trip.md')),
			'Trip (attachments)',
		);
	});

	it('attachmentFolderOfNote: FOLDER is absolute, not relative to the note', () => {
		const s = settings(FOLDER, 'Media/${notename}');
		assertEqual(
			attachmentFolderOfNote(s, parseFilePath('2023/Trip.md')),
			'Media/Trip',
		);
	});

	it('attachmentFolderOfNote: CURRENT is the note\'s own directory', () => {
		const s = settings(CURRENT, 'ignored');
		assertEqual(attachmentFolderOfNote(s, parseFilePath('2023/Trip.md')), '2023');
	});

	it('attachmentFolderOfNote: ROOT is the vault root', () => {
		// '/' rather than '': Obsidian's normalizePath returns the root as a path.
		// This spec asserted '' until it passed under `npm test` and failed in the app.
		const s = settings(ROOT, 'ignored');
		assertEqual(attachmentFolderOfNote(s, parseFilePath('2023/Trip.md')), '/');
	});

	it('attachmentFolderOfNote: canvas notes resolve like markdown notes', () => {
		const s = settings(SUBFOLDER, '${notename} (attachments)');
		assertEqual(
			attachmentFolderOfNote(s, parseFilePath('Board.canvas')),
			'Board (attachments)',
		);
	});

	it('matcher: SUBFOLDER accepts a folder whose note exists', () => {
		const match = compileAttachmentFolderMatcher(
			settings(SUBFOLDER, '${notename} (attachments)'),
			notes('2023/Trip'),
		);
		assertEqual(match('2023/Trip (attachments)'), true);
	});

	it('matcher: SUBFOLDER rejects a look-alike folder with no matching note', () => {
		// The whole point of the existence check: a folder that fits the pattern but has
		// no note beside it is somebody else's folder, and must never be touched.
		const match = compileAttachmentFolderMatcher(
			settings(SUBFOLDER, '${notename} (attachments)'),
			notes('2023/Trip'),
		);
		assertEqual(match('2023/Holiday (attachments)'), false);
	});

	it('matcher: SUBFOLDER rejects an unrelated folder', () => {
		const match = compileAttachmentFolderMatcher(
			settings(SUBFOLDER, '${notename} (attachments)'),
			notes('2023/Trip'),
		);
		assertEqual(match('assets'), false);
		assertEqual(match('2023/Trip'), false);
	});

	it('matcher: SUBFOLDER accepts a canvas note\'s folder', () => {
		const match = compileAttachmentFolderMatcher(
			settings(SUBFOLDER, '${notename} (attachments)'),
			notes('Board'),
		);
		assertEqual(match('Board (attachments)'), true);
	});

	it('matcher: a shared FOLDER matches only itself', () => {
		const match = compileAttachmentFolderMatcher(
			settings(FOLDER, 'Media'),
			notes(),
		);
		assertEqual(match('Media'), true);
		assertEqual(match('Media/nested'), false);
		assertEqual(match('Other'), false);
	});

	it('matcher: ROOT and CURRENT never claim any folder', () => {
		// Every note shares one folder in these modes, so no folder belongs to a note and
		// treating any of them as an attachment folder would put unrelated files at risk.
		for (const location of [ROOT, CURRENT]) {
			const match = compileAttachmentFolderMatcher(settings(location, 'anything'), notes('Trip'));
			assertEqual(match(''), false);
			assertEqual(match('Trip (attachments)'), false);
			assertEqual(match('anything'), false);
		}
	});

	it('matcher: regex metacharacters in the pattern are escaped', () => {
		// A pattern like "[${notename}]" must match literally, not as a character class.
		const match = compileAttachmentFolderMatcher(
			settings(SUBFOLDER, '[${notename}]'),
			notes('Trip'),
		);
		assertEqual(match('[Trip]'), true);
		assertEqual(match('T'), false);
	});

	it('matcher: FOLDER with ${notename} accepts the note it is named after', () => {
		// The configuration nobody has ever tested by hand.
		const match = compileAttachmentFolderMatcher(
			settings(FOLDER, 'Media/${notename}'),
			notes('Trip'),
		);
		assertEqual(match('Media/Trip'), true);
	});

});
