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
	private rememberChoice: boolean = false;  // Private variable to store the checkbox state
    
    constructor(app: App, private plugin: ImportAttachments) {
    	// use TypeScript `parameter properties` to initialize `plugin`.
        super(app);
        this.promise = new Promise<ImportActionChoiceResult>((resolve) => {
            this.resolveChoice = resolve;
        });
    }

    onOpen() {
		 let { contentEl } = this;

	    contentEl.createEl('h2', { text: 'Import Files' });
	    contentEl.createEl('p', { text: 'Do you want to move or copy the files into the vault?' });

	    // Create a container for buttons to control layout
	    const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });

	    // Create the 'Move' button inside the container
	    const moveButton = buttonContainer.createEl('button', {
	        text: 'Move',
	        cls: 'mod-cta'
	    });
	    moveButton.addEventListener('click', () => {
	        this.handleChoice(ImportActionType.MOVE);
	    });

	    // Create the 'Copy' button inside the container
	    const copyButton = buttonContainer.createEl('button', {
	        text: 'Copy',
	        cls: 'mod-cta'
	    });
	    copyButton.addEventListener('click', () => {
	    	this.handleChoice(ImportActionType.COPY);
	    });

		setTimeout(() => {
			// Set focus with a slight delay:
			// this method leverages JavaScript's event loop, ensuring that focusing the button
	    	// is enqueued after all the elements are properly rendered and the DOM is fully updated.
    		moveButton.focus();
		}, 0); // A timeout of 0 ms is often enough

	    new Setting(contentEl)
        .setName('Remember this choice')
        .addToggle(toggle => toggle
            .setValue(false)
            .onChange(async value => {
                this.rememberChoice = value;  // Update the private variable when the toggle changes
            }));
    }

    async handleChoice(choice: ImportActionType) {
    	// When a choice is made, resolve the promise with both the choice and remember status
        this.resolveChoice({
            action: choice,
            rememberChoice: this.rememberChoice
        });
    	this.close(); 
    }

    onClose() {
        this.contentEl.empty();
        this.resolveChoice(null);  // Resolve with null if the modal is closed without a choice
    }
}
