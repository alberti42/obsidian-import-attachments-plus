// utils.ts
import { promises as fs } from 'fs';  // This imports the promises API from fs
import * as crypto from 'crypto';

import { v4 as uuidv4 } from 'uuid';
import { App, normalizePath, TAbstractFile, TFile, TFolder, Vault } from 'obsidian';

import { ParsedPath } from 'types';
import * as path from 'path';

// Joins multiple path segments into a single normalized path.
export function joinPaths(...paths: string[]): string {
	return normalizePath(paths.join('/'));
}

export function parseFilePath(filePath: string): ParsedPath {
    filePath = normalizePath(filePath);
    const lastSlashIndex = filePath.lastIndexOf('/');

    const dir = lastSlashIndex !== -1 ? filePath.substring(0, lastSlashIndex) : '/';
    const base = lastSlashIndex !== -1 ? filePath.substring(lastSlashIndex + 1) : filePath;
    const extIndex = base.lastIndexOf('.');
    const filename = extIndex !== -1 ? base.substring(0, extIndex) : base;
    const ext = extIndex !== -1 ? base.substring(extIndex) : '';

    return { dir, base, filename, ext };
}

export function isInstanceOfFolder(file: TAbstractFile): file is TFolder {
	return file instanceof TFolder;
}

export function arePathsSameFile(vault: Vault, filePath1: string, filePath2: string): boolean {
    const file1: TAbstractFile | null = vault.getAbstractFileByPath(filePath1);
    const file2: TAbstractFile | null = vault.getAbstractFileByPath(filePath2);

    if (file1 instanceof TFile && file2 instanceof TFile) {
        return file1.path === file2.path;
    }

    return false;
}

async function hashFile(filePath: string): Promise<string> {
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

export async function createAttachmentName(namePattern:string,dateFormat:string,originalFilePath:string): Promise<string> {

	const originalFilePath_parsed = parseFilePath(originalFilePath);

	const fileToImportName = originalFilePath_parsed.filename;
	
	let attachmentName = namePattern.replace(/\$\{original\}/g, fileToImportName)
									.replace(/\$\{uuid\}/g, uuidv4())
									.replace(/\$\{date\}/g, formatDateTime(dateFormat));

	if(namePattern.includes('${md5}')) {
		let hash = ''
		try {
			hash = await hashFile(originalFilePath);
		} catch (err: unknown) {
			console.error('Error hashing the file:', err);
		}
		attachmentName = attachmentName.replace(/\$\{md5\}/g, hash);
	}

	// add the extension
	attachmentName += originalFilePath_parsed.ext;
	
	return attachmentName;
}

export async function findNewFilename(destFilePath: string,)
{
	const destFilePath_parse = parseFilePath(destFilePath);

	let counter = 1;
	let fileExists;
	let newFilename = null;
	do {
		newFilename=joinPaths(destFilePath_parse.dir,`${destFilePath_parse.filename} (${counter})${destFilePath_parse.ext}`);
		fileExists = await checkFileExists(newFilename);
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

export async function checkDirectoryExists(dirPath: string): Promise<boolean> {
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

export function doesFolderExist(app: App, relativePath: string): boolean {
		const file: TAbstractFile | null = app.vault.getAbstractFileByPath(relativePath);
		return !!file && isInstanceOfFolder(file);
	}

export async function createFolderIfNotExists(app: App, folderPath: string) {
		if(doesFolderExist(app,folderPath)) return;

		try {
			await app.vault.createFolder(folderPath);
		} catch (error) {
			throw new Error(`Failed to create folder at ${folderPath}: ${error}`);
		}
	}