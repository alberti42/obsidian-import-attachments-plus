// types.ts

import {
	TFile,
} from "obsidian";

export enum ImportActionType {
	MOVE='MOVE',
	COPY='COPY',
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
    actionPastedFilesOnImport: ImportActionType;
    embedFilesOnImport: boolean;
    multipleFilesImportType: MultipleFilesImportTypes;
    customDisplayText: boolean;
}

// Define an interface for the return type
export interface AttachmentFolderPath {
    attachmentsFolderPath: string;
    vaultPath: string;
    activeFile: TFile;
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