// patchImportFunctions.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { App, Vault, Attachment, TFile, TFolder } from 'obsidian';
import ImportAttachments from 'main';

import * as Utils from 'utils';

// Save a reference to the original method for the monkey patch
let originalGetAvailablePathForAttachments: ((fileName: string, extension: string, currentFile: TFile | null, data?: ArrayBuffer) => Promise<string>) | null = null;
let originalSaveAttachment: ((fileName: string, fileExtension: string, fileData: ArrayBuffer) => Promise<TFile>) | null = null;
let originalImportAttachments: ((attachments: Attachment[], targetFolder: TFolder | null) => Promise<TFile[]>) | null = null;

function unpatchImportFunctions() {
	if (originalGetAvailablePathForAttachments) {
		Vault.prototype.getAvailablePathForAttachments = originalGetAvailablePathForAttachments;
		originalGetAvailablePathForAttachments = null;
	}

	if(originalSaveAttachment) {
		App.prototype.saveAttachment = originalSaveAttachment;
		originalSaveAttachment = null;
	}

    if(originalImportAttachments) {
        App.prototype.importAttachments = originalImportAttachments;
        originalImportAttachments = null;
    }
}

function patchImportFunctions(plugin: ImportAttachments) {

    if (!originalImportAttachments) {
        originalImportAttachments = App.prototype.importAttachments;
    }

    // Monkey patch the getAvailablePathForAttachments method
    App.prototype.importAttachments = async function importAttachments(attachments: Attachment[], targetFolder: TFolder | null): Promise<TFile[]> {
        if (!originalImportAttachments) {
            // In the current implementation, the original `getAvailablePathForAttachments`` is not actually called
            throw new Error("Could not execute the original importAttachments function.");
        }

        // const importedAttachments = await originalImportAttachments.apply(this,[attachments,targetFolder]);

        console.log(attachments);

        // If there are no attachments, return an empty array
        if (attachments.length === 0) {
            return [];
        }

        const vault = this.vault;  // Access the vault (storage system)
        const importedFilePaths:TFile[] = [];  // Array to store the imported file paths

        // Loop through each attachment
        for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];
            let name = attachment.name;  // Attachment name
            const extension = attachment.extension;  // Attachment extension
            const filepath = attachment.filepath;  // Existing filepath
            const data = attachment.data;  // Data of the attachment (e.g., image or binary content)

            let resolvedPath;
            
            // If filepath exists, try to resolve the filepath
            if (filepath && (resolvedPath = vault.resolveFilePath(filepath))) {


                // Push the resolved file path to the array and continue
                importedFilePaths.push(resolvedPath);
                continue;
            }

            // If there's no filepath, but we have data, handle new file creation
            if (data) {
                let newFilePath;
                
                // If the attachment name is "Pasted image", append a timestamp to the name
                if (name === "Pasted image") {
                    name += " " + window.moment().format("YYYYMMDDHHmmss");
                }

                // If a folder is provided, get an available path inside the folder for the new file
                if (targetFolder) {
                    const availablePath = vault.getAvailablePath(targetFolder.getParentPrefix() + name, extension);
                    newFilePath = await vault.createBinary(availablePath, data);
                } else {
                    // Otherwise, save the attachment using the `saveAttachment` helper method
                    newFilePath = await this.saveAttachment(name, extension, data);
                }

                // Push the new file path to the array of imported files
                importedFilePaths.push(newFilePath);
            }
        }

        // Return the array of imported file paths
        return importedFilePaths;
    };


	if (!originalGetAvailablePathForAttachments) {
		originalGetAvailablePathForAttachments = Vault.prototype.getAvailablePathForAttachments;
	}

	// Monkey patch the getAvailablePathForAttachments method
	Vault.prototype.getAvailablePathForAttachments = async function patchedGetAvailablePathForAttachments(fileName: string, extension: string, current_md_file: TFile | null, data?: ArrayBuffer): Promise<string> {
		if (!originalGetAvailablePathForAttachments) {
            // In the current implementation, the original `getAvailablePathForAttachments`` is not actually called
			throw new Error("Could not execute the original getAvailablePathForAttachments function.");
		}

		const currentFile_parsed = current_md_file ? Utils.parseFilePath(current_md_file.path) : undefined;
        
        const attachmentName = await plugin.createAttachmentName(fileName + "." + extension,currentFile_parsed,data);
        
		return attachmentName;
	};

	if (!originalSaveAttachment) {
		originalSaveAttachment = App.prototype.saveAttachment;
	}

	// Function to save an attachment
	App.prototype.saveAttachment = async function patchedSaveAttachment(fileName: string, fileExtension: string, fileData: ArrayBuffer): Promise<TFile> {
		if (!originalSaveAttachment) {
			throw new Error("Could not execute the original saveAttachment function.");
		}

		// const attachmentName = await originalSaveAttachment.apply(this, [fileName, fileExtension, fileData]);

        // Get the currently active file in the workspace
        const activeFile = this.workspace.getActiveFile();

        // Find an available path for the attachment using the active file's context
        const availablePath = await this.vault.getAvailablePathForAttachments(fileName, fileExtension, activeFile, fileData);
        
        // Create a binary file at the available path with the provided data
        const attachmentName = await this.vault.createBinary(availablePath, fileData);
       

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
		return attachmentName;
	}

    // Original function to save an individual attachment to the vault
    // App.prototype.saveAttachment = async function(name, extension, data) {
    //     // Get the currently active file in the workspace
    //     const activeFile = this.workspace.getActiveFile();

    //     // Find an available path for the attachment using the active file's context
    //     const availablePath = await this.vault.getAvailablePathForAttachments(name, extension, activeFile);

    //     // Create a binary file at the available path with the provided data
    //     return await this.vault.createBinary(availablePath, data);
    // };

}

export { patchImportFunctions, unpatchImportFunctions };
