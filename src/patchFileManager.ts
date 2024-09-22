// patchFileManager.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { FileManager, TAbstractFile, Notice, TFolder } from 'obsidian';
import ImportAttachments from 'main';
import * as Utils from 'utils';
import { DeleteAttachmentFolderModal } from './ImportAttachmentsModal';

// Save a reference to the original method for the monkey patch
let originalPromptForDeletion: ((file: TAbstractFile) => Promise<void>) | null = null;

let modalCreationObserver: MutationObserver | null = null;

function unpatchFilemanager() {
	if (originalPromptForDeletion) {
		FileManager.prototype.promptForDeletion = originalPromptForDeletion;
		originalPromptForDeletion = null;
	}
}

function patchFilemanager(plugin: ImportAttachments) {
	let userInitiatedDelete : boolean;
	originalPromptForDeletion = FileManager.prototype.promptForDeletion;

	// Monkey patch the promptForDeletion method
	FileManager.prototype.promptForDeletion = async function patchedPromptForDeletion(file: TAbstractFile): Promise<void> {
		// Access the 'promptDelete' configuration setting
		const promptDelete = plugin.app.vault.getConfig('promptDelete');
		
		if(promptDelete)
		{
			userInitiatedDelete = false;
			
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
							const deleteButton = modal.querySelector('.mod-warning');
							const cancelButton = modal.querySelector('.mod-cancel');

							if (!deleteButton) {
								throw new Error('Failed to correctly identify the "Delete" button.');
							}
							if (!cancelButton) {
								throw new Error('Failed to correctly identify the "Cancel" button.');
							}

							deleteButton.addEventListener('click', () => {
								userInitiatedDelete = true;
								// console.log("Delete button clicked");
							});
						
							cancelButton.addEventListener('click', () => {
								userInitiatedDelete = false;
								// console.log("Cancel button clicked");
							});
						
							// Watch for the modal being removed from the DOM (clicked outside or closed)
							const modalRemovedObserver = new MutationObserver((modalMutations) => {
								for (const modalMutation of modalMutations) {
									if (Array.from(modalMutation.removedNodes).includes(modal)) {
										modalRemovedObserver.disconnect();
										// console.log("Modal closed without action");
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
			userInitiatedDelete = true;
			// console.log("Delete without prompt");
		}

        // Call the original function
		if (originalPromptForDeletion) {
            const parent = file.parent; // store the parent element
            await originalPromptForDeletion.call(this, file);
			if(userInitiatedDelete) {

                // In case the deleted file is a .md note, delete the attachment folder
                if (plugin.settings.autoDeleteAttachmentFolder) {
                    // Automatic deletion only works when the attachment name contains ${notename}
                    // In order to avoid deleting common attachment folders, shared between multiple notes
                    if (plugin.settings.attachmentFolderPath.includes('${notename}')) {
                        const file_parsed = Utils.parseFilePath(file.path);
                        if (file_parsed.ext === ".md") {
                            const attachmentFolder = plugin.app.vault.getAbstractFileByPath(plugin.getAttachmentFolderOfMdNote(file_parsed));
                            if(attachmentFolder instanceof TFolder) {
                                const postDescription_text = attachmentFolder.children.length > 0 ?
                                    `Please note that the folder that is associated with the MarkDown note you \
                                        have just deleted is not empty. It still contains ${attachmentFolder.children.length} files.` 
                                    : "The attachment folder is empty, and it should be safe to delete it.";
                                const postDescription = createEl('p', {text:postDescription_text});
                                await deleteAttachmentFolderAssociatedWithMdFile(plugin, attachmentFolder, undefined, postDescription);
                            }
                            
                        }                        
                    }
                }

	            // In case the attachment folder still exists and it is empty, delete it
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
	};
}

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

export { patchFilemanager, unpatchFilemanager };
