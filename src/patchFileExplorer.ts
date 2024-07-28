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
			
		if(plugin.settings.hideAttachmentFolders && plugin.matchAttachmentFolder(result.file.name)) result.el.toggleClass("import-plugin-hidden",true);

		return result;
	};
}

function updateVisibilityAttachmentFolders(plugin: ImportAttachments){
	const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');
	const hide = plugin.settings.hideAttachmentFolders;
	for (const leaf of leaves) {
		const viewInstance = leaf.view as FileExplorerView;

		Object.entries(viewInstance.fileItems).forEach(([folderPath, item]) => {
			if(!hide) {
				item.el.toggleClass("import-plugin-hidden",false);
			} else {
				item.el.toggleClass("import-plugin-hidden",plugin.matchAttachmentFolder(folderPath))
			}
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

export { patchFileExplorer, unpatchFileExplorer, updateVisibilityAttachmentFolders };
