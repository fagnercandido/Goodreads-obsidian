import { Plugin, Notice, TFile, WorkspaceLeaf, normalizePath } from 'obsidian';
import { GoodReadsPluginSettings, DEFAULT_SETTINGS, GoodReadsSettingTab } from "./settings";
import { BookDatabase, DBEntry } from './database';
import { GoodReadsParser } from './rss-parser';
import { SyncManager } from './sync-manager';
import { NoteCreator } from './note-creator';
import { MetadataService } from './metadata-service';
import { ImportService } from './import-service';
import { AddBookModal } from './add-book-modal';
import { GalleryView, VIEW_TYPE_GOODREADS_GALLERY } from './gallery-view';
import { t } from './i18n';

export default class GoodReadsPlugin extends Plugin {
	settings: GoodReadsPluginSettings;
	db: BookDatabase;
	parser: GoodReadsParser;
	syncManager: SyncManager;
	noteCreator: NoteCreator;
	metadataService: MetadataService;
	importService: ImportService;
	private saveQueue: Promise<void> = Promise.resolve();
	private inboxTimer: number | null = null;
	private saveTimer: number | null = null;

	async onload() {
		// Load data first
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// Initialize components
		this.db = new BookDatabase();
		if (data && data.books) {
			await this.db.load(data.books);
		}

		this.parser = new GoodReadsParser();
		this.syncManager = new SyncManager(this.parser, this.db);
		this.noteCreator = new NoteCreator(this.app);
		this.metadataService = new MetadataService(() => this.settings.googleBooksApiKey);
		this.importService = new ImportService(this);

		this.registerView(
			VIEW_TYPE_GOODREADS_GALLERY,
			(leaf) => new GalleryView(leaf, this)
		);

		// Persist on DB changes: debounced so a burst of edits collapses into a
		// single full-file write, and serialized so writes never overlap.
		this.db.on(() => this.requestSave());

		// Ribbon Icon - Open Gallery
		this.addRibbonIcon('book', t('VIEW_DISPLAY_TEXT'), () => {
			this.activateView();
		});

		// Ribbon Icon - Add Book
		this.addRibbonIcon('plus-circle', t('ADD_BOOK_TITLE'), () => {
			new AddBookModal(this).open();
		});

		// Command - Open Gallery
		this.addCommand({
			id: 'open-goodreads-gallery',
			name: t('VIEW_DISPLAY_TEXT'),
			callback: () => {
				this.activateView();
			}
		});

		// Command - Add Book
		this.addCommand({
			id: 'add-book',
			name: t('ADD_BOOK_TITLE'),
			callback: () => {
				new AddBookModal(this).open();
			}
		});

		// Command - Process scan inbox (iOS Shortcut drop point)
		this.addCommand({
			id: 'process-scan-inbox',
			name: t('CMD_PROCESS_INBOX'),
			callback: async () => {
				await this.importService.processInbox(true);
			}
		});

		// Command - Sync
		// NOTE: Web requests are ONLY made when user explicitly triggers this command
		// or clicks the sync button in settings. No automatic syncing occurs.
		this.addCommand({
			id: 'sync-goodreads-books',
			name: t('CMD_SYNC'),
			callback: async () => {
				new Notice(t('SYNC_STARTING'));
				if (!this.settings.rssUrl) {
					new Notice(t('CONFIGURE_RSS'));
					return;
				}
				try {
					const r = await this.syncManager.sync(this.settings.rssUrl);
					new Notice(t('SYNC_COMPLETE', { added: r.added, updated: r.updated }));
				} catch (error: any) {
					new Notice(t('SYNC_FAILED', { error: error.message }));
				}
			}
		});

		// Watch the scan-inbox file so barcodes dropped by an iOS Shortcut are
		// imported automatically. No network requests happen until a barcode
		// actually appears in the file.
		this.registerEvent(this.app.vault.on('modify', (file) => this.onVaultChange(file.path)));
		this.registerEvent(this.app.vault.on('create', (file) => this.onVaultChange(file.path)));

		// Import anything the Shortcut dropped while Obsidian was closed.
		this.app.workspace.onLayoutReady(() => {
			this.importService.processInbox().catch(e => console.error('Inbox import failed:', e));
		});

		this.addSettingTab(new GoodReadsSettingTab(this.app, this));
	}

	private onVaultChange(path: string) {
		const inbox = this.settings.scanInboxPath?.trim();
		if (!inbox) return;
		if (path !== normalizePath(inbox)) return;
		if (this.inboxTimer !== null) window.clearTimeout(this.inboxTimer);
		this.inboxTimer = window.setTimeout(() => {
			this.inboxTimer = null;
			this.importService.processInbox().catch(e => console.error('Inbox import failed:', e));
		}, 800);
	}

	onunload() {
		if (this.inboxTimer !== null) {
			window.clearTimeout(this.inboxTimer);
			this.inboxTimer = null;
		}
		// Flush any pending debounced save so nothing is lost on close.
		this.flushSave();
	}

	/** Debounced, serialized persistence. Both DB changes and settings edits
	 *  route through here so writes coalesce and never overlap. */
	requestSave() {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => this.flushSave(), 600);
	}

	private flushSave() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.saveQueue = this.saveQueue
			.then(() => this.saveSettings())
			.catch((e) => console.error('Failed to persist GoodReads data:', e));
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		const data = {
			...this.settings,
			books: this.db ? this.db.getData() : {}
		};
		await this.saveData(data);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_GOODREADS_GALLERY);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0] || null;
		} else {
			// Our view could not be found in the workspace, create a new leaf
			leaf = workspace.getLeaf(false);
			await leaf.setViewState({
				type: VIEW_TYPE_GOODREADS_GALLERY,
				active: true,
			});
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async createNoteForBook(book: DBEntry) {
		if (!this.settings.noteFolder) return;

		const path = await this.noteCreator.createNote(book, this.settings.noteFolder);
		if (path) {
			this.db.setNoteCreated(book.id, path);
			// Open the newly created note in a new tab so the gallery stays open
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf('tab').openFile(file);
			}
		}
	}
}
