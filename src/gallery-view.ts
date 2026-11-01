import { ItemView, WorkspaceLeaf, TFile, Menu, Notice } from "obsidian";
import GoodReadsPlugin from "./main";
import { DBEntry, DbChange } from "./database";
import { BookStatus, BookFormat } from "./rss-parser";
import { AddBookModal } from "./add-book-modal";
import { renderStats } from "./stats";
import { t } from "./i18n";

export const VIEW_TYPE_GOODREADS_GALLERY = "goodreads-gallery-view";

type Filter = 'all' | 'read' | 'reading' | 'to-read' | 'physical' | 'digital' | 'library' | 'uncategorized';

const FILTER_DEFS: { key: Filter; labelKey: any }[] = [
    { key: 'all', labelKey: 'FILTER_ALL' },
    { key: 'read', labelKey: 'FILTER_READ' },
    { key: 'reading', labelKey: 'FILTER_READING' },
    { key: 'to-read', labelKey: 'FILTER_TO_READ' },
    { key: 'physical', labelKey: 'FORMAT_PHYSICAL' },
    { key: 'digital', labelKey: 'FORMAT_DIGITAL' },
    { key: 'library', labelKey: 'FORMAT_LIBRARY' },
    { key: 'uncategorized', labelKey: 'FILTER_UNCATEGORIZED' },
];

export class GalleryView extends ItemView {
    plugin: GoodReadsPlugin;
    private filter: Filter = 'all';
    private showStats = false;

    // Batch selection mode.
    private selectionMode = false;
    private selected = new Set<string>();
    private bulkBarEl: HTMLElement | null = null;
    private removeArmed = false;

    // Cached elements so single-book changes can update in place.
    private gridEl: HTMLElement | null = null;
    private filterBarEl: HTMLElement | null = null;
    private countEl: HTMLElement | null = null;

    // Coalesced change tracking.
    private renderTimer: number | null = null;
    private pendingReset = false;
    private pendingUpdates = new Set<string>();

    private scheduleRender = (change: DbChange) => {
        if (!change || change.type === 'reset') this.pendingReset = true;
        else this.pendingUpdates.add(change.id);
        if (this.renderTimer !== null) return;
        this.renderTimer = window.setTimeout(() => {
            this.renderTimer = null;
            this.flushChanges();
        }, 50);
    };

    constructor(leaf: WorkspaceLeaf, plugin: GoodReadsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_GOODREADS_GALLERY;
    }

    getDisplayText() {
        return this.plugin.settings.viewDisplayName || t("VIEW_DISPLAY_TEXT");
    }

    getIcon() {
        return "book";
    }

    async onOpen() {
        this.render();
        this.plugin.db.on(this.scheduleRender);
    }

    async onClose() {
        this.plugin.db.off(this.scheduleRender);
        if (this.renderTimer !== null) {
            window.clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }
        this.pendingUpdates.clear();
    }

    private flushChanges() {
        const reset = this.pendingReset;
        const ids = Array.from(this.pendingUpdates);
        this.pendingReset = false;
        this.pendingUpdates.clear();
        // A structural change, the stats view, or a missing grid needs a full
        // rebuild; otherwise update just the affected cards.
        if (reset || this.showStats || !this.gridEl) {
            // A reset (e.g. a sync) can change statuses out from under an active
            // selection; drop ids that no longer match the current filter.
            if (reset && this.selectionMode && !this.showStats) this.pruneSelection();
            this.render();
            return;
        }
        for (const id of ids) this.updateCard(id);
    }

    private matchesFilter(b: DBEntry): boolean {
        switch (this.filter) {
            case 'read': return b.status === 'read';
            case 'reading': return b.status === 'reading';
            case 'to-read': return b.status === 'to-read';
            case 'physical': return b.format === 'physical';
            case 'digital': return b.format === 'digital';
            case 'library': return b.format === 'library';
            case 'uncategorized': return b.format === 'none';
            default: return true;
        }
    }

    private filterBooks(books: DBEntry[]): DBEntry[] {
        return this.filter === 'all' ? books : books.filter(b => this.matchesFilter(b));
    }

    render() {
        try {
            // Any full re-render (filter change, mode toggle, stats, bulk apply,
            // DB reset) disarms the two-click Remove, so its confirmation can
            // never outlive the exact selection that armed it.
            this.removeArmed = false;

            const container = this.contentEl;
            container.empty();
            container.addClass("goodreads-gallery-view-container");
            this.gridEl = null;
            this.filterBarEl = null;
            this.countEl = null;

            const allBooks = this.plugin.db.getBooks();

            // Header
            const header = container.createDiv({ cls: "goodreads-gallery-header" });
            const titleRow = header.createDiv({ cls: "goodreads-title-row" });
            const titleText = this.plugin.settings.galleryTitle || t("GALLERY_TITLE");
            titleRow.createEl("h1", { text: titleText });

            const actions = titleRow.createDiv({ cls: "goodreads-header-actions" });
            const addBtn = actions.createEl("button", { cls: "goodreads-btn goodreads-btn-cta", text: t("ADD_BOOK_BUTTON") });
            addBtn.onclick = () => new AddBookModal(this.plugin).open();
            if (!this.showStats) {
                const selBtn = actions.createEl("button", {
                    cls: `goodreads-btn ${this.selectionMode ? 'is-active' : ''}`,
                    text: this.selectionMode ? t("SELECT_EXIT") : t("SELECT_MODE")
                });
                selBtn.onclick = () => this.setSelectionMode(!this.selectionMode);
            }
            const statsBtn = actions.createEl("button", {
                cls: `goodreads-btn ${this.showStats ? 'is-active' : ''}`,
                text: this.showStats ? t("SHOW_GALLERY_BUTTON") : t("SHOW_STATS_BUTTON")
            });
            statsBtn.onclick = () => {
                this.showStats = !this.showStats;
                if (this.showStats) { this.selectionMode = false; this.selected.clear(); }
                this.render();
            };

            if (this.showStats) {
                renderStats(container, allBooks);
                return;
            }

            // Filter bar
            this.filterBarEl = header.createDiv({ cls: "goodreads-filter-bar" });
            this.populateFilterBar(allBooks);

            this.countEl = header.createEl("p", { cls: "goodreads-count-text" });
            this.updateCountText(allBooks);

            // Batch action bar
            if (this.selectionMode) {
                this.bulkBarEl = container.createDiv({ cls: "goodreads-bulk-bar" });
                this.populateBulkBar();
            } else {
                this.bulkBarEl = null;
            }

            const books = this.filterBooks(allBooks);
            if (books.length === 0) {
                const empty = container.createDiv({ cls: "goodreads-empty-state" });
                empty.createEl("p", { text: allBooks.length === 0 ? t("NO_BOOKS_FOUND") : t("NO_BOOKS_FILTER") });
                return;
            }

            // Sorting: most recently read/added first.
            const withTs = books.map(b => ({ book: b, ts: this.bookTimestamp(b) }));
            withTs.sort((a, b) => b.ts - a.ts);

            // Grid
            this.gridEl = container.createDiv({ cls: "goodreads-books-grid" });
            withTs.forEach(({ book }) => this.renderCard(this.gridEl as HTMLElement, book));
        } catch (e) {
            console.error("GoodReads gallery render failed:", e);
            this.contentEl.empty();
            this.contentEl.createEl("p", { text: t("RENDER_ERROR") });
        }
    }

    private computeCounts(allBooks: DBEntry[]): Record<Filter, number> {
        const c: Record<Filter, number> = {
            all: allBooks.length, read: 0, reading: 0, 'to-read': 0,
            physical: 0, digital: 0, library: 0, uncategorized: 0
        };
        for (const b of allBooks) {
            if (b.status === 'read') c.read++;
            else if (b.status === 'reading') c.reading++;
            else if (b.status === 'to-read') c['to-read']++;
            if (b.format === 'physical') c.physical++;
            else if (b.format === 'digital') c.digital++;
            else if (b.format === 'library') c.library++;
            else c.uncategorized++;
        }
        return c;
    }

    private populateFilterBar(allBooks: DBEntry[]) {
        if (!this.filterBarEl) return;
        const counts = this.computeCounts(allBooks);
        this.filterBarEl.empty();
        FILTER_DEFS.forEach(f => {
            const btn = (this.filterBarEl as HTMLElement).createEl("button", {
                cls: `goodreads-filter-btn ${this.filter === f.key ? 'is-active' : ''}`,
                text: `${t(f.labelKey)} (${counts[f.key] ?? 0})`
            });
            btn.onclick = () => { this.filter = f.key; this.render(); };
        });
    }

    private updateCountText(allBooks: DBEntry[]) {
        if (!this.countEl) return;
        this.countEl.setText(t("BOOKS_IN_COLLECTION", { count: this.filterBooks(allBooks).length }));
    }

    private refreshHeaderCounts() {
        const allBooks = this.plugin.db.getBooks();
        this.populateFilterBar(allBooks);
        this.updateCountText(allBooks);
    }

    private bookTimestamp(b: DBEntry): number {
        const src = b.readAt || b.dateAdded || '';
        return src ? (new Date(src).getTime() || 0) : 0;
    }

    /** Update (or remove) a single card without rebuilding the whole grid. */
    private updateCard(id: string) {
        const grid = this.gridEl;
        if (!grid) { this.render(); return; }

        const book = this.plugin.db.getBook(id);
        const old = this.findCardEl(id);

        if (!book || !this.matchesFilter(book)) {
            old?.remove();
        } else {
            this.renderCard(grid, book);
            const fresh = grid.lastElementChild as HTMLElement | null;
            if (old && fresh) {
                grid.insertBefore(fresh, old);
                old.remove();
            }
        }

        this.refreshHeaderCounts();
        if (grid.childElementCount === 0) this.render();
    }

    private findCardEl(id: string): HTMLElement | null {
        if (!this.gridEl) return null;
        const children = this.gridEl.children;
        for (let i = 0; i < children.length; i++) {
            const el = children[i] as HTMLElement;
            if (el.getAttribute('data-book-id') === id) return el;
        }
        return null;
    }

    // --- Batch selection ---

    private setSelectionMode(on: boolean) {
        this.selectionMode = on;
        if (!on) { this.selected.clear(); this.removeArmed = false; }
        this.render();
    }

    private toggleSelect(id: string, card: HTMLElement) {
        if (this.selected.has(id)) {
            this.selected.delete(id);
            card.removeClass('is-selected');
        } else {
            this.selected.add(id);
            card.addClass('is-selected');
        }
        this.removeArmed = false;
        this.populateBulkBar();
    }

    private selectAllVisible() {
        this.removeArmed = false;
        const grid = this.gridEl;
        if (!grid) { this.populateBulkBar(); return; }
        const children = grid.children;
        for (let i = 0; i < children.length; i++) {
            const el = children[i] as HTMLElement;
            const id = el.getAttribute('data-book-id');
            if (id) { this.selected.add(id); el.addClass('is-selected'); }
        }
        this.populateBulkBar();
    }

    private clearSelection() {
        this.removeArmed = false;
        this.selected.clear();
        const grid = this.gridEl;
        if (grid) {
            const children = grid.children;
            for (let i = 0; i < children.length; i++) {
                (children[i] as HTMLElement).removeClass('is-selected');
            }
        }
        this.populateBulkBar();
    }

    /** Drop ids that no longer exist or no longer match the active filter,
     *  so the count and subsequent bulk targets track what's on screen. */
    private pruneSelection() {
        for (const id of Array.from(this.selected)) {
            const b = this.plugin.db.getBook(id);
            if (!b || !this.matchesFilter(b)) this.selected.delete(id);
        }
    }

    private populateBulkBar() {
        const bar = this.bulkBarEl;
        if (!bar) return;
        bar.empty();

        const top = bar.createDiv({ cls: "goodreads-bulk-row" });
        top.createSpan({ cls: "goodreads-bulk-count", text: t("BULK_SELECTED", { count: this.selected.size }) });
        const selAll = top.createEl("button", { cls: "goodreads-btn", text: t("BULK_SELECT_ALL") });
        selAll.onclick = () => this.selectAllVisible();
        const clr = top.createEl("button", { cls: "goodreads-btn", text: t("BULK_CLEAR") });
        clr.onclick = () => this.clearSelection();
        const exit = top.createEl("button", { cls: "goodreads-btn", text: t("SELECT_EXIT") });
        exit.onclick = () => this.setSelectionMode(false);

        const fmtRow = bar.createDiv({ cls: "goodreads-bulk-row" });
        fmtRow.createSpan({ cls: "goodreads-bulk-label", text: t("BULK_FORMAT_LABEL") });
        (['physical', 'digital', 'library', 'none'] as BookFormat[]).forEach(f => {
            const b = fmtRow.createEl("button", { cls: "goodreads-btn", text: this.formatLabel(f) });
            b.onclick = () => this.applyBulkFormat(f);
        });

        const stRow = bar.createDiv({ cls: "goodreads-bulk-row" });
        stRow.createSpan({ cls: "goodreads-bulk-label", text: t("BULK_STATUS_LABEL") });
        (['read', 'reading', 'to-read'] as BookStatus[]).forEach(s => {
            const b = stRow.createEl("button", { cls: "goodreads-btn", text: this.statusLabel(s) });
            b.onclick = () => this.applyBulkStatus(s);
        });

        const rmRow = bar.createDiv({ cls: "goodreads-bulk-row" });
        const rm = rmRow.createEl("button", {
            cls: `goodreads-btn goodreads-btn-danger ${this.removeArmed ? 'is-armed' : ''}`,
            text: this.removeArmed ? t("BULK_REMOVE_CONFIRM", { count: this.selected.size }) : t("BULK_REMOVE")
        });
        rm.onclick = () => this.bulkRemove();
    }

    private applyBulkFormat(format: BookFormat) {
        if (this.selected.size === 0) { new Notice(t("BULK_NONE")); return; }
        const n = this.plugin.db.setFormatMany(Array.from(this.selected), format);
        this.pruneSelection();
        new Notice(t("BULK_APPLIED", { count: n }));
    }

    private applyBulkStatus(status: BookStatus) {
        if (this.selected.size === 0) { new Notice(t("BULK_NONE")); return; }
        const n = this.plugin.db.setStatusMany(Array.from(this.selected), status);
        this.pruneSelection();
        new Notice(t("BULK_APPLIED", { count: n }));
    }

    private bulkRemove() {
        if (this.selected.size === 0) { new Notice(t("BULK_NONE")); return; }
        if (!this.removeArmed) {
            // First click arms; the button relabels to a confirmation.
            this.removeArmed = true;
            this.populateBulkBar();
            return;
        }
        const ids = Array.from(this.selected);
        this.removeArmed = false;
        this.selected.clear();
        const n = this.plugin.db.removeMany(ids);
        new Notice(t("BULK_REMOVED", { count: n }));
    }

    private statusLabel(status: BookStatus): string {
        switch (status) {
            case 'read': return t('STATUS_READ');
            case 'reading': return t('STATUS_READING');
            case 'to-read': return t('STATUS_TO_READ');
            default: return String(status);
        }
    }

    private formatLabel(format: BookFormat): string {
        switch (format) {
            case 'physical': return t('FORMAT_PHYSICAL');
            case 'digital': return t('FORMAT_DIGITAL');
            case 'library': return t('FORMAT_LIBRARY');
            case 'none': return t('FORMAT_NONE');
            default: return String(format);
        }
    }

    private renderCard(grid: HTMLElement, book: DBEntry) {
        const isSel = this.selectionMode && this.selected.has(book.id);
        const cls = [
            'goodreads-book-card', `status-${book.status}`,
            book.hasNote ? 'has-note' : '',
            this.selectionMode ? 'selectable' : '',
            isSel ? 'is-selected' : ''
        ].filter(Boolean).join(' ');
        const card = grid.createDiv({ cls });
        card.setAttribute('data-book-id', book.id);

        // Cover Wrapper
        const coverWrapper = card.createDiv({ cls: "book-cover-wrapper" });
        if (book.imageUrl) {
            coverWrapper.createEl("img", {
                cls: "book-cover",
                attr: { src: book.imageUrl, alt: book.title, loading: "lazy", decoding: "async" }
            });
        } else {
            coverWrapper.createDiv({ cls: "book-cover book-cover-empty", text: t("NO_COVER") });
        }

        // Badges (status + format)
        const badges = coverWrapper.createDiv({ cls: "book-badges" });
        badges.createDiv({ cls: `book-status-badge status-${book.status}`, text: this.statusLabel(book.status) });
        if (book.format !== 'none') {
            badges.createDiv({ cls: `book-format-badge format-${book.format}`, text: this.formatLabel(book.format) });
        }

        if (this.selectionMode) {
            // Selection checkmark (visible when selected via CSS).
            coverWrapper.createDiv({ cls: "book-select-check", text: "✓" });
        } else {
            // Menu button
            const menuBtn = coverWrapper.createDiv({ cls: "book-menu-btn", text: "⋯" });
            menuBtn.onclick = (evt) => { evt.stopPropagation(); this.openCardMenu(evt, book); };
        }

        // Overlay
        const overlay = coverWrapper.createDiv({ cls: "book-overlay" });
        const overlayContent = overlay.createDiv({ cls: "book-overlay-content" });
        const rating = Math.max(0, Math.min(5, parseInt(book.userRating) || 0));
        if (rating > 0) {
            overlayContent.createDiv({ cls: "book-rating", text: '⭐'.repeat(rating) });
        }
        overlayContent.createDiv({
            cls: "book-status",
            text: (book.hasNote && book.notePath) ? t("HAS_NOTE") : t("CLICK_TO_CREATE")
        });

        // Info
        const info = card.createDiv({ cls: "book-info" });
        info.createDiv({ cls: "book-title", text: book.title });
        info.createDiv({ cls: "book-author", text: book.author });

        // Click => toggle selection (in selection mode) or open/create note
        card.onclick = this.selectionMode
            ? () => this.toggleSelect(book.id, card)
            : () => this.openOrCreateNote(book);
    }

    private openCardMenu(evt: MouseEvent, book: DBEntry) {
        const menu = new Menu();

        menu.addItem(item => item
            .setTitle(book.hasNote ? t("MENU_OPEN_NOTE") : t("MENU_CREATE_NOTE"))
            .setIcon("file-text")
            .onClick(() => this.openOrCreateNote(book)));

        menu.addSeparator();

        const statuses: BookStatus[] = ['read', 'reading', 'to-read'];
        statuses.forEach(s => {
            menu.addItem(item => item
                .setTitle(this.statusLabel(s))
                .setChecked(book.status === s)
                .onClick(() => { this.plugin.db.setStatus(book.id, s); menu.hide(); }));
        });

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle(t("MENU_FORMAT")).setIcon("book-copy");
            const formats: BookFormat[] = ['physical', 'digital', 'library', 'none'];
            const sub = (item as any).setSubmenu?.();
            if (sub) {
                formats.forEach(f => sub.addItem((si: any) => si
                    .setTitle(this.formatLabel(f))
                    .setChecked(book.format === f)
                    .onClick(() => { this.plugin.db.setFormat(book.id, f); menu.hide(); })));
            } else {
                item.onClick(() => {
                    const idx = formats.indexOf(book.format);
                    const next = formats[(idx + 1) % formats.length] as BookFormat;
                    this.plugin.db.setFormat(book.id, next);
                });
            }
        });

        menu.addItem(item => {
            item.setTitle(t("MENU_RATING")).setIcon("star");
            const sub = (item as any).setSubmenu?.();
            if (sub) {
                sub.addItem((si: any) => si.setTitle(t("MENU_RATING_CLEAR"))
                    .onClick(() => { this.plugin.db.setRating(book.id, 0); menu.hide(); }));
                for (let r = 1; r <= 5; r++) {
                    sub.addItem((si: any) => si.setTitle('⭐'.repeat(r))
                        .setChecked(parseInt(book.userRating) === r)
                        .onClick(() => { this.plugin.db.setRating(book.id, r); menu.hide(); }));
                }
            } else {
                // No submenu support: cycle 0->5.
                item.onClick(() => {
                    const cur = parseInt(book.userRating) || 0;
                    this.plugin.db.setRating(book.id, (cur + 1) % 6);
                });
            }
        });

        menu.addSeparator();

        menu.addItem(item => item
            .setTitle(t("MENU_REMOVE"))
            .setIcon("trash")
            .setWarning(true)
            .onClick(() => {
                this.plugin.db.removeBook(book.id);
            }));

        menu.showAtMouseEvent(evt);
    }

    private async openOrCreateNote(book: DBEntry) {
        if (book.hasNote && book.notePath) {
            const file = this.app.vault.getAbstractFileByPath(book.notePath);
            if (file instanceof TFile) {
                await this.app.workspace.getLeaf('tab').openFile(file);
                return;
            }
        }
        await this.createNoteForBook(book);
    }

    async createNoteForBook(book: DBEntry) {
        if (!this.plugin.settings.noteFolder) {
            return;
        }
        const path = await this.plugin.noteCreator.createNote(book, this.plugin.settings.noteFolder);
        if (path) {
            this.plugin.db.setNoteCreated(book.id, path);
        }
    }
}
