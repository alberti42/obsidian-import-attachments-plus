// types.ts

import {
	TFile,
} from "obsidian";

export enum ImportActionType {
	MOVE='MOVE',
	COPY='COPY',
	LINK='LINK',
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

export interface ImportAttachmentsSettings {
    actionDroppedFilesOnImport: ImportActionType;
    lastActionDroppedFilesOnImport: ImportActionType;
    actionPastedFilesOnImport: ImportActionType;
    lastActionPastedFilesOnImport: ImportActionType;
    embedFilesOnImport: boolean;
    multipleFilesImportType: MultipleFilesImportTypes;
    customDisplayText: boolean;
}

// Define an interface for the return type
export interface AttachmentFolderPath {
    attachmentsFolderPath: string;
    vaultPath: string;
    relativePath: string;
}

export interface ImportSettingsInterface {
    embed: boolean;
    action: ImportActionType;
}

// Define a type for what resolveChoice will accept
export type ImportActionChoiceResult = {
    action: ImportActionType;
    rememberChoice: boolean;
} | null;

export enum OverwriteChoiceOptions {
	OVERWRITE,
	KEEPBOTH,
	SKIP,
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
