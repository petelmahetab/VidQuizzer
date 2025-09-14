import express from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Question from '../models/Question.js';
import models from '../models/Index.js'; 
const { Video, Summary } = models; 
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

// Validation middleware for question submission
const questionValidation = [
  body('question').notEmpty().withMessage('Question text is required').trim().isLength({ max: 500 }).withMessage('Question must be 500 characters or less'),
  body('type').isIn(['multiple_choice', 'true_false', 'short_answer', 'essay', 'fill_blank']).withMessage('Invalid question type'),
  body('videoId').optional().custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Invalid video ID'),
  body('summaryId').optional().custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Invalid summary ID'),
  body('difficulty').optional().isIn(['easy', 'medium', 'hard']).withMessage('Invalid difficulty level'),
  body('options').optional().isArray().withMessage('Options must be an array').custom((value, { req }) => {
    if (req.body.type === 'multiple_choice' || req.body.type === 'true_false') {
      if (!value || value.length < 2) throw new Error('Multiple-choice or true/false questions must have at least 2 options');
      if (!value.some(opt => opt.isCorrect)) throw new Error('At least one option must be correct');
    }
    return true;
  }),
  body('correctAnswer').optional().custom((value, { req }) => {
    if (['short_answer', 'fill_blank'].includes(req.body.type) && !value) {
      throw new Error('Correct answer is required for short_answer or fill_blank questions');
    }
    return true;
  }),
];

// Validation for answer submission
const answerValidation = [
  body('answer').notEmpty().withMessage('Answer is required').trim(),
  body('timeSpent').isNumeric().withMessage('Time spent must be a number').optional(),
];

// Submit a new question (premium required)
router.post('/', [authMiddleware.authenticateToken, authMiddleware.requirePremium], questionValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { question, type, videoId, summaryId, difficulty, options, correctAnswer, timestamp } = req.body;

    // Validate video or summary if provided
    let video = null, summary = null;
    if (videoId) {
      video = await Video.findById(videoId);
      if (!video) {
        return res.status(404).json({ success: false, message: 'Video not found' });
      }
    }
    if (summaryId) {
      summary = await Summary.findById(summaryId);
      if (!summary) {
        return res.status(404).json({ success: false, message: 'Summary not found' });
      }
    }

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Prepare prompt for AI-generated explanation or options
    let prompt = `Generate a ${type} question based on the provided context. Return the response as clean JSON (no markdown, no backticks, no extra text) with the following structure:
    {
      "question": "",
      "options": [{"text": "", "isCorrect": false}],
      "correctAnswer": "",
      "explanation": ""
    }`;
    if (video && video.transcript?.text) {
      prompt += `\nVideo Transcript: ${video.transcript.text.substring(0, 1000)}`; // Limit transcript length to avoid token limits
    }
    if (summary && summary.content) {
      prompt += `\nSummary Content: ${summary.content.substring(0, 500)}`; // Limit summary length
    }
    if (timestamp) {
      prompt += `\nFocus on the video content around timestamp: ${timestamp} seconds`;
    }

    let aiResponse = { question, options: options || [], correctAnswer: correctAnswer || '', explanation: '' };
    if (type === 'multiple_choice' || type === 'true_false' || !correctAnswer) {
      const result = await model.generateContent(prompt);
      const rawResponse = result.response.text();

      // Clean the response to remove markdown or backticks
      let cleanedResponse = rawResponse
        .replace(/```json\n|```/g, '') // Remove ```json and ```
        .replace(/^\s+|\s+$/g, '') // Trim whitespace
        .replace(/\n/g, ''); // Remove newlines

      try {
        aiResponse = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('Error parsing Gemini response:', parseError, 'Raw response:', rawResponse);
        return res.status(500).json({
          success: false,
          message: 'Invalid response format from AI model',
          error: parseError.message,
        });
      }

      // Validate AI response structure
      if (!aiResponse.question || !aiResponse.correctAnswer || !aiResponse.explanation) {
        return res.status(500).json({
          success: false,
          message: 'AI response missing required fields',
        });
      }
    }

    // Create question document
    const newQuestion = new Question({
      user: req.user._id,
      video: videoId || null,
      summary: summaryId || null,
      question: aiResponse.question || question,
      type,
      difficulty: difficulty || 'medium',
      options: aiResponse.options || options || [],
      correctAnswer: aiResponse.correctAnswer || correctAnswer,
      explanation: aiResponse.explanation || '',
      timestamp: timestamp || null,
      aiGenerated: true,
      aiModel: 'gemini-1.5-flash',
    });

    await newQuestion.save();

    res.status(201).json({
      success: true,
      message: 'Question submitted successfully',
      data: newQuestion,
    });
  } catch (error) {
    console.error('Error in POST /questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting question',
      error: error.message,
    });
  }
});

// Get all questions for the authenticated user
router.get('/', authMiddleware.authenticateToken, async (req, res) => {
  try {
    const questions = await Question.find({ user: req.user._id })
      .populate('video', 'title transcript')
      .populate('summary', 'content type')
      .select('-userAnswers'); // Exclude userAnswers for brevity
    res.json({
      success: true,
      data: questions,
    });
  } catch (error) {
    console.error('Error in GET /questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving questions',
      error: error.message,
    });
  }
});

// Get specific question by ID
router.get('/:id', authMiddleware.authenticateToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid question ID' });
    }

    const question = await Question.findOne({ _id: req.params.id, user: req.user._id })
      .populate('video', 'title transcript')
      .populate('summary', 'content type')
      .select('-userAnswers');
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found',
      });
    }

    res.json({
      success: true,
      data: question,
    });
  } catch (error) {
    console.error('Error in GET /questions/:id:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving question',
      error: error.message,
    });
  }
});

// Submit an answer to a question
router.post('/:id/answer', [authMiddleware.authenticateToken, answerValidation], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid question ID' });
    }

    const question = await Question.findOne({ _id: req.params.id, user: req.user._id });
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    const { answer, timeSpent } = req.body;
    await question.recordAnswer(req.user._id, answer, timeSpent || 0);

    res.json({
      success: true,
      message: 'Answer recorded successfully',
      data: question,
    });
  } catch (error) {
    console.error('Error in POST /questions/:id/answer:', error);
    res.status(500).json({
      success: false,
      message: 'Error recording answer',
      error: error.message,
    });
  }
});

export default router;