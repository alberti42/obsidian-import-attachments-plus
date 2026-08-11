// patchImportFunctions.ts

import { App, Vault, TFile } from 'obsidian';
import ImportAttachments from 'main';

import { parseFilePath, doesFileExist, findNewFilename } from 'utils';

// Save a reference to the original method for the monkey patch
let originalGetAvailablePathForAttachments: ((fileName: string, extension: string, currentFile: TFile | null) => Promise<string>) | null = null;
let originalSaveAttachment: ((fileName: string, fileExtension: string, fileData: ArrayBuffer) => Promise<TFile>) | null = null;

function unpatchImportFunctions() {
	if (originalGetAvailablePathForAttachments) {
		Vault.prototype.getAvailablePathForAttachments = originalGetAvailablePathForAttachments;
		originalGetAvailablePathForAttachments = null;
	}

	if(originalSaveAttachment) {
		App.prototype.saveAttachment = originalSaveAttachment;
		originalSaveAttachment = null;
	}
}

function patchImportFunctions(plugin: ImportAttachments) {

	if (!originalGetAvailablePathForAttachments) {
		originalGetAvailablePathForAttachments = Vault.prototype.getAvailablePathForAttachments;
	}

	// Monkey patch the getAvailablePathForAttachments method
	Vault.prototype.getAvailablePathForAttachments = async function patchedGetAvailablePathForAttachments(fileName: string, extension: string, currentFile: TFile | null): Promise<string> {
		if (!originalGetAvailablePathForAttachments) {
			throw new Error('Could not execute the original getAvailablePathForAttachments function.');
		}
		
		const currentFile_parsed = currentFile ? parseFilePath(currentFile.path) : undefined;
		
		const attachmentPath = await plugin.createAttachmentName(fileName + '.' + extension, currentFile_parsed);

		// Obsidian's own implementation ends with `getAvailablePath`, so it never returns a path
		// that is already taken. Callers (`saveAttachment`, but also third-party plugins reaching us
		// through `FileManager.getAvailablePathForAttachment`) create a file at the returned path
		// without checking, so we have to honour the same contract or we silently overwrite
		// attachments whenever the name pattern is not unique (e.g. `${original}` or `${notename}`).
		if (doesFileExist(plugin.app.vault, attachmentPath)) {
			return findNewFilename(plugin.app.vault, attachmentPath);
		}

		return attachmentPath;
	};

	if (!originalSaveAttachment) {
		originalSaveAttachment = App.prototype.saveAttachment;
	}

	// Function to save an attachment
	App.prototype.saveAttachment = async function patchedSaveAttachment(fileName: string, fileExtension: string, fileData: ArrayBuffer): Promise<TFile> {
		if (!originalSaveAttachment) {
			throw new Error('Could not execute the original saveAttachment function.');
		}

		const newAttachmentFile = await originalSaveAttachment.apply(this, [fileName, fileExtension, fileData]);

		/*
		// The current active file in the workspace
		const activeFile = plugin.app.workspace.getActiveFile();

		// Step 1: Determine an available path for the attachment
		// `getAvailablePathForAttachments` is a method to get a unique path for the new attachment,
		// preventing overwrites. It takes into account the current active file to determine the attachment path.
		const attachmentPath = await plugin.app.vault.getAvailablePathForAttachments(fileName, fileExtension, activeFile);

		// Step 2: Create a binary file in the vault at the determined path
		// `createBinary` is a method to create a binary file (like an image or a PDF) at the specified path.
		// The method returns the created file as a `TFile` object.
		const newAttachmentFile = await plugin.app.vault.createBinary(attachmentPath, fileData);
		*/
		
		// Return the created file
		return newAttachmentFile;
	}
}

export { patchImportFunctions, unpatchImportFunctions };
