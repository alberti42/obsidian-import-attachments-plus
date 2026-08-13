// tests/shims/obsidian.ts
//
// The `obsidian` npm package ships type declarations only — there is no runtime to
// import — so anything that touches TFile, TFolder or normalizePath cannot execute
// outside Obsidian. The headless suite aliases 'obsidian' to this file (see the
// `tests` mode in esbuild.config.mjs).
//
// Keep this minimal and faithful. It exists so that pure logic can be tested, not to
// reimplement Obsidian: if a test needs much more than this, that behaviour probably
// belongs in the in-app suite instead.

export class TAbstractFile {
	path: string;
	name: string;
	parent: TFolder | null = null;

	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() ?? path;
	}
}

export class TFile extends TAbstractFile {
	basename: string;
	extension: string;

	constructor(path: string) {
		super(path);
		const dot = this.name.lastIndexOf('.');
		this.basename = dot === -1 ? this.name : this.name.slice(0, dot);
		this.extension = dot === -1 ? '' : this.name.slice(dot + 1);
	}
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
}

/**
 * Mirrors Obsidian's normalizePath: collapse duplicate slashes, drop a leading and
 * trailing slash, and normalise unicode.
 *
 * The `|| '/'` is not decoration. Stripping the slashes from '/' leaves an empty
 * string, but Obsidian returns '/' — the vault root is a path, not nothing. This was
 * wrong here until the ROOT spec passed headlessly and failed in the app, which is the
 * entire reason the pure specs run in both places. Do not "simplify" it away, and do
 * not add behaviour here that has not been checked against the real thing the same way.
 */
export function normalizePath(path: string): string {
	const normalized = path
		.replace(/([\\/])+/g, '/')
		.replace(/(^\/)|(\/$)/g, '')
		.normalize('NFC');
	return normalized || '/';
}

/** Strip a subpath (`#heading`, `^block`) from a link target. */
export function getLinkpath(linktext: string): string {
	const hash = linktext.indexOf('#');
	return hash === -1 ? linktext : linktext.slice(0, hash);
}

export function requireApiVersion(): boolean {
	return true;
}

// Declared so modules that merely reference these types still compile in the shim
// build. They are not used by the headless tests.
export class Plugin {}
export class Modal {}
export class Component {}
export class Notice { constructor() { /* no-op */ } }
export class PluginSettingTab {}
export class Setting {}
export class FileManager {}
export class Vault {}
export const Platform = { isDesktopApp: true, isMobileApp: false };
