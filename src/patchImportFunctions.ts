// patchImportFunctions.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { App, Vault, TFile, FileStats } from 'obsidian';
import ImportAttachments from 'main';

// Save a reference to the original method for the monkey patch
let originalGetAvailablePathForAttachments: ((fileName: string, extension: string, currentFile: TFile | null) => Promise<string>) | null = null;
let originalSaveAttachment: ((fileName: string, fileExtension: string, fileData: ArrayBuffer) => Promise<TFile>) | null = null;
let originalOnChange: ((eventType: string, filePath: string, oldPath?: string, stat?: FileStats) => void) | null = null;
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

	if(originalOnChange) {
		Vault.prototype.onChange = originalOnChange;
		originalOnChange = null;
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
		
		return await plugin.createAttachmentName(fileName + "." + extension,data);
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

	return;

	if (!originalOnChange) {
		originalOnChange = Vault.prototype.onChange;
	}

	function matchesPatternWithHolder(filePath: string): boolean {
		// Check if filePath starts with startsWidth or contains /startsWidth
		const startsWithMatch = filePath.startsWith(plugin.folderPathStartsWith) || filePath.includes(`/${plugin.folderPathStartsWith}`);
		
		// Check if filePath ends with endsWidth
		const endsWithMatch = filePath.endsWith(plugin.folderPathEndsWith);
		
		// Return true only if both conditions are met
		return startsWithMatch && endsWithMatch;
	}

	function matchesPatternWithoutHolder(filePath: string): boolean {
		const folderName = plugin.settings.folderPath;
		return filePath.endsWith(`/${folderName}`) || filePath === folderName;
	}

	Vault.prototype.onChange = function (this: Vault, eventType: string, filePath: string, oldPath?: string, stat?: FileStats) {
		if (!originalOnChange) {
			throw new Error("Could not execute the original onChange function.");
		}

		// const fileExplorerPlugin = plugin.app.internalPlugins.getPluginById('file-explorer');
		
		if(filePath.endsWith('.xyz')) {
			// console.log("XYZ:",eventType);
			// console.log(originalOnChange);
			originalOnChange.call(this, eventType, filePath, oldPath, stat);
			return;
		}

		if(filePath.endsWith('.md')) {
			// console.log("MD:",eventType);
			return;
		}

		// if (eventType === 'folder-created') {
		// 	const placeholder = "${notename}";

		// 	if (plugin.settings.folderPath.includes(placeholder) && matchesPatternWithHolder(filePath)) {
		// 		// console.log("1",filePath)
		// 		// console.log(TFolder);

		// 		// Handle folder creation event manually
		// 		const newFolder = new TFolder(this, filePath);
		// 		this.fileMap[filePath] = newFolder;
		// 		// debugger
		// 		this.addChild(newFolder);

		// 		this.trigger("create", this.fileMap[filePath]);
		// 		return;
		// 	} else if (matchesPatternWithoutHolder(filePath)) {
		// 		console.log("2",filePath)
		// 	}
		// }

		originalOnChange.call(this, eventType, filePath, oldPath, stat);
	};

    // const fileExplorer = plugin.app.internalPlugins.getPluginById('file-explorer');
	// const xyz = fileExplorer.views['file-explorer']
    // console.log(xyz);
}

export { patchImportFunctions, unpatchImportFunctions };
