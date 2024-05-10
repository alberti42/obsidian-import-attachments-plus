// obsidian-augment.d.ts

import 'obsidian'

declare module 'obsidian' {
    interface App {
        openWithDefaultApp(filepath: string): Promise<void>;
    }
}