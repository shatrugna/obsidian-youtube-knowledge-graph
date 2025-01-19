import { TFile, requestUrl } from 'obsidian';
import { YoutubeMetadata, WhisperTranscriptSegment, EmbeddingMetadata } from '../models/interfaces';
import type YoutubeKnowledgeGraphPlugin from '../main';

export class NoteUpdateService {
    private plugin: YoutubeKnowledgeGraphPlugin;

    constructor(plugin: YoutubeKnowledgeGraphPlugin) {
        this.plugin = plugin;
    }

    async updateOriginalNote(file: TFile, metadata: YoutubeMetadata): Promise<void> {
        const chunks = await this.processTranscriptChunks(metadata.transcript, metadata.segments, file);
        const connections = await this.findSemanticConnections(chunks, file);
        await this.updateNoteContent(file, metadata, connections);
        await this.updateConnectedNotes(file, connections);
    }

    private async processTranscriptChunks(transcript: string, segments: WhisperTranscriptSegment[], file: TFile): Promise<EmbeddingMetadata[]> {
        const chunks = this.createChunks(segments, 1000);
        const embeddings: EmbeddingMetadata[] = [];
        
        for (const chunk of chunks) {
            try {
                const embedding = await this.getEmbedding(chunk.text);
                const metadata: EmbeddingMetadata = {
                    text: chunk.text,
                    embedding: embedding,
                    filePath: file.path,
                    timestamp: chunk.startTime
                };
                
                await this.plugin.vectorStore.addEmbedding(metadata);
                embeddings.push(metadata);
            } catch (error) {
                console.error("Error processing chunk:", error);
            }
        }
    
        return embeddings;
    }

    private async getEmbedding(text: string): Promise<number[]> {
        try {
            console.log("Getting embedding for text:", text.substring(0, 100)); // Debug log
    
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
                    max_tokens: 2048,
                    messages: [{
                        role: "user",
                        content: `Create a 64-dimensional vector representation of this text for semantic similarity comparison.
                        Return ONLY a JSON array of EXACTLY 64 numbers between -1 and 1.
                        Each number should be rounded to 4 decimal places.
                        Do not include any other text, explanation, or formatting - just the JSON array.
                        The array must begin with [ and end with ].
                        
                        Example of correct format:
                        [-0.1234, 0.4567, ... 0.7890]
                        
                        Text to encode: "${text.substring(0, 500)}"`
                    }]
                })
            });
    
            console.log("Raw Claude response:", response.text); // Debug log
    
            const result = JSON.parse(response.text);
            
            if (!result.content || !result.content[0] || !result.content[0].text) {
                throw new Error('Invalid response structure from Claude');
            }
    
            const cleanedText = result.content[0].text
                .trim()
                .replace(/^```json\s*/, '')
                .replace(/\s*```$/, '')
                .replace(/[\n\r]/g, '');
    
            console.log("Cleaned embedding text:", cleanedText); // Debug log
    
            let embedding: number[];
            try {
                embedding = JSON.parse(cleanedText);
            } catch (parseError) {
                console.error("Failed to parse embedding:", parseError);
                console.error("Cleaned text that failed to parse:", cleanedText);
                throw new Error(`Failed to parse embedding: ${parseError.message}`);
            }
    
            // Validate embedding
            if (!Array.isArray(embedding)) {
                throw new Error('Response is not an array');
            }
    
            if (embedding.length !== 64) {
                throw new Error(`Embedding must be exactly 64 dimensions, got ${embedding.length}`);
            }
    
            if (!embedding.every(num => 
                typeof num === 'number' && 
                !isNaN(num) && 
                num >= -1 && 
                num <= 1
            )) {
                throw new Error('Array contains invalid values');
            }
    
            // Round all numbers to 4 decimal places
            embedding = embedding.map(num => Number(num.toFixed(4)));
    
            return embedding;
    
        } catch (error) {
            console.error('Error getting embedding:', error);
            console.error('For text:', text.substring(0, 100));
            throw error;
        }
    }

    private createChunks(segments: WhisperTranscriptSegment[], maxChunkSize: number): {
        text: string;
        startTime: number;
    }[] {
        if (!segments || segments.length === 0) {
            return [];
        }
    
        const chunks: { text: string; startTime: number; }[] = [];
        let currentChunk = '';
        let currentStartTime = segments[0].start;
    
        for (const segment of segments) {
            // If adding this segment would exceed maxChunkSize, save current chunk and start new one
            if (currentChunk.length + segment.text.length > maxChunkSize && currentChunk.length > 0) {
                chunks.push({
                    text: currentChunk.trim(),
                    startTime: currentStartTime
                });
                currentChunk = '';
                currentStartTime = segment.start;
            }
    
            currentChunk += ' ' + segment.text;
        }
    
        // Don't forget to add the last chunk if it has content
        if (currentChunk.trim().length > 0) {
            chunks.push({
                text: currentChunk.trim(),
                startTime: currentStartTime
            });
        }
    
        return chunks;
    }

    private async findSemanticConnections(chunks: EmbeddingMetadata[], currentFile: TFile): Promise<Map<string, {similarity: number, snippets: string[]}>> {
        const connections = new Map<string, {similarity: number, snippets: string[]}>();
        
        for (const chunk of chunks) {
            const similar = this.plugin.vectorStore.findSimilar(chunk.embedding, 0.8);
            for (const match of similar) {
                if (match.filePath === currentFile.path) continue;
                
                const existing = connections.get(match.filePath) || {
                    similarity: 0,
                    snippets: []
                };
                
                existing.similarity = Math.max(existing.similarity, match.similarity);
                if (!existing.snippets.includes(match.text)) {
                    existing.snippets.push(match.text);
                }
                connections.set(match.filePath, existing);
            }
        }
        
        return connections;
    }

    private async updateNoteContent(file: TFile, metadata: YoutubeMetadata, connections: Map<string, {similarity: number, snippets: string[]}>): Promise<void> {
        let content = `# ${metadata.title}\n\n`;
        content += `Video Link: https://www.youtube.com/watch?v=${metadata.videoId}\n\n`;
        content += `[[.transcripts/Raw Transcript - ${file.basename}|View Full Transcript]]\n\n`;
        content += `## Summary\n${metadata.summary}\n\n`;
        
        if (connections.size > 0) {
            content += this.formatConnections(connections);
        }
    
        await this.plugin.app.vault.modify(file, content);
    }

    private formatConnections(connections: Map<string, {similarity: number, snippets: string[]}>): string {
        let content = `## Conceptually Related Discussions\n\n`;
        
        for (const [path, data] of connections) {
            const relatedFile = this.plugin.app.vault.getAbstractFileByPath(path);
            if (relatedFile instanceof TFile) {
                content += `### Connected to [[${relatedFile.basename}]]\n`;
                content += `*Semantic Similarity: ${(data.similarity * 100).toFixed(1)}%*\n\n`;
                
                const quotes = data.snippets
                    .slice(0, 2)
                    .map(s => s.trim())
                    .map(s => `> "${s.substring(0, 200)}${s.length > 200 ? '...' : ''}"`)
                    .join('\n\n');
                
                content += `${quotes}\n\n`;
            }
        }
        
        return content;
    }

    private async updateConnectedNotes(currentFile: TFile, connections: Map<string, {similarity: number, snippets: string[]}>): Promise<void> {
        for (const [path, data] of connections) {
            const relatedFile = this.plugin.app.vault.getAbstractFileByPath(path);
            if (relatedFile instanceof TFile) {
                try {
                    let relatedContent = await this.plugin.app.vault.read(relatedFile);
                    if (!relatedContent.includes(`[[${currentFile.basename}]]`)) {
                        if (!relatedContent.includes('## Conceptually Related Discussions')) {
                            relatedContent += '\n\n## Conceptually Related Discussions\n';
                        }
                        relatedContent += `\n### Connected to [[${currentFile.basename}]]\n`;
                        relatedContent += `*Semantic Similarity: ${(data.similarity * 100).toFixed(1)}%*\n\n`;
                        await this.plugin.app.vault.modify(relatedFile, relatedContent);
                    }
                } catch (error) {
                    console.error(`Failed to update related note ${relatedFile.basename}:`, error);
                }
            }
        }
    }
}