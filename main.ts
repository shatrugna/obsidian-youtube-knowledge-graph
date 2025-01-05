import { Plugin, TFile, Notice, MarkdownView } from 'obsidian';
import { Events, TAbstractFile } from 'obsidian';
import { YoutubeTranscript } from 'youtube-transcript';
import { PluginSettings, DEFAULT_SETTINGS, SettingTab } from './settings';
import { requestUrl } from 'obsidian';

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

    private async createTranscriptNote(originalFile: TFile, videoId: string): Promise<TFile> {
        const transcriptFileName = `${originalFile.basename} - Transcript`;
        const transcriptFilePath = `${originalFile.parent.path}/${transcriptFileName}.md`;
        
        try {
            // Create new note for transcript
            const file = await this.app.vault.create(
                transcriptFilePath,
                `Transcript for video: ${videoId}\n\n`
            );
            return file;
        } catch (error) {
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

    private async fetchTranscript(videoId: string): Promise<string> {
      try {
          console.log("Attempting to fetch transcript for video:", videoId);
          
          // List of Piped instances to try
          const pipedInstances = [
              'https://pipedapi.kavin.rocks',
              'https://api.piped.projectsegfau.lt',
              'https://pipedapi.aeong.one',
              'https://piped-api.garudalinux.org'
          ];
  
          for (const instance of pipedInstances) {
              try {
                  console.log(`Trying Piped instance: ${instance}`);
                  const pipedResponse = await requestUrl({
                      url: `${instance}/streams/${videoId}`,
                      method: 'GET',
                      headers: {
                          'Accept': 'application/json'
                      },
                      throw: false
                  });
  
                  console.log(`Response status from ${instance}:`, pipedResponse.status);
  
                  if (pipedResponse.status === 200) {
                      const videoData = JSON.parse(pipedResponse.text);
                      
                      // If we have subtitles/captions
                      if (videoData.subtitles && videoData.subtitles.length > 0) {
                          // Try to get English subtitles first
                          const englishSub = videoData.subtitles.find((sub: any) => 
                              sub.url && (sub.code === 'en' || sub.code.startsWith('en'))
                          );
                          
                          if (englishSub) {
                              const subtitleResponse = await requestUrl({
                                  url: englishSub.url,
                                  method: 'GET',
                                  throw: false
                              });
                              
                              if (subtitleResponse.status === 200) {
                                  return subtitleResponse.text;
                              }
                          }
                      }
  
                      // If no subtitles, fall back to video description
                      if (videoData.description) {
                          const title = videoData.title || 'Video Title';
                          return `Title: ${title}\n\nDescription: ${videoData.description}`;
                      }
  
                      // If this instance worked but had no content, try next instance
                      continue;
                  }
              } catch (instanceError) {
                  console.log(`Error with instance ${instance}:`, instanceError);
                  // Continue to next instance
                  continue;
              }
          }
  
          // If all automated methods fail, check for manual transcript
          const manualTranscriptFile = this.app.vault.getAbstractFileByPath(`${videoId}-manual-transcript.md`);
          
          if (manualTranscriptFile instanceof TFile) {
              // If manual transcript exists, read it
              const content = await this.app.vault.read(manualTranscriptFile);
              
              // Extract the content after the separator line
              const separator = '---\n\n';
              const transcriptContent = content.split(separator)[1];
              
              if (transcriptContent && transcriptContent.trim().length > 0) {
                  return transcriptContent.trim();
              }
          }

          // If no manual transcript exists or it's empty, prompt for manual input
          return await this.promptForManualTranscript(videoId);

        } catch (error) {
          console.error('Detailed transcript fetch error:', error);
          return await this.promptForManualTranscript(videoId);
        }
    }
  
    private processInvidiousResponse(responseText: string): string {
      try {
          const data = JSON.parse(responseText);
          if (Array.isArray(data) && data.length > 0) {
              // Find English captions or take the first available
              const englishCaptions = data.find((cap: any) => cap.language_code.startsWith('en')) || data[0];
              
              if (englishCaptions && englishCaptions.label) {
                  return `Language: ${englishCaptions.label}\n${englishCaptions.text || ''}`;
              }
          }
          return 'No captions found in the response';
      } catch (error) {
          console.error('Error processing Invidious response:', error);
          return 'Error processing video captions';
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

    private async processVideo(videoId: string): Promise<YoutubeMetadata> {
      let transcript: string = '';
      
      try {
          console.log("Starting to process video:", videoId);
          
          if (!this.settings.anthropicApiKey) {
              throw new Error('Anthropic API key not set');
          }
  
          transcript = await this.fetchTranscript(videoId);
          console.log("Got content to analyze, length:", transcript.length);
  
          // Wrap the Claude API call in retry logic
          const completion = await this.retryWithBackoff(async () => {
              const requestBody = {
                model: "claude-3-opus-20240229",
                max_tokens: 4096,  // Added this required field
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
              };
  
              console.log("Making Claude API request with body:", JSON.stringify(requestBody, null, 2));
  
              const response = await requestUrl({
                url: 'https://api.anthropic.com/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.settings.anthropicApiKey,
                    'anthropic-version': '2023-06-01'  // Changed from '2024-01-01' to '2023-06-01'
                },
                body: JSON.stringify(requestBody),
                throw: false
              });
  
              // Log everything about the response
              console.log({
                status: response.status,
                statusText: response.status,
                headers: response.headers,
                text: response.text,
              });
            
              if (response.status !== 200) {
                console.error("Full response:", response);
                console.error("Response text:", response.text);
                console.error("Response headers:", response.headers);
                throw new Error(`Claude API returned status ${response.status}: ${response.text}`);
              }
  
              return response;
          });
  
          console.log("Claude response received:", completion.text.substring(0, 200)); // Log first 200 chars
          const analysis = JSON.parse(completion.text);
  
          let themes: string[] = [];
          let summary: string = '';
  
          try {
            const content = analysis.content[0].text;
            // Try to extract JSON if it's embedded in other text
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonStr = jsonMatch[0];
                const parsedContent = JSON.parse(jsonStr);
                themes = parsedContent.themes || [];
                summary = parsedContent.summary || '';
            } else {
                console.error('No JSON found in response:', content);
                // Fallback: treat the entire response as a summary
                summary = content;
                themes = ['Theme extraction failed'];
            }
          } catch (parseError) {
              console.error('Error parsing Claude response:', parseError);
              // Fallback to raw content if JSON parsing fails
              const rawContent = analysis.content[0].text;
              summary = rawContent;
              themes = ['Theme parsing failed'];
          }
  
          return {
              videoId,
              title: await this.getVideoTitle(videoId),
              transcript,
              themes,
              summary
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
            console.log("Processing new note:", file.path);
            const content = await this.app.vault.read(file);
            console.log("Found content:", content);

            const youtubeLinks = this.extractYoutubeLinks(content);
            console.log("Found YouTube links:", youtubeLinks);

            if (youtubeLinks.length === 0) {
              console.log("No YouTube links found");
              return;
            }

            for (const link of youtubeLinks) {
                const videoId = this.extractVideoId(link);
                if (!videoId) continue;

                // Create scratch note for transcript
                const transcriptNote = await this.createTranscriptNote(file, videoId);
                
                // Process video content
                const metadata = await this.processVideo(videoId);
                
                // Update original note with summary and themes
                await this.updateOriginalNote(file, metadata);
            }
        } catch (error) {
            new Notice(`Error processing note: ${error.message}`);
            console.error('Error processing note:', error);
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