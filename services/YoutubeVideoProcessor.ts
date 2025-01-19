import { requestUrl, TFile } from 'obsidian';
import { YoutubeMetadata, WhisperTranscriptSegment } from '../models/interfaces';
import { RetryHelper } from '../utils/RetryHelper';
import type YoutubeKnowledgeGraphPlugin from '../main';

export class YoutubeVideoProcessor {
    private plugin: YoutubeKnowledgeGraphPlugin;
    private retryHelper: RetryHelper;

    constructor(plugin: YoutubeKnowledgeGraphPlugin) {
        this.plugin = plugin;
        this.retryHelper = new RetryHelper();
    }

    async processVideo(videoId: string): Promise<YoutubeMetadata> {
        try {
            console.log("Starting to process video:", videoId);
            
            if (!this.plugin.settings.anthropicApiKey) {
                throw new Error('Anthropic API key not set');
            }
    
            // Get transcript from Whisper server
            let transcript = '';
            let segments: WhisperTranscriptSegment[] = [];
            
            try {
                const response = await requestUrl({
                    url: `http://localhost:8000/transcribe/${videoId}`,
                    method: 'POST'
                });
    
                if (response.status !== 200) {
                    throw new Error(`Failed to transcribe: ${response.text}`);
                }
    
                const transcriptionResult = JSON.parse(response.text);
                segments = transcriptionResult.segments;
                transcript = this.formatTranscript(segments);
                console.log("Transcription complete");
            } catch (error) {
                console.error('Transcription failed:', error);
                throw new Error(`Failed to get transcript: ${error.message}`);
            }
    
            // Process with Claude
            const analysis = await this.retryHelper.retryWithBackoff(async () => {
                console.log("Sending transcript to Claude for analysis...");
                const response = await requestUrl({
                    url: 'https://api.anthropic.com/v1/messages',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.plugin.settings.anthropicApiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: "claude-3-opus-20240229",
                        max_tokens: 4096,
                        messages: [{
                            role: "user",
                            content: `Analyze this transcript and extract themes at multiple levels.
                            You must respond with ONLY a valid JSON object - no other text, no explanations, no markdown.
                            The response must be parseable by JSON.parse().
                            
                            Required JSON structure:
                            {
                                "broad_themes": ["theme1", "theme2"],
                                "specific_themes": ["specific1", "specific2"],
                                "summary": "summary text"
                            }
    
                            Guidelines:
                            1. strict JSON format only
                            2. no comments or additional text
                            3. use double quotes for strings
                            4. broad_themes: 3-5 high-level topics
                            5. specific_themes: 4-7 specific concepts
                            
                            Transcript:
                            ${transcript}`
                        }]
                    })
                });
                
                if (!response.text) {
                    throw new Error("Empty response from Claude");
                }
                
                const result = JSON.parse(response.text);
                if (!result.content || !result.content[0] || !result.content[0].text) {
                    throw new Error("Invalid response structure from Claude");
                }
                
                return JSON.parse(result.content[0].text);
            });
    
            // Get video title
            const title = await this.getVideoTitle(videoId);
    
            // Construct and validate the complete metadata
            const metadata: YoutubeMetadata = {
                videoId,
                title,
                transcript,
                broad_themes: analysis.broad_themes || [],
                specific_themes: analysis.specific_themes || [],
                themes: [...(analysis.broad_themes || []), ...(analysis.specific_themes || [])],
                summary: analysis.summary || 'No summary available',
                segments: segments
            };
    
            // Validate the metadata
            this.validateMetadata(metadata);
    
            console.log("Created metadata:", metadata);
            return metadata;
    
        } catch (error) {
            console.error('Error in processVideo:', error);
            
            // Return failsafe metadata if something goes wrong
            return {
                videoId,
                title: await this.getVideoTitle(videoId) || `Video ${videoId}`,
                transcript: 'Transcript unavailable',
                broad_themes: [],
                specific_themes: [],
                themes: [],
                summary: `Processing failed: ${error.message}`,
                segments: []
            };
        }
    }

    private formatTranscript(segments: WhisperTranscriptSegment[]): string {
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

    private async getVideoTitle(videoId: string): Promise<string> {
        try {
            const response = await requestUrl({
                url: `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
                method: 'GET'
            });
            const data = JSON.parse(response.text);
            return data.title || `Video ${videoId}`;
        } catch (error) {
            console.error('Error fetching video title:', error);
            return `Video ${videoId}`;
        }
    }

    private validateMetadata(metadata: YoutubeMetadata): void {
        if (!metadata.videoId) {
            throw new Error('Missing video ID in metadata');
        }
        if (!metadata.title) {
            throw new Error('Missing title in metadata');
        }
        if (!metadata.transcript) {
            throw new Error('Missing transcript in metadata');
        }
        if (!Array.isArray(metadata.broad_themes)) {
            throw new Error('Invalid broad_themes format in metadata');
        }
        if (!Array.isArray(metadata.specific_themes)) {
            throw new Error('Invalid specific_themes format in metadata');
        }
        if (!metadata.summary) {
            throw new Error('Missing summary in metadata');
        }
        if (!Array.isArray(metadata.segments)) {
            throw new Error('Invalid segments format in metadata');
        }
    }

    async createInitialNote(videoId: string): Promise<TFile> {
        const title = await this.getVideoTitle(videoId);
        const sanitizedTitle = this.sanitizeTitle(title);
        
        return await this.plugin.app.vault.create(
            `YT - ${sanitizedTitle}.md`,
            `# ${title}\n\nVideo Link: https://www.youtube.com/watch?v=${videoId}\n`
        );
    }

    private sanitizeTitle(title: string): string {
        return title
            .replace(/[\/\\:*?"<>|]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
}