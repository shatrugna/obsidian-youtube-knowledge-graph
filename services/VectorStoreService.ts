import { EmbeddingMetadata, SimilarityResult } from '../models/interfaces';
import type YoutubeKnowledgeGraphPlugin from '../main';

export class VectorStoreService {
    private embeddings: EmbeddingMetadata[] = [];
    private plugin: YoutubeKnowledgeGraphPlugin;

    constructor(plugin: YoutubeKnowledgeGraphPlugin) {
        this.plugin = plugin;
        this.loadFromData();
    }

    async addEmbedding(metadata: EmbeddingMetadata): Promise<void> {
        this.embeddings.push(metadata);
        await this.saveToData();
    }

    findSimilar(queryEmbedding: number[], threshold = 0.8): SimilarityResult[] {
        return this.embeddings
            .map(em => ({
                ...em,
                similarity: this.cosineSimilarity(queryEmbedding, em.embedding)
            }))
            .filter(em => em.similarity > threshold)
            .sort((a, b) => b.similarity - a.similarity);
    }

    private cosineSimilarity(vec1: number[], vec2: number[]): number {
        const dotProduct = vec1.reduce((sum, a, i) => sum + a * vec2[i], 0);
        const mag1 = Math.sqrt(vec1.reduce((sum, a) => sum + a * a, 0));
        const mag2 = Math.sqrt(vec2.reduce((sum, a) => sum + a * a, 0));
        return dotProduct / (mag1 * mag2);
    }

    private async saveToData(): Promise<void> {
        try {
            await this.plugin.saveData({ embeddings: this.embeddings });
        } catch (error) {
            console.error('Failed to save vector store:', error);
        }
    }

    private async loadFromData(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            if (data?.embeddings) {
                this.embeddings = data.embeddings;
            }
        } catch (error) {
            console.error('Failed to load vector store:', error);
            this.embeddings = [];
        }
    }

    debugInfo(): void {
        console.log("Vector Store Debug Info:");
        console.log("Store initialized:", this.embeddings !== undefined);
        console.log("Number of embeddings:", this.embeddings.length);
        // Add more debug info as needed
    }
}
