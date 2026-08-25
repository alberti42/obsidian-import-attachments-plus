// settings.ts

import {
    App,
    PluginSettingTab,
    Setting,
    Platform,
    TextComponent,
    normalizePath,
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
     * Every caller here is a debounce callback or an onChange handler, so there is nobody to
     * await the save. Settings that silently fail to persist are worth a notice: the control
     * shows the new value while data.json still holds the old one.
     */
    private saveOrReport() {
        this.plugin.saveSettings().catch((err: unknown) => {
            Utils.reportFailure('Could not save the settings', err);
        });
    }

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

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        if (Platform.isDesktopApp) {
            new Setting(containerEl).setName('Importing').setHeading();

            new Setting(containerEl)
                .setName('Whether to move or copy files that are drag-and-dropped?')
                .setDesc('Choose whether files that are dragged and dropped into the editor should be moved or copied. Alternatively, the user is asked each time. By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.')
                .addDropdown(dropdown => {
                    dropdown.addOption(ImportActionType.ASK_USER, 'Ask each time');
                    dropdown.addOption(ImportActionType.MOVE, 'Move');
                    dropdown.addOption(ImportActionType.COPY, 'Copy');
                    dropdown.setValue(this.plugin.settings.actionDroppedFilesOnImport)
                        .onChange(async (value: string) => {
                            // `value in ImportActionType` used to stand here, which tests the
                            // enum's *keys*; it worked only because every member is spelled
                            // MOVE='MOVE'. The guard tests values and narrows, so the comparison
                            // below shares the enum type and the four casts are gone.
                            if (!isImportActionType(value)) {
                                console.error('Invalid import action type:', value);
                                return;
                            }
                            this.plugin.settings.actionDroppedFilesOnImport = value;
                            if (value !== ImportActionType.ASK_USER) {
                                this.plugin.settings.lastActionDroppedFilesOnImport = value;
                            }
                            this.debouncedSaveSettings();
                        })
                });

            new Setting(containerEl)
                .setName('Whether to move or copy files that are copy-and-pasted?')
                .setDesc('Choose whether files that are copy and pasted into the editor should be moved or copied. Alternatively, the user is asked each time.  By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.')
                .addDropdown(dropdown => {
                    dropdown.addOption(ImportActionType.ASK_USER, 'Ask each time');
                    dropdown.addOption(ImportActionType.MOVE, 'Move');
                    dropdown.addOption(ImportActionType.COPY, 'Copy');
                    dropdown.setValue(this.plugin.settings.actionPastedFilesOnImport)
                        .onChange(async (value: string) => {
                            // `value in ImportActionType` used to stand here, which tests the
                            // enum's *keys*; it worked only because every member is spelled
                            // MOVE='MOVE'. The guard tests values and narrows, so the comparison
                            // below shares the enum type and the four casts are gone.
                            if (!isImportActionType(value)) {
                                console.error('Invalid import action type:', value);
                                return;
                            }
                            this.plugin.settings.actionPastedFilesOnImport = value;
                            if (value !== ImportActionType.ASK_USER) {
                                this.plugin.settings.lastActionPastedFilesOnImport = value;
                            }
                            this.debouncedSaveSettings();
                        })
                });

            new Setting(containerEl)
                .setName('Embed imported documents:')
                .setDesc('With this option enabled, the files are imported as an embedded document; if it is deactivated, they are imported as a linked document.  By holding the shift key ⇧ pressed, you will be shown the import panel, however you configured this option.')
                .addDropdown(dropdown => {
                    dropdown.addOption(YesNoTypes.ASK_USER, 'Ask each time');
                    dropdown.addOption(YesNoTypes.YES, 'Yes');
                    dropdown.addOption(YesNoTypes.NO, 'No');
                    dropdown.setValue(this.plugin.settings.embedFilesOnImport)
                        .onChange(async (value: string) => {
                            if (!isYesNoTypes(value)) {
                                console.error('Invalid option selection:', value);
                                return;
                            }
                            this.plugin.settings.embedFilesOnImport = value;
                            if (value !== YesNoTypes.ASK_USER) {
                                this.plugin.settings.lastEmbedFilesOnImport = value;
                            }
                            this.debouncedSaveSettings();
                        })
                });

            new Setting(containerEl)
                .setName('Import multiple files as:')
                .setDesc('Choose how to import multiple files: as a bulleted list, as a numbered list, or inline without using lists.')
                .addDropdown(dropdown => {
                    dropdown.addOption(MultipleFilesImportTypes.BULLETED, 'Bulleted list');
                    dropdown.addOption(MultipleFilesImportTypes.NUMBERED, 'Numbered list');
                    dropdown.addOption(MultipleFilesImportTypes.INLINE, 'Inline');
                    dropdown.setValue(this.plugin.settings.multipleFilesImportType)
                        .onChange(async (value: string) => {
                            if (Object.values(MultipleFilesImportTypes).includes(value as MultipleFilesImportTypes)) {
                                this.plugin.settings.multipleFilesImportType = value as MultipleFilesImportTypes;
                                this.debouncedSaveSettings();
                            } else {
                                console.error('Invalid option selection:', value);
                            }
                        })
                });

            new Setting(containerEl)
                .setName('Use the selected text for the displayed text:')
                .setDesc('With this option enabled, the selected text is replaced with the link to the imported document and the same \
                    selected text is automatically used as the display text for the link itself. Note that you need to drag the attachment onto \
                    the selected text. This option is ignored when multiple attachments are imported.')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.useSelectionForDisplayText)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.useSelectionForDisplayText = value;
                        this.debouncedSaveSettings();
                    }));

            const use_filename_setting = new Setting(containerEl)
                .setName('Use the filename for the displayed text:')
                .setDesc('With this option enabled, the filename of the imported document is used as the display text. This option is ignored when \
                    the previous option applies.');

            const hide_ext_for_displayed_text_setting = new Setting(containerEl)
                .setName('Hide the extension in the filename for the displayed text:')
                .setDesc('With this option enabled, the extension of the imported file is not included in the displayed text.')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.hideExtForDisplayText)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.hideExtForDisplayText = value;
                        this.debouncedSaveSettings();
                    }));

            hide_ext_for_displayed_text_setting.settingEl.style.display = this.plugin.settings.customDisplayText ? '' : 'none';

            use_filename_setting.addToggle(toggle => toggle
                    .setValue(this.plugin.settings.customDisplayText)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.customDisplayText = value;
                        hide_ext_for_displayed_text_setting.settingEl.style.display = value ? '' : 'none';
                        this.debouncedSaveSettings();
                    }));

            const wikilinksSetting = new Setting(containerEl)
                .setName('Use [[Wikilinks]]:')
                .setDesc(createFragment((frag) => {
                    frag.appendText('Auto-generate Wikilinks for [[links]] and [[images]] instead of Markdown links and images. Disable this option to generate Markdown links instead. ');
                    this.addWarningGeneralSettings(frag);
                }));
            wikilinksSetting.addToggle(toggle => {
                const useMarkdownLinks = this.app.vault.getConfig('useMarkdownLinks');
                if (!isBoolean(useMarkdownLinks)) {
                    wikilinksSetting.settingEl.remove();
                    return;
                }
                toggle.setValue(!useMarkdownLinks)
                    .onChange(async (value: boolean) => {
                        this.app.vault.setConfig('useMarkdownLinks', !value);
                    });
            });
        

            const newLinkFormatSetting = new Setting(containerEl)
                .setName('New link format:')
                .setDesc(createFragment((frag) => {
                    frag.appendText('What links to insert when auto-generating internal links. ');
                    this.addWarningGeneralSettings(frag);
                }))
            newLinkFormatSetting.addDropdown(dropdown => {
                const newLinkFormat = this.app.vault.getConfig('newLinkFormat');
                if (!isLinkType(newLinkFormat)) {
                    newLinkFormatSetting.settingEl.remove();
                    return;
                }
                
                dropdown.addOption('shortest', 'Shortest path when possible');
                dropdown.addOption('relative', 'Relative path to note');
                dropdown.addOption('absolute', 'Absolute path in vault');
                dropdown.setValue(newLinkFormat)
                    .onChange(async (value: string) => {
                        if (isLinkType(value)) {
                            this.app.vault.setConfig('newLinkFormat', value);
                        } else {
                            console.error('Invalid option selection:', value);
                        }
                    })
                });

            new Setting(containerEl).setName('Opening').setHeading();

            let key;
            if (Platform.isMacOS) {
                key = '⌘';
            } else { // Default to Windows/Linux bindings
                key = 'Ctrl';
            }

            const validate_exts = (textfield: TextComponent, value: string) => {
                // Process the input string to ensure proper formatting
                const extensions = value.split(',')
                    .map(ext => ext.trim())  // Trim spaces from each extension
                    .filter(ext => ext !== '') // Remove empty entries
                    .map(ext => {
                        // Ensure each extension starts with a dot
                        if (!ext.startsWith('.')) {
                            ext = '.' + ext;
                        }
                        return ext;
                    })
                    .filter((ext, index, self) => self.indexOf(ext) === index); // Remove duplicates

                // Join the array into a string with proper separator
                return extensions.join(', ');
            }

            const external_toggle = new Setting(containerEl)
                .setName('Open attachments with default external application:')
                .setDesc(`With this option enabled, when you open an attachment by holding ${key}, the attachment opens in default external application.`);

            const external_exclude_ext = new Setting(containerEl)
                .setName('Exclude the following extensions:')
                .setDesc('Enter a list of extensions separated by comma (e.g.: .md, .pdf) for which the default Obsidian behavior applies instead of opening the file in the default external application.')
                .addText(text => {
                    text.setPlaceholder('Enter a list of extensions');
                    text.setValue(this.plugin.settings.openAttachmentExternalExtExcluded);
                    text.onChange(async (value: string) => {
                        this.plugin.settings.openAttachmentExternalExtExcluded = validate_exts(text, value);
                        this.debouncedSaveSettings();
                    });
                    // Event when the text field loses focus
                    text.inputEl.onblur = async () => {
                        // Validate and process the extensions
                        text.setValue(this.plugin.settings.openAttachmentExternalExtExcluded); // Set the processed value back to the text field
                    };
                });

            // Initially set the visibility based on the current setting
            external_exclude_ext.settingEl.style.display = this.plugin.settings.openAttachmentExternal ? '' : 'none';

            external_toggle.addToggle(toggle => toggle
                .setValue(this.plugin.settings.openAttachmentExternal)
                .onChange(async (value: boolean) => {
                    // Hide external_exclude_ext if the toggle is off
                    this.plugin.settings.openAttachmentExternal = value;
                    this.debouncedSaveSettings();
                    external_exclude_ext.settingEl.style.display = value ? '' : 'none';
                }));

            if (Platform.isMacOS) {
                key = '⌘+⌥';
            } else { // Default to Windows/Linux bindings
                key = 'Ctrl+Alt';
            }

            const reveal_toggle = new Setting(containerEl)
                .setName("Reveal attachments in system's file manager:")
                .setDesc(`With this option enabled, when you open an attachment by holding ${key}, the attachment is shown in the system's file manager.`);

            const reveal_exclude_ext = new Setting(containerEl)
                .setName('Exclude the following extensions:')
                .setDesc('Enter a list of extensions separated by comma (e.g.: .md, .pdf) for which the default Obsidian behavior applies instead of revealing the file in the system\'s file manager')
                .addText(text => {
                    text.setPlaceholder('Enter a list of extensions');
                    text.setValue(this.plugin.settings.revealAttachmentExtExcluded);
                    text.onChange(async (value: string) => {
                        this.plugin.settings.revealAttachmentExtExcluded = validate_exts(text, value);
                        this.debouncedSaveSettings();
                    });
                    // Event when the text field loses focus
                    text.inputEl.onblur = async () => {
                        // Validate and process the extensions
                        text.setValue(this.plugin.settings.revealAttachmentExtExcluded); // Set the processed value back to the text field
                    };
                });

            // Initially set the visibility based on the current setting
            reveal_exclude_ext.settingEl.style.display = this.plugin.settings.revealAttachment ? '' : 'none';

            reveal_toggle.addToggle(toggle => toggle
                .setValue(this.plugin.settings.revealAttachment)
                .onChange(async (value: boolean) => {
                    // Hide reveal_exclude_ext if the toggle is off
                    this.plugin.settings.revealAttachment = value;
                    this.debouncedSaveSettings();
                    reveal_exclude_ext.settingEl.style.display = value ? '' : 'none'; 
                }));
        }

        new Setting(containerEl).setName('Managing').setHeading();

        new Setting(containerEl)
            .setName('Show option in context menu of embedded images to delete them:')
            .setDesc("With this option enabled, when you right click on an embedded image in your note, an option 'Delete image' \
                will be shown in the context menu.")
            .addToggle(toggle => {
                toggle
                .setValue(this.plugin.settings.showDeleteMenuForEmbedded)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.showDeleteMenuForEmbedded = value;
                    if(value) {
                        this.plugin.addDeleteMenuForEmbeddedImages('all');   
                    } else {
                        this.plugin.removeDeleteMenuForEmbeddedImages('all');
                    }
                    
                    this.debouncedSaveSettings();
                })
            });

        new Setting(containerEl)
            .setName('Show option in context menu to delete attachment files:')
            .setDesc("With this option enabled, when you right click on a Wikilink in your note, an 'Delete file' \
                will be shown in the context menu.")
            .addToggle(toggle => {
                toggle
                .setValue(this.plugin.settings.showDeleteMenu)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.showDeleteMenu = value;
                    this.plugin.addDeleteMenuForLinks(value);
                    this.debouncedSaveSettings();
                })
            });
            
        new Setting(containerEl)
            .setName('Remove Wikilink when deleting an attachment file:')
            .setDesc('With this option enabled, when you right click on a Wikilink or MarkDown link in your note to delete the attachment, \
                not only the attachment will be deleted, but also the Wikilink or MarkDown link, respectively, will be removed from your note.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.removeWikilinkOnFileDeletion)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.removeWikilinkOnFileDeletion = value;
                    this.debouncedSaveSettings();
                }));

        // const update_visibilty_remove_wikilink = (status:boolean) => {
        //     if(status) {
        //         remove_wikilink_setting.settingEl.style.display='';
        //     } else {
        //         remove_wikilink_setting.settingEl.style.display='none';
        //     }
        // }
        // 
        // update_visibilty_remove_wikilink(this.plugin.settings.showDeleteMenu);
    

        new Setting(containerEl)
            .setName('Automatically remove attachment folders when empty:')
            .setDesc('With this option enabled, whenever an attachment folder is left empty — after deleting an \
                attachment, or after its contents were moved elsewhere — the folder itself is removed as well. \
                An empty folder is removed without asking, since there is nothing in it to lose; it goes to the \
                trash, according to your Obsidian deletion preference.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.deleteAttachmentFolderWhenEmpty)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.deleteAttachmentFolderWhenEmpty = value;
                    this.debouncedSaveSettings();
                }));

        new Setting(containerEl)
            .setName('Let attachments follow the text that uses them:')
            .setDesc('With this option enabled, when text containing attachment links is moved into another note — \
                by extracting a selection, merging notes, or an ordinary cut-and-paste — the attachments are moved \
                into that note’s attachment folder instead of being left behind. The same rules as the \
                "Move stray attachments" command apply: only folders managed by this plugin are touched, and an \
                attachment still used by the note it is filed under stays where it is. Because this reacts to any \
                edit that adds such a link, an attachment can move a moment after you type one by hand. Leave it \
                off to run the "Move stray attachments" command yourself instead.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.moveStrayAttachmentsAutomatically)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.moveStrayAttachmentsAutomatically = value;
                    this.debouncedSaveSettings();
                }));

        new Setting(containerEl)
            .setName('Rename the attachment folder automatically and update all links correspondingly:')
            .setDesc('With this option enabled, when you rename/move an note, if the renamed note has an attachment folder connected to it, \
                its attachment folder is renamed/moved to a new name/location corresponding to the new name of the note.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoRenameAttachmentFolder)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.autoRenameAttachmentFolder = value;
                    this.debouncedSaveSettings();
                }));

        new Setting(containerEl)
            .setName('Delete the attachment folder automatically when the corresponding note is deleted:')
            .setDesc('With this option enabled, when you delete a note, if the deleted note has an attachment folder connected to it, \
                its attachment folder will be deleted as well. \
                Note: automatic deletion only works when the name of the attachment folder contains ${notename}.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoDeleteAttachmentFolder)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.autoDeleteAttachmentFolder = value;
                    this.debouncedSaveSettings();
                }));

        new Setting(containerEl)
            .setName('Ask confirmation before deleting a non-empty attachment folder:')
            .setDesc('If enabled, you are asked before an attachment folder that still contains files is deleted. \
                Empty folders are never asked about — see the option above.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.confirmDeleteAttachmentFolder)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.confirmDeleteAttachmentFolder = value;
                    this.debouncedSaveSettings();
                }));

        new Setting(containerEl).setName('Attachment folder').setHeading();

        if (Platform.isDesktopApp) {
            this.addAttachmentFolderSettings(containerEl);
        }

        new Setting(containerEl)
            .setName('Hide attachment folders:')
            .setDesc('With this option enabled, the attachment folders will not be shown.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideAttachmentFolders)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.hideAttachmentFolders = value;
                    this.debouncedSaveSettings();
                    updateVisibilityAttachmentFolders(this.plugin);
                }));

        if (Platform.isDesktopApp) {
            new Setting(containerEl).setName('Attachments').setHeading();

            new Setting(containerEl)
                .setName('Name of the imported attachments:')
                .setDesc(createFragment((frag) => {
                    frag.appendText('Choose how to name the imported attachments, using the following variables as a placeholder:');
                    const ul = frag.createEl('ul');
                    ul.createEl('li', { text: '${original} for the original name (omitting file extension) of the imported attachment files' });
                    ul.createEl('li', { text: '${notename} for the name of the MarkDown note into which the attachment files will be imported' });
                    ul.createEl('li', { text: '${date} for the current date' })
                    ul.createEl('li', { text: '${uuid} for a 128-bit Universally Unique Identifier' })
                    ul.createEl('li', { text: '${md5} for a MD5 hash of the imported file' });
                    frag.appendText('Note that the file extension of the imported attachments is preserved.')
                }))
                .addText(text => {
                    text.setPlaceholder('Enter attachment name');
                    text.setValue(this.plugin.settings.attachmentName);
                    text.onChange(async (value: string) => {
                        if (value.trim() === '') {
                            value = '${original}'; // TODO: improve checking the input by the user that it is not empty
                        }
                        this.plugin.settings.attachmentName = value;
                        this.debouncedSaveSettings();
                    })
                });

            new Setting(containerEl)
                .setName('Date format for files:')
                .setDesc(createFragment((frag) => {
                    frag.appendText('Choose the date format for the placeholder ${date} in the attachment name, based on ');
                    frag.createEl('a', {
                        href: 'https://momentjscom.readthedocs.io/en/latest/moment/04-displaying/01-format',
                        text: 'momentjs',
                    });
                    frag.appendText(' syntax.');
                }))
                .addText(text => {
                    text.setPlaceholder('Enter date format');
                    text.setValue(this.plugin.settings.dateFormat);
                    text.onChange(async (value: string) => {
                        this.plugin.settings.dateFormat = value;
                        this.debouncedSaveSettings();
                    })
                });
        }

        if (Platform.isDesktopApp) {

            new Setting(containerEl).setName('Commands and hotkeys').setHeading();

            new Setting(containerEl).setName(createFragment((frag:DocumentFragment) => {
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
                }));
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

    addAttachmentFolderSettings(containerEl:HTMLElement): void  {

        this.cleanUpAttachmentFolderSettings();

        const attachmentFolderLocationSetting = new Setting(containerEl)
            .setName('Default location for new attachments:')
            .setDesc(createFragment((frag) => {
                frag.appendText('Where newly added attachments are placed.');
            }));

        const attachmentFolderSetting = new Setting(containerEl)
            .setName('Attachment folder path:')
            .setDesc(createFragment((frag) => {
                frag.appendText('Place newly created attachment files, such as images created via drag-and-drop or audio recordings, in this folder.  Use the following variables as a placeholder:');
                const ul = frag.createEl('ul');
                ul.createEl('li', { text: '${notename} for the name of the MarkDown note into which the attachment files will be imported' });
            })).addText(text => {
                text.setPlaceholder('Example: folder 1/folder');
                text.setValue(this.plugin.settings.attachmentFolderPath);
                text.onChange(async (value: string) => {
                    this.plugin.settings.attachmentFolderPath = value;
                    this.debouncedSaveSettings(():void => {
                        this.saveOrReport();
                        this.plugin.parseAttachmentFolderPath();
                        updateVisibilityAttachmentFolders(this.plugin);
                    });
                })
        });

        attachmentFolderLocationSetting.addDropdown(dropdown => {
            const updateVisibilityFolderPath = (folderLocation:AttachmentFolderLocationType):void => {
                switch(folderLocation) {
                case AttachmentFolderLocationType.ROOT:
                case AttachmentFolderLocationType.CURRENT:
                    attachmentFolderSetting.settingEl.toggleClass('import-plugin-setting-hidden', true);
                    break;
                case AttachmentFolderLocationType.FOLDER:
                case AttachmentFolderLocationType.SUBFOLDER:
                    attachmentFolderSetting.settingEl.toggleClass('import-plugin-setting-hidden', false);
                    break;
                }
            }

            dropdown.addOption(AttachmentFolderLocationType.ROOT, 'Vault folder');
            dropdown.addOption(AttachmentFolderLocationType.FOLDER, 'In the folder specified below');
            dropdown.addOption(AttachmentFolderLocationType.CURRENT, 'Same folder as current file');
            dropdown.addOption(AttachmentFolderLocationType.SUBFOLDER, 'In subfolder under current folder');

            dropdown.setValue(this.plugin.settings.attachmentFolderLocation);
            updateVisibilityFolderPath(this.plugin.settings.attachmentFolderLocation);
                                    
            dropdown.onChange(async (value: string) => {
                if(!isAttachmentFolderLocationType(value)) {
                    console.error('Invalid option selection:', value);
                    return;
                }

                this.plugin.settings.attachmentFolderLocation = value;
                updateVisibilityFolderPath(value);
            
                this.debouncedSaveSettings(():void => {
                    this.saveOrReport();
                    this.plugin.parseAttachmentFolderPath();
                    updateVisibilityAttachmentFolders(this.plugin);
                });
            })
        });

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
