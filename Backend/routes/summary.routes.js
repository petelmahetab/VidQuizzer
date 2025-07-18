import express from 'express';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Simulated summary storage (replace with actual database in production)
const summaries = [];

// Validation middleware for summary request
const summaryValidation = [
  body('content').notEmpty().withMessage('Content to summarize is required'),
  body('maxLength').optional().isInt({ min: 50, max: 500 }).withMessage('Max length must be between 50 and 500 characters')
];

// Generate summary
router.post('/summary', summaryValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { content, maxLength = 200 } = req.body;

    // Simulate AI summarization (replace with actual AI service integration)
    const summary = {
      id: Date.now(),
      originalContent: content,
      summary: `This is a simulated summary of the provided content, limited to ${maxLength} characters: ${content.slice(0, maxLength)}...`,
      createdAt: new Date(),
      maxLength
    };

    summaries.push(summary);

    res.status(201).json({
      success: true,
      message: 'Summary generated successfully',
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating summary',
      error: error.message
    });
  }
});

// Get all summaries
router.get('/', (req, res) => {
  try {
    res.json({
      success: true,
      data: summaries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving summaries',
      error: error.message
    });
  }
});

// Get specific summary by ID
router.get('/:id', (req, res) => {
  try {
    const summary = summaries.find(s => s.id === parseInt(req.params.id));
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found'
      });
    }

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving summary',
      error: error.message
    });
  }
});

export default router;