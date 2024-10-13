// obsidian-augment.d.ts

import 'obsidian';
import { EditorView } from '@codemirror/view';

declare module 'obsidian' {

    interface EditorManager {
        app: App;  // The Obsidian app instance
        containerEl: HTMLElement;  // The main container element for the embed
        editorEl: HTMLElement;  // Element that contains the editor
        previewEl: HTMLElement;  // Element that contains the preview content
        editable: boolean;  // Indicates whether the embed is in editable mode
        file: TFile | null;  // The file associated with the embed, or `null` if none
        text: string;  // The text content of the embed

        // Methods
        load(): void;  // Load the embed content
        showEditor(): void;  // Display the editor for the embed
        unload(): void;  // Unload the embed and clean up resources

        editMode: EditMode;
    }

    interface EditMode {
        clipboardManager: ClipboardManager;
    }

    interface ClipboardManager {
        getPath(): string;  // Retrieves the path associated with the clipboard manager
        handlePaste(event: ClipboardEvent): boolean;  // Handles paste events in the editor
        handleDragOver(event: DragEvent): void;  // Handles drag-over events in the editor
        handleDrop(event: DragEvent): boolean;  // Handles file drops into the editor
        handleDropIntoEditor(event: DragEvent): string | null;  // Handles dropping content directly into the editor
        handleDataTransfer(data: DataTransfer): string | null;  // Handles data transfer (e.g., files or text) during a drag or paste
        insertFiles(files: Attachment[]): Promise<void>;  // Inserts files into the editor
        saveAttachment(
            name: string, 
            extension: string, 
            data: ArrayBuffer | string, 
            isLastFile: boolean
        ): Promise<void>;  // Saves an attachment to the vault or editor
        insertAttachmentEmbed(file: TFile|null, isLastFile: boolean): void;  // Inserts an attachment embed into the editor
    }

    interface EmbedContainer {
        app: App;  // The Obsidian app instance
        containerEl: HTMLElement;  // The HTML element where the embed is rendered
        state: Record<string, any>;  // The state associated with the embed (can be empty or contain data)
    }

    interface EmbedByExtension {
       [extension: string]: (arg1:EmbedContainer, arg2:TFile|null, arg3?:any) => EditorManager;
    }

    interface EmbedRegistry {
        embedByExtension: EmbedByExtension;
    }

    interface DraggableObject {
        type: string;          // The type of the draggable item (in this case, 'file')
        icon: string;          // The icon associated with the draggable item (likely used for UI)
        title: string;         // The name or title of the item being dragged
        file: TFile;           // The actual file object being dragged
        source?: string;       // The source of the drag (could be undefined or e.g. bookmarks)
    }

    interface DragManager {
        draggable: DraggableObject | null;
    }

    interface Attachment {
        name: string;        // The name of the attachment (e.g., "image.png")
        extension: string;   // The file extension (e.g., "png", "jpg")
        filepath?: string;   // The path of the file, if it already exists
        data?: ArrayBuffer;  // The binary data of the attachment (if it's a new file)
    }

    interface TFolder {
        getParentPrefix(): string;
    }

	interface App {
		openWithDefaultApp(filepath: string): Promise<void>;
		saveAttachment(fileName: string, fileExtension: string, fileData: ArrayBuffer): Promise<TFile>;
        importAttachments(attachments: Attachment[], targetFolder: TFolder | null): Promise<TFile[]>;
		internalPlugins: InternalPlugins;
		plugins: Plugins;
		setting: Setting;
        dragManager: DragManager;
        embedRegistry: EmbedRegistry;
	}

	interface Plugins {
		manifests: Record<string, PluginManifest>;
		plugins: Record<string, Plugin>;
		getPlugin(id: string): Plugin;
		uninstallPlugin(pluginId: string): Promise<void>;
    }

	interface InternalPlugins {
		plugins: Record<string, Plugin>;
		getPluginById(id: string): Plugin;
	}

	interface Plugin {
		views: { [viewType: string]: (leaf: WorkspaceLeaf) => View };
	}

	interface Vault {
		getConfig(configName: string): unknown;
		setConfig(configName: string, value: unknown): void;
		getAvailablePathForAttachments(fileName: string, extension: string, currentFile: TFile | null, data?: ArrayBuffer): Promise<string>;
        getAvailablePath(name: string, extension: string): string; // method to get an available (unique) path for a new file based on the given name and extension
        resolveFilePath(filepath: string): TFile | null; // method that resolves a file path and returns a File or null if not found
		onChange(eventType: string, filePath: string, oldPath?: string, stat?: FileStats): void;
	}

	interface Adapter {
		getFullPath(path:string): string;
	}

	interface MenuItem {
		dom: HTMLElement;
		callback: () => void;
        section: string;
	}

	interface Menu {
		items: MenuItem[];
	}

	interface FileManager {
		promptForDeletion(file: TAbstractFile): Promise<void>;
        promptForFileRename(file: TAbstractFile): Promise<void>;
	}

	interface FileExplorerView extends View {
		createFolderDom(folder: TFolder): FileExplorerItem;
		fileItems: FileItems;
		fileBeingRenamed: TAbstractFile;
	}

	interface Editor {
		cm: EditorView;
	}

	interface FileExplorerItem {
		el: HTMLDivElement;
		selfEl: HTMLDivElement;
		innerEl: HTMLDivElement;
		coverEl: HTMLDivElement;
		childrenEl: HTMLDivElement;
		collapseEl: HTMLDivElement;
		collapsed: boolean;
		collapsible: boolean;
		file: TFile;
	}

	type FileItems = {
		[fileName: string]: FileExplorerItem;
	}

	interface Setting {
		openTabById(id: string): SettingTab;
        tabContentContainer:HTMLElement;
	}
    interface SettingTab {
        id: string;
        name: string;
        navEl: HTMLElement;
    }
    interface HotkeysSettingTab extends SettingTab {
        setQuery: (str: string) => void;
    }
}
