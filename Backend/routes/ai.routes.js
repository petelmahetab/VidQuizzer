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
    if (!req.file) throw new AppError('No video file provided', 400);
    if (!mongoose.isValidObjectId(req.body.videoId)) {
      throw new AppError('Invalid videoId format', 400);
    }

    // Verify video exists
    const video = await models.Video.findById(req.body.videoId);
    if (!video) throw new AppError('Video not found', 404);

    console.log('Buffer length:', req.file.buffer.length);

    const assembly = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

    // Upload file
    const uploadUrl = await assembly.files.upload(req.file.buffer);
    console.log('Upload URL:', uploadUrl);
    if (!uploadUrl) throw new AppError('Upload URL missing', 500);

    // Transcribe
    const transcript = await assembly.transcripts.create({
      audio: uploadUrl,
      language_code: req.body.language || 'hi'
    });

    // Poll for completion
    let attempts = 0;
    while (transcript.status !== 'completed' && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      transcript = await assembly.transcripts.get(transcript.id);
      attempts++;
    }
    if (transcript.status !== 'completed') {
      throw new AppError(`Transcription failed: ${transcript.status}`, 500);
    }

    // Save to MongoDB
    const savedTranscription = await models.Transcription.create({
      videoId: req.body.videoId,
      language: req.body.language || 'hi',
      status: transcript.status,
      results: {
        id: transcript.id,
        text: transcript.text || '',
        status: transcript.status,
        segments: transcript.words || []
      },
      processedAt: new Date(),
      processingTime: Date.now() - (req.startTime || Date.now())
    });

    res.json({ success: true, transcript: savedTranscription });
  } catch (err) {
    console.error('Transcription error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
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


// AI Video Summarization
 // Your custom error class

// Assume Quota model is defined; I'll provide it below
const Quota = mongoose.model('Quota') || new mongoose.Schema({ api: String, date: String, count: Number });

// Helper function for extracting key points (added below the router)
function extractKeyPoints(summaryText, segments = []) {
  const sentences = summaryText.split(/\. (?=[A-Z0-9])/).filter(s => s.trim());
  return sentences.map((sentence, index) => ({
    point: sentence.trim(),
    timestamp: segments[index]?.start || index * 5,
    importance: Math.min(3 + (index % 3), 5)
  }));
}

// Helper function for tracking Gemini quota (added to prevent over-usage)
async function trackGeminiQuota() {
  const today = new Date().toISOString().split('T')[0];
  let quota = await Quota.findOne({ api: 'gemini', date: today });
  if (!quota) {
    quota = new Quota({ api: 'gemini', date: today, count: 0 });
    await quota.save();
  }
  if (quota.count >= 100) return false; // Free tier daily limit
  quota.count += 1;
  await quota.save();
  return true;
}

function generateLocalSummary(transcriptText, summaryType = 'brief', maxLength = 200) {
  if (!transcriptText) return 'No transcript available for summarization.';
  
  // Simple NLP-inspired extraction: Split into sentences, score by length/keywords, limit to maxLength
  const sentences = transcriptText.split('. ').filter(s => s.trim().length > 10); 
  const keywords = ['key', 'important', 'main', 'summary', 'point']; 
  const scoredSentences = sentences.map(sentence => ({
    text: sentence.trim(),
    score: sentence.length + (keywords.reduce((sum, kw) => sum + (sentence.toLowerCase().includes(kw) ? 10 : 0), 0))
  })).sort((a, b) => b.score - a.score).slice(0, Math.min(5, sentences.length)); 
  
  let summary = scoredSentences.map(s => s.text).join('. ');
  if (summary.length > maxLength * 4) summary = summary.substring(0, maxLength * 4);
  
  const sentiment = summary.toLowerCase().includes('positive') || summary.toLowerCase().includes('good') ? 'positive' : 'neutral'; 
  const keyPoints = scoredSentences.slice(0, 3).map((s, i) => ({
    point: s.text,
    timestamp: i * 10,
    importance: 4
  }));
  
  return {
    text: `${summaryType.charAt(0).toUpperCase() + summaryType.slice(1)} summary: ${summary}. Overall sentiment: ${sentiment}.`,
    keyPoints,
    sentiment: { overall: sentiment, confidence: 0.7 }
  };
}

// AI Video Summarization Route
router.post('/summarize', async (req, res) => {
  const startTime = Date.now();
  try {
    const { videoId, userId, summaryType = 'brief', maxLength = 200, transcriptionId } = req.body;

    // Validate ObjectIds
    if (!mongoose.isValidObjectId(videoId)) {
      console.log(`Invalid videoId: ${videoId}`);
      throw new AppError('Invalid videoId format', 400);
    }
    if (!mongoose.isValidObjectId(userId)) {
      console.log(`Invalid userId: ${userId}`);
      throw new AppError('Invalid userId format', 400);
    }
    if (!mongoose.isValidObjectId(transcriptionId)) {
      console.log(`Invalid transcriptionId: ${transcriptionId}`);
      throw new AppError('Invalid transcriptionId format', 400);
    }

    if (!videoId || !userId || !transcriptionId) {
      throw new AppError('Video ID, User ID, and Transcription ID are required', 400);
    }

    // Verify user, video, and transcription
    const user = await mongoose.model('User').findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!user.canProcessVideo()) {
      throw new AppError('Monthly video processing limit reached. Upgrade your plan.', 403);
    }

    const video = await mongoose.model('Video').findById(videoId);
    if (!video) throw new AppError('Video not found', 404);

    const transcription = await mongoose.model('Transcription').findById(transcriptionId);
    if (!transcription || transcription.status !== 'completed') {
      throw new AppError('Transcription not found or not completed', 400);
    }

    const transcriptId = transcription.results.id;
    console.log('Using transcript ID for LeMUR:', transcriptId);

    // Validate transcript text length
    const transcriptText = transcription.results.text || '';
    if (transcriptText.length < 50) {
      console.log('Transcript too short:', transcriptText.length);
      throw new AppError('Transcript text too short for summarization', 400);
    }

    // Step 1: Poll transcript status
    let transcriptStatus = transcription.results.status;
    let attempts = 0;
    while (transcriptStatus !== 'completed' && attempts < 6) {
      console.log(`Transcript status: ${transcriptStatus}, polling... (attempt ${attempts + 1})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      const statusResponse = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` }
      }).catch(err => {
        console.error('Polling error:', err.response?.status || err.message);
        return { data: { status: 'error' } };
      });
      transcriptStatus = statusResponse.data.status;
      attempts++;
    }
    if (transcriptStatus !== 'completed') {
      console.error('Transcript final status:', transcriptStatus);
      throw new AppError(`Transcript not ready (status: ${transcriptStatus})`, 400);
    }

    // Step 2: LeMUR summarization
    let summaryText = '';
    let aiModelUsed = 'local-fallback';
    
    try {
      // Validate transcript ID
      const validateResponse = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` }
      });
      if (validateResponse.data.status !== 'completed') {
        throw new Error('Transcript validation failed');
      }

      const prompt = `Summarize the following Hindi transcript in a ${summaryType} format, keeping it under ${maxLength} words. Include key points with timestamps, overall sentiment (positive/negative/neutral), and main topics. Transcript: ${transcriptText}`;
      const response = await axios.post(
        'https://api.assemblyai.com/v2/lemur/task',
        { transcript_ids: [transcriptId], prompt, temperature: 0.1, max_output_size: maxLength * 2 },
        { headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}`, 'Content-Type': 'application/json' } }
      );
      console.log('LeMUR response:', response.data);
      summaryText = response.data.response || 'Summary generated via LeMUR';
      aiModelUsed = 'lemur';
    } catch (lemurError) {
      console.error('LeMUR summarization error:', lemurError.response?.data || lemurError.message);
      if (lemurError.response?.status === 404) {
        console.error('LeMUR 404: Invalid/expired transcript ID. Retrying transcription recommended.');
      }
      console.log('Falling back to Gemini...');

      // Gemini attempt
      if (await trackGeminiQuota()) {
        aiModelUsed = 'gemini-pro';
        try {
          const fallbackResponse = await axios.post(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' + process.env.GEMINI_API_KEY,
            {
              contents: [{ parts: [{ text: `Summarize this Hindi transcript in ${summaryType} format, max ${maxLength} words. Include key points with timestamps, overall sentiment (positive/negative/neutral), and main topics: ${transcriptText}` }] }]
            },
            { headers: { 'Content-Type': 'application/json' } }
          );
          summaryText = fallbackResponse.data.candidates[0].content.parts[0].text;
        } catch (fallbackError) {
          console.error('Gemini error:', fallbackError.response?.data || fallbackError.message);
          console.log('Gemini failed; using local fallback');
        }
      } else {
        console.log('Gemini quota exceeded; using local fallback');
      }
    }

    // Local fallback
    if (!summaryText) {
      console.log('Using local fallback summarization');
      const localSummary = generateLocalSummary(transcriptText, summaryType, maxLength);
      summaryText = localSummary.text;
    }

    // Extract key points
    const keyPoints = extractKeyPoints(summaryText, transcription.results.segments || []);

    // Save summary
    const summary = new mongoose.model('Summary')({
      videoId,
      userId,
      transcriptionId,
      type: sanitizeHtml(summaryType),
      content: sanitizeHtml(summaryText),
      keyPoints,
      sentiment: { overall: 'neutral', confidence: 0.5, emotions: [] },
      topics: [],
      status: 'completed',
      aiModel: aiModelUsed,
      processingTime: Math.round((Date.now() - startTime) / 1000)
    });
    await summary.save();

    user.usage.videosProcessed += 1;
    await user.save();

    res.json({
      success: true,
      message: `Video summarization completed using ${aiModelUsed.toUpperCase()}${aiModelUsed === 'local-fallback' ? ' (free-tier fallback)' : ''}`,
      data: summary
    });
  } catch (error) {
    console.error('Summarization error:', error.message);
    res.status(error.statusCode || 500).json({
      status: error.status || 'error',
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

router.get('/summary/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Debug models
    console.log('Imported models:', Object.keys(models));

    // Validate Summary model
    if (!models.Summary) {
      throw new AppError('Summary model not found. Check models/index.js', 500);
    }

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('Invalid summary ID format', 400);
    }

    const summary = await models.Summary.findById(id).populate('videoId userId');
    if (!summary) throw new AppError('Summary not found', 404);

    res.json({
      success: true,
      message: 'Summary retrieved successfully',
      data: summary
    });
  } catch (error) {
    console.error('Error fetching summary:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error fetching summary results',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
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