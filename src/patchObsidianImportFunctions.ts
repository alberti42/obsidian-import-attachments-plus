// patchImportFunctions.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { App, Vault, Attachment, TFile, TFolder, DataWriteOptions } from 'obsidian';
import ImportAttachments from 'main';

import * as Utils from 'utils';
import { createAttachmentName } from 'importFunctions';
import { resolve } from 'dns';

// Save a reference to the original method for the monkey patch
let originalGetAvailablePathForAttachments: ((fileName: string, extension: string, currentFile: TFile | null, data?: ArrayBuffer) => Promise<string>) | null = null;
let originalSaveAttachment: ((fileName: string, fileExtension: string, fileData: ArrayBuffer) => Promise<TFile>) | null = null;
let originalImportAttachments: ((attachments: Attachment[], targetFolder: TFolder | null) => Promise<TFile[]>) | null = null;
let originalCreateBinary: ((path: string, data: ArrayBuffer, options?: DataWriteOptions) => Promise<TFile>) | null = null;
let originalResolveFilePath: ((filepath: string) => TFile|null) | null = null;

function unpatchObsidianImportFunctions() {
    if (originalResolveFilePath) {
        Vault.prototype.resolveFilePath = originalResolveFilePath;
        originalResolveFilePath = null;
    }

	if (originalCreateBinary) {
		Vault.prototype.createBinary = originalCreateBinary;
		originalCreateBinary = null;
	}

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

    if (!originalResolveFilePath) {
        originalResolveFilePath = Vault.prototype.resolveFilePath;
    }

    // Monkey patch the createBinary method
    Vault.prototype.resolveFilePath = function patchedResolveFilePath(filepath: string): (TFile|null) {
        if (!originalResolveFilePath) {
            throw new Error("Could not execute the original resolveFilePath function.");
        }

        const resolvedFile = originalResolveFilePath.apply(this,[filepath]);

        console.log("ORIGINAL FILEPATH");
        console.log(filepath);
        console.log("RESOLVED FILE");
        console.log(resolvedFile);

        debugger
        return resolvedFile;
    };


    if (!originalCreateBinary) {
        originalCreateBinary = Vault.prototype.createBinary;
    }

    // Monkey patch the createBinary method
    Vault.prototype.createBinary = async function patchedCreateBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<TFile> {
        if (!originalCreateBinary) {
            throw new Error("Could not execute the original createBinary function.");
        }

        const createdFile = await originalCreateBinary.apply(this,[path,data,options]);

        console.log("CREATED NEW BINARY");
        console.log(createdFile);


        return createdFile;
    };

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
            let data = attachment.data;  // Data of the attachment (e.g., image or binary content)

            let resolvedPath;
            
            // If filepath exists, try to resolve the filepath
            if (filepath && (resolvedPath = vault.resolveFilePath(filepath))) {

                // Push the resolved file path to the array and continue
                importedFilePaths.push(resolvedPath);
                continue;
            }

            // Otherwise, if there is no existing file, process the data
            if (data instanceof Promise) {
                console.log("RESOLVED PROMISE");
                data = await data;  // Await the resolution of the data promise
            }

            // If no data is found, skip to the next attachment
            if (!data) {
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

        console.log('CREATED ATTACHMENT FILE:');
        console.log(attachmentName);

		// Return the created file
		return attachmentName;
	}
}

export { patchObsidianImportFunctions, unpatchObsidianImportFunctions };
