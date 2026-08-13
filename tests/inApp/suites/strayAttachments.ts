// tests/inApp/suites/strayAttachments.ts
//
// Worked examples for the behaviour that cannot be tested outside Obsidian: these
// depend on the metadata cache actually re-indexing both notes, which is the exact
// thing that made "extract into an existing note" behave differently from a paste.
//
// Add new cases alongside these — the pattern is: build a situation with t.note()
// and t.attachment(), rewrite a note, wait, then assert on where files ended up.

import { AttachmentFolderLocationType } from 'types';
import { findStrayAttachments, findStrayAttachmentsOfNote } from 'strayAttachments';
import { suite, itInVault, assert, assertEqual } from '../harness';

suite('stray attachments', () => {

	itInVault('finds an attachment left behind when text moves to another note', async (t) => {
		requireSubfolderMode(t.plugin);

		// "Big note" owns the attachment folder and originally references the image.
		const image = await t.attachment('Big note (attachments)/diagram.png');
		await t.note('Big note.md', `Intro\n\n![[${image.name}]]\n`);

		// The text (and its embed) moves into a new note; the file stays behind.
		const small = await t.note('Small note.md', `![[${image.name}]]\n`);
		const big = t.app.vault.getAbstractFileByPath(`${t.scratch}/Big note.md`);
		assert(big !== null, 'Big note should exist');
		await t.rewrite(big as never, 'Intro\n');

		const strays = findStrayAttachmentsOfNote(t.plugin, small);
		assertEqual(strays.length, 1, 'exactly one stray expected');
		assertEqual(strays[0].file.name, 'diagram.png');
		assert(
			strays[0].to.some(d => d.attachFolder === `${t.scratch}/Small note (attachments)`),
			`destination should be Small note's folder, got ${strays[0].to.map(d => d.attachFolder).join(', ')}`,
		);
	});

	itInVault('leaves an attachment alone while the note it is filed under still uses it', async (t) => {
		requireSubfolderMode(t.plugin);

		const image = await t.attachment('Big note (attachments)/shared.png');
		await t.note('Big note.md', `![[${image.name}]]\n`);
		const other = await t.note('Other note.md', `![[${image.name}]]\n`);

		// Both notes reference it and it sits in Big note's folder, which is a valid
		// home — so nothing should be proposed, or the two would fight over it for ever.
		assertEqual(findStrayAttachmentsOfNote(t.plugin, other).length, 0, 'shared attachment must not move');
	});

	itInVault('never touches a folder outside the plugin\'s pattern', async (t) => {
		requireSubfolderMode(t.plugin);

		// A hand-curated folder: not named after any note, so not ours.
		await t.app.vault.createFolder(`${t.scratch}/assets`);
		const image = await t.attachment('assets/logo.png');
		const note = await t.note('Note.md', `![[${image.name}]]\n`);

		assertEqual(findStrayAttachmentsOfNote(t.plugin, note).length, 0, 'assets/ must be left alone');
	});

	// Two markdown-link spellings for a filename containing a space. Obsidian generates
	// the percent-encoded one; the angle-bracket one is CommonMark and a user may well
	// type it. What matters is what ends up in `elem.link`, because resolveLink() feeds
	// that to getFirstLinkpathDest: if the brackets survive, resolution fails silently
	// and the attachment becomes invisible to the whole feature.
	for (const [label, spelling] of [
		['percent-encoded', 'space%20file.png'],
		['angle brackets', '<space file.png>'],
	]) {
		itInVault(`resolves a markdown link with ${label}`, async (t) => {
			requireSubfolderMode(t.plugin);

			await t.attachment('Big note (attachments)/space file.png');
			await t.note('Big note.md', 'no link here\n');
			const small = await t.note('Small note.md', `![img](${spelling})\n`);

			const cache = t.app.metadataCache.getFileCache(small);
			const recorded = (cache?.embeds ?? []).map(e => e.link).join(', ');

			const strays = findStrayAttachmentsOfNote(t.plugin, small);
			assertEqual(
				strays.length, 1,
				`expected the attachment to be found; metadata cache recorded link as "${recorded}"`,
			);
		});
	}

	itInVault('the vault-wide command reports nothing for a tidy vault', async (t) => {
		requireSubfolderMode(t.plugin);

		const image = await t.attachment('Note (attachments)/pic.png');
		await t.note('Note.md', `![[${image.name}]]\n`);

		const strays = findStrayAttachments(t.plugin)
			.filter(s => s.fromPath.startsWith(t.scratch));
		assertEqual(strays.length, 0, `expected none, got ${strays.map(s => s.fromPath).join(', ')}`);
	});

});

/** These cases only make sense when each note has its own folder. */
function requireSubfolderMode(plugin: { settings: { attachmentFolderLocation: AttachmentFolderLocationType; attachmentFolderPath: string } }) {
	const { attachmentFolderLocation, attachmentFolderPath } = plugin.settings;
	if (attachmentFolderLocation !== AttachmentFolderLocationType.SUBFOLDER
		|| !attachmentFolderPath.includes('${notename}')) {
		throw new Error(
			'this suite expects attachmentFolderLocation=SUBFOLDER with ${notename} in the path; '
			+ `got ${attachmentFolderLocation} / "${attachmentFolderPath}"`,
		);
	}
}
