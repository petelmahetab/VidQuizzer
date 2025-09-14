import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import axios from 'axios';
import sanitizeHtml from 'sanitize-html';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { AssemblyAI } from 'assemblyai';
import models from '../models/Index.js';

dotenv.config();

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure MongoDB
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not defined in .env');
mongoose.connect(process.env.MONGODB_URI).catch(err => console.error('MongoDB connection error:', err));

// Configure Multer (keep for now, but we’ll handle file upload differently)
const upload = multer({
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  // 'temp/' since we’ll upload directly to AssemblyAI
});

// Configure AssemblyAI
if (!process.env.ASSEMBLYAI_API_KEY) throw new Error('ASSEMBLYAI_API_KEY is not defined in .env');
console.log('ASSEMBLYAI_API_KEY:', process.env.ASSEMBLYAI_API_KEY);
const assembly = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

// Custom Error Class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    Error.captureStackTrace(this, this.constructor);
  }
}

// AI Video Analysis (Placeholder, synchronous mock)
router.post(
  '/analyze',
  upload.single('video'),
  async (req, res) => {
    try {
      if (!req.file) throw new AppError('No video file provided for analysis', 400);

      const videoId = sanitizeHtml(req.body.videoId);
      if (!videoId) throw new AppError('Video ID is required', 400);

      const analysis = new models.Analysis({
        videoId,
        analysisType: sanitizeHtml(req.body.analysisType || 'general'),
        status: 'completed',
        processedAt: new Date(),
        results: { message: 'Analysis completed (mock)' },
      });
      await analysis.save();

      res.json({
        success: true,
        message: 'AI analysis completed',
        data: analysis,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Error processing AI analysis',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
);

// Get AI Analysis Results
router.get('/analysis/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const analysis = await models.Analysis.findById(id);
    if (!analysis) throw new AppError('Analysis not found', 404);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error fetching analysis results',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// AI Video Enhancement (Placeholder, synchronous mock)
router.post('/enhance', async (req, res) => {
  try {
    const { videoId, enhancementType, settings } = req.body;
    if (!videoId) throw new AppError('Video ID is required', 400);

    const enhancement = new models.Enhancement({
      videoId: sanitizeHtml(videoId),
      enhancementType: sanitizeHtml(enhancementType || 'quality'),
      status: 'completed',
      settings: settings || { upscale: true },
      results: { message: 'Enhancement completed (mock)' },
    });
    await enhancement.save();

    res.json({
      success: true,
      message: 'Video enhancement completed',
      data: enhancement,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error initiating video enhancement',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Get Enhancement Status
router.get('/enhancement/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const enhancement = await models.Enhancement.findById(id);
    if (!enhancement) throw new AppError('Enhancement not found', 404);

    res.json({
      success: true,
      data: enhancement,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error fetching enhancement status',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// AI Video Transcription
router.post('/transcribe', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No video file provided');

    console.log('Buffer length:', req.file.buffer.length);

    // Upload file to AssemblyAI
    const uploadUrl = await assembly.files.upload(req.file.buffer);
    console.log('Upload URL:', uploadUrl);

    if (!uploadUrl) throw new Error('Upload URL missing from AssemblyAI response');

    // Transcribe using the uploaded file URL
    const transcript = await assembly.transcripts.create({
      audio_url: uploadUrl,
      language_code: req.body.language || 'en'
    });

    // Save to MongoDB
    const savedTranscription = await models.Transcription.create({
      videoId: req.body.videoId || 'unknown', // optional, or pass from client
      language: req.body.language || 'en',
      status: transcript.status,
      results: transcript,
      processedAt: new Date(),
    });

    res.json({ success: true, transcript: savedTranscription });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Transcription Results
router.get('/transcription/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError('Invalid ID format', 400);
    }

    // Query by _id
    const transcription = await models.Transcription.findById(id);

    if (!transcription) throw new AppError('Transcription not found', 404);

    res.json({
      success: true,
      data: transcription,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error fetching transcription results',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});
// router.get('/transcription/:assemblyId', async (req, res) => {
//   try {
//     const { assemblyId } = req.params;

//     // Find by results.id
//     const transcription = await models.Transcription.findOne({ 'results.id': assemblyId });

//     if (!transcription) throw new AppError('Transcription not found', 404);

//     res.json({
//       success: true,
//       data: transcription,
//     });
//   } catch (error) {
//     res.status(error.statusCode || 500).json({
//       success: false,
//       message: error.message || 'Error fetching transcription results',
//       error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
//     });
//   }
// });


// AI Video Summarization

router.post('/summarize', async (req, res) => {
  try {
    const { videoId, userId, summaryType, maxLength } = req.body;
    if (!videoId || !userId) throw new AppError('Video ID and User ID are required', 400);

    if (!mongoose.isValidObjectId(videoId)) throw new AppError('Invalid Video ID', 400);
    if (!mongoose.isValidObjectId(userId)) throw new AppError('Invalid User ID', 400);

    const transcription = await models.Transcription.findOne({ videoId, status: 'completed' });
    if (!transcription) throw new AppError('Transcription not found for summarization', 400);

    const response = await axios.post(
      'https://api.assemblyai.com/v2/summarize',
      {
        text: transcription.results.text,
        summary_type: summaryType || 'brief',
        max_length: maxLength || 200,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const summaryText = response.data.summary;
    const summary = new models.Summary({
      video: videoId,
      user: userId,
      type: sanitizeHtml(summaryType || 'brief'),
      content: sanitizeHtml(summaryText),
      keyPoints: summaryText.split('. ').map((point, index) => ({
        point: sanitizeHtml(point.trim()),
        timestamp: transcription.results.segments[index]?.start || 0,
        importance: 3,
      })).filter(kp => kp.point),
      status: 'completed',
    });
    await summary.save();

    res.json({
      success: true,
      message: 'Video summarization completed',
      data: summary,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error initiating video summarization',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Get Summarization Results
router.get('/summary/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const summary = await models.Summary.findById(id).populate('video user');
    if (!summary) throw new AppError('Summary not found', 404);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error fetching summary results',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Get All AI Processing Jobs for a Video
router.get('/jobs/:videoId', async (req, res) => {
  try {
    const videoId = sanitizeHtml(req.params.videoId);
    if (!videoId) throw new AppError('Video ID is required', 400);
    if (!mongoose.isValidObjectId(videoId)) throw new AppError('Invalid Video ID', 400);

    const video = await models.Video.findOne({ videoId });
    if (!video) throw new AppError('Video not found', 404);

    const [analyses, enhancements, transcriptions, summaries] = await Promise.all([
      models.Analysis.find({ videoId }),
      models.Enhancement.find({ videoId }),
      models.Transcription.find({ videoId }),
      models.Summary.find({ video: video._id }),
    ]);

    const jobs = [
      ...analyses.map(a => ({ id: a._id, type: 'analysis', status: a.status, createdAt: a.processedAt || a.createdAt, completedAt: a.processedAt || a.updatedAt })),
      ...enhancements.map(e => ({ id: e._id, type: 'enhancement', status: e.status, createdAt: e.startedAt || e.createdAt, completedAt: e.completedAt || e.updatedAt })),
      ...transcriptions.map(t => ({ id: t._id, type: 'transcription', status: t.status, createdAt: t.startedAt || t.createdAt, completedAt: t.processedAt || t.updatedAt })),
      ...summaries.map(s => ({ id: s._id, type: 'summary', status: s.status, createdAt: s.createdAt, completedAt: s.updatedAt })),
    ];

    res.json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error fetching AI jobs',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

export default router;