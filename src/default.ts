// defaults.ts

import {AttachmentFolderLocationType, ImportActionType, ImportAttachmentsSettings, MultipleFilesImportTypes, RelativeLocation, YesNoTypes} from 'types'

// Default plugin settings
export const DEFAULT_SETTINGS: ImportAttachmentsSettings = {
	actionDroppedFilesOnImport: ImportActionType.ASK_USER, // Default to asking the user
	actionPastedFilesOnImport: ImportActionType.ASK_USER, // Default to asking the user
	embedFilesOnImport: YesNoTypes.ASK_USER, // Default to linking files
	lastActionPastedFilesOnImport: ImportActionType.COPY, // Default to copying files
	lastActionDroppedFilesOnImport: ImportActionType.COPY, // Default to copying files
	lastEmbedFilesOnImport: YesNoTypes.NO, // Default to linking
	multipleFilesImportType: MultipleFilesImportTypes.BULLETED, // Default to bulleted list when importing multiple files
	relativeLocation: RelativeLocation.SAME, // Default to vault
	folderLocation: AttachmentFolderLocationType.SUBFOLDER, // Default to vault
	folderPath: '${notename} (attachments)', // Default to a folder in the vault
	attachmentName: '${original}', // Default to the original name of the attachment
	dateFormat: 'YYYY_MM_DDTHH_mm_ss',
	customDisplayText: true,  // Default to true
	autoRenameAttachmentFolder: true, // Default to true
	autoDeleteAttachmentFolder: true, // Default to true
	confirmDeleteAttachmentFolder: true, // Default to true
	hideAttachmentFolders: true, // Default to true
	revealAttachment: true, // Default to true
	revealAttachmentExtExcluded: '.md', // Default to Markdown files
	openAttachmentExternal: true, // Default to true
	openAttachmentExternalExtExcluded: '.md', // Default to Markdown files
	logs: {}, // Initialize logs as an empty array
	compatibility: '1.4.0'
};

export const DEFAULT_SETTINGS_1_3_0: PluginsAnnotationsSettingsWithoutNames = {
  ...DEFAULT_SETTINGS,
  annotations: {}, // Override the annotations property with the appropriate type
  plugins_annotations_uuid: 'FAA70013-38E9-4FDF-B06A-F899F6487C19', 
};