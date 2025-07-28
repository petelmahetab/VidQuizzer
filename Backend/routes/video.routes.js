import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { body, param, query, validationResult } from 'express-validator';
import Video from '../models/Video.js';
import User from '../models/User.js';
import TranscriptionService from '../services/transcription.service.js';
import AIService from '../services/ai.service.js';
import authMiddleware from '../middleware/auth.middleware.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set FFmpeg path with fallback to system FFmpeg
try {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  console.log('Using ffmpeg-installer path:', ffmpegInstaller.path);
} catch (error) {
  console.warn('Failed to set ffmpeg-installer path, falling back to system ffmpeg:', error.message);
  ffmpeg.setFfmpegPath('ffmpeg');
}

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.normalize(path.resolve(__dirname, '..', 'uploads', 'videos'));
    console.log('Multer destination:', uploadDir);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Created upload directory:', uploadDir);
    }
    // Verify write permissions
    fs.access(uploadDir, fs.constants.W_OK, (err) => {
      if (err) {
        console.error('No write permission for upload directory:', err);
        return cb(new Error('No write permission for upload directory'));
      }
      cb(null, uploadDir);
    });
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
    console.log('Generated filename:', filename);
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|wmv|flv|webm|mkv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    console.error('Invalid file type:', file.originalname);
    cb(new Error('Only video files are allowed'));
  },
});

// Validation middleware
const validateVideo = [
  body('title').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  body('isPublic').optional().isBoolean().withMessage('isPublic must be a boolean'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('tags.*').optional().trim().isLength({ max: 50 }).withMessage('Each tag must not exceed 50 characters'),
];

const { authenticateToken, checkVideoLimit } = authMiddleware;

// Get all videos
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be 1-100'),
  query('search').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { page = 1, limit = 10, search = '' } = req.query;
    const query = {
      user: req.user._id,
      $or: [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ],
    };

    const videos = await Video.find(query)
      .select('-transcript.timestamped')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Video.countDocuments(query);

    res.json({
      success: true,
      data: videos,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching videos',
      error: error.message,
    });
  }
});

// Get video by ID
router.get('/:id', authenticateToken, [
  param('id').isMongoId().withMessage('Invalid video ID'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    res.json({ success: true, data: video });
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching video',
      error: error.message,
    });
  }
});

// Upload new video
router.post('/', authenticateToken, checkVideoLimit, upload.single('video'), validateVideo, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file provided' });
    }

    const { title = 'Untitled Video', description = '', isPublic = false, tags = [] } = req.body;
    const videoPath = path.normalize(req.file.path);
    console.log('Uploaded video path:', videoPath);

    // Verify video file exists
    if (!fs.existsSync(videoPath)) {
      return res.status(400).json({ success: false, message: 'Uploaded video file not found' });
    }

    // Generate thumbnail
    const thumbnailDir = path.normalize(path.resolve(__dirname, '..', 'uploads', 'thumbnails'));
    console.log('Thumbnail directory:', thumbnailDir);
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
      console.log('Created thumbnail directory:', thumbnailDir);
    }
    const thumbnailPath = path.join(thumbnailDir, `thumbnail-${Date.now()}.jpg`);
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          count: 1,
          folder: thumbnailDir,
          filename: path.basename(thumbnailPath),
          size: '320x240',
        })
        .on('start', (commandLine) => {
          console.log('FFmpeg thumbnail command:', commandLine);
        })
        .on('end', () => {
          console.log('Thumbnail generated:', thumbnailPath);
          resolve();
        })
        .on('error', (err) => {
          console.error('Thumbnail generation error:', err);
          reject(err);
        });
    });

    // Get video metadata
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, data) => {
        if (err) {
          console.error('FFprobe error:', err);
          return reject(err);
        }
        console.log('FFprobe metadata:', data);
        resolve(data);
      });
    });

    const newVideo = new Video({
      user: req.user._id,
      title,
      description,
      filePath: videoPath,
      fileSize: req.file.size,
      thumbnail: thumbnailPath,
      isPublic,
      tags,
      duration: metadata.format.duration,
      metadata: {
        format: metadata.format.format_name,
        codec: metadata.streams[0]?.codec_name,
        bitrate: metadata.format.bit_rate,
        resolution: `${metadata.streams[0]?.width}x${metadata.streams[0]?.height}`,
        fps: eval(metadata.streams[0]?.r_frame_rate),
        uploadedAt: new Date(),
      },
      status: 'uploading',
    });

    await newVideo.save();
    console.log('Video saved to MongoDB:', newVideo._id);

    // Update user video count
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 'usage.videosProcessed': 1 },
    });

    // Trigger transcription and summarization
    (async () => {
      try {
        console.log('Starting transcription for video:', newVideo._id);
        const transcription = await TranscriptionService.transcribeVideo(newVideo.filePath);
        console.log('Transcription completed:', transcription.text.substring(0, 100) + '...');
        await Video.findByIdAndUpdate(newVideo._id, {
          status: 'processing',
          processingStage: 'summarization',
          transcript: {
            text: transcription.text,
            timestamped: transcription.timestamped,
            language: transcription.language,
          },
        });

        console.log('Starting summarization for video:', newVideo._id);
        const summary = await AIService.generateSummary(transcription.text);
        console.log('Summarization completed:', summary.content.substring(0, 100) + '...');
        await Video.findByIdAndUpdate(newVideo._id, {
          status: 'completed',
          processingStage: 'completed',
          transcript: { text: summary.content, language: transcription.language },
        });
      } catch (error) {
        console.error('Processing error for video', newVideo._id, ':', error);
        await Video.findByIdAndUpdate(newVideo._id, {
          status: 'failed',
          processingStage: 'failed',
          error: error.message,
        });
      }
    })();

    res.status(201).json({
      success: true,
      message: 'Video uploaded successfully',
      data: newVideo,
    });
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log('Cleaned up video file:', req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Error uploading video',
      error: error.message,
    });
  }
});

// Update video
router.put('/:id', authenticateToken, [
  param('id').isMongoId().withMessage('Invalid video ID'),
  ...validateVideo,
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { title, description, isPublic, tags } = req.body;
    if (!title && !description && isPublic === undefined && !tags) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (title, description, isPublic, or tags) is required',
      });
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    if (tags) updateData.tags = tags;

    const video = await Video.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    res.json({
      success: true,
      message: 'Video updated successfully',
      data: video,
    });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating video',
      error: error.message,
    });
  }
});

// Delete video
router.delete('/:id', authenticateToken, [
  param('id').isMongoId().withMessage('Invalid video ID'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const video = await Video.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    // Delete video and thumbnail files
    if (video.filePath && fs.existsSync(video.filePath)) {
      fs.unlinkSync(video.filePath);
      console.log(`File deleted: ${video.filePath}`);
    }
    if (video.thumbnail && fs.existsSync(video.thumbnail)) {
      fs.unlinkSync(video.thumbnail);
      console.log(`Thumbnail deleted: ${video.thumbnail}`);
    }

    res.json({
      success: true,
      message: 'Video deleted successfully',
      data: { deletedId: req.params.id, deletedAt: new Date() },
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting video',
      error: error.message,
    });
  }
});

// Get video stream
router.get('/:id/stream', authenticateToken, [
  param('id').isMongoId().withMessage('Invalid video ID'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!video || !video.filePath) {
      return res.status(404).json({ success: false, message: 'Video file not found' });
    }

    const videoPath = path.normalize(video.filePath);
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ success: false, message: 'Video file not found on server' });
    }

    await Video.findByIdAndUpdate(video._id, { $inc: { views: 1 } });

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });

      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };

      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).json({
      success: false,
      message: 'Error streaming video',
      error: error.message,
    });
  }
});

// Get video metadata
router.get('/:id/metadata', authenticateToken, [
  param('id').isMongoId().withMessage('Invalid video ID'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id })
      .select('metadata duration fileSize')
      .lean();
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    res.json({ success: true, data: { ...video.metadata, duration: video.duration, fileSize: video.fileSize } });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching video metadata',
      error: error.message,
    });
  }
});

// Get video thumbnail
router.get('/:id/thumbnail', authenticateToken, [
  param('id').isMongoId().withMessage('Invalid video ID'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id })
      .select('thumbnail')
      .lean();
    if (!video || !video.thumbnail) {
      return res.status(404).json({ success: false, message: 'Thumbnail not found' });
    }

    const thumbnailPath = path.normalize(video.thumbnail);
    if (!fs.existsSync(thumbnailPath)) {
      return res.status(404).json({ success: false, message: 'Thumbnail file not found' });
    }

    res.sendFile(thumbnailPath);
  } catch (error) {
    console.error('Thumbnail error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching thumbnail',
      error: error.message,
    });
  }
});

// Get video summary
router.get('/:id/summary', authenticateToken, [
  param('id').isMongoId().withMessage('Invalid video ID'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id })
      .select('transcript status processingStage')
      .lean();
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    if (video.status !== 'completed') {
      return res.status(202).json({
        success: true,
        message: 'Summary is still being processed',
        data: { status: video.status, processingStage: video.processingStage },
      });
    }

    res.json({
      success: true,
      data: {
        summary: video.transcript.text,
        language: video.transcript.language,
      },
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching video summary',
      error: error.message,
    });
  }
});

export default router;