// obsidian-augment.d.ts

import 'obsidian';
import { EditorView } from '@codemirror/view';

declare module 'obsidian' {
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
