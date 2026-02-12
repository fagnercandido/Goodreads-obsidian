import { requestUrl } from 'obsidian';

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
                const pubDate = this.getTextContent(item, 'pubDate');
                const isbn = this.getTextContent(item, 'isbn');
                const bookDescription = this.getTextContent(item, 'book_description');

                books.push({
                    id: guid || link || bookId,
                    title: title,
                    author: authorName || 'Unknown Author',
                    imageUrl: bookLargeImageUrl || bookImageUrl || '',
                    userRating: userRating || '0',
                    readAt: userReadAt || pubDate || '',
                    isbn: isbn || undefined,
                    link: link,
                    description: bookDescription || undefined
                });
            });

            return books;
        } catch (error) {
            console.error('Error fetching GoodReads feed:', error);
            throw error;
        }
    }
}
