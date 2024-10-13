// patchImportFunctions.ts

/* eslint-disable @typescript-eslint/no-inferrable-types */

import { App, Vault, Attachment, TFile, TFolder, DataWriteOptions, Platform, ClipboardManagerPrototypes, ClipboardManager, MarkdownFileInfo, MarkdownView } from 'obsidian';
import ImportAttachments from 'main';

import * as Utils from 'utils';
import * as fs from 'fs';  // This imports the promises API from fs
import { getFips } from 'crypto';

// Save a reference to the original method for the monkey patch
let originalGetAvailablePathForAttachments: ((fileName: string, extension: string, currentFile: TFile | null, data?: ArrayBuffer) => Promise<string>) | null = null;
let originalSaveAttachment: ((fileName: string, fileExtension: string, fileData: ArrayBuffer) => Promise<TFile>) | null = null;
let originalImportAttachments: ((attachments: Attachment[], targetFolder: TFolder | null) => Promise<TFile[]>) | null = null;
let originalCreateBinary: ((path: string, data: ArrayBuffer, options?: DataWriteOptions) => Promise<TFile>) | null = null;
let originalResolveFilePath: ((filepath: string) => TFile|null) | null = null;
let originalInsertFiles:((files: Attachment[]) => Promise<void>) | null = null;
let originalHandleDropIntoEditor:((event: DragEvent) => string | null) | null = null;
let originalHandlePaste:((event: ClipboardEvent)=>boolean) | null = null;
let originalHandleDataTransfer:((dataTransfer: DataTransfer | null) => string | null) | null = null;

let plugin: ImportAttachments;

let clipboardManagerProto: ClipboardManagerPrototypes;

export function setPlugin(p:ImportAttachments) {
    plugin = p;
}

function getClipboardManager() {
    let editorManager = plugin.app.embedRegistry.embedByExtension.md({
        app: plugin.app,
        containerEl: createDiv(),
        state: {}
    }, null, "");
    editorManager.load();
    editorManager.editable = true;
    editorManager.showEditor();

    clipboardManagerProto = Object.getPrototypeOf(editorManager.editMode.clipboardManager);
    editorManager.unload();

    console.log(clipboardManagerProto);
}

function unpatchObsidianImportFunctions() {
    if (originalResolveFilePath) {
        Vault.prototype.resolveFilePath = originalResolveFilePath;
        originalResolveFilePath = null;
    }

	if (originalCreateBinary) {
		Vault.prototype.createBinary = originalCreateBinary;
		originalCreateBinary = null;
	}

    if (originalGetAvailablePathForAttachments) {
        Vault.prototype.getAvailablePathForAttachments = originalGetAvailablePathForAttachments;
        originalGetAvailablePathForAttachments = null;
    }

	if(originalSaveAttachment) {
		App.prototype.saveAttachment = originalSaveAttachment;
		originalSaveAttachment = null;
	}

    if(originalImportAttachments) {
        App.prototype.importAttachments = originalImportAttachments;
        originalImportAttachments = null;
    }

    if(originalInsertFiles) {
        clipboardManagerProto.insertFiles = originalInsertFiles;
        originalInsertFiles = null;
    }

    if(originalHandleDropIntoEditor) {
        clipboardManagerProto.handleDropIntoEditor = originalHandleDropIntoEditor;
        originalHandleDropIntoEditor = null;
    }

    if(originalHandlePaste) {
        clipboardManagerProto.handlePaste = originalHandlePaste;
        originalHandlePaste = null;
    }

    if(originalHandleDataTransfer) {
        clipboardManagerProto.handleDataTransfer = originalHandleDataTransfer;
        originalHandleDataTransfer = null;
    }
}

function patchObsidianImportFunctions(plugin: ImportAttachments) {

    getClipboardManager();

    if (!originalResolveFilePath) {
        originalResolveFilePath = Vault.prototype.resolveFilePath;
    }

    // Monkey patch the createBinary method
    Vault.prototype.resolveFilePath = function patchedResolveFilePath(filepath: string): (TFile|null) {
        if (!originalResolveFilePath) {
            throw new Error("Could not execute the original resolveFilePath function.");
        }

        const resolvedFile = originalResolveFilePath.apply(this,[filepath]);

        console.log("ORIGINAL FILEPATH");
        console.log(filepath);
        console.log("RESOLVED FILE");
        console.log(resolvedFile);

        // debugger
        return resolvedFile;
    };


    if (!originalCreateBinary) {
        originalCreateBinary = Vault.prototype.createBinary;
    }

    // Monkey patch the createBinary method
    Vault.prototype.createBinary = async function patchedCreateBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<TFile> {
        if (!originalCreateBinary) {
            throw new Error("Could not execute the original createBinary function.");
        }

        const createdFile = await originalCreateBinary.apply(this,[path,data,options]);

        console.log("CREATED NEW BINARY");
        console.log(createdFile);


        return createdFile;
    };

    if (!originalImportAttachments) {
        originalImportAttachments = App.prototype.importAttachments;
    }

    // Monkey patch the getAvailablePathForAttachments method
    App.prototype.importAttachments = async function importAttachments(attachments: Attachment[], targetFolder: TFolder | null): Promise<TFile[]> {
        console.log("IMPORTATTACHMENTS");

        if (!originalImportAttachments) {
            // In the current implementation, the original `getAvailablePathForAttachments`` is not actually called
            throw new Error("Could not execute the original importAttachments function.");
        }

        // const importedAttachments = await originalImportAttachments.apply(this,[attachments,targetFolder]);

        // If there are no attachments, return an empty array
        if (attachments.length === 0) {
            return [];
        }

        const vault = this.vault;  // Access the vault (storage system)
        const importedFilePaths:TFile[] = [];  // Array to store the imported file paths

        // Loop through each attachment
        for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];
            let name = attachment.name;  // Attachment name
            const extension = attachment.extension;  // Attachment extension
            const filepath = attachment.filepath;  // Existing filepath
            let data = attachment.data;  // Data of the attachment (e.g., image or binary content)

            let resolvedPath;
            
            // If filepath exists, try to resolve the filepath
            if (filepath && (resolvedPath = vault.resolveFilePath(filepath))) {

                // Push the resolved file path to the array and continue
                importedFilePaths.push(resolvedPath);
                continue;
            }

            // Otherwise, if there is no existing file, process the data
            if (data instanceof Promise) {
                console.log("RESOLVED PROMISE");
                data = await data;  // Await the resolution of the data promise
            }

            // If no data is found, skip to the next attachment
            if (!data) {
                continue;
            }

            // If there's no filepath, but we have data, handle new file creation
            if (data) {
                let newFilePath;
                
                // If the attachment name is "Pasted image", append a timestamp to the name
                if (name === "Pasted image") {
                    name += " " + window.moment().format("YYYYMMDDHHmmss");
                }

                // If a folder is provided, get an available path inside the folder for the new file
                if (targetFolder) {
                    const availablePath = vault.getAvailablePath(targetFolder.getParentPrefix() + name, extension);
                    newFilePath = await vault.createBinary(availablePath, data);
                } else {
                    // Otherwise, save the attachment using the `saveAttachment` helper method
                    newFilePath = await this.saveAttachment(name, extension, data);
                }

                // Push the new file path to the array of imported files
                importedFilePaths.push(newFilePath);
            }
        }

        // Return the array of imported file paths
        return importedFilePaths;
    };

	if (!originalSaveAttachment) {
		originalSaveAttachment = App.prototype.saveAttachment;
	}

	// Function to save an attachment
	App.prototype.saveAttachment = async function patchedSaveAttachment(fileName: string, fileExtension: string, fileData: ArrayBuffer): Promise<TFile> {
		if (!originalSaveAttachment) {
            // In the current implementation, the original `saveAttachment`` is actually never called
			throw new Error("Could not execute the original saveAttachment function.");
		}

		// const attachmentName = await originalSaveAttachment.apply(this, [fileName, fileExtension, fileData]);

        // Get the currently active file in the workspace
        const activeFile = this.workspace.getActiveFile();

        // Find an available path for the attachment using the active file's context
        const availablePath = await this.vault.getAvailablePathForAttachments(fileName, fileExtension, activeFile, fileData);
        
        // Create a binary file at the available path with the provided data
        const attachmentName = await this.vault.createBinary(availablePath, fileData);

        console.log('CREATED ATTACHMENT FILE:');
        console.log(attachmentName);

		// Return the created file
		return attachmentName;
	}

    if (!originalInsertFiles) {
        originalInsertFiles = clipboardManagerProto.insertFiles;
    }

    clipboardManagerProto.insertFiles = async function (files: Attachment[]): Promise<void> {
        if (!originalInsertFiles) {
            throw new Error("Could not execute the original insertFiles function.");
        }

        // await originalInsertFiles.apply(this,[files]);

        // Loop through each file in the `files` array
        for (let t = 0; t < files.length; t++) {
            const file = files[t];
            const name = file.name;           // Get the file name
            const extension = file.extension; // Get the file extension
            const filepath = file.filepath;   // Get the file path (if it exists)
            let data = file.data;             // Get the file data (could be a promise with binary data)
            const isLastFile = t < files.length - 1;  // Check if this is the last file in the list

            // If the file has an existing path, resolve the file in the vault and embed it
            if (filepath && plugin.app.vault.resolveFilePath(filepath)) {
                const resolvedFile = plugin.app.vault.resolveFilePath(filepath);  // Resolve file in the vault
                this.insertAttachmentEmbed(resolvedFile, isLastFile);  // Embed the attachment in the editor
                continue;  // Move to the next file
            }

            // If the file is not resolved in the vault, process the external data (await the promise if necessary)
            if (data instanceof Promise) {
                data = await data;  // Await the resolution of the promise (binary data)
            }

            // If data exists after the promise is resolved, save the attachment
            if (data) {
                await this.saveAttachment(name, extension, data, isLastFile);
            }
        }
    }

    function readFileFromFilepath(filePath: string): Promise<ArrayBuffer | null> {
        return new Promise(async (resolve, reject) => {
            try {
                // Check if the 'fs' module is available and if the file exists
                if (fs && fs.existsSync(filePath)) {
                    // Read the file as a binary buffer using the promises API
                    const data = await fs.promises.readFile(filePath);
                    
                    // Convert the buffer to an ArrayBuffer and resolve
                    resolve(data.buffer);
                } else {
                    // If file doesn't exist, resolve with null
                    resolve(null);
                }
            } catch (error) {
                // In case of error, reject the promise
                reject(error);
            }
        });
    }

    function readFileFromArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise(async (resolve, reject) => {
            // If the file object supports the arrayBuffer method (modern API)
            if (file.arrayBuffer) {
                try {
                    const buffer = await file.arrayBuffer();  // Modern method to read the file
                    resolve(buffer);
                } catch (error) {
                    reject(error);
                }
            } else {
                // Fallback for older browsers using FileReader
                const reader = new FileReader();

                // Set up the onload event handler to resolve the promise with the ArrayBuffer
                reader.onload = function(event: ProgressEvent<FileReader>) {
                    if (event.target?.result) {
                        resolve(event.target.result as ArrayBuffer);
                    } else {
                        reject(new Error('Failed to read file as ArrayBuffer'));
                    }
                };

                // Set up error/abort handlers to reject the promise
                reader.onabort = reader.onerror = function(event) {
                    reject(event);
                };

                // Read the file as an ArrayBuffer
                reader.readAsArrayBuffer(file);
            }
        });
    }

    // See https://help.obsidian.md/Files+and+folders/Accepted+file+formats
    const supported_image_extensions = ['bmp', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'];

    function getBaseName(path: string): string {
        const lastSlashIndex = path.lastIndexOf("/");
        return lastSlashIndex === -1 ? path : path.slice(lastSlashIndex + 1);
    }

    function normalizePath(path: string): string {
        return cleanUpPath(path).normalize("NFC");
    }

    function cleanUpPath(path: string): string {
        // Replace multiple slashes with a single one and remove leading/trailing slashes
        let cleanedPath = path.replace(/([\\/])+/g, "/").replace(/(^\/+|\/+$)/g, "");
        
        // If the resulting path is empty, return "/"
        return cleanedPath === "" ? "/" : cleanedPath;
    }

    function extractArrayBuffer(typedArray: { buffer: ArrayBuffer; byteOffset: number; byteLength: number }): ArrayBuffer {
        return typedArray.buffer.slice(typedArray.byteOffset, typedArray.byteOffset + typedArray.byteLength);
    }

    function getFileExtension(filename: string): string {
        const lastDotIndex = filename.lastIndexOf(".");
        return lastDotIndex === -1 || lastDotIndex === filename.length - 1 || lastDotIndex === 0 
            ? "" 
            : filename.substr(lastDotIndex + 1).toLowerCase();
    }

    function getFilenameRemovingExtension(filePath: string): string {
        const baseName = getBaseName(filePath);  // Use the previously defined getBaseName function
        const lastDotIndex = baseName.lastIndexOf(".");

        return lastDotIndex === -1 || lastDotIndex === baseName.length - 1 || lastDotIndex === 0
            ? baseName
            : baseName.substr(0, lastDotIndex);  // Return the base name without the extension
    }

    function getFilesFromDataTransfer(dataTransfer: DataTransfer|null, sourceType: string, includeData: boolean, ): Attachment[] {
        
        if(!dataTransfer) return [] as Attachment[];

        let attachments: Attachment[] = [];  // This will hold the resulting attachments

        // Convert the items from the data transfer object into an array
        let items = Array.from(dataTransfer.items);

        // Iterate over each item in the data transfer object
        for (let i = 0; i < items.length; i++) {
            let file: File | null, item = items[i];

            // If the item is a file
            if (item.kind === "file") {
                // Get the file object from the item
                file = item.getAsFile();
                if (file) {
                    let filePath = (file as any).path || "";                  // Get the file path (or an empty string if none exists)
                    let fileName = file.name;                                 // Get the file name
                    let fileExtension = getFileExtension(fileName);           // Extract the file extension from the file name
                    let baseName = (fileName);                                // Extract the base name (without extension)
                    let fileData: Promise<ArrayBuffer | null> | null = null;  // Placeholder for the file's data (to be filled later)

                    // If no file path exists, adjust the file extension and name based on the file type
                    if (!filePath) {
                        let fileType = file.type;
                        if (fileType === "image/png") {
                            fileExtension = "png";  // Set the extension to PNG
                            baseName = "Pasted image";  // Rename it to "Pasted image"
                        } else if (fileType === "image/jpeg") {
                            fileExtension = "jpg";  // Set the extension to JPG
                            baseName = "Pasted image";  // Rename it to "Pasted image"
                        }
                    }

                    // If 'includeData' is true, prepare the file data
                    if (includeData) {
                        // If the file has a file path, load the data using `readFileFromFilepath`,
                        // otherwise use `readFileFromArrayBuffer` to extract the binary data from the file object
                        fileData = filePath ? readFileFromFilepath(filePath) : readFileFromArrayBuffer(file);
                    }

                    // Add the attachment to the array
                    attachments.push({
                        name: baseName,         // Base name of the file
                        filepath: filePath,     // The file path (could be empty)
                        extension: fileExtension,  // The file extension
                        data: fileData          // Binary data or null
                    });
                }
            }
        }

        // Handle special case for clipboard data on desktop apps (only if no files have been added)
        if (sourceType === "clipboard" && attachments.length === 0 && Platform.isDesktopApp && !dataTransfer.getData("text/plain") && !plugin.app.keymap.hasModifier("Shift")) {
            // Special case: Handle pasting an image from the clipboard (for desktop apps)
            let specialAttachment = (function() {
                let electron = window.require('electron');
                if (!electron) {
                    return null;
                }

                let clipboard = electron.remote.clipboard;
                let image = clipboard.readImage();

                // If there's an image in the clipboard, convert it to PNG
                if (image && !image.isEmpty()) {
                    let pngData = extractArrayBuffer(image.toPNG());
                    return {
                        name: "Pasted image",       // Name it "Pasted image"
                        extension: "png",           // Set extension to PNG
                        data: Promise.resolve(pngData)  // Store the image data
                    };
                }

                // Handle file paths from the clipboard (for Windows and macOS)
                let filePath = "";
                if (Platform.isWin) {
                    filePath = clipboard.readBuffer("FileNameW").toString("ucs2").replace("\0", "");
                } else if (Platform.isMacOS) {
                    filePath = clipboard.read("public.file-url");
                    if (filePath) {
                        filePath = filePath.replace("file://", "");
                        filePath = decodeURI(filePath);
                    }
                }

                if (!filePath) {
                    return null;
                }

                let baseName = getBaseName(normalizePath(filePath));   // Extract the file's base name
                let fileExtension = getFileExtension(baseName);  // Get the file's extension

                return {
                    filepath: filePath,                                 // Store the full file path
                    name: getFilenameRemovingExtension(baseName),       // Store the base name
                    extension: fileExtension,                           // Store the file extension
                    data: readFileFromFilepath(filePath)                // Read the binary data from the file
                };
            })();

            // If a special attachment was created (e.g., image from clipboard), add it to the array
            if (specialAttachment) {
                attachments.push(specialAttachment);
            }
        }

        return attachments;  // Return the array of attachments
    }

    if (!originalHandleDropIntoEditor) {
        originalHandleDropIntoEditor = clipboardManagerProto.handleDropIntoEditor;
    }

    // Handles the drop event when files or objects are dropped into the editor, specifically within the editor content
    clipboardManagerProto.handleDropIntoEditor = function(this: ClipboardManager, event: DragEvent): string | null {
        if (!originalHandleDropIntoEditor) {
            throw new Error("Could not execute the original handleDropIntoEditor function.");
        }

        // return originalHandleDropIntoEditor.apply(this,[event]);
        // debugger

        // If the Alt key (on macOS) or Ctrl key (on other systems) is pressed, handle the drop in a specific way
        if (Platform.isMacOS ? event.altKey : event.ctrlKey) {
            const fileLinks = [];
            const droppedItems = getFilesFromDataTransfer(event.dataTransfer, "drop", false); // Extract files from the drop data

            // Loop through the dropped items to create links or embedded content
            for (let i = 0; i < droppedItems.length; i++) {
                const filePath = droppedItems[i].filepath;
                if (filePath) {
                    // Try to resolve the file path within the vault
                    const resolvedFile = plugin.app.vault.resolveFilePath(filePath);
                    
                    if (resolvedFile) {
                        // If the file exists in the vault, generate a markdown link for it
                        fileLinks.push(plugin.app.fileManager.generateMarkdownLink(resolvedFile, this.info.file?.path || ""));
                    } else {
                        // If the file is not in the vault, treat it as an external file and create a link
                        const filename = getBaseName(cleanUpPath(filePath));
                        const fileExtension = getFileExtension(filename);
                        const displayName = fileExtension === "md" ? getFilenameRemovingExtension(filename) : filename;
                        const fileURL = "file:///" + filePath.replace(/^\/?/, "/"); // Convert path to file URL
                        let markdownLink = `[${displayName}](${fileURL})`;

                        // If the file is an image, prepend '!' for markdown image syntax
                        if (supported_image_extensions.contains(fileExtension)) {
                            markdownLink = "!" + markdownLink;
                        }

                        fileLinks.push(markdownLink); // Add the generated markdown link to the list
                    }
                }
            }

            // If no valid links were generated, return null; otherwise, return the links as a joined string
            return fileLinks.length === 0 ? null : fileLinks.join("\n");
        }

        // If the Alt/Ctrl key is not pressed, handle regular file drops
        const files = getFilesFromDataTransfer(event.dataTransfer, "drop", true); // Extract files from the drop data
        if (files.length > 0) {
            event.preventDefault(); // Prevent default behavior
            this.insertFiles(files); // Insert the files into the editor
            return null; // Event handled but no text to insert
        }

        return null; // No action taken
    };

    if (!originalHandlePaste) {
        originalHandlePaste = clipboardManagerProto.handlePaste;
    }

    clipboardManagerProto.handlePaste = function patchedHandlePaste(this: ClipboardManager, event: ClipboardEvent): boolean {

        if (!originalHandlePaste) {
            throw new Error("Could not execute the original handlePaste function.");
        }

        // return originalHandlePaste.apply(this,[event]);

        // Check if the paste event has already been handled (defaultPrevented is true) 
        // OR trigger the "editor-paste" event in the workspace of the app.
        if (event.defaultPrevented || this.app.workspace.trigger("editor-paste", event, this.info.editor, this.info),
            // After triggering the event, check again if defaultPrevented is true
            event.defaultPrevented) {
            return true;  // If the event has been handled, return true (indicating the event was handled).
        }
     
        // Process clipboard data from the event
        const textToPaste = this.handleDataTransfer(event.clipboardData);
        if (textToPaste) {
            if(!this.info.editor) return false;

            // If there's valid text data, replace the current selection with the pasted content
            this.info.editor.replaceSelection(textToPaste, "paste");
            event.preventDefault(); // Prevent the default paste behavior
            return true; // Indicate that the event was handled
        }

        // Check if clipboard contains "obsidian/properties" data and if `info` is an instance of `EX`, handle it
        if (event.clipboardData?.getData("obsidian/properties") && this.info instanceof MarkdownView) {
            this.info.handlePaste(event);  // Call the paste handler for `EX` instances
        }

        // Handle file data from the clipboard if present
        const files = getFilesFromDataTransfer(event.clipboardData, "clipboard", true);
        if (files.length > 0) {
            event.preventDefault(); // Prevent the default paste behavior
            this.insertFiles(files); // Insert files into the editor
            return true; // Indicate that the event was handled
        }

        return false; // Return false if no paste action was performed
    }

    // function sanitizeHtmlContent(html: string): DocumentFragment {
    //     // Assuming NM.sanitize sanitizes the HTML content and HM is the configuration object
    //     // NM.sanitize is used to clean the HTML according to some sanitization rules (defined in HM)
    //     // document.importNode is used to import the sanitized content as a DocumentFragment
    // 
    //     return document.importNode(NM.sanitize(html, HM), true);
    // }

    if (!originalHandleDataTransfer) {
        originalHandleDataTransfer = clipboardManagerProto.handleDataTransfer;
    }

    clipboardManagerProto.handleDataTransfer = function patchedHandleDataTransfer(this:ClipboardManager, dataTransfer: DataTransfer | null): string | null {

        if (!originalHandleDataTransfer) {
            throw new Error("Could not execute the original handleDataTransfer function.");
        }

        // debugger
        // const textToPaste = originalHandleDataTransfer(dataTransfer);
        // return textToPaste;

        if (!dataTransfer) return null;

        const app = this.app;

        // Get HTML data from the transfer, if available
        const htmlData = dataTransfer.getData("text/html");
        if (htmlData) {
            /*
            // If HTML auto-conversion is not enabled, return null
            if (!app.vault.getConfig("autoConvertHtml")) {
                return null;
            }

            // Convert the HTML to a DOM element
            const htmlElement = sanitizeHtmlContent(htmlData);
            const container = createEl("div");
            container.appendChild(htmlElement);

            // If the data contains a single image tag, return null to avoid conversion
            if (dataTransfer.files.length > 0 && /^<img [^>]+>$/.test(container.innerHTML.trim())) {
                return null;
            }

            // Process image, audio, or video elements in the HTML content
            const embeddedMedia = htmlElement.querySelectorAll("img, audio, video");
            const dataURIs: string[] = [];

            embeddedMedia.forEach((mediaElement: HTMLImageElement | HTMLMediaElement) => {
                // Handle local files (in desktop app) by adjusting the file path
                if (ql.isDesktopApp && mediaElement.src.startsWith(ql.resourcePathPrefix)) {
                    mediaElement.src = "file:///" + mediaElement.src.substring(ql.resourcePathPrefix.length);
                    const resolvedUrl = app.vault.resolveFileUrl(mediaElement.src);
                    if (resolvedUrl instanceof TFile) {
                        mediaElement.src = app.metadataCache.fileToLinktext(resolvedUrl, this.getPath(), true);
                    }
                }

                // Handle base64-encoded media
                if (mediaElement.src.startsWith("data:") && mediaElement.src.length > 1000) {
                    dataURIs.push(mediaElement.src);
                    mediaElement.remove(); // Remove the media element
                }
            });

            // Asynchronously handle base64-encoded media (e.g., images)
            if (dataURIs.length > 0) {
                (async () => {
                    for (const dataURI of dataURIs) {
                        try {
                            const match = dataURI.match(/^data:([\w/\-.]+);base64,(.*)/);
                            if (!match) continue;

                            const mimeType = match[1];
                            const isJPEG = mimeType === "image/jpeg";
                            const isPNG = mimeType === "image/png";

                            // Save the base64-encoded image as a file
                            const binaryData = tl(match[2]);
                            if (isPNG || isJPEG) {
                                await this.saveAttachment("Pasted image", isPNG ? "png" : "jpg", binaryData, true);
                            }
                        } catch (error) {
                            console.error(error); // Handle errors
                        }
                    }
                })();
            }

            // Return the cleaned HTML content
            return ub(container.innerHTML.trim());
            */
            return originalHandleDataTransfer(dataTransfer);
        }

        // Get a URI from the transfer, if available
        const uriData = dataTransfer.getData("text/uri-list");
        if (uriData) {
            const plainTextData = dataTransfer.getData("text/plain") || "";
            if (!plainTextData) {
                return uriData;
            }
            debugger

            // If the plain text and URI data differ, format it as a markdown link
            if (uriData.toLowerCase() !== plainTextData.toLowerCase() && decodeURIComponent(uriData.toLowerCase()) !== plainTextData.toLowerCase()) {
                const extension = getFileExtension(getBaseName(uriData));
                let markdownLink = `[${plainTextData}](${uriData})`;

                // If the content is an image, prepend '!' for markdown image syntax
                if (supported_image_extensions.contains(extension)) {
                    markdownLink = "!" + markdownLink;
                }

                return markdownLink;
            }
        }

        return null; // Return null if no relevant data was found
    };
}

export { patchObsidianImportFunctions, unpatchObsidianImportFunctions };
