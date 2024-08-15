// defaults.ts

import {AttachmentFolderLocationType, ImportActionType, ImportAttachmentsSettings, ImportAttachmentsSettings_1_3_0, LinkFormat_1_3_0, MultipleFilesImportTypes, RelativeLocation, YesNoTypes} from 'types'

// Default plugin settings
export const DEFAULT_SETTINGS: ImportAttachmentsSettings = {
	actionDroppedFilesOnImport: ImportActionType.ASK_USER, // Default to asking the user
	actionPastedFilesOnImport: ImportActionType.ASK_USER, // Default to asking the user
	embedFilesOnImport: YesNoTypes.ASK_USER, // Default to linking files
	lastActionPastedFilesOnImport: ImportActionType.COPY, // Default to copying files
	lastActionDroppedFilesOnImport: ImportActionType.COPY, // Default to copying files
	lastEmbedFilesOnImport: YesNoTypes.NO, // Default to linking
	multipleFilesImportType: MultipleFilesImportTypes.BULLETED, // Default to bulleted list when importing multiple files
	attachmentFolderLocation: AttachmentFolderLocationType.SUBFOLDER, // Default to vault
	attachmentFolderPath: '${notename} (attachments)', // Default to a folder in the vault
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


/* Version 1_3_0 */
const { compatibility:_, attachmentFolderPath:__, attachmentFolderLocation:___, ...DEFAULT_SETTINGS_1_3_0_FILTERED } = DEFAULT_SETTINGS;
export const DEFAULT_SETTINGS_1_3_0: ImportAttachmentsSettings_1_3_0 = {
  ...DEFAULT_SETTINGS_1_3_0_FILTERED,
  relativeLocation: RelativeLocation.SAME, // Default to vault
  folderPath: '${notename} (attachments)', // Default to a folder in the vault
  linkFormat: LinkFormat_1_3_0.RELATIVE,
};