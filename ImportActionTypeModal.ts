// ImportActionTypeModal.ts
import { Modal, App, Notice, Setting } from 'obsidian';
import {
		ImportActionType,
	} from './types'; // Adjust the path as necessary
import type ImportAttachments from './main'; // Import the type of your plugin class if needed for type hinting

export default class ImportActionTypeModal extends Modal {
    private rememberChoice: boolean = false;  // Private variable to store the checkbox state

    constructor(app: App, private plugin: ImportAttachments) {
    	// use TypeScript `parameter properties` to initialize `plugin`.
        super(app);
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
    	this.close();

        this.plugin.settings.actionPastedFilesOnImport = choice;
        await this.plugin.saveSettings();

        

        new Notice(`Files will be ${choice === 'MOVE' ? 'MOVE' : 'COPIED'}`);


    }

    onClose() {
        this.contentEl.empty();
    }
}
