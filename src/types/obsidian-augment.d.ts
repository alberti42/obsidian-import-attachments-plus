// obsidian-augment.d.ts

import 'obsidian';
import { EditorView } from '@codemirror/view';

declare module 'obsidian' {
    interface App {
        openWithDefaultApp(filepath: string): Promise<void>;
        saveAttachment(fileName: string, fileExtension: string, fileData: ArrayBuffer): Promise<TFile>;
    }

    interface Vault {
        getConfig(configName: string): unknown;
        getAvailablePathForAttachments(fileName: string, extension: string, currentFile: TFile | null): Promise<string>;
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

    interface Editor {
        cm: EditorView;
    }
}
