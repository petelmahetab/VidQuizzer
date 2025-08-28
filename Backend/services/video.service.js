// src/services/video.service.js
import ytdl from 'ytdl-core';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';

class VideoService {
  constructor() {
    this.uploadsDir = path.join(__dirname, '../../uploads');
    this.tempDir = path.join(__dirname, '../../temp');
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.uploadsDir, this.tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // Validate YouTube URL
  isValidYouTubeUrl(url) {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return regex.test(url);
  }

  // Extract video ID from YouTube URL
  extractVideoId(url) {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  // Get YouTube video info
  async getYouTubeVideoInfo(videoId) {
    try {
      const info = await ytdl.getInfo(videoId);
      
      return {
        title: info.videoDetails.title,
        description: info.videoDetails.description,
        duration: parseInt(info.videoDetails.lengthSeconds),
        thumbnail: info.videoDetails.thumbnails[0]?.url,
        author: info.videoDetails.author.name,
        viewCount: parseInt(info.videoDetails.viewCount),
        publishDate: info.videoDetails.publishDate,
        keywords: info.videoDetails.keywords || [],
        category: info.videoDetails.category
      };
    } catch (error) {
      console.error('YouTube info error:', error);
      throw new Error('Failed to get YouTube video information');
    }
  }

  // Download YouTube video
  async downloadYouTubeVideo(videoId, options = {}) {
    try {
      const info = await ytdl.getInfo(videoId);
      const format = ytdl.chooseFormat(info.formats, { 
        quality: options.quality || 'highest',
        filter: options.audioOnly ? 'audioonly' : 'videoandaudio'
      });

      if (!format) {
        throw new Error('No suitable format found');
      }

      const filename = `${videoId}_${Date.now()}.${format.container}`;
      const filepath = path.join(this.tempDir, filename);

      return new Promise((resolve, reject) => {
        const stream = ytdl(videoId, { format: format });
        const writeStream = fs.createWriteStream(filepath);

        stream.pipe(writeStream);

        stream.on('progress', (chunkLength, downloaded, total) => {
          const percent = (downloaded / total * 100).toFixed(2);
          console.log(`Downloaded ${percent}% (${downloaded}/${total})`);
        });

        stream.on('end', () => {
          resolve({
            filepath,
            filename,
            size: fs.statSync(filepath).size,
            format: format.container
          });
        });

        stream.on('error', reject);
        writeStream.on('error', reject);
      });
    } catch (error) {
      console.error('YouTube download error:', error);
      throw error;
    }
  }

  // Get video metadata using FFmpeg
  async getVideoMetadata(filepath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filepath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

        resolve({
          duration: parseFloat(metadata.format.duration),
          fileSize: parseInt(metadata.format.size),
          format: metadata.format.format_name,
          bitrate: parseInt(metadata.format.bit_rate),
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: eval(videoStream.r_frame_rate),
            bitrate: videoStream.bit_rate
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels,
            bitrate: audioStream.bit_rate
          } : null
        });
      });
    });
  }

  // Generate video thumbnail
  async generateThumbnail(videoPath, outputPath, timestamp = '00:00:01') {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .size('320x240')
        .format('png')
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', reject)
        .save(outputPath);
    });
  }

  // Convert video to standard format
  async convertVideo(inputPath, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);

      // Set video codec
      if (options.videoCodec) {
        command = command.videoCodec(options.videoCodec);
      }

      // Set audio codec
      if (options.audioCodec) {
        command = command.audioCodec(options.audioCodec);
      }

      // Set resolution
      if (options.resolution) {
        command = command.size(options.resolution);
      }

      // Set bitrate
      if (options.videoBitrate) {
        command = command.videoBitrate(options.videoBitrate);
      }

      if (options.audioBitrate) {
        command = command.audioBitrate(options.audioBitrate);
      }

      // Set format
      if (options.format) {
        command = command.format(options.format);
      }

      command
        .on('progress', (progress) => {
          console.log(`Converting: ${progress.percent}% done`);
        })
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', reject)
        .save(outputPath);
    });
  }

  // Compress video
  async compressVideo(inputPath, outputPath, quality = 'medium') {
    const qualitySettings = {
      low: {
        videoBitrate: '500k',
        audioBitrate: '64k',
        resolution: '480x360'
      },
      medium: {
        videoBitrate: '1000k',
        audioBitrate: '128k',
        resolution: '720x480'
      },
      high: {
        videoBitrate: '2000k',
        audioBitrate: '192k',
        resolution: '1280x720'
      }
    };

    const settings = qualitySettings[quality] || qualitySettings.medium;

    return this.convertVideo(inputPath, outputPath, {
      videoCodec: 'libx264',
      audioCodec: 'aac',
      ...settings,
      format: 'mp4'
    });
  }

  // Extract audio from video
  async extractAudio(videoPath, outputPath, format = 'mp3') {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .format(format)
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', reject)
        .save(outputPath);
    });
  }

  // Validate video file
  async validateVideoFile(filepath) {
    try {
      const stats = fs.statSync(filepath);
      const metadata = await this.getVideoMetadata(filepath);

      // Check file size (max 100MB for free users)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (stats.size > maxSize) {
        throw new Error('File size exceeds maximum limit (100MB)');
      }

      // Check duration (max 30 minutes for free users)
      const maxDuration = 30 * 60; // 30 minutes
      if (metadata.duration > maxDuration) {
        throw new Error('Video duration exceeds maximum limit (30 minutes)');
      }

      // Check if video has audio
      if (!metadata.audio) {
        throw new Error('Video must contain audio for transcription');
      }

      return {
        isValid: true,
        metadata,
        fileSize: stats.size
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  // Clean up temporary files
  async cleanupTempFiles(olderThan = 24 * 60 * 60 * 1000) { // 24 hours
    try {
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        const filepath = path.join(this.tempDir, file);
        const stats = fs.statSync(filepath);

        if (now - stats.mtime.getTime() > olderThan) {
          fs.unlinkSync(filepath);
          console.log(`Cleaned up temp file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  // Get video file info
  async getVideoFileInfo(filepath) {
    try {
      const stats = fs.statSync(filepath);
      const metadata = await this.getVideoMetadata(filepath);

      return {
        filename: path.basename(filepath),
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        ...metadata
      };
    } catch (error) {
      console.error('Get video info error:', error);
      throw error;
    }
  }

  // Process uploaded video
  async processUploadedVideo(file, userId) {
    try {
      const tempPath = file.path;
      const originalName = file.originalname;
      const fileExtension = path.extname(originalName);
      const filename = `${userId}_${Date.now()}${fileExtension}`;
      const finalPath = path.join(this.uploadsDir, filename);

      // Move file to uploads directory
      fs.renameSync(tempPath, finalPath);

      // Validate video
      const validation = await this.validateVideoFile(finalPath);
      if (!validation.isValid) {
        fs.unlinkSync(finalPath);
        throw new Error(validation.error);
      }

      // Generate thumbnail
      const thumbnailPath = path.join(this.uploadsDir, `thumb_${filename}.png`);
      await this.generateThumbnail(finalPath, thumbnailPath);

      // Get video info
      const videoInfo = await this.getVideoFileInfo(finalPath);

      return {
        filepath: finalPath,
        filename,
        thumbnailPath,
        originalName,
        ...videoInfo,
        ...validation.metadata
      };
    } catch (error) {
      console.error('Process video error:', error);
      throw error;
    }
  }

  // Get supported video formats
  getSupportedFormats() {
    return [
      'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v', '3gp', 'ogv'
    ];
  }
}

module.exports = new VideoService();