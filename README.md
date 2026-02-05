# GoodReads Obsidian Integration

Integrate your GoodReads "My Books" shelf directly into Obsidian.

![Gallery View](https://via.placeholder.com/800x400?text=GoodReads+Gallery+Preview)

## Features
- **RSS Import**: Automatically sync books from your GoodReads RSS feed.
- **Visual Gallery**: View your books in a beautiful grid layout with cover images.
- **Note Generation**: One-click note creation using a predefined template with metadata.
- **Duplicate Prevention**: Keeps track of existing notes to avoid duplicates.
- **Sync Options**: Manual sync to update your library.

## Installation
1. Search for "GoodReads Integration" in Obsidian Community Plugins (once published).
2. Or, for manual install:
    - Copy `main.js`, `manifest.json`, `styles.css` into `.obsidian/plugins/goodreads-obsidian/`.

## Configuration
1. Go to **Settings > GoodReads Integration**.
2. **RSS Feed URL**:
    - Log in to GoodReads.
    - Go to "My Books".
    - Click on the "RSS" button at the bottom of the page.
    - Copy the link URL and paste it into the setting.
3. **Notes Folder**: Define where new book notes should be created (default: `Books`).
4. **Sync**: Enable "Sync on Start" or use the command "GoodReads: Sync Books".

## Usage
1. Open the gallery using the Ribbon Icon (Book) or command `GoodReads: Open Gallery`.
2. Click on any book cover.
    - If the note exists, it opens.
    - If not, it creates a new note in your configured folder.

## Development
To build from source:
```bash
npm install
npm run build
```
## License
MIT
