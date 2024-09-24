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
    Menu,
    TFile,
    MenuItem,
    EditorPosition,
} from "obsidian";

// Import utility and modal components
import { ImportActionTypeModal, OverwriteChoiceModal, ImportFromVaultChoiceModal, FolderImportErrorModal, CreateAttachmentFolderModal } from './ImportAttachmentsModal';
import {
	ImportActionType,
	MultipleFilesImportTypes,
	ImportOperationType,
	ImportAttachmentsSettings,
	ImportSettingsInterface,
	OverwriteChoiceOptions,
	ImportFromVaultOptions,
	YesNoTypes,
	RelativeLocation,
	isBoolean,
	isLinkType,
	isAttachmentFolderLocationType,
	AttachmentFolderLocationType,
	ParsedPath,
	isSettingsLatestFormat,
	isSettingsFormat_1_3_0,
	ImportAttachmentsSettings_1_3_0,
    Coordinates,
} from './types';
import * as Utils from "utils";

import { sep, posix } from 'path';

import { promises as fs } from 'fs';  // This imports the promises API from fs

import { patchOpenFile, unpatchOpenFile, addKeyListeners, removeKeyListeners } from 'patchOpenFile';
import { callPromptForDeletion, patchFilemanager, unpatchFilemanager } from 'patchFileManager';

import { patchImportFunctions, unpatchImportFunctions } from "patchImportFunctions";
import { patchFileExplorer, unpatchFileExplorer, updateVisibilityAttachmentFolders } from "patchFileExplorer";
import { monkeyPatchConsole, unpatchConsole } from "patchConsole";

import { DEFAULT_SETTINGS, DEFAULT_SETTINGS_1_3_0 } from "default";
// import { debug } from "console";

import { EditorSelection, Line } from '@codemirror/state';

// Main plugin class
export default class ImportAttachments extends Plugin {
	settings: ImportAttachmentsSettings = { ...DEFAULT_SETTINGS };
	vaultPath: string;
	private settingsTab: ImportAttachmentsSettingTab;
	public matchAttachmentFolder: ((str:string)=>boolean) = (_:string) => true;

    // mechanism to prevent calling the callback multiple times when renaming attachments associated with a markdown note
    private renameCallbackEnabled: boolean = true;
    private file_menu_cb_registered: boolean = false;
    private file_menu_embedded_cb_registered: boolean = false;
    
	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);

		if (process.env.NODE_ENV === "development") {
			monkeyPatchConsole(this);
			console.log("Import Attachments+: development mode including extra logging and debug features");
		}

		this.settingsTab = new ImportAttachmentsSettingTab(this.app, this);

        // Bind the callback functions
        this.file_menu_cb = this.file_menu_cb.bind(this);
        this.editor_drop_cb = this.editor_drop_cb.bind(this);
        this.editor_paste_cb = this.editor_paste_cb.bind(this);
        this.editor_rename_cb = this.editor_rename_cb.bind(this);
        this.context_menu_cb = this.context_menu_cb.bind(this);
        
		// Store the path to the vault
		if (Platform.isDesktopApp) {
			// store the vault path
			const adapter = this.app.vault.adapter;
			if (!(adapter instanceof FileSystemAdapter)) {
				throw new Error("The vault folder could not be determined.");
			}
			// Normalize to POSIX-style path
			this.vaultPath = adapter.getBasePath().split(sep).join(posix.sep);
		} else {
			this.vaultPath = "";
		}
	}

	// Function to split around the original
	parseAttachmentFolderPath() {
		switch(this.settings.attachmentFolderLocation) {
		case AttachmentFolderLocationType.CURRENT:
		case AttachmentFolderLocationType.ROOT:
			this.matchAttachmentFolder = (filePath: string): boolean => {
				return false;
			}
			return;
        case AttachmentFolderLocationType.FOLDER:
        case AttachmentFolderLocationType.SUBFOLDER:
            /* continue */
		}

		const folderPath = this.settings.attachmentFolderPath;
		const placeholder = "${notename}";

		if(folderPath.includes(placeholder)) {
			// Find the index of the first occurrence of the placeholder
			const firstIndex = folderPath.indexOf(placeholder);

			// Find the index of the last occurrence of the placeholder
			const lastIndex = folderPath.lastIndexOf(placeholder);

			// Calculate the starting index of the text after the placeholder
			const endOfPlaceholderIndex = lastIndex + placeholder.length;

			// Extract the parts before the first occurrence and after the last occurrence of the placeholder
            const folderPathStartsWith = folderPath.substring(0, firstIndex)
            const folderPathEndsWith = folderPath.substring(endOfPlaceholderIndex);

            function escapeRegex(string:string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
            }

            // create regex from folder pattern
            const regex = ((template:string) => {
                    const [leftPart, rightPart] = template.split('${notename}');
                    const escapedLeftPart = escapeRegex(leftPart);
                    const escapedRightPart = escapeRegex(rightPart);

                    const regexPattern = `^${escapedLeftPart}(.*?)${escapedRightPart}$`;
                    return new RegExp(regexPattern);
                })(folderPath);

            const isSubfolderSetting = this.settings.attachmentFolderLocation === AttachmentFolderLocationType.SUBFOLDER;

            this.matchAttachmentFolder = (filePath: string): boolean => {
                // Check if filePath starts with startsWidth or contains /startsWidth
                const startsWithMatch = filePath.startsWith(folderPathStartsWith) || filePath.includes(`/${folderPathStartsWith}`);
                // Check if filePath ends with endsWidth
                const endsWithMatch = filePath.endsWith(folderPathEndsWith);
                
                // Check that both conditions are met
                const heuristicMatch = startsWithMatch && endsWithMatch;

                if(heuristicMatch && isSubfolderSetting)
                {
                    const {foldername, dir} = Utils.parseFolderPath(filePath);

                    // Use the match method to get the groups
                    const match = foldername.match(regex);

                    if (match && match[1]) {
                        const noteName = normalizePath(Utils.joinPaths(dir,match[1])+".md");
                        return Utils.doesFileExist(this.app.vault,noteName);
                    } else {
                        // No match found
                        return false;
                    }
                }
                return heuristicMatch;
            };
            return;
        } else {
            switch(this.settings.attachmentFolderLocation) {
            case AttachmentFolderLocationType.FOLDER:
                this.matchAttachmentFolder = (filePath: string): boolean => {
                    return filePath === folderPath;
                }
                return;
            case AttachmentFolderLocationType.SUBFOLDER:
                this.matchAttachmentFolder = (filePath: string): boolean => {
                    return filePath.endsWith(`/${folderPath}`) || filePath === folderPath;
                }
                return;
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
        this.addSettingTab(this.settingsTab);
		
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
			this.addCommands();
		}

		// Register event handlers for drag-and-drop and paste events
		if (Platform.isDesktopApp) {
			this.registerEvent( // check obsidian.d.ts for other types of events
				this.app.workspace.on('editor-drop', this.editor_drop_cb)
            );
		}

		if (Platform.isDesktopApp) {
			this.registerEvent(
				this.app.workspace.on('editor-paste', this.editor_paste_cb)
			);
		}

		this.registerEvent(
			this.app.vault.on('rename', this.editor_rename_cb)
		);
	   
        // Add delete menu in context menu of links
	    this.addDeleteMenuForLinks(this.settings.showDeleteMenu);

        // Add delete menu in context menu of embedded images
        this.addDeleteMenuForEmbeddedImages(this.settings.showDeleteMenuForEmbedded);

		console.log('Loaded plugin Import Attachments+');
	}

    addCommands() {
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

	onunload() {
		// unpatch openFile
		unpatchOpenFile();
		removeKeyListeners();

		// unpatch fileManager
		unpatchFilemanager();

		// unpatch Vault
		unpatchImportFunctions();

		// unpatch file-explorer plugin
		unpatchFileExplorer();

		// unpatch console
		unpatchConsole();

        // remove delete menu
        this.addDeleteMenuForLinks(false);

        // remove delete menu for embedded graphics
        this.addDeleteMenuForEmbeddedImages(false);
	}

    addDeleteMenuForLinks(status:boolean) {
        if(status && !this.file_menu_cb_registered) {
            this.app.workspace.on("file-menu", this.file_menu_cb);
            this.file_menu_cb_registered = true;
        } else {
            if(this.file_menu_cb_registered) {
                this.app.workspace.off("file-menu", this.file_menu_cb);
                this.file_menu_cb_registered = false;
            }
        }
    }

    addDeleteMenuForEmbeddedImages(status:boolean) {
        if(status && !this.file_menu_embedded_cb_registered) {
            // Register context menu for embedded graphics
            document.addEventListener("contextmenu", this.context_menu_cb);
            this.file_menu_embedded_cb_registered = true;
        } else {
            if(this.file_menu_embedded_cb_registered) {
                document.removeEventListener("contextmenu", this.context_menu_cb);
                this.file_menu_embedded_cb_registered = false;
            }
        }
    }

    file_menu_cb(menu: Menu, file: TAbstractFile) {
        if (file instanceof TFile) {
            // Inspect the currently available menu items
            let first_action_menu: MenuItem | null = null;
            let renameMenu: MenuItem | null = null;
            let deleteMenu: MenuItem | null = null;
            for (const item of menu.items) {
                const callback_str = `${item.callback}`;

                if(first_action_menu === null && item.section==='action') {
                    first_action_menu = item
                }
                if (
                    renameMenu === null
                    && callback_str.contains('promptForFileRename')
                    // && item.dom.innerText === "Rename..."  // we avoid using this condition because it relies on English language
                   ) {
                    renameMenu = item;
                }
                if (
                    deleteMenu === null
                    && callback_str.contains('promptForFileDeletion') // when right clicking on the note title
                    // && item.dom.innerText === "Delete file"  // we avoid using this condition because it relies on English language
                   ) {
                    deleteMenu = item;
                }
                if (
                    deleteMenu === null
                    && callback_str.contains('promptForDeletion') // when right clicking on a file in the navigation pane
                    // && item.dom.innerText === "Delete"  // we avoid using this condition because it relies on English language
                   ) {
                    deleteMenu = item;
                }
            }
            if(renameMenu === null) renameMenu = first_action_menu;
            
            if(deleteMenu) {
                // we do nothing if the delete menu is already present
                return;
            }

            // Add "Delete" menu item
            let newDeleteMenu: MenuItem | null = null; 
            menu.addItem((item: MenuItem) => {
                newDeleteMenu = item;
                item
                .setTitle("Delete link and file")
                .setIcon("lucide-trash-2")
                .setSection("danger")
                .onClick((_:MouseEvent | KeyboardEvent)=> {
                    this.delete_file_cb(file);
                });
            });

            const moveDeleteOptionNextToRename = false;
            if(moveDeleteOptionNextToRename) {
                if(renameMenu && newDeleteMenu) { // if we found the rename menu
                    const items = menu.items;

                    // Find the index of renameMenu and deleteMenu
                    const renameMenuIndex = items.indexOf(renameMenu);
                    const deleteMenuIndex = items.indexOf(newDeleteMenu);

                    if (renameMenuIndex !== -1 && deleteMenuIndex !== -1) {
                        // Remove deleteMenu from its current position
                        const [removedDeleteMenu] = items.splice(deleteMenuIndex, 1);
                        // Insert deleteMenu right after renameMenu
                        items.splice(renameMenuIndex + 1, 0, removedDeleteMenu);
                    }
                }
            }
        }
    }

    async delete_file_cb(file_src:TFile,cursorCoordinates?:Coordinates) {
        // Find the current Markdown editor where the click happened
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if(!activeView) return;
        const editorView = activeView.editor;
        if(!editorView) return;

        // Get the CodeMirror instance
        const codemirror = editorView.cm
        const selection = codemirror.state.selection.main;
        const doc = codemirror.state.doc;

        // Get the position at the mouse event's coordinates or at the current cursor
        const cursorIdx = (():number|null => {
            let pos:number|null
            if(cursorCoordinates) {
                pos = codemirror.posAtCoords(cursorCoordinates);
                // it is important to advance by an extra char to make sure we are right inside the link
                if(pos !== null) pos++;
            } else {
                pos = selection.head;  // equivalent to editorView.getCursor()
            }
            if(pos!==null) {
                pos = Math.clamp(pos,0,doc.length);
            }
            return pos;
        })();

        if(!cursorIdx) return;

        const line = doc.lineAt(cursorIdx);
        const lineContent = line.text;
        
        const position:EditorPosition = {
            line: line.number - 1,
            ch: cursorIdx - line.from
        };
        
        // Regular expression to match Markdown image/external links
        // const regex = /\!\[.*?\]\(([^\s]+)\)/g;
        const regex = /\!?\!\[\[\s*(.*?)\s*(?:\|.*?)?\]\]|\!?\[.*?\]\(([^\s]+)\)/g;
        let match;
        let found = false;
        debugger
        // Loop through all matches in the line
        while ((match = regex.exec(lineContent)) !== null) {
            
            const startIdx = match.index;
            const endIdx = startIdx + match[0].length;
            
            // Check if the link encompasses the current position in the line
            // It is certain that that linkPosInLine will be somewhere inside the
            // the link but it is not always at the beginning. So, we can be sure
            // only the link on which we clicked will be removed.
            if (position.ch >= startIdx && position.ch <= endIdx) {
                const fileInVault = (():TFile|null=>{
                    let file_path:string;
                    if (match[1]) {
                        // Wiki link `![[...]]` was matched
                        file_path = match[1];
                    } else { // match[2]
                        // Wiki link `![...](...)` was matched
                        file_path = decodeURIComponent(match[2]);
                    }
                    return this.app.vault.getFileByPath(file_path);

                })();

                if (fileInVault && fileInVault === file_src) {
                    // Delete the file with user prompt
                    const wasDeleted = await callPromptForDeletion(file_src);
                    
                    if(wasDeleted && this.settings.removeWikilinkOnFileDeletion) {
                        // Replace the range corresponding to the found link
                        editorView.replaceRange('', { line: line.number - 1, ch: startIdx }, { line: line.number - 1, ch: endIdx });
                    }
                    found = true;
                    break;
                }
            }
        }
        if (!found) {
            console.error("No matching link found at the click position.");
        }
    }

    async delete_img_cb(evt: MouseEvent, target:HTMLElement) {
        // Get a TFile reference from the clicked HTML element 
        const fileToBeDeleted:TFile|null = (():TFile|null=>{
            const parent = target.parentElement;
            if(!parent) return null;
            const src = parent.getAttribute("src");
            if(!src) return null;
            const fileInVault = this.app.vault.getFileByPath(src);
            return fileInVault;
        })();

        if(!fileToBeDeleted) return;

        this.delete_file_cb(fileToBeDeleted,evt);
    }

	async loadSettings() {

		const getSettingsFromData = (data:unknown): unknown =>
		{
			if (isSettingsLatestFormat(data)) {
				const settings: ImportAttachmentsSettings = data;
				return settings;
			} else if (isSettingsFormat_1_3_0(data)) { // previous versions where the name of the plugins was not stored
				const oldSettings:ImportAttachmentsSettings_1_3_0 = Object.assign({}, DEFAULT_SETTINGS_1_3_0, data);

				const folderPath = oldSettings.folderPath;
				const relativeLocation = oldSettings.relativeLocation;

				let attachmentFolderLocation:AttachmentFolderLocationType;
				switch(relativeLocation) {
				case RelativeLocation.SAME:
					attachmentFolderLocation = AttachmentFolderLocationType.SUBFOLDER;
					break;
				case RelativeLocation.VAULT:
					attachmentFolderLocation = AttachmentFolderLocationType.ROOT;
					break;
				}
				const attachmentFolderPath = folderPath;

				// Exclude folderPath and relativeLocation from oldSettings
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { folderPath: _, relativeLocation: __, linkFormat: ___, ...filteredOldSettings } = oldSettings;
				
				// Update the data with the new format
				const newSettings: ImportAttachmentsSettings = {
					...filteredOldSettings,
					attachmentFolderPath: attachmentFolderPath,
					attachmentFolderLocation: attachmentFolderLocation,
					compatibility: '1.4.0',
				};
				return getSettingsFromData(newSettings);
			}
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, getSettingsFromData(await this.loadData()));
		delete this.settings.logs;
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

	async trashFile(file: TAbstractFile): Promise<void> {
		try {
			if (file instanceof TAbstractFile) {
				await this.app.vault.adapter.trashSystem(file.path);
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

    context_menu_cb(evt: MouseEvent) {
        if(!(evt.target instanceof HTMLElement)) return;
        const target:HTMLElement = evt.target;

        // Check if the right-clicked element is an image
        if (target.tagName === 'IMG') {
            const parent = target.parentElement;
            if(!parent) return;

            evt.preventDefault(); // Prevent the default context menu

            // Create a new Menu instance
            const menu = new Menu();

            // Add options to the menu
            menu.addItem((item) => {
                item.setTitle("Delete image")
                    .setIcon("trash-2")
                    .setSection("danger")
                    .onClick(() => {
                        this.delete_img_cb(evt,target);
                    });
            });

            // Add more context menu items as needed

            // Show the context menu at the mouse position
            menu.showAtMouseEvent(evt);
        }
    }

    async editor_rename_cb(newFile: TAbstractFile, oldPath: string) {
        if (!this.settings.autoRenameAttachmentFolder) { return }

            const oldPath_parsed = Utils.parseFilePath(oldPath);
            if (oldPath_parsed.ext !== ".md") { return }

            const oldAttachmentFolderPath = this.getAttachmentFolderOfMdNote(oldPath_parsed);
            if (!oldAttachmentFolderPath) { return }
            if (Utils.doesFolderExist(this.app.vault,oldAttachmentFolderPath)) {
                const newAttachmentFolderPath = this.getAttachmentFolderOfMdNote(Utils.parseFilePath(newFile.path));

                const oldPath = oldAttachmentFolderPath;
                const newPath = newAttachmentFolderPath;
                
                try {
                    this.renameCallbackEnabled = false;
                    await this.renameFile(oldPath, newPath);
                } catch (error: unknown) {
                    const msg = 'Failed to rename the attachment folder';
                    console.error(msg);
                    console.error("Original attachment folder:", oldPath);
                    console.error("New attachment folder:", newPath);
                    console.error("Error msg:", error);
                    new Notice(msg + '.');
                } finally {
                    this.renameCallbackEnabled = true;
                }
            }
        
    }

    async editor_paste_cb(evt: ClipboardEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) {
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
                    evt.preventDefault();

                    const doToggleEmbedPreference = false; // Pretend shift was not pressed
                    this.handleFiles(filesArray, editor, view, doToggleEmbedPreference, ImportOperationType.PASTE);
                } else {
                    // TODO Process images from clipboard
                    //
                    // const t = Array.from(files);
                    // console.log(t);
                    // console.log(clipboardData);
                    // console.log(clipboardData.dropEffect);
                    // console.log(clipboardData.files);
                    // console.log(clipboardData.items);
                    // console.log(clipboardData.types);
                    // const arrayBuffer = await t[0].arrayBuffer();
                    // fs.appendFile("/Users/andrea/Downloads/tst.png", Buffer.from(arrayBuffer));
                }
            }
            // console.error("No files detected in paste data.");
        }
    }

    async editor_drop_cb(evt: DragEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) {
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
            const dropPos = editor.cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
            
            if(dropPos===null) {
                console.error('Unable to determine drop position');
                return;
            }
            
            // Get the current selection
            const user_selection = editor.cm.state.selection;
            // const user_selection_alt = codemirror.viewState.state.selection;
            const user_selection_main = user_selection.main;
            
             // Check if there is selected text
            const isTextSelected = !user_selection_main.empty;
            const selectionStart = user_selection_main.from;
            const selectionEnd = user_selection_main.to;
            
            // Check if the drop position is within the selected text range
            const isDropWithinSelection = isTextSelected && dropPos >= selectionStart && dropPos <= selectionEnd;

            if(!isDropWithinSelection) {
                // If the drop position is not in the current selection, we redefine the current selection to the new drop position
                editor.cm.dispatch({
                    selection: EditorSelection.single(dropPos)
                });
            }
            
            // Handle the files as per your existing logic
            this.handleFiles(Array.from(files), editor, view, doForceAsking, ImportOperationType.DRAG_AND_DROP);
        
        } else {
            console.error('No files dropped');
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
			this.settingsTab.debouncedSaveSettings();
		}

		const doEmbed = (embedOption == YesNoTypes.YES);

		const importSettings = {
			embed: doEmbed,
			action: actionFilesOnImport,
		};

		this.moveFileToAttachmentsFolder(nonFolderFilesArray, editor, view, importSettings);
	}

	// Get attachment folder path based on current note
	getAttachmentFolderOfMdNote(md_file?: ParsedPath | undefined): string {	
		// Get the current active note if md_file is not provided
		if (md_file===undefined) {
			const md_active_file = this.app.workspace.getActiveFile();
			if (md_active_file === null) {
				throw new Error("The active note could not be determined.");
			}
			md_file = Utils.parseFilePath(md_active_file.path);
		}

		if (md_file.ext !== ".md") {
			throw new Error("No Markdown file was provided.");
		}
		
		const currentNoteFolderPath = md_file.dir;
		const notename = md_file.filename;

		const folderPath = this.settings.attachmentFolderPath.replace(/\$\{notename\}/g, notename);

		let attachmentsFolderPath;
		switch(this.settings.attachmentFolderLocation) {
		case AttachmentFolderLocationType.CURRENT:
			attachmentsFolderPath = currentNoteFolderPath;
			break;
		case AttachmentFolderLocationType.SUBFOLDER:
			attachmentsFolderPath = Utils.joinPaths(currentNoteFolderPath, folderPath)
			break;
		case AttachmentFolderLocationType.ROOT:
			attachmentsFolderPath = '/';
			break;
		case AttachmentFolderLocationType.FOLDER:
			attachmentsFolderPath = folderPath
			break;
		}

		attachmentsFolderPath = normalizePath(attachmentsFolderPath);

		return attachmentsFolderPath;			
	}

	async createAttachmentName(originalFilePath:string, data: File | ArrayBuffer, md_file?: ParsedPath | undefined): Promise<string> {

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

		const attachmentsFolderPath = this.getAttachmentFolderOfMdNote(md_file);
		
		// Ensure the directory exists before moving the file
		await Utils.createFolderIfNotExists(this.app.vault,attachmentsFolderPath);

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

		// Get the current active note if md_file is not provided
		// const md_active_file = this.app.workspace.getActiveFile();
		// if (md_active_file == null) {
		// 	throw new Error("The active note could not be determined.");
		// }

		const md_file = view.file;
		if(md_file===null) { throw new Error("The active note could not be determined."); }

		const md_file_parsed = Utils.parseFilePath(md_file.path)

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
			let destFilePath = await this.createAttachmentName(originalFilePath,fileToImport,md_file_parsed);

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
				this.insertLinkToEditor(importedFilePath, editor, md_file.path, importSettings, multipleFiles ? ++counter : undefined);
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

		const attachmentsFolderPath = this.getAttachmentFolderOfMdNote(Utils.parseFilePath(md_active_file.path));
		
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
		require('electron').remote.shell.openPath(Utils.makePosixPathOScompatible(absAttachmentsFolderPath));
	}

	// Function to insert links to the imported files in the editor
	insertLinkToEditor(importedFilePath: string, editor: Editor, md_file: string, importSettings: ImportSettingsInterface, counter?: number) {

		/*
		let relativePath;
		switch (this.settings.linkFormat) {
			case LinkFormat.RELATIVE:
				relativePath = relative(currentNoteFolderPath, importedFilePath);
				break;
			case LinkFormat.ABSOLUTE:
			default:
				relativePath = relative(this.vaultPath, importedFilePath);
				break;
		}
		*/

		let prefix = '';
		let postfix = '';
		if (counter) {
            // if multiple files are imported
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

        // Get the current selection
        const main_selection = editor.cm.state.selection.main;
        
    	const file = Utils.createMockTFile(this.app.vault,importedFilePath);
		const filename = file.name;
		const customDisplayText = (():string=>{
            let text="";
            if(this.settings.customDisplayText) {
                text = filename;
            }
            // if a single file is imported
            if(!counter)
            {
                if(this.settings.useSelectionForDisplayText) {
                    // Extract the selected text
                    // const selectedText_alt = editor.getSelection();
                    const selectedText = editor.cm.state.doc.sliceString(main_selection.from, main_selection.to);
                    
                    // If the user has selected some text, this will be used for the display text 
                    if(selectedText.length>0) text = selectedText;
                }
            }
            return text;
        })();
		
		const generatedLink = this.app.fileManager.generateMarkdownLink(file,md_file,undefined,(this.settings.customDisplayText) ? customDisplayText : undefined);

		const MDLink_regex = new RegExp('^(!)?(\\[[^\\]]*\\])(.*)$');
		const WikiLink_regex = new RegExp('^(!)?(.*?)(|[^|]*)?$');
		
		const useMarkdownLinks = this.app.vault.getConfig("useMarkdownLinks");

		let offset;
		let processedLink;
		let selectDisplayedText = false;
		if(useMarkdownLinks) { // MD links
			// Perform the match
			const match = generatedLink.match(MDLink_regex);

			offset = generatedLink.length;
			processedLink = generatedLink;
			if(match) {
				offset = 1;
				processedLink = "[" + customDisplayText + "]" + match[3];
				selectDisplayedText = true;
			}
		} else { // Wiki links
			// Perform the match
			const match = generatedLink.match(WikiLink_regex);

			offset = generatedLink.length;
			processedLink = generatedLink;
			if(match) {
				offset = match[2].length;
				processedLink = match[2] + (match[3] ? match[3] : "");
				selectDisplayedText = true;
			}
		}

		if (importSettings.embed) {
			prefix = prefix + '!';
		}

		const linkText = prefix + processedLink + postfix;

		const cursor_from = editor.getCursor("from");  // Get the current cursor position before insertion
        const cursor_to = editor.getCursor("to");  // Get the current cursor position before insertion
        
        // Insert the link text at the current cursor position
		editor.replaceRange(linkText, cursor_from, cursor_to);

		if (counter == 0) {
			if (selectDisplayedText) {
				// Define the start and end positions for selecting 'baseName' within the inserted link
				const startCursorPos = {
					line: cursor_to.line,
					ch: cursor_to.ch + offset + prefix.length,
				};
				const endCursorPos = {
					line: cursor_to.line,
					ch: startCursorPos.ch + customDisplayText.length,
				};
				
				// Set the selection range to highlight 'baseName'
				editor.setSelection(startCursorPos, endCursorPos);
			} else {
				const newCursorPos = {
					line: cursor_to.line,
					ch: cursor_to.ch + linkText.length
				};

				// Move cursor to the position right after the link
				editor.setCursor(newCursorPos);
			}
		} else {
			const newCursorPos = {
				line: cursor_from.line,
				ch: cursor_from.ch + linkText.length
			};

			// Move cursor to the position right after the link
			editor.setCursor(newCursorPos);
		}
	}
}

// Plugin settings tab
class ImportAttachmentsSettingTab extends PluginSettingTab {
	plugin: ImportAttachments;

	private saveTimeout: number | null = null;

	constructor(app: App, plugin: ImportAttachments) {
		super(app, plugin);
		this.plugin = plugin;
	}

	debouncedSaveSettings(fnc?:(()=>void) | undefined) {
		// timeout after 250 ms
		const timeout_ms = 50;

		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}

		this.saveTimeout = window.setTimeout(() => {
			if(fnc===undefined) {
				this.plugin.saveSettings();
			} else {
				fnc.call(this);
			}
			this.saveTimeout = null;
		}, timeout_ms);
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
								this.debouncedSaveSettings();
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
								this.debouncedSaveSettings();
							} else {
								console.error('Invalid import action type:', value);
							}
						})
				});

			new Setting(containerEl)
				.setName('Embed imported documents:')
				.setDesc('With this option enabled, the files are imported as an embedded document; if it is deactivated, they are imported as a linked document.  By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.')
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
								this.debouncedSaveSettings();
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
								this.debouncedSaveSettings();
							} else {
								console.error('Invalid option selection:', value);
							}
						})
				});

			new Setting(containerEl)
				.setName('Use the filename for the displayed text:')
				.setDesc('With this option enabled, the filename of the imported document is used as the display text.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.customDisplayText)
					.onChange(async (value: boolean) => {
						this.plugin.settings.customDisplayText = value;
						this.debouncedSaveSettings(); // Update visibility based on the toggle
					}));

            new Setting(containerEl)
                .setName('Use the selected text for the displayed text:')
                .setDesc('With this option enabled, the selected text is replaced by the link to the imported document \
                    and the same selected text is automatically used as the display text for the link. This option \
                    takes priority over the filename as displayed text. Moreover, this option is ignored for multiple imported attachments.')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.useSelectionForDisplayText)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.useSelectionForDisplayText = value;
                        this.debouncedSaveSettings(); // Update visibility based on the toggle
                    }));

			const wikilinksSetting = new Setting(containerEl)
				.setName('Use [[Wikilinks]]:')
				.setDesc(createFragment((frag) => {
					frag.appendText('Auto-generate Wikilinks for [[links]] and [[images]] instead of Markdown links and images. Disable this option to generate Markdown links instead. ');
					this.addWarningGeneralSettings(frag);
				}));
			wikilinksSetting.addToggle(toggle => {
				const useMarkdownLinks = this.app.vault.getConfig("useMarkdownLinks");
				if (!isBoolean(useMarkdownLinks)) {
					wikilinksSetting.settingEl.remove();
					return;
				}
				toggle.setValue(!useMarkdownLinks)
					.onChange(async (value: boolean) => {
						this.app.vault.setConfig("useMarkdownLinks", !value);
					});
			});
		

			const newLinkFormatSetting = new Setting(containerEl)
				.setName('New link format:')
				.setDesc(createFragment((frag) => {
					frag.appendText('What links to insert when auto-generating internal links. ');
					this.addWarningGeneralSettings(frag);
				}))
			newLinkFormatSetting.addDropdown(dropdown => {
				const newLinkFormat = this.app.vault.getConfig("newLinkFormat");
				if (!isLinkType(newLinkFormat)) {
					newLinkFormatSetting.settingEl.remove();
					return;
				}
				
				dropdown.addOption('shortest', 'Shortest path when possible');
				dropdown.addOption('relative', 'Relative path to note');
				dropdown.addOption('absolute', 'Absolute path in vault');
				dropdown.setValue(newLinkFormat)
					.onChange(async (value: string) => {
						if (isLinkType(value)) {
							this.app.vault.setConfig("newLinkFormat", value);
						} else {
							console.error('Invalid option selection:', value);
						}
					})
				});

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
				.setDesc(`With this option enabled, when you open an attachment by holding ${key}, the attachment opens in default external application.`);

			const external_exclude_ext = new Setting(containerEl)
				.setName('Exclude the following extensions:')
				.setDesc('Enter a list of extensions separated by comma (e.g.: .md, .pdf) for which the default Obsidian behavior applies instead of opening the file in the default external application.')
				.addText(text => {
					text.setPlaceholder('Enter a list of extensions');
					text.setValue(this.plugin.settings.openAttachmentExternalExtExcluded);
					text.onChange(async (value: string) => {
						this.plugin.settings.openAttachmentExternalExtExcluded = validate_exts(text, value);
						this.debouncedSaveSettings();
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
					this.debouncedSaveSettings();
					external_exclude_ext.settingEl.style.display = value ? "" : "none"; // Update visibility based on the toggle
				}));

			if (Platform.isMacOS) {
				key = '⌘+⌥';
			} else { // Default to Windows/Linux bindings
				key = 'Ctrl+Alt';
			}

			const reveal_toggle = new Setting(containerEl)
				.setName("Reveal attachments in system's file manager:")
				.setDesc(`With this option enabled, when you open an attachment by holding ${key}, the attachment is shown in the system's file manager.`);

			const reveal_exclude_ext = new Setting(containerEl)
				.setName('Exclude the following extensions:')
				.setDesc('Enter a list of extensions separated by comma (e.g.: .md, .pdf) for which the default Obsidian behavior applies instead of revealing the file in the system\'s file manager')
				.addText(text => {
					text.setPlaceholder('Enter a list of extensions');
					text.setValue(this.plugin.settings.revealAttachmentExtExcluded);
					text.onChange(async (value: string) => {
						this.plugin.settings.revealAttachmentExtExcluded = validate_exts(text, value);
						this.debouncedSaveSettings();
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
					this.debouncedSaveSettings();
					reveal_exclude_ext.settingEl.style.display = value ? "" : "none";  // Update visibility based on the toggle
				}));
		}

		new Setting(containerEl).setName('Managing').setHeading();

         const embedded_delete_menu_setting = new Setting(containerEl)
            .setName('Show option in context menu of embedded images to delete them:')
            .setDesc("With this option enabled, when you right click on an embedded image in your note, an option 'Delete image' \
                will be shown in the context menu.")
            .addToggle(toggle => {
                toggle
                .setValue(this.plugin.settings.showDeleteMenuForEmbedded)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.showDeleteMenuForEmbedded = value;
                    this.plugin.addDeleteMenuForEmbeddedImages(value);
                    this.debouncedSaveSettings();
                })
            });

        const delete_menu_setting = new Setting(containerEl)
            .setName('Show option in context menu to delete attachment files:')
            .setDesc("With this option enabled, when you right click on a Wikilink in your note, an 'Delete file' \
                will be shown in the context menu.")
            .addToggle(toggle => {
                toggle
                .setValue(this.plugin.settings.showDeleteMenu)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.showDeleteMenu = value;
                    this.plugin.addDeleteMenuForLinks(value);
                    this.debouncedSaveSettings();
                })
            });
            
        const remove_wikilink_setting = new Setting(containerEl)
            .setName('Remove Wikilink when deleting an attachment file:')
            .setDesc("With this option enabled, when you right click on a Wikilink or MarkDown link in your note to delete the attachment, \
                not only the attachment will be deleted, but also the Wikilink or MarkDown link, respectively, will be removed from your note.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.removeWikilinkOnFileDeletion)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.removeWikilinkOnFileDeletion = value;
                    this.debouncedSaveSettings();
                }));

        // const update_visibilty_remove_wikilink = (status:boolean) => {
        //     if(status) {
        //         remove_wikilink_setting.settingEl.style.display='';
        //     } else {
        //         remove_wikilink_setting.settingEl.style.display='none';
        //     }
        // }
        // 
        // update_visibilty_remove_wikilink(this.plugin.settings.showDeleteMenu);
    

        new Setting(containerEl)
            .setName('Automatically remove attachment folders when empty:')
            .setDesc("With this option enabled, after deleting an attachment, the plugin will check if the attachments folder \
                is now empty, and if it is, it will delete the attachments folder as well.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.deleteAttachmentFolderWhenEmpty)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.deleteAttachmentFolderWhenEmpty = value;
                    this.debouncedSaveSettings();
                }));

		new Setting(containerEl)
			.setName('Rename the attachment folder automatically and update all links correspondingly:')
			.setDesc('With this option enabled, when you rename/move an note, if the renamed note has an attachment folder connected to it, \
				its attachment folder is renamed/moved to a new name/location corresponding to the new name of the note.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoRenameAttachmentFolder)
				.onChange(async (value: boolean) => {
					this.plugin.settings.autoRenameAttachmentFolder = value;
					this.debouncedSaveSettings();
				}));

		new Setting(containerEl)
			.setName('Delete the attachment folder automatically when the corresponding note is deleted:')
			.setDesc('With this option enabled, when you delete a note, if the deleted note has an attachment folder connected to it, \
				its attachment folder will be deleted as well. \
				Note: automatic deletion only works when the name of the attachment folder contains ${notename}.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoDeleteAttachmentFolder)
				.onChange(async (value: boolean) => {
					this.plugin.settings.autoDeleteAttachmentFolder = value;
					await this.debouncedSaveSettings();
				}));

		new Setting(containerEl)
			.setName('Ask confirmation before deleting the attachment folder:')
			.setDesc('If enabled, the user is asked each time whether to delete the attachment folder.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.confirmDeleteAttachmentFolder)
				.onChange(async (value: boolean) => {
					this.plugin.settings.confirmDeleteAttachmentFolder = value;
					await this.debouncedSaveSettings();
				}));

		new Setting(containerEl).setName('Attachment folder').setHeading();

		if (Platform.isDesktopApp) {
			this.addAttachmentFolderSettings(containerEl);
		}

		new Setting(containerEl)
			.setName('Hide attachment folders:')
			.setDesc('With this option enabled, the attachment folders will not be shown.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideAttachmentFolders)
				.onChange(async (value: boolean) => {
					this.plugin.settings.hideAttachmentFolders = value;
					await this.debouncedSaveSettings();
					updateVisibilityAttachmentFolders(this.plugin);
				}));

		if (Platform.isDesktopApp) {
			new Setting(containerEl).setName('Attachments').setHeading();

			new Setting(containerEl)
				.setName('Name of the imported attachments:')
				.setDesc(createFragment((frag) => {
					frag.appendText('Choose how to name the imported attachments, using the following variables as a placeholder:');
					const ul = frag.createEl('ul');
					ul.createEl('li', { text: '${original} for the name of the original file' });
					ul.createEl('li', { text: '${date} for the current date' })
					ul.createEl('li', { text: '${uuid} for a 128-bit Universally Unique Identifier' })
					ul.createEl('li', { text: '${md5} for a MD5 hash of the imported file' });
				}))
				.addText(text => {
					text.setPlaceholder('Enter attachment name');
					text.setValue(this.plugin.settings.attachmentName);
					text.onChange(async (value: string) => {
						if (value.trim() == '') {
							value = '${original}'; // TODO: improve checking the input by the user that it is not empty
						}
						this.plugin.settings.attachmentName = value;
						await this.debouncedSaveSettings();
					})
				});

			new Setting(containerEl)
				.setName('Date format for files:')
				.setDesc(createFragment((frag) => {
					frag.appendText('Choose the date format for the placeholder ${date} in the attachment name, based on ');
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
						await this.debouncedSaveSettings();
					})
				});
		}

	}

	cleanUpAttachmentFolderSettings(): void {
		let folderPath = normalizePath(this.plugin.settings.attachmentFolderPath).replace(/^(\.\/)*\.?/,'');  // map ./././path1/path2 to path1/path2

		if(this.plugin.settings.attachmentFolderLocation === AttachmentFolderLocationType.FOLDER) {
			if(folderPath=='/') {
				this.plugin.settings.attachmentFolderLocation = AttachmentFolderLocationType.ROOT;
			}
		}

		if(this.plugin.settings.attachmentFolderLocation === AttachmentFolderLocationType.SUBFOLDER) {
			if(folderPath=='/') {
				this.plugin.settings.attachmentFolderLocation = AttachmentFolderLocationType.CURRENT;
			}
		}
	}

	hide(): void {
		this.cleanUpAttachmentFolderSettings();
	}

	addAttachmentFolderSettings(containerEl:HTMLElement): void  {

		this.cleanUpAttachmentFolderSettings();

		const attachmentFolderLocationSetting = new Setting(containerEl)
			.setName('Default location for new attachments:')
			.setDesc(createFragment((frag) => {
				frag.appendText('Where newly added attachments are placed.');
			}));

		const attachmentFolderSetting = new Setting(containerEl)
			.setName('Attachment folder path:')
			.setDesc(createFragment((frag) => {
				frag.appendText('Place newly created attachment files, such as images created via drag-and-drop or audio recordings, in this folder.  Use the following variables as a placeholder:');
				const ul = frag.createEl('ul');
				ul.createEl('li', { text: '${notename} for the name of the original file' });
			})).addText(text => {
				text.setPlaceholder('Example: folder 1/folder');
				text.setValue(this.plugin.settings.attachmentFolderPath);
				text.onChange(async (value: string) => {
					this.plugin.settings.attachmentFolderPath = value;
					this.debouncedSaveSettings(():void => {
						this.plugin.saveSettings();
						this.plugin.parseAttachmentFolderPath();
						updateVisibilityAttachmentFolders(this.plugin);
					});
				})
		});

		attachmentFolderLocationSetting.addDropdown(dropdown => {
			const updateVisibilityFolderPath = (folderLocation:AttachmentFolderLocationType):void => {
				switch(folderLocation) {
				case AttachmentFolderLocationType.ROOT:
				case AttachmentFolderLocationType.CURRENT:
					attachmentFolderSetting.settingEl.style.display = 'none';
					break;
				case AttachmentFolderLocationType.FOLDER:
				case AttachmentFolderLocationType.SUBFOLDER:
					attachmentFolderSetting.settingEl.style.display = '';
					break;
				}
			}

			dropdown.addOption(AttachmentFolderLocationType.ROOT, 'Vault folder');
			dropdown.addOption(AttachmentFolderLocationType.FOLDER, 'In the folder specified below');
			dropdown.addOption(AttachmentFolderLocationType.CURRENT, 'Same folder as current file');
			dropdown.addOption(AttachmentFolderLocationType.SUBFOLDER, 'In subfolder under current folder');

			dropdown.setValue(this.plugin.settings.attachmentFolderLocation);
			updateVisibilityFolderPath(this.plugin.settings.attachmentFolderLocation);
									
			dropdown.onChange(async (value: string) => {
				if(!isAttachmentFolderLocationType(value)) {
					console.error('Invalid option selection:', value);
					return;
				}

				this.plugin.settings.attachmentFolderLocation = value;
				updateVisibilityFolderPath(value);
			
				this.debouncedSaveSettings(():void => {
					this.plugin.saveSettings();
					this.plugin.parseAttachmentFolderPath();
					updateVisibilityAttachmentFolders(this.plugin);
				});
			})
		});

	}

	addWarningGeneralSettings(frag: DocumentFragment): HTMLElement {
		// Create the warning span
		const warning = frag.createSpan({text: 'Be aware that this setting is a mirror of the corresponding setting in the vault preference pane ', cls: "mod-warning" });
		
		// Create the link
		const link = warning.createEl('a', { text: 'Files and links', href: '#' });
		link.id = 'file-link-settings';
		
		// Add event listener to the link
		link.addEventListener('click', (e) => {
			e.preventDefault();
			this.app.setting.openTabById('file');
		});

		warning.appendText('. Any change made here is carried over to the general setting and viceversa.');

		return warning;
	}
}
