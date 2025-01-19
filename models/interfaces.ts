export interface WhisperTranscriptSegment {
    start: number;
    end: number;
    text: string;
}

export interface YoutubeMetadata {
    videoId: string;
    title: string;
    transcript: string;
    broad_themes: string[];
    specific_themes: string[];
    themes: string[];
    summary: string;
    segments: WhisperTranscriptSegment[];
}

export interface EmbeddingMetadata {
    text: string;
    embedding: number[];
    filePath: string;
    timestamp?: number;
}

export interface SimilarityResult extends EmbeddingMetadata {
    similarity: number;
}

export interface VectorStore {
    embeddings: EmbeddingMetadata[];
    addEmbedding(metadata: EmbeddingMetadata): void;
    findSimilar(embedding: number[], threshold: number): EmbeddingMetadata[];
}

export interface PluginSettings {
    anthropicApiKey: string;
    // Add other settings as needed
}