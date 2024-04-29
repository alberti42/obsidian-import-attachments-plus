// ImportActionTypeModal.ts
import { Modal, App, Notice, Setting } from 'obsidian';
import type ImportAttachments from './main'; // Import the type of your plugin class if needed for type hinting

export default class ImportActionTypeModal extends Modal {
    constructor(app: App, private plugin: ImportAttachments) {
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
                .onClick(() => this.handleChoice('move')));

        new Setting(contentEl)
            .setName('Copy files')
            .setDesc('Copy files into the vault')
            .addButton(button => button
                .setButtonText('Copy')
                .onClick(() => this.handleChoice('copy')));

        new Setting(contentEl)
            .setName('Remember this choice')
            .addToggle(toggle => toggle
                .setValue(false)
                .onChange(value => {
                	console.log(value);
                    // this.plugin.settings.rememberChoice = value;
                }));
    }

    async handleChoice(choice: 'move' | 'copy') {
    	console.log(choice);
        // if (this.plugin.settings.rememberChoice) {
        //     this.plugin.settings.actionDroppedFilesOnImport = choice;
        //     await this.plugin.saveSettings();
        // }
        this.close();
        new Notice(`Files will be ${choice === 'move' ? 'moved' : 'copied'}`);
    }

    onClose() {
        this.contentEl.empty();
    }
}
