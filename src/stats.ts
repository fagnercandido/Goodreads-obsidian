import { DBEntry } from "./database";
import { parseBookDate } from "./utils";
import { t } from "./i18n";

/** Year of a readAt / dateAdded string (parsed as a local date), or null. */
function yearOf(s: string | undefined): number | null {
    const d = parseBookDate(s);
    return d ? d.getFullYear() : null;
}

interface BarRow {
    label: string;
    value: number;
    color?: string;
    sublabel?: string;
}

/** Horizontal bars: a labeled row with a proportional fill. Fully responsive. */
function horizontalBars(parent: HTMLElement, rows: BarRow[], emptyText: string) {
    if (!rows.length || rows.every(r => r.value === 0)) {
        parent.createDiv({ cls: "goodreads-stat-empty", text: emptyText });
        return;
    }
    const max = Math.max(...rows.map(r => r.value), 1);
    const chart = parent.createDiv({ cls: "goodreads-hbar-chart" });
    rows.forEach(r => {
        const row = chart.createDiv({ cls: "goodreads-hbar-row" });
        row.createDiv({ cls: "goodreads-hbar-label", text: r.label });
        const track = row.createDiv({ cls: "goodreads-hbar-track" });
        const fill = track.createDiv({ cls: "goodreads-hbar-fill" });
        fill.style.width = `${Math.round((r.value / max) * 100)}%`;
        if (r.color) fill.style.background = r.color;
        row.createDiv({ cls: "goodreads-hbar-value", text: String(r.value) });
    });
}

/** Vertical columns for time series (years / months). */
function verticalColumns(parent: HTMLElement, cols: BarRow[], emptyText: string) {
    if (!cols.length || cols.every(c => c.value === 0)) {
        parent.createDiv({ cls: "goodreads-stat-empty", text: emptyText });
        return;
    }
    const max = Math.max(...cols.map(c => c.value), 1);
    const chart = parent.createDiv({ cls: "goodreads-vcol-chart" });
    cols.forEach(c => {
        const col = chart.createDiv({ cls: "goodreads-vcol" });
        col.createDiv({ cls: "goodreads-vcol-value", text: c.value ? String(c.value) : "" });
        const barWrap = col.createDiv({ cls: "goodreads-vcol-barwrap" });
        const bar = barWrap.createDiv({ cls: "goodreads-vcol-bar" });
        bar.style.height = `${Math.round((c.value / max) * 100)}%`;
        if (c.color) bar.style.background = c.color;
        col.createDiv({ cls: "goodreads-vcol-label", text: c.label });
    });
}

function section(parent: HTMLElement, title: string): HTMLElement {
    const s = parent.createDiv({ cls: "goodreads-stat-section" });
    s.createEl("h3", { text: title, cls: "goodreads-stat-title" });
    return s;
}

const STATUS_COLORS: Record<string, string> = {
    read: "var(--gr-read)",
    reading: "var(--gr-reading)",
    "to-read": "var(--gr-toread)"
};

const FORMAT_COLORS: Record<string, string> = {
    physical: "var(--gr-physical)",
    digital: "var(--gr-digital)",
    library: "var(--gr-library)"
};

export function renderStats(container: HTMLElement, books: DBEntry[]) {
    const wrap = container.createDiv({ cls: "goodreads-stats" });

    if (books.length === 0) {
        wrap.createDiv({ cls: "goodreads-empty-state" }).createEl("p", { text: t("NO_BOOKS_FOUND") });
        return;
    }

    const readBooks = books.filter(b => b.status === 'read');
    const readingCount = books.filter(b => b.status === 'reading').length;
    const toReadCount = books.filter(b => b.status === 'to-read').length;
    const physicalCount = books.filter(b => b.format === 'physical').length;
    const digitalCount = books.filter(b => b.format === 'digital').length;
    const libraryCount = books.filter(b => b.format === 'library').length;
    const pagesRead = readBooks.reduce((sum, b) => sum + (b.pageCount || 0), 0);
    const ratedBooks = books.filter(b => (parseInt(b.userRating) || 0) > 0);
    const avgRating = ratedBooks.length
        ? (ratedBooks.reduce((s, b) => s + (parseInt(b.userRating) || 0), 0) / ratedBooks.length)
        : 0;

    // --- Summary tiles ---
    const tiles = wrap.createDiv({ cls: "goodreads-stat-tiles" });
    const tile = (value: string, label: string, accent?: string) => {
        const el = tiles.createDiv({ cls: "goodreads-stat-tile" });
        const v = el.createDiv({ cls: "goodreads-stat-tile-value", text: value });
        if (accent) v.style.color = accent;
        el.createDiv({ cls: "goodreads-stat-tile-label", text: label });
    };
    tile(String(books.length), t("STAT_TOTAL"));
    tile(String(readBooks.length), t("STAT_READ"), STATUS_COLORS.read);
    tile(String(readingCount), t("STAT_READING"), STATUS_COLORS.reading);
    tile(String(toReadCount), t("STAT_TO_READ"), STATUS_COLORS["to-read"]);
    tile(String(physicalCount), t("FORMAT_PHYSICAL"), FORMAT_COLORS.physical);
    tile(String(digitalCount), t("FORMAT_DIGITAL"), FORMAT_COLORS.digital);
    tile(String(libraryCount), t("FORMAT_LIBRARY"), FORMAT_COLORS.library);
    tile(pagesRead.toLocaleString(), t("STAT_PAGES"));
    if (avgRating > 0) tile(avgRating.toFixed(1), t("STAT_AVG_RATING"), "var(--gr-rating)");

    // --- Comparison: read vs physical library vs digital ---
    const comparisonRows: BarRow[] = [
        { label: t("STAT_READ"), value: readBooks.length, color: STATUS_COLORS.read },
        { label: t("FORMAT_PHYSICAL"), value: physicalCount, color: FORMAT_COLORS.physical },
        { label: t("FORMAT_DIGITAL"), value: digitalCount, color: FORMAT_COLORS.digital },
    ];
    horizontalBars(section(wrap, t("STAT_COMPARISON")), comparisonRows, t("STAT_NO_DATA"));

    // --- Collection by format / source ---
    const formatRows: BarRow[] = [
        { label: t("FORMAT_PHYSICAL"), value: physicalCount, color: FORMAT_COLORS.physical },
        { label: t("FORMAT_DIGITAL"), value: digitalCount, color: FORMAT_COLORS.digital },
        { label: t("FORMAT_LIBRARY"), value: libraryCount, color: FORMAT_COLORS.library },
    ];
    horizontalBars(section(wrap, t("STAT_BY_FORMAT")), formatRows, t("STAT_NO_DATA"));

    // --- Read per year ---
    const yearMap = new Map<number, number>();
    readBooks.forEach(b => {
        const y = yearOf(b.readAt) ?? yearOf(b.dateAdded);
        if (y) yearMap.set(y, (yearMap.get(y) || 0) + 1);
    });
    const yearRows: BarRow[] = Array.from(yearMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([year, count]) => ({ label: String(year), value: count, color: STATUS_COLORS.read }));
    verticalColumns(section(wrap, t("STAT_BY_YEAR")), yearRows, t("STAT_NO_DATA"));

    // --- Read per month (current year) ---
    const now = new Date();
    const currentYear = now.getFullYear();
    const monthCounts = new Array(12).fill(0);
    readBooks.forEach(b => {
        const d = parseBookDate(b.readAt);
        if (d && d.getFullYear() === currentYear) {
            const mi = d.getMonth();
            monthCounts[mi] = (monthCounts[mi] || 0) + 1;
        }
    });
    const monthNames = t("MONTHS_SHORT").split(",");
    const monthRows: BarRow[] = monthCounts.map((v, i) => ({
        label: monthNames[i] || String(i + 1),
        value: v,
        color: STATUS_COLORS.read
    }));
    verticalColumns(section(wrap, t("STAT_BY_MONTH", { year: currentYear })), monthRows, t("STAT_NO_DATA"));

    // --- Rating distribution ---
    const ratingCounts = [0, 0, 0, 0, 0];
    books.forEach(b => {
        const r = parseInt(b.userRating) || 0;
        if (r >= 1 && r <= 5) ratingCounts[r - 1] = (ratingCounts[r - 1] || 0) + 1;
    });
    const ratingRows: BarRow[] = ratingCounts.map((v, i) => ({
        label: "⭐".repeat(i + 1),
        value: v,
        color: "var(--gr-rating)"
    })).reverse();
    horizontalBars(section(wrap, t("STAT_RATINGS")), ratingRows, t("STAT_NO_DATA"));

    // --- Top authors ---
    const authorMap = new Map<string, number>();
    books.forEach(b => {
        if (b.author && b.author !== 'Unknown Author') {
            authorMap.set(b.author, (authorMap.get(b.author) || 0) + 1);
        }
    });
    const authorRows: BarRow[] = Array.from(authorMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([author, count]) => ({ label: author, value: count }));
    horizontalBars(section(wrap, t("STAT_TOP_AUTHORS")), authorRows, t("STAT_NO_DATA"));

    // --- Genres ---
    const genreMap = new Map<string, number>();
    books.forEach(b => {
        (b.categories || []).forEach(c => {
            const key = (c.split("/")[0] || "").trim();
            if (key) genreMap.set(key, (genreMap.get(key) || 0) + 1);
        });
    });
    const genreRows: BarRow[] = Array.from(genreMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([genre, count]) => ({ label: genre, value: count, color: "var(--gr-digital)" }));
    horizontalBars(section(wrap, t("STAT_GENRES")), genreRows, t("STAT_NO_GENRES"));
}
