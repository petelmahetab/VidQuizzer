// src/routes/ai.routes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import axios from 'axios';
import sanitizeHtml from 'sanitize-html';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import models from '../models/index.js';

dotenv.config();

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).catch(err => console.error('MongoDB connection error:', err));

// Configure Multer
const upload = multer({
  dest: 'temp/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|mov|avi|mkv/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Only MP4, MOV, AVI, MKV allowed.'));
  },
});

// Custom Error Class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    Error.captureStackTrace(this, this.constructor);
  }
}

// AI Video Analysis
router.post('/analyze', upload.single('video'), async (req, res) => {
  try {
    const { analysisType, options } = req.body;
    if (!req.file) throw new AppError('No video file provided for analysis', 400);

    const videoId = sanitizeHtml(req.body.videoId);
    if (!videoId) throw new AppError('Video ID is required', 400);

    const analysis = new models.Analysis({
      videoId,
      analysisType: sanitizeHtml(analysisType || 'general'),
      status: 'processing',
      processedAt: new Date(),
      results: {
        objects: ['person', 'car', 'building'], // Mock; replace with real AI service
        emotions: ['happy', 'neutral'],
        scenes: ['outdoor', 'daytime'],
        confidence: 0.89,
        duration: 120,
        frames: 3600,
      },
      processingTime: 45.2,
    });

    await analysis.save();

    // Mock AI processing (replace with real AI service)
    // Cleanup temporary file
    await fs.unlink(req.file.path).catch(err => console.error('File cleanup error:', err));

    res.json({
      success: true,
      message: 'AI analysis initiated',
      data: analysis,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error processing AI analysis',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

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

// AI Video Enhancement
router.post('/enhance', async (req, res) => {
  try {
    const { videoId, enhancementType, settings } = req.body;
    if (!videoId) throw new AppError('Video ID is required', 400);

    const enhancement = new models.Enhancement({
      videoId: sanitizeHtml(videoId),
      enhancementType: sanitizeHtml(enhancementType || 'quality'),
      status: 'processing',
      settings: settings || {
        upscale: true,
        denoise: true,
        sharpen: 0.5,
        brightness: 0.1,
        contrast: 0.05,
      },
      startedAt: new Date(),
      // Mock results; replace with real AI service
      results: {
        originalSize: 15728640,
        enhancedSize: 23592960,
        qualityImprovement: 0.34,
        outputPath: `/uploads/enhanced/enhanced-video-${videoId}.mp4`,
      },
      processingTime: 178.5,
      completedAt: new Date(),
    });

    await enhancement.save();

    res.json({
      success: true,
      message: 'Video enhancement initiated',
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
router.post('/transcribe', async (req, res) => {
  try {
    const { videoId, language, includeTimestamps } = req.body;
    if (!videoId) throw new AppError('Video ID is required', 400);

    const transcription = new models.Transcription({
      videoId: sanitizeHtml(videoId),
      language: sanitizeHtml(language || 'en'),
      includeTimestamps: includeTimestamps || false,
      status: 'processing',
      startedAt: new Date(),
      // Mock results; replace with real AI service
      results: {
        text: "Hello everyone, welcome to this video tutorial. Today we'll be discussing the latest features in our application. Let's start by exploring the main dashboard.",
        segments: [
          { start: 0.0, end: 3.2, text: "Hello everyone, welcome to this video tutorial.", confidence: 0.96 },
          { start: 3.2, end: 7.8, text: "Today we'll be discussing the latest features in our application.", confidence: 0.94 },
          { start: 7.8, end: 11.5, text: "Let's start by exploring the main dashboard.", confidence: 0.92 },
        ],
        wordCount: 23,
        avgConfidence: 0.94,
        detectedLanguage: 'en',
      },
      processedAt: new Date(),
      processingTime: 42.1,
    });

    await transcription.save();

    res.json({
      success: true,
      message: 'Video transcription initiated',
      data: transcription,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error initiating video transcription',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Get Transcription Results
router.get('/transcription/:id', async (req, res) => {
  try {
    const { id } = req.params;
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

// AI Video Summarization
router.post('/summarize', async (req, res) => {
  try {
    const { videoId, summaryType, maxLength } = req.body;
    if (!videoId) throw new AppError('Video ID is required', 400);

    const transcription = await models.Transcription.findOne({ videoId, status: 'completed' });
    if (!transcription) throw new AppError('Transcription not found for summarization', 400);

    const summary = new models.Summary({
      videoId: sanitizeHtml(videoId),
      summaryType: sanitizeHtml(summaryType || 'brief'),
      maxLength: maxLength || 200,
      status: 'processing',
      startedAt: new Date(),
    });

    await summary.save();

    // Call Gemini API
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent',
      {
        contents: [
          {
            parts: [
              {
                text: `Summarize the following text in a ${summaryType} format, keeping it under ${maxLength} words: ${transcription.results.text}`,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data.candidates || !response.data.candidates[0].content) {
      throw new AppError('Gemini API failed to return a valid response', 500);
    }

    const summaryText = response.data.candidates[0].content.parts[0].text;
    const results = {
      summary: summaryText,
      keyPoints: summaryText.split('. ').map(s => s.trim()).filter(s => s),
      topics: [],
      sentiment: 'neutral',
      duration: transcription.results.segments[transcription.results.segments.length - 1].end,
      wordCount: summaryText.split(' ').length,
    };

    await models.Summary.updateOne(
      { _id: summary._id },
      { status: 'completed', results, processingTime: 28.3, processedAt: new Date() }
    );

    const updatedSummary = await models.Summary.findById(summary._id);

    res.json({
      success: true,
      message: 'Video summarization initiated',
      data: updatedSummary,
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
    const summary = await models.Summary.findById(id);
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

    const [analyses, enhancements, transcriptions, summaries] = await Promise.all([
      models.Analysis.find({ videoId }),
      models.Enhancement.find({ videoId }),
      models.Transcription.find({ videoId }),
      models.Summary.find({ videoId }),
    ]);

    const jobs = [
      ...analyses.map(a => ({
        id: a._id,
        type: 'analysis',
        status: a.status,
        createdAt: a.processedAt,
        completedAt: a.processedAt,
      })),
      ...enhancements.map(e => ({
        id: e._id,
        type: 'enhancement',
        status: e.status,
        createdAt: e.startedAt,
        completedAt: e.completedAt,
      })),
      ...transcriptions.map(t => ({
        id: t._id,
        type: 'transcription',
        status: t.status,
        createdAt: t.startedAt,
        completedAt: t.processedAt,
      })),
      ...summaries.map(s => ({
        id: s._id,
        type: 'summary',
        status: s.status,
        createdAt: s.startedAt,
        completedAt: s.processedAt,
      })),
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