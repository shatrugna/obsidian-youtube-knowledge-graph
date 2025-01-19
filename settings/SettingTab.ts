import { App, PluginSettingTab, Setting } from 'obsidian';
import type YoutubeKnowledgeGraphPlugin from '../main';
import { DEFAULT_SETTINGS } from './settings';

export class SettingTab extends PluginSettingTab {
    plugin: YoutubeKnowledgeGraphPlugin;

    constructor(app: App, plugin: YoutubeKnowledgeGraphPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: 'YouTube Knowledge Graph Settings'});

        new Setting(containerEl)
            .setName('Anthropic API Key')
            .setDesc('Enter your Anthropic API key for text analysis')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.anthropicApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.anthropicApiKey = value;
                    await this.plugin.saveSettings();
                }));
    }
}