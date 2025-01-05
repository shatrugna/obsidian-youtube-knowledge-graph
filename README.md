# YouTube Knowledge Graph for Obsidian

A plugin for Obsidian that creates a knowledge graph from YouTube video content. It automatically extracts transcripts, analyzes themes and topics using Claude AI, and builds a interconnected network of notes that you can explore through Obsidian's graph view.

## Features

- Automatically detects YouTube links in notes
- Extracts video transcripts (supports multiple methods including manual input)
- Uses Claude AI to analyze content and extract key themes
- Creates theme-based connections between videos
- Integrates with Obsidian's native graph visualization
- Supports manual transcript input when automatic extraction fails

## Installation

1. Copy the `main.js` and `manifest.json` files to your Obsidian plugins folder:
   `.obsidian/plugins/obsidian-youtube-knowledge-graph/`

2. Enable the plugin in Obsidian Settings → Community Plugins

3. Configure your Anthropic API key in the plugin settings

## Usage

1. Create a new note with a YouTube video link
2. Use any of these methods to process the video:
   - The plugin will automatically process new notes with YouTube links
   - Run "Process YouTube Links in Current Note" from the command palette
   - Use "Input Manual Transcript" command if automatic transcript extraction fails

3. The plugin will:
   - Create a transcript note
   - Extract themes and create a summary
   - Create theme notes in a Themes/ folder
   - Link everything together in Obsidian's graph

## Commands

- `Process YouTube Links in Current Note`: Processes any YouTube links in the current note
- `Input Manual Transcript`: Opens a new note where you can manually paste a video transcript

## Requirements

- Obsidian v0.15.0 or higher
- Anthropic API key with access to Claude API
- Internet connection for YouTube transcript extraction

## Development

To build the plugin:

```bash
# Install dependencies
npm install

# Build
npm run build
```

## Known Issues

- YouTube transcript extraction may fail for some videos (manual input available as fallback)
- Rate limiting may occur with the Claude API
- Large transcripts may need to be processed in chunks

## Future Improvements

- Add support for multiple languages
- Implement batch processing for multiple videos
- Add more theme analysis options
- Improve transcript extraction reliability
- Add support for other video platforms

## Support

For issues or feature requests, please use the GitHub issues page.

## License

MIT License

