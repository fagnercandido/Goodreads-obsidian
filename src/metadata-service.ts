import { requestUrl } from "obsidian";
import { normalizeIsbn } from "./utils";

/** Metadata resolved from an ISBN lookup (a partial book, no library state). */
export interface BookMetadata {
    title: string;
    author: string;
    imageUrl: string;
    isbn: string;
    description?: string;
    pageCount?: number;
    publishedYear?: string;
    categories?: string[];
    publisher?: string;
}

/**
 * Resolves book metadata from an ISBN using free, key-less APIs.
 * Google Books is tried first (good Portuguese coverage + rich fields),
 * with Open Library as a fallback. All requests go through Obsidian's
 * requestUrl to avoid CORS issues on mobile.
 */
export class MetadataService {
    /** Last provider-level error (e.g. Google auth/quota), for the UI to show. */
    lastError: string | null = null;

    constructor(private getApiKey: () => string = () => '') { }

    async lookupByIsbn(rawIsbn: string): Promise<BookMetadata | null> {
        this.lastError = null;
        const isbn = normalizeIsbn(rawIsbn);
        if (!isbn) return null;

        const hasKey = !!(this.getApiKey() || '').trim();
        if (hasKey) {
            // With a personal key, Google Books is reliable and has the widest
            // coverage (incl. Portuguese/European titles) — use it first.
            const google = await this.fromGoogleBooks(isbn);
            if (google) return google;
            return this.fromOpenLibrary(isbn);
        }

        // Key-less: Open Library first (reliable), key-less Google as a best-
        // effort fallback (its shared quota is often exhausted → HTTP 429).
        const ol = await this.fromOpenLibrary(isbn);
        if (ol) return ol;
        return this.fromGoogleBooks(isbn);
    }

    private extractYear(date: string | undefined): string | undefined {
        if (!date) return undefined;
        const match = date.match(/\d{4}/);
        return match ? match[0] : undefined;
    }

    /** Force https and drop Google's page-curl edge so covers look clean. */
    private cleanGoogleCover(url: string | undefined): string {
        if (!url) return '';
        return url.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
    }

    private async fromGoogleBooks(isbn: string): Promise<BookMetadata | null> {
        try {
            const key = (this.getApiKey() || '').trim();
            const keyParam = key ? `&key=${encodeURIComponent(key)}` : '';
            const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1${keyParam}`;

            // Retry transient server errors (503/500/502/504) and rate limits (429)
            // with a short backoff — Google Books returns these intermittently.
            const TRANSIENT = [429, 500, 502, 503, 504];
            let res = await requestUrl({ url, throw: false });
            for (let attempt = 1; attempt <= 3 && TRANSIENT.includes(res.status); attempt++) {
                await new Promise(r => setTimeout(r, 500 * attempt));
                res = await requestUrl({ url, throw: false });
            }

            if (res.status !== 200) {
                // Surface the real reason (bad key, Books API disabled, quota…).
                let msg = '';
                try { msg = res.json?.error?.message || ''; } catch { /* non-JSON body */ }
                this.lastError = `Google Books (HTTP ${res.status})${msg ? ': ' + msg : ''}`;
                return null;
            }

            const data = res.json;
            const item = data?.items?.[0];
            const info = item?.volumeInfo;
            if (!info || !info.title) return null;

            return {
                title: info.title + (info.subtitle ? `: ${info.subtitle}` : ''),
                author: Array.isArray(info.authors) && info.authors.length
                    ? info.authors.join(', ')
                    : 'Unknown Author',
                imageUrl: this.cleanGoogleCover(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
                isbn,
                description: info.description || undefined,
                pageCount: typeof info.pageCount === 'number' && info.pageCount > 0 ? info.pageCount : undefined,
                publishedYear: this.extractYear(info.publishedDate),
                categories: Array.isArray(info.categories) ? info.categories : undefined,
                publisher: info.publisher || undefined
            };
        } catch (e) {
            console.error('Google Books lookup failed:', e);
            return null;
        }
    }

    private async fromOpenLibrary(isbn: string): Promise<BookMetadata | null> {
        try {
            // The Books API returns 200 directly (the /isbn/{isbn}.json route
            // 302-redirects) and includes author names, cover, pages, publisher
            // and subjects in a single response.
            const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
            const res = await requestUrl({ url, throw: false });
            if (res.status !== 200) return null;

            const rec = res.json?.[`ISBN:${isbn}`];
            if (!rec || !rec.title) return null;

            const authors = Array.isArray(rec.authors)
                ? rec.authors.map((a: any) => a?.name).filter(Boolean)
                : [];
            const cover = rec.cover?.large || rec.cover?.medium || rec.cover?.small || '';
            const subjects = Array.isArray(rec.subjects)
                ? rec.subjects.map((s: any) => s?.name).filter(Boolean).slice(0, 5)
                : undefined;
            const publisher = Array.isArray(rec.publishers) && rec.publishers[0]
                ? rec.publishers[0].name
                : undefined;

            let description: string | undefined;
            if (typeof rec.notes === 'string') description = rec.notes;
            else if (rec.notes?.value) description = rec.notes.value;
            else if (Array.isArray(rec.excerpts) && rec.excerpts[0]?.text) description = rec.excerpts[0].text;

            return {
                title: rec.title + (rec.subtitle ? `: ${rec.subtitle}` : ''),
                author: authors.length ? authors.join(', ') : 'Unknown Author',
                imageUrl: cover,
                isbn,
                description,
                pageCount: typeof rec.number_of_pages === 'number' ? rec.number_of_pages : undefined,
                publishedYear: this.extractYear(rec.publish_date),
                categories: subjects && subjects.length ? subjects : undefined,
                publisher
            };
        } catch (e) {
            console.error('Open Library lookup failed:', e);
            return null;
        }
    }
}
