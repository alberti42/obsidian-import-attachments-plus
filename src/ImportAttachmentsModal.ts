// ImportAttachmentsModal.ts
import { Component, MarkdownRenderer, Modal, Platform, TFile, TFolder, setIcon, Notice } from 'obsidian';
import {
		ImportActionType,
		ImportActionChoiceResult,
		OverwriteChoiceResult,
		OverwriteChoiceOptions,
		ImportFromVaultOptions,
		ImportFromVaultChoiceResult,
		CheckboxOptions,
		YesNoTypes,
		// ImportOperationType,
	} from './types';
import * as Utils from 'utils';
import type ImportAttachments from 'main'; // Import the type of your plugin class if needed for type hinting
import type { StrayAttachment } from 'strayAttachments';
import { moveStrayAttachments, type StrayAttachmentMove } from 'strayAttachments';

const MODAL_TITLE_HTML_EL='h4';

export class ImportActionTypeModal extends Modal {
	promise: Promise<ImportActionChoiceResult>;
	private resolveChoice: (result: ImportActionChoiceResult) => void = () => {};  // To resolve the promise. Initialize with a no-op function
	private selectedAction: ImportActionType;
	private selectedEmbedOption: YesNoTypes;
	private rememberChoice: boolean = false;  // Private variable to store the checkbox state
	
	constructor(private plugin: ImportAttachments, private lastActionFilesOnImport: ImportActionType, private lastEmbedOnImport: YesNoTypes) {
		// use TypeScript `parameter properties` to initialize `plugin`.
		super(plugin.app);
		this.promise = new Promise<ImportActionChoiceResult>((resolve) => {
			this.resolveChoice = resolve;
		});
		this.selectedAction = lastActionFilesOnImport;
		this.selectedEmbedOption = lastEmbedOnImport;
	}

	createToggle(table: HTMLTableElement, questionText: string, optionA: string, optionB: string, initialOption: CheckboxOptions, callback: (selectedOption:CheckboxOptions) => void, withSeparator: boolean = false) {
		// Main container that holds both the question and the toggle group
		const tr = table.createEl('tr');
		if(withSeparator) {
			tr.addClass('sep');
		}

		// Add the question aligned to the left
		tr.createEl('td', { text: questionText, cls: 'import-question' });

		// Label for option A (e.g., "Move")
		tr.createEl('td', { text: optionA, cls: 'import-option-A' });

		// Create the toggle switch
		const td = tr.createEl('td');
		const switchLabel = td.createEl('label', { cls: 'import-switch' });
		const input = switchLabel.createEl('input', { type: 'checkbox' });
		if(initialOption===CheckboxOptions.A) {
			input.checked = false;
		} else {
			input.checked = true;
		}
		
		switchLabel.createEl('span', { cls: 'import-slider' });

		// Label for option B (e.g., "Copy")
		tr.createEl('td', { text: optionB, cls: 'import-option-B' });

		// Event listener for toggle
		input.addEventListener('change', () => {
			if (callback) {
				callback(input.checked ? CheckboxOptions.B : CheckboxOptions.A);
			}
		});
	}

	onOpen() {
		let initialOption;

		const { contentEl } = this;

		const container = contentEl.createDiv({ cls: 'import-plugin' });

		container.createEl(MODAL_TITLE_HTML_EL, { text: 'Import files' });
		container.createEl('p', { text: 'Configure the import options and then press either enter or the import button.' });

		const table = container.createEl('table');
		
		switch(this.lastActionFilesOnImport){
		case ImportActionType.MOVE:
			initialOption = CheckboxOptions.A;
			break;
		case ImportActionType.COPY:
		default:
			initialOption = CheckboxOptions.B;
			break;
		}

		// Creating action toggle
		this.createToggle(table, 'Do you want to move or copy the files to the vault?', 'Move', 'Copy', initialOption, (selectedOption:CheckboxOptions) => {
			if(selectedOption===CheckboxOptions.A){
				this.selectedAction = ImportActionType.MOVE;
			} else {
				this.selectedAction = ImportActionType.COPY;
			}
		}, true);

		switch(this.lastEmbedOnImport){
		case YesNoTypes.YES:
			initialOption = CheckboxOptions.A;
			break;
		case YesNoTypes.NO:
		default:
			initialOption = CheckboxOptions.B;
			break;
		}

		// Creating action toggle
		this.createToggle(table, 'Do you want to embed or link the files to the vault?', 'Embed', 'Link', initialOption, (selectedOption:CheckboxOptions) => {
			if(selectedOption===CheckboxOptions.A){
				this.selectedEmbedOption = YesNoTypes.YES;
			} else {
				this.selectedEmbedOption = YesNoTypes.NO;
			}
		}, true);

		// Creating remember toggle
		this.createToggle(table, 'Save this answer in the settings for the future?', 'Yes', 'No', CheckboxOptions.B, (selectedOption:CheckboxOptions) => {
			if(selectedOption===CheckboxOptions.A){
				this.rememberChoice = true;
			} else {
				this.rememberChoice = false;
			}
		}, true);

		// Create the 'Move' button inside the container
		const importButtonContainer = container.createDiv({cls:'import-buttons'});

		/*
		const cancelButton = importButtonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'mod-cta'
		});
		cancelButton.addEventListener('click', () => {
			this.close();
		});
		*/

		const importButton = importButtonContainer.createEl('button', {
			text: 'Import',
			cls: 'mod-cta'
		});
		importButton.addEventListener('click', () => {
			this.import();
		});

		window.setTimeout(() => {
			// Set focus with a slight delay:
			// this method leverages JavaScript's event loop, ensuring that focusing the button
			// is enqueued after all the elements are properly rendered and the DOM is fully updated.
			importButton.focus();
		}, 0); // A timeout of 0 ms is often enough

		/*
		contentEl.addEventListener('keyup', (event) => {
			if (event.key === 'Enter') {
				importButton.click();
			}
		});
		*/
	}

	async import() {
		this.resolveChoice({
			action: this.selectedAction,
			embed: this.selectedEmbedOption,
			rememberChoice: this.rememberChoice
		});
		this.close(); 
	}

	onClose() {
		this.contentEl.empty();
		this.resolveChoice(null);  // Resolve with null if the modal is closed without a choice
	}
}

export class OverwriteChoiceModal extends Modal {
	promise: Promise<OverwriteChoiceResult>;
	private resolveChoice: (result: OverwriteChoiceResult) => void = () => {};  // To resolve the promise. Initialize with a no-op function
	private filename: string;
	
	constructor(private plugin: ImportAttachments, private originalFilePath: string, private destFilePath: string) {
		// use TypeScript `parameter properties` to initialize `plugin`.
		super(plugin.app);
		this.promise = new Promise<OverwriteChoiceResult>((resolve) => {
			this.resolveChoice = resolve;
		});
		const parsed_filepath = Utils.parseFilePath(destFilePath);
		this.filename = parsed_filepath.filename;
	}

	onOpen() {
		const { contentEl } = this;

		const container = contentEl.createDiv({ cls: 'import-plugin' });

		container.createEl(MODAL_TITLE_HTML_EL, { text: 'Import files' });
		const paragraph = container.createEl('p');
		paragraph.append('You are trying to copy the file ');
		
		const {base} = Utils.parseFilePath(this.originalFilePath);

		// Create a hyperlink for the filename
		const origFileLink = paragraph.createEl('a', {
			text: base,
			href: '#',
		});
		origFileLink.addEventListener('click', (e) => {
			e.preventDefault(); // Prevent the default anchor behavior
			// Open the folder in the system's default file explorer
			window.require('electron').remote.shell.showItemInFolder(Utils.makePosixPathOScompatible(this.originalFilePath));
		});

		paragraph.append(' into the vault. However, a ');
		
		// Create a hyperlink for the filename
		const vaultFileLink = paragraph.createEl('a', {
			text: 'file',
			href: '#',
		});
		vaultFileLink.addEventListener('click', (e) => {
			e.preventDefault(); // Prevent the default anchor behavior
			// Open the folder in the system's default file explorer
			window.require('electron').remote.shell.showItemInFolder(Utils.makePosixPathOScompatible(Utils.joinPaths(this.plugin.vaultPath,this.destFilePath)));
		});

		paragraph.append(' with the same name already exists at the destination location.');

		container.createEl('p',{text: 'How do you want to proceed?'});

		// Create the 'Move' button inside the container
		const buttonContainer = container.createDiv({cls:'import-buttons'});
		const keepButton = buttonContainer.createEl('button', {
			text: 'Keep both',
			cls: 'mod-cta'
		});
		keepButton.addEventListener('click', () => {
			this.resolveChoice(OverwriteChoiceOptions.KEEPBOTH);
			this.close(); 
		});
		const overwriteButton = buttonContainer.createEl('button', {
			text: 'Overwrite',
			cls: 'mod-warning'
		});
		overwriteButton.addEventListener('click', () => {
			this.resolveChoice(OverwriteChoiceOptions.OVERWRITE);
			this.close(); 
		});
		const skipButton = buttonContainer.createEl('button', {
			text: 'Skip',
			cls: 'mod-cancel'
		});
		skipButton.addEventListener('click', () => {
			this.resolveChoice(OverwriteChoiceOptions.SKIP);
			this.close(); 
		});
		
		window.setTimeout(() => {
			// Set focus with a slight delay:
			// this method leverages JavaScript's event loop, ensuring that focusing the button
			// is enqueued after all the elements are properly rendered and the DOM is fully updated.
			keepButton.focus();
		}, 0); // A timeout of 0 ms is often enough
	}

	onClose() {
		this.contentEl.empty();
		this.resolveChoice(null);  // Resolve with null if the modal is closed without a choice
	}
}

export class DeleteAttachmentFolderModal extends Modal {
	promise: Promise<boolean>;
	private resolveChoice: (result: boolean) => void = () => {};  // To resolve the promise. Initialize with a no-op function
	
	constructor(private plugin: ImportAttachments,
            private attachmentFolder: TFolder, 
            private preDescription?:HTMLElement,
            private postDescription?:HTMLElement) {
		// use TypeScript `parameter properties` to initialize `plugin`.
		super(plugin.app);
		this.promise = new Promise<boolean>((resolve) => {
			this.resolveChoice = resolve;
		});
	}

	onOpen() {

		const { contentEl } = this;

		const container = contentEl.createDiv({ cls: 'import-plugin' });

		container.createEl(MODAL_TITLE_HTML_EL, { text: 'Delete the attachment folder?' });

        if(this.preDescription) {container.appendChild(this.preDescription);}

		const paragraph = container.createEl('p');
		paragraph.append('Do you want to ' + (Platform.isDesktop ? 'move' : 'delete') + ' the attachment folder ');
		
		if(Platform.isDesktopApp) {
			// Create a hyperlink for the filename
			const fileLink = paragraph.createEl('a', {
				text: this.attachmentFolder.name,
				href: '#',
			});
			fileLink.addEventListener('click', (e) => {
				e.preventDefault(); // Prevent the default anchor behavior
				// Open the folder in the system's default file explorer
				// window.require('electron').remote.shell.showItemInFolder(this.attachmentFolderPath);
				window.require('electron').remote.shell.openPath(Utils.makePosixPathOScompatible(Utils.joinPaths(this.plugin.vaultPath,this.attachmentFolder.path)));
			});
		} else {
			paragraph.createEl('strong', {text: this.attachmentFolder.name});
		}		

		if(Platform.isDesktopApp) {
			paragraph.append(' to the system trash?');
		} else {
			paragraph.append('?');
		}

        if(this.postDescription) {container.appendChild(this.postDescription);}
		
		const buttonContainer = container.createDiv({cls:'import-buttons'});
		const deleteButton = buttonContainer.createEl('button', {
			text: 'Delete',
			cls: 'mod-warning'
		});
		deleteButton.addEventListener('click', () => {
			this.resolveChoice(true);
			this.close(); 
		});	    
		const cancelButton = buttonContainer.createEl('button', {
			text: 'Skip',
			cls: 'mod-cancel'
		});
		cancelButton.addEventListener('click', () => {
			this.resolveChoice(false);
			this.close(); 
		});
		
		window.setTimeout(() => {
			// Set focus with a slight delay:
			// this method leverages JavaScript's event loop, ensuring that focusing the button
			// is enqueued after all the elements are properly rendered and the DOM is fully updated.
			cancelButton.focus();
		}, 0); // A timeout of 0 ms is often enough
	}

	onClose() {
		this.contentEl.empty();
		this.resolveChoice(false);  // Resolve with null if the modal is closed without a choice
	}
}

export class ImportFromVaultChoiceModal extends Modal {
	promise: Promise<ImportFromVaultChoiceResult>;
	private resolveChoice: (result: ImportFromVaultChoiceResult) => void = () => {};  // To resolve the promise. Initialize with a no-op function
	
	constructor(private plugin: ImportAttachments, private vaultPath: string, private relativeFilePath: string, private importAction: ImportActionType) {
		// use TypeScript `parameter properties` to initialize `plugin`.
		super(plugin.app);
		this.promise = new Promise<ImportFromVaultChoiceResult>((resolve) => {
			this.resolveChoice = resolve;
		});
	}

	onOpen() {
		const { contentEl } = this;

		const container = contentEl.createDiv({ cls: 'import-plugin' });

		container.createEl(MODAL_TITLE_HTML_EL, { text: 'Import files' });
		const paragraph = container.createEl('p');
		paragraph.append('The file you are trying to import ');
		
		// Create a hyperlink for the filename
		const fileLink = paragraph.createEl('a', {
			text: this.relativeFilePath,
			href: '#',
		});
		fileLink.addEventListener('click', (e) => {
			e.preventDefault(); // Prevent the default anchor behavior
			// Open the folder in the system's default file explorer
			window.require('electron').remote.shell.showItemInFolder(Utils.makePosixPathOScompatible(Utils.joinPaths(this.plugin.vaultPath,this.relativeFilePath)));
		});

		paragraph.append(' is already stored in the vault.');

		if(this.importAction===ImportActionType.MOVE) {
			container.createEl('p',{text: 'You intended to move the file. \
					However, moving a file that is already in the vault to a new \
					destination in the same vault is not supported; \
					only copying and linking operations are allowed.'});
		}

		container.createEl('p',{text: 'Do you want to make a copy or refer to the original file in the vault through a relative path?'});

		// Create the 'Move' button inside the container
		const buttonContainer = container.createDiv({cls:'import-buttons'});
		const linkButton = buttonContainer.createEl('button', {
			text: 'Relative path',
			cls: 'mod-cta'
		});
		linkButton.addEventListener('click', () => {
			this.resolveChoice(ImportFromVaultOptions.LINK);
			this.close(); 
		});
		const copyButton = buttonContainer.createEl('button', {
			text: 'Copy',
			cls: 'mod-warning'
		});
		copyButton.addEventListener('click', () => {
			this.resolveChoice(ImportFromVaultOptions.COPY);
			this.close(); 
		});	    
		const skipButton = buttonContainer.createEl('button', {
			text: 'Skip',
			cls: 'mod-cancel'
		});
		skipButton.addEventListener('click', () => {
			this.resolveChoice(ImportFromVaultOptions.SKIP);
			this.close(); 
		});
		
		window.setTimeout(() => {
			// Set focus with a slight delay:
			// this method leverages JavaScript's event loop, ensuring that focusing the button
			// is enqueued after all the elements are properly rendered and the DOM is fully updated.
			linkButton.focus();
		}, 0); // A timeout of 0 ms is often enough

		/*
		contentEl.addEventListener('keyup', (event) => {
			if (event.key === 'Enter') {
				keepButton.click();
			}
		});
		*/
	}

	onClose() {
		this.contentEl.empty();
		this.resolveChoice(null);  // Resolve with null if the modal is closed without a choice
	}
}

export class FolderImportErrorModal extends Modal {
    promise: Promise<boolean>;
    private resolveChoice: (result: boolean) => void = () => {};  // To resolve the promise. Initialize with a no-op function
    
    constructor(private plugin: ImportAttachments, private nonFolderFilesArray: File[]) {
        // use TypeScript `parameter properties` to initialize `plugin`.
        super(plugin.app);
        this.promise = new Promise<boolean>((resolve) => {
            this.resolveChoice = resolve;
        });
    }

    onOpen() {
        const { contentEl } = this;

        const container = contentEl.createDiv({ cls: 'import-plugin' });

        container.createEl(MODAL_TITLE_HTML_EL, { text: 'Import files' });
        const paragraph = container.createEl('p');
        paragraph.append('Importing folders is not supported in Obsidian. The following folders will not be imported:');
        
        // Create a list to display folders
        const ul = container.createEl('ul');
        
        this.nonFolderFilesArray.forEach((folder) => {
            const li = ul.createEl('li');
            
            // Create a hyperlink for the filename
            const fileLink = li.createEl('a', {
                text: folder.name,
                href: '#',
            });
            fileLink.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent the default anchor behavior
                // Open the folder in the system's default file explorer
                window.require('electron').remote.shell.openPath(Utils.makePosixPathOScompatible(folder.path));
            });
        });

        const buttonContainer = container.createDiv({ cls: 'import-buttons' });
        const okButton = buttonContainer.createEl('button', {
            text: 'Ok',
            cls: 'mod-warning'
        });
        okButton.addEventListener('click', () => {
            this.resolveChoice(true);
            this.close(); 
        });
        
        window.setTimeout(() => {
            // Set focus with a slight delay:
            // this method leverages JavaScript's event loop, ensuring that focusing the button
            // is enqueued after all the elements are properly rendered and the DOM is fully updated.
            okButton.focus();
        }, 0); // A timeout of 0 ms is often enough
    }

    onClose() {
        this.contentEl.empty();
        this.resolveChoice(false);  // Resolve with false if the modal is closed without a choice
    }
}

export class CreateAttachmentFolderModal extends Modal {
    promise: Promise<boolean>;
    private resolveChoice: (result: boolean) => void = () => {};  // To resolve the promise. Initialize with a no-op function
    
    constructor(private plugin: ImportAttachments, private attachmentFolderPath: string) {
        // use TypeScript `parameter properties` to initialize `plugin`.
        super(plugin.app);
        this.promise = new Promise<boolean>((resolve) => {
            this.resolveChoice = resolve;
        });
    }

    onOpen() {
        const { contentEl } = this;

        const container = contentEl.createDiv({ cls: 'import-plugin' });

        const attachmentFolderPath_parsed = Utils.parseFilePath(this.attachmentFolderPath);

        container.createEl(MODAL_TITLE_HTML_EL, { text: 'Create an empty attachment folder?' });
        const paragraph = container.createEl('p');
        paragraph.append('The attachment folder ');

        // Highlight the folder name using a <span> element with a custom class
        paragraph.createEl('strong', {text: attachmentFolderPath_parsed.base});

        paragraph.append(' does not exist yet. Do you want to create it?');
        
        const buttonContainer = container.createDiv({ cls: 'import-buttons' });
        const yesButton = buttonContainer.createEl('button', {
            text: 'Yes',
            cls: 'mod-cta'
        });
        yesButton.addEventListener('click', () => {
            this.resolveChoice(true);
            this.close(); 
        });
        const noButton = buttonContainer.createEl('button', {
            text: 'No',
            cls: 'mod-cancel'
        });
        noButton.addEventListener('click', () => {
            this.resolveChoice(false);
            this.close(); 
        });
        
        window.setTimeout(() => {
            // Set focus with a slight delay:
            // this method leverages JavaScript's event loop, ensuring that focusing the button
            // is enqueued after all the elements are properly rendered and the DOM is fully updated.
            yesButton.focus();
        }, 0); // A timeout of 0 ms is often enough
    }

    onClose() {
        this.contentEl.empty();
        this.resolveChoice(false);  // Resolve with false if the modal is closed without a choice
    }
}

const ROW_CLASSNAME = 'stray-attachment-row';

export class StrayAttachmentsModal extends Modal {
	promise: Promise<boolean>;
	private resolveChoice: (result: boolean) => void = () => { };  // To resolve the promise. Initialize with a no-op function
	private isResolved = false;
	private previewEl: HTMLElement | null = null;
	private previewEmbedEl: HTMLElement | null = null;
	private previewEmptyEl: HTMLElement | null = null;
	private previewToken = 0;
	// MarkdownRenderer.render() needs a Component to own the lifecycle of whatever it
	// creates (the pdf.js viewer, media players, ...). Modal is not a Component, so we
	// keep one of our own and unload it in onClose().
	private previewComponent = new Component();
	private selectedRow: HTMLElement | null = null;
	private selectedStray: StrayAttachment | null = null;
	private rowToStray: Map<HTMLElement, StrayAttachment>;
	private moveAllButtonEl: HTMLButtonElement | null = null;
	private confirmedMoveAll = false;

	// The preview is an Obsidian embed, rendered by MarkdownRenderer, so anything
	// Obsidian can embed we get for free: images, PDFs (its own pdf.js viewer), and
	// audio/video players. Kept as an explicit list only to decide whether to attempt
	// an embed at all — for everything else we show the placeholder rather than let
	// Obsidian render a broken-embed link.
	private static readonly previewExtensions = [
		'avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp',   // images
		'pdf',                                                       // pdf.js viewer
		'flac', 'm4a', 'mp3', 'ogg', 'wav', '3gp',                   // audio
		'mkv', 'mov', 'mp4', 'ogv', 'webm',                          // video
	];
	private static readonly previewExtensionSet = new Set(StrayAttachmentsModal.previewExtensions);

	constructor(private plugin: ImportAttachments, private strays: StrayAttachment[]) {
		super(plugin.app);
		this.rowToStray = new Map();
		this.promise = new Promise((resolve) => {
			this.resolveChoice = resolve;
		});
	}

	private resolve(result: boolean) {
		if (!this.isResolved) {
			this.isResolved = true;
			this.resolveChoice(result);
		}
	}

	private initPreviewElements() {
		if (!this.previewEl || this.previewEmbedEl) {return;}

		this.previewEmptyEl = this.previewEl.createDiv({ cls: 'import-preview-empty' });
		setIcon(this.previewEmptyEl.createDiv({ cls: 'import-preview-icon' }), 'file-question');
		this.previewEmptyEl.createEl('div', { text: 'No preview', cls: 'import-preview-text' });
		this.previewEmptyEl.createEl('div', {
			text: 'Previews are shown for images, PDFs, audio and video.',
			cls: 'import-preview-formats'
		});

		this.previewEmbedEl = this.previewEl.createDiv({ cls: 'import-preview-embed' });
	}

	private showPreview(show: 'embed' | 'fallback') {
		if (!this.previewEmbedEl || !this.previewEmptyEl) {return;}
		const embedShown = show === 'embed';
		this.previewEmbedEl.toggleClass('import-preview-shown', embedShown);
		this.previewEmbedEl.toggleClass('import-preview-hidden', !embedShown);
		this.previewEmptyEl.toggleClass('import-preview-shown', !embedShown);
		this.previewEmptyEl.toggleClass('import-preview-hidden', embedShown);
	}

	private async renderPreview() {
		this.initPreviewElements();
		const embedEl = this.previewEmbedEl;
		if (!embedEl || !this.previewEmptyEl) {return;}

		// Invalidate any render still in flight: selection can change faster than an
		// embed loads, and a late one must not overwrite a newer preview.
		const token = ++this.previewToken;
		embedEl.empty();

		const stray = this.selectedStray;
		if (!stray || !StrayAttachmentsModal.previewExtensionSet.has(stray.file.extension.toLowerCase())) {
			this.showPreview('fallback');
			return;
		}

		// Let Obsidian render the embed rather than building an <img>/<video>/viewer
		// ourselves. generateMarkdownLink handles escaping and the user's link-format
		// preference; the leading '!' turns the link into an embed.
		const link = this.app.fileManager.generateMarkdownLink(stray.file, stray.file.path);
		try {
			await MarkdownRenderer.render(this.app, `!${link}`, embedEl, stray.file.path, this.previewComponent);
		} catch (error) {
			console.error('Failed to render preview for', stray.file.path, error);
			if (token === this.previewToken) { this.showPreview('fallback'); }
			return;
		}

		if (token !== this.previewToken) { return; }
		this.showPreview('embed');
	}

	private selectTargetRow(target: HTMLElement, doRenderPreview = true, doScroll = false) {
		// `has`, not `get(...) === null`: the map yields undefined for a missing key.
		if (!this.rowToStray.has(target)) {
			console.warn('trying to select row for which an entry does not exist!', target);
			return;
		}
		if (this.selectedRow !== null) {
			this.selectedRow.removeAttribute('data-selected');
		}
		this.selectedRow = target;
		this.selectedRow.setAttribute('data-selected', 'true');
		this.selectedStray = this.rowToStray.get(target)!
		if (doScroll) {this.selectedRow.scrollIntoView({ behavior: 'auto', block: 'nearest' });}
		if (doRenderPreview) {this.renderPreview();}
	}

	private selectNextRow(row: HTMLElement) {
		if (row === null || !row.classList.contains(ROW_CLASSNAME)) {return;}
		const target = row.nextElementSibling as HTMLElement;
		if (target === null || !target.classList.contains(ROW_CLASSNAME)) {return;}

		this.selectTargetRow(target, true, true);
	}

	private selectPreviousRow(row: HTMLElement) {
		if (row === null || !row.classList.contains(ROW_CLASSNAME)) {return;}
		const target = row.previousElementSibling as HTMLElement;
		if (target === null || !target.classList.contains(ROW_CLASSNAME)) {return;}

		this.selectTargetRow(target, true, true);
	}

	// The confirmation on 'Move all' quotes a count, so it has to be asked again
	// whenever the user changes what would be moved.
	private resetMoveAllConfirmation() {
		if (!this.confirmedMoveAll) {return;}
		this.confirmedMoveAll = false;
		this.moveAllButtonEl?.setText('Move all attachments');
		this.moveAllButtonEl?.removeClass('mod-warning');
	}

	private selectNextOrPreviousBeforeRemove(wrapper: HTMLElement) {
		this.resetMoveAllConfirmation();
		if (this.selectedRow !== wrapper) {return;}
		const next = wrapper.nextElementSibling as HTMLElement | null;
		if (next && next.classList.contains(ROW_CLASSNAME)) {
			this.selectNextRow(wrapper);
		} else {
			this.selectPreviousRow(wrapper);
		}
	}

	/**
	 * A folder cell that is a link to the note owning that folder, or plain text when
	 * the note is unknown (its folder could not be traced back to a note).
	 */
	private renderNoteLink(parent: HTMLElement, cls: string[], text: string, note: TFile | undefined, line: number | undefined, title: string) {
		if (!note) {
			parent.createSpan({ cls, text, title });
			return;
		}

		const link = parent.createEl('a', { cls: [...cls, 'stray-attachment-note-link'], text, title, href: '#' });
		link.addEventListener('click', (evt) => {
			evt.preventDefault();
			// Without this the click would also land on the row and change the selection.
			evt.stopPropagation();
			this.openNote(note, line);
		});
	}

	/**
	 * Open a note in a new tab, scrolled to `line` when one is known, and close the
	 * modal so the note is actually visible — a modal covering the note it just opened
	 * would defeat the point. Nothing is lost: re-running the command rebuilds the list.
	 */
	private openNote(note: TFile, line?: number) {
		const eState = line === undefined ? undefined : { line };
		this.app.workspace.getLeaf('tab').openFile(note, { eState })
			.catch(error => {
				console.error('Failed to open note', note.path, error);
				new Notice(`Could not open ${note.basename}`);
			});
		this.close();
	}

	private renderRow(parent: HTMLElement, stray: StrayAttachment) {
		const wrapper = parent.createDiv({ cls: ROW_CLASSNAME });
		wrapper.dataset.destIndex = '0';
		this.rowToStray.set(wrapper, stray);

		wrapper.createSpan({ cls: 'stray-attachment-row-name', text: stray.file.name, title: stray.file.name });
		const destIndex = parseInt(wrapper.dataset.destIndex ?? '0');
		const toText = stray.to[destIndex]?.attachFolder ?? '-';

		// The folder the file sits in now, linked to the note that folder belongs to.
		this.renderNoteLink(
			wrapper,
			['stray-attachment-row-from', 'reverse-ellipsis'],
			stray.from,
			stray.fromNote,
			undefined,
			stray.fromNote
				? `Open ${stray.fromNote.basename} — the note this attachment was filed under (closes this dialog)`
				: stray.from
		);

		const arrow = wrapper.createSpan({ cls: 'stray-attachment-arrow' })

		if (stray.to.length === 1) {
			const dest = stray.to[destIndex];
			this.renderNoteLink(
				wrapper,
				['stray-attachment-row-to', 'reverse-ellipsis'],
				toText,
				dest?.note,
				dest?.line,
				dest ? `Open ${dest.note.basename} at the first use of this attachment (closes this dialog)` : toText
			);
		} else {
			const select = wrapper.createEl('select', { cls: ['stray-attachment-row-to', 'reverse-ellipsis'] });
			for (let i = 0; i < stray.to.length; i++) {
				const option = select.createEl('option', {
					text: stray.to[i].attachFolder,
					value: String(i)
				});
				if (i === destIndex) {option.selected = true;}
			}
			select.addEventListener('change', (e) => {
				e.stopPropagation();
				wrapper.dataset.destIndex = select.value;
				this.contentEl.focus();
			});

			// A <select> cannot double as a link, so the way to inspect the chosen
			// destination is a button beside it.
			const openButton = wrapper.createEl('button', {
				cls: ['clickable-icon', 'stray-attachment-row-btn', 'stray-attachment-open'],
				attr: { 'aria-label': 'Open the selected note at the first use of this attachment (closes this dialog)' }
			});
			setIcon(openButton, 'square-arrow-out-up-right');
			openButton.addEventListener('click', (e) => {
				e.stopPropagation();
				const dest = stray.to[parseInt(wrapper.dataset.destIndex ?? '0')];
				if (dest) { this.openNote(dest.note, dest.line); }
			});
		}

		setIcon(arrow, 'arrow-right');

		wrapper.createSpan({ cls: 'stray-attachment-spacer' });
		const confirmButton = wrapper.createEl('button', { cls: ['clickable-icon', 'stray-attachment-row-btn', 'stray-attachment-confirm'] });
		setIcon(confirmButton, 'check');
		confirmButton.addEventListener('click', async (e) => {
			e.stopPropagation();
			const destFolder = stray.to[parseInt(wrapper.dataset.destIndex ?? '0')];
			if (!destFolder) {
				console.warn('No destination folder found for stray attachment:', stray);
				return;
			}
			try {
				const count = await moveStrayAttachments(this.plugin, [{
					sourcePath: stray.fromPath,
					destinationPath: destFolder.attachFolder,
					sourceFile: stray.file
				}]);
				if (count > 0) {new Notice(`Successfully moved ${stray.file.name}`);}
				this.selectNextOrPreviousBeforeRemove(wrapper);
				wrapper.remove();
				this.contentEl.focus();
			} catch (error) {
				console.error('Error moving attachment:', error);
				new Notice(`Failed to move ${stray.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		});

		const removeButton = wrapper.createEl('button', { cls: ['clickable-icon', 'stray-attachment-row-btn', 'stray-attachment-dismiss'] });
		removeButton.addEventListener('click', (e) => {
			e.stopPropagation();
			this.selectNextOrPreviousBeforeRemove(wrapper);
			wrapper.remove();
			this.contentEl.focus();
		})
		setIcon(removeButton, 'x');

		wrapper.addEventListener('click', () => {
			if (this.selectedRow) {this.selectedRow.removeAttribute('data-selected');}
			this.selectedRow = wrapper;
			this.selectedRow.setAttribute('data-selected', 'true');
			this.selectedStray = stray;
			this.renderPreview();
		})
	}

	onOpen() {
		const { contentEl, modalEl } = this;

		modalEl.addClass('stray-attachments-modal-el');
		contentEl.tabIndex = -1;

		// Anything MarkdownRenderer creates for a preview hangs off this component.
		this.previewComponent.load();

		const container = contentEl.createDiv({ cls: 'import-plugin stray-attachments-modal' });

		const header = container.createEl('header', { cls: 'stray-attachments-header' })
		header.createEl('h4', { text: 'Move stray attachments' })
		header.createEl('p', { text: 'These attachments sit in one note’s attachment folder but are referenced only by \
			a different note — usually because text was moved into a new note and the files stayed behind.' })
		header.createEl('p', { text: 'Each row proposes the attachment folder of a note that does reference the file. \
			Only folders managed by this plugin are considered, and an attachment already sitting in the folder of any \
			note that references it is left alone. Links are updated automatically.' })
		header.createEl('p', { text: 'Select a row — by clicking it or with the ↑ and ↓ keys — to preview that \
			attachment on the right. Press Delete to drop a row from the list without moving its file. Clicking \
			either folder opens the note it belongs to and closes this dialog; re-running the command rebuilds \
			the list.' })

		const scroller = container.createDiv({ cls: 'stray-attachments-scroller' });
		const bottomBar = container.createDiv({ cls: 'stray-attachments-bottom-bar' });
		this.previewEl = container.createDiv({ cls: 'stray-attachments-preview' });

		for (const stray of this.strays) {
			this.renderRow(scroller, stray);
		}
		this.renderPreview();

		// select the first row by default so keyboard navigation and preview work immediately
		const firstRow = scroller.querySelector<HTMLElement>(`.${ROW_CLASSNAME}`);
		if (firstRow) {this.selectTargetRow(firstRow);}

		// Modal.scope is scoped to this modal and torn down with it, unlike a listener on
		// document.body. It also leaves the <select> alone: while a destination dropdown
		// has focus, the arrow keys change the selection and Delete does nothing.
		const rowKeyHandler = (action: (row: HTMLElement) => void) => (evt: KeyboardEvent) => {
			if (this.selectedRow === null) {return;}
			if (evt.target instanceof HTMLSelectElement) {return;}
			evt.preventDefault();
			action(this.selectedRow);
		};

		this.scope.register([], 'ArrowUp', rowKeyHandler(row => this.selectPreviousRow(row)));
		this.scope.register([], 'ArrowDown', rowKeyHandler(row => this.selectNextRow(row)));
		this.scope.register([], 'Delete', rowKeyHandler(row => {
			(row.querySelector('.stray-attachment-dismiss') as HTMLButtonElement)?.click();
		}));

		const yesButton = bottomBar.createEl('button', {
			text: 'Move all attachments',
			cls: 'mod-cta'
		});
		this.moveAllButtonEl = yesButton;
		yesButton.addEventListener('click', async () => {
			await this.handleMoveAll();
		});

		const cancelButton = bottomBar.createEl('button', {
			text: 'Cancel',
			cls: 'mod-cancel'
		});
		cancelButton.addEventListener('click', () => {
			this.resolve(false);
			this.close();
		});

		contentEl.focus();
	}

	private async handleMoveAll() {
		const selections: StrayAttachmentMove[] = [];
		const moveRows = Array.from(this.contentEl.querySelectorAll(`.${ROW_CLASSNAME}`));

		for (const rowEl of moveRows) {
			const row = rowEl as HTMLElement;
			const stray = this.rowToStray.get(row);
			if (!stray) {continue;}
			
			const destFolder = stray.to[parseInt(row.dataset.destIndex ?? '0')];
			if (!destFolder) {
				console.warn('No destination folder found for stray attachment:', stray);
				continue;
			}
			
			selections.push({ sourcePath: stray.fromPath, destinationPath: destFolder.attachFolder, sourceFile: stray.file });
		}
		
		if (selections.length === 0) {
			this.resolve(false);
			this.close();
			return;
		}

		// Moving is not undoable, so make the user confirm the size of what they asked for.
		if (!this.confirmedMoveAll) {
			this.confirmedMoveAll = true;
			const button = this.moveAllButtonEl;
			if (button) {
				button.setText(`Confirm: move ${selections.length} attachment${selections.length > 1 ? 's' : ''}`);
				button.addClass('mod-warning');
				return;
			}
		}

		try {
			const count = await moveStrayAttachments(this.plugin, selections);
			if (count > 0) {new Notice(`Successfully moved ${count} attachment${count > 1 ? 's' : ''}`);}
			this.resolve(true);
			this.close();
		} catch (error) {
			console.error('Error moving attachments:', error);
			new Notice(`Error moving attachments: ${error instanceof Error ? error.message : 'Unknown error (check console)'}`);
			this.resolve(false);
		}
	}

	onClose() {
		// Ensure promise is resolved even if modal is closed via ESC/X button
		this.resolve(false);
		// Tear down media players and PDF viewers created for previews before the
		// elements holding them are dropped.
		this.previewToken++;
		this.previewComponent.unload();
		this.contentEl.empty();
	}
}
