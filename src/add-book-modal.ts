import { App, Modal, Setting, Notice, ButtonComponent } from "obsidian";
import GoodReadsPlugin from "./main";
import { Book, BookStatus, BookFormat } from "./rss-parser";
import { normalizeIsbn, slugify } from "./utils";
import { BarcodeScanModal, isCameraScanSupported } from "./barcode-scanner";
import { t } from "./i18n";

interface DraftBook {
    isbn: string;
    title: string;
    author: string;
    status: BookStatus;
    format: BookFormat;
    pageCount?: number;
    publishedYear?: string;
    imageUrl: string;
    description?: string;
    categories?: string[];
    publisher?: string;
}

export class AddBookModal extends Modal {
    private draft: DraftBook;
    private looking = false;

    constructor(private plugin: GoodReadsPlugin) {
        super(plugin.app);
        this.draft = {
            isbn: '',
            title: '',
            author: '',
            status: 'to-read',
            format: 'physical', // adding to your library usually means you have it
            imageUrl: ''
        };
    }

    onOpen() {
        this.render();
    }

    onClose() {
        this.contentEl.empty();
    }

    private render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('goodreads-add-modal');
        contentEl.createEl('h2', { text: t('ADD_BOOK_TITLE') });

        // --- ISBN lookup row ---
        const isbnSetting = new Setting(contentEl)
            .setName(t('ADD_ISBN_LABEL'))
            .setDesc(t('ADD_ISBN_DESC'))
            .addText(text => text
                .setPlaceholder('9788535902778')
                .setValue(this.draft.isbn)
                .onChange(value => { this.draft.isbn = value; }));

        isbnSetting.addButton((b: ButtonComponent) => b
            .setButtonText(this.looking ? t('ADD_LOOKING_UP') : t('ADD_LOOKUP_BUTTON'))
            .setCta()
            .setDisabled(this.looking)
            .onClick(() => this.lookup()));

        if (isCameraScanSupported()) {
            isbnSetting.addButton((b: ButtonComponent) => b
                .setButtonText(t('ADD_SCAN_BUTTON'))
                .onClick(() => this.openScanner()));
        }

        // --- Cover preview ---
        if (this.draft.imageUrl) {
            const preview = contentEl.createDiv({ cls: 'goodreads-add-preview' });
            preview.createEl('img', { cls: 'goodreads-add-cover', attr: { src: this.draft.imageUrl } });
        }

        contentEl.createEl('p', { text: t('ADD_MANUAL_HEADER'), cls: 'goodreads-add-section' });

        // --- Manual fields ---
        new Setting(contentEl)
            .setName(t('ADD_FIELD_TITLE'))
            .addText(text => text
                .setValue(this.draft.title)
                .onChange(value => { this.draft.title = value; }));

        new Setting(contentEl)
            .setName(t('ADD_FIELD_AUTHOR'))
            .addText(text => text
                .setValue(this.draft.author)
                .onChange(value => { this.draft.author = value; }));

        new Setting(contentEl)
            .setName(t('ADD_FIELD_STATUS'))
            .addDropdown(dd => dd
                .addOption('read', t('STATUS_READ'))
                .addOption('reading', t('STATUS_READING'))
                .addOption('to-read', t('STATUS_TO_READ'))
                .setValue(this.draft.status)
                .onChange(value => { this.draft.status = value as BookStatus; }));

        new Setting(contentEl)
            .setName(t('ADD_FIELD_FORMAT'))
            .addDropdown(dd => dd
                .addOption('physical', t('FORMAT_PHYSICAL'))
                .addOption('digital', t('FORMAT_DIGITAL'))
                .addOption('library', t('FORMAT_LIBRARY'))
                .addOption('none', t('FORMAT_NONE'))
                .setValue(this.draft.format)
                .onChange(value => { this.draft.format = value as BookFormat; }));

        new Setting(contentEl)
            .setName(t('ADD_FIELD_PAGES'))
            .addText(text => text
                .setValue(this.draft.pageCount ? String(this.draft.pageCount) : '')
                .onChange(value => {
                    const n = parseInt(value, 10);
                    this.draft.pageCount = Number.isFinite(n) && n > 0 ? n : undefined;
                }));

        new Setting(contentEl)
            .setName(t('ADD_FIELD_YEAR'))
            .addText(text => text
                .setValue(this.draft.publishedYear || '')
                .onChange(value => { this.draft.publishedYear = value.trim() || undefined; }));

        new Setting(contentEl)
            .setName(t('ADD_FIELD_COVER'))
            .addText(text => text
                .setValue(this.draft.imageUrl)
                .onChange(value => { this.draft.imageUrl = value.trim(); }));

        // --- Submit ---
        new Setting(contentEl)
            .addButton((b: ButtonComponent) => b
                .setButtonText(t('ADD_SUBMIT'))
                .setCta()
                .onClick(() => this.submit()));
    }

    private async lookup() {
        const isbn = normalizeIsbn(this.draft.isbn);
        if (!isbn) {
            new Notice(t('ADD_NEED_ISBN'));
            return;
        }
        this.looking = true;
        this.render();
        try {
            const meta = await this.plugin.metadataService.lookupByIsbn(isbn);
            if (!meta) {
                // Show the provider's real error (bad key / API disabled / quota)
                // when there is one; otherwise a plain "not found".
                const err = this.plugin.metadataService.lastError;
                new Notice(err ? `⚠️ ${err}` : t('ADD_NOT_FOUND'));
                return;
            }
            this.draft.isbn = meta.isbn;
            this.draft.title = meta.title;
            this.draft.author = meta.author;
            this.draft.imageUrl = meta.imageUrl || this.draft.imageUrl;
            this.draft.description = meta.description;
            this.draft.pageCount = meta.pageCount;
            this.draft.publishedYear = meta.publishedYear;
            this.draft.categories = meta.categories;
            this.draft.publisher = meta.publisher;
        } finally {
            this.looking = false;
            this.render();
        }
    }

    private openScanner() {
        new BarcodeScanModal(this.app, (isbn) => {
            if (isbn) {
                this.draft.isbn = isbn;
                this.lookup();
            }
        }).open();
    }

    private submit() {
        if (!this.draft.title.trim()) {
            new Notice(t('ADD_NEED_TITLE'));
            return;
        }

        const isbn = normalizeIsbn(this.draft.isbn);
        const today = new Date().toISOString().slice(0, 10);
        const id = isbn ? `isbn:${isbn}` : `manual:${Date.now()}-${slugify(this.draft.title) || 'book'}`;

        const book: Book = {
            id,
            title: this.draft.title.trim(),
            author: this.draft.author.trim() || 'Unknown Author',
            imageUrl: this.draft.imageUrl,
            userRating: '0',
            readAt: this.draft.status === 'read' ? today : '',
            isbn: isbn || undefined,
            link: isbn ? `https://openlibrary.org/isbn/${isbn}` : '',
            description: this.draft.description,
            source: 'manual',
            status: this.draft.status,
            format: this.draft.format,
            dateAdded: today,
            pageCount: this.draft.pageCount,
            publishedYear: this.draft.publishedYear,
            categories: this.draft.categories,
            publisher: this.draft.publisher
        };

        const added = this.plugin.db.addBook(book);
        new Notice(added ? t('ADD_ADDED', { title: book.title }) : t('ADD_DUPLICATE'));
        if (added) this.close();
    }
}
