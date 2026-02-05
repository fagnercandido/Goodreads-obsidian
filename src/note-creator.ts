import { App, Notice, normalizePath } from "obsidian";
import { Book } from "./rss-parser-old";

export class NoteCreator {
    constructor(private app: App) { }

    async createNote(book: Book, folderPath: string): Promise<string | null> {
        try {
            const sanitizedTitle = book.title.replace(/[\\/:?*"<>|]/g, "").trim();

            // Format date to YYYY-MM if valid, else empty
            let datePrefix = "";
            if (book.readAt) {
                const date = new Date(book.readAt);
                if (!isNaN(date.getTime())) {
                    datePrefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')} - `;
                }
            }

            const fileName = `${datePrefix}${sanitizedTitle}.md`;
            const path = normalizePath(`${folderPath}/${fileName}`);

            // Ensure folder exists
            if (folderPath && folderPath !== '/') {
                const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
                if (!folder) {
                    await this.app.vault.createFolder(normalizePath(folderPath));
                }
            }

            // Check if exists
            const existingFile = this.app.vault.getAbstractFileByPath(path);
            if (existingFile) {
                new Notice(`Note already exists: ${fileName}`);
                return path;
            }

            const content = `---
title: "${book.title.replace(/"/g, '\\"')}"
author: "${book.author.replace(/"/g, '\\"')}"
readAt: ${book.readAt}
isbn: ${book.isbn || ''}
rating: ${book.userRating}
link: ${book.link}
bookId: ${book.id}
cover: "${book.imageUrl}"
tags:
  - book
---

![cover|150](${book.imageUrl})

# ${book.title}

**Author:** ${book.author}
**Rating:** ${book.userRating}/5
**Finished:** ${book.readAt}

## Review

${book.description ? `> ${book.description.replace(/\n/g, '\n> ')}` : ''}

## Notes

`;

            await this.app.vault.create(path, content);
            new Notice(`Created note: ${fileName}`);
            return path;
        } catch (e: any) {
            console.error(`Failed to create note for ${book.title}`, e);
            new Notice(`Failed to create note: ${e.message}`);
            return null;
        }
    }
}
