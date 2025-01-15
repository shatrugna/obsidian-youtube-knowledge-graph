# YouTube Knowledge Graph for Obsidian

A plugin for Obsidian that creates a knowledge graph from YouTube video content. It automatically extracts video audio, transcribes it using a local Whisper server, analyzes themes and topics using Claude AI, and builds an interconnected network of notes that you can explore through Obsidian's graph view.

## Features

- Automatically detects YouTube links in notes
- Server-side extraction and transcription of YouTube audio using yt-dlp and Whisper
- Uses Claude AI to analyze content and extract key themes
- Creates theme-based connections between videos
- Integrates with Obsidian's native graph visualization
- Generates both raw transcripts and analyzed summaries

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

1. Create a new note with a YouTube video link

2. Run "Process YouTube Links in Current Note" from the command palette

3. The plugin will:
   - Extract and transcribe the video using the local Whisper server
   - Create a raw transcript note titled "Raw Transcript - {original note name}"
   - Extract themes and create a summary using Claude
   - Create theme notes in a Themes/ folder
   - Update the original note with themes and summary
   - Link everything together in Obsidian's graph

## Architecture

- Local Python server using:
  - FastAPI for the web server
  - yt-dlp for reliable YouTube audio extraction
  - faster-whisper for efficient transcription
  - FFmpeg for audio processing
- Claude API for theme extraction and summarization
- Obsidian's native graph for visualization

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
- Requires stable internet connection for YouTube extraction and Claude API
- YouTube links must be standard format (e.g., https://www.youtube.com/watch?v=...)

## Future Improvements

- Add support for multiple languages
- Implement batch processing for multiple videos
- Add more theme analysis options
- Add configuration for Whisper model selection
- Add progress indicators for long transcriptions
- Support for different YouTube URL formats

## Support

For issues or feature requests, please use the GitHub issues page.

## License

MIT License