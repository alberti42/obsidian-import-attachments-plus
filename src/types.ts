// types.ts

import { DEFAULT_SETTINGS } from "default";
import { FileExplorerView, HotkeysSettingTab, WorkspaceLeaf } from "obsidian";

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

export const MediaLabels = {
    IMG: "image file",
    AUDIO: "audio file",
    VIDEO: "video file",
} as const;

export type SupportedMediaTag = keyof typeof MediaLabels;

// Type guard to check if the tagName is a valid key in MediaLabels
export function isSupportedMediaTag(tagName: string): tagName is SupportedMediaTag {
    return tagName in MediaLabels;
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
    hideExtForDisplayText: boolean;
    useSelectionForDisplayText: boolean;
	attachmentFolderLocation: AttachmentFolderLocationType;
	attachmentFolderPath: string;
	dateFormat: string;
	attachmentName: string;
	autoRenameAttachmentFolder: boolean;
	autoDeleteAttachmentFolder: boolean;
    deleteAttachmentFolderWhenEmpty: boolean;
    showDeleteMenu: boolean;
    showDeleteMenuForEmbedded: boolean;
    removeWikilinkOnFileDeletion: boolean;
	confirmDeleteAttachmentFolder: boolean;
	hideAttachmentFolders: boolean;
	revealAttachment: boolean;
	revealAttachmentExtExcluded: string;
	openAttachmentExternal: boolean;
	openAttachmentExternalExtExcluded: string;
	compatibility: string;
	logs?: Record<string, string[]>; // To include logs on mobile apps
}

export function isSettingsLatestFormat(s:unknown): s is ImportAttachmentsSettings {
    if (typeof s !== 'object' || s === null) {
		return false;
	}
    return 'compatibility' in s && s.compatibility === DEFAULT_SETTINGS.compatibility;
}

export interface Coordinates {
    x: number;
    y: number;
}

export interface ParsedPath {
	dir: string,
	base: string,
	filename: string,
	ext: string,
	path: string
}

export interface ParsedFolderPath {
    dir: string,
    foldername: string,
    path: string
}

// Define an interface for the return type
export interface AttachmentFolderPath {
	attachmentsFolderPath: string;
	// currentNoteFolderPath: string;
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

/* File Explorer */

export function isFileExplorerView(obj: unknown): obj is FileExplorerView {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }

    // Check if the object has the `fileItems` property
    if (!('fileItems' in obj)) {
        return false;
    }

    // Check if `fileItems` is an object
    const fileExplorerView = obj as Partial<FileExplorerView>;
    if (typeof fileExplorerView.fileItems !== 'object' || fileExplorerView.fileItems === null) {
        return false;
    }

    if (!('fileBeingRenamed' in obj)) {
        return false;
    }

    // Additional checks for specific properties if needed
    // if (typeof fileExplorerView.createFolderDom !== 'function') {
    //     return false;
    // }
    
    // All checks passed, this is a FileExplorerView
    return true;
}

export type FileExplorerViewConstructorType = { new(leaf: WorkspaceLeaf): FileExplorerView };

/* Format version 1.3.0 */

export enum LinkFormat_1_3_0 {
	RELATIVE='RELATIVE', // Same folder as current file
	ABSOLUTE='ABSOLUTE', // Vault folder
}

export function isSettingsFormat_1_3_0(s:unknown): s is ImportAttachmentsSettings_1_3_0 {
	if (typeof s !== 'object' || s === null) {
		return false;
	}
	return !('compatibility' in s);
}

// Extend the original interface and override the annotations property
export interface ImportAttachmentsSettings_1_3_0 extends Omit<ImportAttachmentsSettings, 'attachmentFolderLocation' | 'attachmentFolderPath' | 'compatibility'> {
  relativeLocation: RelativeLocation;
  folderPath: string;
  linkFormat: LinkFormat_1_3_0;
}

export function isHotkeysSettingTab(obj: unknown): obj is HotkeysSettingTab {
    // Check if `obj` is an object and has the `setQuery` method
    return typeof obj === 'object' && obj !== null && 'setQuery' in obj && typeof (obj as HotkeysSettingTab).setQuery === 'function';
}


