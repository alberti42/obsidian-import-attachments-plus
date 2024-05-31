// obsidian-augment.d.ts

import 'obsidian';

declare module 'obsidian' {
    interface App {
        openWithDefaultApp(filepath: string): Promise<void>;
    }

	interface Vault {
        getConfig(configName: string): unknown;
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

        export class FileExplorer extends View {
        fileItems: { [key: string]: AFItem };
        files: WeakMap<HTMLDivElement, TAbstractFile>;
        getViewType(): string;
        getDisplayText(): string;
        onClose(): Promise<void>;
    }

    export type AFItem = FolderItem | FileItem;

    export interface FileItem {
        el: HTMLDivElement;
        file: TFile;
        fileExplorer: FileExplorer;
        info: unknown;
        selfEl: HTMLDivElement;
        innerEl: HTMLDivElement;
    }

    export interface FolderItem {
        el: HTMLDivElement;
        fileExplorer: FileExplorer;
        info: unknown;
        selfEl: HTMLDivElement;
        innerEl: HTMLDivElement;
        file: TFolder;
        children: AFItem[];
        childrenEl: HTMLDivElement;
        collapseIndicatorEl: HTMLDivElement;
        collapsed: boolean;
        pusherEl: HTMLDivElement;
    }
}
