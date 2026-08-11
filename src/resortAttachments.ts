import { App, TFile, TFolder, CachedMetadata, Notice, getLinkpath } from 'obsidian';
import { parseFilePath, mapSoftSet, joinPaths, findNewFilename, doesFileExist } from './utils';
import type ImportAttachments from 'main';

export type SomeLink = { text: string, dest: string, resolvedDest: TFile };
export type DedupeFileList = {f: TFile, list: Map<string, TFile>};
export type DedupeLinkList = {f: TFile, list: Map<string, SomeLink>};

export type AttachFolder = { attachFolder: string, file: TFile };
export type AttachmentResortPair = { 
	from: string,
	file: TFile, 
	fromPath: string, 
	to: AttachFolder[] 
}

export type MovePairSelection = {
	sourcePath: string;
	destinationPath: string;
	sourceFile: TFile;
};

const NOTE_EXTENSIONS = new Set(["md", "canvas"]);
const warnInConsole = process.env.NODE_ENV === "development";

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

function unifyLinkCaches(app: App, input: { f: TFile, m: CachedMetadata | null}) {
	const links: SomeLink[] = [];
	if (!input.m) { return { f: input.f, links: []}; }

	const mergedLinks = [
		...(input.m?.links ?? []),
		...(input.m?.frontmatterLinks ?? []),
		...(input.m?.embeds ?? [])
	]

	for (const elem of mergedLinks) {
		const res = resolveLink(app, elem.link, input.f.path);
		if (res === null) {
			if (warnInConsole) { console.warn("resort: could not resolve link:", elem.original, `(link field: '${elem.link}')`); }
			continue;
		}
		// we are not interested in notes linking to other notes
		if (NOTE_EXTENSIONS.has(res.extension.toLowerCase())) { continue; }

		links.push({ text: elem.link, dest: elem.original, resolvedDest: res });
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
		.filter(e => e.m !== null && (
			!(e.m.embeds == null || e.m.embeds.length == 0) ||
			!(e.m.links == null || e.m.links.length === 0) ||
			!(e.m.frontmatterLinks == null || e.m.frontmatterLinks.length === 0)
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
 *    the command correctly reports that there is nothing to resort — instead of listing
 *    the whole vault once per note, each time offering to move a file to where it is.
 */
function destinationsFor(attachment: TFile, notes: DedupeFileList, maps: ReferenceMaps): AttachFolder[] {
	const currentFolder = attachment.parent?.path;

	const candidates = Array.from(notes.list.values())
		.map(ntf => maps.noteToAttachFolder.get(ntf.path))
		.filter((e): e is AttachFolder => e !== undefined);

	if (candidates.some(c => c.attachFolder === currentFolder)) { return []; }
	return candidates;
}

export function getAttachmentResortPairs(plugin: ImportAttachments) {
	const maps = buildReferenceMaps(plugin);
	const { noteToAttachFolder, noteToAttachments, attachmentToNotes } = maps;

	const attachmentResortPairs: AttachmentResortPair[] = [];
	const processedAttachments = new Set<string>();

	const record = (attachment: TFile, alternatives: AttachFolder[]) => {
		if (alternatives.length === 0 || processedAttachments.has(attachment.path)) { return; }
		processedAttachments.add(attachment.path);
		attachmentResortPairs.push({
			file: attachment,
			from: attachment.parent?.path ?? "no parent!",
			fromPath: attachment.path,
			to: alternatives
		});
	};

	// first pass: check attachments in notes' expected attachment folders
	for (const [note, attachFolder] of noteToAttachFolder.entries()) {
		const folder = plugin.app.vault.getAbstractFileByPath(attachFolder.attachFolder);
		if (!(folder instanceof TFolder)) {
			if (warnInConsole) { console.warn("resort: could not resolve folder: ", attachFolder); }
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

	return attachmentResortPairs;
}

export async function moveAttachmentPairs(plugin: ImportAttachments, selections: MovePairSelection[]) {
	const vault = plugin.app.vault;
	let successCount = 0;

	for (const { sourcePath, destinationPath, sourceFile } of selections) {
		try {
			let destPath = joinPaths(destinationPath, sourceFile.name);
			if (sourcePath === destPath) continue;

			if (doesFileExist(vault, destPath)) {
				const existingFile = vault.getAbstractFileByPath(destPath);
				if (existingFile && existingFile.path !== sourceFile.path) {
					destPath = findNewFilename(vault, destPath);
				}
			}

			const destFolder = vault.getAbstractFileByPath(destinationPath);
			if (!destFolder || !(destFolder instanceof TFolder)) await vault.createFolder(destinationPath);

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
