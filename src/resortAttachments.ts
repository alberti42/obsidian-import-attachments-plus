import { TFile, CachedMetadata } from 'obsidian';
import { parseFilePath, mapSoftSet } from './utils';
import type ImportAttachments from 'main';

declare const app: any;
export type AttachFolder = { attachFolder: string, file: TFile };
export type SomeLink = {
	text: string,
	dest: string,
	resolvedDest: TFile
}
type dedupeFileList = {f: TFile, list: Map<string, TFile>};
type dedupeLinkList = {f: TFile, list: Map<string, SomeLink>};

const NOTE_EXTENSIONS = new Set(["md", "canvas"]);

const noteToAttachFolder = new Map<string, AttachFolder>();

// deduplicated on link.resolvedDest.path
const noteToAttachments = new Map<string, dedupeLinkList>();
// deduplicated on TFile.path
const attachmentToNotes = new Map<string, dedupeFileList>();

function unifyLinkCaches(input: { f: TFile, m: CachedMetadata | null}) {
	const links: SomeLink[] = [];
	if (!input.m) return { f: input.f, links: []};

	for (const elem of [...(input.m?.links ?? []), ...(input.m?.frontmatterLinks ?? []) ]) {
		if (!elem.original || elem.original.startsWith("[[#")) continue; // skip [[#heading]]

		let dest = elem.original;
		if (dest.startsWith("[[") && dest.endsWith("]]")) { // strip [[ and ]]
			dest = dest.replace("[[", "").replace("]]", "");
		}
		if (dest.match(/^\[.+\]\(.+\)$/)) continue; // skip links like [components](#components)
		dest = dest.replace(/(?:\||\\\||#|\\#).+$/, ""); // strip |alt, #heading, #heading|alt

		const res: TFile | null = app.metadataCache.getFirstLinkpathDest(dest, input.f.path);
		if (res == null) {
			console.warn("could not resolve link:", elem.original, `(parsed as: '${dest}')`);
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

	const filesWithLinks = (app.vault.getFiles() as TFile[])
		.filter(t => NOTE_EXTENSIONS.has(t.extension.toLowerCase()))
		.map(t => ({ f: t, m: app.metadataCache.getFileCache(t) as CachedMetadata | null }))
		.filter(e => e.m !== null && (
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

		// Deduplicate links
		for (const link of file.links) {
			if (!attachmentToNotes.has(link.resolvedDest.path)) {
				attachmentToNotes.set(link.resolvedDest.path, { f: link.resolvedDest, list: new Map<string, TFile>() });
			}

			// bind note -> attachment
			mapSoftSet(noteToAttachments.get(file.f.path)!.list, file.f.path, link);

			// bind attachment -> note
			mapSoftSet(attachmentToNotes.get(link.resolvedDest.path)!.list, link.resolvedDest.path, file.f);
		}
	}
}

export async function getAttachmentResortPairs(plugin: ImportAttachments) {

	buildReferenceMaps(plugin);
	console.log(noteToAttachFolder);
	console.log(noteToAttachments);
	console.log(attachmentToNotes);

	return [];
}