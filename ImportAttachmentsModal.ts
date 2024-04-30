// ImportAttachmentsModal.ts
import { Modal, App, Notice, Setting } from 'obsidian';
import {
		ImportActionType,
		ImportActionChoiceResult,
		OverwriteChoiceResult,
		OverwriteChoiceOptions
	} from './types';
import type ImportAttachments from './main'; // Import the type of your plugin class if needed for type hinting

enum CheckboxOptions {
	A,
	B
}

export class ImportActionTypeModal extends Modal {
    promise: Promise<ImportActionChoiceResult>;
    private resolveChoice: (result: ImportActionChoiceResult) => void = () => {};  // To resolve the promise. Initialize with a no-op function
	private selectedAction: ImportActionType = ImportActionType.COPY;
	private rememberChoice: boolean = false;  // Private variable to store the checkbox state
    
    constructor(app: App, private plugin: ImportAttachments,private lastActionFilesOnImport: ImportActionType) {
    	// use TypeScript `parameter properties` to initialize `plugin`.
        super(app);
        this.promise = new Promise<ImportActionChoiceResult>((resolve) => {
            this.resolveChoice = resolve;
        });
    }

    createToggle(table: HTMLTableElement, questionText: string, optionA: string, optionB: string, initialOption: CheckboxOptions, callback: (selectedOption:CheckboxOptions) => void, withSeparator: boolean = false) {
	    // Main container that holds both the question and the toggle group
	    const tr = table.createEl('tr');
	    if(withSeparator) {
	    	tr.addClass('sep');
	    }

	    // Add the question aligned to the left
	    tr.createEl('td', { text: questionText, cls: 'action-question' });

	    // Label for option A (e.g., "Move")
	    tr.createEl('td', { text: optionA, cls: 'toggle-option-A' });

	    // Create the toggle switch
	    const td = tr.createEl('td');
	    const switchLabel = td.createEl('label', { cls: 'switch' });
	    const input = switchLabel.createEl('input', { type: 'checkbox' });
	    if(initialOption==CheckboxOptions.A) {
	    	input.checked = false;
	    } else {
	    	input.checked = true;
	    }
	    const slider = switchLabel.createEl('span', { cls: 'slider' });

	    // Label for option B (e.g., "Copy")
	    tr.createEl('td', { text: optionB, cls: 'toggle-option-B' });

	    // Event listener for toggle
	    input.addEventListener('change', () => {
	        if (callback) {
	            callback(input.checked ? CheckboxOptions.B : CheckboxOptions.A);
	        }
	    });
	}

    onOpen() {
    	const { contentEl } = this;

    	const container = contentEl.createDiv({ cls: 'import-attach-plugin' });

       	container.createEl('h2', { text: 'Import Files' });
    	container.createEl('p', { text: 'Configure the import options and then press either enter or the import button.' });

	    const table = container.createEl('table');

		let initialOption;

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
	    this.createToggle(table, 'Do you want to move or copy files?', 'Move', 'Copy', initialOption, (selectedOption:CheckboxOptions) => {
	    	if(selectedOption==CheckboxOptions.A){
		    	this.selectedAction = ImportActionType.MOVE;
		    } else {
		    	this.selectedAction = ImportActionType.COPY;
		    }
	        console.log(`${this.selectedAction} selected`);
	    }, true);

	    // Creating remember toggle
	    this.createToggle(table, 'Save this answer in the settings for the future?', 'Yes', 'No', CheckboxOptions.B, (selectedOption:CheckboxOptions) => {
	    	if(selectedOption==CheckboxOptions.A){
		    	this.rememberChoice = true;
		    } else {
		    	this.rememberChoice = false;
		    }
	        console.log(`${this.rememberChoice} selected`);
	    }, true);

	     // Create the 'Move' button inside the container
	    const importButtonContainer = container.createDiv({cls:'importButton'});
	    const importButton = importButtonContainer.createEl('button', {
	        text: 'Import',
	        cls: 'mod-cta'
	    });
	    importButton.addEventListener('click', () => {
	        this.import();
	    });

	    container.addEventListener('keyup', (event) => {
	        if (event.key === 'Enter') {
	            importButton.click();
	        }
    	});
    }

    async import() {
        this.resolveChoice({
            action: this.selectedAction,
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
    promise: Promise<OverwriteChoiceOptions>;
    private resolveChoice: (result: OverwriteChoiceOptions) => void = () => {};  // To resolve the promise. Initialize with a no-op function
	
    constructor(app: App, private plugin: ImportAttachments) {
    	// use TypeScript `parameter properties` to initialize `plugin`.
        super(app);
        this.promise = new Promise<OverwriteChoiceOptions>((resolve) => {
            this.resolveChoice = resolve;
        });
    }

    onOpen() {
    	const { contentEl } = this;

    	const container = contentEl.createDiv({ cls: 'import-attach-plugin' });

       	container.createEl('h2', { text: 'Import Files' });
    	container.createEl('p', { text: 'Configure the import options and then press either enter or the import button.' });



	     // Create the 'Move' button inside the container
	    const importButtonContainer = container.createDiv({cls:'importButton'});
	    const importButton = importButtonContainer.createEl('button', {
	        text: 'Import',
	        cls: 'mod-cta'
	    });
	    importButton.addEventListener('click', () => {
	        
	    });

	    container.addEventListener('keyup', (event) => {
	        if (event.key === 'Enter') {
	            importButton.click();
	        }
    	});
    }
}