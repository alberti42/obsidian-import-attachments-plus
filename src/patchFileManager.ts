// patchFileManager.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import {FileManager, TAbstractFile, Notice} from 'obsidian';
import ImportAttachments from 'main';
import * as Utils from "utils";
import {DeleteAttachmentFolderModal} from './ImportAttachmentsModal';
import * as path from 'path';         // Standard import for the path module

// Save a reference to the original method for the monkey patch
let originalPromptForDeletion: ((file: TAbstractFile) => Promise<void>) | null = null;

let userInitiatedDelete: boolean = false;
// let userInitiatedRename: boolean = false;

let modalCreationObserver: MutationObserver | null = null;

function unpatchFilemanager() {
	if(originalPromptForDeletion) {
		FileManager.prototype.promptForDeletion = originalPromptForDeletion;
		originalPromptForDeletion = null;
	}
}

function patchFilemanager(plugin: ImportAttachments) {
	originalPromptForDeletion = FileManager.prototype.promptForDeletion;

	// Monkey patch the promptForDeletion method
	FileManager.prototype.promptForDeletion = async function patchedPromptForDeletion(file: TAbstractFile): Promise<void> {
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
						// Watch for the modal being removed from the DOM (clicked outside or closed)
						const modalRemovedObserver = new MutationObserver((modalMutations) => {
							for (const modalMutation of modalMutations) {
								if (Array.from(modalMutation.removedNodes).includes(modal)) {
									modalRemovedObserver.disconnect();
									// console.log("UNFLAGGED");
									userInitiatedDelete = false;
									break;
								}
							}
						});

						if(modal.parentNode){
							modalRemovedObserver.observe(modal.parentNode, config);	
						}						

						// break;
					}
				}
			}
		});

		modalCreationObserver.observe(document.body, config);

		// Call the original function
		if (originalPromptForDeletion) {
			userInitiatedDelete = true;
			try {
				await originalPromptForDeletion.call(this, file);
				await deleteAttachmentFolder(plugin, file);
			} finally {
				userInitiatedDelete = false;
			}
		}
	};
}

async function deleteAttachmentFolder(plugin: ImportAttachments, file: TAbstractFile) {
	if (!plugin.settings.autoDeleteAttachmentFolder) { return }

	// automatic deletion only works when the attachment name contains ${notename}
	// in order to avoid deleting common attachment folder, shared between multiple notes
	if (!plugin.settings.folderPath.includes('${notename}')) { return }

	/*
	try {
		// Code throwing an exception
		throw new Error();
	} catch(e) {
		console.log(e.stack);
		console.log(plugin);
	}
	*/

	const file_parsed = path.parse(file.path);
	if (file_parsed.ext != ".md") { return }

	const attachmentFolderPath = plugin.getAttachmentFolder(file_parsed);
	if (!attachmentFolderPath) { return }

	if (await Utils.checkDirectoryExists(attachmentFolderPath.attachmentsFolderPath)) {
		const modal = new DeleteAttachmentFolderModal(plugin.app, plugin, attachmentFolderPath.attachmentsFolderPath);
		modal.open();
		const choice = await modal.promise;
		if (!choice) return;

		const filePath = path.relative(plugin.vaultPath, attachmentFolderPath.attachmentsFolderPath);

		try {
			await plugin.trashFile(filePath);
		} catch (error: unknown) {
			const msg = 'Failed to remove the attachment folder';
			console.error(msg + ":", filePath);
			console.error("Error msg:", error);
			new Notice(msg + '.');
		}
	}
}

export {patchFilemanager, unpatchFilemanager, userInitiatedDelete};