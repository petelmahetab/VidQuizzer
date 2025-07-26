
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';

class TranscriptionService {
  constructor() {
    this.assemblyAIKey = process.env.ASSEMBLYAI_API_KEY;
    this.baseURL = 'https://api.assemblyai.com/v2';
  }

  // Upload audio file to AssemblyAI
  async uploadFile(filePath) {
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));

      const response = await axios.post(`${this.baseURL}/upload`, form, {
        headers: {
          ...form.getHeaders(),
          'authorization': this.assemblyAIKey
        }
      });

      return response.data.upload_url;
    } catch (error) {
      console.error('File upload error:', error);
      throw new Error('Failed to upload audio file');
    }
  }

  // Submit transcription job
  async submitTranscription(audioUrl, options = {}) {
    try {
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
        ...options
      };

      const response = await axios.post(`${this.baseURL}/transcript`, config, {
        headers: {
          'authorization': this.assemblyAIKey,
          'content-type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Transcription submission error:', error);
      throw new Error('Failed to submit transcription');
    }
  }

  // Get transcription result
  async getTranscriptionResult(transcriptId) {
    try {
      const response = await axios.get(`${this.baseURL}/transcript/${transcriptId}`, {
        headers: {
          'authorization': this.assemblyAIKey
        }
      });

      return response.data;
    } catch (error) {
      console.error('Transcription result error:', error);
      throw new Error('Failed to get transcription result');
    }
  }

  // Poll for transcription completion
  async pollTranscription(transcriptId, maxAttempts = 60) {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const result = await this.getTranscriptionResult(transcriptId);
        
        if (result.status === 'completed') {
          return this.processTranscriptionResult(result);
        } else if (result.status === 'error') {
          throw new Error(`Transcription failed: ${result.error}`);
        }
        
        // Wait 5 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      } catch (error) {
        console.error('Polling error:', error);
        throw error;
      }
    }
    
    throw new Error('Transcription timeout');
  }

  // Process transcription result
  processTranscriptionResult(result) {
    const processed = {
      text: result.text,
      language: result.language_code,
      confidence: result.confidence,
      timestamped: [],
      speakers: [],
      chapters: [],
      entities: [],
      sentiment: null,
      highlights: []
    };

    // Process words with timestamps
    if (result.words) {
      processed.timestamped = result.words.map(word => ({
        start: word.start / 1000, // Convert to seconds
        end: word.end / 1000,
        text: word.text,
        confidence: word.confidence
      }));
    }

    // Process speaker labels
    if (result.utterances) {
      processed.speakers = result.utterances.map(utterance => ({
        speaker: utterance.speaker,
        start: utterance.start / 1000,
        end: utterance.end / 1000,
        text: utterance.text,
        confidence: utterance.confidence
      }));
    }

    // Process chapters
    if (result.chapters) {
      processed.chapters = result.chapters.map(chapter => ({
        start: chapter.start / 1000,
        end: chapter.end / 1000,
        headline: chapter.headline,
        gist: chapter.gist,
        summary: chapter.summary
      }));
    }

    // Process entities
    if (result.entities) {
      processed.entities = result.entities.map(entity => ({
        start: entity.start / 1000,
        end: entity.end / 1000,
        text: entity.text,
        entityType: entity.entity_type
      }));
    }

    // Process sentiment
    if (result.sentiment_analysis_results) {
      processed.sentiment = result.sentiment_analysis_results.map(sentiment => ({
        start: sentiment.start / 1000,
        end: sentiment.end / 1000,
        text: sentiment.text,
        sentiment: sentiment.sentiment,
        confidence: sentiment.confidence
      }));
    }

    // Process highlights
    if (result.auto_highlights_result) {
      processed.highlights = result.auto_highlights_result.results.map(highlight => ({
        text: highlight.text,
        count: highlight.count,
        rank: highlight.rank,
        timestamps: highlight.timestamps.map(ts => ({
          start: ts.start / 1000,
          end: ts.end / 1000
        }))
      }));
    }

    return processed;
  }

  // Extract audio from video using FFmpeg
  async extractAudio(videoPath, outputPath) {
    return new Promise(async (resolve, reject) => {
     const ffmpeg = (await import('fluent-ffmpeg')).default;

      
      ffmpeg(videoPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .format('mp3')
        .on('end', () => {
          console.log('Audio extraction completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Audio extraction error:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  // Complete transcription workflow
  async transcribeVideo(videoPath, options = {}) {
    try {
      // Extract audio from video
      const audioPath = videoPath.replace(/\.[^/.]+$/, '.mp3');
      await this.extractAudio(videoPath, audioPath);

      // Upload audio file
      const audioUrl = await this.uploadFile(audioPath);

      // Submit transcription
      const transcriptionJob = await this.submitTranscription(audioUrl, options);

      // Poll for completion
      const result = await this.pollTranscription(transcriptionJob.id);

      // Clean up audio file
      fs.unlinkSync(audioPath);

      return result;
    } catch (error) {
      console.error('Video transcription error:', error);
      throw error;
    }
  }

  // Get transcription from YouTube video
  async transcribeYouTubeVideo(videoId, options = {}) {
    try {
      // You can use youtube-dl or ytdl-core to get audio URL
    const ytdl = await import('ytdl-core');
    const { getInfo } = ytdl;

      const info = await getInfo(videoId);
      
      // Get audio format
      const audioFormat = ytdl.chooseFormat(info.formats, { 
        quality: 'highestaudio',
        filter: 'audioonly' 
      });

      if (!audioFormat) {
        throw new Error('No audio format found');
      }

      // Submit transcription directly with audio URL
      const transcriptionJob = await this.submitTranscription(audioFormat.url, options);

      // Poll for completion
      const result = await this.pollTranscription(transcriptionJob.id);

      return result;
    } catch (error) {
      console.error('YouTube transcription error:', error);
      throw error;
    }
  }

  // Get supported languages
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
      { code: 'fi', name: 'Finnish' }
    ];
  }
}

export default new TranscriptionService();
