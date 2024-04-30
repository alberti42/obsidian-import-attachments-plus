// ImportActionTypeModal.ts
import { Modal, App, Notice, Setting } from 'obsidian';
import {
		ImportActionType,
		ImportActionChoiceResult,
	} from './types';
import type ImportAttachments from './main'; // Import the type of your plugin class if needed for type hinting

export default class ImportActionTypeModal extends Modal {
    promise: Promise<ImportActionChoiceResult | null>;
    private resolveChoice: (result: ImportActionChoiceResult) => void = () => {};  // To resolve the promise. Initialize with a no-op function
	private selectedAction: ImportActionType = ImportActionType.COPY;
	private rememberChoice: boolean = false;  // Private variable to store the checkbox state
    private copyButton: HTMLButtonElement | null = null;
    private moveButton: HTMLButtonElement | null = null;

    constructor(app: App, private plugin: ImportAttachments) {
    	// use TypeScript `parameter properties` to initialize `plugin`.
        super(app);
        this.promise = new Promise<ImportActionChoiceResult>((resolve) => {
            this.resolveChoice = resolve;
        });
    }

     createToggle(contentEl, questionText, optionA, optionB, initialState, callback) {
     	// Main container that holds both the question and the toggle group
	    const container = contentEl.createDiv({ cls: 'action-container' });

	    // Add the question aligned to the left
	    container.createEl('span', { text: questionText, cls: 'action-question' });

	    // Container for the toggle group aligned to the right
	    const toggleGroup = container.createDiv({ cls: 'toggle-group' });
		
	    // Label for option A (e.g., "Move")
	    toggleGroup.createEl('span', { text: optionA, cls: 'toggle-label' });
	    
	    // Create the toggle switch
	    const switchLabel = toggleGroup.createEl('label', { cls: 'switch' });
	    const input = switchLabel.createEl('input', {
	        type: 'checkbox',
	        checked: initialState
	    });
	    const slider = switchLabel.createEl('span', { cls: 'slider' });

	    // Label for option B (e.g., "Copy")
	    toggleGroup.createEl('span', { text: optionB, cls: 'toggle-label' });

	    // Event listener for toggle
	    input.addEventListener('change', () => {
	        if (callback) {
	            callback(input.checked ? optionB : optionA);
	        }
	    });
	}

    onOpen() {
       const { contentEl } = this;
        // Main container that holds both the question and the toggle group
	    const container = contentEl.createDiv({ cls: 'action-container' });

	    // Creating action toggle
	    this.createToggle(contentEl, 'Do you want to move or copy files?', 'Move', 'Copy', false, (selectedOption) => {
	        console.log(`${selectedOption} selected`);
	    });

	    // Creating remember toggle
	    this.createToggle(contentEl, 'Remember this answer for the future?', 'Yes', 'No', false, (selectedOption) => {
	        console.log(`${selectedOption} selected`);
	    });




		/*
		let { contentEl } = this;

	    contentEl.createEl('h2', { text: 'Import Files' });
	    contentEl.createEl('p', { text: 'Do you want to move or copy the files into the vault?' });

		// Create a container for buttons to control layout
	    const actionToggleContainer = contentEl.createEl('div', { cls: 'button-container' });

	    // Create the 'Move' button inside the container
	    this.moveButton = actionToggleContainer.createEl('button', {
	        text: 'Move',
	    });
	    this.moveButton.addEventListener('click', () => {
	        this.handleActionType(ImportActionType.MOVE);
	    });

	    // Create the 'Copy' button inside the container
	    this.copyButton = actionToggleContainer.createEl('button', {
	        text: 'Copy',
	    });
	    this.copyButton.addEventListener('click', () => {
	    	this.handleActionType(ImportActionType.COPY);
	    });

	    // Create a container for buttons to control layout
	    const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });

	    // Create the 'Import' button inside the container
	    const importButton = buttonContainer.createEl('button', {
	        text: 'Import',
	        cls: 'mod-cta'
	    });

	    importButton.addEventListener('click', () => {
	    	this.import();
	    });
	    */

		// setTimeout(() => {
		// 	// Set focus with a slight delay:
		// 	// this method leverages JavaScript's event loop, ensuring that focusing the button
	    // 	// is enqueued after all the elements are properly rendered and the DOM is fully updated.
    	// 	this.moveButton.focus();
		// }, 0); // A timeout of 0 ms is often enough

    	/*
	    new Setting(contentEl)
        .setName('Remember this choice')
        .addToggle(toggle => toggle
            .setValue(false)
            .onChange(async value => {
                this.rememberChoice = value;  // Update the private variable when the toggle changes
            }));
        */
    }

    async import() {
        this.resolveChoice({
            action: this.selectedAction,
            rememberChoice: this.rememberChoice
        });
    	this.close(); 
    }

    async handleActionType(choice: ImportActionType) {
    	// When a choice is made, resolve the promise with both the choice and remember status
    	this.selectedAction = choice;
    	console.log(choice);
    	// Ensure buttons are not null (they should not be but just safe guarding)
	    if (this.copyButton && this.moveButton) {
	        switch (choice) {
	            case ImportActionType.MOVE:
	                this.moveButton.classList.add('active');
	                this.copyButton.classList.remove('active');
	                break;
	            case ImportActionType.COPY:
	                this.copyButton.classList.add('active');
	                this.moveButton.classList.remove('active');
	                break;
	        }
	    }
    }

    onClose() {
        this.contentEl.empty();
        this.resolveChoice(null);  // Resolve with null if the modal is closed without a choice
    }
}
