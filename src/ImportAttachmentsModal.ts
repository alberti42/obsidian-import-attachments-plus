/* eslint-disable @typescript-eslint/no-inferrable-types */
// ImportAttachmentsModal.ts
import { App, Modal, Platform, TFolder, setIcon, Notice } from 'obsidian';
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
import * as Utils from "utils";
import type ImportAttachments from 'main'; // Import the type of your plugin class if needed for type hinting
import type { AttachmentResortPair } from 'resortAttachments';
import { moveAttachmentPairs, type MovePairSelection } from 'resortAttachments';

const MODAL_TITLE_HTML_EL='h4';

export type MovePairsModalResult = {
	selections: {
		sourcePath: string;
		destinationPath: string;
	}[];
} | null;

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
		if(initialOption==CheckboxOptions.A) {
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
			if(selectedOption==CheckboxOptions.A){
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
			if(selectedOption==CheckboxOptions.A){
				this.selectedEmbedOption = YesNoTypes.YES;
			} else {
				this.selectedEmbedOption = YesNoTypes.NO;
			}
		}, true);

		// Creating remember toggle
		this.createToggle(table, 'Save this answer in the settings for the future?', 'Yes', 'No', CheckboxOptions.B, (selectedOption:CheckboxOptions) => {
			if(selectedOption==CheckboxOptions.A){
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

		setTimeout(() => {
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
		void this.plugin;
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
		
		setTimeout(() => {
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

        if(this.preDescription) container.appendChild(this.preDescription);

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

        if(this.postDescription) container.appendChild(this.postDescription);
		
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
		
		setTimeout(() => {
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

		if(this.importAction==ImportActionType.MOVE) {
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
		
		setTimeout(() => {
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
        
        setTimeout(() => {
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
        
        setTimeout(() => {
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

const ROW_CLASSNAME = "resort-pair-row";

export class MovePairsModal extends Modal {
	promise: Promise<boolean>;
	private resolveChoice: (result: boolean) => void = () => { };  // To resolve the promise. Initialize with a no-op function
	private rows: HTMLElement[] = [];
	private previewEl: HTMLElement | null = null;
	private previewImgEl: HTMLImageElement | null = null;
	private previewEmptyEl: HTMLElement | null = null;
	private previewToken = 0;
	private selectedRow: HTMLElement | null = null;
	private selectedPair: AttachmentResortPair | null = null;
	private rowToPair: Map<HTMLElement, AttachmentResortPair>;

	private static readonly imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);

	constructor(private plugin: ImportAttachments, private pairs: AttachmentResortPair[]) {
		super(plugin.app);
		this.rowToPair = new Map();
		this.promise = new Promise((resolve) => {
			this.resolveChoice = resolve;
		});
	}

	private initPreviewElements() {
		if (!this.previewEl || this.previewImgEl) return;

		this.previewEmptyEl = this.previewEl.createDiv({ cls: 'import-preview-empty' });
		this.previewEmptyEl.createDiv({ cls: 'import-preview-icon' });
		this.previewEmptyEl.createEl('div', { text: 'No preview available', cls: 'import-preview-text' });

		this.previewImgEl = this.previewEl.createEl('img', { cls: 'import-preview-image' });
	}

	private showPreview(show: 'image' | 'fallback') {
		if (!this.previewImgEl || !this.previewEmptyEl) return;
		if (show === 'image') {
			this.previewImgEl.style.opacity = '1';
			this.previewImgEl.style.visibility = 'visible';
			this.previewEmptyEl.style.opacity = '0';
			this.previewEmptyEl.style.visibility = 'hidden';
		} else {
			this.previewImgEl.style.opacity = '0';
			this.previewImgEl.style.visibility = 'hidden';
			this.previewEmptyEl.style.opacity = '1';
			this.previewEmptyEl.style.visibility = 'visible';
		}
	}

	private renderPreview() {
		this.initPreviewElements();
		if (!this.previewImgEl || !this.previewEmptyEl) return;

		const pair = this.selectedPair;
		if (!pair || !MovePairsModal.imageExtensions.has(pair.file.extension.toLowerCase())) {
			this.showPreview('fallback');
			return;
		}

		const token = ++this.previewToken;
		const img = this.previewImgEl;

		this.showPreview('fallback');

		// oxlint-disable-next-line unicorn/prefer-add-event-listener
		img.onload = () => token === this.previewToken && this.showPreview('image');
		img.onerror = () => token === this.previewToken && this.showPreview('fallback');
		img.src = this.app.vault.adapter.getResourcePath(pair.file.path);
		img.alt = pair.file.name;
	}

	private selectTargetRow(target: HTMLElement, doRenderPreview = true, doScroll = false) {
		if (this.rowToPair.get(target) == null) {
			console.warn('trying to select row for which a pair does not exist!', target);
			return;
		}
		if (this.selectedRow != null) {
			this.selectedRow.removeAttribute('data-selected');
		}
		this.selectedRow = target;
		this.selectedRow.setAttribute('data-selected', 'true');
		this.selectedPair = this.rowToPair.get(target)!
		if (doScroll) this.selectedRow.scrollIntoView({ behavior: 'auto', block: 'nearest' });
		if (doRenderPreview) this.renderPreview();
	}
	private selectNextRow(row: HTMLElement) {
		if (row == null || !row.classList.contains(ROW_CLASSNAME)) return;
		const target = row.nextElementSibling as HTMLElement;
		if (target == null || !target.classList.contains(ROW_CLASSNAME)) return;

		this.selectTargetRow(target, true, true);
	}
	private selectPreviousRow(row: HTMLElement) {
		if (row == null || !row.classList.contains(ROW_CLASSNAME)) return;
		const target = row.previousElementSibling as HTMLElement;
		if (target == null || !target.classList.contains(ROW_CLASSNAME)) return;

		this.selectTargetRow(target, true, true);
	}

	private renderRow(parent: HTMLElement, pair: AttachmentResortPair) {
		const wrapper = parent.createDiv({ cls: ROW_CLASSNAME });
		wrapper.dataset.destIndex = '0';
		this.rowToPair.set(wrapper, pair);

		const name = wrapper.createSpan({ cls: 'resort-pair-row-name', text: pair.file.name, title: pair.file.name });
		const destIndex = parseInt(wrapper.dataset.destIndex ?? '0');
		const toText = pair.to[destIndex]?.attachFolder ?? "-";

		const from = wrapper.createSpan({ cls: ['resort-pair-row-from', 'reverse-ellipsis'], text: pair.from, title: pair.from });
		const arrow = wrapper.createSpan({ cls: 'rpr-arrow' })

		let to: HTMLElement;
		if (pair.to.length === 1) {
			to = wrapper.createSpan({ cls: ['resort-pair-row-to', 'reverse-ellipsis'], text: toText, title: toText });
		} else {
			const select = wrapper.createEl('select', { cls: ['resort-pair-row-to', 'reverse-ellipsis'] });
			for (let i = 0; i < pair.to.length; i++) {
				const option = select.createEl('option', {
					text: pair.to[i].attachFolder,
					value: String(i)
				});
				if (i === destIndex) option.selected = true;
			}
			select.addEventListener('change', (e) => {
				e.stopPropagation();
				wrapper.dataset.destIndex = select.value;
				this.contentEl.focus();
			});
			to = select;
		}

		setIcon(arrow, 'arrow-right');

		wrapper.createSpan({ cls: 'rpr-spacer' });
		const confirmButton = wrapper.createEl("button", { cls: ['clickable-icon', 'resort-pair-row-btn', 'rpr-btn-confirm'] });
		setIcon(confirmButton, 'check');

		const removeButton = wrapper.createEl("button", { cls: ['clickable-icon', 'resort-pair-row-btn', 'rpr-btn-dismiss'] });
		removeButton.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.selectedRow === wrapper) {
				const next = wrapper.nextElementSibling as HTMLElement | null;
				if (next && next.classList.contains(ROW_CLASSNAME)) {
					this.selectNextRow(wrapper);
				} else {
					this.selectPreviousRow(wrapper);
				}
			}

			wrapper.remove();
			this.contentEl.focus();
		})
		setIcon(removeButton, 'x');

		wrapper.addEventListener("click", () => {
			if (this.selectedRow) this.selectedRow.removeAttribute('data-selected');
			this.selectedRow = wrapper;
			this.selectedRow.setAttribute('data-selected', 'true');
			this.selectedPair = pair;
			this.renderPreview();
		})
	}

	onOpen() {
		const { contentEl, modalEl } = this;

		modalEl.style.minWidth = '60ch';
		modalEl.style.width = "max-content";
		modalEl.style.maxWidth = '90vh';

		modalEl.style.height = '100%';
		modalEl.style.maxHeight = '60vh';

		contentEl.style.height = '98%';
		contentEl.tabIndex = -1;

		const container = contentEl.createDiv({ cls: 'import-plugin resort-pairs-modal' });

		const header = container.createEl('header', { cls: 'resort-pairs-header' })
		header.createEl('h4', { text: 'Resort attachments' })
		header.createSpan({ text: "Here are attachments that are in a different attachment folder than the one they belong in, and where they should be moved." })

		const scroller = container.createDiv({ cls: 'resort-pairs-scroller' });
		const bottomBar = container.createDiv({ cls: 'resort-pairs-bottom-bar' });
		this.previewEl = container.createDiv({ cls: 'resort-pairs-preview' });

		for (const pair of this.pairs) {
			this.renderRow(scroller, pair);
		}
		this.renderPreview();

		this.plugin.registerDomEvent(contentEl.ownerDocument.body, 'keydown', (e: KeyboardEvent) => {
			if (this.selectedRow == null) return;
			if (e.key === "ArrowUp") {
				e.preventDefault();
				this.selectPreviousRow(this.selectedRow);
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				this.selectNextRow(this.selectedRow);
			} else if (e.key === "Delete") {
				e.preventDefault();
				(this.selectedRow.querySelector('.rpr-btn-dismiss') as HTMLButtonElement)?.click();
			}
		})

		const yesButton = bottomBar.createEl('button', {
			text: 'Move all attachments',
			cls: 'mod-cta'
		});
		yesButton.addEventListener('click', async () => {
			await this.handleMoveAll();
		});

		const cancelButton = bottomBar.createEl('button', {
			text: 'Cancel',
			cls: 'mod-cancel'
		});
		cancelButton.addEventListener('click', () => {
			this.resolveChoice(false);
			this.close();
		});

		contentEl.focus();
	}

	private async handleMoveAll() {
		const selections: MovePairSelection[] = [];
		const moveRows = Array.from(this.contentEl.querySelectorAll(`.${ROW_CLASSNAME}`));

		for (const rowEl of moveRows) {
			const row = rowEl as HTMLElement;
			const pair = this.rowToPair.get(row);
			if (!pair) continue;
			
			const destFolder = pair.to[parseInt(row.dataset.destIndex ?? '0')];
			if (!destFolder) {
				console.warn('No destination folder found for pair:', pair);
				continue;
			}
			
			selections.push({ sourcePath: pair.fromPath, destinationPath: destFolder.attachFolder, sourceFile: pair.file });
		}
		
		if (selections.length === 0) {
			this.resolveChoice(false);
			this.close();
			return;
		}
		
		try {
			const count = await moveAttachmentPairs(this.plugin, selections);
			if (count > 0) new Notice(`Successfully moved ${count} attachment${count > 1 ? 's' : ''}`);
			this.resolveChoice(true);
			this.close();
		} catch (error) {
			console.error('Error moving attachments:', error);
			new Notice(`Error moving attachments: ${error instanceof Error ? error.message : 'Unknown error (check console)'}`);
			this.resolveChoice(false);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}