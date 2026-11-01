import { requestUrl } from 'obsidian';

/** Reading progress for a book. */
export type BookStatus = 'read' | 'reading' | 'to-read';

/** Where a book came from. */
export type BookSource = 'goodreads' | 'manual';

/**
 * How the user has the book: a physical copy they own, a digital copy they own,
 * a library loan, or 'none' (they don't have it — e.g. a to-read wishlist item).
 */
export type BookFormat = 'physical' | 'digital' | 'library' | 'none';

export interface Book {
    id: string;
    title: string;
    author: string;
    imageUrl: string;
    userRating: string;
    readAt: string; // ISO date or "YYYY-MM"
    isbn?: string;
    link: string;
    description?: string;
    // --- Personal library fields ---
    source: BookSource;
    status: BookStatus;
    format: BookFormat;      // physical / digital copy the user owns, or none
    dateAdded?: string;      // ISO date the book entered the library
    pageCount?: number;
    publishedYear?: string;
    categories?: string[];   // genres
    publisher?: string;
}

export class GoodReadsParser {
    constructor() {
        // No external dependencies needed
    }

    private getTextContent(element: Element | null, tagName: string): string {
        if (!element) return '';
        const tag = element.querySelector(tagName);
        if (!tag) return '';

        const textContent = tag.textContent?.trim() || '';

        // Handle CDATA sections - use simple string methods instead of regex with 's' flag
        if (textContent.startsWith('<![CDATA[') && textContent.endsWith(']]>')) {
            return textContent.substring(9, textContent.length - 3).trim();
        }

        return textContent;
    }

    /**
     * Fetches the GoodReads RSS feed.
     * This method is ONLY called when user explicitly triggers sync via:
     * - Command palette: "Sync Books"
     * - Settings page: "Sync Now" button
     * No automatic/background syncing occurs.
     */
    async fetchFeed(url: string): Promise<Book[]> {
        try {
            const response = await requestUrl({ url });
            const xmlText = response.text;

            // Parse XML using DOMParser
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            // Check for parsing errors
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                throw new Error(`XML parsing error: ${parseError.textContent}`);
            }

            // Get all item elements
            const items = xmlDoc.querySelectorAll('item');
            const books: Book[] = [];

            items.forEach((item) => {
                const guid = this.getTextContent(item, 'guid');
                const link = this.getTextContent(item, 'link');
                const bookId = this.getTextContent(item, 'book_id');

                const title = this.getTextContent(item, 'title');
                const authorName = this.getTextContent(item, 'author_name');
                const bookLargeImageUrl = this.getTextContent(item, 'book_large_image_url');
                const bookImageUrl = this.getTextContent(item, 'book_image_url');
                const userRating = this.getTextContent(item, 'user_rating');
                const userReadAt = this.getTextContent(item, 'user_read_at');
                const isbn = this.getTextContent(item, 'isbn');
                const bookDescription = this.getTextContent(item, 'book_description');
                const numPages = this.getTextContent(item, 'num_pages');
                const bookPublished = this.getTextContent(item, 'book_published');
                const userDateAdded = this.getTextContent(item, 'user_date_added');
                const userShelves = this.getTextContent(item, 'user_shelves');

                // A finish date (user_read_at) is the reliable "read" signal —
                // Goodreads RSS has no start date. Fall back to the shelf name.
                const shelfList = userShelves.split(',').map(s => s.trim().toLowerCase());
                let status: BookStatus;
                if (shelfList.includes('currently-reading')) {
                    // Active shelf wins over a stale finish date (re-reads keep it).
                    status = 'reading';
                } else if (userReadAt || shelfList.includes('read')) {
                    status = 'read';
                } else {
                    status = 'to-read';
                }

                const pageCount = parseInt(numPages, 10);

                books.push({
                    id: guid || link || bookId,
                    title: title,
                    author: authorName || 'Unknown Author',
                    imageUrl: bookLargeImageUrl || bookImageUrl || '',
                    userRating: userRating || '0',
                    // Only a real "date read" belongs here; pubDate is the feed
                    // item date, not when the user finished the book.
                    readAt: userReadAt || '',
                    isbn: isbn || undefined,
                    link: link,
                    description: bookDescription || undefined,
                    source: 'goodreads',
                    status: status,
                    format: 'none',
                    dateAdded: userDateAdded || undefined,
                    pageCount: Number.isFinite(pageCount) && pageCount > 0 ? pageCount : undefined,
                    publishedYear: bookPublished || undefined
                });
            });

            return books;
        } catch (error) {
            console.error('Error fetching GoodReads feed:', error);
            throw error;
        }
    }
}
