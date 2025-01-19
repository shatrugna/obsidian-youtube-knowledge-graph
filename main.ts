import { Plugin, TFile, Notice, MarkdownView } from 'obsidian';
import { YoutubeVideoProcessor } from './services/YoutubeVideoProcessor';
import { VectorStoreService } from './services/VectorStoreService';
import { YouTubeInputModal } from './ui/YouTubeInputModal';
import { ProgressNotice } from './ui/ProgressNotice';
import { SettingTab } from './settings/SettingTab';
import { TranscriptService } from './services/TranscriptService';
import { NoteUpdateService } from './services/NoteUpdateService';
import { YouTubeLinkExtractor } from './utils/YouTubeLinkExtractor';
import { DEFAULT_SETTINGS } from './settings/settings';
import { PluginSettings } from './models/interfaces';

export default class YoutubeKnowledgeGraphPlugin extends Plugin {
    settings: PluginSettings;
    vectorStore: VectorStoreService;  // Changed to public
    private youtubeProcessor: YoutubeVideoProcessor;
    private transcriptService: TranscriptService;
    private noteUpdateService: NoteUpdateService;
    private linkExtractor: YouTubeLinkExtractor;
    private currentFile: TFile | null = null;

    async onload() {
        // Load settings first
        await this.loadSettings();

        // Initialize services
        this.vectorStore = new VectorStoreService(this);
        this.youtubeProcessor = new YoutubeVideoProcessor(this);
        this.transcriptService = new TranscriptService(this);
        this.noteUpdateService = new NoteUpdateService(this);
        this.linkExtractor = new YouTubeLinkExtractor();

        // Add ribbon icon
        this.addRibbonIcon('youtube', 'Add YouTube Video', this.handleYouTubeIconClick.bind(this));

        // Add settings tab
        this.addSettingTab(new SettingTab(this.app, this));

        // Add commands
        this.registerCommands();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async handleYouTubeIconClick() {
        new YouTubeInputModal(this.app, async (url) => {
            const progress = new ProgressNotice('Processing YouTube video');
            
            try {
                const videoId = this.linkExtractor.extractVideoId(url);
                if (!videoId) {
                    throw new Error('Invalid YouTube URL');
                }

                await this.processVideoWithProgress(videoId, progress);
            } catch (error) {
                progress.setMessage(`Error: ${error.message}`);
                setTimeout(() => progress.hide(), 3000);
                console.error('Error creating note:', error);
            }
        }).open();
    }

    private async processVideoWithProgress(videoId: string, progress: ProgressNotice) {
        progress.setProgress(10);
        progress.setMessage('Fetching video information');

        const note = await this.youtubeProcessor.createInitialNote(videoId);
        
        progress.setProgress(40);
        progress.setMessage('Transcribing video');

        await this.processNewNoteWithProgress(note, progress);
        
        progress.setProgress(100);
        progress.setMessage('Complete!');
        
        this.app.workspace.getLeaf().openFile(note);
        setTimeout(() => progress.hide(), 2000);
    }

    private registerCommands() {
        this.addCommand({
            id: 'process-youtube-links',
            name: 'Process YouTube Links in Current Note',
            callback: () => this.processCurrentNote()
        });

        this.addCommand({
            id: 'inspect-vectors',
            name: 'Debug: Inspect Vector Store',
            callback: () => this.vectorStore.debugInfo()
        });

        // Add other commands...
    }

    private async processCurrentNote() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice('No active markdown file');
            return;
        }

        await this.processNewNote(activeView.file);
    }

    private async processNewNote(file: TFile) {
        try {
            const content = await this.app.vault.read(file);
            const youtubeLinks = this.linkExtractor.extractYoutubeLinks(content);

            this.currentFile = file;

            if (youtubeLinks.length === 0) return;

            for (const link of youtubeLinks) {
                const videoId = this.linkExtractor.extractVideoId(link);
                if (!videoId) continue;

                const metadata = await this.youtubeProcessor.processVideo(videoId);
                await this.transcriptService.createTranscriptNote(file, videoId, metadata.transcript);
                await this.noteUpdateService.updateOriginalNote(file, metadata);
            }
        } catch (error) {
            console.error('Error processing note:', error);
            new Notice(`Error processing note: ${error.message}`);
        } finally {
            this.currentFile = null;
        }
    }

    private async processNewNoteWithProgress(file: TFile, progress: ProgressNotice) {
        try {
            const content = await this.app.vault.read(file);
            const youtubeLinks = this.linkExtractor.extractYoutubeLinks(content);

            if (youtubeLinks.length === 0) return;

            for (const link of youtubeLinks) {
                const videoId = this.linkExtractor.extractVideoId(link);
                if (!videoId) continue;

                progress.setProgress(50);
                progress.setMessage('Getting transcript');
                const metadata = await this.youtubeProcessor.processVideo(videoId);
                
                progress.setProgress(70);
                progress.setMessage('Creating transcript note');
                await this.transcriptService.createTranscriptNote(file, videoId, metadata.transcript);
                
                progress.setProgress(90);
                progress.setMessage('Updating notes with analysis');
                await this.noteUpdateService.updateOriginalNote(file, metadata);
            }
        } catch (error) {
            console.error('Error processing note:', error);
            throw error;
        }
    }
}