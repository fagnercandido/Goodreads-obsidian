import { Book } from "./rss-parser";

export interface DBEntry extends Book {
    notePath?: string;
    hasNote: boolean;
}

export class BookDatabase {
    private entries: Record<string, DBEntry> = {};
    private onChange: (() => void)[] = [];

    async load(data: any) {
        if (data) {
            this.entries = data;
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

    addBook(book: Book) {
        if (!this.entries[book.id]) {
            this.entries[book.id] = {
                ...book,
                hasNote: false
            };
            this.notify();
        }
    }

    updateBook(book: DBEntry) {
        this.entries[book.id] = book;
        this.notify();
    }

    setNoteCreated(id: string, path: string) {
        if (this.entries[id]) {
            this.entries[id].hasNote = true;
            this.entries[id].notePath = path;
            this.notify();
        }
    }

    // Observer pattern for UI updates
    on(callback: () => void) {
        this.onChange.push(callback);
    }

    off(callback: () => void) {
        this.onChange = this.onChange.filter(cb => cb !== callback);
    }

    private notify() {
        this.onChange.forEach(cb => cb());
    }
}
