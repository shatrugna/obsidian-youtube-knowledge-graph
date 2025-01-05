declare module 'youtube-transcript' {
    export interface TranscriptResponse {
        text: string;
        duration: number;
        offset: number;
    }

    export class YoutubeTranscript {
        static fetchTranscript(videoId: string): Promise<TranscriptResponse[]>;
    }
}