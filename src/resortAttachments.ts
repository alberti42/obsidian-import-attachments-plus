import { TFile, TFolder, normalizePath, CachedMetadata, LinkCache, ReferenceLinkCache, FrontmatterLinkCache } from 'obsidian';
import { parseFilePath, createFolderIfNotExists, joinPaths, doesFileExist, findNewFilename } from './utils';
import type ImportAttachments from 'main';

declare const app: any;

export type AttachmentResortPair = {
	attachmentPath: string;
	fromFolder: string;
	toFolder: string;
	fromNote: string;
	toNote: string;
};

const NOTE_EXTENSIONS = new Set(["md", "canvas"]);

const noteToAttachFolder = new Map<String, String>();
const	noteToFile = new Map<String, Set<TFile>>();

export type SomeLink = {
	text: string,
	dest: string,
	resolvedDest?: string
}

function cleanLinkDest(link: string) {
	let link2 = link;
	
}

function unifyLinkCaches(input: { f: TFile, m: CachedMetadata | null}) {
	const links: SomeLink[] = [];
	if (input.m) {
		for (const elem of input.m?.links ?? []) {
			if (!elem.original || elem.original.startsWith("[[#")) continue;
			const res = app.metadataCache.getFirstLinkpathDest(elem.original, input.f.path); ;
			console.log("res", res, "for", elem.original);
			links.push({ text: elem.link, dest: elem.original });
		}
		for (const elem of input.m?.frontmatterLinks ?? []) {
			if (!elem.original) continue;
			links.push({ text: elem.link, dest: elem.original });
		}
	}

	return { f: input.f, links };
}

function buildReferenceMaps() {
	const files = (app.vault.getFiles() as TFile[])
		.filter(t => NOTE_EXTENSIONS.has(t.extension.toLowerCase()))
		.map(t => ({ f: t, m: app.metadataCache.getFileCache(t) as CachedMetadata | null }))
		.filter(e => e.m !== null && (
			!(e.m.links == null || e.m.links.length === 0) ||
			!(e.m.frontmatterLinks == null || e.m.frontmatterLinks.length === 0)
		))
		.slice(0, 100)
		.map(unifyLinkCaches)

	// for (const tup of files) {
	// 	console.log(tup);
	// }
}

export async function getAttachmentResortPairs(plugin: ImportAttachments) {

	buildReferenceMaps()
	return [];

	// return files;
}