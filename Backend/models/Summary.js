// models/Summary.js
import mongoose from 'mongoose';

const summarySchema = new mongoose.Schema({
  video: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['brief', 'detailed', 'comprehensive', 'bullet_points', 'key_insights'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  keyPoints: [
    {
      point: String,
      timestamp: Number,
      importance: {
        type: Number,
        min: 1,
        max: 5,
        default: 3,
      },
    },
  ],
  sentiment: {
    overall: {
      type: String,
      enum: ['positive', 'negative', 'neutral'],
      default: 'neutral',
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    emotions: [
      {
        emotion: String,
        confidence: Number,
      },
    ],
  },
  topics: [
    {
      name: String,
      relevance: Number,
      mentions: Number,
    },
  ],
  wordCount: {
    type: Number,
    default: 0,
  },
  readingTime: {
    type: Number, // in minutes
    default: 0,
  },
  language: {
    type: String,
    default: 'en',
  },
  aiModel: {
    type: String,
    default: 'gpt-3.5-turbo',
  },
  processingTime: {
    type: Number, // in seconds
    default: 0,
  },
  quality: {
    coherence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    completeness: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    accuracy: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
  },
  userFeedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    comment: String,
    helpful: Boolean,
  },
  isShared: {
    type: Boolean,
    default: false,
  },
  sharedWith: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      permission: {
        type: String,
        enum: ['read', 'comment'],
        default: 'read',
      },
      sharedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
}, {
  timestamps: true,
});

// Calculate reading time based on word count
summarySchema.pre('save', function (next) {
  if (this.content) {
    this.wordCount = this.content.split(/\s+/).length;
    this.readingTime = Math.ceil(this.wordCount / 200); // Average reading speed
  }
  next();
});

// Indexes
summarySchema.index({ video: 1, type: 1 });
summarySchema.index({ user: 1, createdAt: -1 });
summarySchema.index({ isShared: 1 });

export default mongoose.model('Summary', summarySchema);