import {WorkspaceLeaf, TFile, OpenViewState} from 'obsidian';

import ImportAttachments from 'main';

import * as path from 'path';

let metaKeyPressed = false;
let altKeyPressed = false;
let keyListenersInstalled = false

// Save a reference to the original method for the monkey patch
let originalOpenFile: ((this: WorkspaceLeaf, file: TFile, openState?: OpenViewState)=> Promise<void>) | null = null;

// Function references for event listeners
function keyDownHandler(event: KeyboardEvent) {
	if (event.metaKey) { // || e.ctrlKey
		metaKeyPressed = true;
	}
	if (event.altKey) {
		altKeyPressed = true;
	}
}

function keyUpHandler(event: KeyboardEvent) {
	if (event.key === 'Meta') {
		metaKeyPressed = false;
	}
	if (event.key === 'Alt') {
		altKeyPressed = false;
	}
}

function mouseDownHandler(event: MouseEvent) {
	if (event.metaKey) {
		metaKeyPressed = true;
	} else {
		metaKeyPressed = false;
	}
	if (event.altKey) {
		altKeyPressed = true;
	} else {
		altKeyPressed = false;
	}
}

function mouseUpHandler(event: MouseEvent) {
	if (event.metaKey) {
		metaKeyPressed = true;
	} else {
		metaKeyPressed = false;
	}
	if (event.altKey) {
		altKeyPressed = true;
	} else {
		altKeyPressed = false;
	}
}

function addKeyListeners()
{
	// Listen for keyboard events to detect META key state
	document.addEventListener('keydown', keyDownHandler);
	document.addEventListener('keyup', keyUpHandler);
	document.addEventListener('mousedown', mouseDownHandler, { capture: true });
	document.addEventListener('mouseup', mouseUpHandler, { capture: true });
	keyListenersInstalled = true;
}

function removeKeyListeners()
{
	if(keyListenersInstalled) {
		document.removeEventListener('keydown', keyDownHandler);
		document.removeEventListener('keyup', keyUpHandler);
		document.removeEventListener('mousedown', mouseDownHandler, { capture: true });
		document.addEventListener('mouseup', mouseUpHandler, { capture: true });
		keyListenersInstalled = false;
	}
}

function unpatchOpenFile() {
	if(originalOpenFile) {
		WorkspaceLeaf.prototype.openFile = originalOpenFile;
		originalOpenFile = null;
	}
}

function patchOpenFile(plugin: ImportAttachments) {
	originalOpenFile = WorkspaceLeaf.prototype.openFile;

	// Monkey patch the openFile method
	WorkspaceLeaf.prototype.openFile = async function patchedOpenFile(this: WorkspaceLeaf, file: TFile, openState?: OpenViewState): Promise<void> {
		const extension = "."+file.extension;

		if(originalOpenFile && metaKeyPressed && altKeyPressed && plugin.settings.revealAttachmentExtExcluded.split(',').some((ext:string) => ext === extension))
		{
			return originalOpenFile.call(this, file, openState);
		}

		if(originalOpenFile && metaKeyPressed && !altKeyPressed && plugin.settings.openAttachmentExternalExtExcluded.split(',').some((ext:string) => ext === extension))
		{
			return originalOpenFile.call(this, file, openState);
		}
		const newEmptyLeave = this.getViewState()?.type == 'empty';

		if(plugin.settings.revealAttachment && metaKeyPressed && altKeyPressed){
			window.require('electron').remote.shell.showItemInFolder(path.join(plugin.vaultPath,file.path));
		}
		else if(plugin.settings.openAttachmentExternal && metaKeyPressed && !altKeyPressed) {
			plugin.app.openWithDefaultApp(file.path);
		}
		else
		{
			if(originalOpenFile) {
				return originalOpenFile.call(this, file, openState);
			}
		}
		if (newEmptyLeave) {
			// close prepared empty tab
			this.detach();
		}
		return;
	}
}

export {patchOpenFile, addKeyListeners, removeKeyListeners, unpatchOpenFile};