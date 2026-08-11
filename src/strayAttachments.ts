import { App, TFile, TFolder, CachedMetadata, Notice, ReferenceCache, FrontmatterLinkCache, getLinkpath } from 'obsidian';
import { parseFilePath, mapSoftSet, joinPaths, findNewFilename, doesFileExist } from './utils';
import type ImportAttachments from 'main';

// `line` is the 0-based line of this reference, used to jump straight to the place
// in the note where the attachment is used.
export type SomeLink = { text: string, dest: string, resolvedDest: TFile, line: number };
export type DedupeFileList = {f: TFile, list: Map<string, TFile>};
export type DedupeLinkList = {f: TFile, list: Map<string, SomeLink>};

export type AttachFolder = { attachFolder: string, file: TFile };

// A destination: the note that references the attachment, its attachment folder,
// and where in that note the attachment is first used.
export type StrayDestination = { attachFolder: string, note: TFile, line: number };

export type StrayAttachment = {
	from: string,
	file: TFile,
	fromPath: string,
	// The note whose attachment folder the file currently sits in, when it can be
	// identified. Undefined if that note has no links at all, since the reference
	// maps only cover notes that do.
	fromNote?: TFile,
	to: StrayDestination[]
}

export type StrayAttachmentMove = {
	sourcePath: string;
	destinationPath: string;
	sourceFile: TFile;
};

const NOTE_EXTENSIONS = new Set(['md', 'canvas']);
const warnInConsole = process.env.NODE_ENV === 'development';

export type ReferenceMaps = {
	noteToAttachFolder: Map<string, AttachFolder>,
	// deduplicated on link.resolvedDest.path
	noteToAttachments: Map<string, DedupeLinkList>,
	// deduplicated on TFile.path
	attachmentToNotes: Map<string, DedupeFileList>,
};

/**
 * Resolve one cache entry to the file it points at.
 *
 * `elem.link` is Obsidian's already-normalised target: the alias (`|`) is stripped and
 * markdown-style links are handled identically to wikilinks. Parsing `elem.original`
 * by hand instead would silently drop every `[alt](file.png)` link.
 */
function resolveLink(app: App, link: string, sourcePath: string): TFile | null {
	const linkpath = getLinkpath(link);
	if (!linkpath) { return null; } // pure subpath, e.g. [[#heading]]

	const res = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
	if (res) { return res; }

	// Markdown links may carry percent-encoding that the cache preserves verbatim.
	try {
		const decoded = decodeURIComponent(linkpath);
		if (decoded !== linkpath) {
			return app.metadataCache.getFirstLinkpathDest(decoded, sourcePath);
		}
	} catch {
		// malformed escape sequence: nothing more we can do
	}
	return null;
}

/** Where a cache entry sits in the file. FrontmatterLinkCache has no position. */
function positionOf(elem: ReferenceCache | FrontmatterLinkCache): { offset: number, line: number } {
	if ('position' in elem && elem.position) {
		return { offset: elem.position.start.offset, line: elem.position.start.line };
	}
	return { offset: 0, line: 0 };
}

function unifyLinkCaches(app: App, input: { f: TFile, m: CachedMetadata | null}) {
	const links: SomeLink[] = [];
	if (!input.m) { return { f: input.f, links: []}; }

	// Sorted by position so that the first entry for a given attachment really is its
	// first occurrence in the note: the three caches are separate lists, so merging
	// them without sorting would put every frontmatter link before every body link.
	// Frontmatter links carry no position at all — they live at the top of the file,
	// so offset 0 sorts them where they belong and line 0 is where to jump to.
	const mergedLinks = [
		...(input.m?.links ?? []),
		...(input.m?.frontmatterLinks ?? []),
		...(input.m?.embeds ?? [])
	].sort((a, b) => positionOf(a).offset - positionOf(b).offset);

	for (const elem of mergedLinks) {
		const res = resolveLink(app, elem.link, input.f.path);
		if (res === null) {
			if (warnInConsole) { console.warn('stray attachments: could not resolve link:', elem.original, `(link field: '${elem.link}')`); }
			continue;
		}
		// we are not interested in notes linking to other notes
		if (NOTE_EXTENSIONS.has(res.extension.toLowerCase())) { continue; }

		links.push({
			text: elem.link,
			dest: elem.original,
			resolvedDest: res,
			line: positionOf(elem).line
		});
	}

	return { f: input.f, links };
}

function buildReferenceMaps(plugin: ImportAttachments): ReferenceMaps {
	const app = plugin.app;

	const noteToAttachFolder = new Map<string, AttachFolder>();
	const noteToAttachments = new Map<string, DedupeLinkList>();
	const attachmentToNotes = new Map<string, DedupeFileList>();

	// find all files that are notes
	// get all their metadata
	// filter out notes which don't have any links, frontmatter links or embeds
	// unify all those links into a standardized link format (unifyLinkCaches)
	// filter out notes which end up without any links

	const filesWithLinks = (app.vault.getFiles() as TFile[])
		.filter(t => NOTE_EXTENSIONS.has(t.extension.toLowerCase()))
		.map(t => ({ f: t, m: app.metadataCache.getFileCache(t) as CachedMetadata | null }))
		// Keep notes that reference something. The caches are optional, so `== null`
		// was doing real work here (it matches undefined, which `=== null` does not);
		// `?.length ?? 0` says the same thing without depending on that.
		.filter(e => e.m !== null && (
			(e.m.embeds?.length ?? 0) > 0 ||
			(e.m.links?.length ?? 0) > 0 ||
			(e.m.frontmatterLinks?.length ?? 0) > 0
		))
		.map(e => unifyLinkCaches(app, e))
		.filter(e => e.links.length > 0)

	for (const file of filesWithLinks) {
		noteToAttachFolder.set(file.f.path, {
			attachFolder: plugin.getAttachmentFolderOfMdNote(parseFilePath(file.f.path)),
			file: file.f
		});

		if (!noteToAttachments.has(file.f.path)) {
			noteToAttachments.set(file.f.path, { f: file.f, list: new Map<string, SomeLink>() });
		}

		// deduplicate links
		for (const link of file.links) {
			if (!attachmentToNotes.has(link.resolvedDest.path)) {
				attachmentToNotes.set(link.resolvedDest.path, { f: link.resolvedDest, list: new Map<string, TFile>() });
			}

			// bind note -> attachment
			mapSoftSet(noteToAttachments.get(file.f.path)!.list, link.resolvedDest.path, link);

			// bind attachment -> note
			mapSoftSet(attachmentToNotes.get(link.resolvedDest.path)!.list, file.f.path, file.f);
		}
	}

	return { noteToAttachFolder, noteToAttachments, attachmentToNotes };
}

/**
 * Candidate destinations for `attachment`: the attachment folder of every note that
 * references it.
 *
 * An attachment is considered correctly placed as soon as it sits in the attachment
 * folder of *any* note that references it, in which case there is nothing to propose
 * and this returns an empty list. That rule does two things:
 *
 *  - An attachment shared by several notes can only live in one folder. Without this,
 *    moving it into note A's folder would make the next run propose note B's folder,
 *    and the run after that note A's again, for ever.
 *  - Where every note maps to the same folder (ROOT, CURRENT, or FOLDER without
 *    `${notename}`), the folder an attachment is already in is always a candidate, so
 *    the command correctly reports that there is nothing to do — instead of listing
 *    the whole vault once per note, each time offering to move a file to where it is.
 */
function destinationsFor(attachment: TFile, notes: DedupeFileList, maps: ReferenceMaps): StrayDestination[] {
	const currentFolder = attachment.parent?.path;

	const candidates = Array.from(notes.list.values())
		.map(note => {
			const folder = maps.noteToAttachFolder.get(note.path);
			if (!folder) { return undefined; }
			// The reference maps keep the first occurrence of each attachment per note,
			// so this is the line to jump to when opening the destination.
			const line = maps.noteToAttachments.get(note.path)?.list.get(attachment.path)?.line ?? 0;
			return { attachFolder: folder.attachFolder, note: folder.file, line };
		})
		.filter((e): e is StrayDestination => e !== undefined);

	if (candidates.some(c => c.attachFolder === currentFolder)) { return []; }
	return candidates;
}

/** The attachments this note currently resolves to, as vault paths. */
function referencedAttachments(plugin: ImportAttachments, note: TFile): Set<string> {
	const cache = plugin.app.metadataCache.getFileCache(note);
	const paths = new Set<string>();
	if (!cache) { return paths; }

	for (const elem of [...(cache.links ?? []), ...(cache.frontmatterLinks ?? []), ...(cache.embeds ?? [])]) {
		const resolved = resolveLink(plugin.app, elem.link, note.path);
		if (!resolved || NOTE_EXTENSIONS.has(resolved.extension.toLowerCase())) { continue; }
		paths.add(resolved.path);
	}
	return paths;
}

/**
 * Could this note possibly have strays? Answered without building the reference maps,
 * because this runs on every metadata change and the maps cost a pass over the vault.
 *
 * Two ways a note can be involved in a move, corresponding to the two passes below:
 * it can have received text (it references an attachment filed elsewhere), or it can
 * have given text away (its own folder holds an attachment it no longer references).
 *
 * Ordinary editing is neither, so this rejects almost every call.
 */
function couldHaveStrays(plugin: ImportAttachments, ownFolder: string, referenced: Set<string>): boolean {
	// Received: something it points at lives in another managed folder.
	for (const path of referenced) {
		const parent = plugin.app.vault.getAbstractFileByPath(path)?.parent?.path;
		if (parent === undefined || parent === ownFolder) { continue; }
		if (plugin.matchAttachmentFolder(parent)) { return true; }
	}

	// Gave away: its own folder holds something it no longer points at.
	const folder = plugin.app.vault.getAbstractFileByPath(ownFolder);
	if (folder instanceof TFolder) {
		for (const child of folder.children) {
			if (child instanceof TFile && !referenced.has(child.path)) { return true; }
		}
	}

	return false;
}

/**
 * Strays connected to one note, from either side of a move.
 *
 * findStrayAttachments() restricted to a single note, applying exactly the same rules:
 * an attachment already sitting in the folder of any note that references it is not a
 * stray, and only plugin-managed folders are touched.
 *
 * Both directions have to be checked, because which note is re-indexed first is not
 * ours to control. Cut-and-paste updates the source first, so by the time the receiving
 * note resolves the attachment already looks stray. 'Extract selection' into an existing
 * note writes the target first: at that point the source still references the
 * attachment, so nothing looks stray, and the source's own change resolves a moment
 * later. Checking only the receiving side made that case silently do nothing.
 *
 * Returns an empty array cheaply when there is nothing that could possibly qualify.
 */
export function findStrayAttachmentsOfNote(plugin: ImportAttachments, note: TFile): StrayAttachment[] {
	const ownFolder = plugin.getAttachmentFolderOfMdNote(parseFilePath(note.path));
	const referenced = referencedAttachments(plugin, note);

	if (!couldHaveStrays(plugin, ownFolder, referenced)) { return []; }

	const maps = buildReferenceMaps(plugin);
	const strays: StrayAttachment[] = [];
	const record = makeRecorder(plugin, maps, strays);

	const consider = (attachment: TFile) => {
		const notes = maps.attachmentToNotes.get(attachment.path);
		if (!notes) { return; }
		record(attachment, destinationsFor(attachment, notes, maps));
	};

	// Received text: attachments this note points at that are filed under another note.
	for (const link of maps.noteToAttachments.get(note.path)?.list.values() ?? []) {
		consider(link.resolvedDest);
	}

	// Gave text away: attachments in this note's own folder that it no longer points at.
	const folder = plugin.app.vault.getAbstractFileByPath(ownFolder);
	if (folder instanceof TFolder) {
		for (const child of folder.children) {
			if (child instanceof TFile && !referenced.has(child.path)) { consider(child); }
		}
	}

	return strays;
}

/**
 * The shared gate for both entry points: skips duplicates and anything outside a
 * plugin-managed folder, and stamps the note a stray was filed under.
 */
function makeRecorder(plugin: ImportAttachments, maps: ReferenceMaps, strays: StrayAttachment[]) {
	const processedAttachments = new Set<string>();

	// Which note owns a given attachment folder, so a stray can be traced back to the
	// note it was originally imported into. Only covers notes that have links, which
	// is what the reference maps are built from.
	const noteOwningFolder = new Map<string, TFile>();
	for (const entry of maps.noteToAttachFolder.values()) {
		mapSoftSet(noteOwningFolder, entry.attachFolder, entry.file);
	}

	return (attachment: TFile, alternatives: StrayDestination[]) => {
		if (alternatives.length === 0 || processedAttachments.has(attachment.path)) { return; }

		// Only reorganise folders this plugin manages. A hand-curated shared folder
		// ('assets/', 'Media/', ...) is the user's own filing system, and reporting it
		// as misplaced on every run would make the command unusable for them.
		const parent = attachment.parent?.path;
		if (parent === undefined || !plugin.matchAttachmentFolder(parent)) { return; }

		processedAttachments.add(attachment.path);
		strays.push({
			file: attachment,
			from: parent,
			fromPath: attachment.path,
			fromNote: noteOwningFolder.get(parent),
			to: alternatives
		});
	};
}

export function findStrayAttachments(plugin: ImportAttachments) {
	const maps = buildReferenceMaps(plugin);
	const { noteToAttachFolder, noteToAttachments, attachmentToNotes } = maps;

	const strays: StrayAttachment[] = [];
	const processedAttachments = new Set<string>();

	// Which note owns a given attachment folder, so a stray can be traced back to the
	// note it was originally imported into. Only covers notes that have links, which
	// is what the reference maps are built from.
	const noteOwningFolder = new Map<string, TFile>();
	for (const entry of noteToAttachFolder.values()) {
		mapSoftSet(noteOwningFolder, entry.attachFolder, entry.file);
	}

	const record = (attachment: TFile, alternatives: StrayDestination[]) => {
		if (alternatives.length === 0 || processedAttachments.has(attachment.path)) { return; }

		// Only reorganise folders this plugin manages. A hand-curated shared folder
		// ('assets/', 'Media/', ...) is the user's own filing system, and reporting it
		// as misplaced on every run would make the command unusable for them.
		const parent = attachment.parent?.path;
		if (parent === undefined || !plugin.matchAttachmentFolder(parent)) { return; }

		processedAttachments.add(attachment.path);
		strays.push({
			file: attachment,
			from: parent,
			fromPath: attachment.path,
			fromNote: noteOwningFolder.get(parent),
			to: alternatives
		});
	};

	// first pass: check attachments in notes' expected attachment folders
	for (const [note, attachFolder] of noteToAttachFolder.entries()) {
		const folder = plugin.app.vault.getAbstractFileByPath(attachFolder.attachFolder);
		if (!(folder instanceof TFolder)) {
			if (warnInConsole) { console.warn('stray attachments: could not resolve folder: ', attachFolder); }
			continue;
		}

		const referencedByNote = noteToAttachments.get(note);
		if (!referencedByNote) { continue; }

		// Direct children only: a subfolder the user created inside an attachment folder
		// (e.g. "Note (attachments)/diagrams/") is theirs to organise, and moving its
		// contents out would flatten that structure irreversibly.
		const filesInAttachFolder = folder.children.filter((c): c is TFile => c instanceof TFile);
		for (const attachment of filesInAttachFolder) {
			// this *attachment* is in *note*'s attach folder, but the *note* does not reference it!
			if (referencedByNote.list.has(attachment.path)) { continue; }

			const notes = attachmentToNotes.get(attachment.path);
			if (!notes) { continue; }

			record(attachment, destinationsFor(attachment, notes, maps));
		}
	}

	// second pass: check all referenced attachments not yet processed
	for (const [attachmentPath, notesList] of attachmentToNotes.entries()) {
		if (processedAttachments.has(attachmentPath)) { continue; }
		record(notesList.f, destinationsFor(notesList.f, notesList, maps));
	}

	return strays;
}

export async function moveStrayAttachments(plugin: ImportAttachments, selections: StrayAttachmentMove[]) {
	const vault = plugin.app.vault;
	let successCount = 0;

	for (const { sourcePath, destinationPath, sourceFile } of selections) {
		try {
			let destPath = joinPaths(destinationPath, sourceFile.name);
			if (sourcePath === destPath) {continue;}

			if (doesFileExist(vault, destPath)) {
				const existingFile = vault.getAbstractFileByPath(destPath);
				if (existingFile && existingFile.path !== sourceFile.path) {
					destPath = findNewFilename(vault, destPath);
				}
			}

			const destFolder = vault.getAbstractFileByPath(destinationPath);
			if (!destFolder || !(destFolder instanceof TFolder)) {await vault.createFolder(destinationPath);}

			const sourceFolder = sourceFile.parent;
			await plugin.app.fileManager.renameFile(sourceFile, destPath);
			successCount++;

			// Only clean up a folder that (a) the user asked us to clean up, (b) is one of
			// this plugin's attachment folders, and (c) is now empty. Deletion goes through
			// plugin.trashFile() so it honours the user's trash preference rather than
			// destroying the folder outright.
			if (plugin.settings.deleteAttachmentFolderWhenEmpty
				&& sourceFolder instanceof TFolder
				&& sourceFolder.children.length === 0
				&& plugin.matchAttachmentFolder(sourceFolder.path)) {
				try {
					await plugin.trashFile(sourceFolder);
				} catch (error) {
					console.error(`Failed to remove the emptied attachment folder ${sourceFolder.path}:`, error);
				}
			}
		} catch (error) {
			console.error(`Failed to move ${sourcePath}:`, error);
			new Notice(`Failed to move ${sourceFile.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
	return successCount;
}
