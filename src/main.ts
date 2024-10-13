/* eslint-disable @typescript-eslint/no-inferrable-types */

// Import necessary Obsidian API components
import {
	App,
	MarkdownView,
	FileSystemAdapter,
	Plugin,
	TAbstractFile,
	Platform,
	PluginManifest,
	normalizePath,
    Menu,
    TFile,
    MenuItem,
    EditorPosition,
    WorkspaceWindow,
    WorkspaceLeaf,
    Notice,
} from "obsidian";

// Import utility and modal components
import { CreateAttachmentFolderModal } from './ImportAttachmentsModal';
import {
	ImportActionType,
	ImportAttachmentsSettings,
	AttachmentFolderLocationType,
	isSettingsLatestFormat,
	isSettingsFormat_1_3_0,
	ImportAttachmentsSettings_1_3_0,
    isSupportedMediaTag,
    MediaLabels,
    RelativeLocation,
} from './types';
import * as Utils from "utils";

import { sep, posix } from 'path';

import { patchOpenFile, unpatchOpenFile, addKeyListeners, removeKeyListeners } from 'patchOpenFile';
import { callPromptForDeletion, patchFilemanager, unpatchFilemanager } from 'patchFileManager';

import { patchFileExplorer, unpatchFileExplorer } from "patchFileExplorer";
import { monkeyPatchConsole, unpatchConsole } from "patchConsole";

import * as importFunctions from "importFunctions"
import * as patchObsidianImportFunctions from "patchObsidianImportFunctions"

import { DEFAULT_SETTINGS, DEFAULT_SETTINGS_1_3_0 } from "default";
// import { debug } from "console";

import { ImportAttachmentsSettingTab } from 'settings';
import { debounceFactoryWithWaitMechanism } from "utils";

class DeleteLinkError extends Error {}

// Main plugin class
export default class ImportAttachments extends Plugin {
	settings: ImportAttachmentsSettings = { ...DEFAULT_SETTINGS };
	vaultPath: string;
	public settingsTab: ImportAttachmentsSettingTab;
	public matchAttachmentFolder: ((str:string)=>boolean) = (_:string) => true;

    // mechanism to prevent calling the callback multiple times when renaming attachments associated with a markdown note
    private file_menu_cb_registered: boolean = false;
    private file_menu_embedded_cb_registered_docs:Map<Document, boolean> = new Map<Document, boolean>();

    // Declare class methods that will be initialized in the constructor
    public debouncedSaveSettings: (callback?: () => void) => void;
    public waitForSaveToComplete: () => Promise<void>;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);

		if (process.env.NODE_ENV === "development") {
			monkeyPatchConsole(this);
			console.log("Import Attachments+: development mode including extra logging and debug features");
		}

        // Configure module providing import function
        importFunctions.setPlugin(this);

        // Configure module patching Obisidan import function
        patchObsidianImportFunctions.setPlugin(this);

        // Bind the callback functions
        this.file_menu_cb = this.file_menu_cb.bind(this);
        this.editor_rename_cb = this.editor_rename_cb.bind(this);
        this.context_menu_cb = this.context_menu_cb.bind(this);

        // Set up debounced saving functions
        const timeout_debounced_saving_ms = 100;
        const { debouncedFct, waitFnc } = debounceFactoryWithWaitMechanism(
            async (callback: () => void = (): void => {}) => {
                await this.saveSettings();
                if(callback) callback();
            }, timeout_debounced_saving_ms);
        this.debouncedSaveSettings = debouncedFct;
        this.waitForSaveToComplete = waitFnc;

        // Set up the setting pane
        this.settingsTab = new ImportAttachmentsSettingTab(this.app, this);

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
                        const noteName = normalizePath(Utils.joinPaths(dir,match[1]));
                        return Utils.doesFileExist(this.app.vault,noteName+".md") || Utils.doesFileExist(this.app.vault,noteName+".canvas");
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
			patchObsidianImportFunctions.patchObsidianImportFunctions(this);
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
		// if (Platform.isDesktopApp) {
		// 	this.registerEvent( // check obsidian.d.ts for other types of events
		// 		this.app.workspace.on('editor-drop', importFunctions.editor_drop_cb)
        //     );
		//
        // 	this.registerEvent(
		// 		this.app.workspace.on('editor-paste', importFunctions.editor_paste_cb)
		// 	);
		// }

		this.registerEvent(
			this.app.vault.on('rename', this.editor_rename_cb)
		);
	   
        // Add delete menu in context menu of links
	    this.addDeleteMenuForLinks(this.settings.showDeleteMenu);

        // Register documents
        this.registerDocuments();

		console.log('Loaded plugin Import Attachments+');
	}

    private iterateOverAllDocuments(fnc_cb:((doc:Document)=>void)) {
        this.app.workspace.iterateAllLeaves((leaf:WorkspaceLeaf)=>{
            const doc = leaf.view.containerEl.ownerDocument;
            fnc_cb(doc);
        });
    }

    private registerDocuments() {
        // We first register the current document. It is important to do so
        // because at the launch, there are no leaves yet.
        this.addDeleteMenuForEmbeddedImages(document);

        // We scan through all leaves and look for other open documents.
        // This is important if the plugin is disabled and reenabled, and there multiple
        // windows open.
        this.iterateOverAllDocuments((doc:Document) => {
            if(!this.file_menu_embedded_cb_registered_docs.has(doc)) {
                // Add the doc to the tracked docs by default as unregistered
                this.file_menu_embedded_cb_registered_docs.set(doc,false);
                if(this.settings.showDeleteMenuForEmbedded) {
                    // Add delete menu in context menu of embedded images
                    this.addDeleteMenuForEmbeddedImages(doc);    
                }
            }
        });

        // Add handler to keep track of opened windows
        this.app.workspace.on("window-open", (_:WorkspaceWindow, window:Window) => {
            const doc = window.document;
            if(!this.file_menu_embedded_cb_registered_docs.has(doc)) {
                // Add the doc to the tracked docs
                this.file_menu_embedded_cb_registered_docs.set(doc,false); // we add it to the map by default as unregistered
            }
            if(this.settings.showDeleteMenuForEmbedded) {
                // Add delete menu in context menu of embedded images
                this.addDeleteMenuForEmbeddedImages(doc);    
            }
        });

        // Add handler to keep track of opened windows
        this.app.workspace.on("window-close", (_:WorkspaceWindow, window:Window) => {
            const doc = window.document;
            if(this.file_menu_embedded_cb_registered_docs.has(doc)) {
                // Remove delete menu in context menu of embedded images
                this.removeDeleteMenuForEmbeddedImages(doc);
                // Remove the doc from the tracked docs
                this.file_menu_embedded_cb_registered_docs.delete(doc);
            }
        });
    }

    addCommands() {
        // Command for importing as a standard link
        this.addCommand({
            id: "move-file-to-vault-link",
            name: "Move file to vault as linked attachment",
            callback: () => importFunctions.choose_file_to_import_cb({
                embed: false,
                action: ImportActionType.MOVE,
            }),
        });

        // Command for importing as an embedded image/link
        this.addCommand({
            id: "move-file-to-vault-embed",
            name: "Move file to vault as embedded attachment",
            callback: () => importFunctions.choose_file_to_import_cb({
                embed: true,
                action: ImportActionType.MOVE,
            }),
        });

        // Command for importing as a standard link
        this.addCommand({
            id: "copy-file-to-vault-link",
            name: "Copy file to vault as linked attachment",
            callback: () => importFunctions.choose_file_to_import_cb({
                embed: false,
                action: ImportActionType.COPY,
            }),
        });

        // Command for importing as an embedded image/link
        this.addCommand({
            id: "copy-file-to-vault-embed",
            name: "Copy file to vault as embedded attachment",
            callback: () => importFunctions.choose_file_to_import_cb({
                embed: true,
                action: ImportActionType.COPY,
            }),
        });

        // Register the command to open the attachments folder
        this.addCommand({
            id: "open-attachments-folder",
            name: "Open attachments folder",
            callback: () => this.open_attachments_folder_cb(),
        });
    }

	onunload() {
		// unpatch openFile
		unpatchOpenFile();
		removeKeyListeners();

		// unpatch fileManager
		unpatchFilemanager();

		// unpatch Vault
		patchObsidianImportFunctions.unpatchObsidianImportFunctions();

		// unpatch file-explorer plugin
		unpatchFileExplorer();

		// unpatch console
		unpatchConsole();

        // remove delete menu
        this.addDeleteMenuForLinks(false);

        // remove delete menu for embedded graphics
        this.removeDeleteMenuForEmbeddedImages("all");
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

    addDeleteMenuForEmbeddedImages(doc:Document | "all") {
        const registerDoc = (d:Document) => {
            d.addEventListener("contextmenu", this.context_menu_cb);
            this.file_menu_embedded_cb_registered_docs.set(d,true);
            // console.log("REGISTERED");
            // console.log(d);
        };

        if(doc==="all") {
            this.file_menu_embedded_cb_registered_docs.forEach((status:boolean, d:Document) => {
                if(status===false) {  // then we register it
                    registerDoc(d);
                }
            });
        } else {
            const status = this.file_menu_embedded_cb_registered_docs.get(doc);
            if(status===undefined || status===false) { // then we register it
                registerDoc(doc);
            }
        }
    }

    removeDeleteMenuForEmbeddedImages(doc:Document|"all") {
        const unregisterDoc = (d:Document) => {
            d.removeEventListener("contextmenu", this.context_menu_cb);
            this.file_menu_embedded_cb_registered_docs.set(d,false);
            // console.log("UNREGISTERED");
            // console.log(d);
        };

        if(doc==="all") {
            this.file_menu_embedded_cb_registered_docs.forEach((status:boolean, d:Document) => {
                if(status===true) {  // then we register it
                    unregisterDoc(d);
                }
            });
        } else {
            const status = this.file_menu_embedded_cb_registered_docs.get(doc);
            if(status===true) {
                unregisterDoc(doc);
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
                item.dom.classList.add("is-warning");
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

    async delete_file_cb(file_src:TFile,target?:HTMLElement):Promise<boolean> {
        try {
            // Find the current Markdown editor where the click happened
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if(activeView===null) throw new DeleteLinkError("not active view of type 'MarkdownView' was found");
            const editorView = activeView.editor;
            
            // Get the CodeMirror instance
            const codemirror = editorView.cm;
            const doc = codemirror.state.doc;

            // Get the position at the mouse event's coordinates or at the current cursor
            const cursorIdx = (():number|null => {
                let pos:number|null
                if(target) {
                    pos = codemirror.posAtDOM(target);
                } else {
                    pos = codemirror.state.selection.main.head;  // equivalent to editorView.getCursor()
                }
                if(pos!==null) {
                    pos = Math.clamp(pos,0,doc.length);
                }
                return pos;
            })();

            if(cursorIdx===null) throw new DeleteLinkError("could not determine the link position in the MarkDown note");

            const line = doc.lineAt(cursorIdx);
            const lineContent = line.text;
            
            const position:EditorPosition = {
                line: line.number - 1,
                ch: cursorIdx - line.from
            };

            // Regular expression to match Markdown image/external links
            const regex = /\!?\[\[\s*(.*?)\s*(?:\|.*?)?\]\]|\!?\[.*?\]\(([^\s]+)\)/g;
            let match;

            // Loop through all links in the line
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

                    if (fileInVault && fileInVault !== file_src) {
                        throw new DeleteLinkError(`after parsing the link, file '${file_src.path}' was found in the vault, but does not match with clicked file '${file_src.path}'`);
                    }
                
                    // Delete the file with user prompt
                    const wasDeleted = await callPromptForDeletion(file_src);
                    
                    // Remove the link only if the file was actually deleted by the user and
                    // the user has chosen to remove the link once the file has been deleted
                    if(wasDeleted && this.settings.removeWikilinkOnFileDeletion) {
                        // Replace the range corresponding to the found link with empty string
                        editorView.replaceRange('', { line: line.number - 1, ch: startIdx }, { line: line.number - 1, ch: endIdx });
                    }          

                    // Success              
                    return true;
                }
            }
            throw new DeleteLinkError(`no link was found at the line number ${line.number} containing: ${lineContent}`);
        } catch(err) {
            if(!(err instanceof DeleteLinkError)) {
                // some major, unexpected error occurred
                throw err;
            } else {
                // something went wrong when trying to identify the position of the link in the note
                // sometimes this happens because we are visualizing a Dataview content and there is no real link in the note to be deleted
                console.error(`No matching link found at the click position: ${err.message}`);
                
                // let's finally delete the file despite the fact that we were not able to remove the link
                await callPromptForDeletion(file_src);
            }
        }
        return false;
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

        this.delete_file_cb(fileToBeDeleted,target);
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
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf) {
            const view = activeLeaf.view;
            const viewType = view.getViewType();
            if(viewType != 'markdown') return;
        }
        if(!(evt.target instanceof HTMLElement)) return;
        const target:HTMLElement = evt.target;
        const tagName:string = target.tagName;

        // Check if the right-clicked element is an image
        if (isSupportedMediaTag(tagName)) {
            const parent = target.parentElement;
            if(!parent) return;

            evt.preventDefault(); // Prevent the default context menu

            // Create a new Menu instance
            const menu = new Menu();

            // Add options to the menu
            menu.addItem((item) => {
                item.setTitle(`Delete ${MediaLabels[tagName]}`)
                    .setIcon("trash-2")
                    .setSection("danger")
                    .onClick(() => {
                        this.delete_img_cb(evt,target);
                    });
                item.dom.classList.add("is-warning");
            });

            // Add more context menu items as needed

            // Show the context menu at the mouse position
            menu.showAtMouseEvent(evt);
        }
    }

    async editor_rename_cb(newFile: TAbstractFile, oldPath: string) {
        if (!this.settings.autoRenameAttachmentFolder) return;

            const oldPath_parsed = Utils.parseFilePath(oldPath);
            if (oldPath_parsed.ext !== ".md" && oldPath_parsed.ext !== ".canvas") return;

            const oldAttachmentFolderPath = importFunctions.getAttachmentFolderOfMdNote(oldPath_parsed);
            if (!oldAttachmentFolderPath) return;
            if (Utils.doesFolderExist(this.app.vault,oldAttachmentFolderPath)) {
                const newAttachmentFolderPath = importFunctions.getAttachmentFolderOfMdNote(Utils.parseFilePath(newFile.path));

                const oldPath = oldAttachmentFolderPath;
                const newPath = newAttachmentFolderPath;
                
                try {
                    await this.renameFile(oldPath, newPath);
                } catch (error: unknown) {
                    const msg = 'Failed to rename the attachment folder';
                    console.error(msg);
                    console.error("Original attachment folder:", oldPath);
                    console.error("New attachment folder:", newPath);
                    console.error("Error msg:", error);
                    new Notice(msg + '.');
                }
            }
        
    }

	async open_attachments_folder_cb() {

		// // Monkey-path file explorer to hide attachment folders
		// patchFileExplorer(this);
		// return;

		const md_active_file = this.app.workspace.getActiveFile();

		if(!md_active_file) {
			console.error("Cannot open the attachment folder. The user must first select a markdown note.")
			return;
		}

		const attachmentsFolderPath = importFunctions.getAttachmentFolderOfMdNote(Utils.parseFilePath(md_active_file.path));
		
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
}
