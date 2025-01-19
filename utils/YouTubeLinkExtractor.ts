export class YouTubeLinkExtractor {
    extractYoutubeLinks(content: string): string[] {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([^\s&]+)/g;
        return content.match(regex) || [];
    }

    extractVideoId(url: string): string | null {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([^\s&]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
}