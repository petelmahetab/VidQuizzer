import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  video: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  question: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['multiple_choice', 'true_false', 'short_answer', 'essay', 'fill_blank'],
    required: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  options: [{
    text: String,
    isCorrect: {
      type: Boolean,
      default: false
    }
  }],
  correctAnswer: {
    type: String,
    trim: true
  },
  explanation: {
    type: String,
    trim: true
  },
  timestamp: {
    type: Number, // Timestamp in video where answer can be found
    default: null
  },
  category: {
    type: String,
    enum: ['comprehension', 'analysis', 'application', 'synthesis', 'evaluation'],
    default: 'comprehension'
  },
  tags: [{
    type: String,
    trim: true
  }],
  points: {
    type: Number,
    default: 1
  },
  timeLimit: {
    type: Number, // in seconds
    default: null
  },
  aiGenerated: {
    type: Boolean,
    default: true
  },
  aiModel: {
    type: String,
    default: 'gpt-3.5-turbo'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  statistics: {
    totalAttempts: {
      type: Number,
      default: 0
    },
    correctAttempts: {
      type: Number,
      default: 0
    },
    averageTime: {
      type: Number,
      default: 0
    }
  },
  userAnswers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    answer: String,
    isCorrect: Boolean,
    timeSpent: Number,
    attemptedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String,
    enum: ['ai', 'user'],
    default: 'ai'
  }
}, {
  timestamps: true
});

// Virtual for success rate
questionSchema.virtual('successRate').get(function() {
  if (this.statistics.totalAttempts === 0) return 0;
  return (this.statistics.correctAttempts / this.statistics.totalAttempts * 100).toFixed(1);
});

// Method to record user answer
questionSchema.methods.recordAnswer = function(userId, answer, timeSpent) {
  const isCorrect = this.type === 'multiple_choice' 
    ? this.options.find(opt => opt.text === answer)?.isCorrect || false
    : answer.toLowerCase().trim() === this.correctAnswer.toLowerCase().trim();
  
  this.userAnswers.push({
    user: userId,
    answer,
    isCorrect,
    timeSpent,
    attemptedAt: new Date()
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

module.exports = mongoose.model('Question', questionSchema);