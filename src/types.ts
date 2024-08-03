// types.ts

export enum ImportActionType {
	MOVE='MOVE',
	COPY='COPY',
	LINK='LINK',
	ASK_USER='ASK_USER'
}

export enum YesNoTypes {
	YES='YES',
	NO='NO',
	ASK_USER='ASK_USER'
}

export enum MultipleFilesImportTypes {
	BULLETED='BULLETED',
	NUMBERED='NUMBERED',
	INLINE='INLINE'
}

export enum ImportOperationType {
	PASTE,
	DRAG_AND_DROP
}

export enum RelativeLocation {
	SAME='SAME', // Same folder as current file
	VAULT='VAULT', // Vault folder
}

export interface ImportAttachmentsSettings {
	actionDroppedFilesOnImport: ImportActionType;
	lastActionDroppedFilesOnImport: ImportActionType;
	actionPastedFilesOnImport: ImportActionType;
	lastActionPastedFilesOnImport: ImportActionType;
	embedFilesOnImport: YesNoTypes;
	lastEmbedFilesOnImport: YesNoTypes;
	multipleFilesImportType: MultipleFilesImportTypes;
	customDisplayText: boolean;
	relativeLocation: RelativeLocation;
	folderLocation: AttachmentFolderLocationType;
	folderPath: string;
	dateFormat: string;
	attachmentName: string;
	autoRenameAttachmentFolder: boolean;
	autoDeleteAttachmentFolder: boolean;
	confirmDeleteAttachmentFolder: boolean;
	hideAttachmentFolders: boolean;
	revealAttachment: boolean;
	revealAttachmentExtExcluded: string;
	openAttachmentExternal: boolean;
	openAttachmentExternalExtExcluded: string;
	logs?: Record<string, string[]>; // To include logs on mobile apps
}

export interface ParsedPath {
	dir: string,
	base: string,
	filename: string,
	ext: string,
	path: string
}

// Define an interface for the return type
export interface AttachmentFolderPath {
	attachmentsFolderPath: string;
	currentNoteFolderPath: string;
}

export interface ImportSettingsInterface {
	embed: boolean;
	action: ImportActionType;
}

// Define a type for what resolveChoice will accept
export type ImportActionChoiceResult = {
	action: ImportActionType;
	embed: YesNoTypes;
	rememberChoice: boolean;
} | null;

export enum OverwriteChoiceOptions {
	OVERWRITE,
	KEEPBOTH,
	SKIP,
}

export interface App {
	openWithDefaultApp(filepath: string): Promise<void>;
}

// Define a type for what resolveChoice will accept
export type OverwriteChoiceResult = OverwriteChoiceOptions | null;

export enum ImportFromVaultOptions {
	COPY,
	LINK,
	SKIP
}

// Define a type for what resolveChoice will accept
export type ImportFromVaultChoiceResult = ImportFromVaultOptions | null;

export enum CheckboxOptions {
	A,
	B
}

// Obsidian options 
export type LinkType = 'absolute' | 'relative' | 'shortest';

export enum AttachmentFolderLocationType {
    ROOT = 'ROOT',
    CURRENT = 'CURRENT',
    FOLDER = 'FOLDER',
    SUBFOLDER = 'SUBFOLDER'
}

export function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

export function isString(value: unknown): value is string {
	return typeof value === 'string';
}

export function isLinkType(value: unknown): value is LinkType {
    return value === 'absolute' || value === 'relative' || value === 'shortest';
}

export function isAttachmentFolderLocationType(value: unknown): value is AttachmentFolderLocationType {
    return value === AttachmentFolderLocationType.ROOT || 
           value === AttachmentFolderLocationType.CURRENT || 
           value === AttachmentFolderLocationType.FOLDER || 
           value === AttachmentFolderLocationType.SUBFOLDER;
}

// export function findFolderType(folderPath: string): AttachmentFolderPathType {
//     if ("/" === folderPath || "" === folderPath) { // vault root
//         return AttachmentFolderPathType.ROOT;
//     } else {
//         if ("./" === folderPath || "." === folderPath) { // current folder
//             return AttachmentFolderPathType.CURRENT;
//         } else { // folder or subfolder
//             if (folderPath.startsWith("./")) { // subfolder
//                 return AttachmentFolderPathType.SUBFOLDER;
//             } else { // folder
//                 return AttachmentFolderPathType.FOLDER;
//             }
//         }
//     } 
// }
