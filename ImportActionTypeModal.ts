// ImportActionTypeModal.ts
import { Modal, App, Notice, Setting } from 'obsidian';
import {
		ImportActionType,
	} from './types';
import type ImportAttachments from './main'; // Import the type of your plugin class if needed for type hinting

export default class ImportActionTypeModal extends Modal {
    promise: Promise<ImportActionType | null>;
    private resolveChoice: (choice: ImportActionType | null) => void = () => {};  // To resolve the promise. Initialize with a no-op function
	private rememberChoice: boolean = false;  // Private variable to store the checkbox state
    
    constructor(app: App, private plugin: ImportAttachments) {
    	// use TypeScript `parameter properties` to initialize `plugin`.
        super(app);
        this.promise = new Promise<ImportActionType | null>((resolve) => {
            this.resolveChoice = resolve;
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Import Files' });

        new Setting(contentEl)
            .setName('Move files')
            .setDesc('Move files into the vault')
            .addButton(button => button
                .setButtonText('Move')
                .onClick(() => this.handleChoice(ImportActionType.MOVE)));

        new Setting(contentEl)
            .setName('Copy files')
            .setDesc('Copy files into the vault')
            .addButton(button => button
                .setButtonText('Copy')
                .onClick(() => this.handleChoice(ImportActionType.COPY)));

        new Setting(contentEl)
            .setName('Remember this choice')
            .addToggle(toggle => toggle
                .setValue(false)
                .onChange(async value => {
	                this.rememberChoice = value;  // Update the private variable when the toggle changes
                }));
    }

    async handleChoice(choice: ImportActionType) {
    	this.resolveChoice(choice);  // Resolve the promise with the selected choice        
    	this.close(); 
    }

    onClose() {
        this.contentEl.empty();
        this.resolveChoice(null);  // Resolve with null if the modal is closed without a choice
    }
}
