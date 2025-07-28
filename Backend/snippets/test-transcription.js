import TranscriptionService from '../services/transcription.service.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Setup __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

async function test() {
  try {
    // Correctly resolve the video file path
    const videoPath = path.join(__dirname, '..', 'uploads', 'videos', 'test.mp4');
    console.log('Resolved video path:', videoPath);

    // Verify video file exists
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    // Transcribe video
    const result = await TranscriptionService.transcribeVideo(videoPath);
    console.log('AssemblyAI Response:', result);
  } catch (error) {
    console.error('AssemblyAI Error:', error);
  }
}

test();