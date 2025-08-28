import express from 'express';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Simulated question storage (replace with actual database in production)
const questions = [];

// Validation middleware for question submission
const questionValidation = [
  body('text').notEmpty().withMessage('Question text is required'),
  body('context').optional().isString().withMessage('Context must be a string')
];

// Submit a new question
router.post('/', questionValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { text, context } = req.body;

    // Simulate AI processing (replace with actual AI service integration)
    const question = {
      id: Date.now(),
      text,
      context: context || '',
      createdAt: new Date(),
      status: 'pending',
      answer: null
    };

    questions.push(question);

    // Simulate async AI processing
    setTimeout(() => {
      question.status = 'answered';
      question.answer = `This is a simulated AI response to: ${text}`;
      question.answeredAt = new Date();
    }, 1000);

    res.status(201).json({
      success: true,
      message: 'Question submitted successfully',
      data: question
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error submitting question',
      error: error.message
    });
  }
});

// Get all questions
router.get('/', (req, res) => {
  try {
    res.json({
      success: true,
      data: questions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving questions',
      error: error.message
    });
  }
});

// Get specific question by ID
router.get('/:id', (req, res) => {
  try {
    const question = questions.find(q => q.id === parseInt(req.params.id));
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving question',
      error: error.message
    });
  }
});

export default router;