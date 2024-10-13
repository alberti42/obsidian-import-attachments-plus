// patchImportFunctions.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { App, Vault, Attachment, TFile, TFolder, DataWriteOptions, ClipboardManager } from 'obsidian';
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
let originalInsertFiles:((files: Attachment[]) => Promise<void>) | null = null;

let plugin: ImportAttachments;

let clipboardManagerProto: ClipboardManager;

export function setPlugin(p:ImportAttachments) {
    plugin = p;
}

function getClipboardManager() {
    let editorManager = plugin.app.embedRegistry.embedByExtension.md({
        app: plugin.app,
        containerEl: createDiv(),
        state: {}
    }, null, "");
    editorManager.load();
    editorManager.editable = true;
    editorManager.showEditor();

    clipboardManagerProto = Object.getPrototypeOf(editorManager.editMode.clipboardManager);
    editorManager.unload();

    // console.log(clipboardManagerProto);
}

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

    if(originalInsertFiles) {
        clipboardManagerProto.insertFiles = originalInsertFiles;
        originalInsertFiles = null;
    }
}

function patchObsidianImportFunctions(plugin: ImportAttachments) {

    getClipboardManager();

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

    if (!originalInsertFiles) {
        originalInsertFiles = clipboardManagerProto.insertFiles;
    }

    clipboardManagerProto.insertFiles = async function (files: Attachment[]): Promise<void> {
        if (!originalInsertFiles) {
            throw new Error("Could not execute the original insertFiles function.");
        }

        // await originalInsertFiles.apply(this,[files]);

        // Loop through each file in the `files` array
        for (let t = 0; t < files.length; t++) {
            const file = files[t];
            const name = file.name;           // Get the file name
            const extension = file.extension; // Get the file extension
            const filepath = file.filepath;   // Get the file path (if it exists)
            let data = file.data;             // Get the file data (could be a promise with binary data)
            const isLastFile = t < files.length - 1;  // Check if this is the last file in the list

            // If the file has an existing path, resolve the file in the vault and embed it
            if (filepath && plugin.app.vault.resolveFilePath(filepath)) {
                const resolvedFile = plugin.app.vault.resolveFilePath(filepath);  // Resolve file in the vault
                this.insertAttachmentEmbed(resolvedFile, isLastFile);  // Embed the attachment in the editor
                continue;  // Move to the next file
            }

            // If the file doesn't have a path, process the data (await the promise if necessary)
            if (data instanceof Promise) {
                data = await data;  // Await the resolution of the promise (binary data)
            }

            // If data exists after the promise is resolved, save the attachment
            if (data) {
                await this.saveAttachment(name, extension, data, isLastFile);
            }
        }

    }
}

export { patchObsidianImportFunctions, unpatchObsidianImportFunctions };
