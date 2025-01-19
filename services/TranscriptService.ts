import { TFile, TFolder } from 'obsidian';
import type YoutubeKnowledgeGraphPlugin from '../main';
import { WhisperTranscriptSegment } from 'models/interfaces';

export class TranscriptService {
    private plugin: YoutubeKnowledgeGraphPlugin;

    constructor(plugin: YoutubeKnowledgeGraphPlugin) {
        this.plugin = plugin;
    }

    async createTranscriptNote(originalFile: TFile, videoId: string, transcriptContent: string): Promise<TFile> {
        try {
            const transcriptFolderPath = '.transcripts';
            const transcriptFileName = `Raw Transcript - ${originalFile.basename}`;
            const transcriptFilePath = `${transcriptFolderPath}/${transcriptFileName}.md`;
            
            // Create transcripts folder if it doesn't exist
            if (!await this.plugin.app.vault.adapter.exists(transcriptFolderPath)) {
                await this.plugin.app.vault.createFolder(transcriptFolderPath);
            }
    
            const content = `# Transcript for ${originalFile.basename}\n\n${transcriptContent}`;
            
            // Create or update transcript note
            const existingFile = this.plugin.app.vault.getAbstractFileByPath(transcriptFilePath);
            if (existingFile instanceof TFile) {
                await this.plugin.app.vault.modify(existingFile, content);
                return existingFile;
            } else {
                return await this.plugin.app.vault.create(transcriptFilePath, content);
            }
        } catch (error) {
            console.error('Error creating transcript note:', error);
            throw new Error(`Failed to create transcript note: ${error.message}`);
        }
    }

    formatTranscript(segments: WhisperTranscriptSegment[]): string {
        let formatted = '# Transcript\n\n';
        
        segments.forEach(segment => {
            const startTime = this.formatTimestamp(segment.start);
            const endTime = this.formatTimestamp(segment.end);
            formatted += `[${startTime} - ${endTime}] ${segment.text}\n\n`;
        });
    
        return formatted;
    }
    
    private formatTimestamp(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}
