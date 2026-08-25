// utils.ts

import { Notice, Vault, normalizePath, TAbstractFile, TFile, TFolder } from 'obsidian';

import { ParsedPath as ParsedFilePath, ParsedFolderPath } from 'types';

/**
 * Node builtins, required lazily — the same treatment `electron` already gets.
 *
 * They used to be static imports, which put `require('fs')` at the top of the bundle and made the
 * plugin's *loading* depend on Obsidian's mobile `require` being lenient about modules it does not
 * have. Every use is on a desktop-only path anyway — file I/O outside the vault, MD5 hashing, OS
 * separator conversion — so mobile never reaches them, and now never needs them to load either.
 *
 * Note `uuidv4()` below does **not** use Node's crypto: `crypto.randomUUID()` is a web global, so
 * that one works on every platform.
 */
export function nodeFs(): typeof import('fs').promises {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose; see above
	return (require('fs') as typeof import('fs')).promises;
}

function nodePath(): typeof import('path') {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose; see above
	return require('path') as typeof import('path');
}

function nodeCrypto(): typeof import('crypto') {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose; see above
	return require('crypto') as typeof import('crypto');
}

/**
 * Report a background failure to the user.
 *
 * For promises nobody awaits. A rejection with no handler is invisible — no notice, no error,
 * nothing in the console — which is exactly how a broken delete path looked like a no-op for
 * several releases (see C27/C29 in obsidian_plugin_review.md). If a promise is discarded
 * deliberately it should be `void`-ed; if its failure matters to the user, it should land here.
 *
 * `what` is phrased for a user, e.g. 'Could not import the pasted files'.
 */
export function reportFailure(what: string, err: unknown): void {
	console.error(`Import Attachments+: ${what}:`, err);
	new Notice(`${what}. See the developer console for details.`);
}

// Joins multiple path segments into a single normalized path.
export function joinPaths(...paths: string[]): string {
	return paths.join('/');
}

export function parseFilePath(filePath: string): ParsedFilePath {
	filePath = normalizePath(filePath);
	const lastSlashIndex = filePath.lastIndexOf('/');

	const dir = lastSlashIndex !== -1 ? filePath.substring(0, lastSlashIndex) : '';
	const base = lastSlashIndex !== -1 ? filePath.substring(lastSlashIndex + 1) : filePath;
	const extIndex = base.lastIndexOf('.');
	const filename = extIndex !== -1 ? base.substring(0, extIndex) : base;
	const ext = extIndex !== -1 ? base.substring(extIndex) : '';

	return { dir, base, filename, ext, path: filePath };
}

export function parseFolderPath(folderPath: string): ParsedFolderPath {
    folderPath = normalizePath(folderPath);
    const lastSlashIndex = folderPath.lastIndexOf('/');

    const dir = lastSlashIndex !== -1 ? folderPath.substring(0, lastSlashIndex) : '';
    const foldername = lastSlashIndex !== -1 ? folderPath.substring(lastSlashIndex + 1) : folderPath;

    return { dir, foldername, path: folderPath };
}

export function isInstanceOfFolder(file: TAbstractFile): file is TFolder {
	return file instanceof TFolder;
}

export function isInstanceOfFile(file: TAbstractFile): file is TFile {
	return file instanceof TFile;
}

export function arePathsSameFile(vault: Vault, filePath1: string, filePath2: string): boolean {
	const file1: TAbstractFile | null = vault.getAbstractFileByPath(filePath1);
	const file2: TAbstractFile | null = vault.getAbstractFileByPath(filePath2);

	if (file1 instanceof TFile && file2 instanceof TFile) {
		return file1.path === file2.path;
	}

	return false;
}

export function makePosixPathOScompatible(posixPath:string): string {
	const path = nodePath();
	return posixPath.split(path.posix.sep).join(path.sep);
}

export async function hashFile(filePath: string): Promise<string> {
	const hash = nodeCrypto().createHash('md5');
	let fileHandle = null;
	try {
		fileHandle = await nodeFs().open(filePath, 'r'); // Open the file to get a filehandle
		const stream = fileHandle.createReadStream();  // Create a read stream from the file handle

		for await (const chunk of stream) {
			hash.update(chunk);  // Update hash with data chunk
		}
		return hash.digest('hex');  // Return the hex digest
	} finally {
		if (fileHandle) {
			await fileHandle.close();  // Make sure to close the file handle
		}
	}
}

// Hashes data we already hold in memory, e.g. an image coming from the clipboard, which has no
// path to hash yet. Kept next to hashFile so the two ${md5} sources stay side by side.
export function hashBuffer(data: ArrayBuffer): string {
	return nodeCrypto().createHash('md5').update(new Uint8Array(data)).digest('hex');
}

function formatDateTime(dateFormat:string):string {
	try {
		// use of Moment.js to format the current date
		const dateTime = window.moment().format(dateFormat);
		return dateTime; 
	} catch (error: unknown) {
		if(error instanceof Error) {
			console.error('Error formatting date:', error.message);
		} else {
			console.error('Error formatting date:', error);
		}
		return 'DATE_ERROR';
	}
}

/*
// Function to get the available path for attachments from Obsidian
function getAvailablePathForAttachments = async function (fileName: string, extension: string, currentFile: TFile | null): Promise<string> {
	// Get the attachment folder path configuration
	let attachmentFolderPath = this.getConfig("attachmentFolderPath");
	const isCurrentFolder = attachmentFolderPath === "." || attachmentFolderPath === "./";
	let relativePath: string | null = null;

	// If the attachment folder path starts with './', remove the './'
	if (attachmentFolderPath.startsWith("./")) {
		relativePath = attachmentFolderPath.slice(2);
	}

	// If using the current folder, set the attachment folder path accordingly
	if (isCurrentFolder) {
		attachmentFolderPath = currentFile ? currentFile.parent?.path : "";
	} else if (relativePath) {
		attachmentFolderPath = (currentFile ? currentFile.parent?.getParentPrefix() : "") + relativePath;
	}

	// Normalize the paths
	attachmentFolderPath = normalizePath(attachmentFolderPath);
	fileName = normalizePath(fileName);

	// Try to get the abstract file by the insensitive path
	let folder: TAbstractFile | null = this.getAbstractFileByPathInsensitive(attachmentFolderPath);

	// If the folder does not exist and relativePath is specified, create the folder
	if (!folder && relativePath) {
		await this.createFolder(attachmentFolderPath);
		folder = this.getAbstractFileByPathInsensitive(attachmentFolderPath);
	}

	// If the folder is an instance of TFolder, get the available path within the folder
	if (folder instanceof TFolder) {
		return this.getAvailablePath(folder.getParentPrefix() + fileName, extension);
	} else {
		// Otherwise, get the available path in the root
		return this.getAvailablePath(fileName, extension);
	}
}
*/

export function findNewFilename(vault: Vault, destFilePath: string): string
{
	const destFilePath_parse = parseFilePath(destFilePath);

	let counter = 1;
	let fileExists;
	let newFilename: string;
	do {
		newFilename=joinPaths(destFilePath_parse.dir,`${destFilePath_parse.filename} (${counter})${destFilePath_parse.ext}`);
		fileExists = doesFileExist(vault,newFilename);
		counter+=1;
	} while(fileExists);

	return newFilename;
}

export async function getFileInVault(vaultPath: string, filePath: string): Promise<string | null> {
	try {
		// Resolve the real (absolute) paths to handle symlinks and relative paths
		const fs = nodeFs();
		const path = nodePath();
		const realFilePath = await fs.realpath(filePath);
		const realVaultFolderPath = await fs.realpath(vaultPath);

		// Normalize the paths to ensure they are comparable
		const normalizedFilePath = path.normalize(realFilePath);
		const normalizedVaultFolderPath = path.normalize(realVaultFolderPath);

		// Get the relative path from the vault folder to the file
		const relativePath = path.relative(normalizedVaultFolderPath, normalizedFilePath);

		// Check if the relative path is outside the vault folder
		if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
			return relativePath;
		} else {
			return null;
		}
	} catch (error: unknown) {
		console.error('Error resolving paths:', error);
		return null;
	}
}

export async function checkFileExists(filePath: string): Promise<boolean> {
	try {
		const stats = await nodeFs().stat(filePath);
		return stats.isFile();  // Check if the path is a directory
	} catch (error: unknown) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return false;  // The directory does not exist
		}
		throw error; // Re-throw the error if it's not related to the existence check
	}
}

export async function doesDirectoryOutsideVaultExist(dirPath: string): Promise<boolean> {
	try {
		const stats = await nodeFs().stat(dirPath);
		return stats.isDirectory();  // Check if the path is a directory
	} catch (error: unknown) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return false;  // The directory does not exist
		}
		throw error; // Re-throw the error if it's not related to the existence check
	}
}

export function doesFolderExist(vault: Vault, relativePath: string): boolean {
	const file: TAbstractFile | null = vault.getAbstractFileByPath(relativePath);
	return !!file && isInstanceOfFolder(file);
}

export function doesFileExist(vault: Vault, relativePath: string): boolean {
	const file: TAbstractFile | null = vault.getAbstractFileByPath(relativePath);
	return !!file && isInstanceOfFile(file);
}

// Custom function to create a mock TFile object
export function createMockTFile(vault:Vault,filepath:string): TFile {

	const { filename, path, ext } = parseFilePath(filepath);
	
	// Deliberate cast, and the scan's suggested `instanceof TFile` check does not apply:
	// this file is not in the vault yet, so there is no TFile to narrow. Obsidian exports
	// no TFile constructor, so grafting the prototype is the only way to hand the rest of
	// the code something that behaves like one. No eslint-disable here on purpose: the rule
	// that flags this ships with the community scanner, not with this config, and ESLint 10
	// errors on a directive naming a rule it cannot resolve.
	const tfile = Object.create(TFile.prototype) as TFile;

	// Set necessary properties
	tfile.path = path;
	tfile.name = filename;
	tfile.vault = vault;
	tfile.parent = null;
    tfile.extension = ext;
  
	return tfile;
}

export async function filterOutFolders(filesArray: File[]) {
	const nonFolderFilesArray: File[] = [];
	const foldersArray: File[] = [];
    
    // Use Promise.all with map to handle asynchronous operations
	await Promise.all(filesArray.map(async (file:File) => {
        // console.log(file);
        // console.log(file.path);
    
		if (await doesDirectoryOutsideVaultExist(file.path)) {
			foldersArray.push(file); // If it's a folder, add to foldersArray
		} else {
			nonFolderFilesArray.push(file); // If it's not a folder, add to nonFolderFilesArray
		}
	}));

	return {nonFolderFilesArray, foldersArray};
}

export async function createFolderIfNotExists(vault: Vault, folderPath: string) {
	if(doesFolderExist(vault,folderPath)) { return; }

	try {
		await vault.createFolder(folderPath);
	} catch (error) {
		throw new Error(`Failed to create folder at ${folderPath}`, { cause: error });
	}
}

export function mapSoftSet<K, V>(map: Map<K, V>, key: K, value: V) {
	if (!map.has(key)) { map.set(key, value); }
}

// Random RFC 4122 v4 UUID; replaces the former `uuid` package dependency.
function uuidv4(): string {
	// The *web* global, not Node's crypto: this one has to work on mobile too.
	return crypto.randomUUID();
}

export { uuidv4, formatDateTime };

