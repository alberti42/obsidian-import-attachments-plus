import {WorkspaceLeaf, TFile, OpenViewState, WorkspaceWindow} from 'obsidian';

import ImportAttachments from 'main';

let metaKeyPressed = false;
let altKeyPressed = false;
const documentsWithKeyListeners = new WeakSet<Document>();

import { joinPaths, makePosixPathOScompatible, reportFailure } from 'utils';

// Save a reference to the original method for the monkey patch
let originalOpenFile: ((this: WorkspaceLeaf, file: TFile, openState?: OpenViewState)=> Promise<void>) | null = null;

// Dev-only tracing of the modifier state behind ⌘-click / ⌘⌥-click.
const traceKeys = process.env.NODE_ENV === 'development'
	? (...args: unknown[]) => { console.log('[open/reveal]', ...args); }
	: () => { /* no-op in production */ };

// Function references for event listeners
function keyDownHandler(event: KeyboardEvent) {
	if (event.metaKey) { // || e.ctrlKey
		metaKeyPressed = true;
	}
	if (event.altKey) {
		altKeyPressed = true;
	}
	traceKeys('keydown', { key: event.key, metaKey: event.metaKey, altKey: event.altKey, meta: metaKeyPressed, alt: altKeyPressed });
}

function keyUpHandler(event: KeyboardEvent) {
	if (event.key === 'Meta') {
		metaKeyPressed = false;
	}
	if (event.key === 'Alt') {
		altKeyPressed = false;
	}
	traceKeys('keyup', { key: event.key, metaKey: event.metaKey, altKey: event.altKey, meta: metaKeyPressed, alt: altKeyPressed });
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
	traceKeys('mousedown', { metaKey: event.metaKey, altKey: event.altKey, meta: metaKeyPressed, alt: altKeyPressed });
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
	traceKeys('mouseup', { metaKey: event.metaKey, altKey: event.altKey, meta: metaKeyPressed, alt: altKeyPressed });
}

/**
 * Track ⌘ and ⌥ in **every** window, not only the main one.
 *
 * These four handlers used to be attached to `document`, which is the main window's document and
 * nothing else. In a popout window the events therefore never reached them, the flags kept
 * whatever the main window had last set, and ⌘⌥-click opened the attachment externally instead of
 * revealing it in Finder. Reported from a real vault; the main window was always fine, which is
 * why it went unnoticed.
 *
 * `registerDomEvent` detaches on plugin unload, so unlike the hand-rolled version this has no
 * teardown to get wrong — and the previous one did get it wrong, calling addEventListener where it
 * meant removeEventListener and leaving a listener behind on every unload.
 */
function addKeyListeners(plugin: ImportAttachments)
{
	const install = (doc: Document) => {
		if (documentsWithKeyListeners.has(doc)) { return; }
		documentsWithKeyListeners.add(doc);
		plugin.registerDomEvent(doc, 'keydown', keyDownHandler);
		plugin.registerDomEvent(doc, 'keyup', keyUpHandler);
		plugin.registerDomEvent(doc, 'mousedown', mouseDownHandler, { capture: true });
		plugin.registerDomEvent(doc, 'mouseup', mouseUpHandler, { capture: true });
		traceKeys('key listeners installed', { mainWindow: doc === document });
	};

	install(document);

	// Windows that are already open — the plugin may be enabled with popouts on screen.
	plugin.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
		install(leaf.view.containerEl.ownerDocument);
	});

	// And any opened later.
	plugin.registerEvent(plugin.app.workspace.on('window-open', (_w: WorkspaceWindow, win: Window) => {
		install(win.document);
	}));
}

function unpatchOpenFile() {
	if(originalOpenFile) {
		WorkspaceLeaf.prototype.openFile = originalOpenFile;
		originalOpenFile = null;
	}
}

function patchOpenFile(plugin: ImportAttachments) {
	// eslint-disable-next-line @typescript-eslint/unbound-method -- the monkey-patch save/restore pattern requires the *unbound* prototype method: it is put back on the prototype in unpatch, where `this` is the caller
	originalOpenFile = WorkspaceLeaf.prototype.openFile;

	// Monkey patch the openFile method
	WorkspaceLeaf.prototype.openFile = async function patchedOpenFile(this: WorkspaceLeaf, file: TFile, openState?: OpenViewState): Promise<void> {
		const extension = '.'+file.extension;

		if(originalOpenFile && metaKeyPressed) {
			if(altKeyPressed) {
				if(plugin.settings.revealAttachmentExtExcluded.split(',').some((ext:string) => ext === extension))
				{
					return originalOpenFile.call(this, file, openState);
				}
			} else {
				if(plugin.settings.openAttachmentExternalExtExcluded.split(',').some((ext:string) => ext === extension))
				{
					return originalOpenFile.call(this, file, openState);
				}
			}
		}

		const newEmptyLeave = this.getViewState()?.type === 'empty';

		traceKeys('openFile', {
			file: file.path,
			meta: metaKeyPressed,
			alt: altKeyPressed,
			revealAttachment: plugin.settings.revealAttachment,
			openAttachmentExternal: plugin.settings.openAttachmentExternal,
			revealExcluded: plugin.settings.revealAttachmentExtExcluded,
			openExcluded: plugin.settings.openAttachmentExternalExtExcluded,
			extension,
		});

		if(plugin.settings.revealAttachment && metaKeyPressed && altKeyPressed){
			traceKeys('branch: reveal in Finder');
			window.require('electron').remote.shell.showItemInFolder(makePosixPathOScompatible(joinPaths(plugin.vaultPath,file.path)));
		}
		else if(plugin.settings.openAttachmentExternal && metaKeyPressed && !altKeyPressed) {
			traceKeys('branch: open with default app');
			plugin.app.openWithDefaultApp(file.path).catch((err: unknown) => {
				reportFailure(`Could not open '${file.path}' with the default app`, err);
			});
		}
		else
		{
			traceKeys('branch: open inside Obsidian');
			if(originalOpenFile) {
				return originalOpenFile.call(this, file, openState);
			}
		}
		if (newEmptyLeave) {
			// close prepared empty tab
			this.detach();
		}
		return Promise.resolve();
	}
}

export {patchOpenFile, addKeyListeners, unpatchOpenFile};