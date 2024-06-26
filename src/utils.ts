// utils.ts
import { promises as fs } from 'fs';  // This imports the promises API from fs
import * as path from 'path';         // Standard import for the path module
import * as crypto from 'crypto';

import { v4 as uuidv4 } from 'uuid';

export function getFilename(filepath: string) {
	return path.parse(filepath).name;
}

export async function arePathsSameFile(file1:string, file2:string) {
	try {
		const realpath1 = await fs.realpath(file1);
		const realpath2 = await fs.realpath(file2);
		return path.relative(realpath1,realpath2)==''
	} catch (error: unknown) {
		console.error('Error resolving paths:', error);
		return false;
	}
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

	const originalFilePath_parsed = path.parse(originalFilePath);

	const fileToImportName = originalFilePath_parsed.name;
	
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
	const destFilePath_parse = path.parse(destFilePath);

	let counter = 1;
	let fileExists;
	let newFilename = null;
	do {
		newFilename=path.join(destFilePath_parse.dir,`${destFilePath_parse.name} (${counter})${destFilePath_parse.ext}`);
		fileExists = await checkFileExists(newFilename);
		counter+=1;
	} while(fileExists);

	return newFilename;
}

export async function isFileInVault(vaultPath:string,filePath:string) {
	try {
		// Resolve the real (absolute) paths to handle symlinks and relative paths
		const realFilePath = await fs.realpath(filePath);
		const realVaultFolderPath = await fs.realpath(vaultPath);

		// Normalize the paths to ensure they are comparable
		const normalizedFilePath = path.normalize(realFilePath);
		const normalizedVaultFolderPath = path.normalize(realVaultFolderPath);

		// Check if the file path starts with the folder path
		// Ensure the folder path ends with a path separator to avoid partial folder name matches

		if(normalizedFilePath.startsWith(`${normalizedVaultFolderPath}${path.sep}`)) {
			// return normalizedFilePath.substring(normalizedVaultFolderPath.length).replace(/^\//,'');
			return normalizedFilePath;
		} else {
			return false;
		}
	} catch (error: unknown) {
		console.error('Error resolving paths:', error);
		return false;
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

export async function ensureDirectoryExists(path: string): Promise<boolean> {
	const doExist = await checkDirectoryExists(path);
	if (!doExist) {
		await fs.mkdir(path,{recursive: true});
	}
	return true;
}
