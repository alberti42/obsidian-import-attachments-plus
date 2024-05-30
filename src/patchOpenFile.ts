import {WorkspaceLeaf, TFile, OpenViewState} from 'obsidian';

import ImportAttachments from 'main';

import * as path from 'path';

let metaKeyPressed = false;
let altKeyPressed = false;
let keyListenersInstalled = false

// Save a reference to the original method for the monkey patch
let originalOpenFile: ((this: WorkspaceLeaf, file: TFile, openState?: OpenViewState)=> Promise<void>) | null = null;
// let originalOpenLinkText: ((e:any, t:any, n:any) => any) | null = null;
// let originalOnSelfClick: ((e:any)=>void)|null = null;

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
	// originalOpenLinkText = WorkspaceLeaf.prototype.openLinkText;
	// originalOnSelfClick = WorkspaceLeaf.prototype.onSelfClick;

	// Monkey patch the openFile method
	WorkspaceLeaf.prototype.openFile = async function patchedOpenFile(this: WorkspaceLeaf, file: TFile, openState?: OpenViewState): Promise<void> {
		// console.log(`Meta key is pressed: ${metaKeyPressed}`);
		// console.log(`Alt key is pressed: ${altKeyPressed}`);

		if(file.extension==='md' && originalOpenFile) {
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
	
	/*
	WorkspaceLeaf.prototype.openLinkText = async function patchedOpenLinkText(this:WorkspaceLeaf, t:any, n:any): any {
		if(originalOpenLinkText){
			console.log('Open link text');
			return originalOpenLinkText.call(this,t,n);	
		}
		return;		
	}
	*/
}

export {patchOpenFile, addKeyListeners, removeKeyListeners, unpatchOpenFile};