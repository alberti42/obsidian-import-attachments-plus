import {WorkspaceLeaf, TFile, OpenViewState} from 'obsidian';

import ImportAttachments from 'main';

import * as path from 'path';

let metaKeyPressed = false;
let altKeyPressed = false;
let keyListenersInstalled = false

// Save a reference to the original method for the monkey patch
let originalOpenFile: ((this: WorkspaceLeaf, file: TFile, openState?: OpenViewState)=> Promise<void>) | null = null;

// Function references for event listeners
function keydownHandler(event: KeyboardEvent) {
    if (event.metaKey) { // || e.ctrlKey
        metaKeyPressed = true;
    }
    if (event.altKey) {
        altKeyPressed = true;
    }
}

function keyupHandler(event: KeyboardEvent) {
    if (event.key === 'Meta') {
        metaKeyPressed = false;
    }
    if (event.key === 'Alt') {
        altKeyPressed = false;
    }
}

function mouseHandler(event: MouseEvent) {
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
    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);
	document.addEventListener('mousedown', mouseHandler, { capture: true });
    keyListenersInstalled = true;
}

function removeKeyListeners()
{
    if(keyListenersInstalled) {
        document.removeEventListener('keydown', keydownHandler);
        document.removeEventListener('keyup', keyupHandler);
        document.removeEventListener('mousedown', mouseHandler, { capture: true });
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

		// console.log(`Meta key is pressed: ${metaKeyPressed}`);
		// console.log(`Alt key is pressed: ${altKeyPressed}`);

		const newEmptyLeave = this.getViewState()?.type == 'empty';

		if (newEmptyLeave) {
			// close prepared empty tab
			this.detach();
		}
		
		if(metaKeyPressed){
			if(altKeyPressed){
				window.require('electron').remote.shell.showItemInFolder(path.join(plugin.vaultPath,file.path));
			}
			else {
				plugin.app.openWithDefaultApp(file.path);
			}
			return;
		}
		else
		{
			if(originalOpenFile) {
				return originalOpenFile.call(this, file, openState);
			} else {
				return;
			}

		}
	}
}

export {patchOpenFile, addKeyListeners, removeKeyListeners, unpatchOpenFile};