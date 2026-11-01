import { App, PluginSettingTab, Setting, Notice, ButtonComponent, normalizePath, TFile } from 'obsidian';
import MyPlugin from './main';
import { t } from './i18n';

export interface GoodReadsPluginSettings {
	rssUrl: string;
	noteFolder: string;
	galleryNoteName: string; // This was for the note-based gallery, but we can reuse it for the Title if not set
	galleryTitle: string;
	viewDisplayName: string;
	scanInboxPath: string; // File the iOS Shortcut appends scanned barcodes to
	googleBooksApiKey: string; // Optional: reliable ISBN lookups (esp. PT/EU books)
}

export const DEFAULT_SETTINGS: GoodReadsPluginSettings = {
	rssUrl: '',
	noteFolder: 'Books',
	galleryNoteName: '', // Legacy
	galleryTitle: '', // Empty means use default from translation
	viewDisplayName: '', // Empty means use default from translation
	scanInboxPath: 'goodreads-scan-inbox.md',
	googleBooksApiKey: ''
}

export class GoodReadsSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: t('SETTINGS_HEADER') });

		new Setting(containerEl)
			.setName(t('SETTINGS_RSS_NAME'))
			.setDesc(t('SETTINGS_RSS_DESC'))
			.addText(text => text
				.setPlaceholder('https://www.goodreads.com/review/list_rss/...')
				.setValue(this.plugin.settings.rssUrl)
				.onChange(async (value) => {
					this.plugin.settings.rssUrl = value.trim();
					this.plugin.requestSave();
				}));

		new Setting(containerEl)
			.setName(t('SETTINGS_FOLDER_NAME'))
			.setDesc(t('SETTINGS_FOLDER_DESC'))
			.addText(text => text
				.setPlaceholder('Books')
				.setValue(this.plugin.settings.noteFolder)
				.onChange(async (value) => {
					this.plugin.settings.noteFolder = value.trim();
					this.plugin.requestSave();
				}));

		new Setting(containerEl)
			.setName(t('SETTINGS_GALLERY_TAB_NAME'))
			.setDesc(t('SETTINGS_GALLERY_TAB_DESC'))
			.addText(text => text
				.setPlaceholder(t('GALLERY_TITLE'))
				.setValue(this.plugin.settings.galleryTitle)
				.onChange(async (value) => {
					this.plugin.settings.galleryTitle = value.trim();
					this.plugin.requestSave();
					// Trigger update in views if open
					this.plugin.app.workspace.requestSaveLayout();
				}));

		new Setting(containerEl)
			.setName(t('SETTINGS_VIEW_NAME_NAME'))
			.setDesc(t('SETTINGS_VIEW_NAME_DESC'))
			.addText(text => text
				.setPlaceholder(t('VIEW_DISPLAY_TEXT'))
				.setValue(this.plugin.settings.viewDisplayName)
				.onChange(async (value) => {
					this.plugin.settings.viewDisplayName = value.trim();
					this.plugin.requestSave();
					// Trigger update to refresh tab name
					this.plugin.app.workspace.requestSaveLayout();
				}));


		// Force Sync Button
		new Setting(containerEl)
			.setName(t('SETTINGS_FORCE_SYNC_NAME'))
			.setDesc(t('SETTINGS_FORCE_SYNC_DESC'))
			.addButton((button: ButtonComponent) => button
				.setButtonText(t('SETTINGS_SYNC_BUTTON'))
				.setCta()
				.onClick(async () => {
					if (!this.plugin.settings.rssUrl) {
						new Notice(`⚠️ ${t('CONFIGURE_RSS')}`);
						return;
					}

					button.setDisabled(true);
					button.setButtonText(t('SETTINGS_SYNC_PROGRESS'));

					try {
						new Notice(`🔄 ${t('SYNC_STARTING')}`);
						const r = await this.plugin.syncManager.sync(this.plugin.settings.rssUrl);
						new Notice(`✅ ${t('SYNC_COMPLETE', { added: r.added, updated: r.updated })}`);
					} catch (error: any) {
						new Notice(`❌ ${t('SYNC_FAILED', { error: error.message })}`);
					} finally {
						button.setDisabled(false);
						button.setButtonText(t('SETTINGS_SYNC_BUTTON'));
					}
				}));

		// --- ISBN lookup ---
		new Setting(containerEl)
			.setName(t('SETTINGS_APIKEY_NAME'))
			.setDesc(t('SETTINGS_APIKEY_DESC'))
			.addText(text => text
				.setPlaceholder('AIza...')
				.setValue(this.plugin.settings.googleBooksApiKey)
				.onChange(async (value) => {
					this.plugin.settings.googleBooksApiKey = value.trim();
					this.plugin.requestSave();
				}));

		// --- Barcode / scan inbox ---
		containerEl.createEl('h3', { text: t('SETTINGS_SCAN_HEADER') });

		new Setting(containerEl)
			.setName(t('SETTINGS_INBOX_NAME'))
			.setDesc(t('SETTINGS_INBOX_DESC'))
			.addText(text => text
				.setPlaceholder('goodreads-scan-inbox.md')
				.setValue(this.plugin.settings.scanInboxPath)
				.onChange(async (value) => {
					this.plugin.settings.scanInboxPath = value.trim();
					this.plugin.requestSave();
				}));

		new Setting(containerEl)
			.setName(t('SETTINGS_INBOX_CREATE_NAME'))
			.setDesc(t('SETTINGS_INBOX_CREATE_DESC'))
			.addButton((button: ButtonComponent) => button
				.setButtonText(t('SETTINGS_INBOX_CREATE_BUTTON'))
				.onClick(async () => {
					const path = this.plugin.settings.scanInboxPath?.trim();
					if (!path) {
						new Notice(`⚠️ ${t('SETTINGS_INBOX_NEED_PATH')}`);
						return;
					}
					const normalized = normalizePath(path);
					const existing = this.plugin.app.vault.getAbstractFileByPath(normalized);
					if (existing instanceof TFile) {
						new Notice(t('SETTINGS_INBOX_EXISTS'));
						return;
					}
					try {
						await this.plugin.app.vault.create(normalized, '');
						new Notice(t('SETTINGS_INBOX_CREATED', { path: normalized }));
					} catch (e: any) {
						new Notice(`❌ ${e.message}`);
					}
				}));

		new Setting(containerEl)
			.setName(t('SETTINGS_INBOX_PROCESS_NAME'))
			.setDesc(t('SETTINGS_INBOX_PROCESS_DESC'))
			.addButton((button: ButtonComponent) => button
				.setButtonText(t('SETTINGS_INBOX_PROCESS_BUTTON'))
				.onClick(async () => {
					await this.plugin.importService.processInbox(true);
				}));

		const help = containerEl.createEl('div', { cls: 'goodreads-settings-help' });
		help.createEl('p', { text: t('SETTINGS_SHORTCUT_HELP') });
		const steps = help.createEl('ol');
		t('SETTINGS_SHORTCUT_STEPS').split('|').forEach(step => steps.createEl('li', { text: step }));
	}
}
