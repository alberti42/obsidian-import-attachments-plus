/* eslint-disable @typescript-eslint/no-inferrable-types */
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
	TAbstractFile,
	Platform,
	PluginManifest,
	// Menu,
	// MenuItem,
	// TFile,
} from "obsidian";

import {ImportActionTypeModal, OverwriteChoiceModal, ImportFromVaultChoiceModal} from './ImportAttachmentsModal';
import {
		ImportActionType,
		MultipleFilesImportTypes,
		ImportOperationType,
		ImportAttachmentsSettings,
		AttachmentFolderPath,
		ImportSettingsInterface,
		OverwriteChoiceOptions,
		ImportFromVaultOptions,
		YesNoTypes,
		RelativeLocation,
		LinkFormat,
	} from './types';
import * as Utils from "utils";
import { ParsedPath } from "path";

import { promises as fs } from 'fs';  // This imports the promises API from fs
import * as path from 'path';         // Standard import for the path module

import {patchOpenFile, unpatchOpenFile, addKeyListeners, removeKeyListeners} from 'patchOpenFile';
import {patchFilemanager, unpatchFilemanager} from 'patchFileManager';

import { EditorSelection } from '@codemirror/state';

const DEFAULT_SETTINGS: ImportAttachmentsSettings = {
	actionDroppedFilesOnImport: ImportActionType.ASK_USER, // Default to asking the user
	actionPastedFilesOnImport: ImportActionType.ASK_USER, // Default to asking the user
	embedFilesOnImport: YesNoTypes.ASK_USER, // Default to linking files
	lastActionPastedFilesOnImport: ImportActionType.COPY, // Default to copying files
	lastActionDroppedFilesOnImport: ImportActionType.COPY, // Default to copying files
	lastEmbedFilesOnImport: YesNoTypes.NO, // Default to linking
	multipleFilesImportType: MultipleFilesImportTypes.BULLETED, // Default to bulleted list when importing multiple files
	relativeLocation: RelativeLocation.SAME, // Default to vault
	folderPath: '${notename} (attachments)', // Default to a folder in the vault
	linkFormat: LinkFormat.RELATIVE,
	attachmentName: '${original}', // Default to the original name of the attachment
	dateFormat: 'YYYY_MM_DDTHH_mm_ss',
	customDisplayText: true,  // Default to true
	autoRenameAttachmentFolder: true, // Default to true
	autoDeleteAttachmentFolder: true, // Default to true
	confirmDeleteAttachmentFolder: true, // Default to true
	hideAttachmentFolders: true, // Default to true
	revealAttachment: true, // Default to true
	openAttachmentExternal: true, // Default to true
};

export default class ImportAttachments extends Plugin {
	settings: ImportAttachmentsSettings = {...DEFAULT_SETTINGS};
	vaultPath: string;
	private deleteCallbackEnabled: boolean = true;
	private observer: MutationObserver | null = null;
	private hideFolderNames : Array<string> = [];

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);

		// Store the path to the vault
		if (Platform.isDesktopApp) {
			// store the vault path
			const adapter = this.app.vault.adapter;
			if (!(adapter instanceof FileSystemAdapter)) {
				throw new Error("The vault folder could not be determined.");
			}
			this.vaultPath = adapter.getBasePath();
		} else {
			this.vaultPath = "";
		}
	}

	setupObserver() {
		this.configureHideFolderNames();

		const callback: MutationCallback = (mutationsList, observer) => {
			mutationsList.forEach(record => {
				if(record.target?.parentElement?.classList.contains("nav-folder")) {
					this.hideAttachmentFolders();
			}});
		};

		this.observer = new MutationObserver(callback);

		const config = {
			childList: true,
			subtree: true,
		};

		this.observer.observe(document.body, config);
	}

	async hideAttachmentFolders(forceRecheckingAllFolders?: boolean) {
		if (forceRecheckingAllFolders) {
			document.querySelectorAll(".import-plugin-hidden").forEach((divElement: Element) => {
				divElement.removeClass('import-plugin-hidden');
			});
		}

		this.hideFolderNames.forEach(folderPattern => {
			if(folderPattern === "") return;
			const folderElements = document.querySelectorAll(folderPattern);
			
			folderElements.forEach((folder: Element) => {
				if (folder.parentNode && folder.parentNode instanceof HTMLElement) {
					if(this.settings.hideAttachmentFolders){
						folder.parentNode.addClass('import-plugin-hidden');
					}
				} else {
					console.error('Parent node is not an HTML element:',folder);
				}
			});
		});
	}

	splitAroundOriginal(input: string, placeholder: string): [string, string] {
		// Find the index of the first occurrence of the placeholder
		const firstIndex = input.indexOf(placeholder);

		// If the placeholder is not found, return the whole string as the first part and an empty string as the second part
		if (firstIndex === -1) {
			return [input, ""];
		}

		// Find the index of the last occurrence of the placeholder
		const lastIndex = input.lastIndexOf(placeholder);

		// Calculate the starting index of the text after the placeholder
		const endOfPlaceholderIndex = lastIndex + placeholder.length;

		// Extract the parts before the first occurrence and after the last occurrence of the placeholder
		const beforeFirst = input.substring(0, firstIndex);
		const afterLast = input.substring(endOfPlaceholderIndex);

		return [beforeFirst, afterLast];
	}

	configureHideFolderNames() {
		const placeholder = "${notename}";
		if(this.settings.folderPath.includes(placeholder)) {
			const [startsWith, endsWith] = this.splitAroundOriginal(this.settings.folderPath,placeholder);
			if(endsWith!="") {
				this.hideFolderNames = [
						`[data-path$="${endsWith}"]`
					];
			} else if(startsWith!="") {
				this.hideFolderNames = [
						`.nav-folder-title[data-path^="${startsWith}"], .nav-folder-title[data-path*="/${startsWith}"]`
					];
			}
		} else {
			this.hideFolderNames = [
				`[data-path$="/${this.settings.folderPath}"], [data-path="${this.settings.folderPath}"]`
				];
		}
	}

	async onload() {
		// Load and add settings tab
		await this.loadSettings();
		this.addSettingTab(new ImportAttachmentsSettingTab(this.app, this));

		// set up the mutation observer for hiding folders
		this.setupObserver();

		// monkey patch of the openFile function
		if (Platform.isDesktopApp) {
			// path the openFile function
			patchOpenFile(this);
			// add key listeners for modifying the behavior when opening files
			addKeyListeners();
		}

		// Command for importing as a standard link
		if (Platform.isDesktopApp) {
			this.addCommand({
				id: "move-file-to-vault-link",
				name: "Move file to vault as linked attachment",
				callback: () => this.chooseFileToImport({
					embed: false,
					action: ImportActionType.MOVE,
				}),
			});
		}

		// Command for importing as an embedded image/link
		if (Platform.isDesktopApp) {
			this.addCommand({
				id: "move-file-to-vault-embed",
				name: "Move file to vault as embedded attachment",
				callback: () => this.chooseFileToImport({
					embed: true,
					action: ImportActionType.MOVE,
				}),
			});
		}

		// Command for importing as a standard link
		if (Platform.isDesktopApp) {
			this.addCommand({
				id: "copy-file-to-vault-link",
				name: "Copy file to vault as linked attachment",
				callback: () => this.chooseFileToImport({
					embed: false,
					action: ImportActionType.COPY,
				}),
			});
		}

		// Command for importing as an embedded image/link
		if (Platform.isDesktopApp) {
			this.addCommand({
				id: "copy-file-to-vault-embed",
				name: "Copy file to vault as embedded attachment",
				callback: () => this.chooseFileToImport({
					embed: true,
					action: ImportActionType.COPY,
				}),
			});
		}

		// Register the command to open the attachments folder
		if (Platform.isDesktopApp) {
			this.addCommand({
				id: "open-attachments-folder",
				name: "Open attachments folder",
				callback: () => this.openAttachmentsFolder(),
			});
		}

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

		if (Platform.isDesktopApp) {
			this.registerEvent(
				// check obsidian.d.ts for other types of events
				this.app.workspace.on('editor-drop', async (evt: DragEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) => {

/*					try {
						// Code throwing an exception
						throw new Error();
					} catch (e) {
						console.log(e.stack);
						console.log(this);
					}
*/

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

					const doForceAsking = evt.shiftKey; // Check if Shift was pressed
					
					// Handle the dropped files
					const files = evt?.dataTransfer?.files;
					if (files && files.length > 0) {
						const cm = editor.cm; // Access the CodeMirror instance
						const dropPos = cm.posAtCoords({ x: evt.clientX, y: evt.clientY });

						if (dropPos) {
							// Use dispatch to set the cursor position
							cm.dispatch({
								selection: EditorSelection.single(dropPos)
							});
							
							// Handle the files as per your existing logic
							await this.handleFiles(files, editor, view, doForceAsking, ImportOperationType.DRAG_AND_DROP);
						} else {
							console.error('Unable to determine drop position');
						}
					} else {
						console.error('No files dropped');
					}
				})
			);
		}

		if (Platform.isDesktopApp) {
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

		if (Platform.isDesktopApp) {
			let renameCallbackEnabled: boolean = true;
			this.registerEvent(
				this.app.vault.on('rename', async (newFile: TAbstractFile, oldPath: string) => {
					if(!this.settings.autoRenameAttachmentFolder) { return }

					if(renameCallbackEnabled) {
						const oldPath_parsed = path.parse(oldPath);
						if(oldPath_parsed.ext != ".md") { return }

						const oldAttachmentFolderPath = this.getAttachmentFolder(oldPath_parsed);
						if(!oldAttachmentFolderPath) { return }
		
						if(await Utils.checkDirectoryExists(oldAttachmentFolderPath.attachmentsFolderPath)) {
		
							const newAttachmentFolderPath = this.getAttachmentFolder(path.parse(newFile.path));
							if(!newAttachmentFolderPath) { return }
							
							const oldPath = path.relative(this.vaultPath,oldAttachmentFolderPath.attachmentsFolderPath);
							const newPath = path.relative(this.vaultPath,newAttachmentFolderPath.attachmentsFolderPath);
							try {
								renameCallbackEnabled = false;
								await this.renameFile(oldPath,newPath);
							} catch (error: unknown) {
								const msg = 'Failed to rename the attachment folder';
								console.error(msg);
								console.error("Original attachment folder:",oldPath);
								console.error("New attachment folder:",newPath);
								console.error("Error msg:", error);
								new Notice(msg+'.');
							} finally {
								renameCallbackEnabled = true;
							}
						}
					}
				})
			);
		}

		if (Platform.isDesktopApp) {
			
			// Monkey-patch file manager to handle the deletion of the attachment folder
			// when the function promptForDeletion is triggered by the user
			patchFilemanager(this);

			/*
			this.registerEvent(
				this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
					if (file instanceof TFile) {
						if (!file.path.endsWith(".md")) return;

						// Find and modify the existing "Delete" menu item
						for (const item of menu.items) {
							if (item.dom.innerText === "Delete") { // Adjust the condition as needed
								const originalCallback = item.callback;
								console.log(originalCallback);
								item.onClick(async () => {
									await originalCallback();
								});
								break; // Exit loop after finding and modifying the "Delete" item
							}
						}
					}
				})
			);
			*/
			
		}

		console.log('Loaded plugin Import Attachments+');
	}

	onunload() {
		if (Platform.isDesktopApp) {
			// unpatch openFile
			unpatchOpenFile();
			removeKeyListeners();

			// unpatch fileManager
			unpatchFilemanager();
		}
		if(this.observer){
			this.observer.disconnect();	
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async renameFile(oldFilePath: string, newFilePath: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(oldFilePath);
			if (file instanceof TAbstractFile) {
				await this.app.fileManager.renameFile(file, newFilePath);
				new Notice('Attachment folder renamed successfully.');
			} else {
				new Notice('Attachment folder could not be found at the given location.');
			}
		} catch (error: unknown) {
			const msg = 'Failed to rename file';
			console.error(msg+':', error);
			new Notice(msg+'.');
		}
	}

	async trashFile(filePath: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TAbstractFile) {
				await await this.app.vault.adapter.trashSystem(filePath);
				new Notice('Attachment folder moved to system trash successfully.');
			} else {
				new Notice('Attachment folder could not be found at the given location.');
			}
		} catch (error: unknown) {
			const msg = 'Failed to rename file';
			console.error(msg+':', error);
			new Notice(msg+'.');
		}
	}

	async handleFiles(files: FileList, editor: Editor, view: MarkdownView, doForceAsking: boolean, importType: ImportOperationType) {
		const attachmentsFolder = this.getAttachmentFolder();
		if(!attachmentsFolder){ return }

		const { attachmentsFolderPath, currentNoteFolderPath } = attachmentsFolder;

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

		if (doForceAsking || actionFilesOnImport == ImportActionType.ASK_USER || embedOption == YesNoTypes.ASK_USER) {
			const modal = new ImportActionTypeModal(this.app, this, lastActionFilesOnImport, lastEmbedOption);
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
			if (choice.rememberChoice) {
				this.settings.embedFilesOnImport = embedOption;	
			}
			this.settings.lastEmbedFilesOnImport = embedOption;
			await this.saveSettings();
		}

		const doEmbed = (embedOption == YesNoTypes.YES);

		const importSettings = {
			embed: doEmbed,
			action: actionFilesOnImport,
		};

		this.moveFileToAttachmentsFolder(files, attachmentsFolderPath, currentNoteFolderPath, editor, view, importSettings);
	}

	getAttachmentFolder(noteFilePath: ParsedPath | null = null): AttachmentFolderPath | null {
		try {
			// Get the current active note if noteFilePath is not provided
			if(!noteFilePath) {
				noteFilePath = ( ():ParsedPath => {
					const activeFile = this.app.workspace.getActiveFile();
					if(activeFile==null) {
						throw new Error("The active note could not be determined.");
					}
					return path.parse(activeFile.path);
				})()
			}
			
			if (!noteFilePath || noteFilePath.ext !== ".md") {
				throw new Error("No Markdown file was found.");
			}

			if(!this.vaultPath) return null;

			const noteFolderPath = path.join(this.vaultPath,noteFilePath.dir);
			const notename = noteFilePath.name;
			
			let referencePath = '';
			switch(this.settings.relativeLocation) {
			case RelativeLocation.VAULT:
				referencePath = this.vaultPath;
				break;
			case RelativeLocation.SAME:
				referencePath = noteFolderPath;
				break;
			}
			
			const relativePath = this.settings.folderPath.replace(/\$\{notename\}/g, notename);

			const attachmentsFolderPath = path.join(referencePath,relativePath);

			return {
				attachmentsFolderPath,
				currentNoteFolderPath: noteFolderPath,
			};
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error(error.message);
				new Notice(error.message);
			} else {
				// If it's not an Error, log it as a string or use a default message
				console.error("An unknown error occurred:", error);
				new Notice("An unknown error occurred");
			}
			return null;
		}
	}

	async chooseFileToImport(importSettings: ImportSettingsInterface) {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = markdownView?.editor;

		if(!editor)
		{
			const msg = "No active markdown editor found.";
			console.error(msg);
			new Notice(msg);
			return;
		}

		const attachmentsFolder = this.getAttachmentFolder();
		if(!attachmentsFolder){ return }

		const { attachmentsFolderPath, currentNoteFolderPath: referencePath } = attachmentsFolder;

		const input = document.createElement("input");
		input.type = "file";
		input.multiple = true;  // Allow selection of multiple files
		
		input.onchange = async (e: Event) => {
			const target = e.target as HTMLInputElement;
			const files = target.files; // This is already a FileList

			if (files && files.length > 0) {
				// Directly pass the FileList to the processing function
				await this.moveFileToAttachmentsFolder(files, attachmentsFolderPath, referencePath, editor, markdownView, importSettings);
			} else {
				const msg = "No files selected or file access error.";
				console.error(msg);
				new Notice(msg);
			}
		};
		input.click(); // Trigger the file input dialog
	}

	async moveFileToAttachmentsFolder(filesToImport: FileList, attachmentsFolderPath: string, currentNoteFolderPath: string, editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface) {
		// Ensure the directory exists before moving the file
		await Utils.ensureDirectoryExists(attachmentsFolderPath);
		

		const cursor = editor.getCursor(); // Get the current cursor position before insertion

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
			let destFilePath = path.join(attachmentsFolderPath,
							await Utils.createAttachmentName(this.settings.attachmentName,this.settings.dateFormat,originalFilePath));

			// Check if file already exists in the vault
			const existingFile = await Utils.checkFileExists(destFilePath);
			// If they are the same file, then skip copying/moving, we are alrady done
			
			if(existingFile && await Utils.arePathsSameFile(originalFilePath,destFilePath)) {
				return destFilePath;
			}

			// If the original file is already in the vault
			if(!this.vaultPath) return null;
			const inVault = await Utils.isFileInVault(this.vaultPath,originalFilePath)
			if(inVault)
			{
				const modal = new ImportFromVaultChoiceModal(this.app, this, this.vaultPath, inVault, importSettings.action);
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
				const modal = new OverwriteChoiceModal(this.app, this, originalFilePath, destFilePath);
				modal.open();
				const choice = await modal.promise;
				if(choice==null) { return null; }
				switch(choice) {
				case OverwriteChoiceOptions.OVERWRITE:
					// continue
					break;
				case OverwriteChoiceOptions.KEEPBOTH:
					destFilePath = await Utils.findNewFilename(destFilePath);
					if(destFilePath==null) { return null; }
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
				const msg = "Failed to process the file";
				new Notice(msg + ".");
				console.error( msg + ":", originalFilePath, error);
				return null; // Indicate failure in processing this file
			}
		});

		// Wait for all tasks to complete
		const results = await Promise.all(tasks);

		// Now process the results
		const counter = 0;
		results.forEach((importedFilePath: (string|null), index: number) => {
			if (importedFilePath) {
				this.insertLinkToEditor(currentNoteFolderPath, importedFilePath, editor, view, importSettings, multipleFiles ? index+1 : 0);
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
		const attachmentsFolder = this.getAttachmentFolder();
		if(!attachmentsFolder){ return }

		const { attachmentsFolderPath } = attachmentsFolder;
		
		if(! await Utils.checkDirectoryExists(attachmentsFolderPath))
		{
			const msg="This note does not have an attachment folder";
			console.error(msg+":", attachmentsFolderPath);
			new Notice(msg+".");
		}

		// TODO: Ask whether to create an Attachment folder

		// Open the folder in the system's default file explorer
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { shell } = require('electron');
		// window.require('electron').remote.shell.showItemInFolder(attachmentsFolder.attachmentsFolderPath);
		shell.openPath(attachmentsFolder.attachmentsFolderPath);
	}

	insertLinkToEditor(currentNoteFolderPath: string, importedFilePath: string, editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface, counter: number) {
		// Extract just the file name from the path

		const filename=Utils.getFilename(importedFilePath);

		let relativePath;
		switch(this.settings.linkFormat) {
		case LinkFormat.RELATIVE:
			relativePath=path.relative(currentNoteFolderPath, importedFilePath);	
			break;
		case LinkFormat.ABSOLUTE:
		default:
			relativePath=path.relative(this.vaultPath,importedFilePath);	
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

		if (Platform.isDesktopApp) {
			new Setting(containerEl).setName('Importing').setHeading();
			
			new Setting(containerEl)
				.setName('Whether to move or copy files that are drag-and-dropped?')
				.setDesc('Choose whether files that are dragged and dropped into the editor should be moved or copied. Alternatively, the user is asked each time. By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.')
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
				.setDesc('Choose whether files that are copy and pasted into the editor should be moved or copied. Alternatively, the user is asked each time.  By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.')
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
				.setDesc('If this option is enabled, the files are imported as an embedded document; if it is deactivated, they are imported as a linked document.  By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.')
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
				.setDesc('If this option is enabled, the basename of the imported document is used as in place of the custom display text.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.customDisplayText)
					.onChange(async (value: boolean) => {
						this.plugin.settings.customDisplayText = value;
						await this.plugin.saveSettings();
				}));

			new Setting(containerEl).setName('Opening').setHeading();
			
			let key;
			if (Platform.isMacOS) {
				key = '⌘';
			} else { // Default to Windows/Linux bindings
				key = 'Ctrl';
			}

			new Setting(containerEl)
				.setName('Open attachment with default external application:')
				.setDesc(`If this option is enabled, when you open an attachment by holding ${key}, the attachment opens in default external application.`)
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.openAttachmentExternal)
					.onChange(async (value: boolean) => {
						this.plugin.settings.openAttachmentExternal = value;
						await this.plugin.saveSettings();
				}));

			if (Platform.isMacOS) {
				key = '⌘+⌥';
			} else { // Default to Windows/Linux bindings
				key = 'Ctrl+Alt';
			}

			new Setting(containerEl)
				.setName("Reveal attachment in system's file manager:")
				.setDesc(`If this option is enabled, when you open an attachment by holding ${key}, the attachment is shown in the system's file manager.`)
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.revealAttachment)
					.onChange(async (value: boolean) => {
						this.plugin.settings.revealAttachment = value;
						await this.plugin.saveSettings();
				}));
		}

		if (Platform.isDesktopApp) {
			new Setting(containerEl).setName('Managing').setHeading();
			
			new Setting(containerEl)
				.setName('Rename the attachment folder automatically and update all links correspondingly:')
				.setDesc('If this option is enabled, when you rename/move an note, if the renamed note has an attachment folder connected to it, \
					its attachment folder is renamed/moved to a new name/location corresponding to the new name of the note.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.autoRenameAttachmentFolder)
					.onChange(async (value: boolean) => {
						this.plugin.settings.autoRenameAttachmentFolder = value;
						await this.plugin.saveSettings();
				}));

			new Setting(containerEl)
				.setName('Delete the attachment folder automatically when the corresponding note is deleted:')
				.setDesc('If this option is enabled, when you delete a note, if the deleted note has an attachment folder connected to it, \
					its attachment folder will be deleted as well. \
					Note: automatic deletion only works when the name of the attachment folder contains ${notename}.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.autoDeleteAttachmentFolder)
					.onChange(async (value: boolean) => {
						this.plugin.settings.autoDeleteAttachmentFolder = value;
						await this.plugin.saveSettings();
				}));

			new Setting(containerEl)
				.setName('Ask confirmation before deleting the attachment folder:')
				.setDesc('If enabled, the user is asked each time whether to delete the attachment folder.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.confirmDeleteAttachmentFolder)
					.onChange(async (value: boolean) => {
						this.plugin.settings.confirmDeleteAttachmentFolder = value;
						await this.plugin.saveSettings();
				}));
		}

		new Setting(containerEl).setName('Attachment folder').setHeading();
		
		if (Platform.isDesktopApp) {
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
				.setName('Attachment folder where to import new attachments, relative to the default location:')
				.setDesc('Where newly created notes are placed. Use ${notename} as a placeholder for the name of the note.')
				.addText(text => {
					text.setPlaceholder('Enter folder path');
					text.setValue(this.plugin.settings.folderPath);
					text.onChange(async (value: string) => {
						this.plugin.settings.folderPath = value;
						await this.plugin.saveSettings();
						this.plugin.configureHideFolderNames();
						await this.plugin.hideAttachmentFolders(true);
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
				.setDesc(createFragment((frag) => {
					frag.appendText('Choose how to name the imported attachments, using the following variables as a placeholder:');
					frag.createEl('ul')
					.createEl('li',{text: '${original} for the name of the original file'})
					.createEl('li',{text: '${date} for the current date'})
					.createEl('li',{text: '${uuid} for a 128-bit Universally Unique Identifier'})
					.createEl('li',{text: '${md5} for a MD5 hash of the imported file'});
				}))
				.addText(text => {
					text.setPlaceholder('Enter attachment name');
					text.setValue(this.plugin.settings.attachmentName);
					text.onChange(async (value: string) => {
						if(value.trim()=='') {
							value = '${original}'; // TODO: improve checking the input by the user that it is not empty
						}
						this.plugin.settings.attachmentName = value;
						await this.plugin.saveSettings();
				})});

			new Setting(containerEl)
				.setName('Date format:')
				.setDesc(createFragment((frag) => {
						frag.appendText('Choose the date format, based on ');
						frag.createEl('a', {
							href: 'https://momentjscom.readthedocs.io/en/latest/moment/04-displaying/01-format',
							text: 'momentjs',
						});
						frag.appendText(' syntax.')}))
				.addText(text => {
					text.setPlaceholder('Enter date format');
					text.setValue(this.plugin.settings.dateFormat);
					text.onChange(async (value: string) => {
						this.plugin.settings.dateFormat = value;
						await this.plugin.saveSettings();
				})});
		}
		
		new Setting(containerEl)
			.setName('Hide attachment folders:')
			.setDesc('If this option is enabled, the attachment folders will not be shown.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideAttachmentFolders)
				.onChange(async (value: boolean) => {
					this.plugin.settings.hideAttachmentFolders = value;
					await this.plugin.saveSettings();
					await this.plugin.hideAttachmentFolders(true);
			}));
	}
}