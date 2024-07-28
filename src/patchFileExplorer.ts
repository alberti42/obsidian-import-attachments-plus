// patchImportFunctions.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { TFolder,WorkspaceLeaf, FileExplorerItem, View, FileExplorerView } from 'obsidian';
import ImportAttachments from 'main';

// Define the type for the factory function
type ViewFactory = (leaf: WorkspaceLeaf) => FileExplorerView;
let fileExplorerViews: ({ [viewType: string]: (leaf: WorkspaceLeaf) => View }) | null = null;

let viewClass: ({ new(leaf: WorkspaceLeaf): FileExplorerView }) | null = null; 

// Save a reference to the original method for the monkey patch
let originalCreateFolderDom: ((folder: TFolder) => FileExplorerItem) | null = null;
let originalViewFactory: ViewFactory | null = null;

function unpatchFileExplorer() {
	if(originalViewFactory && fileExplorerViews) {
		fileExplorerViews['file-explorer'] = originalViewFactory;
		originalViewFactory = null;
	}

	if (originalCreateFolderDom && viewClass) {
		viewClass.prototype.createFolderDom = originalCreateFolderDom;
		originalCreateFolderDom = null;
	}
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

	if(hidden) el.toggleClass("import-plugin-hidden",true);
	
	console.log('Custom behavior after createFolderDom');
}

function patchCreateFolderDom(plugin: ImportAttachments, viewInstance: FileExplorerView) {
	if (originalCreateFolderDom) { return; }

	if (!viewInstance) {
		console.error("file-explorer plugin could not be patched.");
		return;
	}

	originalCreateFolderDom = viewInstance.constructor.prototype.createFolderDom;
	viewClass = viewInstance.constructor as { new(leaf: WorkspaceLeaf): FileExplorerView };

	viewClass.prototype.createFolderDom = function(this: FileExplorerView, folder: TFolder): FileExplorerItem {
		if(!originalCreateFolderDom) throw new Error('Something went wrong in patching file-explorer plugin.');
		
		const result = originalCreateFolderDom.apply(this, [folder]);
		
		if(result) {
			if(plugin.matchAttachmentFolder(result.file.name)) result.el.toggleClass("import-plugin-hidden",true);
		}
		return result;
	};
}

function updateVisibilityAttachmentFolders(plugin: ImportAttachments){
	const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');
	for (const leaf of leaves) {
		const viewInstance = leaf.view as FileExplorerView;
		Object.entries(viewInstance.fileItems).forEach(([folderPath, item]) => {
			setVisibility(folderPath,item.el,plugin);
		});
	}
}

function patchFileExplorer(plugin: ImportAttachments) {
	if (originalViewFactory || originalCreateFolderDom) { return; }

	// First attempt to apply the patch to existing leaves, in case file-explorer plugin was already loaded
	let patched = false;
	const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');
	for (const leaf of leaves) {
		const viewInstance = leaf.view as FileExplorerView;
		patchCreateFolderDom(plugin,viewInstance);
		patched = true;
		break;
	}
	if(patched) {
		// if we have patched it, and we found leaves of type file-explorer, then let's update the visibility of the attachment folders
		updateVisibilityAttachmentFolders(plugin);
		return; // we do not need to continue any further
	}

	// If no leaves of type `file-explorer` were found, then proceed to patch the viewFactory
	// which is responsible for creating `FileExplorerView`
	const fileExplorer = plugin.app.internalPlugins.getPluginById('file-explorer');
	if (!fileExplorer) return; // if the internal plugin is not loaded, then we cannot patch

	// Get the view factory to be monkey patched
	const viewFactory = fileExplorer.views['file-explorer'];

	// Store the original view factory function
	originalViewFactory = viewFactory as ViewFactory;

	// Create a new factory function that wraps the original and patches the instance
	const patchedViewFactory: ViewFactory = function(this: undefined, leaf: WorkspaceLeaf): FileExplorerView {
		if(!originalViewFactory) throw new Error("Something went wrong when patching ViewFactory.");

		// Call the original factory to get the view instance
		const viewInstance = originalViewFactory.apply(this, [leaf]);
		
		// Apply the patch to CreateFolderDom
		patchCreateFolderDom(plugin, viewInstance);

		// One execution of the patch to createFolderDom is sufficent
		fileExplorer.views['file-explorer'] = originalViewFactory;
		originalViewFactory = null;
		
		// Return the patched view instance
		return viewInstance;
	};

	// Replace the original view factory with the patched version
	fileExplorerViews = fileExplorer.views;
	fileExplorerViews['file-explorer'] = patchedViewFactory;
	
	return;	
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
