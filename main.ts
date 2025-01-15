import { Plugin, TFile, Notice, MarkdownView } from 'obsidian';
import { TAbstractFile } from 'obsidian';
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
    themes: string[];
    summary: string;
}

export default class YoutubeKnowledgeGraphPlugin extends Plugin {
    settings: PluginSettings;

    async onload() {
      await this.loadSettings();

    
      // Add settings tab
      this.addSettingTab(new SettingTab(this.app, this));

        
      // Register event listener for file creation using vault events
      this.registerEvent(
          this.app.vault.on('create', async (file: TAbstractFile) => {
              console.log("File create event triggered:", file.path);
              if (file instanceof TFile && file.extension === 'md') {
                  await this.processNewNote(file);
              }
          })
      );
  
      // Add command to manually process a note
      this.addCommand({
          id: 'process-youtube-links',
          name: 'Process YouTube Links in Current Note',
          callback: () => this.processCurrentNote()
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
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async loadApiKey(): Promise<string | null> {
      return this.settings.anthropicApiKey || null;
    }

    private async processVideo(videoId: string): Promise<YoutubeMetadata> {
        let transcript: string = '';
        
        try {
            console.log("Starting to process video:", videoId);
            
            if (!this.settings.anthropicApiKey) {
                throw new Error('Anthropic API key not set');
            }
    
            // Get transcript directly from our Python server
            const response = await requestUrl({
                url: `http://localhost:8000/transcribe/${videoId}`,
                method: 'POST'
            });
    
            if (response.status !== 200) {
                throw new Error(`Failed to transcribe: ${response.text}`);
            }
    
            const transcriptionResult = JSON.parse(response.text);
            
            // Format transcript
            transcript = this.formatTranscript(transcriptionResult.segments);
            console.log("Transcription complete");
     
            // Process with Claude
            const completion = await this.retryWithBackoff(async () => {
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
                            content: `Analyze this transcript and extract main themes and create a summary. 
                            You must respond using only valid JSON format with no additional text.
                            The JSON must have exactly this structure:
                            {
                                "themes": ["theme1", "theme2", ...],
                                "summary": "summary text here"
                            }
     
                            Transcript: ${transcript}`
                        }]
                    })
                });
                return response;
            });
     
            console.log("Analysis complete");
            const analysis = JSON.parse(completion.text);
            const content = JSON.parse(analysis.content[0].text);
     
            return {
                videoId,
                title: await this.getVideoTitle(videoId),
                transcript,
                themes: content.themes || [],
                summary: content.summary || ''
            };
     
        } catch (error) {
            console.error('Error in processVideo:', error);
            new Notice(`Failed to process video: ${error.message}`);
            
            return {
                videoId,
                title: await this.getVideoTitle(videoId),
                transcript: transcript || 'Transcript unavailable',
                themes: [],
                summary: 'Processing failed: ' + error.message
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
            const transcriptFileName = `${originalFile.basename} - Transcript`;
            const transcriptFilePath = `${originalFile.parent.path}/${transcriptFileName}.md`;
            
            console.log("Creating transcript note at:", transcriptFilePath); // Debug log
            console.log("With content length:", transcriptContent.length); // Debug log
            
            // Create content with timestamp formatting
            const content = `# Transcript for ${originalFile.basename}\n\n${transcriptContent}`;
            
            // Create or update transcript note
            const existingFile = this.app.vault.getAbstractFileByPath(transcriptFilePath);
            if (existingFile instanceof TFile) {
                console.log("Updating existing transcript file");
                await this.app.vault.modify(existingFile, content);
                return existingFile;
            } else {
                console.log("Creating new transcript file");
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

    private async updateOriginalNote(file: TFile, metadata: YoutubeMetadata) {
        try {
            const content = await this.app.vault.read(file);
            
            // Create a themes note if it doesn't exist
            for (const theme of metadata.themes) {
                const themeFileName = `Themes/${theme}.md`;
                try {
                    // Check if theme note exists
                    await this.app.vault.adapter.exists(themeFileName);
                } catch {
                    // Create theme note if it doesn't exist
                    await this.app.vault.create(
                        themeFileName,
                        `# ${theme}\n\nVideos discussing this theme:\n`
                    );
                }
                
                // Add backlink in theme note to this video note
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

            // Update original note with summary and theme links
            const themeLinks = metadata.themes
                .map(theme => `[[Themes/${theme}]]`)
                .join(', ');

            const updatedContent = `${content}\n\n## Summary\n${metadata.summary}\n\n## Themes\n${themeLinks}\n`;
            await this.app.vault.modify(file, updatedContent);
        } catch (error) {
            throw new Error(`Failed to update original note: ${error.message}`);
        }
    }

    private async processNewNote(file: TFile) {
        try {
            const content = await this.app.vault.read(file);
            const youtubeLinks = this.extractYoutubeLinks(content);
    
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