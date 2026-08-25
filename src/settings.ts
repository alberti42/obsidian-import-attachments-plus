// settings.ts

import {
    App,
    PluginSettingTab,
    Platform,
    normalizePath,
    type SettingDefinitionItem,
    type SettingGroupItem,
} from 'obsidian';

import ImportAttachments from 'main'

import {
    ImportActionType,
    MultipleFilesImportTypes,
    YesNoTypes,
    isBoolean,
    isLinkType,
    isImportActionType,
    isYesNoTypes,
    isAttachmentFolderLocationType,
    AttachmentFolderLocationType,
    isHotkeysSettingTab,
} from './types';

import { updateVisibilityAttachmentFolders } from 'hideAttachmentFolders';
import * as Utils from 'utils';

/**
 * Two rows mirror **vault** preferences rather than plugin settings. They are addressed by these
 * synthetic keys and special-cased in get/setControlValue; anything else falls through to
 * PluginSettingTab, which reads and persists `plugin.settings` by key.
 */
const VAULT_WIKILINKS = 'vault:useMarkdownLinks';
const VAULT_NEW_LINK_FORMAT = 'vault:newLinkFormat';

/** Tidy a comma-separated extension list: dot-prefixed, de-duplicated, no blanks. */
function normaliseExtensionList(value: string): string {
    return value.split(',')
        .map(ext => ext.trim())
        .filter(ext => ext !== '')
        .map(ext => ext.startsWith('.') ? ext : '.' + ext)
        .filter((ext, index, self) => self.indexOf(ext) === index)
        .join(', ');
}

// Plugin settings tab
export class ImportAttachmentsSettingTab extends PluginSettingTab {
    plugin: ImportAttachments;

    private saveTimeout: number | null = null;

    constructor(app: App, plugin: ImportAttachments) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Persist the settings, reporting a failure rather than dropping it.
     *
     * The remaining caller is a debounce callback, so there is nobody to await the save. Settings
     * that silently fail to persist are worth a notice: the control shows the new value while
     * data.json still holds the old one.
     */
    private saveOrReport() {
        this.plugin.saveSettings().catch((err: unknown) => {
            Utils.reportFailure('Could not save the settings', err);
        });
    }

    /**
     * Kept for `main.ts`, which coalesces the writes it makes after the import dialog. The
     * settings *tab* no longer needs it: the declarative controls persist through
     * setControlValue().
     */
    debouncedSaveSettings(fnc?:(()=>void)) {
        // timeout after 250 ms
        const timeout_ms = 50;

        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = window.setTimeout(() => {
            if(fnc===undefined) {
                this.saveOrReport();
            } else {
                fnc.call(this);
            }
            this.saveTimeout = null;
        }, timeout_ms);
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        this.cleanUpAttachmentFolderSettings();

        const openKey = Platform.isMacOS ? '⌘' : 'Ctrl';
        const revealKey = Platform.isMacOS ? '⌘+⌥' : 'Ctrl+Alt';

        // Rows that only make sense where the Electron/Node APIs exist. Built conditionally
        // rather than hidden with `visible`, so they stay out of the search index on mobile too.
        const importing: SettingGroupItem[] = [
            {
                name: 'Whether to move or copy files that are drag-and-dropped?',
                desc: 'Choose whether files that are dragged and dropped into the editor should be moved or copied. Alternatively, the user is asked each time. By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.',
                control: {
                    type: 'dropdown',
                    key: 'actionDroppedFilesOnImport',
                    options: {
                        [ImportActionType.ASK_USER]: 'Ask each time',
                        [ImportActionType.MOVE]: 'Move',
                        [ImportActionType.COPY]: 'Copy',
                    },
                },
            },
            {
                name: 'Whether to move or copy files that are copy-and-pasted?',
                desc: 'Choose whether files that are copy and pasted into the editor should be moved or copied. Alternatively, the user is asked each time.  By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.',
                control: {
                    type: 'dropdown',
                    key: 'actionPastedFilesOnImport',
                    options: {
                        [ImportActionType.ASK_USER]: 'Ask each time',
                        [ImportActionType.MOVE]: 'Move',
                        [ImportActionType.COPY]: 'Copy',
                    },
                },
            },
            {
                name: 'Embed imported documents:',
                desc: 'With this option enabled, the files are imported as an embedded document; if it is deactivated, they are imported as a linked document.  By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.',
                control: {
                    type: 'dropdown',
                    key: 'embedFilesOnImport',
                    options: {
                        [YesNoTypes.ASK_USER]: 'Ask each time',
                        [YesNoTypes.YES]: 'Yes',
                        [YesNoTypes.NO]: 'No',
                    },
                },
            },
            {
                name: 'Import multiple files as:',
                desc: 'Choose how to import multiple files: as a bulleted list, as a numbered list, or inline without using lists.',
                control: {
                    type: 'dropdown',
                    key: 'multipleFilesImportType',
                    options: {
                        [MultipleFilesImportTypes.BULLETED]: 'Bulleted list',
                        [MultipleFilesImportTypes.NUMBERED]: 'Numbered list',
                        [MultipleFilesImportTypes.INLINE]: 'Inline',
                    },
                },
            },
            {
                name: 'Use the selected text for the displayed text:',
                desc: 'With this option enabled, the selected text is replaced with the link to the imported document and the same selected text is automatically used as the display text for the link itself. Note that you need to drag the attachment onto the selected text. This option is ignored when multiple attachments are imported.',
                control: { type: 'toggle', key: 'useSelectionForDisplayText' },
            },
            {
                name: 'Use the filename for the displayed text:',
                desc: 'With this option enabled, the filename of the imported document is used as the display text. This option is ignored when the previous option applies.',
                control: { type: 'toggle', key: 'customDisplayText' },
            },
            {
                name: 'Hide the extension in the filename for the displayed text:',
                desc: 'With this option enabled, the extension of the imported file is not included in the displayed text.',
                // Only meaningful while the filename is what gets displayed.
                visible: () => this.plugin.settings.customDisplayText,
                control: { type: 'toggle', key: 'hideExtForDisplayText' },
            },
            {
                name: 'Use [[Wikilinks]]:',
                desc: createFragment((frag) => {
                    frag.appendText('Auto-generate Wikilinks for [[links]] and [[images]] instead of Markdown links and images. Disable this option to generate Markdown links instead. ');
                    this.addWarningGeneralSettings(frag);
                }),
                // A vault preference, not a plugin setting: hide the row if this Obsidian does not
                // expose it rather than showing a control that cannot work.
                visible: () => isBoolean(this.app.vault.getConfig('useMarkdownLinks')),
                control: { type: 'toggle', key: VAULT_WIKILINKS },
            },
            {
                name: 'New link format:',
                desc: createFragment((frag) => {
                    frag.appendText('What links to insert when auto-generating internal links. ');
                    this.addWarningGeneralSettings(frag);
                }),
                visible: () => isLinkType(this.app.vault.getConfig('newLinkFormat')),
                control: {
                    type: 'dropdown',
                    key: VAULT_NEW_LINK_FORMAT,
                    options: {
                        shortest: 'Shortest path when possible',
                        relative: 'Relative path to note',
                        absolute: 'Absolute path in vault',
                    },
                },
            },
        ];

        const opening: SettingGroupItem[] = [
            {
                name: 'Open attachments with default external application:',
                desc: `With this option enabled, when you open an attachment by holding ${openKey}, the attachment opens in default external application.`,
                control: { type: 'toggle', key: 'openAttachmentExternal' },
            },
            {
                name: 'Exclude the following extensions:',
                desc: 'Enter a list of extensions separated by comma (e.g.: .md, .pdf) for which the default Obsidian behavior applies instead of opening the file in the default external application.',
                aliases: ['open external exclude extensions'],
                visible: () => this.plugin.settings.openAttachmentExternal,
                control: {
                    type: 'text',
                    key: 'openAttachmentExternalExtExcluded',
                    placeholder: 'Enter a list of extensions',
                },
            },
            {
                name: "Reveal attachments in system's file manager:",
                desc: `With this option enabled, when you open an attachment by holding ${revealKey}, the attachment is shown in the system's file manager.`,
                control: { type: 'toggle', key: 'revealAttachment' },
            },
            {
                name: 'Exclude the following extensions:',
                desc: 'Enter a list of extensions separated by comma (e.g.: .md, .pdf) for which the default Obsidian behavior applies instead of revealing the file in the system\'s file manager',
                aliases: ['reveal exclude extensions'],
                visible: () => this.plugin.settings.revealAttachment,
                control: {
                    type: 'text',
                    key: 'revealAttachmentExtExcluded',
                    placeholder: 'Enter a list of extensions',
                },
            },
        ];

        const managing: SettingGroupItem[] = [
            {
                name: 'Show option in context menu to delete attachment files:',
                desc: "With this option enabled, when you right click on a Wikilink in your note, an 'Delete file' will be shown in the context menu.",
                control: { type: 'toggle', key: 'showDeleteMenu' },
            },
            {
                name: 'Remove Wikilink when deleting an attachment file:',
                desc: 'With this option enabled, when you right click on a Wikilink or MarkDown link in your note to delete the attachment, not only the attachment will be deleted, but also the Wikilink or MarkDown link, respectively, will be removed from your note.',
                control: { type: 'toggle', key: 'removeWikilinkOnFileDeletion' },
            },
            {
                name: 'Automatically remove attachment folders when empty:',
                desc: 'With this option enabled, whenever an attachment folder is left empty — after deleting an attachment, or after its contents were moved elsewhere — the folder itself is removed as well. An empty folder is removed without asking, since there is nothing in it to lose; it goes to the trash, according to your Obsidian deletion preference.',
                control: { type: 'toggle', key: 'deleteAttachmentFolderWhenEmpty' },
            },
            {
                name: 'Let attachments follow the text that uses them:',
                desc: 'With this option enabled, when text containing attachment links is moved into another note — by extracting a selection, merging notes, or an ordinary cut-and-paste — the attachments are moved into that note’s attachment folder instead of being left behind. The same rules as the "Move stray attachments" command apply: only folders managed by this plugin are touched, and an attachment still used by the note it is filed under stays where it is. Because this reacts to any edit that adds such a link, an attachment can move a moment after you type one by hand. Leave it off to run the "Move stray attachments" command yourself instead.',
                control: { type: 'toggle', key: 'moveStrayAttachmentsAutomatically' },
            },
            {
                name: 'Rename the attachment folder automatically and update all links correspondingly:',
                desc: 'With this option enabled, when you rename/move an note, if the renamed note has an attachment folder connected to it, its attachment folder is renamed/moved to a new name/location corresponding to the new name of the note.',
                control: { type: 'toggle', key: 'autoRenameAttachmentFolder' },
            },
            {
                name: 'Delete the attachment folder automatically when the corresponding note is deleted:',
                desc: 'With this option enabled, when you delete a note, if the deleted note has an attachment folder connected to it, its attachment folder will be deleted as well. Note: automatic deletion only works when the name of the attachment folder contains ${notename}.',
                control: { type: 'toggle', key: 'autoDeleteAttachmentFolder' },
            },
            {
                name: 'Ask confirmation before deleting a non-empty attachment folder:',
                desc: 'If enabled, you are asked before an attachment folder that still contains files is deleted. Empty folders are never asked about — see the option above.',
                control: { type: 'toggle', key: 'confirmDeleteAttachmentFolder' },
            },
        ];

        const attachmentFolder: SettingGroupItem[] = [
            ...(Platform.isDesktopApp ? [
                {
                    name: 'Default location for new attachments:',
                    desc: 'Where newly added attachments are placed.',
                    control: {
                        type: 'dropdown' as const,
                        key: 'attachmentFolderLocation',
                        options: {
                            [AttachmentFolderLocationType.ROOT]: 'Vault folder',
                            [AttachmentFolderLocationType.FOLDER]: 'In the folder specified below',
                            [AttachmentFolderLocationType.CURRENT]: 'Same folder as current file',
                            [AttachmentFolderLocationType.SUBFOLDER]: 'In subfolder under current folder',
                        },
                    },
                },
                {
                    name: 'Attachment folder path:',
                    desc: createFragment((frag) => {
                        frag.appendText('Place newly created attachment files, such as images created via drag-and-drop or audio recordings, in this folder.  Use the following variables as a placeholder:');
                        const ul = frag.createEl('ul');
                        ul.createEl('li', { text: '${notename} for the name of the MarkDown note into which the attachment files will be imported' });
                    }),
                    // The path is meaningless for ROOT and CURRENT, which do not consult it.
                    visible: () => {
                        switch (this.plugin.settings.attachmentFolderLocation) {
                        case AttachmentFolderLocationType.FOLDER:
                        case AttachmentFolderLocationType.SUBFOLDER:
                            return true;
                        case AttachmentFolderLocationType.ROOT:
                        case AttachmentFolderLocationType.CURRENT:
                            return false;
                        }
                    },
                    control: {
                        type: 'text' as const,
                        key: 'attachmentFolderPath',
                        placeholder: 'Example: folder 1/folder',
                    },
                },
            ] satisfies SettingGroupItem[] : []),
            {
                name: 'Hide attachment folders:',
                desc: 'With this option enabled, the attachment folders will not be shown.',
                control: { type: 'toggle', key: 'hideAttachmentFolders' },
            },
        ];

        const attachments: SettingGroupItem[] = [
            {
                name: 'Name of the imported attachments:',
                desc: createFragment((frag) => {
                    frag.appendText('Choose how to name the imported attachments, using the following variables as a placeholder:');
                    const ul = frag.createEl('ul');
                    ul.createEl('li', { text: '${original} for the original name (omitting file extension) of the imported attachment files' });
                    ul.createEl('li', { text: '${notename} for the name of the MarkDown note into which the attachment files will be imported' });
                    ul.createEl('li', { text: '${date} for the current date' })
                    ul.createEl('li', { text: '${uuid} for a 128-bit Universally Unique Identifier' })
                    ul.createEl('li', { text: '${md5} for a MD5 hash of the imported file' });
                    frag.appendText('Note that the file extension of the imported attachments is preserved.')
                }),
                control: {
                    type: 'text',
                    key: 'attachmentName',
                    placeholder: 'Enter attachment name',
                },
            },
            {
                name: 'Date format for files:',
                desc: createFragment((frag) => {
                    frag.appendText('Choose the date format for the placeholder ${date} in the attachment name, based on ');
                    frag.createEl('a', {
                        href: 'https://momentjscom.readthedocs.io/en/latest/moment/04-displaying/01-format',
                        text: 'momentjs',
                    });
                    frag.appendText(' syntax.');
                }),
                control: {
                    type: 'text',
                    key: 'dateFormat',
                    placeholder: 'Enter date format',
                },
            },
        ];

        const commands: SettingGroupItem[] = [
            {
                name: 'Import commands',
                desc: createFragment((frag:DocumentFragment) => {
                    frag.appendText('The plugin offers a range of commands to import attachments as well. \
                        You can review the commands and customize them with hotkeys by visiting the ');
                    const em = createEl('em');
                    const link = frag.createEl('a', { href: '#', text: 'Hotkeys'});
                    link.onclick = () => {
                        const tab = this.app.setting.openTabById('hotkeys');
                        if(isHotkeysSettingTab(tab)) {
                            tab.setQuery(this.plugin.manifest.id)
                        }
                    };

                    em.appendChild(link);
                    frag.appendChild(em);
                    frag.appendText(' configuration pane.');
                }),
            },
        ];

        return [
            ...(Platform.isDesktopApp ? [{ type: 'group' as const, heading: 'Importing', items: importing }] : []),
            ...(Platform.isDesktopApp ? [{ type: 'group' as const, heading: 'Opening', items: opening }] : []),
            { type: 'group', heading: 'Managing', items: managing },
            { type: 'group', heading: 'Attachment folder', items: attachmentFolder },
            ...(Platform.isDesktopApp ? [{ type: 'group' as const, heading: 'Attachments', items: attachments }] : []),
            ...(Platform.isDesktopApp ? [{ type: 'group' as const, heading: 'Commands and hotkeys', items: commands }] : []),
        ];
    }

    /** Two rows read a vault preference rather than a plugin setting; everything else is default. */
    getControlValue(key: string): unknown {
        switch (key) {
        case VAULT_WIKILINKS: {
            // The toggle is 'use Wikilinks', the vault stores the opposite.
            const useMarkdownLinks = this.app.vault.getConfig('useMarkdownLinks');
            return isBoolean(useMarkdownLinks) ? !useMarkdownLinks : true;
        }
        case VAULT_NEW_LINK_FORMAT: {
            const newLinkFormat = this.app.vault.getConfig('newLinkFormat');
            return isLinkType(newLinkFormat) ? newLinkFormat : 'shortest';
        }
        default:
            return super.getControlValue(key);
        }
    }

    /**
     * Persist a control, plus whatever else that control implies.
     *
     * This is where the old per-row `onChange` bodies went: normalising what is stored, mirroring
     * the "last used" values, and the side effects — re-parsing the attachment folder pattern,
     * re-sweeping the file explorer, registering the delete menu. Bookkeeping that must be saved
     * happens *before* `super`, so one write covers it.
     */
    async setControlValue(key: string, value: unknown): Promise<void> {
        switch (key) {
        case VAULT_WIKILINKS:
            this.app.vault.setConfig('useMarkdownLinks', !value);
            return;
        case VAULT_NEW_LINK_FORMAT:
            if (isLinkType(value)) {
                this.app.vault.setConfig('newLinkFormat', value);
            } else {
                console.error('Invalid option selection:', value);
            }
            return;
        }

        // What gets stored is not always what was typed.
        let stored = value;
        if (typeof value === 'string') {
            let text = value;
            if (key === 'openAttachmentExternalExtExcluded' || key === 'revealAttachmentExtExcluded') {
                text = normaliseExtensionList(text);
            }
            if (key === 'attachmentName' && text.trim() === '') {
                text = '${original}'; // TODO: improve checking the input by the user that it is not empty
            }
            stored = text;
        }

        // Remember the last concrete choice, so the import dialog can preselect it. Set before
        // persisting: `super.setControlValue` writes the whole settings object.
        if (key === 'actionDroppedFilesOnImport' && isImportActionType(stored) && stored !== ImportActionType.ASK_USER) {
            this.plugin.settings.lastActionDroppedFilesOnImport = stored;
        }
        if (key === 'actionPastedFilesOnImport' && isImportActionType(stored) && stored !== ImportActionType.ASK_USER) {
            this.plugin.settings.lastActionPastedFilesOnImport = stored;
        }
        if (key === 'embedFilesOnImport' && isYesNoTypes(stored) && stored !== YesNoTypes.ASK_USER) {
            this.plugin.settings.lastEmbedFilesOnImport = stored;
        }

        await super.setControlValue(key, stored);

        switch (key) {
        case 'showDeleteMenu':
            this.plugin.addDeleteMenuForLinks(stored === true);
            break;
        case 'hideAttachmentFolders':
            updateVisibilityAttachmentFolders(this.plugin);
            break;
        case 'attachmentFolderLocation':
            if (!isAttachmentFolderLocationType(stored)) {
                console.error('Invalid option selection:', stored);
                break;
            }
            this.plugin.parseAttachmentFolderPath();
            updateVisibilityAttachmentFolders(this.plugin);
            break;
        case 'attachmentFolderPath':
            this.plugin.parseAttachmentFolderPath();
            updateVisibilityAttachmentFolders(this.plugin);
            break;
        }

        // Rows whose visibility depends on another row's value.
        switch (key) {
        case 'customDisplayText':
        case 'openAttachmentExternal':
        case 'revealAttachment':
        case 'attachmentFolderLocation':
            this.refreshDomState();
            break;
        }
    }

    cleanUpAttachmentFolderSettings(): void {
        const folderPath = normalizePath(this.plugin.settings.attachmentFolderPath).replace(/^(\.\/)*\.?/,'');  // map ./././path1/path2 to path1/path2

        if(this.plugin.settings.attachmentFolderLocation === AttachmentFolderLocationType.FOLDER) {
            if(folderPath==='/') {
                this.plugin.settings.attachmentFolderLocation = AttachmentFolderLocationType.ROOT;
            }
        }

        if(this.plugin.settings.attachmentFolderLocation === AttachmentFolderLocationType.SUBFOLDER) {
            if(folderPath==='/') {
                this.plugin.settings.attachmentFolderLocation = AttachmentFolderLocationType.CURRENT;
            }
        }
    }

    hide(): void {
        this.cleanUpAttachmentFolderSettings();
    }

    addWarningGeneralSettings(frag: DocumentFragment): HTMLElement {
        // Create the warning span
        const warning = frag.createSpan({text: 'Be aware that this setting is a mirror of the corresponding setting in the vault preference pane ', cls: 'mod-warning' });

        // Create the link
        const link = warning.createEl('a', { text: 'Files and links', href: '#' });
        link.id = 'file-link-settings';

        // Add event listener to the link
        link.addEventListener('click', (e) => {
            e.preventDefault();
            this.app.setting.openTabById('file');
        });

        warning.appendText('. Any change made here is carried over to the general setting and viceversa.');

        return warning;
    }
}
