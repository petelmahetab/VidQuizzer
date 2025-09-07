import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  video: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: false, // Made optional
  },
  summary: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Summary',
    required: false, // Optional reference to Summary
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  question: {
    type: String,
    required: true,
    trim: true,
    maxLength: 500, // Added validation
  },
  type: {
    type: String,
    enum: ['multiple_choice', 'true_false', 'short_answer', 'essay', 'fill_blank'],
    required: true,
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium',
  },
  options: [{
    text: {
      type: String,
      required: function() { return this.type === 'multiple_choice' || this.type === 'true_false'; },
      trim: true,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
  }],
  correctAnswer: {
    type: String,
    trim: true,
    required: function() { return ['short_answer', 'fill_blank'].includes(this.type); },
  },
  explanation: {
    type: String,
    trim: true,
  },
  timestamp: {
    type: Number, 
    default: null,
  },
  category: {
    type: String,
    enum: ['comprehension', 'analysis', 'application', 'synthesis', 'evaluation'],
    default: 'comprehension',
  },
  tags: [{
    type: String,
    trim: true,
  }],
  points: {
    type: Number,
    default: 1,
  },
  timeLimit: {
    type: Number, 
    default: null,
  },
  aiGenerated: {
    type: Boolean,
    default: true,
  },
  aiModel: {
    type: String,
    default: 'gemini-1.5-flash',
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0,
  },
  statistics: {
    totalAttempts: {
      type: Number,
      default: 0,
    },
    correctAttempts: {
      type: Number,
      default: 0,
    },
    averageTime: {
      type: Number,
      default: 0,
    },
  },
  userAnswers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    answer: String,
    isCorrect: Boolean,
    timeSpent: Number,
    attemptedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: String,
    enum: ['ai', 'user'],
    default: 'ai',
  },
}, {
  timestamps: true,
});

// Virtual for success rate
questionSchema.virtual('successRate').get(function() {
  if (this.statistics.totalAttempts === 0) return 0;
  return (this.statistics.correctAttempts / this.statistics.totalAttempts * 100).toFixed(1);
});

// Method to record user answer
questionSchema.methods.recordAnswer = function(userId, answer, timeSpent) {
  const isCorrect = this.type === 'multiple_choice' || this.type === 'true_false'
    ? this.options.find(opt => opt.text === answer)?.isCorrect || false
    : answer.toLowerCase().trim() === this.correctAnswer?.toLowerCase().trim();
  
  this.userAnswers.push({
    user: userId,
    answer,
    isCorrect,
    timeSpent,
    attemptedAt: new Date(),
  });
  
  this.statistics.totalAttempts += 1;
  if (isCorrect) {
    this.statistics.correctAttempts += 1;
  }
  
  // Update average time
  const totalTime = this.statistics.averageTime * (this.statistics.totalAttempts - 1) + timeSpent;
  this.statistics.averageTime = totalTime / this.statistics.totalAttempts;
  
  return this.save();
};

// Indexes
questionSchema.index({ video: 1, type: 1 });
questionSchema.index({ user: 1, createdAt: -1 });
questionSchema.index({ difficulty: 1 });
questionSchema.index({ category: 1 });

// Validation for multiple-choice questions
questionSchema.pre('validate', function(next) {
  if (this.type === 'multiple_choice') {
    if (!this.options || this.options.length < 2) {
      return next(new Error('Multiple-choice questions must have at least 2 options'));
    }
    const hasCorrectOption = this.options.some(opt => opt.isCorrect);
    if (!hasCorrectOption) {
      return next(new Error('Multiple-choice questions must have at least one correct option'));
    }
  }
  next();
});

export default mongoose.model('Question', questionSchema);