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

export enum LinkFormat {
	RELATIVE='RELATIVE', // Same folder as current file
	ABSOLUTE='ABSOLUTE', // Vault folder
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
	folderPath: string;
	linkFormat: LinkFormat;
	dateFormat: string;
	attachmentName: string;
	autoRenameAttachmentFolder: boolean;
	autoDeleteAttachmentFolder: boolean;
	confirmDeleteAttachmentFolder: boolean;
	hideAttachmentFolders: boolean;
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
