import { App, TFile, TFolder, CachedMetadata, Notice } from 'obsidian';
import { parseFilePath, mapSoftSet, getAllFilesInFolder, joinPaths, findNewFilename, doesFileExist } from './utils';
import type ImportAttachments from 'main';

declare const app: App;
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

const noteToAttachFolder = new Map<string, AttachFolder>();

// deduplicated on link.resolvedDest.path
const noteToAttachments = new Map<string, DedupeLinkList>();
// deduplicated on TFile.path
const attachmentToNotes = new Map<string, DedupeFileList>();

function unifyLinkCaches(input: { f: TFile, m: CachedMetadata | null}) {
	const links: SomeLink[] = [];
	if (!input.m) return { f: input.f, links: []};

	const mergedLinks = [
		...(input.m?.links ?? []),
		...(input.m?.frontmatterLinks ?? []),
		...(input.m?.embeds ?? [])
	]

	for (const elem of mergedLinks) {
		if (!elem.original || elem.original.startsWith("[[#")) continue; // skip [[#heading]]

		let dest = elem.original;

		// strip [[ and ]], ![[ and ]]
		if (dest.startsWith("[[") && dest.endsWith("]]")) dest = dest.slice(2, -2);
		if (dest.startsWith("![[") && dest.endsWith("]]")) dest = dest.slice(3, -2);
		if (dest.match(/^\[.+\]\(.+\)$/)) continue; // skip links like [components](#components)
		dest = dest.replace(/(?:\||\\\||#|\\#).+$/, ""); // strip |alt, #heading, #heading|alt

		const res: TFile | null = app.metadataCache.getFirstLinkpathDest(dest, input.f.path);
		if (res == null) {
			if (warnInConsole) console.warn("resort: could not resolve link:", elem.original, `(parsed as: '${dest}')`);
			continue;
		}
		// we are not interested in notes linking to other notes
		if (NOTE_EXTENSIONS.has(res.extension.toLowerCase())) continue;

		links.push({ text: elem.link, dest: elem.original, resolvedDest: res });
	}

	return { f: input.f, links };
}

function buildReferenceMaps(plugin: ImportAttachments) {
	app.metadataCache.trigger('resolve');

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
		.map(unifyLinkCaches)
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
}

export async function getAttachmentResortPairs(plugin: ImportAttachments) {
	noteToAttachFolder.clear();
	noteToAttachments.clear();
	attachmentToNotes.clear();
	buildReferenceMaps(plugin);

	const attachmentResortPairs: AttachmentResortPair[] = [];
	const processedAttachments = new Set<string>();

	// first pass: check attachments in notes' expected attachment folders
	for (const [note, attachFolder] of noteToAttachFolder.entries()) {
		const folder = app.vault.getAbstractFileByPath(attachFolder.attachFolder) as TFolder;
		if (folder == null) {
			if (warnInConsole) console.warn("resort: could not resolve folder: ", attachFolder);
			continue;
		}

		const filesInAttachFolder = getAllFilesInFolder(folder);
		for (const attachment of filesInAttachFolder) {
			if (!noteToAttachments.has(note)) continue;

			// this *attachment* is in *note*'s attach folder, but the *note* does not reference it!
			if (!noteToAttachments.get(note)?.list.has(attachment.path)) {
				if (!attachmentToNotes.get(attachment.path)) continue;

				const alternatives = Array.from(attachmentToNotes.get(attachment.path)!.list.values())
					.map(ntf => noteToAttachFolder.get(ntf.path))
					.filter(e => typeof e !== "undefined");

				if (alternatives.length === 0) continue;
				processedAttachments.add(attachment.path);

				attachmentResortPairs.push({ 
					file: attachment, 
					from: attachment.parent?.name ?? "no parent!", 
					fromPath: attachment.path, 
					to: alternatives 
				});
			}
		}
	}

	// second pass: check all referenced attachments not yet processed
	for (const [attachmentPath, notesList] of attachmentToNotes.entries()) {
		if (processedAttachments.has(attachmentPath)) continue;

		const attachment = notesList.f;
		const alternatives = Array.from(notesList.list.values())
			.map(ntf => noteToAttachFolder.get(ntf.path))
			.filter(e => typeof e !== "undefined");

		if (alternatives.length === 0) continue;

		const isInCorrectFolder = alternatives.some(alt => alt.attachFolder === attachment.parent?.path);
		if (!isInCorrectFolder) {
			attachmentResortPairs.push({ 
				file: attachment, 
				from: attachment.parent?.name ?? "no parent!", 
				fromPath: attachment.path, 
				to: alternatives 
			});
		}
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

			if (sourceFolder && sourceFolder instanceof TFolder && sourceFolder.children.length === 0) {
				try { await vault.delete(sourceFolder); } catch { }
			}
		} catch (error) {
			console.error(`Failed to move ${sourcePath}:`, error);
			new Notice(`Failed to move ${sourceFile.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
	return successCount;
}
