// patchImportFunctions.ts

import { App, Vault, TFile } from 'obsidian';
import ImportAttachments from 'main';

import { parseFilePath, doesFileExist, findNewFilename } from 'utils';

// Save a reference to the original method for the monkey patch
let originalGetAvailablePathForAttachments: ((fileName: string, extension: string, currentFile: TFile | null) => Promise<string>) | null = null;
let originalSaveAttachment: ((fileName: string, fileExtension: string, fileData: ArrayBuffer) => Promise<TFile>) | null = null;

function unpatchImportFunctions() {
	if (originalGetAvailablePathForAttachments) {
		Vault.prototype.getAvailablePathForAttachments = originalGetAvailablePathForAttachments;
		originalGetAvailablePathForAttachments = null;
	}

	if(originalSaveAttachment) {
		App.prototype.saveAttachment = originalSaveAttachment;
		originalSaveAttachment = null;
	}
}

// Resolves the destination of a new attachment through the plugin's own folder/name logic, keeping
// the contract of the function we replace: the returned path is inside an existing folder and is
// not taken yet. `data` is passed only when the caller already holds the content (see below).
async function resolveAttachmentPath(plugin: ImportAttachments, fileName: string, extension: string, currentFile: TFile | null, data?: ArrayBuffer): Promise<string> {
	const currentFile_parsed = currentFile ? parseFilePath(currentFile.path) : undefined;

	const attachmentPath = await plugin.createAttachmentName(fileName + '.' + extension, currentFile_parsed, data);

	// Obsidian's own implementation ends with `getAvailablePath`, so it never returns a path
	// that is already taken. Callers (`saveAttachment`, but also third-party plugins reaching us
	// through `FileManager.getAvailablePathForAttachment`) create a file at the returned path
	// without checking, so we have to honour the same contract or we silently overwrite
	// attachments whenever the name pattern is not unique (e.g. `${original}` or `${notename}`).
	if (doesFileExist(plugin.app.vault, attachmentPath)) {
		return findNewFilename(plugin.app.vault, attachmentPath);
	}

	return attachmentPath;
}

function patchImportFunctions(plugin: ImportAttachments) {

	if (!originalGetAvailablePathForAttachments) {
		originalGetAvailablePathForAttachments = Vault.prototype.getAvailablePathForAttachments;
	}

	// Monkey patch the getAvailablePathForAttachments method
	Vault.prototype.getAvailablePathForAttachments = async function patchedGetAvailablePathForAttachments(fileName: string, extension: string, currentFile: TFile | null): Promise<string> {
		if (!originalGetAvailablePathForAttachments) {
			throw new Error('Could not execute the original getAvailablePathForAttachments function.');
		}
		
		// No content is available on this route: the caller is asking where to put an attachment it
		// has not created yet, so ${md5} cannot be resolved here.
		return await resolveAttachmentPath(plugin, fileName, extension, currentFile);
	};

	// Still kept, even though we no longer delegate to it: unpatchImportFunctions() needs it to
	// restore Obsidian's own method on unload.
	if (!originalSaveAttachment) {
		originalSaveAttachment = App.prototype.saveAttachment;
	}

	// Reimplementation of Obsidian's `saveAttachment`, which (verified against the 1.13.6 bundle) is
	// exactly `getAvailablePathForAttachments` followed by `createBinary`, with no further side
	// effects. We do those two steps ourselves for one reason: it lets the file content reach
	// `createAttachmentName` as an argument, so ${md5} works for attachments that have no path yet,
	// such as an image pasted from the clipboard. Routing it through the patched
	// `getAvailablePathForAttachments` instead would mean smuggling the buffer through module-level
	// state, which is what broke third-party callers in the first place (issue #18).
	App.prototype.saveAttachment = async function patchedSaveAttachment(this: App, fileName: string, fileExtension: string, fileData: ArrayBuffer): Promise<TFile> {
		const activeFile = this.workspace.getActiveFile();

		const attachmentPath = await resolveAttachmentPath(plugin, fileName, fileExtension, activeFile, fileData);

		return await this.vault.createBinary(attachmentPath, fileData);
	}
}

export { patchImportFunctions, unpatchImportFunctions };
