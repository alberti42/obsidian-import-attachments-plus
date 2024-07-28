import { Platform } from "obsidian";
import ImportAttachments from "main";

let originalConsole = {
	debug: null as ((message?: unknown, ...optionalParams: unknown[]) => void) | null,
	error: null as ((message?: unknown, ...optionalParams: unknown[]) => void) | null,
	info: null as ((message?: unknown, ...optionalParams: unknown[]) => void) | null,
	log: null as ((message?: unknown, ...optionalParams: unknown[]) => void) | null,
	warn: null as ((message?: unknown, ...optionalParams: unknown[]) => void) | null
};

// Helper function to patch console logs on mobile
export function monkeyPatchConsole(plugin: ImportAttachments) {
	if (Platform.isDesktopApp) return;

	const logs: Record<string, string[]> = plugin.settings.logs || {};
	const saveLogs = async () => {
		plugin.settings.logs = logs;
		await plugin.saveData(plugin.settings);
	};

	const formatMessage = (message: unknown): string => {
		if (typeof message === 'object' && message !== null) {
			try {
				return JSON.stringify(message, null, 2); // Pretty print with 2-space indentation
			} catch {
				return "[Object]";
			}
		}
		return String(message);
	};

	const getTimestamp = (): string => {
		return new Date().toISOString();
	};

	// Store the original console methods
	originalConsole.log = console.log;

	originalConsole = {
		debug: console.debug,
		error: console.error,
		info: console.info,
		log: console.log,
		warn: console.warn,
	};

	const logMessages = (origLog: (...data: unknown[]) => void, prefix: string) => (...messages: unknown[]) => {
		// Call the original log function
		origLog(...messages);

		const formattedMessages = messages.map(formatMessage);
		const timestampedMessage = `${getTimestamp()} ${formattedMessages.join(' ')}`;
		if (!logs[prefix]) {
			logs[prefix] = [];
		}
		logs[prefix].push(timestampedMessage);
		saveLogs();
	};

	if(originalConsole.debug) console.debug = logMessages(originalConsole.debug, "debug");
	if(originalConsole.error) console.error = logMessages(originalConsole.error, "error");
	if(originalConsole.info) console.info = logMessages(originalConsole.info, "info");
	if(originalConsole.log) console.log = logMessages(originalConsole.log, "log");
	if(originalConsole.warn) console.warn = logMessages(originalConsole.warn, "warn");
}

export function unpatchConsole() {
	if(originalConsole.debug) {
		console.debug = originalConsole.debug;
		originalConsole.debug = null;
	}
	if(originalConsole.error) {
		console.error = originalConsole.error;
		originalConsole.error = null;
	}
	if(originalConsole.info) {
		console.info = originalConsole.info;
		originalConsole.info = null;
	}
	if(originalConsole.log) {
		console.log = originalConsole.log;
		originalConsole.log = null;
	}
	if(originalConsole.warn) {
		console.warn = originalConsole.warn;
		originalConsole.warn = null;
	}
}
