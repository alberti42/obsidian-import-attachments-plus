// obsidian-augment.d.ts

import 'obsidian';
import { EditorView } from '@codemirror/view';

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

    interface Editor {
        cm: EditorView;
    }
}
