import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ytdl from 'ytdl-core';

// Set FFmpeg path
try {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  ffmpeg.setFfprobePath(ffmpegInstaller.path.replace('ffmpeg', 'ffprobe'));
  console.log('Using ffmpeg-installer path:', ffmpegInstaller.path);
} catch (error) {
  console.warn('Falling back to system ffmpeg:', error.message);
  ffmpeg.setFfmpegPath('ffmpeg');
  ffmpeg.setFfprobePath('ffprobe');
}

class TranscriptionService {
  constructor() {
    this.assemblyAIKey = process.env.ASSEMBLYAI_API_KEY;
    this.baseURL = 'https://api.assemblyai.com/v2';
    if (!this.assemblyAIKey) {
      console.error('ASSEMBLYAI_API_KEY is not set in environment variables');
      throw new Error('Missing AssemblyAI API key');
    }
    console.log('AssemblyAI API key loaded:', this.assemblyAIKey.slice(0, 4) + '****' + this.assemblyAIKey.slice(-4));
  }

  async validateInputFile(filePath) {
    return new Promise((resolve, reject) => {
      const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
      console.log('Validating input file:', normalizedPath);
      if (!fs.existsSync(normalizedPath)) {
        return reject(new Error(`File not found: ${normalizedPath}`));
      }
      ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
        if (err) {
          console.error('FFprobe error:', err);
          return reject(new Error(`Failed to probe file: ${err.message}`));
        }
        const audioStream = metadata.streams.find((stream) => stream.codec_type === 'audio');
        if (!audioStream) {
          console.error('No audio stream found in:', normalizedPath);
          return reject(new Error('No audio stream found in input file'));
        }
        console.log('Audio stream found:', audioStream.codec_name);
        resolve(metadata);
      });
    });
  }

  async uploadFile(filePath) {
    try {
      const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
      console.log('Uploading file:', normalizedPath);
      if (!fs.existsSync(normalizedPath)) {
        throw new Error(`File not found for upload: ${normalizedPath}`);
      }
      const form = new FormData();
      form.append('file', fs.createReadStream(normalizedPath));

      const response = await axios.post(`${this.baseURL}/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: this.assemblyAIKey,
        },
      });

      console.log('File uploaded, URL:', response.data.upload_url);
      return response.data.upload_url;
    } catch (error) {
      console.error('File upload error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      throw new Error('Failed to upload audio file');
    }
  }

  async submitTranscription(audioUrl, options = {}) {
    try {
      console.log('Submitting transcription for:', audioUrl);
      const config = {
        audio_url: audioUrl,
        speaker_labels: true,
        auto_chapters: true,
        entity_detection: true,
        sentiment_analysis: true,
        auto_highlights: true,
        punctuate: true,
        format_text: true,
        language_detection: true,
        ...options,
      };

      const response = await axios.post(`${this.baseURL}/transcript`, config, {
        headers: {
          Authorization: this.assemblyAIKey,
          'Content-Type': 'application/json',
        },
      });

      console.log('Transcription job submitted, ID:', response.data.id);
      return response.data;
    } catch (error) {
      console.error('Transcription submission error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      throw new Error('Failed to submit transcription');
    }
  }

  async getTranscriptionResult(transcriptId) {
    try {
      console.log('Fetching transcription result for ID:', transcriptId);
      const response = await axios.get(`${this.baseURL}/transcript/${transcriptId}`, {
        headers: {
          Authorization: this.assemblyAIKey,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Transcription result error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      throw new Error('Failed to get transcription result');
    }
  }

  async pollTranscription(transcriptId, maxAttempts = 60) {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const result = await this.getTranscriptionResult(transcriptId);
        if (result.status === 'completed') {
          console.log('Transcription completed for ID:', transcriptId);
          return this.processTranscriptionResult(result);
        } else if (result.status === 'error') {
          console.error('Transcription failed:', result.error);
          throw new Error(`Transcription failed: ${result.error}`);
        }
        console.log(`Attempt ${attempts + 1}/${maxAttempts}: Transcription status: ${result.status}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
      } catch (error) {
        console.error('Polling error:', error);
        throw error;
      }
    }
    throw new Error('Transcription timeout');
  }

  processTranscriptionResult(result) {
    const processed = {
      text: result.text || '',
      language: result.language_code || 'en',
      confidence: result.confidence || 0,
      timestamped: [],
      speakers: [],
      chapters: [],
      entities: [],
      sentiment: null,
      highlights: [],
    };

    if (result.words) {
      processed.timestamped = result.words.map((word) => ({
        start: word.start / 1000,
        end: word.end / 1000,
        text: word.text,
        confidence: word.confidence,
      }));
    }

    if (result.utterances) {
      processed.speakers = result.utterances.map((utterance) => ({
        speaker: utterance.speaker,
        start: utterance.start / 1000,
        end: utterance.end / 1000,
        text: utterance.text,
        confidence: utterance.confidence,
      }));
    }

    if (result.chapters) {
      processed.chapters = result.chapters.map((chapter) => ({
        start: chapter.start / 1000,
        end: chapter.end / 1000,
        headline: chapter.headline,
        gist: chapter.gist,
        summary: chapter.summary,
      }));
    }

    if (result.entities) {
      processed.entities = result.entities.map((entity) => ({
        start: entity.start / 1000,
        end: entity.end / 1000,
        text: entity.text,
        entityType: entity.entity_type,
      }));
    }

    if (result.sentiment_analysis_results) {
      processed.sentiment = result.sentiment_analysis_results.map((sentiment) => ({
        start: sentiment.start / 1000,
        end: sentiment.end / 1000,
        text: sentiment.text,
        sentiment: sentiment.sentiment,
        confidence: sentiment.confidence,
      }));
    }

    if (result.auto_highlights_result) {
      processed.highlights = result.auto_highlights_result.results.map((highlight) => ({
        text: highlight.text,
        count: highlight.count,
        rank: highlight.rank,
        timestamps: highlight.timestamps.map((ts) => ({
          start: ts.start / 1000,
          end: ts.end / 1000,
        })),
      }));
    }

    return processed;
  }

  async extractAudio(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
      const normalizedVideoPath = path.normalize(videoPath).replace(/\\/g, '/');
      const normalizedOutputPath = path.normalize(outputPath).replace(/\\/g, '/');
      console.log('FFmpeg extracting audio from:', normalizedVideoPath, 'to:', normalizedOutputPath);

      this.validateInputFile(normalizedVideoPath)
        .then(() => {
          ffmpeg(normalizedVideoPath)
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .format('mp3')
            .on('start', (commandLine) => {
              console.log('FFmpeg command:', commandLine);
            })
            .on('end', () => {
              console.log('Audio extraction completed:', normalizedOutputPath);
              resolve(normalizedOutputPath);
            })
            .on('error', (err) => {
              console.error('Audio extraction error:', err);
              reject(err);
            })
            .save(normalizedOutputPath);
        })
        .catch((err) => {
          console.error('Input validation error:', err);
          reject(err);
        });
    });
  }

  async transcribeVideo(videoPath, options = {}) {
    let audioPath = null;
    const normalizedVideoPath = path.normalize(videoPath).replace(/\\/g, '/');
    try {
      console.log('Transcribing file:', normalizedVideoPath);
      if (!fs.existsSync(normalizedVideoPath)) {
        throw new Error(`File not found: ${normalizedVideoPath}`);
      }

      audioPath = path.join(
        path.dirname(normalizedVideoPath),
        path.basename(normalizedVideoPath, path.extname(normalizedVideoPath)) + '.mp3'
      ).replace(/\\/g, '/');
      console.log('Audio output path:', audioPath);

      // Skip extraction if already an MP3
      if (path.extname(normalizedVideoPath).toLowerCase() === '.mp3') {
        console.log('File is already MP3, skipping extraction:', normalizedVideoPath);
        audioPath = normalizedVideoPath;
      } else {
        await this.extractAudio(normalizedVideoPath, audioPath);
      }

      // Validate audio file
      const metadata = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, data) => (err ? reject(err) : resolve(data)));
      });
      if (metadata.format.duration === 0 || !metadata.streams.some(s => s.codec_type === 'audio')) {
        throw new Error('No valid audio content detected in the file');
      }

      const audioUrl = await this.uploadFile(audioPath);
      const transcriptionJob = await this.submitTranscription(audioUrl, options);
      const result = await this.pollTranscription(transcriptionJob.id);

      return result;
    } catch (error) {
      console.error('File transcription error:', error);
      throw error;
    } finally {
      // Cleanup audio file if it exists and is different from the original
      if (audioPath && fs.existsSync(audioPath) && audioPath !== normalizedVideoPath) {
        try {
          fs.unlinkSync(audioPath);
          console.log('Cleaned up audio file:', audioPath);
        } catch (err) {
          console.error('Failed to clean up audio file:', err);
        }
      }
    }
  }

  async transcribeYouTubeVideo(videoId, options = {}) {
    try {
      console.log('Transcribing YouTube video ID:', videoId);
      const info = await ytdl.getInfo(videoId);
      const audioFormat = ytdl.chooseFormat(info.formats, {
        quality: 'highestaudio',
        filter: 'audioonly',
      });

      if (!audioFormat) {
        throw new Error('No audio format found');
      }

      console.log('Selected audio format:', audioFormat.url);
      const transcriptionJob = await this.submitTranscription(audioFormat.url, options);
      const result = await this.pollTranscription(transcriptionJob.id);
      console.log('YouTube transcription completed:', result.text.substring(0, 100) + '...');

      return result;
    } catch (error) {
      console.error('YouTube transcription error:', error);
      throw error;
    }
  }

  getSupportedLanguages() {
    return [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'nl', name: 'Dutch' },
      { code: 'hi', name: 'Hindi' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ru', name: 'Russian' },
      { code: 'ar', name: 'Arabic' },
      { code: 'tr', name: 'Turkish' },
      { code: 'pl', name: 'Polish' },
      { code: 'uk', name: 'Ukrainian' },
      { code: 'vi', name: 'Vietnamese' },
      { code: 'ms', name: 'Malay' },
      { code: 'th', name: 'Thai' },
      { code: 'fi', name: 'Finnish' },
    ];
  }
}

export default TranscriptionService;