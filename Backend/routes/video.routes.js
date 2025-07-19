console.log('1. Starting video routes file');

import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

console.log('2. Router created');

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '..', '..', 'uploads', 'videos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|wmv|flv|webm|mkv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
});

// Get all videos
router.get('/', async (req, res) => {
  // try {
  //   const page = parseInt(req.query.page) || 1;
  //   const limit = parseInt(req.query.limit) || 10;
  //   const search = req.query.search || '';
    
  //   // Mock data - replace with your database logic
  //   const mockVideos = [
  //     {
  //       id: 1,
  //       title: 'Sample Video 1',
  //       description: 'This is a sample video description',
  //       filename: 'sample-video-1.mp4',
  //       duration: 120,
  //       size: 15728640,
  //       uploadDate: new Date(),
  //       status: 'processed'
  //     },
  //     {
  //       id: 2,
  //       title: 'Sample Video 2',
  //       description: 'Another sample video',
  //       filename: 'sample-video-2.mp4',
  //       duration: 180,
  //       size: 25728640,
  //       uploadDate: new Date(),
  //       status: 'processing'
  //     }
  //   ];
    
  //   const filteredVideos = mockVideos.filter(video => 
  //     video.title.toLowerCase().includes(search.toLowerCase()) ||
  //     video.description.toLowerCase().includes(search.toLowerCase())
  //   );
    
  //   const startIndex = (page - 1) * limit;
  //   const endIndex = startIndex + limit;
  //   const paginatedVideos = filteredVideos.slice(startIndex, endIndex);
    
  //   res.json({
  //     success: true,
  //     data: paginatedVideos,
  //     pagination: {
  //       page,
  //       limit,
  //       total: filteredVideos.length,
  //       totalPages: Math.ceil(filteredVideos.length / limit)
  //     }
  //   });
  // } catch (error) {
  //   res.status(500).json({
  //     success: false,
  //     message: 'Error fetching videos',
  //     error: error.message
  //   });
  // }

  res.json({ 
    success: true,
    message: 'Video routes working - minimal version' 
  });
});

// // Get video by ID
// router.get('/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
    
//     // Mock data - replace with your database logic
//     const mockVideo = {
//       id: parseInt(id),
//       title: `Sample Video ${id}`,
//       description: 'This is a sample video description',
//       filename: `sample-video-${id}.mp4`,
//       duration: 120,
//       size: 15728640,
//       uploadDate: new Date(),
//       status: 'processed',
//       metadata: {
//         resolution: '1920x1080',
//         fps: 30,
//         codec: 'H.264',
//         bitrate: '2000kbps'
//       }
//     };
    
//     if (!mockVideo) {
//       return res.status(404).json({
//         success: false,
//         message: 'Video not found'
//       });
//     }
    
//     res.json({
//       success: true,
//       data: mockVideo
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error fetching video',
//       error: error.message
//     });
//   }
// });

// // Upload new video
// router.post('/', upload.single('video'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: 'No video file provided'
//       });
//     }
    
//     const { title, description } = req.body;
    
//     // Mock video creation - replace with your database logic
//     const newVideo = {
//       id: Date.now(),
//       title: title || 'Untitled Video',
//       description: description || '',
//       filename: req.file.filename,
//       originalName: req.file.originalname,
//       size: req.file.size,
//       uploadDate: new Date(),
//       status: 'processing',
//       path: req.file.path
//     };
    
//     res.status(201).json({
//       success: true,
//       message: 'Video uploaded successfully',
//       data: newVideo
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error uploading video',
//       error: error.message
//     });
//   }
// });

// // Update video
// router.put('/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { title, description } = req.body;
    
//     // Mock update logic - replace with your database logic
//     const updatedVideo = {
//       id: parseInt(id),
//       title: title || `Sample Video ${id}`,
//       description: description || 'Updated description',
//       filename: `sample-video-${id}.mp4`,
//       duration: 120,
//       size: 15728640,
//       uploadDate: new Date(),
//       status: 'processed',
//       updatedAt: new Date()
//     };
    
//     res.json({
//       success: true,
//       message: 'Video updated successfully',
//       data: updatedVideo
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error updating video',
//       error: error.message
//     });
//   }
// });

// // Delete video
// router.delete('/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
    
//     // Mock deletion logic - replace with your database logic
//     // Also delete the actual file from filesystem
//     const videoPath = path.join(__dirname, '../../uploads/videos', `sample-video-${id}.mp4`);
    
//     if (fs.existsSync(videoPath)) {
//       fs.unlinkSync(videoPath);
//     }
    
//     res.json({
//       success: true,
//       message: 'Video deleted successfully'
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error deleting video',
//       error: error.message
//     });
//   }
// });

// // Get video stream
// router.get('/:id/stream', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const videoPath = path.join(__dirname, '../../uploads/videos', `sample-video-${id}.mp4`);
    
//     if (!fs.existsSync(videoPath)) {
//       return res.status(404).json({
//         success: false,
//         message: 'Video file not found'
//       });
//     }
    
//     const stat = fs.statSync(videoPath);
//     const fileSize = stat.size;
//     const range = req.headers.range;
    
//     if (range) {
//       const parts = range.replace(/bytes=/, '').split('-');
//       const start = parseInt(parts[0], 10);
//       const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
//       const chunksize = (end - start) + 1;
//       const file = fs.createReadStream(videoPath, { start, end });
//       const head = {
//         'Content-Range': `bytes ${start}-${end}/${fileSize}`,
//         'Accept-Ranges': 'bytes',
//         'Content-Length': chunksize,
//         'Content-Type': 'video/mp4',
//       };
//       res.writeHead(206, head);
//       file.pipe(res);
//     } else {
//       const head = {
//         'Content-Length': fileSize,
//         'Content-Type': 'video/mp4',
//       };
//       res.writeHead(200, head);
//       fs.createReadStream(videoPath).pipe(res);
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error streaming video',
//       error: error.message
//     });
//   }
// });

export default router;