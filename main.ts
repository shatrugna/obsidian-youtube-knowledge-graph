import { Plugin, TFile, Notice, MarkdownView } from 'obsidian';
import { App, TFolder, Modal, TAbstractFile } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, SettingTab } from './settings';
import { requestUrl } from 'obsidian';

interface WhisperTranscriptSegment {
    start: number;
    end: number;
    text: string;
}

interface YoutubeMetadata {
    videoId: string;
    title: string;
    transcript: string;
    broad_themes: string[];
    specific_themes: string[];
    themes: string[];  // Keep this for backwards compatibility if needed
    summary: string;
    segments: WhisperTranscriptSegment[];
}

interface EmbeddingMetadata {
    text: string;
    embedding: number[];
    filePath: string;
    timestamp?: number;  // For video content
}

export default class YoutubeKnowledgeGraphPlugin extends Plugin {
    settings: PluginSettings;
    private vectorStore: ObsidianVectorStore;
    private currentFile: TFile | null = null;  // Add this property

    async onload() {
      await this.loadSettings();

      this.vectorStore = new ObsidianVectorStore(this);

      this.addRibbonIcon('youtube', 'Add YouTube Video', (evt: MouseEvent) => {
        console.log("YouTube icon clicked"); // Debug log
        new YouTubeInputModal(this.app, async (url) => {
            console.log("Modal submitted with URL:", url); // Debug log
            const progress = new ProgressNotice('Processing YouTube video');
            
            try {
                const videoId = this.extractVideoId(url);
                if (!videoId) {
                    throw new Error('Invalid YouTube URL');
                }
    
                console.log("Starting video processing sequence"); // Debug log
                progress.setProgress(10);
                progress.setMessage('Fetching video information');

                // Get video title
                const titleResponse = await requestUrl({
                    url: `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
                    method: 'GET'
                });

                progress.setProgress(20);
                progress.setMessage('Processing video title');

                const videoData = JSON.parse(titleResponse.text);
                const videoTitle = videoData.title || `Untitled Video (${videoId})`;
                const sanitizedTitle = videoTitle
                    .replace(/[\/\\:*?"<>|]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                progress.setProgress(30);
                progress.setMessage('Creating note');

                const activeFolder = this.app.vault.getAbstractFileByPath(
                    this.app.workspace.getActiveFile()?.parent.path || "/"
                );
                const folderPath = activeFolder instanceof TFolder ? activeFolder.path : "/";
                
                const note = await this.app.vault.create(
                    `${folderPath}/YT - ${sanitizedTitle}.md`,
                    `# ${videoTitle}\n\nVideo Link: ${url}\n`
                );

                progress.setProgress(40);
                progress.setMessage('Transcribing video');

                // Modify processNewNote to report progress
                await this.processNewNoteWithProgress(note, progress);
                
                progress.setProgress(100);
                progress.setMessage('Complete!');
                
                // Open the note
                this.app.workspace.getLeaf().openFile(note);

                // Hide progress after a short delay
                setTimeout(() => progress.hide(), 2000);

            } catch (error) {
                progress.setMessage(`Error: ${error.message}`);
                setTimeout(() => progress.hide(), 3000);
                console.error('Error creating note:', error);
            }
        }).open();
      });

      // Add settings tab
      this.addSettingTab(new SettingTab(this.app, this));

      // Add command to manually process a note
      this.addCommand({
          id: 'process-youtube-links',
          name: 'Process YouTube Links in Current Note',
          callback: () => this.processCurrentNote()
      });

      this.addCommand({
        id: 'inspect-vectors',
        name: 'Debug: Inspect Vector Store',
        callback: () => {
            console.log("Current embeddings in store:", this.vectorStore.embeddings.length);
            console.log("Sample similarities between notes:");
            
            if (this.vectorStore.embeddings.length > 1) {
                const first = this.vectorStore.embeddings[0];
                const similar = this.vectorStore.findSimilar(first.embedding, 0.5);
                console.log("Similar content to first chunk:", similar.map(s => ({
                    file: s.filePath,
                    similarity: s.similarity,
                    snippet: s.text.substring(0, 100)
                })));
            }
        }
      });

      this.addCommand({
        id: 'manual-transcript-input',
        name: 'Input Manual Transcript',
        callback: async () => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                const content = await this.app.vault.read(activeView.file);
                const youtubeLinks = this.extractYoutubeLinks(content);
                
                if (youtubeLinks.length > 0) {
                    const videoId = this.extractVideoId(youtubeLinks[0]);
                    if (videoId) {
                        await this.promptForManualTranscript(videoId);
                    } else {
                        new Notice('No valid YouTube video ID found');
                    }
                } else {
                    new Notice('No YouTube links found in the current note');
                }
            } else {
                new Notice('No active note');
            }
          }
      });

      // Add new test command
      this.addCommand({
        id: 'test-process-current-note',
        name: 'Test Process Current Note',
        callback: () => this.testProcessCurrentNote()
      });

      this.addCommand({
        id: 'cleanup-transcripts',
        name: 'Clean up transcript folder',
        callback: async () => {
            try {
                await this.app.vault.adapter.rmdir('.transcripts', true);
                new Notice('Transcripts folder cleaned up');
            } catch (error) {
                console.error('Failed to clean up transcripts:', error);
                new Notice('Failed to clean up transcripts folder');
            }
        }
      });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async getEmbedding(text: string): Promise<number[]> {
        try {
            const response = await requestUrl({
                url: 'https://api.anthropic.com/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.settings.anthropicApiKey,
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
                        The array must be complete and properly closed.
                        
                        Example format: [-0.1234, 0.4567, ..., 0.7890] (with exactly 64 numbers)
                        
                        Text: "${text.substring(0, 500)}"`
                    }]
                })
            });
    
            const result = JSON.parse(response.text);
            
            // Log the raw response for debugging
            console.log("Raw Claude embedding response:", result.content[0].text);
    
            // Clean up the response text
            let cleanedText = result.content[0].text
                .trim()
                .replace(/^```json\s*/, '')
                .replace(/\s*```$/, '')
                .replace(/[\n\r]/g, '');
    
            try {
                const embedding = JSON.parse(cleanedText);
    
                // Validate embedding format
                if (!Array.isArray(embedding)) {
                    throw new Error('Response is not an array');
                }
    
                if (embedding.length !== 64) {
                    throw new Error(`Embedding must be exactly 64 dimensions, got ${embedding.length}`);
                }
    
                if (!embedding.every(num => typeof num === 'number' && !isNaN(num))) {
                    throw new Error('Array contains non-numeric values');
                }
    
                return embedding;
    
            } catch (parseError) {
                console.error('Error parsing embedding:', parseError);
                console.error('Cleaned text:', cleanedText);
                throw new Error(`Failed to parse embedding array: ${parseError.message}`);
            }
    
        } catch (error) {
            console.error('Failed to get embedding:', error);
            throw error;
        }
    }

    private createChunks(segments: WhisperTranscriptSegment[], maxChunkSize: number): {
        text: string;
        startTime: number;
    }[] {
        const chunks: { text: string; startTime: number; }[] = [];
        let currentChunk = '';
        let currentStartTime = segments[0]?.start || 0;
    
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

    private async processTranscriptChunks(transcript: string, segments: WhisperTranscriptSegment[], file: TFile): Promise<EmbeddingMetadata[]> {
        const chunks = this.createChunks(segments, 1000);
    
        const embeddings: EmbeddingMetadata[] = [];
        for (const chunk of chunks) {
            const embedding = await this.getEmbedding(chunk.text);
            embeddings.push({
                text: chunk.text,
                embedding: embedding,
                filePath: file.path,
                timestamp: chunk.startTime
            });
        }
    
        return embeddings;
    }

    private async processVideo(videoId: string): Promise<YoutubeMetadata> {
        let transcript: string = '';
        let segments: WhisperTranscriptSegment[] = [];
        
        try {
            console.log("Starting to process video:", videoId);
            
            if (!this.settings.anthropicApiKey) {
                throw new Error('Anthropic API key not set');
            }
    
            // Get transcript from Whisper server
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
    
            // Process with Claude
            const completion = await this.retryWithBackoff(async () => {
                console.log("Sending transcript to Claude for analysis...");
                const response = await requestUrl({
                    url: 'https://api.anthropic.com/v1/messages',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.settings.anthropicApiKey,
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
                            
                            Transcript content:
                            ${transcript}`
                        }]
                    })
                });
                console.log("Got Claude response:", response.text);
                return response;
            });
    
            console.log("Parsing Claude response...");
            const analysis = JSON.parse(completion.text);
            console.log("Analysis object:", analysis);
            
            if (!analysis.content || !analysis.content[0] || !analysis.content[0].text) {
                throw new Error("Invalid response structure from Claude");
            }
    
            console.log("Parsing content text:", analysis.content[0].text);
            const content = JSON.parse(analysis.content[0].text);
            console.log("Parsed content:", content);
    
            if (!content.broad_themes || !content.specific_themes || !content.summary) {
                throw new Error("Missing required fields in Claude's response");
            }
    
            const metadata: YoutubeMetadata = {
                videoId,
                title: await this.getVideoTitle(videoId),
                transcript,
                broad_themes: content.broad_themes,
                specific_themes: content.specific_themes,
                themes: [...content.broad_themes, ...content.specific_themes],
                summary: content.summary,
                segments
            };
    
            console.log("Created metadata:", metadata);
            return metadata;
    
        } catch (error) {
            console.error('Error in processVideo:', error);
            new Notice(`Failed to process video: ${error.message}`);
            
            return {
                videoId,
                title: await this.getVideoTitle(videoId),
                transcript: transcript || 'Transcript unavailable',
                broad_themes: [],
                specific_themes: [],
                themes: [],
                summary: 'Processing failed: ' + error.message,
                segments: []
            };
        }
    }

     private formatTranscript(segments: WhisperTranscriptSegment[]): string {
        let formatted = '# Transcript\n\n';
        
        console.log("Formatting segments:", segments); // Debug log
    
        segments.forEach(segment => {
            const startTime = this.formatTimestamp(segment.start);
            const endTime = this.formatTimestamp(segment.end);
            formatted += `[${startTime} - ${endTime}] ${segment.text}\n\n`;
        });
    
        console.log("Formatted transcript length:", formatted.length); // Debug log
        return formatted;
    }
    
    private formatTimestamp(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    private async getVideoTitle(videoId: string): Promise<string> {
        try {
            const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
            const data = await response.json();
            return data.title || `Video ${videoId}`;
        } catch (error) {
            console.error('Error fetching video title:', error);
            return `Video ${videoId}`;
        }
    }

    private async processCurrentNote() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            await this.processNewNote(activeView.file);
        } else {
            new Notice('No active markdown file');
        }
    }

    private extractYoutubeLinks(content: string): string[] {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([^\s&]+)/g;
        return content.match(regex) || [];
    }

    private extractVideoId(url: string): string | null {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([^\s&]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    private async createTranscriptNote(originalFile: TFile, videoId: string, transcriptContent: string): Promise<TFile> {
        try {
            // Use a hidden folder for transcripts
            const transcriptFolderPath = '.transcripts';
            const transcriptFileName = `Raw Transcript - ${originalFile.basename}`;
            const transcriptFilePath = `${transcriptFolderPath}/${transcriptFileName}.md`;
            
            // Create transcripts folder if it doesn't exist
            if (!await this.app.vault.adapter.exists(transcriptFolderPath)) {
                await this.app.vault.createFolder(transcriptFolderPath);
            }
    
            // Create content
            const content = `# Transcript for ${originalFile.basename}\n\n${transcriptContent}`;
            
            // Create or update transcript note
            const existingFile = this.app.vault.getAbstractFileByPath(transcriptFilePath);
            if (existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, content);
                return existingFile;
            } else {
                return await this.app.vault.create(transcriptFilePath, content);
            }
        } catch (error) {
            console.error('Error creating transcript note:', error);
            throw new Error(`Failed to create transcript note: ${error.message}`);
        }
    }

    private async promptForManualTranscript(videoId: string): Promise<string> {
      // Create a new note for manual transcript input
      const transcriptFileName = `${videoId}-manual-transcript.md`;
      
      try {
          // Check if a transcript note already exists
          const existingFile = this.app.vault.getAbstractFileByPath(transcriptFileName);
          if (existingFile) {
              await this.app.vault.delete(existingFile);
          }
  
          // Create a new note with instructions
          const transcriptFile = await this.app.vault.create(
              transcriptFileName,
              `# Manual Transcript Input\n\nPlease paste the transcript for video ID: ${videoId}\n\n1. Go to YouTube video\n2. Click on '...' below the video\n3. Select 'Show transcript'\n4. Copy the transcript\n5. Paste it below this line\n\n---\n\n`
          );
  
          // Open the note in a new pane
          await this.app.workspace.getLeaf().openFile(transcriptFile);
  
          // Show notice to user
          new Notice('Please paste the transcript in the new note and run the command again when done.');
  
          // Return empty string - the user will need to run the process again after pasting
          return '';
      } catch (error) {
          console.error('Error creating manual transcript note:', error);
          throw error;
      }
    }
  
    // Add this helper function at class level
    private async retryWithBackoff<T>(
      operation: () => Promise<T>,
      maxRetries: number = 3,
      initialDelay: number = 1000
    ): Promise<T> {
      let lastError;
      for (let i = 0; i < maxRetries; i++) {
          try {
              return await operation();
          } catch (error) {
              lastError = error;
              if (error.message.includes('429')) {
                  const delay = initialDelay * Math.pow(2, i);
                  console.log(`Rate limited. Retrying in ${delay}ms...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  continue;
              }
              throw error;
          }
      }
      throw lastError;
    }

    private async _updateOriginalNote(file: TFile, metadata: YoutubeMetadata) {
        try {
            // First read the existing content
            const content = await this.app.vault.read(file);
            
            // Create theme notes
            for (const theme of metadata.themes) {
                const themeFileName = `Themes/${theme}.md`;
                try {
                    await this.app.vault.adapter.exists(themeFileName);
                } catch {
                    await this.app.vault.create(
                        themeFileName,
                        `# ${theme}\n\nVideos discussing this theme:\n`
                    );
                }
                
                const themeNote = await this.app.vault.getAbstractFileByPath(themeFileName);
                if (themeNote instanceof TFile) {
                    const themeContent = await this.app.vault.read(themeNote);
                    if (!themeContent.includes(file.basename)) {
                        await this.app.vault.modify(
                            themeNote,
                            `${themeContent}\n- [[${file.basename}]]`
                        );
                    }
                }
            }
    
            // Update original note with summary and separated theme links
            const broadThemeLinks = metadata.broad_themes
                .map(theme => `[[Themes/${theme}]]`)
                .join(', ');
                
            const specificThemeLinks = metadata.specific_themes
                .map(theme => `[[Themes/${theme}]]`)
                .join(', ');
            
            // Create the updated content with summary and themes
            const updatedContent = `${content}
    
    ## Summary
    ${metadata.summary}
    
    ## Themes
    ### Broad Themes
    ${broadThemeLinks}
    
    ### Specific Themes
    ${specificThemeLinks}
    `;
    
            // Write the updated content back to the file
            await this.app.vault.modify(file, updatedContent);
            console.log("Note updated successfully with themes and summary");
    
        } catch (error) {
            console.error('Error updating note:', error);
            throw new Error(`Failed to update original note: ${error.message}`);
        }
    }

    private async updateOriginalNote(file: TFile, metadata: YoutubeMetadata) {
        console.log("Processing chunks for semantic matching...");
        const chunks = await this.processTranscriptChunks(metadata.transcript, metadata.segments, file);
        console.log(`Generated ${chunks.length} chunks`);
    
        const connections = new Map<string, {similarity: number, snippets: string[]}>();
        
        console.log("Finding semantic connections...");
        for (const chunk of chunks) {
            const similar = this.vectorStore.findSimilar(chunk.embedding, 0.8);
            console.log(`Found ${similar.length} similar chunks for current segment`);
            
            for (const match of similar) {
                if (match.filePath === file.path) continue;
                
                console.log(`Match found in ${match.filePath} with similarity ${match.similarity}`);
                console.log(`Matching text: "${match.text.substring(0, 100)}..."`);
                
                const existing = connections.get(match.filePath) || {
                    similarity: 0,
                    snippets: []
                };
                
                existing.similarity = Math.max(existing.similarity, match.similarity);
                existing.snippets.push(match.text);
                connections.set(match.filePath, existing);
            }
        }
    
        console.log(`Found connections to ${connections.size} other notes`);
        
        // Update note with connections
        let content = await this.app.vault.read(file);
        content += '\n\n## Related Content\n';
        
        for (const [path, data] of connections) {
            const relatedFile = this.app.vault.getAbstractFileByPath(path);
            if (relatedFile instanceof TFile) {
                console.log(`Adding connection to ${relatedFile.basename} (${data.similarity})`);
                content += `\n### [[${relatedFile.basename}]] (${(data.similarity * 100).toFixed(1)}% similar)\n`;
                content += data.snippets
                    .slice(0, 3)
                    .map(s => `> ${s.substring(0, 200)}...\n`)
                    .join('\n');
            }
        }
    
        await this.app.vault.modify(file, content);
        console.log("Note updated with semantic connections");
    }

    private async processNewNoteWithProgress(file: TFile, progress: ProgressNotice) {
        try {
            const content = await this.app.vault.read(file);
            const youtubeLinks = this.extractYoutubeLinks(content);
    
            if (youtubeLinks.length === 0) return;
    
            for (const link of youtubeLinks) {
                const videoId = this.extractVideoId(link);
                if (!videoId) continue;
    
                progress.setProgress(50);
                progress.setMessage('Getting transcript');
                const metadata = await this.processVideo(videoId);
                
                progress.setProgress(70);
                progress.setMessage('Creating transcript note');
                await this.createTranscriptNote(file, videoId, metadata.transcript);
                
                progress.setProgress(90);
                progress.setMessage('Updating notes with analysis');
                await this.updateOriginalNote(file, metadata);
            }
        } catch (error) {
            console.error('Error processing note:', error);
            throw error;
        }
    }

    private async processNewNote(file: TFile) {
        try {
            const content = await this.app.vault.read(file);
            const youtubeLinks = this.extractYoutubeLinks(content);
    
            this.currentFile = file;  // Set current file

            if (youtubeLinks.length === 0) return;
    
            for (const link of youtubeLinks) {
                const videoId = this.extractVideoId(link);
                if (!videoId) continue;
    
                // Process video and get metadata
                const metadata = await this.processVideo(videoId);
                
                console.log("Got metadata with transcript length:", metadata.transcript.length); // Debug log
                
                // Create transcript note with the actual transcript
                console.log("Creating transcript note with content:", metadata.transcript.substring(0, 200)); // Debug first 200 chars
                await this.createTranscriptNote(file, videoId, metadata.transcript);
                
                // Update original note with summary and themes
                await this.updateOriginalNote(file, metadata);
            }
        } catch (error) {
            console.error('Error processing note:', error);
            new Notice(`Error processing note: ${error.message}`);
        } finally {
            this.currentFile = null;  // Clear current file when done
        }
    }

    private async testProcessCurrentNote() {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
          new Notice('Starting to process current note...');
          await this.processNewNote(activeView.file);
          new Notice('Finished processing note');
      } else {
          new Notice('No active markdown file');
      }
  }
}

class YouTubeInputModal extends Modal {
    private url: string;
    private onSubmit: (url: string) => void;

    constructor(app: App, onSubmit: (url: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const {contentEl} = this;

        contentEl.createEl("h2", {text: "Add YouTube Video for Analysis"});

        // URL input
        const urlInput = contentEl.createEl("input", {
            type: "text",
            attr: {
                placeholder: "Paste YouTube URL here...",
                style: "width: 100%; padding: 5px; margin-bottom: 10px;"
            }
        });

        // Submit button
        const submitBtn = contentEl.createEl("button", {
            text: "Analyze Video",
            attr: {
                style: "padding: 5px 10px; margin-right: 10px;"
            }
        });
        submitBtn.addEventListener("click", () => {
            this.onSubmit(urlInput.value);
            this.close();
        });

        // Cancel button
        const cancelBtn = contentEl.createEl("button", {
            text: "Cancel",
            attr: {
                style: "padding: 5px 10px;"
            }
        });
        cancelBtn.addEventListener("click", () => this.close());
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

class ProgressNotice {
    private container: HTMLElement;
    private messageEl: HTMLElement;
    private progressBar: HTMLElement;
    private progress: number;

    constructor(message: string) {
        console.log("Creating progress notice with message:", message); // Debug log
        this.progress = 0;
        this.createContainer(message);
    }

    private createContainer(message: string) {
        console.log("Setting up progress container"); // Debug log
        
        // Remove existing if any
        const existing = document.querySelector('.progress-notice');
        if (existing) {
            console.log("Removing existing progress notice"); // Debug log
            existing.remove();
        }

        // Create new container
        this.container = document.createElement('div');
        this.container.className = 'progress-notice';
        this.container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 8px;
            padding: 15px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            width: 300px;
        `;

        // Message element
        this.messageEl = document.createElement('div');
        this.messageEl.textContent = message;
        this.container.appendChild(this.messageEl);

        // Progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            width: 100%;
            background-color: var(--background-modifier-border);
            height: 8px;
            border-radius: 4px;
            margin-top: 8px;
        `;

        // Progress bar
        this.progressBar = document.createElement('div');
        this.progressBar.style.cssText = `
            height: 100%;
            background-color: var(--interactive-accent);
            border-radius: 4px;
            transition: width 0.3s ease;
            width: 0%;
        `;
        progressContainer.appendChild(this.progressBar);

        this.container.appendChild(progressContainer);
        document.body.appendChild(this.container);
        console.log("Progress container created and added to document"); // Debug log
    }

    setProgress(progress: number) {
        console.log("Setting progress to:", progress); // Debug log
        this.progress = Math.min(100, Math.max(0, progress));
        this.progressBar.style.width = `${this.progress}%`;
    }

    setMessage(message: string) {
        console.log("Updating message to:", message); // Debug log
        this.messageEl.textContent = message;
    }

    hide() {
        console.log("Hiding progress notice"); // Debug log
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

interface EmbeddingMetadata {
    text: string;
    embedding: number[];
    filePath: string;
    timestamp?: number;
}

// Add a new interface for results that include similarity
interface SimilarityResult extends EmbeddingMetadata {
    similarity: number;
}


interface VectorStore {
    embeddings: EmbeddingMetadata[];
    addEmbedding(metadata: EmbeddingMetadata): void;
    findSimilar(embedding: number[], threshold: number): EmbeddingMetadata[];
}

class ObsidianVectorStore implements VectorStore {
    embeddings: EmbeddingMetadata[] = [];
    plugin: YoutubeKnowledgeGraphPlugin;

    constructor(plugin: YoutubeKnowledgeGraphPlugin) {
        this.plugin = plugin;
        this.loadFromData();
    }

    addEmbedding(metadata: EmbeddingMetadata): void {
        this.embeddings.push(metadata);
        this.saveToData();
    }

    private async saveToData() {
        try {
            await this.plugin.saveData({
                embeddings: this.embeddings
            });
        } catch (error) {
            console.error('Failed to save vector store:', error);
        }
    }

    private async loadFromData() {
        try {
            const data = await this.plugin.loadData();
            if (data && data.embeddings) {
                this.embeddings = data.embeddings;
            }
        } catch (error) {
            console.error('Failed to load vector store:', error);
            this.embeddings = [];
        }
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

    clearStore() {
        this.embeddings = [];
        this.saveToData();
    }
}