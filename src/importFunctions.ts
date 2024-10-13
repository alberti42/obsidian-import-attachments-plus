// importFunctions.ts

import { Editor, MarkdownFileInfo, MarkdownView, normalizePath, Notice, Platform } from "obsidian";
import { EditorSelection } from '@codemirror/state';

import { promises as fs } from 'fs';  // This imports the promises API from fs

import ImportAttachments from "main";
import * as Utils from "utils";
import { AttachmentFolderLocationType, ImportActionType, ImportFromVaultOptions, ImportOperationType, ImportSettingsInterface, MultipleFilesImportTypes, OverwriteChoiceOptions, ParsedPath, YesNoTypes } from "types";
import { FolderImportErrorModal, ImportActionTypeModal, ImportFromVaultChoiceModal, OverwriteChoiceModal } from "ImportAttachmentsModal";

let plugin: ImportAttachments;

export function setPlugin(p:ImportAttachments) {
    plugin = p;
}

export async function editor_drop_cb(evt: DragEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) {
    
}

export async function editor_drop_cb1(evt: DragEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) {

    // Check if the event has already been handled
    if (evt.defaultPrevented) return;

    if (!(view instanceof MarkdownView)) {
        console.error('No view provided')
        return;
    }

    // If the Alt key (on macOS) or Ctrl key (on other systems) is pressed, handle the drop in a specific way
    const altKeyPressed = Platform.isMacOS ? evt.altKey : evt.ctrlKey;
    if (altKeyPressed) {
        // Follow standard behavior where a link to the external file is created
        return;
    } else {
        // Prevent other handlers from executing
        evt.preventDefault();
    }

    const doForceAsking = evt.shiftKey; // Check if Shift was pressed

    // Handle the dropped files
    const files = evt?.dataTransfer?.files;
    if(!files) return;

    if (files.length > 0) {
        const dropPos = editor.cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
        
        if(dropPos===null) {
            console.error('Unable to determine drop position');
            return;
        }
        
        // Get the current selection
        const user_selection = editor.cm.state.selection;
        // const user_selection_alt = codemirror.viewState.state.selection;
        const user_selection_main = user_selection.main;
        
         // Check if there is selected text
        const isTextSelected = !user_selection_main.empty;
        const selectionStart = user_selection_main.from;
        const selectionEnd = user_selection_main.to;
        
        // Check if the drop position is within the selected text range
        const isDropWithinSelection = isTextSelected && dropPos >= selectionStart && dropPos <= selectionEnd;

        if(!isDropWithinSelection) {
            // If the drop position is not in the current selection, we redefine the current selection to the new drop position
            editor.cm.dispatch({
                selection: EditorSelection.single(dropPos)
            });
        }
        
        // Handle the files as per your existing logic
        handleFiles(Array.from(files), editor, view, doForceAsking, ImportOperationType.DRAG_AND_DROP);
    
    } else {
        console.error('No files dropped');
    }
}

export async function editor_paste_cb(evt: ClipboardEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) {

}

export async function editor_paste_cb1(evt: ClipboardEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) {

    // Check if the event has already been handled
    if (evt.defaultPrevented) return;

    if (!(view instanceof MarkdownView)) {
        console.error('No view provided')
        return;
    }

    const clipboardData = evt.clipboardData;
    if (clipboardData) {
        const files = clipboardData.files;
        // const items = clipboardData.items;

        if (files && files.length > 0) {

            // Check if all files have a non-empty 'path' property
            const filesArray = Array.from(files);
            const allFilesHavePath = filesArray.every(file => file.path && file.path !== "");
            if(allFilesHavePath) {
                evt.preventDefault();

                const doToggleEmbedPreference = false; // Pretend shift was not pressed
                handleFiles(filesArray, editor, view, doToggleEmbedPreference, ImportOperationType.PASTE);
            } else {
                // Nothing to do, let Obsidian handle the case of pasted graphics.
                // The file name will be suggested through the monkey-patched function `getAvailablePathForAttachments`.

                // const t = Array.from(files);
                // console.log(t);
                // console.log(clipboardData);
                // console.log(clipboardData.dropEffect);
                // console.log(clipboardData.files);
                // console.log(clipboardData.items);
                // console.log(clipboardData.types);
                // const arrayBuffer = await t[0].arrayBuffer();
                // fs.appendFile("path/test.png", Buffer.from(arrayBuffer));
            }
        }
        // console.error("No files detected in paste data.");
    }
}

async function handleFiles(files: File[], editor: Editor, view: MarkdownView, doForceAsking: boolean, importType: ImportOperationType) {

    const {nonFolderFilesArray, foldersArray} = await Utils.filterOutFolders(Array.from(files));

    if(foldersArray.length>0) {
        const modal = new FolderImportErrorModal(plugin, foldersArray);
        modal.open();
        await modal.promise;
    }

    let actionFilesOnImport = ImportActionType.COPY; // for safety, the defualt is COPY
    let lastActionFilesOnImport = ImportActionType.COPY; // for safety, the defualt is COPY
    switch (importType) {
        case ImportOperationType.DRAG_AND_DROP:
            actionFilesOnImport = plugin.settings.actionDroppedFilesOnImport;
            lastActionFilesOnImport = plugin.settings.lastActionDroppedFilesOnImport;
            break;
        case ImportOperationType.PASTE:
            actionFilesOnImport = plugin.settings.actionPastedFilesOnImport;
            lastActionFilesOnImport = plugin.settings.lastActionPastedFilesOnImport;
            break;
    }

    let embedOption = plugin.settings.embedFilesOnImport;
    const lastEmbedOption = plugin.settings.lastEmbedFilesOnImport;

    if (doForceAsking || actionFilesOnImport == ImportActionType.ASK_USER || embedOption == YesNoTypes.ASK_USER) {
        const modal = new ImportActionTypeModal(plugin, lastActionFilesOnImport, lastEmbedOption);
        modal.open();
        const choice = await modal.promise;
        if (choice == null) return;
        actionFilesOnImport = choice.action;
        switch (importType) {
            case ImportOperationType.DRAG_AND_DROP:
                if (choice.rememberChoice) {
                    plugin.settings.actionDroppedFilesOnImport = actionFilesOnImport;
                }
                plugin.settings.lastActionDroppedFilesOnImport = actionFilesOnImport;
                break;
            case ImportOperationType.PASTE:
                if (choice.rememberChoice) {
                    plugin.settings.actionPastedFilesOnImport = actionFilesOnImport;
                }
                plugin.settings.lastActionPastedFilesOnImport = actionFilesOnImport;
                break;
        }
        embedOption = choice.embed;
        if (choice.rememberChoice) {
            plugin.settings.embedFilesOnImport = embedOption;
        }
        plugin.settings.lastEmbedFilesOnImport = embedOption;
        plugin.debouncedSaveSettings();
    }

    const doEmbed = (embedOption == YesNoTypes.YES);

    const importSettings = {
        embed: doEmbed,
        action: actionFilesOnImport,
    };

    moveFileToAttachmentsFolder(nonFolderFilesArray, editor, view, importSettings);
}

// Function to move files to the attachments folder using fs.rename
async function moveFileToAttachmentsFolder(filesToImport: File[], editor: Editor, view: MarkdownView, importSettings: ImportSettingsInterface) {

    // Get the current active note if md_file is not provided
    // const md_active_file = this.app.workspace.getActiveFile();
    // if (md_active_file == null) {
    //  throw new Error("The active note could not be determined.");
    // }

    const md_file = view.file;
    if(md_file===null) { throw new Error("The active note could not be determined."); }

    const md_file_parsed = Utils.parseFilePath(md_file.path)

    const cursor = editor.getCursor(); // Get the current cursor position before insertion

    if (filesToImport.length > 1 && plugin.settings.multipleFilesImportType != MultipleFilesImportTypes.INLINE) {
        // Check if the cursor is at the beginning of a line
        if (cursor.ch !== 0) {
            // If not, insert a newline before the link
            editor.replaceRange('\n', cursor);
            // You need to explicitly set the cursor to the new position after the newline
            editor.setCursor({ line: cursor.line + 1, ch: 0 });
        }
    }

    const multipleFiles = filesToImport.length > 1;

    const tasks = filesToImport.map(async (fileToImport:File): Promise<string | null> => {
        const originalFilePath = fileToImport.path;
        let destFilePath = await createAttachmentName(originalFilePath,md_file_parsed,fileToImport);

        // Check if file already exists in the vault
        const existingFile = await Utils.doesFileExist(plugin.app.vault,destFilePath);

        // If the original file is already in the vault
        const relativePath = await Utils.getFileInVault(plugin.vaultPath, originalFilePath)
        if (relativePath) {

            // If they are the same file, then skip copying/moving, we are alrady done
            if (existingFile && Utils.arePathsSameFile(plugin.app.vault, relativePath, destFilePath)) return destFilePath;

            const modal = new ImportFromVaultChoiceModal(plugin, originalFilePath, relativePath, importSettings.action);
            modal.open();
            const choice = await modal.promise;
            if (choice == null) { return null; }
            switch (choice) {
                case ImportFromVaultOptions.SKIP:
                    return null;
                case ImportFromVaultOptions.LINK:
                    importSettings.action = ImportActionType.LINK;
                    break;
                case ImportFromVaultOptions.COPY:
                    importSettings.action = ImportActionType.COPY;
                    break;
            }
        }
        
        // Decide what to do if a file with the same name already exists at the destination
        if (existingFile && importSettings.action != ImportActionType.LINK) {
            const modal = new OverwriteChoiceModal(plugin, originalFilePath, destFilePath);
            modal.open();
            const choice = await modal.promise;
            if (choice == null) { return null; }
            switch (choice) {
                case OverwriteChoiceOptions.OVERWRITE:
                    // continue
                    break;
                case OverwriteChoiceOptions.KEEPBOTH:
                    destFilePath = Utils.findNewFilename(plugin.app.vault,destFilePath);
                    break;
                case OverwriteChoiceOptions.SKIP:
                    return null;
            }
        }

        try {
            switch (importSettings.action) {
                case ImportActionType.MOVE:
                    await fs.rename(originalFilePath, Utils.joinPaths(plugin.vaultPath,destFilePath));
                    return destFilePath;
                case ImportActionType.COPY:
                    await fs.copyFile(originalFilePath, Utils.joinPaths(plugin.vaultPath,destFilePath));
                    return destFilePath;
                case ImportActionType.LINK:
                default:
                    return relativePath;
            }
        } catch (error) {
            const msg = "Failed to process the file";
            new Notice(msg + ".");
            console.error(msg + ":", originalFilePath, error);
            return null;  // Indicate failure in processing this file
        }
    });

    // Wait for all tasks to complete
    const results = await Promise.all(tasks);

    // Now process the results
    let counter = 0;
    results.forEach((importedFilePath: (string | null)) => {
        if (importedFilePath) {
            insertLinkToEditor(importedFilePath, editor, md_file.path, importSettings, multipleFiles ? ++counter : undefined);
        }
    });

    if (counter > 0) {
        let operation = '';
        switch (importSettings.action) {
            case ImportActionType.MOVE:
                operation = 'Moved';
                break;
            case ImportActionType.COPY:
                operation = 'Copied';
                break;
        }
        new Notice(`${operation} successfully ${counter} files to the attachments folder.`);
    }
}

// Function to insert links to the imported files in the editor
function insertLinkToEditor(importedFilePath: string, editor: Editor, md_file: string, importSettings: ImportSettingsInterface, counter?: number) {

    /*
    let relativePath;
    switch (this.settings.linkFormat) {
        case LinkFormat.RELATIVE:
            relativePath = relative(currentNoteFolderPath, importedFilePath);
            break;
        case LinkFormat.ABSOLUTE:
        default:
            relativePath = relative(this.vaultPath, importedFilePath);
            break;
    }
    */

    let prefix = '';
    let postfix = '';
    if (counter) {
        // if multiple files are imported
        switch (plugin.settings.multipleFilesImportType) {
            case MultipleFilesImportTypes.BULLETED:
                prefix = '- ';
                postfix = '\n';
                break;
            case MultipleFilesImportTypes.NUMBERED:
                prefix = `${counter}. `;
                postfix = '\n';
                break;
            case MultipleFilesImportTypes.INLINE:
                if (counter > 1) {
                    // if it is not the first item
                    prefix = '\n\n';
                }
                break;
        }
    }

    // Get the current selection
    const main_selection = editor.cm.state.selection.main;
    
    const file = Utils.createMockTFile(plugin.app.vault,importedFilePath);
    const filename = file.name;
    const customDisplayText = (():string=>{
        let text="";
        if(plugin.settings.customDisplayText) {
            text = filename;
        }
        // if a single file is imported
        if(!counter)
        {
            if(plugin.settings.useSelectionForDisplayText) {
                // Extract the selected text
                // const selectedText_alt = editor.getSelection();
                const selectedText = editor.cm.state.doc.sliceString(main_selection.from, main_selection.to);
                
                // If the user has selected some text, this will be used for the display text 
                if(selectedText.length>0) text = selectedText;
            }
        }
        return text;
    })();
    
    const generatedLink = plugin.app.fileManager.generateMarkdownLink(file,md_file,undefined,(plugin.settings.customDisplayText) ? customDisplayText : undefined);

    const MDLink_regex = new RegExp('^(!)?(\\[[^\\]]*\\])(.*)$');
    const WikiLink_regex = new RegExp('^(!)?(.*?)(|[^|]*)?$');
    
    const useMarkdownLinks = plugin.app.vault.getConfig("useMarkdownLinks");

    let offset;
    let processedLink;
    let selectDisplayedText = false;
    if(useMarkdownLinks) { // MD links
        // Perform the match
        const match = generatedLink.match(MDLink_regex);

        offset = generatedLink.length;
        processedLink = generatedLink;
        if(match) {
            offset = 1;
            processedLink = "[" + customDisplayText + "]" + match[3];
            selectDisplayedText = true;
        }
    } else { // Wiki links
        // Perform the match
        const match = generatedLink.match(WikiLink_regex);

        offset = generatedLink.length;
        processedLink = generatedLink;
        if(match) {
            offset = match[2].length;
            processedLink = match[2] + (match[3] ? match[3] : "");
            selectDisplayedText = true;
        }
    }

    if (importSettings.embed) {
        prefix = prefix + '!';
    }

    const linkText = prefix + processedLink + postfix;

    const cursor_from = editor.getCursor("from");  // Get the current cursor position before insertion
    const cursor_to = editor.getCursor("to");  // Get the current cursor position before insertion
    
    // Insert the link text at the current cursor position
    editor.replaceRange(linkText, cursor_from, cursor_to);

    if (counter == 0) {
        if (selectDisplayedText) {
            // Define the start and end positions for selecting 'baseName' within the inserted link
            const startCursorPos = {
                line: cursor_to.line,
                ch: cursor_to.ch + offset + prefix.length,
            };
            const endCursorPos = {
                line: cursor_to.line,
                ch: startCursorPos.ch + customDisplayText.length,
            };
            
            // Set the selection range to highlight 'baseName'
            editor.setSelection(startCursorPos, endCursorPos);
        } else {
            const newCursorPos = {
                line: cursor_to.line,
                ch: cursor_to.ch + linkText.length
            };

            // Move cursor to the position right after the link
            editor.setCursor(newCursorPos);
        }
    } else {
        const newCursorPos = {
            line: cursor_from.line,
            ch: cursor_from.ch + linkText.length
        };

        // Move cursor to the position right after the link
        editor.setCursor(newCursorPos);
    }
}

export async function createAttachmentName(originalFilePath:string, md_file?: ParsedPath, source?:ArrayBuffer | File): Promise<string> {

    const originalFilePath_parsed = Utils.parseFilePath(originalFilePath);
    const namePattern = plugin.settings.attachmentName;
    const dateFormat = plugin.settings.dateFormat;
    
    const fileToImportName = originalFilePath_parsed.filename;
    
    let attachmentName = namePattern.replace(/\$\{original\}/g, fileToImportName)
                                    .replace(/\$\{uuid\}/g, Utils.uuidv4())
                                    .replace(/\$\{date\}/g, Utils.formatDateTime(dateFormat));

    if(source && namePattern.includes('${md5}')) {
        let hash = ''
        try {
            if(source instanceof ArrayBuffer) {
                hash = await Utils.hashArrayBuffer(source);
            } else if(source instanceof File) {
                hash = await Utils.hashFile(source.path);
            }
        } catch (err: unknown) {
            console.error('Error hashing the file:', err);
        }
        attachmentName = attachmentName.replace(/\$\{md5\}/g, hash);
    }

    // add the extension
    attachmentName += originalFilePath_parsed.ext;

    const attachmentsFolderPath = getAttachmentFolderOfMdNote(md_file);
    
    // Ensure the directory exists before moving the file
    await Utils.createFolderIfNotExists(plugin.app.vault,attachmentsFolderPath);

    return Utils.joinPaths(attachmentsFolderPath,attachmentName);
}


// Get attachment folder path based on current note
export function getAttachmentFolderOfMdNote(md_file?: ParsedPath): string { 
    // Get the current active note if md_file is not provided
    if (md_file===undefined) {
        const md_active_file = plugin.app.workspace.getActiveFile();
        if (md_active_file === null) {
            throw new Error("The active note could not be determined.");
        }
        md_file = Utils.parseFilePath(md_active_file.path);
    }

    if(md_file.ext !== ".md" && md_file.ext !== ".canvas") {
        throw new Error("No Markdown file was provided.");
    }
    
    const currentNoteFolderPath = md_file.dir;
    const notename = md_file.filename;

    const folderPath = plugin.settings.attachmentFolderPath.replace(/\$\{notename\}/g, notename);

    let attachmentsFolderPath;
    switch(plugin.settings.attachmentFolderLocation) {
    case AttachmentFolderLocationType.CURRENT:
        attachmentsFolderPath = currentNoteFolderPath;
        break;
    case AttachmentFolderLocationType.SUBFOLDER:
        attachmentsFolderPath = Utils.joinPaths(currentNoteFolderPath, folderPath)
        break;
    case AttachmentFolderLocationType.ROOT:
        attachmentsFolderPath = '/';
        break;
    case AttachmentFolderLocationType.FOLDER:
        attachmentsFolderPath = folderPath
        break;
    }

    attachmentsFolderPath = normalizePath(attachmentsFolderPath);

    return attachmentsFolderPath;           
}


export async function choose_file_to_import_cb(importSettings: ImportSettingsInterface) {
    const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = markdownView?.editor;

    if (!editor) {
        const msg = "No active markdown editor found.";
        console.error(msg);
        new Notice(msg);
        return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true; // Allow selection of multiple files

    input.onchange = async (e: Event) => {
        const target = e.target as HTMLInputElement;
        const files = target.files; // This is already a FileList

        if (files && files.length > 0) {
            // Directly pass the FileList to the processing function
            await moveFileToAttachmentsFolder(Array.from(files), editor, markdownView, importSettings);
        } else {
            const msg = "No files selected or file access error.";
            console.error(msg);
            new Notice(msg);
        }
    };
    input.click(); // Trigger the file input dialog
}


async function editor_drop_cb_test(evt: DragEvent, editor: Editor, view: MarkdownView | MarkdownFileInfo) {
//  let contentToInsert = null;
    
//   const draggable = this.app.dragManager.draggable;
// debugger
// // Check if a draggable object exists
// if (draggable) {
//     // If `info` is an instance of `EX` and the shift (on macOS) or alt key (on others) is pressed
//     if (view instanceof MarkdownView && (Platform.isMacOS ? evt.shiftKey : evt.altKey)) {
//         evt.preventDefault(); // Prevent the default behavior
//         // view.handleDrop(event, draggable, false); // Delegate drop handling to `EX`
//         return true; // Event handled
//     }

//     const getPath = function() {
//         // Check if the 'file' property exists in the 'info' object, return its path or an empty string
//         return (view.file?.path) || "";
//     };

//     // Generate markdown links or other content based on the dragged object
//     // contentToInsert = ZM(this.app, draggable, getPath()).join("\n");
// } else {
//         // Trigger an "editor-drop" event if not prevented and handle the drop event
//         if (event.defaultPrevented || this.app.workspace.trigger("editor-drop", event, view.editor, view)) {
//             return true;
//         }

//         // Handle text or other content from the drop
//         if (!event.shiftKey) {
//             contentToInsert = this.handleDataTransfer(event.dataTransfer);
//         }
        
//         // If no content was extracted, attempt to handle it as an editor drop
//         if (!contentToInsert) {
//             contentToInsert = this.handleDropIntoEditor(event);
//         }
//     }

//     // Get the active editor and position the drop based on mouse coordinates
//     const editor = view.editor.activeCM;
//     editor.dispatch({
//         selection: be.single(editor.posAtCoords({
//             x: event.clientX,
//             y: event.clientY
//         }))
//     });

//     // If content is a string, insert it into the editor
//     if (String.isString(contentToInsert)) {
//         editor.dispatch(editor.state.replaceSelection(contentToInsert)); // Insert content at the selection
//         editor.focus(); // Focus the editor after inserting content
//         event.preventDefault(); // Prevent default drop behavior
//         return true; // Event handled
//     }

    return false; // Event not handled
}