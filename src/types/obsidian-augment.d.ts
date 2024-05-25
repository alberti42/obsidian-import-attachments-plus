// obsidian-augment.d.ts

import 'obsidian';

declare module 'obsidian' {
    interface App {
        openWithDefaultApp(filepath: string): Promise<void>;
        commands: Commands;
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

    // interface Command {
    //     id: string;
    //     name: string;
    //     //icon: string;
    //     //checkCallback: (checking: boolean) => boolean | void;
    //     //callback?: () => void;
    // }

    interface Commands {
        findCommandById(id: string): Command | undefined;
    }
}
