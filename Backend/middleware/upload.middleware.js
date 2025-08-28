import multer from "multer";
import fs from 'fs'
import path from 'path'
// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `video-${uniqueSuffix}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'video/mp4',
    'video/avi',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/x-matroska',
    'video/x-flv',
    'video/3gpp',
    'video/ogg'
  ];
  
  const allowedExtensions = [
    '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.3gp', '.ogv'
  ];
  
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only video files are allowed.'), false);
  }
};

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1
  }
});

// Upload single video file
const uploadVideo = upload.single('video');

// Upload middleware with error handling
const uploadVideoMiddleware = (req, res, next) => {
  uploadVideo(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 100MB.'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: 'Too many files. Only one file allowed.'
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field. Use "video" field name.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Upload error: ' + err.message
      });
    }
    
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
    }

    next();
  });
};

// Clean up uploaded file on error
const cleanupOnError = (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function(data) {
    if (res.statusCode >= 400 && req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (error) {
        console.error('Error cleaning up file:', error);
      }
    }
    originalSend.call(this, data);
  };

  res.json = function(data) {
    if (res.statusCode >= 400 && req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (error) {
        console.error('Error cleaning up file:', error);
      }
    }
    originalJson.call(this, data);
  };

  next();
};

// Validate uploaded file
const validateUploadedFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  const file = req.file;
  const allowedExtensions = [
    '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.3gp', '.ogv'
  ];

  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    // Clean up invalid file
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.error('Error cleaning up invalid file:', error);
    }
    
    return res.status(400).json({
      success: false,
      message: 'Invalid file extension. Only video files are allowed.'
    });
  }

  // Check file size (double check)
  if (file.size > 100 * 1024 * 1024) {
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.error('Error cleaning up oversized file:', error);
    }
    
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 100MB.'
    });
  }

  // Add file info to request
  req.fileInfo = {
    originalName: file.originalname,
    filename: file.filename,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype,
    extension: fileExtension
  };

  next();
};

// Get file info helper
const getFileInfo = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      exists: true
    };
  } catch (error) {
    return {
      exists: false,
      error: error.message
    };
  }
};

// Delete file helper
const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
};

// Clean up old files (older than 24 hours)
const cleanupOldFiles = () => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      console.error('Error reading uploads directory:', err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('Error getting file stats:', err);
          return;
        }

        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error('Error deleting old file:', err);
            } else {
              console.log(`Deleted old file: ${file}`);
            }
          });
        }
      });
    });
  });
};

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

module.exports = {
  uploadVideoMiddleware,
  cleanupOnError,
  validateUploadedFile,
  getFileInfo,
  deleteFile,
  cleanupOldFiles
};