// patchImportFunctions.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { App, Vault, Attachment, TFile, TFolder, DataWriteOptions } from 'obsidian';
import ImportAttachments from 'main';

import * as Utils from 'utils';
import { createAttachmentName } from 'importFunctions';

// Save a reference to the original method for the monkey patch
let originalGetAvailablePathForAttachments: ((fileName: string, extension: string, currentFile: TFile | null, data?: ArrayBuffer) => Promise<string>) | null = null;
let originalSaveAttachment: ((fileName: string, fileExtension: string, fileData: ArrayBuffer) => Promise<TFile>) | null = null;
let originalImportAttachments: ((attachments: Attachment[], targetFolder: TFolder | null) => Promise<TFile[]>) | null = null;
let originalCreateBinary: ((path: string, data: ArrayBuffer, options?: DataWriteOptions) => Promise<TFile>) | null = null;

function unpatchObsidianImportFunctions() {
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

function patchObsidianImportFunctions(plugin: ImportAttachments) {

    if (!originalImportAttachments) {
        originalImportAttachments = App.prototype.importAttachments;
    }

    // Monkey patch the getAvailablePathForAttachments method
    App.prototype.importAttachments = async function importAttachments(attachments: Attachment[], targetFolder: TFolder | null): Promise<TFile[]> {
        console.log("IMPORTATTACHMENTS");

        if (!originalImportAttachments) {
            // In the current implementation, the original `getAvailablePathForAttachments`` is not actually called
            throw new Error("Could not execute the original importAttachments function.");
        }

        // const importedAttachments = await originalImportAttachments.apply(this,[attachments,targetFolder]);

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
            const data = await attachment.data;  // Data of the attachment (e.g., image or binary content)

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
                    debugger
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
            // In the current implementation, the original `getAvailablePathForAttachments`` is actually never called
			throw new Error("Could not execute the original getAvailablePathForAttachments function.");
		}

        debugger

		const currentFile_parsed = current_md_file ? Utils.parseFilePath(current_md_file.path) : undefined;
        
        const attachmentName = await createAttachmentName(fileName + "." + extension,currentFile_parsed,data);
        
		return attachmentName;
	};

	if (!originalSaveAttachment) {
		originalSaveAttachment = App.prototype.saveAttachment;
	}

	// Function to save an attachment
	App.prototype.saveAttachment = async function patchedSaveAttachment(fileName: string, fileExtension: string, fileData: ArrayBuffer): Promise<TFile> {
		if (!originalSaveAttachment) {
            // In the current implementation, the original `saveAttachment`` is actually never called
			throw new Error("Could not execute the original saveAttachment function.");
		}

		// const attachmentName = await originalSaveAttachment.apply(this, [fileName, fileExtension, fileData]);

        // Get the currently active file in the workspace
        const activeFile = this.workspace.getActiveFile();

        // Find an available path for the attachment using the active file's context
        const availablePath = await this.vault.getAvailablePathForAttachments(fileName, fileExtension, activeFile, fileData);
        
        // Create a binary file at the available path with the provided data
        const attachmentName = await this.vault.createBinary(availablePath, fileData);

        console.log('ATTACHMENT NAME:');
        console.log(attachmentName);

		// Return the created file
		return attachmentName;
	}
}

export { patchObsidianImportFunctions, unpatchObsidianImportFunctions };
