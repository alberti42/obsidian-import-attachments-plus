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

let originalAcceptRename: (() => Promise<void>) | null = null;

function unpatchFileExplorer() {
	if(originalViewFactory && fileExplorerViews) {
		fileExplorerViews['file-explorer'] = originalViewFactory;
		originalViewFactory = null;
	}

	if (originalCreateFolderDom && viewClass) {
		viewClass.prototype.createFolderDom = originalCreateFolderDom;
		originalCreateFolderDom = null;
	}

	if (originalAcceptRename && viewClass) {
		viewClass.prototype.acceptRename = originalAcceptRename;
		originalAcceptRename = null;
	}
}

function patchAcceptRename(plugin: ImportAttachments, viewClass: { new(leaf: WorkspaceLeaf): FileExplorerView }) {
	if(originalAcceptRename) return;

	originalAcceptRename = viewClass.prototype.acceptRename;
	
	viewClass.prototype.acceptRename = async function(this: FileExplorerView) {
		if(!originalAcceptRename) throw new Error('Something went wrong in patching file-explorer plugin.');

		const fileBeingRenamed = this.fileBeingRenamed;

		if(fileBeingRenamed instanceof TFolder) {
			const item = this.fileItems[fileBeingRenamed.path];
			await originalAcceptRename.apply(this);
			if(plugin.settings.hideAttachmentFolders && plugin.matchAttachmentFolder(item.file.path)) item.el.toggleClass("import-plugin-hidden",true);
		} else {
			await originalAcceptRename.apply(this);
		}
	}
}

function patchCreateFolderDom(plugin: ImportAttachments, viewClass: { new(leaf: WorkspaceLeaf): FileExplorerView }) {
	if(originalCreateFolderDom) return;

	originalCreateFolderDom = viewClass.prototype.createFolderDom;

	viewClass.prototype.createFolderDom = function(this: FileExplorerView, folder: TFolder): FileExplorerItem {
		if(!originalCreateFolderDom) throw new Error('Something went wrong in patching file-explorer plugin.');
		
		const item = originalCreateFolderDom.apply(this, [folder]);
			
		if(plugin.settings.hideAttachmentFolders && plugin.matchAttachmentFolder(item.file.path)) item.el.toggleClass("import-plugin-hidden",true);

		return item;
	};
}

function patchFileExplorerView(plugin: ImportAttachments, viewClass: { new(leaf: WorkspaceLeaf): FileExplorerView }) {
	patchCreateFolderDom(plugin,viewClass);
	patchAcceptRename(plugin,viewClass);
}

function updateVisibilityAttachmentFolders(plugin: ImportAttachments){
	const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');
	const hide = plugin.settings.hideAttachmentFolders;
	for (const leaf of leaves) {
		const viewInstance = leaf.view as FileExplorerView;

        if(hide) {
            Object.entries(viewInstance.fileItems).forEach(([folderPath, item]) => {
                if(item.file instanceof TFolder) {
                    item.el.toggleClass("import-plugin-hidden",plugin.matchAttachmentFolder(folderPath));
                }
            });
        } else {
            Object.entries(viewInstance.fileItems).forEach(([folderPath, item]) => {
                if(item.file instanceof TFolder) {
                    item.el.toggleClass("import-plugin-hidden",false);
                }
            });
		};
	}
}

function patchFileExplorer(plugin: ImportAttachments) {
	if (originalViewFactory || originalCreateFolderDom) { return; }
    debugger
	// First attempt to apply the patch to existing leaves, in case file-explorer plugin was already loaded
	let patched = false;
	const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');
	for (const leaf of leaves) {
		const viewInstance = leaf.view as FileExplorerView;
		viewClass = viewInstance.constructor as { new(leaf: WorkspaceLeaf): FileExplorerView }; // Get the class from the instance
		patchFileExplorerView(plugin,viewClass);
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
		
		// Get the class from the instance
		viewClass = viewInstance.constructor as { new(leaf: WorkspaceLeaf): FileExplorerView };

		// Apply the patch to CreateFolderDom
		patchFileExplorerView(plugin, viewClass);

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
