/* eslint-disable @typescript-eslint/no-inferrable-types */
// ImportAttachmentsModal.ts
import { App, Modal, Platform, TFolder } from 'obsidian';
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

export class MovePairsModal extends Modal {
	private rows: HTMLElement[] = [];
	private previewEl: HTMLElement | null = null;

	private static readonly imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);

	constructor(app: App, private pairs: AttachmentResortPair[]) {
		super(app);
	}

	private renderNoPreview() {
		if (!this.previewEl) return;
		const placeholder = this.previewEl.createDiv({ cls: 'import-preview-empty' });
		const icon = placeholder.createDiv({ cls: 'import-preview-icon' });
		icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m2 2l20 20M10.41 10.41a2 2 0 1 1-2.83-2.83m5.92 5.92L6 21m12-9l3 3"/><path d="M3.59 3.59A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59M21 15V5a2 2 0 0 0-2-2H9"/></g></svg>';
		placeholder.createEl('div', { text: 'No preview available', cls: 'import-preview-text' });
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.style.width = '90vw';
		this.modalEl.style.maxWidth = '1200px';
		this.modalEl.style.height = '70vh';
		this.modalEl.style.maxHeight = '70vh';

		const container = contentEl.createDiv({ cls: 'import-plugin resort-pairs-modal' });

		const header = container.createEl('header', { cls: 'resort-pairs-header' })
		header.createEl('h4', 'Resort attachments')

		const scroller = container.createDiv({ cls: 'resort-pairs-scroller'});
		const preview = container.createDiv({ cls: 'resort-pairs-preview'});
		const bottomBar = container.createDiv({ cls: 'resort-pairs-bottom-bar'});
	}

	onClose() {
		this.contentEl.empty();
	}
}