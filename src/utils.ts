// utils.ts
import { promises as fs } from 'fs';  // This imports the promises API from fs
import * as crypto from 'crypto';

import { v4 as uuidv4 } from 'uuid';
import { Vault, normalizePath, TAbstractFile, TFile, TFolder, Editor, FileExplorerView } from 'obsidian';

import { ParsedPath as ParsedFilePath, ParsedFolderPath } from 'types';
import * as path from 'path';

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
	return posixPath.split(path.posix.sep).join(path.sep);
}

export async function hashFile(filePath: string): Promise<string> {
	const hash = crypto.createHash('md5');
	let fileHandle = null;
	try {
		fileHandle = await fs.open(filePath, 'r'); // Open the file to get a filehandle
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
	let newFilename = null;
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
		const stats = await fs.stat(filePath);
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
		const stats = await fs.stat(dirPath);
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
	
	// Create a new TFile object
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
	if(doesFolderExist(vault,folderPath)) return;

	try {
		await vault.createFolder(folderPath);
	} catch (error) {
		throw new Error(`Failed to create folder at ${folderPath}: ${error}`);
	}
}

export function mapSoftSet<K, V>(map: Map<K, V>, key: K, value: V) {
	if (!map.has(key)) map.set(key, value);
}
	
export { uuidv4, formatDateTime };

