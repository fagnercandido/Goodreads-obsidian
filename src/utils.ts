/**
 * Strip everything that is not an ISBN digit (0-9 or the check char X)
 * and upper-case, so "978-85-359-0277-5" -> "9788535902775".
 */
export function normalizeIsbn(raw: string): string {
    return (raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

/** Basic sanity check for ISBN-10 / ISBN-13 length. */
export function isValidIsbn(raw: string): boolean {
    const isbn = normalizeIsbn(raw);
    return isbn.length === 10 || isbn.length === 13;
}

/**
 * Parse a book date into a LOCAL Date. Date-only strings ("YYYY-MM-DD" /
 * "YYYY-MM") are otherwise parsed as UTC midnight by the JS engine and then
 * read back with local getters, which shifts the day (and thus the month/year)
 * backwards in negative-UTC-offset timezones. Building a local Date avoids that.
 */
export function parseBookDate(s: string | undefined): Date | null {
    if (!s) return null;
    // Date-only strings ("YYYY", "YYYY-MM", "YYYY-MM-DD") -> local Date.
    const m = s.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
    if (m) {
        const year = parseInt(m[1] as string, 10);
        const month = m[2] ? parseInt(m[2], 10) - 1 : 0;
        const day = m[3] ? parseInt(m[3], 10) : 1;
        return new Date(year, month, day);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/** Make a filesystem/id-safe slug from arbitrary text. */
export function slugify(text: string): string {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')                 // split accented chars into base + combining mark
        .replace(/[^\x00-\x7F]/g, '')     // drop non-ASCII (combining marks, etc.)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}
