	// patchFileExplorer.ts

import type ImportAttachments from 'main';
import { FileExplorer } from 'obsidian';

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

    // Custom setup code with this.fileExplorer
    console.log('FileExplorer is ready for custom setup', fileExplorer);
    console.log(fileExplorer.containerEl);
}

export { initializeFileExplorer };
