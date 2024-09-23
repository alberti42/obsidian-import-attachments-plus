# Import Attachments+ for Obsidian

## Overview
**Import Attachments+** is a plugin designed to enhance the attachment management experience in Obsidian. It allows you to import, organize, and handle attachments (like images, documents, and other files) seamlessly within your vault. 

Features include:
- Moving or copying files into the vault upon import.
- Embedding or linking attachments.
- Configurable folder structures for attachments.
- Customizable naming conventions for imported files.
- Management tools for attachment folders.

## Usage
Once enabled, the plugin will work automatically based on your configured preferences. You can adjust these settings through the plugin's settings tab under **Settings > Import Attachments+**.

### Settings
The plugin offers a comprehensive set of options for managing attachments.

<div align="left">
    <img src="docs/images/screenshot.png" width=600 alt="Screenshot settings"/>
</div>

1. **Import Options:**
   - Move or copy files on drag-and-drop or copy-and-paste.
   - Embed or link imported attachments.
   - Import multiple files as a list or inline.

2. **Attachment Folder Configuration:**
   - Set the default location for new attachments.
   - Define folder paths relative to the note's location.
   - Customize attachment file names and date formats.

3. **Attachment Opening:**
   - Open attachments with the default external application or reveal them in the system's file manager.

4. **Attachment Management:**
   - Rename and delete attachment folders automatically.
   - Confirm before deleting attachment folders.

5. **Display of Attachment Folders:**
   - Toggle the visibility of attachment folders in the file explorer.

## Recommended installation

Search for "Import Attachments+" in the Community plugins pane in Obsidian and click on the Install button. 

### Manual Installation

#### Option 1: Download Pre-Built Files

1. Download the latest release from the [GitHub releases page](https://github.com/alberti42/obsidian-import-attachments-plus/releases).
2. In the release, you'll find the `main.js`, `manifest.json` and `styles.css` files.
3. Copy these three files to a new folder in your vault's `.obsidian/plugins/` directory (e.g., `.obsidian/plugins/import-attachments-plus`).
4. Enable the plugin `Import Attachments+` in Obsidian via `Settings` > `Community Plugins`.

#### Option 2: Build from Source

1. Clone this repository or download the source code from the [GitHub repository](https://github.com/alberti42/obsidian-import-attachments-plus).
2. Run the following commands to install the necessary dependencies and build the plugin. The build process will generate the `main.js` and `manifest.json` files inside the `/dist` subfolder within the repository directory:

	```bash
   npm install
   npm run build
	```
 
## Donations
I would be grateful for any donation to support the development of this plugin.

[<img src="docs/images/buy_me_coffee.png" width=300 alt="Buy Me a Coffee QR Code"/>](https://buymeacoffee.com/alberti)

## Author
- **Author:** Andrea Alberti
- **GitHub Profile:** [alberti42](https://github.com/alberti42)
- **Donations:** [![Buy Me a Coffee](https://img.shields.io/badge/Donate-Buy%20Me%20a%20Coffee-orange)](https://buymeacoffee.com/alberti)

Feel free to contribute to the development of this plugin or report any issues in the [GitHub repository](https://github.com/alberti42/import-attachments-plus/issues).
