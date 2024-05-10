# Import Attachments+ for Obsidian

## Overview
**Import Attachments+** is a plugin designed to enhance the attachment management experience in Obsidian. It allows you to import, organize, and handle attachments (like images, documents, and other files) seamlessly within your vault. 

Features include:
- Moving or copying files into the vault upon import.
- Embedding or linking attachments.
- Configurable folder structures for attachments.
- Customizable naming conventions for imported files.
- Management tools for attachment folders.

## Installation
1. **Download the Plugin:**
   - Clone the plugin files from the [GitHub repository](https://github.com/alberti42/obsidian-import-attachments-plus).

2. **Install Dependencies:**
   - Run `npm install` to install the required dependencies.

3. **Build the Plugin:**
   - Run `npm run build` to compile the plugin code.
   - The compiled code will be placed in the `dist/PLATFORM_NAME` subfolder, where `PLATFORM_NAME` is based on your platform and architecture:
     - `dist/apple-silicon` (Apple Silicon Mac)
     - `dist/apple-intel` (Intel Mac)
     - `dist/windows` (Windows)
     - `dist/linux` (Linux)

4. **Copy to Obsidian Plugins Directory:**
   - Copy the contents of the relevant platform folder (e.g., `dist/windows`) into your vault's `.obsidian/plugins/obsidian-import-attachments-plus` directory.

5. **Enable the Plugin:**
   - Open Obsidian and go to **Settings > Community Plugins**.
   - Enable **Import Attachments+**.

## Usage
Once enabled, the plugin will work automatically based on your configured preferences. You can adjust these settings through the plugin's settings tab under **Settings > Import Attachments+**.

## Settings
The plugin offers a comprehensive set of options for managing attachments. Below is a screenshot of the settings tab:

<img src="docs/images/screenshot.png" align="left" max-width=500 alt="Screenshot settings"/>

### Import Options
1. **Whether to move or copy files that are drag-and-dropped?**
   - **Ask each time:** Prompts you on every import to either move or copy the files.
   - **Move:** Moves the files into the vault.
   - **Copy:** Copies the files into the vault.
   - **Default:** Ask each time.

2. **Whether to move or copy files that are copy-and-pasted?**
   - **Ask each time:** Prompts you on every import to either move or copy the files.
   - **Move:** Moves the files into the vault.
   - **Copy:** Copies the files into the vault.
   - **Default:** Ask each time.

3. **Embed imported documents:**
   - **Ask each time:** Prompts you for each import whether to embed or link the attachments.
   - **Yes:** Embeds the attachments directly.
   - **No:** Links the attachments without embedding.
   - **Default:** Ask each time.

4. **Import multiple files as:**
   - **Bulleted list:** Imports multiple files as a bulleted list.
   - **Numbered list:** Imports multiple files as a numbered list.
   - **Inline:** Imports files without using lists.
   - **Default:** Bulleted list.

5. **Insert display text for links based on filename:**
   - **Toggle:** When enabled, uses the file's basename as the display text.
   - **Default:** Disabled.

### Attachment Folder Configuration
1. **Default location for new attachments:**
   - **Vault folder:** Places attachments in a dedicated folder within the vault.
   - **Same folder as current file:** Places attachments in the same folder as the currently open note.
   - **Default:** Vault folder.

2. **Attachment folder where to import new attachments, relative to the default location:**
   - **Folder Path:** Specify a folder path relative to the selected location using `${notename}` as a placeholder.

3. **Attachment link format:**
   - **With respect to the note's path (relative path):** Links the attachments relative to the note.
   - **With respect to the vault's path (absolute path):** Links the attachments relative to the vault.
   - **Default:** Relative path.

4. **Name of the imported attachments:**
   - **Placeholder Variables:**
     - `${original}` for the original file name.
     - `${date}` for the current date.
     - `${uuid}` for a 128-bit UUID.
     - `${md5}` for the MD5 hash of the imported file.

5. **Date format:**
   - Use [moment.js format syntax](https://momentjscom.readthedocs.io/en/latest/moment/04-displaying/01-format) to specify the date format.

### Attachment Opening
1. **Open attachment with default external application:**
   - **Toggle:** Opens the attachment with the default external application when holding the platform-specific key (`⌘` or `Ctrl`).

2. **Reveal attachment in the system's file manager:**
   - **Toggle:** Reveals the attachment in the system's file manager when holding the platform-specific key (`⌘+⌥` or `Ctrl+Alt`).

### Attachment Management
1. **Rename the attachment folder automatically and update all links correspondingly:**
   - **Toggle:** Automatically renames/moves the attachment folder when the corresponding note is renamed/moved.

2. **Delete the attachment folder automatically when the corresponding note is deleted:**
   - **Toggle:** Deletes the attachment folder when the corresponding note is deleted. Only works if `${notename}` is in the folder name.

3. **Ask confirmation before deleting the attachment folder:**
   - **Toggle:** Prompts the user before deleting the attachment folder.

### Display of Attachment Folders
1. **Hide attachment folders:**
   - **Toggle:** Hides attachment folders from the file explorer.

## Donations
I would be grateful for any donation to support the development of this plugin.

[<img src="docs/images/buy_me_coffee.png" width=300 alt="Buy Me a Coffee QR Code"/>](https://buymeacoffee.com/alberti)

## Author
- **Author:** Andrea Alberti
- **GitHub Profile:** [alberti42](https://github.com/alberti42)
- **Donations:** [![Buy Me a Coffee](https://img.shields.io/badge/Donate-Buy%20Me%20a%20Coffee-orange)](https://buymeacoffee.com/alberti)

Feel free to contribute to the development of this plugin or report any issues in the [GitHub repository](https://github.com/alberti42/obsidian-import-attachments-plus/issues).


