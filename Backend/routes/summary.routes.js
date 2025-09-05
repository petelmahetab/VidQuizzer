import express from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Summary from '../models/Summary.js';
import Video from '../models/Video.js';

const router = express.Router();

const summaryValidation = [
  body('content').optional().notEmpty().withMessage('Content to summarize cannot be empty'),
  body('type')
    .isIn(['brief', 'detailed', 'comprehensive', 'bullet_points', 'key_insights'])
    .withMessage('Invalid summary type'),
  body('videoId').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Invalid video ID'),
];

// POST /summary
router.post('/', summaryValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { content, type, videoId, userId } = req.body;

    // Validate video exists
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found',
      });
    }

    // Use video transcript if content is not provided
    const inputContent = content || video.transcript?.text;
    if (!inputContent) {
      return res.status(400).json({
        success: false,
        message: 'No content or transcript available for summarization',
      });
    }

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Generate summary
    const prompt = `Generate a ${type} summary of the following content in English:\n\n${inputContent}`;
    const result = await model.generateContent(prompt);
    const summaryContent = result.response.text();

    // Create summary document
    const summary = new Summary({
      video: videoId,
      user: userId || req.user._id,
      type,
      content: summaryContent,
      keyPoints: [], // Extract from Gemini response if available
      sentiment: { overall: 'neutral', confidence: 0, emotions: [] },
      topics: [], // Extract from Gemini response if available
      wordCount: summaryContent.split(/\s+/).length,
      readingTime: Math.ceil(summaryContent.split(/\s+/).length / 200),
      language: 'en',
      aiModel: 'gemini-1.5-flash',
      processingTime: 0,
      quality: { coherence: 0, completeness: 0, accuracy: 0 },
      isShared: false,
      sharedWith: [],
    });

    await summary.save();
    console.log('New summary saved:', summary);

    res.status(201).json({
      success: true,
      message: 'Summary generated successfully',
      summaryId: summary._id,
      data: summary,
    });
  } catch (error) {
    console.error('Error in POST /summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating summary',
      error: error.message,
    });
  }
});

// GET / (all summaries for a user)
router.get('/', async (req, res) => {
  try {
    console.log('User ID from token:', req.user?._id);
    const summaries = await Summary.find({ user: req.user._id }).populate('video');
    console.log('Summaries found:', summaries);
    res.json({
      success: true,
      data: summaries,
    });
  } catch (error) {
    console.error('Error in GET /:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving summaries',
      error: error.message,
    });
  }
});

// GET /:id (by summary _id)
router.get('/:id', async (req, res) => {
  try {
    console.log('Requested summary _id:', req.params.id, 'User ID:', req.user?._id);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid summary ID' });
    }
    const summary = await Summary.findOne({ _id: req.params.id, user: req.user._id }).populate('video');
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found',
      });
    }

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error in GET /:id:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving summary',
      error: error.message,
    });
  }
});

// GET /video/:videoId (by video ID)
router.get('/video/:videoId', async (req, res) => {
  try {
    console.log('Requested video ID:', req.params.videoId, 'User ID:', req.user?._id);
    if (!mongoose.Types.ObjectId.isValid(req.params.videoId)) {
      return res.status(400).json({ success: false, message: 'Invalid video ID' });
    }
    const summary = await Summary.findOne({ video: req.params.videoId, user: req.user._id }).populate('video');
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found for this video',
      });
    }

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error in GET /video/:videoId:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving summary',
      error: error.message,
    });
  }
});

export default router;