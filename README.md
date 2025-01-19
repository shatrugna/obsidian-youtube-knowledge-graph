# YouTube Knowledge Graph for Obsidian

A plugin for Obsidian that creates a semantically connected knowledge graph from YouTube video content. It automatically extracts video transcripts, generates summaries through Claude, and builds connections between related discussions using semantic similarity.

## Features

- Automatically transcribes YouTube videos from links using local Whisper server
- Generates concise summaries of video content using Claude
- Creates semantic connections between related discussions using embeddings
- Integrates with Obsidian's native graph visualization
- Stores raw transcripts in a hidden folder for reference
- Builds a knowledge network based on content similarity rather than just manual links

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
   - Create embeddings for semantic analysis
   - Find and link to conceptually related discussions
   - Store raw transcript in `.transcripts` folder for reference

4. View connections:
   - Open Obsidian's graph view to see semantic connections
   - Check "Conceptually Related Discussions" section in notes
   - Click through to related content based on similarity scores

## Note Structure

Each processed note will have:
- Video title and link
- Link to full transcript
- Generated summary
- Semantic connections to related discussions with:
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

## Support

For issues or feature requests, please use the GitHub issues page.

## License

MIT License