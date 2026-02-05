import { BookDatabase } from "./database";
import { GoodReadsParser } from "./rss-parser-old";
import { Notice } from "obsidian";

export class SyncManager {
    constructor(private parser: GoodReadsParser, private db: BookDatabase) { }

    async sync(url: string): Promise<number> {
        try {
            const books = await this.parser.fetchFeed(url);
            let newCount = 0;

            for (const book of books) {
                if (!this.db.getBook(book.id)) {
                    this.db.addBook(book);
                    newCount++;
                }
            }

            return newCount;
        } catch (e: any) {
            console.error("Sync failed:", e);
            new Notice(`Sync failed: ${e.message}`);
            return 0;
        }
    }
}
