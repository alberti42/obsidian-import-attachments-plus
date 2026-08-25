// patchFileManager.ts

import { FileManager, TAbstractFile, Notice, TFolder } from 'obsidian';
import ImportAttachments from 'main';
import * as Utils from 'utils';
import { DeleteAttachmentFolderModal } from './ImportAttachmentsModal';

// Dev-only tracing, matching main.ts: a production build keeps the calls but logs nothing.
const traceDelete = process.env.NODE_ENV === 'development'
	? (...args: unknown[]) => { console.log('[delete attachment]', ...args); }
	: () => { /* no-op in production */ };

// Save a reference to the original method for the monkey patch
let originalPromptForDeletion: ((file: TAbstractFile) => Promise<boolean>) | null = null;
let plugin:ImportAttachments;
let fileManager: FileManager;

function unpatchFilemanager() {
	if (originalPromptForDeletion) {
		FileManager.prototype.promptForDeletion = originalPromptForDeletion;
		originalPromptForDeletion = null;
	}
}

function patchFilemanager(p: ImportAttachments) {
    plugin = p;
	// eslint-disable-next-line @typescript-eslint/unbound-method -- the monkey-patch save/restore pattern requires the *unbound* prototype method: it is put back on the prototype in unpatch, where `this` is the caller
	originalPromptForDeletion = FileManager.prototype.promptForDeletion;

    // const fileExplorer = this.app.internalPlugins.getPluginById('file-explorer');
    fileManager = plugin.app.fileManager;  // Get the actual file manager instance

    // Monkey patch the promptForDeletion method
    FileManager.prototype.promptForDeletion = patchedPromptForDeletion.bind(fileManager);
}

async function patchedPromptForDeletion(this: FileManager, file: TAbstractFile): Promise<boolean> {
    return await modifiedPromptForDeletion.call(this,file);
}

async function modifiedPromptForDeletion(this: FileManager, file: TAbstractFile): Promise<boolean> {
    // Store the parent folder - IMPORTANT: we need to store it before the file is deleted with `callOriginalPromptForDeletion`
    const parent = file.parent;

    // Call the original function
    const wasFileDeleted = await callOriginalPromptForDeletion.call(this, file);
    traceDelete('wasFileDeleted', wasFileDeleted);
    if(wasFileDeleted) {
        // In case the deleted file is a .md note, delete the attachment folder
        if (plugin.settings.autoDeleteAttachmentFolder) {
            // Automatic deletion only works when the attachment name contains ${notename}
            // In order to avoid deleting common attachment folders, shared between multiple notes
            if (plugin.settings.attachmentFolderPath.includes('${notename}')) {
                const file_parsed = Utils.parseFilePath(file.path);
                if (file_parsed.ext === '.md' || file_parsed.ext === '.canvas') {
                    const attachmentFolder = plugin.app.vault.getAbstractFileByPath(plugin.getAttachmentFolderOfMdNote(file_parsed));
                    if(attachmentFolder instanceof TFolder) {
                        // Only the non-empty case is ever shown; an empty folder is
                        // removed without asking.
                        const postDescription = attachmentFolder.children.length > 0
                            ? createEl('p', {text: `Note that the folder associated with the MarkDown note you have \
                                just deleted is not empty and still contains ${attachmentFolder.children.length} files.`})
                            : undefined;
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
                        await deleteAttachmentFolderAssociatedWithMdFile(plugin, parent);
                    }
                }
            }
        }
    }

    return wasFileDeleted;
};

async function deleteAttachmentFolderAssociatedWithMdFile(plugin: ImportAttachments, attachmentFolder: TFolder, preDescription?:HTMLElement, postDescription?:HTMLElement) {

	// An empty attachment folder is removed without asking: there is nothing in it to
	// lose, and 'deleteAttachmentFolderWhenEmpty' is already the user's answer to that
	// question. Confirmation is reserved for a folder that still holds files.
	const isEmpty = attachmentFolder.children.length === 0;

	if(!isEmpty && plugin.settings.confirmDeleteAttachmentFolder) {
		const modal = new DeleteAttachmentFolderModal(plugin, attachmentFolder, preDescription, postDescription);
		modal.open();
		const choice = await modal.promise;
		if (!choice) {return;}
	}

	const filePathForDeletion = attachmentFolder;

	try {
		await plugin.trashFile(filePathForDeletion);
	} catch (error: unknown) {
		const msg = 'Failed to remove the attachment folder';
		console.error(msg + ':', filePathForDeletion);
		console.error('Error msg:', error);
		new Notice(msg + '.');
	}
}

/**
 * Wait for the user's answer to Obsidian's own delete prompt.
 *
 * `promptForDeletion` resolves as soon as the modal is *open*, not when it is answered, so the
 * answer has to be observed separately. It used to be read off the modal's buttons
 * (`.modal-button-container .mod-warning` / `.mod-cancel`), and that broke: current Obsidian has
 * no such buttons, the lookup threw *inside* the MutationObserver callback, and the promise was
 * therefore never resolved. Obsidian still trashed the file, so the visible symptom was a file
 * that disappeared while everything downstream — the attachment-folder cleanup here, the link
 * removal in `delete_file_cb` — waited forever for an answer that never came. With
 * `promptDelete` on, which is Obsidian's default, that is every deletion.
 *
 * So do not read the answer off private markup. The vault is the authority: if the file is gone,
 * the user said yes. Cancellation is inferred from the modal disappearing without a deletion, and
 * a timeout guarantees the promise settles either way — a pending promise here strands the caller.
 */
const DECISION_TIMEOUT_MS = 60_000;   // the user may sit on the prompt; this only stops a leak
const NO_MODAL_TIMEOUT_MS = 2_000;    // no prompt: the delete either lands promptly or not at all
const MODAL_GRACE_MS = 200;           // the modal closes before the trash completes

function awaitDeletionDecision(file: TAbstractFile, expectModal: boolean): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        // Both documents, because a modal opened from a popout belongs to that window's document
        // and not to the one this module closed over.
        const docs = new Set<Document>([document, activeDocument]);
        let settled = false;
        let modalSeen = false;
        let graceTimer: number | null = null;

        const observers: MutationObserver[] = [];
        const deleteRef = plugin.app.vault.on('delete', (deleted: TAbstractFile) => {
            if (deleted.path === file.path) {
                traceDelete('vault reported the deletion');
                settle(true);
            }
        });

        const overallTimer = window.setTimeout(() => {
            traceDelete('no decision observed before the timeout; assuming cancelled');
            settle(false);
        }, expectModal ? DECISION_TIMEOUT_MS : NO_MODAL_TIMEOUT_MS);

        function settle(decision: boolean) {
            if (settled) {return;}
            settled = true;
            plugin.app.vault.offref(deleteRef);
            observers.forEach(o => o.disconnect());
            window.clearTimeout(overallTimer);
            if (graceTimer !== null) {window.clearTimeout(graceTimer);}
            resolve(decision);
        }

        if (!expectModal) {return;}

        const modalPresent = () => [...docs].some(d => d.querySelector('.modal-container') !== null);

        for (const d of docs) {
            const observer = new MutationObserver(() => {
                if (modalPresent()) {
                    if (!modalSeen) {
                        modalSeen = true;
                        traceDelete('modal container detected');
                    }
                    return;
                }
                // The modal is gone. That is a cancellation unless a deletion is still in flight,
                // so give the vault event a moment to arrive before concluding anything.
                if (modalSeen && graceTimer === null) {
                    graceTimer = window.setTimeout(() => { settle(false); }, MODAL_GRACE_MS);
                }
            });
            observer.observe(d.body, { childList: true, subtree: false });
            observers.push(observer);
        }
    });
}

async function callOriginalPromptForDeletion(this:FileManager, file:TAbstractFile):Promise<boolean> {
    if (!originalPromptForDeletion) {return false;}

    const promptDelete = plugin.app.vault.getConfig('promptDelete');
    traceDelete('callOriginalPromptForDeletion', { file: file.path, promptDelete });

    // Arm the watcher before opening the prompt: with promptDelete off the deletion lands
    // immediately, and the vault event would otherwise be missed.
    const decision = awaitDeletionDecision(file, !!promptDelete);

    await originalPromptForDeletion.call(this,file);
    traceDelete('original promptForDeletion returned, awaiting the user decision');
    const wasDeleted = await decision;
    traceDelete('user decision', wasDeleted);
    return wasDeleted;
}

export async function callPromptForDeletion(file:TAbstractFile) {    
    return await modifiedPromptForDeletion.call(fileManager,file);
}

export { patchFilemanager, unpatchFilemanager };
