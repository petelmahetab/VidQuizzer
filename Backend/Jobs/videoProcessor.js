// jobs/videoProcessor.js
import Queue from 'bull';
import TranscriptionService from '../services/transcription.service.js';
import AIService from '../services/ai.service.js';
import Video from '../models/Video.js';
import fs from 'fs';

const videoQueue = new Queue('video-processing', {
  redis: { host: 'localhost', port: 6379 },
});

videoQueue.process(async (job) => {
  const { videoId, filePath } = job.data;
  console.log(`Processing job for video ${videoId} at ${filePath}`);
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found for transcription: ${filePath}`);
    }

    const transcriptionService = new TranscriptionService();
    const transcription = await transcriptionService.transcribeVideo(filePath);
    console.log(`Transcription completed for video ${videoId}`);
    await Video.findByIdAndUpdate(videoId, {
      status: 'processing',
      processingStage: 'summarization',
      transcript: {
        text: transcription.text,
        timestamped: transcription.timestamped,
        language: transcription.language,
        confidence: transcription.confidence,
        speakers: transcription.speakers,
        chapters: transcription.chapters,
        entities: transcription.entities,
        sentiment: transcription.sentiment,
        highlights: transcription.highlights,
      },
    });

    const summary = await AIService.generateSummary(transcription.text, 'detailed', transcription.language);
    console.log(`Summarization completed for video ${videoId}`);
    await Video.findByIdAndUpdate(videoId, {
      status: 'processing',
      processingStage: 'question_generation',
      summary: { text: summary.content, generatedAt: new Date(), model: 'gemini-1.5-flash' },
    });

    const questions = await AIService.generateQuestions(transcription.text, 5, 'medium', ['multiple_choice', 'short_answer']);
    console.log(`Question generation completed for video ${videoId}`);
    await Video.findByIdAndUpdate(videoId, {
      status: 'completed',
      processingStage: 'completed',
      questions,
    });

    // Keep local file (no deletion)
    console.log(`Video processing completed for ${videoId}`);
  } catch (error) {
    console.error(`Job failed for video ${videoId}:`, error);
    await Video.findByIdAndUpdate(videoId, {
      status: 'failed',
      processingStage: 'failed',
      error: error.message,
    });
    throw error;
  }
});

videoQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed for video ${job.data.videoId}:`, err);
});

export const addVideoJob = (videoId, filePath) => {
  console.log(`Adding job for video ${videoId} at ${filePath}`);
  videoQueue.add({ videoId, filePath }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
};