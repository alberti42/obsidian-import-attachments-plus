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

const fs = require("fs").promises; // Ensure you're using the promise-based version of fs
const path = require("path"); // Node.js path module to handle path operations

enum ImportOperationType {
    PASTE,
    DRAG_AND_DROP
}

enum ImportActionType {
	MOVE='MOVE',
	COPY='COPY',
	ASK_USER='ASK_USER'
}

enum MultipleFilesImportTypes {
	BULLETED='BULLETED',
	NUMBERED='NUMBERED',
	INLINE='INLINE'
}

interface ImportAttachmentsSettings {
    actionDroppedFilesOnImport: ImportActionType;
    actionPastedFilesOnImport: ImportActionType;
    embedFilesOnImport: boolean;
    multipleFilesImportType: MultipleFilesImportTypes;
    customDisplayText: boolean;
}

// Define an interface for the return type
interface AttachmentFolderPath {
    attachmentsFolderPath: string;
    vaultPath: string;
    activeFile: TFile;
}

interface ImportSettingsInterface {
    embed: boolean;
    move: boolean;
}

const DEFAULT_SETTINGS: ImportAttachmentsSettings = {
	actionDroppedFilesOnImport: ImportActionType.MOVE,  // Default to moving files
	actionPastedFilesOnImport: ImportActionType.ASK_USER,  // Default to moving files
	embedFilesOnImport: false, // Default to linking files
	multipleFilesImportType: MultipleFilesImportTypes.BULLETED,  // Default to bulleted list when importing multiple files
	customDisplayText: true,
};

export default class ImportAttachments extends Plugin {
	settings: ImportAttachmentsSettings = DEFAULT_SETTINGS;

	async onload() {
		console.log('Loaded')

		await this.loadSettings();
        // Add settings tab
        this.addSettingTab(new ImportAttachmentsSettingTab(this.app, this));

		// Command for importing as a standard link
		this.addCommand({
			id: "move-file-to-vault-link",
			name: "Move File to Vault as Link",
			callback: () => this.chooseFileToImport({
				embed: false,
				move: true,
			}),
		});

		// Command for importing as an embedded image/link
		this.addCommand({
			id: "move-file-to-vault-embed",
			name: "Move File to Vault as Embedded",
			callback: () => this.chooseFileToImport({
				embed: true,
				move: true,
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
            	console.error("An unknown error occurred:", error);
            	new Notice("An unknown error occurred");
        	}
            return;
        }

        const { attachmentsFolderPath, vaultPath, activeFile } = attachmentsFolder;

        let doMove=false;  // default value, if something goes wrong with parsing the configuration
        switch(importType)
        {
        case ImportOperationType.DRAG_AND_DROP:
        	break;
        case ImportOperationType.PASTE:
    	default:
    		switch(this.settings.actionPastedFilesOnImport)
    		{
    		case ImportActionType.MOVE:
    			doMove=true;
    			break;
    		case ImportActionType.COPY:
    			doMove=false;
    			break;
    		case ImportActionType.ASK_USER:
			default:
    			doMove=false;
    			break;
    		}
    		break;
        }
		// const multiFiles = files.length>1;
		const doEmbed = this.settings.embedFilesOnImport;

        const importSettings = {
        	embed: doToggleEmbedPreference ? !doEmbed : doEmbed,
        	move: doMove,
        };

        this.moveFileToAttachmentsFolder(files, attachmentsFolderPath, vaultPath, activeFile, editor, view, importSettings);
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

		const attachmentsFolderPath = path.join(activeFile.parent.path, activeFile.basename + ' (attachments)');

		return {
			attachmentsFolderPath,
			vaultPath: adapter.getBasePath(),
			activeFile,
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

        const { attachmentsFolderPath, vaultPath, activeFile } = attachmentsFolder;

        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;  // Allow selection of multiple files
        
		input.onchange = async (e: Event) => {
		    const target = e.target as HTMLInputElement;
		    const files = target.files; // This is already a FileList

		    if (files && files.length > 0) {
		        // Directly pass the FileList to the processing function
		        await this.moveFileToAttachmentsFolder(files, attachmentsFolderPath, vaultPath, activeFile, editor, markdownView, importSettings);
		    } else {
		        let msg = "No files selected or file access error.";
		        console.error(msg);
		        new Notice(msg);
		    }
		};
		input.click(); // Trigger the file input dialog
    }

    async moveFileToAttachmentsFolder(filesToImport: FileList, attachmentsFolderPath: string, vaultPath: string, activeFile: TFile, editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface) {
        // Ensure the directory exists before moving the file
        await this.ensureDirectoryExists(attachmentsFolderPath);

		let cursor = editor.getCursor(); // Get the current cursor position before insertion

		if (filesToImport.length>1 && this.settings.multipleFilesImportType != MultipleFilesImportTypes.INLINE) {
        	// Check if the cursor is at the beginning of a line
        	if (cursor.ch !== 0) {
        		console.log(cursor.ch);
        		// If not, insert a newline before the link
        		editor.replaceRange('\n', cursor);
        		// You need to explicitly set the cursor to the new position after the newline
        		editor.setCursor({ line: cursor.line + 1, ch: 0 });
        	}
        }

        const multipleFiles = filesToImport.length>1;

        Array.from(filesToImport).forEach(async (fileToImport,index) => {
        	const destFilePath = path.join(attachmentsFolderPath, fileToImport.name);
			const originalFilePath = fileToImport.path;

	        // Check for existing file in the vault
	        const existingFile = this.app.vault.getAbstractFileByPath(fileToImport.path);
	        if (existingFile) {
	            let msg = "A file with the same name already exists. No file was imported.";
	            console.error(msg);
	            new Notice(msg);
	            return;
	        }

	        try {
	        	if(importSettings.move) {
	        		await fs.rename(originalFilePath, path.join(vaultPath, destFilePath)); // Move the file directly	
	        		new Notice("File moved successfully to the attachments folder.");
	        	} else {
	    		    await fs.copyFile(originalFilePath, path.join(vaultPath, destFilePath)); // Copy the file
	    			new Notice("File copied successfully to the attachments folder.");
	        	}

	        	let counter;
	        	if(multipleFiles){
	        		counter = index+1;	
	        	} else {
	        		counter = 0;
	        	}
	        	
	            this.insertLinkToEditor(activeFile, attachmentsFolderPath, fileToImport.name, editor, view, importSettings, counter);
	        } catch (error) {
	            let msg = "Failed to move the file";
	            console.error(msg + ":", error);
	            new Notice(msg + ".");
	        }
    	});
    }

	async ensureDirectoryExists(path: string) {
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!folder) {
			await this.app.vault.createFolder(path);
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
            	console.error("An unknown error occurred:", error);
            	new Notice("An unknown error occurred");
        	}
            return;
        }

		const { attachmentsFolderPath, vaultPath } = attachmentsFolder;

		// Open the folder in the system's default file explorer
		const { shell } = require('electron');
		shell.openPath(path.join(vaultPath,attachmentsFolder.attachmentsFolderPath));
	}

	insertLinkToEditor(activeFile: TFile, attachmentsFolderPath: string, fileName: string, editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface, counter: number) {
		// Extract just the file name from the path
		const baseName = path.basename(fileName, path.extname(fileName));
		const fullPath = path.join(attachmentsFolderPath, fileName);

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
					prefix = `${counter+1}. `;
					postfix = '\n';
					break;
				case MultipleFilesImportTypes.INLINE:
					if(counter>0){
						// if it is not the first item
						prefix = '\n\n';
					}
					break;
			}
		}
		if(this.settings.customDisplayText) {
			customDisplay = '|' + baseName;
		}
		if(importSettings.embed) {
			prefix = prefix + '!';
		}

		const linkText = prefix + '[[' + fullPath + customDisplay + ']]' + postfix;

		const cursor = editor.getCursor(); // Get the current cursor position before insertion

        // Insert the link text at the current cursor position
		editor.replaceRange(linkText, cursor);

		if(counter==0) {
			if(this.settings.customDisplayText) {
				// Define the start and end positions for selecting 'baseName' within the inserted link
				const startCursorPos = {
					line: cursor.line,
					ch: cursor.ch + fullPath.length + prefix.length + 3,
				};
				const endCursorPos = {
					line: cursor.line,
					ch: startCursorPos.ch + baseName.length,
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

        containerEl.createEl('h2', { text: 'Settings for Import Attachments Plus Plugin' });

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
                	if (value in ImportActionType) {
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