// patchFileManager.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { FileManager, TAbstractFile, Notice, TFolder, normalizePath } from 'obsidian';
import ImportAttachments from 'main';
import * as Utils from 'utils';
import { DeleteAttachmentFolderModal } from './ImportAttachmentsModal';
import { AttachmentFolderLocationType, ParsedPath } from 'types';
import { getAttachmentFolderOfMdNote } from 'importFunctions';

// Save a reference to the original method for the monkey patch
let originalPromptForDeletion: ((file: TAbstractFile) => Promise<void>) | null = null;
let plugin:ImportAttachments;
let fileManager: FileManager;
let modalResolvePromise: ((wasDeleted: boolean) => void) | null;

function unpatchFilemanager() {
	if (originalPromptForDeletion) {
		FileManager.prototype.promptForDeletion = originalPromptForDeletion;
		originalPromptForDeletion = null;
	}
}

function patchFilemanager(p: ImportAttachments) {
    plugin = p;
	originalPromptForDeletion = FileManager.prototype.promptForDeletion;

    // const fileExplorer = this.app.internalPlugins.getPluginById('file-explorer');
    fileManager = plugin.app.fileManager;  // Get the actual file manager instance

    // Monkey patch the promptForDeletion method
    FileManager.prototype.promptForDeletion = patchedPromptForDeletion.bind(fileManager);
}

async function patchedPromptForDeletion(this: FileManager, file: TAbstractFile): Promise<void> {
    await modifiedPromptForDeletion.call(this,file);
}


async function modifiedPromptForDeletion(this: FileManager, file: TAbstractFile): Promise<boolean> {
    // Store the parent folder - IMPORTANT: we need to store it before the file is deleted with `callOriginalPromptForDeletion`
    const parent = file.parent;

    // Call the original function
    const wasFileDeleted = await callOriginalPromptForDeletion.call(this, file);
    if(wasFileDeleted) {
        // In case the deleted file is a .md note, delete the attachment folder
        if (plugin.settings.autoDeleteAttachmentFolder) {
            // Automatic deletion only works when the attachment name contains ${notename}
            // In order to avoid deleting common attachment folders, shared between multiple notes
            if (plugin.settings.attachmentFolderPath.includes('${notename}')) {
                const file_parsed = Utils.parseFilePath(file.path);
                if (file_parsed.ext === ".md" || file_parsed.ext === ".canvas") {
                    const attachmentFolder = plugin.app.vault.getAbstractFileByPath(getAttachmentFolderOfMdNote(file_parsed));
                    if(attachmentFolder instanceof TFolder) {
                        const postDescription_text = attachmentFolder.children.length > 0 ?
                            `Note that the folder associated with the MarkDown note you have \
                                just deleted is not empty and still contains ${attachmentFolder.children.length} files.` 
                            : "The attachment folder is empty, and it should be safe to delete it.";
                        const postDescription = createEl('p', {text:postDescription_text});
                        await deleteAttachmentFolderAssociatedWithMdFile(plugin, attachmentFolder, undefined, postDescription);
                    }
                    
                }                        
            }
        }
        // In case the attachment folder still exists and it is empty, delete it
        if(plugin.settings.deleteAttachmentFolderWhenEmpty) {
            if(parent) {
                if(plugin.matchAttachmentFolder(parent.path)){ // of the type of an attachment folder
                    if(parent.children.length===0) { // attachment folder is empty
                        // const recursive = true;
                        // plugin.app.vault.delete(parent,recursive);
                        const postDescription = createEl('p',{text: "The attachment folder is now empty, and it should be safe to delete it."});
                        await deleteAttachmentFolderAssociatedWithMdFile(plugin, parent, undefined, postDescription);
                    }
                }
            }
        }
    }

    return wasFileDeleted;
};

async function deleteAttachmentFolderAssociatedWithMdFile(plugin: ImportAttachments, attachmentFolder: TFolder, preDescription?:HTMLElement, postDescription?:HTMLElement) {

	if(plugin.settings.confirmDeleteAttachmentFolder) {
		const modal = new DeleteAttachmentFolderModal(plugin, attachmentFolder, preDescription, postDescription);
		modal.open();
		const choice = await modal.promise;
		if (!choice) return;
	}

	const filePathForDeletion = attachmentFolder;

	try {
		await plugin.trashFile(filePathForDeletion);
	} catch (error: unknown) {
		const msg = 'Failed to remove the attachment folder';
		console.error(msg + ":", filePathForDeletion);
		console.error("Error msg:", error);
		new Notice(msg + '.');
	}
}

async function callOriginalPromptForDeletion(this:FileManager, file:TAbstractFile):Promise<boolean> {
    if (!originalPromptForDeletion) return false;

    // Create a new promise and store the resolve and reject functions
    const registeredUserDecisionPromise = new Promise<boolean>((resolve, reject) => {
        modalResolvePromise = resolve;
    });

    // Access the 'promptDelete' configuration setting
    const promptDelete = plugin.app.vault.getConfig('promptDelete');
    
    if(promptDelete)
    {
        const config = {
            childList: true,
            subtree: false,
        };

        // Set up a MutationObserver to watch for the modal
        new MutationObserver((mutations, observer) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    // Check if the added node is the modal
                    const modal = Array.from(mutation.addedNodes).find(node =>
                        node instanceof HTMLElement && node.classList.contains('modal-container')
                    ) as HTMLElement;
                    if (modal) {
                        // Add event listeners to buttons within the modal
                        const deleteButton = modal.querySelector('.modal-button-container .mod-warning');
                        const cancelButton = modal.querySelector('.modal-button-container .mod-cancel');

                        if (!deleteButton) {
                            throw new Error('Failed to correctly identify the "Delete" button.');
                        }
                        if (!cancelButton) {
                            throw new Error('Failed to correctly identify the "Cancel" button.');
                        }

                        deleteButton.addEventListener('click', () => {
                            if(modalResolvePromise) {
                                // console.log("Delete button clicked");
                                modalResolvePromise(true);
                                modalResolvePromise = null;
                            }
                        });
                    
                        cancelButton.addEventListener('click', () => {
                            if(modalResolvePromise) {
                                // console.log("Cancel button clicked");
                                modalResolvePromise(false);
                                modalResolvePromise = null;
                            }
                        });

                        // Watch for the modal being removed from the DOM (clicked outside or closed)
                        const modalRemovedObserver = new MutationObserver((modalMutations:MutationRecord[], innerObserver:MutationObserver) => {
                            for (const modalMutation of modalMutations) {
                                if (Array.from(modalMutation.removedNodes).includes(modal)) {
                                    innerObserver.disconnect();
                                    if(modalResolvePromise) {
                                        // console.log("Modal closed without action");
                                        modalResolvePromise(false);
                                        modalResolvePromise = null;
                                    }
                                    break;
                                }
                            }
                        });

                        if (modal.parentNode) {
                            modalRemovedObserver.observe(modal.parentNode, config);
                        }


                        // Disconnect the creation observer once the modal is found
                        observer.disconnect();
                        break;
                    }
                }
            }
        }).observe(document.body, config);

    } else {
        if(modalResolvePromise) {
            // console.log("Delete without prompt");
            modalResolvePromise(true);
            modalResolvePromise = null;
        }
    }

    await originalPromptForDeletion.call(this,file);
    return await registeredUserDecisionPromise;
}

export async function callPromptForDeletion(file:TAbstractFile) {    
    return await modifiedPromptForDeletion.call(fileManager,file);
}

export { patchFilemanager, unpatchFilemanager };
