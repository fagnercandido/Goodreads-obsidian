import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import GoodReadsPlugin from "./main";
import { DBEntry } from "./database";
import { t } from "./i18n";

export const VIEW_TYPE_GOODREADS_GALLERY = "goodreads-gallery-view";

export class GalleryView extends ItemView {
    plugin: GoodReadsPlugin;
    boundRender = this.render.bind(this);

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
        this.plugin.db.on(this.boundRender);
    }

    async onClose() {
        this.plugin.db.off(this.boundRender);
    }

    render() {
        const container = this.contentEl;
        container.empty();
        container.addClass("goodreads-gallery-view-container");

        const books = this.plugin.db.getBooks();

        // Header
        const header = container.createDiv({ cls: "goodreads-gallery-header" });
        const titleText = this.plugin.settings.galleryTitle || t("GALLERY_TITLE");
        header.createEl("h1", { text: titleText });
        header.createEl("p", {
            text: t("BOOKS_IN_COLLECTION", { count: books.length }),
            cls: "goodreads-count-text"
        });

        if (books.length === 0) {
            const empty = container.createDiv({ cls: "goodreads-empty-state" });
            empty.createEl("p", { text: t("NO_BOOKS_FOUND") });
            return;
        }

        // Sorting
        const sortedBooks = [...books].sort((a, b) => {
            const dateA = a.readAt ? new Date(a.readAt).getTime() : 0;
            const dateB = b.readAt ? new Date(b.readAt).getTime() : 0;
            return dateB - dateA;
        });

        // Grid
        const grid = container.createDiv({ cls: "goodreads-books-grid" });

        sortedBooks.forEach(book => {
            const card = grid.createDiv({ cls: `goodreads-book-card ${book.hasNote ? 'has-note' : ''}` });
            card.setAttribute('data-book-id', book.id);

            // Cover Wrapper
            const coverWrapper = card.createDiv({ cls: "book-cover-wrapper" });
            const imageUrl = book.imageUrl || 'https://via.placeholder.com/150x200?text=No+Cover';
            coverWrapper.createEl("img", {
                cls: "book-cover",
                attr: { src: imageUrl, alt: book.title }
            });

            // Overlay
            const overlay = coverWrapper.createDiv({ cls: "book-overlay" });
            const overlayContent = overlay.createDiv({ cls: "book-overlay-content" });

            if (book.userRating && book.userRating !== '0') {
                const rating = parseInt(book.userRating);
                overlayContent.createDiv({ cls: "book-rating", text: '⭐'.repeat(rating) });
            }

            if (book.hasNote && book.notePath) {
                overlayContent.createDiv({ cls: "book-status", text: t("HAS_NOTE") });
            } else {
                overlayContent.createDiv({ cls: "book-status", text: t("CLICK_TO_CREATE") });
            }

            // Info
            const info = card.createDiv({ cls: "book-info" });
            info.createDiv({ cls: "book-title", text: book.title });
            info.createDiv({ cls: "book-author", text: book.author });

            // Click Handler
            card.onclick = async () => {
                if (book.hasNote && book.notePath) {
                    const file = this.app.vault.getAbstractFileByPath(book.notePath);
                    if (file instanceof TFile) {
                        await this.app.workspace.getLeaf(false).openFile(file);
                    } else {
                        await this.createNoteForBook(book);
                    }
                } else {
                    await this.createNoteForBook(book);
                }
            };
        });
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
