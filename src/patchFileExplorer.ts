	// patchFileExplorer.ts

import type ImportAttachments from 'main';
import { FileExplorer, TFile } from 'obsidian';

let plugin: ImportAttachments | null = null;
let fileExplorer: FileExplorer | null = null;

async function initializeFileExplorer(p: ImportAttachments): Promise<void> {
	plugin = p;
	await setupFileExplorer();
}

async function setupFileExplorer(): Promise<void> {
	if (!plugin) {
		return;
	}

	const { workspace } = plugin.app;

	const leafs = workspace.getLeavesOfType('file-explorer');
	if (leafs.length > 0) {
		fileExplorer = leafs[0].view as FileExplorer;
		// Perform your custom setup with the fileExplorer here
		customSetup();
	} else {
		console.error('FileExplorer not found');
	}
}

function customSetup() {
	if (!plugin) {
		return;
	}

	if (!fileExplorer) {
		console.error('FileExplorer is not available');
		return;
	}

	// Add event listener for file clicks
	const explorerEl = fileExplorer.containerEl;
	explorerEl.addEventListener('click', handleFileClick);
}

function handleFileClick(event: MouseEvent) {
	if (!plugin || !fileExplorer) {
		return;
	}

	// Find the closest file item element
	const fileItemEl = (event.target as HTMLElement).closest('.nav-file');
	if (fileItemEl) {
		// Get the file path from the element's data attribute
		const filePath = fileItemEl.getAttribute('data-path');
		console.log(fileItemEl);
	
		if (filePath) {
			const file = plugin.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				// Trigger your custom event or function here
				console.log('File clicked:', file);
				// Add your custom logic here
				onFileClick(file);
			}
		}
	}
}

function onFileClick(file: TFile) {
	// Custom logic when a file is clicked
	console.log('Custom logic for file:', file);
}


export { initializeFileExplorer };
