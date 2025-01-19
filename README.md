# YouTube Knowledge Graph for Obsidian

A plugin for Obsidian that creates a semantically connected knowledge graph from YouTube video content. It automatically extracts video transcripts, generates summaries through Claude, and builds connections between related discussions using semantic similarity and conceptual linking.

## Features

- Easily add YouTube videos through ribbon icon or command palette
- Automatically transcribes videos using local Whisper server
- Generates concise summaries using Claude
- Creates semantic connections between related discussions using embeddings
- Extracts and links key concepts across videos
- Stores organized transcripts for reference
- Builds a rich knowledge network based on content similarity and shared concepts

## Prerequisites

1. Python environment setup for Whisper server:
```bash
# Create and setup virtual environment
mkdir whisper_server
cd whisper_server
python3 -m venv whisper_env
source whisper_env/bin/activate

# Install dependencies
pip install fastapi uvicorn faster-whisper python-multipart yt-dlp ffmpeg-python
```

2. FFmpeg installation:
```bash
sudo apt install ffmpeg
```

3. Anthropic API key for Claude

## Installation

1. Copy the `main.js` and `manifest.json` files to your Obsidian plugins folder:
   `.obsidian/plugins/obsidian-youtube-knowledge-graph/`

2. Enable the plugin in Obsidian Settings → Community Plugins

3. Configure your Anthropic API key in the plugin settings

4. Start the Whisper server:
```bash
cd whisper_server
source whisper_env/bin/activate
python whisper_server.py
```

## Usage

1. Click the YouTube icon in the ribbon (left sidebar) or use command palette (Cmd/Ctrl + P) to open "Add YouTube Video"
2. Paste a YouTube video URL in the modal
3. The plugin will automatically:
   - Create a new note with the video title
   - Extract and transcribe the video using Whisper
   - Generate a summary using Claude
   - Extract key concepts from the content
   - Find and link to conceptually related discussions
   - Store transcript in the Transcripts folder
4. View connections:
   - Open Obsidian's graph view to see semantic and conceptual connections
   - Check "Conceptually Related Discussions" section in notes
   - Click through to related content based on shared concepts and similarity scores
   - Browse concepts to explore related discussions

## Note Structure

Each processed note will have:
- Video title and link
- Link to full transcript
- Generated summary
- Semantic connections to related discussions with:
  - Shared concepts
  - Similarity scores
  - Relevant quotes showing the connection
  - Bi-directional links for graph visualization

## Development

To build the plugin:

```bash
# Install dependencies
npm install

# Build
npm run build
```

## Known Issues

- Requires local Whisper server to be running
- Large videos may take longer to process
- Requires stable internet connection for YouTube download and Claude API
- YouTube links must be standard format (e.g., https://www.youtube.com/watch?v=...)

## Future Improvements

- Add support for multiple languages
- Implement batch processing for multiple videos
- Add configuration for Whisper model selection
- Add progress indicators for long transcriptions
- Support for different YouTube URL formats
- Improve similarity threshold tuning
- Add concept relationship visualization

## Support

For issues or feature requests, please use the GitHub issues page.

## License

MIT License