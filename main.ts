import {
	App,
	MarkdownView,
	MarkdownFileInfo,
	Editor,
	Notice,
	FileSystemAdapter,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

import {ImportActionTypeModal, OverwriteChoiceModal, ImportFromVaultChoiceModal} from './ImportAttachmentsModal';
import {
		ImportActionType,
		MultipleFilesImportTypes,
		ImportOperationType,
		ImportAttachmentsSettings,
		AttachmentFolderPath,
		ImportSettingsInterface,
		OverwriteChoiceResult,
		OverwriteChoiceOptions,
		ImportFromVaultOptions,
	} from './types';
import { Utils } from "utils";
import { relative } from "path";

const fs = require("fs").promises; // Ensure you're using the promise-based version of fs
const path = require("path"); // Node.js path module to handle path operations

const DEFAULT_SETTINGS: ImportAttachmentsSettings = {
    actionDroppedFilesOnImport: ImportActionType.ASK_USER, // Default to asking the user
    actionPastedFilesOnImport: ImportActionType.ASK_USER, // Default to asking the user
    lastActionPastedFilesOnImport: ImportActionType.COPY, // Default to copying files
    lastActionDroppedFilesOnImport: ImportActionType.COPY, // Default to copying files
    embedFilesOnImport: false, // Default to linking files
    multipleFilesImportType: MultipleFilesImportTypes.BULLETED, // Default to bulleted list when importing multiple files
    customDisplayText: true,
};

export default class ImportAttachments extends Plugin {
	settings: ImportAttachmentsSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
        // Add settings tab
        this.addSettingTab(new ImportAttachmentsSettingTab(this.app, this));

		// Command for importing as a standard link
		this.addCommand({
			id: "move-file-to-vault-link",
			name: "Move File to Vault as Link",
			callback: () => this.chooseFileToImport({
				embed: false,
				action: ImportActionType.MOVE,
			}),
		});

		// Command for importing as an embedded image/link
		this.addCommand({
			id: "move-file-to-vault-embed",
			name: "Move File to Vault as Embedded",
			callback: () => this.chooseFileToImport({
				embed: true,
				action: ImportActionType.MOVE,
			}),
		});

		// Command for importing as a standard link
		this.addCommand({
			id: "copy-file-to-vault-link",
			name: "Copy File to Vault as Link",
			callback: () => this.chooseFileToImport({
				embed: false,
				action: ImportActionType.COPY,
			}),
		});

		// Command for importing as an embedded image/link
		this.addCommand({
			id: "copy-file-to-vault-embed",
			name: "Copy File to Vault as Embedded",
			callback: () => this.chooseFileToImport({
				embed: true,
				action: ImportActionType.COPY,
			}),
		});

		// Register the command to open the attachments folder
		this.addCommand({
			id: "open-attachments-folder",
			name: "Open Attachments Folder",
			callback: () => this.openAttachmentsFolder(),
		});

		/*
		// The code below handles `drop` events manually
		//
		// Set up the event listener
        const dropHandler = (event: DragEvent) => {
            event.preventDefault();
            event.stopPropagation();

            const files = event?.dataTransfer?.files;
            if (files && files.length > 0) {
                // this.handleFiles(files);
            } else {
                new Notice('No files dropped');
            }
        };
        // Add the event listener to the document body
        document.body.addEventListener('drop', dropHandler);
        // Ensure the event listener is removed when the plugin is unloaded
        this.register(() => document.body.removeEventListener('drop', dropHandler));
        */

		this.registerEvent(
			// check obsidian.d.ts for other types of events
			this.app.workspace.on('editor-drop', async (evt: DragEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				// Check if the event has already been handled
				if (evt.defaultPrevented) return;

				if (!(view instanceof MarkdownView)) {
					console.error('No view provided')	
					return;
				}
				
                const altKeyPressed = evt.altKey; // Check if Shift was pressed
                if(altKeyPressed) { 
                	// Follow standard behavior where a link to the external file is created
                	return;
                } else {
					// Prevent other handlers from executing
					evt.preventDefault();
                }

                const doToggleEmbedPreference = evt.shiftKey; // Check if Shift was pressed
                
				// Handle the dropped files
				const files = evt?.dataTransfer?.files;
				if (files && files.length > 0) {
					await this.handleFiles(files, editor, view, doToggleEmbedPreference, ImportOperationType.DRAG_AND_DROP);
				} else {
					// new Notice('No files dropped');
					console.error('No files dropped');
				}
			})
		);

		this.registerEvent(
			// check obsidian.d.ts for other types of events
			this.app.workspace.on('editor-paste', async (evt: ClipboardEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				// Check if the event has already been handled
				if (evt.defaultPrevented) return;

				if (!(view instanceof MarkdownView)) {
					console.error('No view provided')	
					return;
				}

                const clipboardData = evt.clipboardData;
		        if (clipboardData) {
		            const files = clipboardData.files;
		            // const items = clipboardData.items;

		            if (files && files.length > 0) {
		            	evt.preventDefault();

		            	// Handle files
		                const doToggleEmbedPreference = false; // Pretend shift was not pressed
		                await this.handleFiles(files, editor, view, doToggleEmbedPreference, ImportOperationType.PASTE);

		            } else {
		            	// console.error("No files detected in paste data.");
		            }
		        }
			})
		);

		console.log('Loaded plugin Import Attachments+');
	}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async handleFiles(files: FileList, editor: Editor, view: MarkdownView, doToggleEmbedPreference: boolean, importType: ImportOperationType) {
        let attachmentsFolder;
        try {
            attachmentsFolder = this.getAttachmentFolder();
        } catch (error: unknown) {
        	if (error instanceof Error) {
            	console.error(error.message);
            	new Notice(error.message);
            } else {
            	// If it's not an Error, log it as a string or use a default message
            	let msg="An unknown error occurred";
            	console.error(msg+":", error);
            	new Notice(msg);
        	}
            return;
        }

        const { attachmentsFolderPath, vaultPath, referencePath } = attachmentsFolder;

        let doMove=false;  // default value, if something goes wrong with parsing the configuration
        let actionFilesOnImport=ImportActionType.COPY; // for safety, the defualt is COPY
        let lastActionFilesOnImport=ImportActionType.COPY; // for safety, the defualt is COPY
        switch(importType)
        {
        case ImportOperationType.DRAG_AND_DROP:
        	actionFilesOnImport=this.settings.actionDroppedFilesOnImport;
        	lastActionFilesOnImport=this.settings.lastActionDroppedFilesOnImport;
        	break;
        case ImportOperationType.PASTE:
        	actionFilesOnImport=this.settings.actionPastedFilesOnImport;
        	lastActionFilesOnImport=this.settings.lastActionPastedFilesOnImport;
        	break;
        }

        if (actionFilesOnImport == ImportActionType.ASK_USER) {
        	let modal = new ImportActionTypeModal(this.app, this, lastActionFilesOnImport);
        	modal.open();
        	const choice = await modal.promise;
        	if (choice == null) return; // return if the user closes the modal without preferences        		
        	actionFilesOnImport = choice.action;
        	switch (importType) {
        		case ImportOperationType.DRAG_AND_DROP:
        			if (choice.rememberChoice) {
        				this.settings.actionPastedFilesOnImport = actionFilesOnImport;
        			}
        			this.settings.lastActionPastedFilesOnImport = actionFilesOnImport;
        			break;
        		case ImportOperationType.PASTE:
        			if (choice.rememberChoice) {
        				this.settings.actionDroppedFilesOnImport = actionFilesOnImport;
        			}
        			this.settings.lastActionDroppedFilesOnImport = actionFilesOnImport;
        			break;
        	}
        	await this.saveSettings();
        }
        
        const doEmbed = this.settings.embedFilesOnImport;

        const importSettings = {
        	embed: doToggleEmbedPreference ? !doEmbed : doEmbed,
        	action: actionFilesOnImport,
        };

        this.moveFileToAttachmentsFolder(files, attachmentsFolderPath, referencePath, vaultPath, editor, view, importSettings);
    }

	getAttachmentFolder(): AttachmentFolderPath {
		const activeFile = this.app.workspace.getActiveFile();
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error("The vault folder could not be determined.");
		}
		if (!activeFile || activeFile.extension !== "md" || !activeFile.parent) {
			throw new Error("No Markdown file is currently open in a directory. Please open a Markdown file to use this feature.");
		}

		const vaultPath = adapter.getBasePath();
		const referencePath = activeFile.parent.path;
		
		const attachmentsFolderPath = path.join(vaultPath,path.join(referencePath, activeFile.basename + ' (attachments)'));

		return {
			attachmentsFolderPath,
			vaultPath: vaultPath,
			referencePath: activeFile.parent.path,
		};
	}

	async chooseFileToImport(importSettings: ImportSettingsInterface) {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = markdownView?.editor;

		if(!editor)
		{
			let msg = "No active markdown editor found.";
			console.error(msg);
			new Notice(msg);
			return;
		}

        let attachmentsFolder;
        try {
            attachmentsFolder = this.getAttachmentFolder();
        } catch (error: unknown) {
        	if (error instanceof Error) {
            	console.error(error.message);
            	new Notice(error.message);
            } else {
         	   // If it's not an Error, log it as a string or use a default message
            	console.error("An unknown error occurred:", error);
            	new Notice("An unknown error occurred");
        	}
            return;
        }

        const { attachmentsFolderPath, vaultPath, referencePath } = attachmentsFolder;

        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;  // Allow selection of multiple files
        
		input.onchange = async (e: Event) => {
		    const target = e.target as HTMLInputElement;
		    const files = target.files; // This is already a FileList

		    if (files && files.length > 0) {
		        // Directly pass the FileList to the processing function
		        await this.moveFileToAttachmentsFolder(files, attachmentsFolderPath, referencePath, vaultPath, editor, markdownView, importSettings);
		    } else {
		        let msg = "No files selected or file access error.";
		        console.error(msg);
		        new Notice(msg);
		    }
		};
		input.click(); // Trigger the file input dialog
    }

    async moveFileToAttachmentsFolder(filesToImport: FileList, attachmentsFolderPath: string, referencePath: string, vaultPath: string, editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface) {
        // Ensure the directory exists before moving the file
        await Utils.ensureDirectoryExists(attachmentsFolderPath);

		let cursor = editor.getCursor(); // Get the current cursor position before insertion

		if (filesToImport.length>1 && this.settings.multipleFilesImportType != MultipleFilesImportTypes.INLINE) {
        	// Check if the cursor is at the beginning of a line
        	if (cursor.ch !== 0) {
        		// If not, insert a newline before the link
        		editor.replaceRange('\n', cursor);
        		// You need to explicitly set the cursor to the new position after the newline
        		editor.setCursor({ line: cursor.line + 1, ch: 0 });
        	}
        }

        const multipleFiles = filesToImport.length>1;

		const tasks = Array.from(filesToImport).map(async (fileToImport):Promise<string|null> => {
			const originalFilePath = fileToImport.path;
			let destFilePath = path.join(attachmentsFolderPath,fileToImport.name);

			// Check if file already exists in the vault
			const existingFile = await Utils.checkFileExists(destFilePath);

			// If they are the same file, then skip copying/moving, we are alrady done
			if(existingFile && await Utils.arePathsSameFile(originalFilePath,destFilePath)) {
				return destFilePath;
			}

			// If the original file is already in the vault
			const inVault = await Utils.isFileInVault(vaultPath,originalFilePath)
			if(inVault)
			{
				let modal = new ImportFromVaultChoiceModal(this.app, this, inVault, importSettings.action);
	        	modal.open();
	        	const choice = await modal.promise;
	        	if(choice==null) { return null; }
	        	switch(choice) {
	        	case ImportFromVaultOptions.SKIP:
	        		return null;
	        		break;
	        	case ImportFromVaultOptions.LINK:
	        		importSettings.action = ImportActionType.LINK;
	        		break;
	        	case ImportFromVaultOptions.COPY:
	        		importSettings.action = ImportActionType.COPY;
	        		break;
	        	}
			}
			
			// Decide what to do if a file with the same name already exists at the destination
			if (existingFile && importSettings.action != ImportActionType.LINK) {
				let modal = new OverwriteChoiceModal(this.app, this, originalFilePath, destFilePath);
	        	modal.open();
	        	const choice = await modal.promise;
	        	if(choice==null) { return null; }
	        	switch(choice) {
	        	case OverwriteChoiceOptions.OVERWRITE:
	        		// continue
	        		break;
				case OverwriteChoiceOptions.KEEPBOTH:
	        		const newDestFilePath = await Utils.findNewFilename(destFilePath);
	        		if(newDestFilePath==null) { return null; }
	        		destFilePath = newDestFilePath;
	        		break;
				case OverwriteChoiceOptions.SKIP:
	        		return null;
	        		break;
	        	}
			}
			
			try {
				switch (importSettings.action) {
					case ImportActionType.MOVE:
						await fs.rename(originalFilePath,destFilePath);
						return destFilePath;
					case ImportActionType.COPY:
						await fs.copyFile(originalFilePath,destFilePath);
						return destFilePath;
					case ImportActionType.LINK:
					default:
						return originalFilePath;
				}
			} catch (error) {
				let msg = "Failed to process the file";
				new Notice(msg + ".");
				console.error( msg + ":", originalFilePath, error);
				return null; // Indicate failure in processing this file
			}
		});

		// Wait for all tasks to complete
		const results = await Promise.all(tasks);

		// Now process the results
		let counter = 0;
		results.forEach((importedFilePath: (string|null), index: number) => {
		    if (importedFilePath) {
		    	this.insertLinkToEditor(path.join(vaultPath,referencePath), importedFilePath, editor, view, importSettings, multipleFiles ? index+1 : 0);
		    }
		});

		if(counter>0) {
			let operation = '';
	        switch(importSettings.action)
	    	{
	    	case ImportActionType.MOVE:
				operation = 'Moved';
				break;
	    	case ImportActionType.COPY:
	    		operation = 'Copied';
				break;
			}
			new Notice(`${operation} successfully ${counter} files to the attachments folder.`);
		}
    }

	async openAttachmentsFolder() {
		let attachmentsFolder;
		try {
			attachmentsFolder = this.getAttachmentFolder();
        } catch (error: unknown) {
        	if (error instanceof Error) {
            	console.error(error.message);
            	new Notice(error.message);
            } else {
            	// If it's not an Error, log it as a string or use a default message
            	let msg="An unknown error occurred";
            	console.error(msg+":", error);
            	new Notice(msg);
        	}
            return;
        }

		const { attachmentsFolderPath, vaultPath } = attachmentsFolder;
		
		if(! await Utils.checkDirectoryExists(attachmentsFolderPath))
		{
			let msg="This note does not have an attachment folder";
            console.error(msg+":", attachmentsFolderPath);
        	new Notice(msg+".");
		}

		// Open the folder in the system's default file explorer
		const { shell } = require('electron');
		window.require('electron').remote.shell.showItemInFolder(attachmentsFolder.attachmentsFolderPath);
		// shell.openPath(path.join(vaultPath,attachmentsFolder.attachmentsFolderPath));
	}

	insertLinkToEditor(referencePath: string, importedFilePath: string, editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface, counter: number) {
		// Extract just the file name from the path

		const filename=Utils.getFilename(importedFilePath);
		const relativePath=path.relative(referencePath, importedFilePath);

		let prefix = '';
		let postfix = '';
		let customDisplay = '';
		if(counter>0) {
			switch (this.settings.multipleFilesImportType) {
				case MultipleFilesImportTypes.BULLETED:
					prefix = '- ';
					postfix = '\n';
					break;
				case MultipleFilesImportTypes.NUMBERED:
					prefix = `${counter}. `;
					postfix = '\n';
					break;
				case MultipleFilesImportTypes.INLINE:
					if(counter>1){
						// if it is not the first item
						prefix = '\n\n';
					}
					break;
			}
		}
		if(this.settings.customDisplayText) {
			customDisplay = '|' + filename;
		}
		if(importSettings.embed) {
			prefix = prefix + '!';
		}

		const linkText = prefix + '[[' + relativePath + customDisplay + ']]' + postfix;

		const cursor = editor.getCursor(); // Get the current cursor position before insertion

        // Insert the link text at the current cursor position
		editor.replaceRange(linkText, cursor);

		if(counter==0) {
			if(this.settings.customDisplayText) {
				// Define the start and end positions for selecting 'baseName' within the inserted link
				const startCursorPos = {
					line: cursor.line,
					ch: cursor.ch + relativePath.length + prefix.length + 3,
				};
				const endCursorPos = {
					line: cursor.line,
					ch: startCursorPos.ch + filename.length,
				};

				// Set the selection range to highlight 'baseName'
				editor.setSelection(startCursorPos, endCursorPos);
			} else {
				const newCursorPos = {
		        line: cursor.line,
		            ch: cursor.ch + linkText.length
		        };

		        // Move cursor to the position right after the link
		        editor.setCursor(newCursorPos);
			}
		} else
		{
	        const newCursorPos = {
	        line: cursor.line,
	            ch: cursor.ch + linkText.length
	        };

	        // Move cursor to the position right after the link
	        editor.setCursor(newCursorPos);
	    }
	}
}

class ImportAttachmentsSettingTab extends PluginSettingTab {
    plugin: ImportAttachments;

    constructor(app: App, plugin: ImportAttachments) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Settings for Import Attachments+ Plugin' });

        new Setting(containerEl)
        	.setName('Whether to Move or Copy Files that are Drag and Dropped?')
            .setDesc('Choose whether files that are dragged and dropped into the editor should be moved or copied. Alternatively, the user is asked each time.')
        	.addDropdown(dropdown => {
                dropdown.addOption(ImportActionType.MOVE, 'Move');
                dropdown.addOption(ImportActionType.COPY, 'Copy');
                dropdown.addOption(ImportActionType.ASK_USER, 'Ask the user');
                dropdown.setValue(this.plugin.settings.actionDroppedFilesOnImport)
                .onChange(async (value: string) => {
                	if (value in ImportActionType) {
                    	this.plugin.settings.actionDroppedFilesOnImport = value as ImportActionType;
                    	if(value != ImportActionType.ASK_USER)
                    	{
                    		this.plugin.settings.lastActionDroppedFilesOnImport = value as ImportActionType;
                    	}
                    	await this.plugin.saveSettings();
                    } else {
                    	console.error('Invalid import action type:', value);
                    }
            })});

        new Setting(containerEl)
        	.setName('Whether to Move or Copy Files that are Copy and Pasted?')
            .setDesc('Choose whether files that are copy and pasted into the editor should be moved or copied. Alternatively, the user is asked each time.')
        	.addDropdown(dropdown => {
                dropdown.addOption(ImportActionType.MOVE, 'Move');
                dropdown.addOption(ImportActionType.COPY, 'Copy');
                dropdown.addOption(ImportActionType.ASK_USER, 'Ask the user');
                dropdown.setValue(this.plugin.settings.actionPastedFilesOnImport)
                .onChange(async (value: string) => {
                	if (value in ImportActionType) {
                    	this.plugin.settings.actionPastedFilesOnImport = value as ImportActionType;
                    	await this.plugin.saveSettings();
                    } else {
                    	console.error('Invalid import action type:', value);
                    }
            })});

        new Setting(containerEl)
            .setName('Embed Imported Documents')
            .setDesc('If this option is activated, the files are imported as an embedded document; if it is deactivated, they are imported as a linked document.  However, by holding the SHIFT key pressed, the plugin\'s behavior will be the opposite of what is here selected.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.embedFilesOnImport)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.embedFilesOnImport = value;
                    await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName('Import multiple files as:')
            .setDesc('Choose how to import multiple files: as a bulleted list, as a numbered list, or inline without using lists.')
            .addDropdown(dropdown => {
                dropdown.addOption(MultipleFilesImportTypes.BULLETED, 'Bulleted list');
                dropdown.addOption(MultipleFilesImportTypes.NUMBERED, 'Numbered list');
                dropdown.addOption(MultipleFilesImportTypes.INLINE, 'Inline');
                dropdown.setValue(this.plugin.settings.multipleFilesImportType)
                .onChange(async (value: string) => {
                	if (Object.values(MultipleFilesImportTypes).includes(value as MultipleFilesImportTypes)) {
                		this.plugin.settings.multipleFilesImportType = value as MultipleFilesImportTypes;
                    	await this.plugin.saveSettings();
					} else {
                    	console.error('Invalid import action type:', value);
                    }
            })});

	    new Setting(containerEl)
            .setName('Set Custom Display Text for Links')
            .setDesc('If this option is activated, the basename of the imported document is used as in place of the custom display text.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.customDisplayText)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.customDisplayText = value;
                    await this.plugin.saveSettings();
            }));
    }
}