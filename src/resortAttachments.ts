import { TFile, TFolder, normalizePath, CachedMetadata, LinkCache, ReferenceLinkCache, FrontmatterLinkCache } from 'obsidian';
import { parseFilePath, createFolderIfNotExists, joinPaths, doesFileExist, findNewFilename } from './utils';
import type ImportAttachments from 'main';

declare const app: any;

export type FileSet = { set: Set<SomeLink>, file: TFile };
export type AttachFolder = { attachFolder: string, file: TFile };

const NOTE_EXTENSIONS = new Set(["md", "canvas"]);

const noteToAttachFolder = new Map<string, AttachFolder>();

const	noteToAttachment = new Map<string, FileSet>();
const attachmentToNote = new Map<string, FileSet>();

export type SomeLink = {
	text: string,
	dest: string,
	resolvedDest: TFile
}

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
		.slice(0, 10);

	for (const file of filesWithLinks) {
		noteToAttachFolder.set(file.f.path, {
			attachFolder: plugin.getAttachmentFolderOfMdNote(parseFilePath(file.f.path)),
			file: file.f
		});

		for (const link of file.links) {
			if (!noteToAttachment.has(file.f.path)) {
				noteToAttachment.set(file.f.path, { set: new Set(), file: file.f })
			} else {
				noteToAttachment.get(file.f.path)?.set.add(link);
			}
		}
	}

}

export async function getAttachmentResortPairs(plugin: ImportAttachments) {

	buildReferenceMaps(plugin);
	return [];

	// return files;
}