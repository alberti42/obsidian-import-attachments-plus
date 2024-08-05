// patchImportFunctions.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { App, Vault, TFile } from 'obsidian';
import ImportAttachments from 'main';

import { parseFilePath } from 'utils';

// Save a reference to the original method for the monkey patch
let originalGetAvailablePathForAttachments: ((fileName: string, extension: string, currentFile: TFile | null) => Promise<string>) | null = null;
let originalSaveAttachment: ((fileName: string, fileExtension: string, fileData: ArrayBuffer) => Promise<TFile>) | null = null;
let data: ArrayBuffer | null = null;

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
			throw new Error("Could not execute the original getAvailablePathForAttachments function.");
		}

		if(!data) throw new Error("The variable data is unexpectedly null.")
		
		const currentFile_parsed = currentFile ? parseFilePath(currentFile.path) : undefined;
		
		return await plugin.createAttachmentName(fileName + "." + extension,data,currentFile_parsed);
	};

	if (!originalSaveAttachment) {
		originalSaveAttachment = App.prototype.saveAttachment;
	}

	// Function to save an attachment
	App.prototype.saveAttachment = async function patchedSaveAttachment(fileName: string, fileExtension: string, fileData: ArrayBuffer): Promise<TFile> {
		if (!originalSaveAttachment) {
			throw new Error("Could not execute the original saveAttachment function.");
		}

		// Save `data` in the module variable. This allows getAvailablePathForAttachments, which is called from `originalsaveAttachment`, to use `data`
		data = fileData;
		const newAttachmentFile = await originalSaveAttachment.apply(this, [fileName, fileExtension, fileData]);
		data = null;

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
