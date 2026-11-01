import { Book, BookStatus, BookFormat } from "./rss-parser";
import { normalizeIsbn } from "./utils";

export interface DBEntry extends Book {
    notePath?: string;
    hasNote: boolean;
}

/** What changed, so views can update surgically instead of rebuilding. */
export type DbChange = { type: 'reset' } | { type: 'update'; id: string };

export class BookDatabase {
    private entries: Record<string, DBEntry> = {};
    private onChange: ((change: DbChange) => void)[] = [];

    async load(data: any) {
        this.entries = (data && typeof data === 'object') ? data : {};
        this.migrate();
    }

    /**
     * Backfill personal-library fields on entries saved by older versions of
     * the plugin, and drop any corrupt (null / non-object) entries so a single
     * bad value in data.json can't crash the whole plugin on load.
     */
    private migrate() {
        for (const [id, entry] of Object.entries(this.entries)) {
            if (!entry || typeof entry !== 'object') {
                delete this.entries[id];
                continue;
            }
            const legacy = entry as any;
            if (entry.hasNote === undefined) entry.hasNote = false;
            if (!entry.source) entry.source = 'goodreads';
            // Legacy entries all came from the Goodreads "read" feed.
            if (!entry.status) entry.status = 'read';
            // Migrate the old boolean `owned` into the new `format` field.
            if (!entry.format) {
                entry.format = legacy.owned ? 'physical' : 'none';
                delete legacy.owned;
            }
            if (!entry.dateAdded) entry.dateAdded = entry.readAt || undefined;
        }
    }

    getBooks(): DBEntry[] {
        return Object.values(this.entries);
    }

    getData(): any {
        return this.entries;
    }

    getBook(id: string): DBEntry | undefined {
        return this.entries[id];
    }

    /** Find an entry by ISBN (normalized), if any. */
    findByIsbn(isbn: string): DBEntry | undefined {
        const target = normalizeIsbn(isbn);
        if (!target) return undefined;
        return Object.values(this.entries).find(
            e => e && e.isbn && normalizeIsbn(e.isbn) === target
        );
    }

    addBook(book: Book, silent = false, checkIsbn = true): boolean {
        // De-dupe by id, and by ISBN so a scanned book already imported from
        // Goodreads isn't added twice. Callers that already checked the ISBN
        // (the import service) pass checkIsbn=false to skip the second scan.
        if (this.entries[book.id]) return false;
        if (checkIsbn && book.isbn && this.findByIsbn(book.isbn)) return false;

        this.entries[book.id] = {
            ...book,
            hasNote: false
        };
        if (!silent) this.notify({ type: 'reset' });
        return true;
    }

    updateBook(book: DBEntry) {
        this.entries[book.id] = book;
        this.notify({ type: 'reset' });
    }

    /**
     * Merge a freshly-fetched Goodreads book into the library. New books are
     * added; for existing ones Goodreads is authoritative for reading status,
     * mirrored in BOTH directions (read ⇄ reading ⇄ to-read). The finish date is
     * updated when read and otherwise left intact (historical dates are never
     * wiped); the rating is only ever raised (a cleared/0 Goodreads rating is not
     * mirrored). Plugin-only fields (format, hasNote, notePath) are preserved and
     * missing metadata is enriched. Does not notify — the caller notifies once
     * after the whole sync.
     */
    applySync(incoming: Book): 'added' | 'updated' | 'unchanged' {
        const existing = this.entries[incoming.id]
            || (incoming.isbn ? this.findByIsbn(incoming.isbn) : undefined);

        if (!existing) {
            this.entries[incoming.id] = { ...incoming, hasNote: false };
            return 'added';
        }

        let changed = false;
        // Goodreads is authoritative for reading status — mirror it in BOTH
        // directions (read ⇄ reading ⇄ to-read).
        if (existing.status !== incoming.status) {
            existing.status = incoming.status;
            changed = true;
        }
        // Update the finish date when Goodreads reports the book read; never wipe
        // an existing (historical) date — status alone drives what counts as read,
        // so a re-read keeps its original completion date.
        if (incoming.status === 'read' && incoming.readAt && existing.readAt !== incoming.readAt) {
            existing.readAt = incoming.readAt;
            changed = true;
        }
        if (incoming.userRating && incoming.userRating !== '0'
            && existing.userRating !== incoming.userRating) {
            existing.userRating = incoming.userRating;
            changed = true;
        }
        if (!existing.pageCount && incoming.pageCount) { existing.pageCount = incoming.pageCount; changed = true; }
        if (!existing.publishedYear && incoming.publishedYear) { existing.publishedYear = incoming.publishedYear; changed = true; }
        if (!existing.imageUrl && incoming.imageUrl) { existing.imageUrl = incoming.imageUrl; changed = true; }

        return changed ? 'updated' : 'unchanged';
    }

    setStatus(id: string, status: BookStatus) {
        const entry = this.entries[id];
        if (entry) {
            entry.status = status;
            if (status === 'read' && !entry.readAt) {
                entry.readAt = new Date().toISOString().slice(0, 10);
            }
            this.notify({ type: 'update', id });
        }
    }

    setFormat(id: string, format: BookFormat) {
        const entry = this.entries[id];
        if (entry) {
            entry.format = format;
            this.notify({ type: 'update', id });
        }
    }

    setRating(id: string, rating: number) {
        const entry = this.entries[id];
        if (entry) {
            entry.userRating = String(rating);
            this.notify({ type: 'update', id });
        }
    }

    removeBook(id: string): boolean {
        if (this.entries[id]) {
            delete this.entries[id];
            this.notify({ type: 'reset' });
            return true;
        }
        return false;
    }

    // --- Batch operations: mutate many, notify once ---

    setFormatMany(ids: string[], format: BookFormat): number {
        let changed = 0;
        for (const id of ids) {
            const entry = this.entries[id];
            if (entry) { entry.format = format; changed++; }
        }
        if (changed) this.notify({ type: 'reset' });
        return changed;
    }

    setStatusMany(ids: string[], status: BookStatus): number {
        let changed = 0;
        const today = new Date().toISOString().slice(0, 10);
        for (const id of ids) {
            const entry = this.entries[id];
            if (entry) {
                entry.status = status;
                if (status === 'read' && !entry.readAt) entry.readAt = today;
                changed++;
            }
        }
        if (changed) this.notify({ type: 'reset' });
        return changed;
    }

    removeMany(ids: string[]): number {
        let removed = 0;
        for (const id of ids) {
            if (this.entries[id]) { delete this.entries[id]; removed++; }
        }
        if (removed) this.notify({ type: 'reset' });
        return removed;
    }

    setNoteCreated(id: string, path: string) {
        if (this.entries[id]) {
            this.entries[id].hasNote = true;
            this.entries[id].notePath = path;
            this.notify({ type: 'update', id });
        }
    }

    notifyChange() {
        this.notify({ type: 'reset' });
    }

    // Observer pattern for UI updates
    on(callback: (change: DbChange) => void) {
        this.onChange.push(callback);
    }

    off(callback: (change: DbChange) => void) {
        this.onChange = this.onChange.filter(cb => cb !== callback);
    }

    private notify(change: DbChange) {
        this.onChange.forEach(cb => cb(change));
    }
}
