import { Notice, TFile, normalizePath } from "obsidian";
import GoodReadsPlugin from "./main";
import { Book, BookStatus, BookFormat } from "./rss-parser";
import { normalizeIsbn, isValidIsbn } from "./utils";
import { t } from "./i18n";

export type ImportResult = 'added' | 'duplicate' | 'invalid';

export interface InboxSummary {
    added: number;
    duplicate: number;
    invalid: number;
}

/**
 * Turns ISBNs into library entries. Used by the add-book modal's lookup as
 * well as the "scan inbox" file that the iOS Shortcut appends barcodes to.
 */
export class ImportService {
    private processing = false;

    constructor(private plugin: GoodReadsPlugin) { }

    /**
     * Import a single ISBN. Always adds an entry when the ISBN is valid -
     * falling back to an editable placeholder if metadata can't be resolved -
     * so a scan is never silently dropped.
     */
    async importIsbn(
        rawIsbn: string,
        opts: { format?: BookFormat; status?: BookStatus; silent?: boolean } = {}
    ): Promise<ImportResult> {
        const isbn = normalizeIsbn(rawIsbn);
        if (!isValidIsbn(isbn)) return 'invalid';
        if (this.plugin.db.findByIsbn(isbn)) return 'duplicate';

        const status = opts.status ?? 'to-read';
        const format = opts.format ?? 'physical';
        const today = new Date().toISOString().slice(0, 10);
        const meta = await this.plugin.metadataService.lookupByIsbn(isbn);

        const book: Book = {
            id: `isbn:${isbn}`,
            title: meta?.title || `ISBN ${isbn}`,
            author: meta?.author || 'Unknown Author',
            imageUrl: meta?.imageUrl || '',
            userRating: '0',
            readAt: status === 'read' ? today : '',
            isbn,
            link: `https://openlibrary.org/isbn/${isbn}`,
            description: meta?.description,
            source: 'manual',
            status,
            format,
            dateAdded: today,
            pageCount: meta?.pageCount,
            publishedYear: meta?.publishedYear,
            categories: meta?.categories,
            publisher: meta?.publisher
        };

        // checkIsbn=false: we already ran findByIsbn above, no need to re-scan.
        const added = this.plugin.db.addBook(book, opts.silent ?? false, false);
        return added ? 'added' : 'duplicate';
    }

    /**
     * Read the scan-inbox file, import every ISBN it contains, then clear it.
     * The file is where the iOS Shortcut drops scanned barcodes.
     */
    async processInbox(announceEmpty = false): Promise<InboxSummary> {
        const summary: InboxSummary = { added: 0, duplicate: 0, invalid: 0 };

        // Reentrancy guard: the file watcher, the startup pass, the command and
        // the settings button can all fire this concurrently. Only one runs.
        if (this.processing) return summary;

        const path = this.plugin.settings.scanInboxPath?.trim();
        if (!path) return summary;

        const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(path));
        if (!(file instanceof TFile)) return summary;

        this.processing = true;
        try {
            const content = await this.plugin.app.vault.read(file);
            const tokens = Array.from(new Set(
                content.split(/[\s,;]+/).map(normalizeIsbn).filter(isValidIsbn)
            ));

            if (!tokens.length) {
                if (announceEmpty) new Notice(t('INBOX_EMPTY'));
                return summary;
            }

            const processed = new Set<string>();
            for (const isbn of tokens) {
                const result = await this.importIsbn(isbn, { format: 'physical', status: 'to-read', silent: true });
                summary[result]++;
                processed.add(isbn);
            }

            // Re-read and remove only the exact lines we just imported. Any
            // barcode the Shortcut appended meanwhile, any invalid/partial scan,
            // and any free text the user left are all preserved (not silently
            // discarded), so a failed scan is visible and retriable.
            const after = await this.plugin.app.vault.read(file);
            const remaining = after.split(/\r?\n/).filter(line => {
                const norm = normalizeIsbn(line);
                return !(isValidIsbn(norm) && processed.has(norm));
            }).join('\n');
            await this.plugin.app.vault.modify(file, remaining);

            if (summary.added > 0) this.plugin.db.notifyChange();
            new Notice(t('INBOX_RESULT', { added: summary.added, duplicate: summary.duplicate }));
            return summary;
        } finally {
            this.processing = false;
        }
    }
}
