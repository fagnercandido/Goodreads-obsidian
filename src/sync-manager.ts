import { BookDatabase } from "./database";
import { GoodReadsParser } from "./rss-parser";
import { Notice } from "obsidian";

export interface SyncResult {
    added: number;
    updated: number;
}

export class SyncManager {
    constructor(private parser: GoodReadsParser, private db: BookDatabase) { }

    async sync(url: string): Promise<SyncResult> {
        try {
            const books = await this.parser.fetchFeed(url);
            let added = 0;
            let updated = 0;

            for (const book of books) {
                const result = this.db.applySync(book);
                if (result === 'added') added++;
                else if (result === 'updated') updated++;
            }

            if (added > 0 || updated > 0) {
                this.db.notifyChange();
            }

            return { added, updated };
        } catch (e: any) {
            console.error("Sync failed:", e);
            new Notice(`Sync failed: ${e.message}`);
            return { added: 0, updated: 0 };
        }
    }
}
