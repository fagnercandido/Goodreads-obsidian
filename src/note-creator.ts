import { App, Notice, normalizePath, TFile } from "obsidian";
import { Book } from "./rss-parser";
import { parseBookDate } from "./utils";
import { t } from "./i18n";

export class NoteCreator {
    constructor(private app: App) { }

    private async belongsTo(file: TFile, bookId: string): Promise<boolean> {
        try {
            const content = await this.app.vault.read(file);
            // Match the whole frontmatter line, not a substring, so one bookId
            // that is a prefix of another (e.g. numeric Goodreads ids) can't
            // mis-associate two books to the same note.
            return content.split(/\r?\n/).some(line => line.trim() === `bookId: ${bookId}`);
        } catch {
            return false;
        }
    }

    async createNote(book: Book, folderPath: string): Promise<string | null> {
        try {
            const sanitizedTitle = book.title.replace(/[\\/:?*"<>|]/g, "").trim() || "Untitled";

            // Format date to YYYY-MM if valid, else empty (parsed as local date).
            let datePrefix = "";
            const date = parseBookDate(book.readAt);
            if (date) {
                datePrefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')} - `;
            }
            const base = `${datePrefix}${sanitizedTitle}`;

            // Ensure folder exists
            if (folderPath && folderPath !== '/') {
                const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
                if (!folder) {
                    await this.app.vault.createFolder(normalizePath(folderPath));
                }
            }

            const categoriesYaml = (book.categories && book.categories.length)
                ? `\ncategories:\n${book.categories.map(c => `  - "${c.replace(/"/g, '\\"')}"`).join('\n')}`
                : '';

            const content = `---
title: "${book.title.replace(/"/g, '\\"')}"
author: "${book.author.replace(/"/g, '\\"')}"
status: ${book.status}
format: ${book.format}
readAt: ${book.readAt}
isbn: ${book.isbn || ''}
rating: ${book.userRating}
pages: ${book.pageCount || ''}
published: ${book.publishedYear || ''}
publisher: "${(book.publisher || '').replace(/"/g, '\\"')}"
source: ${book.source}
link: ${book.link}
bookId: ${book.id}
cover: "${book.imageUrl}"${categoriesYaml}
tags:
  - book
---

${book.imageUrl ? `![cover|150](${book.imageUrl})\n` : ''}
# ${book.title}

**Author:** ${book.author}
**Rating:** ${book.userRating}/5
**Status:** ${book.status}
**Finished:** ${book.readAt}

## Review

${book.description ? `> ${book.description.replace(/\n/g, '\n> ')}` : ''}

## Notes

`;

            // Resolve a filename that is either free or already this book's note,
            // so two different books that share a title don't collide.
            for (let suffix = 0; suffix <= 50; suffix++) {
                const fileName = suffix === 0 ? `${base}.md` : `${base} (${suffix + 1}).md`;
                const candidate = normalizePath(`${folderPath}/${fileName}`);
                const existing = this.app.vault.getAbstractFileByPath(candidate);

                if (!existing) {
                    await this.app.vault.create(candidate, content);
                    new Notice(t('NOTE_CREATED', { name: fileName }));
                    return candidate;
                }
                if (existing instanceof TFile && await this.belongsTo(existing, book.id)) {
                    new Notice(t('NOTE_EXISTS', { name: fileName }));
                    return candidate;
                }
            }

            throw new Error('Could not find a free note filename.');
        } catch (e: any) {
            console.error(`Failed to create note for ${book.title}`, e);
            new Notice(t('NOTE_FAILED', { error: e.message }));
            return null;
        }
    }
}
