// patchFileManager.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { FileManager, TAbstractFile, Notice } from 'obsidian';
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
			modalCreationObserver = new MutationObserver((mutations, observer) => {
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
			});

			modalCreationObserver.observe(document.body, config);
		} else {
			userInitiatedDelete = true;
			// console.log("Delete without prompt");
		}

		// Call the original function
		if (originalPromptForDeletion) {
			await originalPromptForDeletion.call(this, file);
			if(userInitiatedDelete) {
				await deleteAttachmentFolder(plugin, file);
			}			
		}
	};
}

async function deleteAttachmentFolder(plugin: ImportAttachments, file: TAbstractFile) {
	if (!plugin.settings.autoDeleteAttachmentFolder) { return; }

	// Automatic deletion only works when the attachment name contains ${notename}
	// In order to avoid deleting common attachment folders, shared between multiple notes
	if (!(plugin.app.vault.getConfig('attachmentFolderPath') as string).includes('${notename}')) { return; }

	const file_parsed = Utils.parseFilePath(file.path);
	if (file_parsed.ext !== ".md") { return; }

	const attachmentFolderPath = plugin.getFullAttachmentFolder(file_parsed);
	if (!attachmentFolderPath) { return; }

	if (await Utils.doesFolderExist(plugin.app.vault,attachmentFolderPath.attachmentsFolderPath)) {
		if(plugin.settings.confirmDeleteAttachmentFolder) {
			const modal = new DeleteAttachmentFolderModal(plugin, attachmentFolderPath.attachmentsFolderPath);
			modal.open();
			const choice = await modal.promise;
			if (!choice) return;
		}

		const filePathForDeletion = attachmentFolderPath.attachmentsFolderPath;

		try {
			await plugin.trashFile(filePathForDeletion);
		} catch (error: unknown) {
			const msg = 'Failed to remove the attachment folder';
			console.error(msg + ":", filePathForDeletion);
			console.error("Error msg:", error);
			new Notice(msg + '.');
		}
	}
}

export { patchFilemanager, unpatchFilemanager };
