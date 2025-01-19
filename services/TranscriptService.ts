import { TFile, TFolder } from 'obsidian';
import type YoutubeKnowledgeGraphPlugin from '../main';
import { WhisperTranscriptSegment, YoutubeMetadata } from 'models/interfaces';

export class TranscriptService {
    private plugin: YoutubeKnowledgeGraphPlugin;

    constructor(plugin: YoutubeKnowledgeGraphPlugin) {
        this.plugin = plugin;
    }

    async createTranscriptNote(originalFile: TFile, metadata: YoutubeMetadata): Promise<TFile> {
        try {
            const transcriptFolderPath = 'Transcripts';
            const transcriptFileName = `${transcriptFolderPath}/Transcript - ${originalFile.basename}.md`;
            
            // Create Transcripts folder if it doesn't exist
            if (!await this.plugin.app.vault.adapter.exists(transcriptFolderPath)) {
                await this.plugin.app.vault.createFolder(transcriptFolderPath);
            }
    
            const content = `# Transcript: ${metadata.title}\n\n${metadata.transcript}`;
            
            // Create or update transcript note
            if (await this.plugin.app.vault.adapter.exists(transcriptFileName)) {
                const existingFile = this.plugin.app.vault.getAbstractFileByPath(transcriptFileName);
                if (existingFile instanceof TFile) {
                    await this.plugin.app.vault.modify(existingFile, content);
                    return existingFile;
                }
            }
            
            return await this.plugin.app.vault.create(transcriptFileName, content);
        } catch (error) {
            console.error('Error creating transcript note:', error);
            throw error;
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
