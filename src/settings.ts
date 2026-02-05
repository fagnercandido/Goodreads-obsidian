import { App, PluginSettingTab, Setting, Notice, ButtonComponent } from 'obsidian';
import MyPlugin from './main';
import { t } from './i18n';

export interface GoodReadsPluginSettings {
	rssUrl: string;
	noteFolder: string;
	galleryNoteName: string; // This was for the note-based gallery, but we can reuse it for the Title if not set
	galleryTitle: string;
	viewDisplayName: string;
	syncOnStart: boolean;
	syncFrequency: 'manual' | 'daily' | 'weekly';
}

export const DEFAULT_SETTINGS: GoodReadsPluginSettings = {
	rssUrl: '',
	noteFolder: 'Books',
	galleryNoteName: '', // Legacy
	galleryTitle: '', // Empty means use default from translation
	viewDisplayName: '', // Empty means use default from translation
	syncOnStart: false,
	syncFrequency: 'manual'
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
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('SETTINGS_FOLDER_NAME'))
			.setDesc(t('SETTINGS_FOLDER_DESC'))
			.addText(text => text
				.setPlaceholder('Books')
				.setValue(this.plugin.settings.noteFolder)
				.onChange(async (value) => {
					this.plugin.settings.noteFolder = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('SETTINGS_GALLERY_TAB_NAME'))
			.setDesc(t('SETTINGS_GALLERY_TAB_DESC'))
			.addText(text => text
				.setPlaceholder(t('GALLERY_TITLE'))
				.setValue(this.plugin.settings.galleryTitle)
				.onChange(async (value) => {
					this.plugin.settings.galleryTitle = value.trim();
					await this.plugin.saveSettings();
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
					await this.plugin.saveSettings();
					// Trigger update to refresh tab name
					this.plugin.app.workspace.requestSaveLayout();
				}));

		new Setting(containerEl)
			.setName(t('SETTINGS_SYNC_START_NAME'))
			.setDesc(t('SETTINGS_SYNC_START_DESC'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncOnStart)
				.onChange(async (value) => {
					this.plugin.settings.syncOnStart = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('SETTINGS_SYNC_FREQ_NAME'))
			.setDesc(t('SETTINGS_SYNC_FREQ_DESC'))
			.addDropdown(dropdown => dropdown
				.addOption('manual', 'Manual only')
				.addOption('daily', 'Daily')
				.addOption('weekly', 'Weekly')
				.setValue(this.plugin.settings.syncFrequency)
				.onChange(async (value) => {
					this.plugin.settings.syncFrequency = value as 'manual' | 'daily' | 'weekly';
					await this.plugin.saveSettings();
				})
			);

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
						const count = await this.plugin.syncManager.sync(this.plugin.settings.rssUrl);
						new Notice(`✅ ${t('SYNC_COMPLETE', { count })}`);
					} catch (error: any) {
						new Notice(`❌ ${t('SYNC_FAILED', { error: error.message })}`);
					} finally {
						button.setDisabled(false);
						button.setButtonText(t('SETTINGS_SYNC_BUTTON'));
					}
				}));
	}
}
