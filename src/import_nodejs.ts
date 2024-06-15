// import_nodejs.ts

import { Platform } from "obsidian";

let path: typeof import("path") | null = null;

async function import_NodeJS_modules() {
	if (Platform.isDesktopApp) {
		try {
			path = await import("path");
			console.log(path);
		} catch (error) {
			console.error("Failed to load the 'path' module:", error);
		}
	}
}

export { import_NodeJS_modules, path };
