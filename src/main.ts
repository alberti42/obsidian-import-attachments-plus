/* eslint-disable @typescript-eslint/no-inferrable-types */

// Import necessary Obsidian API components
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
	TextComponent,
	normalizePath,
} from "obsidian";

// Import utility and modal components
import { ImportActionTypeModal, OverwriteChoiceModal, ImportFromVaultChoiceModal, FolderImportErrorModal, CreateAttachmentFolderModal } from './ImportAttachmentsModal';
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
	ParsedPath
} from './types';
import * as Utils from "utils";

import { promises as fs } from 'fs';  // This imports the promises API from fs
import * as path from 'path';         // Standard import for the path module

import { patchOpenFile, unpatchOpenFile, addKeyListeners, removeKeyListeners } from 'patchOpenFile';
import { patchFilemanager, unpatchFilemanager } from 'patchFileManager';

import { EditorSelection } from '@codemirror/state';

import { patchImportFunctions, unpatchImportFunctions } from "patchImportFunctions";
import { patchFileExplorer, unpatchFileExplorer, updateVisibilityAttachmentFolders } from "patchFileExplorer";
import { monkeyPatchConsole, unpatchConsole } from "patchConsole";

// Default plugin settings
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
	revealAttachmentExtExcluded: '.md', // Default to Markdown files
	openAttachmentExternal: true, // Default to true
	openAttachmentExternalExtExcluded: '.md', // Default to Markdown files
	logs: {}, // Initialize logs as an empty array
};

// Main plugin class
export default class ImportAttachments extends Plugin {
	settings: ImportAttachmentsSettings = { ...DEFAULT_SETTINGS };
	vaultPath: string;
	private deleteCallbackEnabled: boolean = true;
	private observer: MutationObserver | null = null;
	private hideFolderNames: Array<string> = [];
	private saveTimeout: number | null = null;
	matchAttachmentFolder: ((str:string)=>boolean) = (_:string) => true;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);

		if (process.env.NODE_ENV === "development") {
			monkeyPatchConsole(this);
			console.log("Import Attachments+: development mode including extra logging and debug features");
		}

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

	// Observer to hide attachment folders
	/*
	setupObserver() {
		this.configureHideFolderNames();

		const callback: MutationCallback = (mutationsList, observer) => {
			mutationsList.forEach(record => {
				if (record.target?.parentElement?.classList.contains("nav-folder")) {
					this.hideAttachmentFolders();
				}
			});
		};

		this.observer = new MutationObserver(callback);

		const config = {
			childList: true,
			subtree: true,
		};

		const navContainer = document.querySelector('.nav-files-container') || document.body;
		this.observeNavFilesContainer(navContainer, config);
	}

	// Function to observe the nav-files-container
	observeNavFilesContainer(container: Element, config: MutationObserverInit) {
		// Disconnect any existing observer on the same container to avoid duplicate observers
		if (this.observer) {
			this.observer.disconnect();
		}
		this.observer?.observe(container, config);
	}

	// Function to hide attachment folders
	async hideAttachmentFolders(forceRecheckingAllFolders?: boolean, specificElement?: HTMLElement) {
		if (forceRecheckingAllFolders) {
			document.querySelectorAll(".import-plugin-hidden").forEach((divElement: Element) => {
				divElement.classList.remove('import-plugin-hidden');
			});
		}

		this.hideFolderNames.forEach(folderPattern => {
			if (folderPattern === "") return;
			const folderElements = specificElement ? specificElement.querySelectorAll(folderPattern) : document.querySelectorAll(folderPattern);

			folderElements.forEach((folder: Element) => {
				if (folder.parentNode && folder.parentNode instanceof HTMLElement) {
					// console.log(folder);
					if (this.settings.hideAttachmentFolders) {
						folder.parentNode.classList.add('import-plugin-hidden');
					}
				} else {
					console.error('Parent node is not an HTML element:', folder);
				}
			});
		});
	}

	// Configure the folder names to hide
	configureHideFolderNames() {
		const placeholder = "${notename}";
		if (this.settings.folderPath.includes(placeholder)) {
			const [startsWith, endsWith] = this.splitAroundOriginal(this.settings.folderPath, placeholder);
			if (endsWith != "") {
				this.hideFolderNames = [
					`[data-path$="${endsWith}"]`
				];
			} else if (startsWith != "") {
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
	*/

	// Function to split around the original
	parseAttachmentFolderPath() {
		const folderPath = this.settings.folderPath;
		const placeholder = "${notename}";

		if(folderPath.includes("${notename}")) {
			// Find the index of the first occurrence of the placeholder
			const firstIndex = folderPath.indexOf(placeholder);

			// If the placeholder is not found, return the whole string as the first part and an empty string as the second part
			if (firstIndex === -1) {
				return [folderPath, ""];
			}

			// Find the index of the last occurrence of the placeholder
			const lastIndex = folderPath.lastIndexOf(placeholder);

			// Calculate the starting index of the text after the placeholder
			const endOfPlaceholderIndex = lastIndex + placeholder.length;

			// Extract the parts before the first occurrence and after the last occurrence of the placeholder
			const folderPathStartsWith = folderPath.substring(0, firstIndex);
			const folderPathEndsWith = folderPath.substring(endOfPlaceholderIndex);

			this.matchAttachmentFolder = (filePath: string): boolean => {
				// Check if filePath starts with startsWidth or contains /startsWidth
				const startsWithMatch = filePath.startsWith(folderPathStartsWith) || filePath.includes(`/${folderPathStartsWith}`);
				
				// Check if filePath ends with endsWidth
				const endsWithMatch = filePath.endsWith(folderPathEndsWith);
				
				// Return true only if both conditions are met
				return startsWithMatch && endsWithMatch;
			}
		} else {
			this.matchAttachmentFolder = (filePath: string): boolean => {
				return filePath.endsWith(`/${folderPath}`) || filePath === folderPath;	
			}
		}		
	}

	// Function to split around the original
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


	// Load plugin settings
	async onload() {
		// Load and add settings tab
		await this.loadSettings();
		this.addSettingTab(new ImportAttachmentsSettingTab(this.app, this));
		
		// Set up the mutation observer for hiding folders
		// this.setupObserver();

		// Monkey patches of the openFile function
		if (Platform.isDesktopApp) {
			// patch the openFile function
			patchOpenFile(this);
			// add key listeners for modifying the behavior when opening files
			addKeyListeners();
		}

		// Monkey patches of the vault function
		if (Platform.isDesktopApp) {
			patchImportFunctions(this);
		}

		// Monkey-patch file manager to handle the deletion of the attachment folder
		// when the function promptForDeletion is triggered by the user
		patchFilemanager(this);

		// Monkey-path file explorer to hide attachment folders
		patchFileExplorer(this);

		// Commands for moving or copying files to the vault
		if (Platform.isDesktopApp) {
			// Command for importing as a standard link
			this.addCommand({
				id: "move-file-to-vault-link",
				name: "Move file to vault as linked attachment",
				callback: () => this.chooseFileToImport({
					embed: false,
					action: ImportActionType.MOVE,
				}),
			});

			// Command for importing as an embedded image/link
			this.addCommand({
				id: "move-file-to-vault-embed",
				name: "Move file to vault as embedded attachment",
				callback: () => this.chooseFileToImport({
					embed: true,
					action: ImportActionType.MOVE,
				}),
			});

			// Command for importing as a standard link
			this.addCommand({
				id: "copy-file-to-vault-link",
				name: "Copy file to vault as linked attachment",
				callback: () => this.chooseFileToImport({
					embed: false,
					action: ImportActionType.COPY,
				}),
			});

			// Command for importing as an embedded image/link
			this.addCommand({
				id: "copy-file-to-vault-embed",
				name: "Copy file to vault as embedded attachment",
				callback: () => this.chooseFileToImport({
					embed: true,
					action: ImportActionType.COPY,
				}),
			});

			// Register the command to open the attachments folder
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

		// Register event handlers for drag-and-drop and paste events
		if (Platform.isDesktopApp) {
			this.registerEvent( // check obsidian.d.ts for other types of events
				this.app.workspace.on('editor-drop', async (evt: DragEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) => {

					// Check if the event has already been handled
					if (evt.defaultPrevented) return;

					if (!(view instanceof MarkdownView)) {
						console.error('No view provided')
						return;
					}

					const altKeyPressed = evt.altKey; // Check if Alt was pressed
					if (altKeyPressed) {
						// Follow standard behavior where a link to the external file is created
						return;
					} else {
						// Prevent other handlers from executing
						evt.preventDefault();
					}

					const doForceAsking = evt.shiftKey; // Check if Shift was pressed

					// Handle the dropped files
					const files = evt?.dataTransfer?.files;
					if(!files) return;

					if (files.length > 0) {
						const codemirror = editor.cm; // Access the CodeMirror instance
						const dropPos = codemirror.posAtCoords({ x: evt.clientX, y: evt.clientY });
						
						if (dropPos!==null) {
							// Use dispatch to set the cursor position
							codemirror.dispatch({
								selection: EditorSelection.single(dropPos)
							});

							// Handle the files as per your existing logic
							await this.handleFiles(Array.from(files), editor, view, doForceAsking, ImportOperationType.DRAG_AND_DROP);
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

							// Check if all files have a non-empty 'path' property
							const filesArray = Array.from(files);
							const allFilesHavePath = filesArray.every(file => file.path && file.path !== "");
							if(allFilesHavePath) {
								// evt.preventDefault();

								// const doToggleEmbedPreference = false; // Pretend shift was not pressed
								// await this.handleFiles(filesArray, editor, view, doToggleEmbedPreference, ImportOperationType.PASTE);
							} else {
								//
								const t = Array.from(files);
								// console.log(files);
								// console.log(clipboardData);
								// console.log(clipboardData.dropEffect);
								// console.log(clipboardData.files);
								// console.log(clipboardData.items);
								// console.log(clipboardData.types);
								const arrayBuffer = await t[0].arrayBuffer();
								fs.appendFile("/Users/andrea/Downloads/tst.png", Buffer.from(arrayBuffer));
							}
						}
						// console.error("No files detected in paste data.");
					}
				})
			);
		}

		let renameCallbackEnabled: boolean = true;
		this.registerEvent(
			this.app.vault.on('rename', async (newFile: TAbstractFile, oldPath: string) => {
				if (!this.settings.autoRenameAttachmentFolder) { return }

				if (renameCallbackEnabled) {
					const oldPath_parsed = Utils.parseFilePath(oldPath);
					if (oldPath_parsed.ext !== ".md") { return }

					const oldAttachmentFolderPath = this.getAttachmentFolder(oldPath_parsed);
					if (!oldAttachmentFolderPath) { return }
					if (Utils.doesFolderExist(this.app.vault,oldAttachmentFolderPath.attachmentsFolderPath)) {
						const newAttachmentFolderPath = this.getAttachmentFolder(Utils.parseFilePath(newFile.path));

						const oldPath = oldAttachmentFolderPath.attachmentsFolderPath;
						const newPath = newAttachmentFolderPath.attachmentsFolderPath;
						
						try {
							renameCallbackEnabled = false;
							await this.renameFile(oldPath, newPath);
						} catch (error: unknown) {
							const msg = 'Failed to rename the attachment folder';
							console.error(msg);
							console.error("Original attachment folder:", oldPath);
							console.error("New attachment folder:", newPath);
							console.error("Error msg:", error);
							new Notice(msg + '.');
						} finally {
							renameCallbackEnabled = true;
						}
					}
				}
			})
		);
	
		if (Platform.isDesktopApp) {
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
		// unpatch openFile
		unpatchOpenFile();
		removeKeyListeners();

		// unpatch fileManager
		unpatchFilemanager();

		// unpatch Vault
		unpatchImportFunctions();

		// if (this.observer) {
		// 	this.observer.disconnect();
		// }

		// unpatch file-explorer plugin
		unpatchFileExplorer();

		// unpatch console
		unpatchConsole();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.logs = {};
		this.parseAttachmentFolderPath();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Function to rename files using fs.rename
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
			console.error(msg + ':', error);
			new Notice(msg + '.');
		}
	}

	async trashFile(filePath: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TAbstractFile) {
				await this.app.vault.adapter.trashSystem(filePath);
				if(Platform.isDesktop) {
					new Notice('Attachment folder moved to the system trash successfully.');
				} else {
					new Notice('Attachment folder deleted successfully.');
				}

			} else {
				new Notice('Attachment folder could not be found at the given location.');
			}
		} catch (error: unknown) {
			const msg = 'Failed to rename file';
			console.error(msg + ':', error);
			new Notice(msg + '.');
		}
	}

	
	async handleFiles(files: File[], editor: Editor, view: MarkdownView, doForceAsking: boolean, importType: ImportOperationType) {

		const {nonFolderFilesArray, foldersArray} = await Utils.filterOutFolders(Array.from(files));

		if(foldersArray.length>0) {
			const modal = new FolderImportErrorModal(this, foldersArray);
			modal.open();
			await modal.promise;
		}

		let actionFilesOnImport = ImportActionType.COPY; // for safety, the defualt is COPY
		let lastActionFilesOnImport = ImportActionType.COPY; // for safety, the defualt is COPY
		switch (importType) {
			case ImportOperationType.DRAG_AND_DROP:
				actionFilesOnImport = this.settings.actionDroppedFilesOnImport;
				lastActionFilesOnImport = this.settings.lastActionDroppedFilesOnImport;
				break;
			case ImportOperationType.PASTE:
				actionFilesOnImport = this.settings.actionPastedFilesOnImport;
				lastActionFilesOnImport = this.settings.lastActionPastedFilesOnImport;
				break;
		}

		let embedOption = this.settings.embedFilesOnImport;
		const lastEmbedOption = this.settings.lastEmbedFilesOnImport;

		if (doForceAsking || actionFilesOnImport == ImportActionType.ASK_USER || embedOption == YesNoTypes.ASK_USER) {
			const modal = new ImportActionTypeModal(this, lastActionFilesOnImport, lastEmbedOption);
			modal.open();
			const choice = await modal.promise;
			if (choice == null) return;
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
			await this.debouncedSaveSettings();
		}

		const doEmbed = (embedOption == YesNoTypes.YES);

		const importSettings = {
			embed: doEmbed,
			action: actionFilesOnImport,
		};

		this.moveFileToAttachmentsFolder(nonFolderFilesArray, editor, view, importSettings);
	}

	// Get attachment folder path based on current note
	getAttachmentFolder(md_file: ParsedPath | null = null): AttachmentFolderPath {
		// Get the current active note if md_file is not provided
		if (!md_file) {
			const md_active_file = this.app.workspace.getActiveFile();
			if (md_active_file == null) {
				throw new Error("The active note could not be determined.");
			}
			md_file = Utils.parseFilePath(md_active_file.path);
		}

		if (md_file.ext !== ".md") {
			throw new Error("No Markdown file was found.");
		}
		
		const currentNoteFolderPath = md_file.dir;
		const notename = md_file.filename;

		let referencePath = '';
		switch (this.settings.relativeLocation) {
			case RelativeLocation.VAULT:
				referencePath = '';
				break;
			case RelativeLocation.SAME:
				referencePath = currentNoteFolderPath;
				break;
		}

		const relativePath = this.settings.folderPath.replace(/\$\{notename\}/g, notename);
		const attachmentsFolderPath = normalizePath(Utils.joinPaths(referencePath, relativePath));
		
		return {
			attachmentsFolderPath,
			currentNoteFolderPath,
		};
	}

	async createAttachmentName(originalFilePath:string, data: File | ArrayBuffer, md_file: ParsedPath | null, createFolder: boolean): Promise<string> {

		const originalFilePath_parsed = Utils.parseFilePath(originalFilePath);
		const namePattern = this.settings.attachmentName;
		const dateFormat = this.settings.dateFormat;
		
		const fileToImportName = originalFilePath_parsed.filename;
		
		let attachmentName = namePattern.replace(/\$\{original\}/g, fileToImportName)
										.replace(/\$\{uuid\}/g, Utils.uuidv4())
										.replace(/\$\{date\}/g, Utils.formatDateTime(dateFormat));

		if(namePattern.includes('${md5}')) {
			let hash = ''
			try {
				hash = await Utils.hashFile(originalFilePath);
			} catch (err: unknown) {
				console.error('Error hashing the file:', err);
			}
			attachmentName = attachmentName.replace(/\$\{md5\}/g, hash);
		}

		// add the extension
		attachmentName += originalFilePath_parsed.ext;

		const { attachmentsFolderPath } = this.getAttachmentFolder(md_file);
		
		// Ensure the directory exists before moving the file
		if(createFolder) await Utils.createFolderIfNotExists(this.app.vault,attachmentsFolderPath);

		return Utils.joinPaths(attachmentsFolderPath,attachmentName);
	}

	async chooseFileToImport(importSettings: ImportSettingsInterface) {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = markdownView?.editor;

		if (!editor) {
			const msg = "No active markdown editor found.";
			console.error(msg);
			new Notice(msg);
			return;
		}

		const input = document.createElement("input");
		input.type = "file";
		input.multiple = true; // Allow selection of multiple files

		input.onchange = async (e: Event) => {
			const target = e.target as HTMLInputElement;
			const files = target.files; // This is already a FileList

			if (files && files.length > 0) {
				// Directly pass the FileList to the processing function
				await this.moveFileToAttachmentsFolder(Array.from(files), editor, markdownView, importSettings);
			} else {
				const msg = "No files selected or file access error.";
				console.error(msg);
				new Notice(msg);
			}
		};
		input.click(); // Trigger the file input dialog
	}

	// Function to move files to the attachments folder using fs.rename
	async moveFileToAttachmentsFolder(filesToImport: File[], editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface) {

		const { currentNoteFolderPath } = this.getAttachmentFolder();

		const cursor = editor.getCursor(); // Get the current cursor position before insertion

		if (filesToImport.length > 1 && this.settings.multipleFilesImportType != MultipleFilesImportTypes.INLINE) {
			// Check if the cursor is at the beginning of a line
			if (cursor.ch !== 0) {
				// If not, insert a newline before the link
				editor.replaceRange('\n', cursor);
				// You need to explicitly set the cursor to the new position after the newline
				editor.setCursor({ line: cursor.line + 1, ch: 0 });
			}
		}

		const multipleFiles = filesToImport.length > 1;

		const tasks = filesToImport.map(async (fileToImport): Promise<string | null> => {
			const originalFilePath = fileToImport.path;
			let destFilePath = await this.createAttachmentName(originalFilePath,fileToImport,null,true);

			// Check if file already exists in the vault
			const existingFile = await Utils.doesFileExist(this.app.vault,destFilePath);

			// If the original file is already in the vault
			const relativePath = await Utils.getFileInVault(this.vaultPath, originalFilePath)
			if (relativePath) {

				// If they are the same file, then skip copying/moving, we are alrady done
				if (existingFile && Utils.arePathsSameFile(this.app.vault, relativePath, destFilePath)) return destFilePath;

				const modal = new ImportFromVaultChoiceModal(this, originalFilePath, relativePath, importSettings.action);
				modal.open();
				const choice = await modal.promise;
				if (choice == null) { return null; }
				switch (choice) {
					case ImportFromVaultOptions.SKIP:
						return null;
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
				const modal = new OverwriteChoiceModal(this, originalFilePath, destFilePath);
				modal.open();
				const choice = await modal.promise;
				if (choice == null) { return null; }
				switch (choice) {
					case OverwriteChoiceOptions.OVERWRITE:
						// continue
						break;
					case OverwriteChoiceOptions.KEEPBOTH:
						destFilePath = Utils.findNewFilename(this.app.vault,destFilePath);
						break;
					case OverwriteChoiceOptions.SKIP:
						return null;
				}
			}

			console.log(originalFilePath);
			console.log(Utils.joinPaths(this.vaultPath,destFilePath));
	
			try {
				switch (importSettings.action) {
					case ImportActionType.MOVE:
						await fs.rename(originalFilePath, Utils.joinPaths(this.vaultPath,destFilePath));
						return destFilePath;
					case ImportActionType.COPY:
						await fs.copyFile(originalFilePath, Utils.joinPaths(this.vaultPath,destFilePath));
						return destFilePath;
					case ImportActionType.LINK:
					default:
						return relativePath;
				}
			} catch (error) {
				const msg = "Failed to process the file";
				new Notice(msg + ".");
				console.error(msg + ":", originalFilePath, error);
				return null;  // Indicate failure in processing this file
			}
		});

		// Wait for all tasks to complete
		const results = await Promise.all(tasks);

		// Now process the results
		let counter = 0;
		results.forEach((importedFilePath: (string | null)) => {
			if (importedFilePath) {
				this.insertLinkToEditor(currentNoteFolderPath, importedFilePath, editor, view, importSettings, multipleFiles ? ++counter : 0);
			}
		});

		if (counter > 0) {
			let operation = '';
			switch (importSettings.action) {
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

		// // Monkey-path file explorer to hide attachment folders
		// patchFileExplorer(this);
		// return;

		const md_active_file = this.app.workspace.getActiveFile();

		if(!md_active_file) {
			console.error("Cannot open the attachment folder. The user must first select a markdown note.")
			return;
		}

		const attachmentsFolder = this.getAttachmentFolder(Utils.parseFilePath(md_active_file.path));
		
		if (!attachmentsFolder) { return }

		const { attachmentsFolderPath } = attachmentsFolder;

		if (!Utils.doesFolderExist(this.app.vault,attachmentsFolderPath)) {
			const modal = new CreateAttachmentFolderModal(this, attachmentsFolderPath);
			modal.open();
			const choice = await modal.promise;
			if (choice == false) return;
			await Utils.createFolderIfNotExists(this.app.vault,attachmentsFolderPath);
		}

		const absAttachmentsFolderPath = Utils.joinPaths(this.vaultPath,attachmentsFolderPath);

		// Open the folder in the system's default file explorer
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { shell } = require('electron');
		// window.require('electron').remote.shell.showItemInFolder(attachmentsFolder.attachmentsFolderPath);
		shell.openPath(absAttachmentsFolderPath);
	}

	// Function to insert links to the imported files in the editor
	insertLinkToEditor(currentNoteFolderPath: string, importedFilePath: string, editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface, counter: number) {
		// Extract just the file name from the path
		const { filename } = Utils.parseFilePath(importedFilePath);
		
		let relativePath;
		switch (this.settings.linkFormat) {
			case LinkFormat.RELATIVE:
				relativePath = path.relative(currentNoteFolderPath, importedFilePath);
				break;
			case LinkFormat.ABSOLUTE:
			default:
				relativePath = path.relative(this.vaultPath, importedFilePath);
				break;
		}

		// Normalize the path using Obsidian's normalizePath function
		relativePath = normalizePath(relativePath);

		let prefix = '';
		let postfix = '';
		let customDisplay = '';
		if (counter > 0) {
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
					if (counter > 1) {
						// if it is not the first item
						prefix = '\n\n';
					}
					break;
			}
		}
		if (this.settings.customDisplayText) {
			customDisplay = '|' + filename;
		}
		if (importSettings.embed) {
			prefix = prefix + '!';
		}

		const linkText = prefix + '[[' + relativePath + customDisplay + ']]' + postfix;

		const cursor = editor.getCursor();  // Get the current cursor position before insertion

		// Insert the link text at the current cursor position
		editor.replaceRange(linkText, cursor);

		if (counter == 0) {
			if (this.settings.customDisplayText) {
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
		} else {
			const newCursorPos = {
				line: cursor.line,
				ch: cursor.ch + linkText.length
			};

			// Move cursor to the position right after the link
			editor.setCursor(newCursorPos);
		}
	}

	debouncedSaveSettings() {
		// timeout after 250 ms
		const timeout_ms = 250;

		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}

		this.saveTimeout = window.setTimeout(() => {
			this.saveSettings();
			this.saveTimeout = null;
		}, timeout_ms);
	}
}

// Plugin settings tab
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
								if (value != ImportActionType.ASK_USER) {
									this.plugin.settings.lastActionDroppedFilesOnImport = value as ImportActionType;
								}
								await this.plugin.debouncedSaveSettings();
							} else {
								console.error('Invalid import action type:', value);
							}
						})
				});

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
								if (value != ImportActionType.ASK_USER) {
									this.plugin.settings.lastActionPastedFilesOnImport = value as ImportActionType;
								}
								await this.plugin.debouncedSaveSettings();
							} else {
								console.error('Invalid import action type:', value);
							}
						})
				});

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
								if (value != YesNoTypes.ASK_USER) {
									this.plugin.settings.lastEmbedFilesOnImport = value as YesNoTypes;
								}
								await this.plugin.debouncedSaveSettings();
							} else {
								console.error('Invalid option selection:', value);
							}
						})
				});

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
								await this.plugin.debouncedSaveSettings();
							} else {
								console.error('Invalid option selection:', value);
							}
						})
				});

			new Setting(containerEl)
				.setName('Insert display text for links based on filename:')
				.setDesc('If this option is enabled, the basename of the imported document is used as in place of the custom display text.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.customDisplayText)
					.onChange(async (value: boolean) => {
						this.plugin.settings.customDisplayText = value;
						await this.plugin.debouncedSaveSettings(); // Update visibility based on the toggle
					}));

			new Setting(containerEl).setName('Opening').setHeading();

			let key;
			if (Platform.isMacOS) {
				key = '⌘';
			} else { // Default to Windows/Linux bindings
				key = 'Ctrl';
			}

			const validate_exts = (textfield: TextComponent, value: string) => {
				// Process the input string to ensure proper formatting
				const extensions = value.split(',')
					.map(ext => ext.trim())  // Trim spaces from each extension
					.filter(ext => ext !== '') // Remove empty entries
					.map(ext => {
						// Ensure each extension starts with a dot
						if (!ext.startsWith('.')) {
							ext = '.' + ext;
						}
						return ext;
					})
					.filter((ext, index, self) => self.indexOf(ext) === index); // Remove duplicates

				// Join the array into a string with proper separator
				return extensions.join(', ');
			}

			const external_toggle = new Setting(containerEl)
				.setName('Open attachments with default external application:')
				.setDesc(`If this option is enabled, when you open an attachment by holding ${key}, the attachment opens in default external application.`);

			const external_exclude_ext = new Setting(containerEl)
				.setName('Exclude the following extensions:')
				.setDesc('Enter a list of extensions separated by comma (e.g.: .md, .pdf) for which the default Obsidian behavior applies instead of opening the file in the default external application.')
				.addText(text => {
					text.setPlaceholder('Enter a list of extensions');
					text.setValue(this.plugin.settings.openAttachmentExternalExtExcluded);
					text.onChange(async (value: string) => {
						this.plugin.settings.openAttachmentExternalExtExcluded = validate_exts(text, value);
						await this.plugin.debouncedSaveSettings();
					});
					// Event when the text field loses focus
					text.inputEl.onblur = async () => {
						// Validate and process the extensions
						text.setValue(this.plugin.settings.openAttachmentExternalExtExcluded); // Set the processed value back to the text field
					};
				});

			// Initially set the visibility based on the current setting
			external_exclude_ext.settingEl.style.display = this.plugin.settings.openAttachmentExternal ? "" : "none";

			external_toggle.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openAttachmentExternal)
				.onChange(async (value: boolean) => {
					// Hide external_exclude_ext if the toggle is off
					this.plugin.settings.openAttachmentExternal = value;
					await this.plugin.debouncedSaveSettings();
					external_exclude_ext.settingEl.style.display = value ? "" : "none"; // Update visibility based on the toggle
				}));

			if (Platform.isMacOS) {
				key = '⌘+⌥';
			} else { // Default to Windows/Linux bindings
				key = 'Ctrl+Alt';
			}

			const reveal_toggle = new Setting(containerEl)
				.setName("Reveal attachments in system's file manager:")
				.setDesc(`If this option is enabled, when you open an attachment by holding ${key}, the attachment is shown in the system's file manager.`);

			const reveal_exclude_ext = new Setting(containerEl)
				.setName('Exclude the following extensions:')
				.setDesc('Enter a list of extensions separated by comma (e.g.: .md, .pdf) for which the default Obsidian behavior applies instead of revealing the file in the system\'s file manager')
				.addText(text => {
					text.setPlaceholder('Enter a list of extensions');
					text.setValue(this.plugin.settings.revealAttachmentExtExcluded);
					text.onChange(async (value: string) => {
						this.plugin.settings.revealAttachmentExtExcluded = validate_exts(text, value);
						await this.plugin.debouncedSaveSettings();
					});
					// Event when the text field loses focus
					text.inputEl.onblur = async () => {
						// Validate and process the extensions
						text.setValue(this.plugin.settings.revealAttachmentExtExcluded); // Set the processed value back to the text field
					};
				});

			// Initially set the visibility based on the current setting
			reveal_exclude_ext.settingEl.style.display = this.plugin.settings.revealAttachment ? "" : "none";

			reveal_toggle.addToggle(toggle => toggle
				.setValue(this.plugin.settings.revealAttachment)
				.onChange(async (value: boolean) => {
					// Hide reveal_exclude_ext if the toggle is off
					this.plugin.settings.revealAttachment = value;
					await this.plugin.debouncedSaveSettings();
					reveal_exclude_ext.settingEl.style.display = value ? "" : "none";  // Update visibility based on the toggle
				}));
		}

		new Setting(containerEl).setName('Managing').setHeading();

		new Setting(containerEl)
			.setName('Rename the attachment folder automatically and update all links correspondingly:')
			.setDesc('If this option is enabled, when you rename/move an note, if the renamed note has an attachment folder connected to it, \
				its attachment folder is renamed/moved to a new name/location corresponding to the new name of the note.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoRenameAttachmentFolder)
				.onChange(async (value: boolean) => {
					this.plugin.settings.autoRenameAttachmentFolder = value;
					await this.plugin.debouncedSaveSettings();
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
					await this.plugin.debouncedSaveSettings();
				}));

		new Setting(containerEl)
			.setName('Ask confirmation before deleting the attachment folder:')
			.setDesc('If enabled, the user is asked each time whether to delete the attachment folder.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.confirmDeleteAttachmentFolder)
				.onChange(async (value: boolean) => {
					this.plugin.settings.confirmDeleteAttachmentFolder = value;
					await this.plugin.debouncedSaveSettings();
				}));

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
								await this.plugin.debouncedSaveSettings();
							} else {
								console.error('Invalid option selection:', value);
							}
						})
				});

			new Setting(containerEl)
				.setName('Attachment folder where to import new attachments, relative to the default location:')
				.setDesc('Where newly created notes are placed. Use ${notename} as a placeholder for the name of the note.')
				.addText(text => {
					text.setPlaceholder('Enter folder path');
					text.setValue(this.plugin.settings.folderPath);
					text.onChange(async (value: string) => {
						this.plugin.settings.folderPath = value;
						await this.plugin.debouncedSaveSettings();
						this.plugin.parseAttachmentFolderPath();
						updateVisibilityAttachmentFolders(this.plugin);
					})
				});

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
								await this.plugin.debouncedSaveSettings();
							} else {
								console.error('Invalid option selection:', value);
							}
						})
				});

			new Setting(containerEl)
				.setName('Name of the imported attachments:')
				.setDesc(createFragment((frag) => {
					frag.appendText('Choose how to name the imported attachments, using the following variables as a placeholder:');
					frag.createEl('ul')
						.createEl('li', { text: '${original} for the name of the original file' })
						.createEl('li', { text: '${date} for the current date' })
						.createEl('li', { text: '${uuid} for a 128-bit Universally Unique Identifier' })
						.createEl('li', { text: '${md5} for a MD5 hash of the imported file' });
				}))
				.addText(text => {
					text.setPlaceholder('Enter attachment name');
					text.setValue(this.plugin.settings.attachmentName);
					text.onChange(async (value: string) => {
						if (value.trim() == '') {
							value = '${original}'; // TODO: improve checking the input by the user that it is not empty
						}
						this.plugin.settings.attachmentName = value;
						await this.plugin.debouncedSaveSettings();
					})
				});

			new Setting(containerEl)
				.setName('Date format:')
				.setDesc(createFragment((frag) => {
					frag.appendText('Choose the date format, based on ');
					frag.createEl('a', {
						href: 'https://momentjscom.readthedocs.io/en/latest/moment/04-displaying/01-format',
						text: 'momentjs',
					});
					frag.appendText(' syntax.');
				}))
				.addText(text => {
					text.setPlaceholder('Enter date format');
					text.setValue(this.plugin.settings.dateFormat);
					text.onChange(async (value: string) => {
						this.plugin.settings.dateFormat = value;
						await this.plugin.debouncedSaveSettings();
					})
				});
		}

		new Setting(containerEl)
			.setName('Hide attachment folders:')
			.setDesc('If this option is enabled, the attachment folders will not be shown.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideAttachmentFolders)
				.onChange(async (value: boolean) => {
					this.plugin.settings.hideAttachmentFolders = value;
					await this.plugin.debouncedSaveSettings();
					updateVisibilityAttachmentFolders(this.plugin);
				}));
	}
}
