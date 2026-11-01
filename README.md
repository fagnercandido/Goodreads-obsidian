# GoodReads Obsidian Integration

A personal book library inside Obsidian. Import from GoodReads, add the books you
own at home (read or not), catalogue them by scanning barcodes, and see stats about
your reading. Works on desktop and on iPhone/iPad.

## Features

- **Personal library**: track every book with a reading status (**Read / Reading / To read**)
  and an **"At home" (owned)** flag — including books you own but haven't read yet.
- **Add by ISBN**: paste an ISBN and it fetches cover, author, page count, genre and year
  (Google Books, with Open Library as a fallback).
- **Barcode scanning** — three ways:
  - 📷 **In-app camera** (desktop / Android) using the browser's native barcode detector.
  - 📱 **iOS Shortcut → vault** (iPhone/iPad): scan with the native camera; the book is
    imported automatically (see below).
  - ⌨️ **Manual ISBN** entry — always available.
- **GoodReads RSS import**: still supported; imported books keep their shelf as status.
- **Visual gallery**: cover grid with status badges, an 🏠 marker for owned books, and
  filters (All / Read / Reading / To read / At home).
- **Per-book menu**: change status, toggle "At home", set a rating, create/open a note, or remove.
- **Stats**: books read per year and per month, rating distribution, library breakdown,
  top authors, and genres.
- **Note generation**: one-click note with rich frontmatter.

## Installation (manual)

Copy `main.js`, `manifest.json`, and `styles.css` into
`.obsidian/plugins/goodreads-obsidian/` in your vault, then enable the plugin.

## Configuration

Open **Settings → GoodReads Integration**:

- **RSS Feed URL** *(optional)*: from GoodReads → *My Books* → the **RSS** link at the
  bottom. Used by the "Sync Books" command.
- **Notes Folder**: where book notes are created (default: `Books`).
- **Scan inbox file**: the file your iOS Shortcut appends scanned barcodes to
  (default: `goodreads-scan-inbox.md`). Use **Create file** to make it.

## Barcode scanning on iPhone/iPad (Shortcut)

In-app camera access isn't available inside Obsidian on iOS, so scanning uses a Shortcut
that drops the barcode into a file the plugin watches:

1. In the **Shortcuts** app, create a new Shortcut.
2. Add **Scan QR/Barcode**.
3. Add **Append to File** → target the *scan inbox* file inside your Obsidian vault
   folder, and append the scanned result followed by a new line.
4. (Optional) Add it to the Home Screen or Back Tap for one-tap scanning.
5. Scan a book. The plugin imports it automatically the next time Obsidian is open
   (or immediately, if it's running). You can also run **"Import scanned barcodes now"**
   from the command palette.

Each ISBN in the inbox file is looked up, added to your library (defaulting to
*To read* + *At home*), and the file is cleared.

## Usage

- Open the gallery via the ribbon **book** icon or **GoodReads: Book Gallery**.
- Add a book via the ribbon **＋** icon, the **＋ Add book** button, or **GoodReads: Add book**.
- Toggle the **📊 Stats** view from the gallery header.
- Click a cover to open/create its note; use the **⋯** button on a cover for the book menu.

## Development

```bash
npm install
npm run build
```

## License

MIT
