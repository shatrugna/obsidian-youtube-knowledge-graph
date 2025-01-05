import { App, PluginSettingTab, Setting } from 'obsidian';
import YoutubeKnowledgeGraphPlugin from './main';

export interface PluginSettings {
    anthropicApiKey: string;  // Changed from openaiApiKey
}

export const DEFAULT_SETTINGS: PluginSettings = {
    anthropicApiKey: ''
}

export class SettingTab extends PluginSettingTab {
    plugin: YoutubeKnowledgeGraphPlugin;

    constructor(app: App, plugin: YoutubeKnowledgeGraphPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'YouTube Knowledge Graph Settings' });

        new Setting(containerEl)
            .setName('Anthropic API Key')
            .setDesc('Enter your Anthropic API key')
            .addText(text => text
                .setPlaceholder('Enter your key')
                .setValue(this.plugin.settings.anthropicApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.anthropicApiKey = value;
                    await this.plugin.saveSettings();
                }));
    }
}