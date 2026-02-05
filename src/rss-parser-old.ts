import { requestUrl } from 'obsidian';
import Parser from 'rss-parser';

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
    private parser: any;

    constructor() {
        this.parser = new Parser({
            customFields: {
                item: [
                    'author_name',
                    'book_image_url',
                    'book_large_image_url',
                    'book_description',
                    'user_rating',
                    'user_read_at',
                    'isbn',
                    'book_id'
                ]
            }
        });
    }

    async fetchFeed(url: string): Promise<Book[]> {
        try {
            const response = await requestUrl({ url });
            const feed = await this.parser.parseString(response.text);

            return feed.items.map((item: any) => {
                // GoodReads RSS items have title, link, and custom fields
                return {
                    id: item.guid || item.link || item.book_id,
                    title: item.title,
                    author: item.author_name || item.creator || 'Unknown Author',
                    imageUrl: item.book_large_image_url || item.book_image_url || '',
                    userRating: item.user_rating || '0',
                    readAt: item.user_read_at || item.pubDate || '', // user_read_at is preferred
                    isbn: item.isbn,
                    link: item.link,
                    description: item.book_description || item.contentSnippet
                };
            });
        } catch (error) {
            console.error('Error fetching GoodReads feed:', error);
            throw error;
        }
    }
}
