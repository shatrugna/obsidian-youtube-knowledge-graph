from fastapi import FastAPI, Request
from faster_whisper import WhisperModel
import uvicorn
import tempfile
import os
import yt_dlp
from pydub import AudioSegment

app = FastAPI()

model = WhisperModel("tiny", device="cpu", compute_type="int8")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

async def download_youtube_audio(video_id: str) -> bytes:
    try:
        # Configure yt-dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'wav',
            }],
            'quiet': True,
            'no_warnings': True,
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            # Set output template
            output_template = os.path.join(temp_dir, '%(id)s.%(ext)s')
            ydl_opts['outtmpl'] = output_template

            # Download audio
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([f'https://www.youtube.com/watch?v={video_id}'])
            
            # Find the downloaded WAV file
            wav_file = os.path.join(temp_dir, f'{video_id}.wav')
            
            # Read WAV file
            with open(wav_file, 'rb') as f:
                audio_data = f.read()
            
            return audio_data
            
    except Exception as e:
        raise Exception(f"Failed to download YouTube audio: {str(e)}")

@app.post("/transcribe/{video_id}")
async def transcribe_youtube(video_id: str):
    try:
        # Download audio
        print(f"Downloading audio for video {video_id}")
        audio_data = await download_youtube_audio(video_id)
        print("Audio download complete")
        
        # Save to temporary file for Whisper
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            tmp_file.write(audio_data)
            tmp_file.flush()
            
            print("Starting transcription")
            # Transcribe
            segments, info = model.transcribe(tmp_file.name, beam_size=5)
            
            # Format response
            result = [{
                "start": segment.start,
                "end": segment.end,
                "text": segment.text
            } for segment in segments]
            
            # Cleanup
            os.unlink(tmp_file.name)
            
            print("Transcription complete")
            return {
                "segments": result,
                "language": info.language
            }
            
    except Exception as e:
        print(f"Error processing video: {str(e)}")
        return {"error": str(e)}, 500

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)