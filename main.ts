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
        YesNoTypes,
        RelativeLocation,
        LinkFormat,
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
    embedFilesOnImport: YesNoTypes.ASK_USER, // Default to linking files
    lastEmbedFilesOnImport: YesNoTypes.NO, // Default to linking
    multipleFilesImportType: MultipleFilesImportTypes.BULLETED, // Default to bulleted list when importing multiple files
    relativeLocation: RelativeLocation.VAULT, // Default to vault
    folderPath: '00 Meta/Attachments', // Default to a folder in the vault
    linkFormat: LinkFormat.ABSOLUTE,
    dateFormat: 'YYYY_MM_DDTHH_mm_ss',
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

		console.log('Loaded plugin Import Attachments+!!!');
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

        const { attachmentsFolderPath, vaultPath, currentNoteFolderPath } = attachmentsFolder;

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

		let embedOption = this.settings.embedFilesOnImport;
		const lastEmbedOption = this.settings.lastEmbedFilesOnImport;

        if (actionFilesOnImport == ImportActionType.ASK_USER || embedOption == YesNoTypes.ASK_USER) {
        	let modal = new ImportActionTypeModal(this.app, this, lastActionFilesOnImport, lastEmbedOption);
        	modal.open();
        	const choice = await modal.promise;
        	if (choice == null) return; // return if the user closes the modal without preferences        		
        	actionFilesOnImport = choice.action;
        	switch (importType) {
        		case ImportOperationType.DRAG_AND_DROP:
        			if (choice.rememberChoice) {
        				this.settings.actionDroppedFilesOnImport = actionFilesOnImport;
        			}
        			this.settings.lastActionDroppedFilesOnImport = actionFilesOnImport;
        			break;
        		case ImportOperationType.PASTE:
        			if (choice.rememberChoice) {
        				this.settings.actionPastedFilesOnImport = actionFilesOnImport;
        			}
        			this.settings.lastActionPastedFilesOnImport = actionFilesOnImport;
        			break;
        	}
        	embedOption = choice.embed;
        	this.settings.lastEmbedFilesOnImport = embedOption;
        	await this.saveSettings();
        }

		const doEmbed = (embedOption == YesNoTypes.YES);

        const importSettings = {
        	embed: doToggleEmbedPreference ? !doEmbed : doEmbed,
        	action: actionFilesOnImport,
        };

        this.moveFileToAttachmentsFolder(files, attachmentsFolderPath, currentNoteFolderPath, vaultPath, editor, view, importSettings);
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
		const currentNoteFolderPath = path.join(vaultPath,activeFile.parent.path);
		const notename = activeFile.basename;
		
		let referencePath = '';
		switch(this.settings.relativeLocation) {
		case RelativeLocation.VAULT:
			referencePath = vaultPath;
			break;
		case RelativeLocation.SAME:
			referencePath = currentNoteFolderPath;
			break;
		}
		
		let relativePath = this.settings.folderPath.replace(/\$\{notename\}/g, notename);

		const attachmentsFolderPath = path.join(referencePath,relativePath);

		return {
			attachmentsFolderPath,
			vaultPath: vaultPath,
			currentNoteFolderPath: currentNoteFolderPath,
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

        const { attachmentsFolderPath, vaultPath, currentNoteFolderPath: referencePath } = attachmentsFolder;

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

    async moveFileToAttachmentsFolder(filesToImport: FileList, attachmentsFolderPath: string, currentNoteFolderPath: string, vaultPath: string, editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface) {
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
		    	this.insertLinkToEditor(currentNoteFolderPath, vaultPath, importedFilePath, editor, view, importSettings, multipleFiles ? index+1 : 0);
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
			let msg="This note does not have an attachment folder.";
            console.error(msg+":", attachmentsFolderPath);
        	new Notice(msg+".");
		}

		// Open the folder in the system's default file explorer
		const { shell } = require('electron');
		// window.require('electron').remote.shell.showItemInFolder(attachmentsFolder.attachmentsFolderPath);
		shell.openPath(attachmentsFolder.attachmentsFolderPath);
	}

	insertLinkToEditor(currentNoteFolderPath: string, vaultPath: string, importedFilePath: string, editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface, counter: number) {
		// Extract just the file name from the path

		const filename=Utils.getFilename(importedFilePath);

		switch(this.settings.linkFormat) {
		case LinkFormat.RELATIVE:
			var relativePath=path.relative(currentNoteFolderPath, importedFilePath);	
			break;
		case LinkFormat.ABSOLUTE:
		default:
			var relativePath=path.relative(vaultPath,importedFilePath);	
			break;
		}	
		
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

		containerEl.createEl('h3', { text: 'Import options' });
		
        new Setting(containerEl)
        	.setName('Whether to move or copy files that are drag-and-dropped?')
            .setDesc('Choose whether files that are dragged and dropped into the editor should be moved or copied. Alternatively, the user is asked each time.')
        	.addDropdown(dropdown => {
                dropdown.addOption(ImportActionType.ASK_USER, 'Ask each time');
                dropdown.addOption(ImportActionType.MOVE, 'Move');
                dropdown.addOption(ImportActionType.COPY, 'Copy');
                dropdown.setValue(this.plugin.settings.actionDroppedFilesOnImport)
                .onChange(async (value: string) => {
                	if (value in ImportActionType) {
                    	this.plugin.settings.actionDroppedFilesOnImport = value as ImportActionType;
                    	if(value != ImportActionType.ASK_USER) {
                    		this.plugin.settings.lastActionDroppedFilesOnImport = value as ImportActionType;
                    	}
                    	await this.plugin.saveSettings();
                    } else {
                    	console.error('Invalid import action type:', value);
                    }
            })});

        new Setting(containerEl)
        	.setName('Whether to move or copy files that are copy-and-pasted?')
            .setDesc('Choose whether files that are copy and pasted into the editor should be moved or copied. Alternatively, the user is asked each time.')
        	.addDropdown(dropdown => {
                dropdown.addOption(ImportActionType.ASK_USER, 'Ask each time');
                dropdown.addOption(ImportActionType.MOVE, 'Move');
                dropdown.addOption(ImportActionType.COPY, 'Copy');
                dropdown.setValue(this.plugin.settings.actionPastedFilesOnImport)
                .onChange(async (value: string) => {
                	if (value in ImportActionType) {
                    	this.plugin.settings.actionPastedFilesOnImport = value as ImportActionType;
                    	if(value != ImportActionType.ASK_USER) {
                    		this.plugin.settings.lastActionPastedFilesOnImport = value as ImportActionType;
                    	}
                    	await this.plugin.saveSettings();
                    } else {
                    	console.error('Invalid import action type:', value);
                    }
            })});

        new Setting(containerEl)
            .setName('Embed imported documents:')
            .setDesc('If this option is activated, the files are imported as an embedded document; if it is deactivated, they are imported as a linked document.  However, by holding the SHIFT key pressed, the plugin\'s behavior will be the opposite of what is here selected.')
            .addDropdown(dropdown => {
                dropdown.addOption(YesNoTypes.ASK_USER, 'Ask each time');
                dropdown.addOption(YesNoTypes.YES, 'Yes');
                dropdown.addOption(YesNoTypes.NO, 'No');
                dropdown.setValue(this.plugin.settings.embedFilesOnImport)
                .onChange(async (value: string) => {
                	if (Object.values(YesNoTypes).includes(value as YesNoTypes)) {
                		this.plugin.settings.embedFilesOnImport = value as YesNoTypes;
                		if(value != YesNoTypes.ASK_USER) {
                    		this.plugin.settings.lastEmbedFilesOnImport = value as YesNoTypes;
                    	}
                    	await this.plugin.saveSettings();
					} else {
                    	console.error('Invalid option selection:', value);
                    }
            })});

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
                    	console.error('Invalid option selection:', value);
                    }
            })});

	    new Setting(containerEl)
            .setName('Insert display text for links based on filename:')
            .setDesc('If this option is activated, the basename of the imported document is used as in place of the custom display text.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.customDisplayText)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.customDisplayText = value;
                    await this.plugin.saveSettings();
            }));

		containerEl.createEl('h3', { text: 'Attachment folder configuration' });

        new Setting(containerEl)
            .setName('Default location for new attachments:')
            .setDesc('The reference folder for importing new attachments.')
            .addDropdown(dropdown => {
                dropdown.addOption(RelativeLocation.VAULT, 'Vault folder');
                dropdown.addOption(RelativeLocation.SAME, 'Same folder as current file');
                dropdown.setValue(this.plugin.settings.relativeLocation)
                .onChange(async (value: string) => {
                	if (Object.values(RelativeLocation).includes(value as RelativeLocation)) {
                		this.plugin.settings.relativeLocation = value as RelativeLocation;
                    	await this.plugin.saveSettings();
					} else {
                    	console.error('Invalid option selection:', value);
                    }
            })});

        new Setting(containerEl)
            .setName('Folder relative to the default location to import new attachments:')
            .setDesc('Where newly created notes are placed. Use ${notename} as a placeholder for the name of the note.')
            .addText(text => {
                text.setPlaceholder('Enter folder path');
                text.setValue(this.plugin.settings.folderPath);
                text.onChange(async (value: string) => {
            		this.plugin.settings.folderPath = value;
                	await this.plugin.saveSettings();
            })});

        new Setting(containerEl)
            .setName('Attachment link format:')
            .setDesc('What types of links to use for the imported attachments.')
            .addDropdown(dropdown => {
                dropdown.addOption(LinkFormat.RELATIVE, 'With respect to the note\'s path (relative path)');
                dropdown.addOption(LinkFormat.ABSOLUTE, 'With respect to the vault\'s path (absolute path)');
                dropdown.setValue(this.plugin.settings.linkFormat)
                .onChange(async (value: string) => {
                	if (Object.values(LinkFormat).includes(value as LinkFormat)) {
                		this.plugin.settings.linkFormat = value as LinkFormat;
                    	await this.plugin.saveSettings();
					} else {
                    	console.error('Invalid option selection:', value);
                    }
            })});

        new Setting(containerEl)
            .setName('Name of the imported attachments:')
            .setDesc('Choose how to name the imported attachments, using the following variables as a placeholder:<br>\'${notename}\' for the note name, \
             		\'${date}\' for the current date, \'${original}\' for the name of the original file, \'${md5}\' for a MD5 hash of the attachment.')
            .addText(text => {
                text.setPlaceholder('Enter attachment name');
                text.setValue(this.plugin.settings.attachmentName);
                text.onChange(async (value: string) => {
            		this.plugin.settings.attachmentName = value;
                	await this.plugin.saveSettings();
            })});

        new Setting(containerEl)
            .setName('Date formattt:')
            .setDesc(createFragment((frag) => {
            		frag.appendText('Choose the date format, based on ');
                    frag.createEl('a', {
                        href: 'https://momentjscom.readthedocs.io/en/latest/moment/04-displaying/01-format',
                        text: 'momentjs',
                    });
                    frag.appendText('syntax.')}))
            .addText(text => {
                text.setPlaceholder('Enter attachment name');
                text.setValue(this.plugin.settings.attachmentName);
                text.onChange(async (value: string) => {
            		this.plugin.settings.attachmentName = value;
                	await this.plugin.saveSettings();
            })});

    }
}