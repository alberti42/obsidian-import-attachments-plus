// patchImportFunctions.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { TFolder,WorkspaceLeaf, View, FileExplorerItem } from 'obsidian';
import ImportAttachments from 'main';

// Define a type for the view class with the required methods
interface FileExplorerView extends View {
	createFolderDom(folder: TFolder): FileExplorerItem;
}

// Save a reference to the original method for the monkey patch
let originalCreateFolderDom: ((folder: TFolder) => FileExplorerItem) | null = null;
let viewClass: { new(leaf: WorkspaceLeaf): FileExplorerView } | null = null;

function unpatchFileExplorer() {
	if (originalCreateFolderDom && viewClass) {
		viewClass.prototype.createFolderDom = originalCreateFolderDom;
		originalCreateFolderDom = null;
	}
}

function matchesPatternWithHolder(plugin: ImportAttachments, filePath: string): boolean {
	// Check if filePath starts with startsWidth or contains /startsWidth
	const startsWithMatch = filePath.startsWith(plugin.folderPathStartsWith) || filePath.includes(`/${plugin.folderPathStartsWith}`);
	
	// Check if filePath ends with endsWidth
	const endsWithMatch = filePath.endsWith(plugin.folderPathEndsWith);
	
	// Return true only if both conditions are met
	return startsWithMatch && endsWithMatch;
}

function matchesPatternWithoutHolder(plugin: ImportAttachments, filePath: string): boolean {
	const folderName = plugin.settings.folderPath;
	return filePath.endsWith(`/${folderName}`) || filePath === folderName;
}

function patchFileExplorer(plugin: ImportAttachments) {
	if (originalCreateFolderDom) { return; }

	const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');
	for (const leaf of leaves) {
		const viewInstance = leaf.view as FileExplorerView;
		originalCreateFolderDom = viewInstance.constructor.prototype.createFolderDom;
		viewClass = viewInstance.constructor as { new(leaf: WorkspaceLeaf): FileExplorerView };
		break;
	}

	if (!viewClass) {
		console.error("file-explorer plugin could not be patched.");
		return;
	}

	viewClass.prototype.createFolderDom = function(this: FileExplorerView, folder: TFolder): unknown {
		if(!originalCreateFolderDom) { 
			console.error('Something went wrong in patching file-explorer plugin.')
			return;
		}
		
		const result = originalCreateFolderDom.apply(this, [folder]);
		console.log(result);
		if(result) {
			const folderName = result.file.name;
			let hidden = false;
			if (plugin.settings.folderPath.includes("${notename}") && matchesPatternWithHolder(plugin,folderName)) {
				console.log("FOUND",folderName);
				hidden = true;

			} else if (matchesPatternWithoutHolder(plugin,folderName)) {
				console.log("FOUND",folderName);
				hidden = true;
			}

			if(hidden) result.el.toggleClass("import-plugin-hidden",true);
			
			console.log(result.constructor);
			console.log('Custom behavior after createFolderDom');
		}
		return result;
	};

	console.log("PATCHED");
}

export { patchFileExplorer, unpatchFileExplorer };

/*
	function matchesPatternWithHolder(filePath: string): boolean {
		// Check if filePath starts with startsWidth or contains /startsWidth
		const startsWithMatch = filePath.startsWith(plugin.folderPathStartsWith) || filePath.includes(`/${plugin.folderPathStartsWith}`);
		
		// Check if filePath ends with endsWidth
		const endsWithMatch = filePath.endsWith(plugin.folderPathEndsWith);
		
		// Return true only if both conditions are met
		return startsWithMatch && endsWithMatch;
	}

	function matchesPatternWithoutHolder(filePath: string): boolean {
		const folderName = plugin.settings.folderPath;
		return filePath.endsWith(`/${folderName}`) || filePath === folderName;
	}

	Vault.prototype.onChange = function (this: Vault, eventType: string, filePath: string, oldPath?: string, stat?: FileStats) {
		if (!originalOnChange) {
			throw new Error("Could not execute the original onChange function.");
		}

		// const fileExplorerPlugin = plugin.app.internalPlugins.getPluginById('file-explorer');
		
		// if(filePath.endsWith('.xyz')) {
		// 	// console.log("XYZ:",eventType);
		// 	// console.log(originalOnChange);
		// 	originalOnChange.call(this, eventType, filePath, oldPath, stat);
		// 	return;
		// }

		// if(filePath.endsWith('.md')) {
		// 	// console.log("MD:",eventType);
		// 	return;
		// }

		if (eventType === 'folder-created') {
			const placeholder = "${notename}";

			if (plugin.settings.folderPath.includes(placeholder) && matchesPatternWithHolder(filePath)) {
				// console.log("1",filePath)
				// console.log(TFolder);

				// Handle folder creation event manually
				const newFolder = new TFolder(this, filePath);
				this.fileMap[filePath] = newFolder;
				// debugger
				this.addChild(newFolder);

				this.trigger("create", this.fileMap[filePath]);
				return;
			} else if (matchesPatternWithoutHolder(filePath)) {
				console.log("2",filePath)
			}
		}

		originalOnChange.call(this, eventType, filePath, oldPath, stat);
	};

	// const fileExplorer = plugin.app.internalPlugins.getPluginById('file-explorer');
	// const xyz = fileExplorer.views['file-explorer']
	// console.log(xyz);

	*/