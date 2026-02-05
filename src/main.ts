import { Plugin, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { GoodReadsPluginSettings, DEFAULT_SETTINGS, GoodReadsSettingTab } from "./settings";
import { BookDatabase, DBEntry } from './database';
import { GoodReadsParser } from './rss-parser-old';
import { SyncManager } from './sync-manager';
import { NoteCreator } from './note-creator';
import { GalleryView, VIEW_TYPE_GOODREADS_GALLERY } from './gallery-view';
import { t } from './i18n';

export default class GoodReadsPlugin extends Plugin {
	settings: GoodReadsPluginSettings;
	db: BookDatabase;
	parser: GoodReadsParser;
	syncManager: SyncManager;
	noteCreator: NoteCreator;

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

		this.registerView(
			VIEW_TYPE_GOODREADS_GALLERY,
			(leaf) => new GalleryView(leaf, this)
		);

		// Save DB on changes
		this.db.on(async () => {
			await this.saveSettings();
		});

		// Ribbon Icon - Open Gallery
		this.addRibbonIcon('book', t('VIEW_DISPLAY_TEXT'), () => {
			this.activateView();
		});

		// Command - Open Gallery
		this.addCommand({
			id: 'open-goodreads-gallery',
			name: t('VIEW_DISPLAY_TEXT'),
			callback: () => {
				this.activateView();
			}
		});

		// Command - Sync
		this.addCommand({
			id: 'sync-goodreads-books',
			name: 'Sync Books', // Keeping ID but could translate name if needed
			callback: async () => {
				new Notice(t('SYNC_STARTING'));
				if (!this.settings.rssUrl) {
					new Notice(t('CONFIGURE_RSS'));
					return;
				}
				try {
					const count = await this.syncManager.sync(this.settings.rssUrl);
					new Notice(t('SYNC_COMPLETE', { count }));
				} catch (error: any) {
					new Notice(t('SYNC_FAILED', { error: error.message }));
				}
			}
		});

		this.addSettingTab(new GoodReadsSettingTab(this.app, this));
	}

	onunload() {
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
			// Open the newly created note
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(file);
			}
		}
	}
}
