/* eslint-disable @typescript-eslint/no-inferrable-types */
// ImportAttachmentsModal.ts
import { Modal, App } from 'obsidian';
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

import * as path from "path"; // Node.js path module to handle path operations

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

		container.createEl('h2', { text: 'Import files' });
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
		const { contentEl } = this;

		const container = contentEl.createDiv({ cls: 'import-plugin' });

		container.createEl('h2', { text: 'Import files' });
		const paragraph = container.createEl('p');
		paragraph.append('You are trying to copy the file "');
		
		// Create a hyperlink for the filename
		const origFileLink = paragraph.createEl('a', {
			text: this.originalFilePath,
			href: '#',
		});
		origFileLink.addEventListener('click', (e) => {
			e.preventDefault(); // Prevent the default anchor behavior
			// Open the folder in the system's default file explorer
			window.require('electron').remote.shell.showItemInFolder(this.originalFilePath);
		});

		paragraph.append('" into the vault, where a "');

		// Create a hyperlink for the filename
		const vaultFileLink = paragraph.createEl('a', {
			text: 'file',
			href: '#',
		});
		vaultFileLink.addEventListener('click', (e) => {
			e.preventDefault(); // Prevent the default anchor behavior
			// Open the folder in the system's default file explorer
			window.require('electron').remote.shell.showItemInFolder(this.destFilePath);
		});

		paragraph.append('" with the same name is already present.');

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
	
	constructor(private plugin: ImportAttachments, private attachmentFolderPath: string) {
		// use TypeScript `parameter properties` to initialize `plugin`.
		super(plugin.app);
		this.promise = new Promise<boolean>((resolve) => {
			this.resolveChoice = resolve;
		});
	}

	onOpen() {

		const attachmentFolderPath_parsed = Utils.parseFilePath(this.attachmentFolderPath);

		const { contentEl } = this;

		const container = contentEl.createDiv({ cls: 'import-plugin' });

		container.createEl('h2', { text: 'Import files' });
		const paragraph = container.createEl('p');
		paragraph.append('Do you want to move the attachment folder "');
		
		// Create a hyperlink for the filename
		const fileLink = paragraph.createEl('a', {
			text: attachmentFolderPath_parsed.filename,
			href: '#',
		});
		fileLink.addEventListener('click', (e) => {
			e.preventDefault(); // Prevent the default anchor behavior
			// Open the folder in the system's default file explorer
			// window.require('electron').remote.shell.showItemInFolder(this.attachmentFolderPath);
			window.require('electron').remote.shell.openPath(Utils.joinPaths(this.plugin.vaultPath,this.attachmentFolderPath));
		});

		paragraph.append('" to the system trash?');

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

		container.createEl('h2', { text: 'Import files' });
		const paragraph = container.createEl('p');
		paragraph.append('The file you are trying to import "');
		
		// Create a hyperlink for the filename
		const fileLink = paragraph.createEl('a', {
			text: this.relativeFilePath,
			href: '#',
		});
		fileLink.addEventListener('click', (e) => {
			e.preventDefault(); // Prevent the default anchor behavior
			// Open the folder in the system's default file explorer
			window.require('electron').remote.shell.showItemInFolder(Utils.joinPaths(this.plugin.vaultPath,this.relativeFilePath));
		});

		paragraph.append('" is already stored in the vault.');

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
