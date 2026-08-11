// hideAttachmentFolders.ts
//
// Attachment folders are hidden from the file explorer by toggling the
// `import-plugin-hidden` class on the explorer's own DOM items.
//
// This used to monkey-patch `createFolderDom` and `acceptRename` on the file
// explorer's view class. Neither method exists in current Obsidian — tracing showed
// both as `undefined` on the prototype — so the patches never ran, and because the
// originals were undefined `unpatchFileExplorer` could not remove the replacements
// either, leaving them attached after unload. All of the work was in fact being done
// by the sweep below, so that is all this module does now: no private methods are
// replaced, only the class on elements the explorer has already built.

import { TFolder, requireApiVersion } from 'obsidian';
import ImportAttachments from 'main';
import { isFileExplorerView } from 'types';

const HIDDEN_CLASS = 'import-plugin-hidden';

// Dev-only tracing. `process.env.NODE_ENV` is substituted at build time, so these
// calls are removed entirely from a production bundle.
const trace = process.env.NODE_ENV === 'development'
	? (...args: unknown[]) => { console.log('[hide attachment folders]', ...args); }
	: () => { /* no-op in production */ };

/**
 * Apply `settings.hideAttachmentFolders` to every folder the file explorer currently
 * has an item for. Idempotent, and cheap enough to run on any event that could change
 * which folders qualify.
 */
async function updateVisibilityAttachmentFolders(plugin: ImportAttachments) {
	const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');
	const hide = plugin.settings.hideAttachmentFolders;

	for (const leaf of leaves) {
		// A deferred view has no items to update yet, and loading it purely to hide
		// folders would defeat the point of deferring it.
		if (requireApiVersion('1.7.2') && leaf.isDeferred) { continue; }

		const viewInstance = leaf.view;
		if (!isFileExplorerView(viewInstance)) { continue; }

		let hidden = 0;
		for (const [folderPath, item] of Object.entries(viewInstance.fileItems)) {
			if (!(item.file instanceof TFolder)) { continue; }
			const match = hide && plugin.matchAttachmentFolder(folderPath);
			if (match) { hidden++; }
			item.el.toggleClass(HIDDEN_CLASS, match);
		}
		trace('swept', Object.keys(viewInstance.fileItems).length, 'items, hidden:', hidden);
	}
}

/**
 * Reveal every folder, regardless of the setting. Used on unload so nothing is left
 * hidden by a plugin that is no longer running.
 */
function revealAllAttachmentFolders(plugin: ImportAttachments) {
	for (const leaf of plugin.app.workspace.getLeavesOfType('file-explorer')) {
		if (requireApiVersion('1.7.2') && leaf.isDeferred) { continue; }

		const viewInstance = leaf.view;
		if (!isFileExplorerView(viewInstance)) { continue; }

		for (const item of Object.values(viewInstance.fileItems)) {
			if (item.file instanceof TFolder) { item.el.toggleClass(HIDDEN_CLASS, false); }
		}
	}
}

export { updateVisibilityAttachmentFolders, revealAllAttachmentFolders };
