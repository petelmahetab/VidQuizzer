import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = [
    path.join(__dirname, '../../uploads/videos'),
    path.join(__dirname, '../../Uploads/images'),
    path.join(__dirname, '../../Uploads/documents'),
    path.join(__dirname, '../../Uploads/temp')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Initialize upload directories
ensureUploadDirs();

// Configure multer for different file types
const createStorage = (subDir) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, `../../Uploads/${subDir}`);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
  });
};

// File type validators
const videoFileFilter = (req, file, cb) => {
  const allowedTypes = /mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|ogv/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('video/');
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only video files are allowed'));
  }
};

const imageFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|bmp|svg/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('image/');
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
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
    'application/vnd.oasis.opendocument.text'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype) && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only document files are allowed (PDF, DOC, DOCX, TXT, RTF, ODT)'));
  }
};

// Multer configurations
const videoUpload = multer({
  storage: createStorage('videos'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: videoFileFilter
});

const imageUpload = multer({
  storage: createStorage('images'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: imageFileFilter
});

const documentUpload = multer({
  storage: createStorage('documents'),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: documentFileFilter
});

const anyUpload = multer({
  storage: createStorage('temp'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

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

// Upload video files
router.post('/', videoUpload.single('video'), async (req, res) => {

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
    }
    
    const fileHash = await calculateFileHash(req.file.path);
    
    const uploadResult = {
      id: Date.now(),
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      hash: fileHash,
      uploadDate: new Date(),
      type: 'video',
      metadata: {
        extension: path.extname(req.file.originalname),
        sizeFormatted: formatFileSize(req.file.size)
      }
    };
    
    res.json({
      success: true,
      message: 'Video uploaded successfully',
      data: uploadResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading video',
      error: error.message
    });
  }
});

// Upload image files
router.post('/image', imageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }
    
    const fileHash = await calculateFileHash(req.file.path);
    
    const uploadResult = {
      id: Date.now(),
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      hash: fileHash,
      uploadDate: new Date(),
      type: 'image',
      metadata: {
        extension: path.extname(req.file.originalname),
        sizeFormatted: formatFileSize(req.file.size)
      }
    };
    
    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: uploadResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading image',
      error: error.message
    });
  }
});

// Upload document files
router.post('/document', documentUpload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No document file provided'
      });
    }
    
    const fileHash = await calculateFileHash(req.file.path);
    
    const uploadResult = {
      id: Date.now(),
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      hash: fileHash,
      uploadDate: new Date(),
      type: 'document',
      metadata: {
        extension: path.extname(req.file.originalname),
        sizeFormatted: formatFileSize(req.file.size)
      }
    };
    
    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: uploadResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading document',
      error: error.message
    });
  }
});

// Upload any file type (temp storage)
router.post('/any', anyUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }
    
    const fileHash = await calculateFileHash(req.file.path);
    
    const uploadResult = {
      id: Date.now(),
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      hash: fileHash,
      uploadDate: new Date(),
      type: 'file',
      metadata: {
        extension: path.extname(req.file.originalname),
        sizeFormatted: formatFileSize(req.file.size)
      }
    };
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: uploadResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: error.message
    });
  }
});

export default router;