// patchFileManager.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import {FileManager, TAbstractFile} from 'obsidian';

import ImportAttachments from 'main';

// Save a reference to the original method for the monkey patch
let originalPromptForDeletion: ((file: TAbstractFile) => Promise<void>) | null = null;

let userInitiatedDelete: boolean = false;
// let userInitiatedRename: boolean = false;

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
		userInitiatedDelete = true;
		console.log("Flagged");

		const config = {
			childList: true,
			subtree: false,
		};

		// Set up a MutationObserver to watch for the modal
		const observer = new MutationObserver((mutations, observer) => {
			for (const mutation of mutations) {
				if (mutation.addedNodes.length > 0) {
					// Check if the added node is the modal
					const modal = Array.from(mutation.addedNodes).find(node =>
						node instanceof HTMLElement && node.classList.contains('modal-container')
					);
					if (modal) {
						// console.log(mutation)
						console.log(modal);

						// Watch for clicks on confirm and cancel buttons
						/*
						modal.addEventListener('click', (event) => {
							const target = event.target as HTMLElement;
							if (target.matches('.mod-confirm-button, .mod-cancel-button')) {
								observer.disconnect();
								clearUserInitiatedDeleteFlag();
							}
						});
						*/

						// Watch for the modal being removed from the DOM (clicked outside or closed)
						const modalObserver = new MutationObserver((modalMutations) => {
							for (const modalMutation of modalMutations) {
								if (Array.from(modalMutation.removedNodes).includes(modal)) {
									modalObserver.disconnect();
									clearUserInitiatedDeleteFlag();
								}
							}
						});

						modalObserver.observe(document.body, config);

						break;
					}
				}
			}
		});

		observer.observe(document.body, config);

		// Call the original function
		if (originalPromptForDeletion) {
			try {
				await originalPromptForDeletion.call(this, file);
			} finally {
				clearUserInitiatedDeleteFlag();
			}
		} else {
			clearUserInitiatedDeleteFlag();
		}
	};
}

function clearUserInitiatedDeleteFlag() {
    userInitiatedDelete = false;
    console.log("Unflagged");
}

export {patchFilemanager, unpatchFilemanager, userInitiatedDelete};