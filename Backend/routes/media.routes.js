import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { body, param, query, validationResult } from 'express-validator';
import cloudinary from 'cloudinary';
import Video from '../models/Video.js';
import Image from '../models/Image.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import TranscriptionService from '../services/transcription.service.js';
import AIService from '../services/ai.service.js';
import authMiddleware from '../middleware/auth.middleware.js';
import ffmpeg from 'fluent-ffmpeg';
import { execSync } from 'child_process';
import { addVideoJob } from '../Jobs/videoProcessor.js';


// Set FFmpeg and FFprobe paths to system binaries
ffmpeg.setFfmpegPath('ffmpeg'); // Assumes ffmpeg is in PATH
ffmpeg.setFfprobePath('ffprobe'); // Assumes ffprobe is in PATH

// Verify FFmpeg and FFprobe accessibility
try {
  const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8' });
  // console.log('FFmpeg version:', ffmpegVersion);
  const ffprobeVersion = execSync('ffprobe -version', { encoding: 'utf8' });
  // console.log('FFprobe version:', ffprobeVersion);
} catch (error) {
  // console.error('FFmpeg or FFprobe not accessible:', error.message);
  process.exit(1);
}
// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});



const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = [
    path.resolve(__dirname, '..', 'Uploads', 'videos'),
    path.resolve(__dirname, '..', 'Uploads', 'images'),
    path.resolve(__dirname, '..', 'Uploads', 'documents'),
    path.resolve(__dirname, '..', 'Uploads', 'thumbnails'),
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('Created directory:', dir);
    }
  });
};
ensureUploadDirs();

// media.routes.js (at the top, after imports)
const retryWithBackoff = async (fn, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      const backoffDelay = delay * Math.pow(2, i); // Exponential backoff: 1s, 2s, 4s
      console.warn(`Retry ${i + 1}/${retries} failed, retrying in ${backoffDelay}ms...`, error.message);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
};

// Multer storage configuration
const createStorage = (subDir) => multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'Uploads'), subDir);
    fs.mkdirSync(uploadDir, { recursive: true });
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
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `video-${uniqueSuffix}${path.extname(sanitizedFilename)}`);
  },
});

// File type filters
const videoFileFilter = (req, file, cb) => {
  const allowedTypes = /mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|ogv/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('video/');
  if (mimetype && extname) return cb(null, true);
  cb(new Error('Only video files are allowed'));
};

const imageFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|bmp|svg/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('image/');
  if (mimetype && extname) return cb(null, true);
  cb(new Error('Only image files are allowed'));
};

const documentFileFilter = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx|txt|rtf|odt/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
  ];
  if (allowedMimeTypes.includes(file.mimetype) && extname) return cb(null, true);
  cb(new Error('Only document files are allowed (PDF, DOC, DOCX, TXT, RTF, ODT)'));
};

// Multer configurations
const videoUpload = multer({
  storage: createStorage('videos'),
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|mov|avi|mkv/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype.split('/')[1]);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only video files (mp4, mov, avi, mkv) are allowed'));
  },
});

const imageUpload = multer({
  storage: createStorage('images'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: imageFileFilter,
});

const documentUpload = multer({
  storage: createStorage('documents'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: documentFileFilter,
});

// Validation middleware
const validateMedia = [
  body('title').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  body('isPublic').optional().isBoolean().withMessage('isPublic must be a boolean'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('tags.*').optional().trim().isLength({ max: 50 }).withMessage('Each tag must not exceed 50 characters'),
];

const validateId = [
  param('id').isMongoId().withMessage('Invalid ID'),
];

const { authenticateToken, checkVideoLimit } = authMiddleware;
const transcriptionService = new TranscriptionService();

// Helper function to format file size
const formatFileSize = (bytes) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

// Helper function to calculate file hash
const calculateFileHash = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
};

// Video Routes
router.get('/videos', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be 1-100'),
  query('search').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

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
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ success: false, message: 'Error fetching videos', error: error.message });
  }
});

router.get('/videos/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    res.json({ success: true, data: video });
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({ success: false, message: 'Error fetching video', error: error.message });
  }
});

router.post('/videos', authenticateToken, checkVideoLimit, videoUpload.array('video', 10), validateMedia, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No video files provided' });
    }

    const uploadResults = [];
    const transcriptionService = new TranscriptionService();

    for (const file of req.files) {
      let { title = 'Untitled Video', description = '', isPublic = false, tags = [] } = req.body;
      if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch (e) { tags = []; }
      } else if (!Array.isArray(tags)) { tags = []; }

      const filePath = path.normalize(file.path).replace(/\\/g, '/');
      console.log(`Processing file: ${filePath}`);

      // Verify file exists and is readable
      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
        const stats = await fs.promises.stat(filePath);
        if (stats.size === 0) {
          throw new Error('Uploaded file is empty');
        }
      } catch (err) {
        console.error(`File access error for ${file.originalname}:`, err);
        return res.status(400).json({ success: false, message: `File access error: ${file.originalname}` });
      }

      // Validate video file with ffprobe
      let metadata;
      try {
        metadata = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(filePath, (err, data) => {
            if (err) {
              console.error(`FFprobe error for ${filePath}:`, err.message);
              reject(err);
            } else {
              console.log(`FFprobe metadata:`, JSON.stringify(data, null, 2));
              resolve(data);
            }
          });
        });
      } catch (err) {
        console.error(`FFprobe failed for ${file.originalname}:`, err.message);
        return res.status(400).json({ success: false, message: `Invalid video file: ${file.originalname} (FFprobe failed: ${err.message})` });
      }

      // Ensure video and audio streams exist
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      if (!videoStream || !audioStream) {
        console.error(`Invalid streams in ${file.originalname}: video=${!!videoStream}, audio=${!!audioStream}`);
        return res.status(400).json({ success: false, message: `Invalid video file: ${file.originalname} (missing video or audio stream)` });
      }

      // Generate thumbnail locally
      const thumbnailDir = path.join(__dirname, '..', 'Uploads', 'thumbnails').replace(/\\/g, '/');
      const thumbnailPath = path.join(thumbnailDir, `thumbnail-${file.filename}.jpg`).replace(/\\/g, '/');
      let thumbnailUrl = null;
      try {
        await new Promise((resolve, reject) => {
          ffmpeg(filePath)
            .screenshots({ count: 1, folder: thumbnailDir, filename: path.basename(thumbnailPath), size: '320x240', timemarks: ['5'] })
            .on('end', () => {
              console.log(`Thumbnail generated: ${thumbnailPath}`);
              resolve();
            })
            .on('error', (err) => reject(new Error(`Thumbnail generation failed for ${file.originalname}: ${err.message}`)));
        });

        // Upload thumbnail to Cloudinary
        const thumbnailResult = await retryWithBackoff(() => cloudinary.v2.uploader.upload(thumbnailPath, {
          resource_type: 'image',
          folder: 'thumbnails',
        }));
        thumbnailUrl = thumbnailResult.secure_url;
        console.log(`Thumbnail uploaded to Cloudinary: ${thumbnailUrl}`);

        // Delete local thumbnail
        if (fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
          console.log(`Deleted local thumbnail: ${thumbnailPath}`);
        }
      } catch (err) {
        console.warn('Thumbnail generation/upload failed:', err.message);
        const defaultThumbnail = path.join(__dirname, '..', 'Uploads', 'thumbnails', 'default-thumbnail.jpg').replace(/\\/g, '/');
        thumbnailUrl = fs.existsSync(defaultThumbnail) ? defaultThumbnail : null;
      }

      const fileHash = await calculateFileHash(filePath).catch(() => null);

      // Safely calculate resolution and fps
      const resolution = videoStream && videoStream.width && videoStream.height
        ? `${videoStream.width}x${videoStream.height}`
        : 'unknown';
      let fps = 0;
      try {
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          fps = num && den ? num / den : 0;
        }
      } catch (err) {
        console.warn(`Failed to parse fps for ${file.originalname}:`, err.message);
      }

      const newVideo = new Video({
        user: req.user._id,
        title,
        description,
        filePath,
        fileSize: file.size,
        thumbnail: thumbnailUrl,
        isPublic,
        tags,
        duration: metadata.format.duration || 0,
        metadata: {
          format: metadata.format.format_name || 'unknown',
          codec: videoStream.codec_name || 'unknown',
          bitrate: metadata.format.bit_rate || 0,
          resolution,
          fps,
          uploadedAt: new Date(),
        },
        status: 'uploading',
      });

      await newVideo.save();
      console.log(`Video saved to MongoDB: ${newVideo._id}`);

      await User.findByIdAndUpdate(req.user._id, { $inc: { 'usage.videosProcessed': 1 } });

      // Process transcription
      let transcription;
      try {
        transcription = await retryWithBackoff(() => transcriptionService.transcribeVideo(filePath));
        console.log(`Transcription completed for ${file.originalname}:`, transcription.text.substring(0, 100) + '...');
        await Video.findByIdAndUpdate(newVideo._id, {
          status: 'processing',
          processingStage: 'summarization',
          transcript: {
            text: transcription.text || '',
            timestamped: transcription.timestamped || [],
            language: transcription.language || 'en',
            confidence: transcription.confidence || 0,
            speakers: transcription.speakers || [],
            chapters: transcription.chapters || [],
            entities: transcription.entities || [],
            sentiment: transcription.sentiment || [],
            highlights: transcription.highlights || [],
          },
        });
        // Log the updated document
        const updatedDoc = await Video.findById(newVideo._id);
        console.log(`MongoDB document after transcription:`, JSON.stringify(updatedDoc, null, 2));
      } catch (err) {
        console.error(`Transcription failed for ${file.originalname}:`, err);
        await Video.findByIdAndUpdate(newVideo._id, {
          status: 'failed',
          processingStage: 'transcription_failed',
          error: err.message,
        });
        return res.status(500).json({
          success: false,
          message: `Transcription failed for ${file.originalname}: ${err.message}`,
        });
      }

      // Generate summary
      let summary;
      try {
        summary = await retryWithBackoff(() => AIService.generateSummary(transcription.text, 'detailed', transcription.language));
        console.log(`Summary generated for ${file.originalname}:`, summary.content.substring(0, 100) + '...');
        await Video.findByIdAndUpdate(newVideo._id, {
          status: summary.error ? 'failed' : 'completed',
          processingStage: summary.error ? 'summarization_failed' : 'completed',
          summary: {
            text: summary.content || '',
            generatedAt: new Date(),
            model: summary.model || 'none',
          },
          error: summary.error || null,
        });
        // Log the final document
        const finalDoc = await Video.findById(newVideo._id);
        console.log(`MongoDB document after summarization:`, JSON.stringify(finalDoc, null, 2));
      } catch (err) {
        console.error(`Summary generation failed for ${file.originalname}:`, err);
        await Video.findByIdAndUpdate(newVideo._id, {
          status: 'failed',
          processingStage: 'summarization_failed',
          summary: {
            text: 'Summary generation failed due to API error.',
            generatedAt: new Date(),
            model: 'none',
          },
          error: err.message,
        });
        const finalDoc = await Video.findById(newVideo._id);
        console.log(`MongoDB document after failed summarization:`, JSON.stringify(finalDoc, null, 2));
        // Continue to include in response despite failure
      }

      uploadResults.push({
        id: newVideo._id,
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: filePath,
        thumbnail: thumbnailUrl,
        hash: fileHash,
        uploadDate: newVideo.createdAt,
        type: 'video',
        metadata: {
          extension: path.extname(file.originalname),
          sizeFormatted: formatFileSize(file.size),
          duration: newVideo.duration,
          resolution: newVideo.metadata.resolution || 'unknown',
        },
        transcript: transcription.text,
        summary: summary ? summary.content : 'Summary generation failed due to API error.',
      });
    }

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${uploadResults.length} video(s)`,
      data: uploadResults,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Error uploading videos', error: error.message });
  }
});

router.put('/videos/:id', authenticateToken, validateId, videoUpload.single('video'), validateMedia, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { title, description, isPublic, tags } = req.body;
    if (!title && !description && isPublic === undefined && !tags && !req.file) {
      return res.status(400).json({ success: false, message: 'At least one field is required' });
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (isPublic !== undefined) updateData.isPublic = isPublic === 'true';
    if (tags) updateData.tags = Array.isArray(tags) ? tags : [tags];
    if (req.file) updateData.filePath = req.file.path;

    const video = await Video.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: updateData },
      { new: true, runValidators: true }
    )

    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    res.json({ success: true, message: 'Video updated successfully', data: video });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ success: false, message: 'Error updating video', error: error.message });
  }
});

router.delete('/videos/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const video = await Video.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    if (video.filePath && fs.existsSync(video.filePath)) fs.unlinkSync(video.filePath);
    if (video.thumbnail && fs.existsSync(video.thumbnail)) fs.unlinkSync(video.thumbnail);

    res.json({ success: true, message: 'Video deleted successfully', data: { deletedId: req.params.id, deletedAt: new Date() } });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ success: false, message: 'Error deleting video', error: error.message });
  }
});

router.get('/videos/:id/stream', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!video || !video.filePath) return res.status(404).json({ success: false, message: 'Video file not found' });

    const videoPath = path.normalize(video.filePath);
    if (!fs.existsSync(videoPath)) return res.status(404).json({ success: false, message: 'Video file not found on server' });

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

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).json({ success: false, message: 'Error streaming video', error: error.message });
  }
});

router.get('/videos/:id/metadata', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id })
      .select('metadata duration fileSize')
      .lean();
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    res.json({ success: true, data: { ...video.metadata, duration: video.duration, fileSize: video.fileSize } });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ success: false, message: 'Error fetching video metadata', error: error.message });
  }
});

router.get('/videos/:id/thumbnail', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    let thumbnailPath = video.thumbnail ? path.normalize(video.thumbnail) : null;
    if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
      const filePath = path.normalize(video.filePath);
      if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Video file not found for thumbnail regeneration' });

      const thumbnailDir = path.resolve(__dirname, '..', 'Uploads', 'thumbnails');
      thumbnailPath = path.join(thumbnailDir, `thumbnail-${video._id}.jpg`);

      try {
        await new Promise((resolve, reject) => {
          ffmpeg(filePath)
            .screenshots({ count: 1, folder: thumbnailDir, filename: path.basename(thumbnailPath), size: '320x240', timemarks: ['5'] })
            .on('end', resolve)
            .on('error', (err) => reject(new Error(`Thumbnail regeneration failed: ${err.message}`)));
        });
        await Video.findByIdAndUpdate(req.params.id, { thumbnail: thumbnailPath });
      } catch (err) {
        console.warn('Thumbnail regeneration failed:', err.message);
        thumbnailPath = path.join(__dirname, '..', 'Uploads', 'thumbnails', 'default-thumbnail.jpg');
        if (!fs.existsSync(thumbnailPath)) return res.status(404).json({ success: false, message: 'Thumbnail not available' });
      }
    }

    res.sendFile(thumbnailPath);
  } catch (error) {
    console.error('Thumbnail fetch error:', error);
    res.status(500).json({ success: false, message: 'Error fetching thumbnail', error: error.message });
  }
});

router.get('/videos/:id/summary', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const video = await Video.findOne({ _id: req.params.id, user: req.user._id })
      .select('transcript status processingStage')
      .lean();
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    if (video.status !== 'completed') {
      return res.status(202).json({
        success: true,
        message: 'Summary is still being processed',
        data: { status: video.status, processingStage: video.processingStage },
      });
    }

    res.json({
      success: true,
      data: { summary: video.transcript.text, language: video.transcript.language },
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching video summary', error: error.message });
  }
});

// Image Routes
router.post('/images', authenticateToken, imageUpload.single('image'), validateMedia, async (req, res) => {
  let filePath; // Declare outside try block
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });

    let { title = 'Untitled Image', description = '', isPublic = false, tags = [] } = req.body;
    if (typeof tags === 'string') {
      try { tags = JSON.parse(tags); } catch (e) { tags = []; }
    } else if (!Array.isArray(tags)) { tags = []; }

    filePath = path.normalize(req.file.path);
    if (!fs.existsSync(filePath)) return res.status(400).json({ success: false, message: 'Uploaded file not found' });

    // Extract metadata first
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) {
          console.error('FFmpeg Error:', err.message, err.stack);
          reject(err);
        } else {
          console.log('FFmpeg Metadata:', JSON.stringify(data, null, 2));
          resolve(data);
        }
      });
    }).catch((err) => {
      console.error('FFmpeg Catch Error:', err.message, err.stack);
      return {
        format: { format_name: path.extname(req.file.originalname).slice(1) },
        streams: [{ codec_type: 'image', width: null, height: null }],
      };
    });

    // Validate image file
    if (!req.file.mimetype.startsWith('image/') || !metadata.streams.some(s => s.codec_type === 'image' || s.codec_type === 'video')) {
      throw new Error('Invalid image file: MIME type or stream not detected');
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.v2.uploader.upload(filePath, {
      resource_type: 'image',
      folder: 'images',
    });

    // Delete local file after upload
    if (fs.existsSync(filePath)) await fs.promises.unlink(filePath).catch(console.error);

    const fileHash = await calculateFileHash(filePath).catch(() => null); // Note: file may be deleted

    const newImage = new Image({
      user: req.user._id,
      title,
      description,
      cloudinaryUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileSize: req.file.size,
      isPublic,
      tags,
      metadata: {
        extension: path.extname(req.file.originalname),
        format: metadata.format.format_name,
        resolution: metadata.streams[0]?.width ? `${metadata.streams[0].width}x${metadata.streams[0].height}` : 'unknown',
        sizeFormatted: formatFileSize(req.file.size),
        uploadedAt: new Date(),
      },
      status: 'completed',
      processingStage: 'completed',
    });

    await newImage.save();
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'usage.imagesProcessed': 1 } });

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        id: newImage._id,
        originalName: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        cloudinaryUrl: newImage.cloudinaryUrl,
        publicId: newImage.publicId,
        hash: fileHash,
        uploadDate: newImage.createdAt,
        type: 'image',
        metadata: newImage.metadata,
        status: newImage.status,
        processingStage: newImage.processingStage,
      },
    });
  } catch (error) {
    console.error('Image upload error:', error);
    if (req.file && fs.existsSync(filePath)) await fs.promises.unlink(filePath).catch(console.error); // Use filePath from outer scope
    res.status(500).json({ success: false, message: 'Error uploading image', error: error.message });
  }
});

router.get('/images/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const image = await Image.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

    res.json({ success: true, data: image });
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ success: false, message: 'Error fetching image', error: error.message });
  }
});

router.get('/images/:id/file', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const image = await Image.findOne({ _id: req.params.id, user: req.user._id });
    if (!image) return res.status(404).json({ success: false, message: 'Image not found' });
    if (!image.cloudinaryUrl) return res.status(404).json({ success: false, message: 'Image file not found' });

    res.redirect(image.cloudinaryUrl);
  } catch (error) {
    console.error('Error serving image file:', error);
    res.status(500).json({ success: false, message: 'Error serving image file', error: error.message });
  }
});

// Document Routes
router.post('/documents', authenticateToken, documentUpload.single('document'), validateMedia, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    if (!req.file) return res.status(400).json({ success: false, message: 'No document file provided' });

    let { title = 'Untitled Document', description = '', isPublic = false, tags = [] } = req.body;
    if (typeof tags === 'string') {
      try { tags = JSON.parse(tags); } catch (e) { tags = []; }
    } else if (!Array.isArray(tags)) { tags = []; }

    const filePath = path.normalize(req.file.path);
    if (!fs.existsSync(filePath)) return res.status(400).json({ success: false, message: 'Uploaded file not found' });

    // Upload to Cloudinary with resource_type 'raw' for non-image/video files
    const uploadResult = await cloudinary.v2.uploader.upload(filePath, {
      resource_type: 'raw',
      folder: 'documents',
    });

    // Delete local file after upload
    if (fs.existsSync(filePath)) await fs.promises.unlink(filePath).catch(console.error);

    const fileHash = await calculateFileHash(filePath).catch(() => null); 

    const newDocument = new Document({
      user: req.user._id,
      title,
      description,
      cloudinaryUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileSize: req.file.size,
      isPublic,
      tags,
      metadata: {
        extension: path.extname(req.file.originalname),
        format: req.file.mimetype.split('/')[1] || 'unknown',
        sizeFormatted: formatFileSize(req.file.size),
        uploadedAt: new Date(),
      },
      status: 'completed',
      processingStage: 'completed',
    });

    await newDocument.save();
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'usage.documentsProcessed': 1 } });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        id: newDocument._id,
        originalName: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        cloudinaryUrl: newDocument.cloudinaryUrl,
        publicId: newDocument.publicId,
        hash: fileHash,
        uploadDate: newDocument.createdAt,
        type: 'document',
        metadata: newDocument.metadata,
        status: newDocument.status,
        processingStage: newDocument.processingStage,
      },
    });
  } catch (error) {
    console.error('Document upload error:', error);
    if (req.file && fs.existsSync(filePath)) await fs.promises.unlink(filePath).catch(console.error); // Fixed scope issue
    res.status(500).json({ success: false, message: 'Error uploading document', error: error.message });
  }
});

router.get('/documents/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const document = await Document.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    res.json({ success: true, data: document });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ success: false, message: 'Error fetching document', error: error.message });
  }
});

router.get('/documents/:id/file', authenticateToken, validateId, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const document = await Document.findOne({ _id: req.params.id, user: req.user._id });
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });
    if (!document.cloudinaryUrl) return res.status(404).json({ success: false, message: 'Document file not found' });

    res.redirect(document.cloudinaryUrl);
  } catch (error) {
    console.error('Error serving document file:', error);
    res.status(500).json({ success: false, message: 'Error serving document file', error: error.message });
  }
});

router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const documents = await Document.find({ user: req.user._id }).lean();
    res.json({ success: true, data: documents });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ success: false, message: 'Error fetching documents', error: error.message });
  }
});

export default router;