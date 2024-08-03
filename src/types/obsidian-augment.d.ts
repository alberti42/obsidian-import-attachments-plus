// obsidian-augment.d.ts

import 'obsidian';
import { EditorView } from '@codemirror/view';

declare module 'obsidian' {
	interface App {
		openWithDefaultApp(filepath: string): Promise<void>;
		saveAttachment(fileName: string, fileExtension: string, fileData: ArrayBuffer): Promise<TFile>;
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
		getAvailablePathForAttachments(fileName: string, extension: string, currentFile: TFile | null): Promise<string>;
		onChange(eventType: string, filePath: string, oldPath?: string, stat?: FileStats): void;
	}

	interface MenuItem {
		dom: HTMLElement;
		callback: () => void;
	}

	interface Menu {
		items: MenuItem[];
	}

	interface FileManager {
		promptForDeletion(file: TAbstractFile): Promise<void>;
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
		openTabById(id: string): void;
	}
}
