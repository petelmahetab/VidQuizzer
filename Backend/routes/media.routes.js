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
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set FFmpeg path with fallback
try {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  console.log('Using ffmpeg-installer path:', ffmpegInstaller.path);
} catch (error) {
  console.warn('Failed to set ffmpeg-installer path, falling back to system ffmpeg:', error.message);
  ffmpeg.setFfmpegPath('ffmpeg');
}

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// console.log('Loaded Config:', {
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

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
  limits: { fileSize: 1024 * 1024 * 1024 }, // 2GB
  fileFilter: videoFileFilter,
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
    for (const file of req.files) {
      let { title = 'Untitled Video', description = '', isPublic = false, tags = [] } = req.body;
      if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch (e) { tags = []; }
      } else if (!Array.isArray(tags)) { tags = []; }

      const filePath = path.normalize(file.path).replace(/\\/g, '/'); // Use forward slashes
      console.log(`Processing file: ${filePath}`); // Debug log
      if (!fs.existsSync(filePath)) {
        console.error(`File not found after upload: ${filePath}`);
        return res.status(400).json({ success: false, message: `Uploaded file ${file.originalname} not found` });
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
              console.log(`FFprobe metadata:`, JSON.stringify(data, null, 2)); // Debug log
              resolve(data);
            }
          });
        });
      } catch (err) {
        console.error(`FFprobe failed for ${file.originalname}:`, err.message);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(400).json({ success: false, message: `Invalid video file: ${file.originalname} (FFprobe failed)` });
      }

      // Ensure video stream exists
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        console.error(`No video stream found in ${file.originalname}`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(400).json({ success: false, message: `Invalid video file: ${file.originalname} (no video stream detected)` });
      }

      const thumbnailDir = path.join(__dirname, '..', 'Uploads', 'thumbnails').replace(/\\/g, '/');
      const thumbnailPath = path.join(thumbnailDir, `thumbnail-${file.filename}.jpg`).replace(/\\/g, '/');
      let finalThumbnailPath = thumbnailPath;
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
      } catch (err) {
        console.warn('Thumbnail generation failed:', err.message);
        const defaultThumbnail = path.join(__dirname, '..', 'Uploads', 'thumbnails', 'default-thumbnail.jpg').replace(/\\/g, '/');
        finalThumbnailPath = fs.existsSync(defaultThumbnail) ? defaultThumbnail : null;
      }

      const fileHash = await calculateFileHash(filePath);

      const newVideo = new Video({
        user: req.user._id,
        title,
        description,
        filePath,
        fileSize: file.size,
        thumbnail: finalThumbnailPath,
        isPublic,
        tags,
        duration: metadata.format.duration || 0,
        metadata: {
          format: metadata.format.format_name || 'unknown',
          codec: videoStream.codec_name || 'unknown',
          bitrate: metadata.format.bit_rate || 0,
          resolution: videoStream.width && videoStream.height ? `${videoStream.width}x${videoStream.height}` : 'unknown',
          fps: videoStream.r_frame_rate ? Number(eval(videoStream.r_frame_rate)) || 0 : 0,
          uploadedAt: new Date(),
        },
        status: 'uploading',
      });

      await newVideo.save();
      console.log(`Video saved to MongoDB: ${newVideo._id}`); // Debug log
      await User.findByIdAndUpdate(req.user._id, { $inc: { 'usage.videosProcessed': 1 } });

      // Queue transcription and summarization
      addVideoJob(newVideo._id, filePath);

      uploadResults.push({
        id: newVideo._id,
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: filePath,
        hash: fileHash,
        uploadDate: newVideo.createdAt,
        type: 'video',
        metadata: {
          extension: path.extname(file.originalname),
          sizeFormatted: formatFileSize(file.size),
          duration: newVideo.duration,
          resolution: newVideo.metadata.resolution,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${uploadResults.length} video(s)`,
      data: uploadResults,
    });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
    }
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